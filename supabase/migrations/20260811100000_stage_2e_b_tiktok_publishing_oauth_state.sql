-- Stage 2E-B: trusted OAuth state for an explicit TikTok publishing-scope upgrade.
-- This migration mirrors the RPC behavior already applied manually to production.

begin;

create or replace function public.begin_tiktok_oauth(
  p_workspace_id uuid,
  p_initiated_by uuid,
  p_state_hash text,
  p_return_path text,
  p_intent text,
  p_pending_connection_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_state private.oauth_connection_states%rowtype;
  expected_platform_account_id text;
  requested_scopes text[];
begin
  if not private.is_social_connection_manager(p_workspace_id, p_initiated_by) then
    raise exception 'WORKSPACE_ROLE_DENIED' using errcode = '42501';
  end if;
  if p_state_hash is null or p_state_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_OAUTH_STATE' using errcode = '22023';
  end if;
  if p_return_path is null or p_return_path not in ('/dashboard/accounts') then
    raise exception 'UNSAFE_RETURN_PATH' using errcode = '22023';
  end if;
  if p_intent is null or p_intent not in ('connect', 'enable_publishing') then
    raise exception 'INVALID_TIKTOK_OAUTH_INTENT' using errcode = '22023';
  end if;
  if p_intent = 'connect' and p_pending_connection_id is not null then
    raise exception 'INVALID_TIKTOK_OAUTH_STATE' using errcode = '22023';
  end if;
  if p_intent = 'enable_publishing' then
    if p_pending_connection_id is null then
      raise exception 'INVALID_TIKTOK_OAUTH_STATE' using errcode = '22023';
    end if;

    select account.platform_account_id
    into expected_platform_account_id
    from public.social_accounts as account
    where account.id = p_pending_connection_id
      and account.workspace_id = p_workspace_id
      and account.platform = 'tiktok'::public.social_platform
      and account.account_type = 'tiktok_user'::public.social_account_type
      and account.connection_status = 'connected'::public.social_connection_status
      and nullif(btrim(account.platform_account_id), '') is not null;

    if not found then
      raise exception 'SOCIAL_ACCOUNT_NOT_FOUND_OR_DENIED' using errcode = 'P0002';
    end if;
  end if;
  if (
    select count(*)
    from private.oauth_connection_states as state_row
    where state_row.initiated_by = p_initiated_by
      and state_row.created_at > now() - interval '1 minute'
  ) >= 5 then
    raise exception 'RATE_LIMITED' using errcode = 'P0001';
  end if;

  requested_scopes := case p_intent
    when 'enable_publishing' then array['user.info.basic', 'video.publish']::text[]
    else array['user.info.basic']::text[]
  end;

  insert into private.oauth_connection_states (
    state_hash,
    workspace_id,
    initiated_by,
    provider,
    return_path,
    expires_at,
    pending_connection_id,
    metadata
  ) values (
    p_state_hash,
    p_workspace_id,
    p_initiated_by,
    'tiktok',
    p_return_path,
    now() + interval '10 minutes',
    p_pending_connection_id,
    jsonb_build_object(
      'intent', p_intent,
      'expectedPlatformAccountId', expected_platform_account_id,
      'requestedScopes', to_jsonb(requested_scopes)
    )
  ) returning * into created_state;

  return jsonb_build_object(
    'id', created_state.id,
    'expiresAt', created_state.expires_at
  );
end;
$$;

create or replace function public.begin_tiktok_oauth(
  p_workspace_id uuid,
  p_initiated_by uuid,
  p_state_hash text,
  p_return_path text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.begin_tiktok_oauth(
    p_workspace_id,
    p_initiated_by,
    p_state_hash,
    p_return_path,
    'connect',
    null
  );
$$;

create or replace function public.consume_tiktok_oauth_state(p_state_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  state_row private.oauth_connection_states%rowtype;
  state_intent text;
  state_requested_scopes jsonb;
begin
  update private.oauth_connection_states as candidate
  set consumed_at = now()
  where candidate.state_hash = p_state_hash
    and candidate.provider = 'tiktok'
    and candidate.consumed_at is null
    and candidate.expires_at > now()
  returning candidate.* into state_row;

  if found then
    state_intent := coalesce(state_row.metadata ->> 'intent', 'connect');
    state_requested_scopes := coalesce(
      state_row.metadata -> 'requestedScopes',
      '["user.info.basic"]'::jsonb
    );
    return jsonb_build_object(
      'workspaceId', state_row.workspace_id,
      'initiatedBy', state_row.initiated_by,
      'returnPath', state_row.return_path,
      'intent', state_intent,
      'pendingConnectionId', state_row.pending_connection_id,
      'expectedPlatformAccountId', state_row.metadata ->> 'expectedPlatformAccountId',
      'requestedScopes', state_requested_scopes,
      'metadata', state_row.metadata
    );
  end if;

  select * into state_row
  from private.oauth_connection_states
  where state_hash = p_state_hash and provider = 'tiktok';

  if not found then
    raise exception 'INVALID_OAUTH_STATE' using errcode = 'P0002';
  elsif state_row.consumed_at is not null then
    raise exception 'OAUTH_STATE_ALREADY_USED' using errcode = 'P0001';
  else
    raise exception 'OAUTH_STATE_EXPIRED' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.begin_tiktok_oauth(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.begin_tiktok_oauth(uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated;
revoke all on function public.consume_tiktok_oauth_state(text)
  from public, anon, authenticated;

grant execute on function public.begin_tiktok_oauth(uuid, uuid, text, text)
  to postgres, service_role;
grant execute on function public.begin_tiktok_oauth(uuid, uuid, text, text, text, uuid)
  to postgres, service_role;
grant execute on function public.consume_tiktok_oauth_state(text)
  to postgres, service_role;

commit;
