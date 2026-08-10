begin;

create extension if not exists pgcrypto with schema extensions;

create type public.workspace_invitation_status as enum (
  'pending', 'accepted', 'declined', 'revoked', 'expired'
);

create type public.membership_event_type as enum (
  'invited', 'invitation_resent', 'invitation_accepted',
  'invitation_declined', 'invitation_revoked', 'member_added',
  'role_changed', 'member_suspended', 'member_reactivated',
  'member_removed', 'member_left', 'ownership_transferred'
);

create type public.notification_type as enum (
  'workspace_invitation', 'invitation_accepted', 'invitation_declined',
  'invitation_revoked', 'role_changed', 'member_suspended',
  'member_reactivated', 'member_removed', 'ownership_transferred',
  'approval_submitted', 'approval_assigned', 'approval_reassigned',
  'approval_approved', 'approval_changes_requested', 'approval_rejected',
  'approval_comment', 'publishing_succeeded', 'publishing_failed',
  'publishing_reconciliation_required', 'social_account_reconnect_required',
  'system'
);

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  invited_user_id uuid references auth.users(id) on delete set null,
  role public.workspace_role not null,
  status public.workspace_invitation_status not null default 'pending',
  invited_by uuid not null references auth.users(id) on delete restrict,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  declined_at timestamptz,
  revoked_at timestamptz,
  sent_at timestamptz,
  last_sent_at timestamptz,
  resend_count integer not null default 0,
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workspace_invitations_email_normalized check(
    email = lower(btrim(email))
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    and char_length(email) <= 320
  ),
  constraint workspace_invitations_token_hash check(token_hash ~ '^[0-9a-f]{64}$'),
  constraint workspace_invitations_expiry check(
    expires_at > created_at and expires_at <= created_at + interval '30 days'
  ),
  constraint workspace_invitations_resend_count check(resend_count >= 0),
  constraint workspace_invitations_message check(
    message is null or (message = btrim(message) and char_length(message) between 1 and 1000)
  ),
  constraint workspace_invitations_status_times check(
    (status <> 'accepted' or (accepted_by is not null and accepted_at is not null))
    and (status <> 'declined' or declined_at is not null)
    and (status <> 'revoked' or revoked_at is not null)
  )
);

create unique index workspace_invitations_one_pending_email_idx
  on public.workspace_invitations(workspace_id, email) where status = 'pending';
create index workspace_invitations_workspace_status_idx
  on public.workspace_invitations(workspace_id, status, created_at desc);
create index workspace_invitations_invited_user_idx
  on public.workspace_invitations(invited_user_id, status) where invited_user_id is not null;
create index workspace_invitations_expiry_idx
  on public.workspace_invitations(expires_at) where status = 'pending';

create table public.membership_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  workspace_member_id uuid references public.workspace_members(id) on delete set null,
  invitation_id uuid references public.workspace_invitations(id) on delete set null,
  event_type public.membership_event_type not null,
  actor_id uuid references auth.users(id) on delete set null,
  affected_user_id uuid references auth.users(id) on delete set null,
  previous_role public.workspace_role,
  new_role public.workspace_role,
  previous_status public.membership_status,
  new_status public.membership_status,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint membership_events_message check(
    message is null or (message = btrim(message) and char_length(message) between 1 and 1000)
  ),
  constraint membership_events_metadata_object check(jsonb_typeof(metadata) = 'object')
);

create index membership_events_workspace_created_idx
  on public.membership_events(workspace_id, created_at desc);
create index membership_events_member_idx on public.membership_events(workspace_member_id);
create index membership_events_invitation_idx on public.membership_events(invitation_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete cascade,
  notification_type public.notification_type not null,
  title text not null,
  body text,
  entity_type text,
  entity_id uuid,
  action_path text,
  metadata jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  read_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_title check(title = btrim(title) and char_length(title) between 1 and 160),
  constraint notifications_body check(body is null or char_length(body) <= 1000),
  constraint notifications_entity_type check(
    entity_type is null or (entity_type = btrim(entity_type) and entity_type ~ '^[a-z][a-z0-9_]{0,63}$')
  ),
  constraint notifications_action_path check(
    action_path is null or (
      action_path like '/%'
      and action_path not like '//%'
      and action_path !~ '[[:cntrl:]]'
      and char_length(action_path) <= 500
    )
  ),
  constraint notifications_metadata_object check(jsonb_typeof(metadata) = 'object'),
  constraint notifications_dedupe_key check(
    dedupe_key is null or (dedupe_key = btrim(dedupe_key) and char_length(dedupe_key) between 1 and 200)
  )
);

create index notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications(user_id, created_at desc)
  where read_at is null and archived_at is null;
create index notifications_workspace_idx on public.notifications(workspace_id, created_at desc)
  where workspace_id is not null;

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  workspace_invitations boolean not null default true,
  team_changes boolean not null default true,
  approvals boolean not null default true,
  publishing boolean not null default true,
  social_connections boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger workspace_invitations_set_updated_at before update on public.workspace_invitations
for each row execute function private.set_updated_at();
create trigger notification_preferences_set_updated_at before update on public.notification_preferences
for each row execute function private.set_updated_at();

create function private.clean_optional_message(value text, maximum_length integer default 1000)
returns text language plpgsql immutable set search_path = '' as $$
declare clean text := nullif(pg_catalog.btrim(coalesce(value, '')), '');
begin
  if clean is not null and pg_catalog.char_length(clean) > maximum_length then
    raise exception 'MESSAGE_TOO_LONG' using errcode = '22023';
  end if;
  return clean;
end;
$$;

create function private.workspace_role_for_user(target_workspace_id uuid, target_user_id uuid)
returns public.workspace_role language sql stable security definer set search_path = '' as $$
  select membership.role
  from public.workspace_members membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = target_user_id
    and membership.status = 'active'::public.membership_status;
$$;

create function private.assert_team_manager(
  target_workspace_id uuid,
  actor_id uuid,
  assigned_role public.workspace_role default null
) returns public.workspace_role language plpgsql stable security definer set search_path = '' as $$
declare actor_role public.workspace_role;
begin
  actor_role := private.workspace_role_for_user(target_workspace_id, actor_id);
  if actor_role is null or actor_role not in ('owner', 'administrator') then
    raise exception 'TEAM_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if actor_role = 'administrator' and assigned_role in ('owner', 'administrator') then
    raise exception 'ROLE_ASSIGNMENT_DENIED' using errcode = '42501';
  end if;
  return actor_role;
end;
$$;

create function private.metadata_is_safe(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select pg_catalog.jsonb_typeof(value) = 'object'
    and value::text !~* '"[^\"]*(token|secret|password|jwt|authorization|credential|signed.?url)[^\"]*"[[:space:]]*:';
$$;

create function private.create_notification(
  target_user_id uuid,
  target_workspace_id uuid,
  target_type public.notification_type,
  target_title text,
  target_body text default null,
  target_entity_type text default null,
  target_entity_id uuid default null,
  target_action_path text default null,
  target_metadata jsonb default '{}'::jsonb,
  target_dedupe_key text default null,
  force_delivery boolean default false
) returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid; preference_enabled boolean := true;
begin
  if not private.metadata_is_safe(coalesce(target_metadata, '{}'::jsonb)) then
    raise exception 'UNSAFE_NOTIFICATION_METADATA' using errcode = '22023';
  end if;
  if not force_delivery then
    select case
      when target_type = 'workspace_invitation' then preferences.workspace_invitations
      when target_type::text like 'approval_%' then preferences.approvals
      when target_type::text like 'publishing_%' then preferences.publishing
      when target_type = 'social_account_reconnect_required' then preferences.social_connections
      else preferences.team_changes
    end into preference_enabled
    from public.notification_preferences preferences where preferences.user_id = target_user_id;
    preference_enabled := coalesce(preference_enabled, true);
  end if;
  if not preference_enabled then return null; end if;

  insert into public.notifications(
    user_id, workspace_id, notification_type, title, body, entity_type,
    entity_id, action_path, metadata, dedupe_key
  ) values (
    target_user_id, target_workspace_id, target_type,
    pg_catalog.btrim(target_title), nullif(pg_catalog.btrim(coalesce(target_body, '')), ''),
    target_entity_type, target_entity_id, target_action_path,
    coalesce(target_metadata, '{}'::jsonb), target_dedupe_key
  ) on conflict(dedupe_key) do nothing returning id into created_id;
  return created_id;
end;
$$;

create function private.expire_workspace_invitations(target_workspace_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  update public.workspace_invitations
  set status = 'expired'::public.workspace_invitation_status
  where status = 'pending'::public.workspace_invitation_status
    and expires_at <= now()
    and (target_workspace_id is null or workspace_id = target_workspace_id);
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function public.list_workspace_invitations(p_workspace_id uuid)
returns table(
  id uuid, workspace_id uuid, email text, invited_user_id uuid, role public.workspace_role,
  status public.workspace_invitation_status, invited_by uuid, inviter_name text,
  expires_at timestamptz, sent_at timestamptz, last_sent_at timestamptz,
  resend_count integer, message text, created_at timestamptz, updated_at timestamptz
) language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_workspace_member(p_workspace_id) then
    raise exception 'TEAM_PERMISSION_DENIED' using errcode = '42501';
  end if;
  perform private.expire_workspace_invitations(p_workspace_id);
  return query
  select invitation.id, invitation.workspace_id, invitation.email, invitation.invited_user_id,
    invitation.role, invitation.status, invitation.invited_by, profile.full_name,
    invitation.expires_at, invitation.sent_at, invitation.last_sent_at,
    invitation.resend_count, invitation.message, invitation.created_at, invitation.updated_at
  from public.workspace_invitations invitation
  left join public.profiles profile on profile.id = invitation.invited_by
  where invitation.workspace_id = p_workspace_id
  order by invitation.created_at desc;
end;
$$;

create function public.get_workspace_invitation_details(p_invitation_id uuid, p_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.workspace_invitations%rowtype; caller_id uuid := (select auth.uid());
  caller_email text; allowed boolean := false; workspace_name text; inviter_name text;
begin
  if caller_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into invitation from public.workspace_invitations where id = p_invitation_id;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if invitation.status = 'pending' and invitation.expires_at <= now() then
    update public.workspace_invitations set status = 'expired' where id = invitation.id;
    invitation.status := 'expired';
  end if;
  select lower(btrim(email)) into caller_email from auth.users where id = caller_id;
  allowed := private.is_workspace_member(invitation.workspace_id)
    or invitation.invited_user_id = caller_id
    or (
      caller_email = invitation.email and p_token is not null
      and invitation.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    );
  if not allowed then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501'; end if;
  select name into workspace_name from public.workspaces where id = invitation.workspace_id;
  select full_name into inviter_name from public.profiles where id = invitation.invited_by;
  return jsonb_build_object(
    'id', invitation.id, 'workspaceId', invitation.workspace_id, 'workspaceName', workspace_name,
    'email', invitation.email, 'role', invitation.role, 'status', invitation.status,
    'inviterName', inviter_name, 'expiresAt', invitation.expires_at,
    'message', invitation.message, 'createdAt', invitation.created_at
  );
end;
$$;

create function public.create_workspace_invitation(
  p_workspace_id uuid, p_email text, p_role public.workspace_role,
  p_invited_by uuid, p_invited_user_id uuid, p_token_hash text,
  p_message text default null, p_expires_at timestamptz default (now() + interval '7 days')
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare clean_email text := lower(btrim(coalesce(p_email, ''))); invitation public.workspace_invitations%rowtype;
  existing_status public.membership_status;
begin
  perform private.assert_team_manager(p_workspace_id, p_invited_by, p_role);
  if clean_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or char_length(clean_email) > 320 then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'INVALID_INVITATION_TOKEN' using errcode = '22023'; end if;
  if p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'INVALID_INVITATION_EXPIRY' using errcode = '22023';
  end if;
  perform private.expire_workspace_invitations(p_workspace_id);
  if p_invited_user_id is not null then
    select status into existing_status from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_invited_user_id;
    if existing_status = 'active' then raise exception 'USER_ALREADY_MEMBER' using errcode = '23505'; end if;
    if existing_status = 'suspended' then raise exception 'MEMBER_REACTIVATION_REQUIRED' using errcode = '55000'; end if;
  end if;
  if exists(select 1 from public.workspace_invitations where workspace_id = p_workspace_id and email = clean_email and status = 'pending') then
    raise exception 'INVITATION_ALREADY_PENDING' using errcode = '23505';
  end if;
  insert into public.workspace_invitations(
    workspace_id, email, invited_user_id, role, invited_by, token_hash,
    expires_at, message, sent_at, last_sent_at
  ) values (
    p_workspace_id, clean_email, p_invited_user_id, p_role, p_invited_by, p_token_hash,
    p_expires_at, private.clean_optional_message(p_message),
    case when p_invited_user_id is not null then now() end,
    case when p_invited_user_id is not null then now() end
  ) returning * into invitation;
  insert into public.membership_events(
    workspace_id, invitation_id, event_type, actor_id, affected_user_id, new_role, message
  ) values (p_workspace_id, invitation.id, 'invited', p_invited_by, p_invited_user_id, p_role, invitation.message);
  if p_invited_user_id is not null then
    perform private.create_notification(
      p_invited_user_id, p_workspace_id, 'workspace_invitation', 'Workspace invitation',
      'You have been invited to join a PostFlow workspace.', 'workspace_invitation', invitation.id,
      '/accept-invite?invitation=' || invitation.id::text, '{}'::jsonb,
      'workspace-invitation:' || invitation.id::text
    );
  end if;
  return jsonb_build_object('id', invitation.id, 'workspaceId', invitation.workspace_id,
    'email', invitation.email, 'role', invitation.role, 'status', invitation.status,
    'expiresAt', invitation.expires_at, 'delivery', case when p_invited_user_id is null then 'email' else 'in_app' end);
end;
$$;

create function public.mark_workspace_invitation_sent(p_invitation_id uuid, p_actor_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare invitation public.workspace_invitations%rowtype;
begin
  select * into invitation from public.workspace_invitations where id = p_invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.assert_team_manager(invitation.workspace_id, p_actor_id, invitation.role);
  update public.workspace_invitations set sent_at = coalesce(sent_at, now()), last_sent_at = now() where id = p_invitation_id;
end;
$$;

create function public.prepare_workspace_invitation_resend(
  p_invitation_id uuid, p_actor_id uuid, p_token_hash text,
  p_invited_user_id uuid, p_expires_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.workspace_invitations%rowtype;
begin
  select * into invitation from public.workspace_invitations where id = p_invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.assert_team_manager(invitation.workspace_id, p_actor_id, invitation.role);
  if invitation.status not in ('pending', 'expired') then raise exception 'INVITATION_NOT_PENDING' using errcode = '55000'; end if;
  if invitation.last_sent_at is not null and invitation.last_sent_at > now() - interval '60 seconds' then
    raise exception 'INVITATION_RATE_LIMITED' using errcode = '55000';
  end if;
  if p_token_hash !~ '^[0-9a-f]{64}$' or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'INVALID_INVITATION_TOKEN' using errcode = '22023';
  end if;
  update public.workspace_invitations set token_hash = p_token_hash, status = 'pending',
    invited_user_id = p_invited_user_id, expires_at = p_expires_at,
    resend_count = resend_count + 1, accepted_by = null, accepted_at = null,
    declined_at = null, revoked_at = null
  where id = invitation.id returning * into invitation;
  insert into public.membership_events(workspace_id, invitation_id, event_type, actor_id, affected_user_id, new_role)
  values(invitation.workspace_id, invitation.id, 'invitation_resent', p_actor_id, p_invited_user_id, invitation.role);
  if p_invited_user_id is not null then
    perform private.create_notification(
      p_invited_user_id, invitation.workspace_id, 'workspace_invitation', 'Workspace invitation',
      'Your invitation to a PostFlow workspace is ready.', 'workspace_invitation', invitation.id,
      '/accept-invite?invitation=' || invitation.id::text, '{}'::jsonb,
      'workspace-invitation-resend:' || invitation.id::text || ':' || invitation.resend_count::text
    );
  end if;
  return jsonb_build_object('id', invitation.id, 'workspaceId', invitation.workspace_id,
    'email', invitation.email, 'role', invitation.role, 'status', invitation.status,
    'expiresAt', invitation.expires_at, 'resendCount', invitation.resend_count,
    'delivery', case when p_invited_user_id is null then 'email' else 'in_app' end);
end;
$$;

create function private.assert_invitation_recipient(invitation public.workspace_invitations, token text)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); caller_email text;
begin
  if caller_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select lower(btrim(email)) into caller_email from auth.users where id = caller_id;
  if caller_email is distinct from invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501';
  end if;
  if invitation.invited_user_id is not null then
    if invitation.invited_user_id <> caller_id then raise exception 'INVITATION_EMAIL_MISMATCH' using errcode = '42501'; end if;
  elsif token is null or invitation.token_hash <> encode(extensions.digest(token, 'sha256'), 'hex') then
    raise exception 'INVALID_INVITATION_TOKEN' using errcode = '42501';
  end if;
  return caller_id;
end;
$$;

create function public.accept_workspace_invitation(p_invitation_id uuid, p_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.workspace_invitations%rowtype; caller_id uuid; member public.workspace_members%rowtype;
  workspace_name text; existing_status public.membership_status;
begin
  select * into invitation from public.workspace_invitations where id = p_invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002'; end if;
  caller_id := private.assert_invitation_recipient(invitation, p_token);
  if invitation.status = 'accepted' and invitation.accepted_by = caller_id then
    select * into member from public.workspace_members where workspace_id = invitation.workspace_id and user_id = caller_id;
    select name into workspace_name from public.workspaces where id = invitation.workspace_id;
    return jsonb_build_object('workspaceId', invitation.workspace_id, 'workspaceName', workspace_name,
      'role', member.role, 'membershipId', member.id, 'status', 'accepted');
  end if;
  if invitation.status = 'revoked' then raise exception 'INVITATION_REVOKED' using errcode = '55000'; end if;
  if invitation.status = 'declined' then raise exception 'INVITATION_DECLINED' using errcode = '55000'; end if;
  if invitation.status <> 'pending' then raise exception 'INVITATION_NOT_PENDING' using errcode = '55000'; end if;
  if invitation.expires_at <= now() then raise exception 'INVITATION_EXPIRED' using errcode = '55000'; end if;
  select status into existing_status from public.workspace_members where workspace_id = invitation.workspace_id and user_id = caller_id;
  if existing_status = 'suspended' then raise exception 'MEMBER_REACTIVATION_REQUIRED' using errcode = '55000'; end if;
  insert into public.workspace_members(workspace_id, user_id, role, status, invited_by, joined_at)
  values(invitation.workspace_id, caller_id, invitation.role, 'active', invitation.invited_by, now())
  on conflict(workspace_id, user_id) do update set role = excluded.role, status = 'active', joined_at = coalesce(public.workspace_members.joined_at, now())
  where public.workspace_members.status = 'invited'
  returning * into member;
  if member.id is null then raise exception 'USER_ALREADY_MEMBER' using errcode = '23505'; end if;
  update public.workspace_invitations set status = 'accepted', accepted_by = caller_id, accepted_at = now()
  where id = invitation.id;
  insert into public.membership_events(workspace_id, workspace_member_id, invitation_id, event_type, actor_id, affected_user_id, new_role, new_status)
  values(invitation.workspace_id, member.id, invitation.id, 'invitation_accepted', caller_id, caller_id, member.role, 'active');
  insert into public.membership_events(workspace_id, workspace_member_id, invitation_id, event_type, actor_id, affected_user_id, new_role, new_status)
  values(invitation.workspace_id, member.id, invitation.id, 'member_added', caller_id, caller_id, member.role, 'active');
  perform private.create_notification(invitation.invited_by, invitation.workspace_id, 'invitation_accepted',
    'Invitation accepted', 'A new member joined your workspace.', 'workspace_member', member.id,
    '/dashboard/team', '{}'::jsonb, 'invitation-accepted:' || invitation.id::text);
  select name into workspace_name from public.workspaces where id = invitation.workspace_id;
  return jsonb_build_object('workspaceId', invitation.workspace_id, 'workspaceName', workspace_name,
    'role', member.role, 'membershipId', member.id, 'status', 'accepted');
end;
$$;

create function public.decline_workspace_invitation(p_invitation_id uuid, p_token text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.workspace_invitations%rowtype; caller_id uuid;
begin
  select * into invitation from public.workspace_invitations where id = p_invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002'; end if;
  caller_id := private.assert_invitation_recipient(invitation, p_token);
  if invitation.status = 'declined' then return jsonb_build_object('invitationId', invitation.id, 'status', 'declined'); end if;
  if invitation.status = 'revoked' then raise exception 'INVITATION_REVOKED' using errcode = '55000'; end if;
  if invitation.status <> 'pending' then raise exception 'INVITATION_NOT_PENDING' using errcode = '55000'; end if;
  if invitation.expires_at <= now() then raise exception 'INVITATION_EXPIRED' using errcode = '55000'; end if;
  update public.workspace_invitations set status = 'declined', declined_at = now() where id = invitation.id;
  insert into public.membership_events(workspace_id, invitation_id, event_type, actor_id, affected_user_id, new_role)
  values(invitation.workspace_id, invitation.id, 'invitation_declined', caller_id, caller_id, invitation.role);
  perform private.create_notification(invitation.invited_by, invitation.workspace_id, 'invitation_declined',
    'Invitation declined', 'A workspace invitation was declined.', 'workspace_invitation', invitation.id,
    '/dashboard/team', '{}'::jsonb, 'invitation-declined:' || invitation.id::text);
  return jsonb_build_object('invitationId', invitation.id, 'status', 'declined');
end;
$$;

create function public.revoke_workspace_invitation(p_invitation_id uuid, p_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare invitation public.workspace_invitations%rowtype; caller_id uuid := (select auth.uid());
begin
  select * into invitation from public.workspace_invitations where id = p_invitation_id for update;
  if invitation.id is null then raise exception 'INVITATION_NOT_FOUND' using errcode = 'P0002'; end if;
  perform private.assert_team_manager(invitation.workspace_id, caller_id, invitation.role);
  if invitation.status <> 'pending' then raise exception 'INVITATION_NOT_PENDING' using errcode = '55000'; end if;
  update public.workspace_invitations set status = 'revoked', revoked_at = now() where id = invitation.id;
  insert into public.membership_events(workspace_id, invitation_id, event_type, actor_id, affected_user_id, new_role, message)
  values(invitation.workspace_id, invitation.id, 'invitation_revoked', caller_id, invitation.invited_user_id,
    invitation.role, private.clean_optional_message(p_message));
  if invitation.invited_user_id is not null then
    perform private.create_notification(invitation.invited_user_id, invitation.workspace_id, 'invitation_revoked',
      'Invitation revoked', 'A workspace invitation is no longer available.', 'workspace_invitation', invitation.id,
      '/dashboard/notifications', '{}'::jsonb, 'invitation-revoked:' || invitation.id::text, true);
  end if;
  return jsonb_build_object('invitationId', invitation.id, 'status', 'revoked');
end;
$$;

create function private.lock_managed_member(p_member_id uuid, p_actor_id uuid)
returns public.workspace_members language plpgsql volatile security definer set search_path = '' as $$
declare member public.workspace_members%rowtype; actor_role public.workspace_role;
begin
  select * into member from public.workspace_members where id = p_member_id for update;
  if member.id is null then raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002'; end if;
  actor_role := private.assert_team_manager(member.workspace_id, p_actor_id, member.role);
  if member.user_id = p_actor_id then raise exception 'CANNOT_MANAGE_SELF' using errcode = '42501'; end if;
  if actor_role = 'administrator' and member.role in ('owner', 'administrator') then
    raise exception 'ROLE_ASSIGNMENT_DENIED' using errcode = '42501';
  end if;
  return member;
end;
$$;

create function public.update_workspace_member_role(p_member_id uuid, p_new_role public.workspace_role, p_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); member public.workspace_members%rowtype; actor_role public.workspace_role;
begin
  member := private.lock_managed_member(p_member_id, caller_id);
  actor_role := private.workspace_role_for_user(member.workspace_id, caller_id);
  if actor_role = 'administrator' and p_new_role in ('owner', 'administrator') then
    raise exception 'ROLE_ASSIGNMENT_DENIED' using errcode = '42501';
  end if;
  if member.role = p_new_role then return jsonb_build_object('memberId', member.id, 'role', member.role); end if;
  update public.workspace_members set role = p_new_role where id = member.id;
  insert into public.membership_events(workspace_id, workspace_member_id, event_type, actor_id, affected_user_id, previous_role, new_role, previous_status, new_status, message)
  values(member.workspace_id, member.id, 'role_changed', caller_id, member.user_id, member.role, p_new_role, member.status, member.status, private.clean_optional_message(p_message));
  perform private.create_notification(member.user_id, member.workspace_id, 'role_changed', 'Workspace role changed',
    'Your role in a workspace has changed.', 'workspace_member', member.id, '/dashboard/team',
    jsonb_build_object('role', p_new_role), 'role-changed:' || member.id::text || ':' || extract(epoch from clock_timestamp())::text);
  return jsonb_build_object('memberId', member.id, 'role', p_new_role);
end;
$$;

create function public.transfer_workspace_ownership(
  p_workspace_id uuid, p_new_owner_member_id uuid,
  p_current_owner_new_role public.workspace_role default 'administrator', p_message text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); current_owner public.workspace_members%rowtype; target public.workspace_members%rowtype;
begin
  select * into current_owner from public.workspace_members
  where workspace_id = p_workspace_id and user_id = caller_id and status = 'active' for update;
  if current_owner.id is null or current_owner.role <> 'owner' then raise exception 'TEAM_PERMISSION_DENIED' using errcode = '42501'; end if;
  if p_current_owner_new_role = 'owner' then raise exception 'INVALID_TRANSFER_ROLE' using errcode = '22023'; end if;
  select * into target from public.workspace_members where id = p_new_owner_member_id and workspace_id = p_workspace_id for update;
  if target.id is null or target.status <> 'active' then raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002'; end if;
  if target.user_id = caller_id then raise exception 'CANNOT_TRANSFER_TO_SELF' using errcode = '22023'; end if;
  update public.workspace_members set role = 'owner' where id = target.id;
  update public.workspace_members set role = p_current_owner_new_role where id = current_owner.id;
  insert into public.membership_events(workspace_id, workspace_member_id, event_type, actor_id, affected_user_id, previous_role, new_role, previous_status, new_status, message,
    metadata) values(p_workspace_id, target.id, 'ownership_transferred', caller_id, target.user_id, target.role, 'owner', target.status, target.status,
    private.clean_optional_message(p_message), jsonb_build_object('previousOwnerMemberId', current_owner.id, 'previousOwnerNewRole', p_current_owner_new_role));
  perform private.create_notification(target.user_id, p_workspace_id, 'ownership_transferred', 'Workspace ownership transferred',
    'You are now the workspace owner.', 'workspace_member', target.id, '/dashboard/team', '{}'::jsonb,
    'ownership-transfer:' || target.id::text || ':' || extract(epoch from clock_timestamp())::text, true);
  return jsonb_build_object('workspaceId', p_workspace_id, 'newOwnerMemberId', target.id,
    'previousOwnerMemberId', current_owner.id, 'previousOwnerRole', p_current_owner_new_role);
end;
$$;

create function public.suspend_workspace_member(p_member_id uuid, p_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); member public.workspace_members%rowtype;
begin
  member := private.lock_managed_member(p_member_id, caller_id);
  if member.status = 'suspended' then raise exception 'MEMBER_ALREADY_SUSPENDED' using errcode = '55000'; end if;
  update public.workspace_members set status = 'suspended' where id = member.id;
  insert into public.membership_events(workspace_id, workspace_member_id, event_type, actor_id, affected_user_id, previous_role, new_role, previous_status, new_status, message)
  values(member.workspace_id, member.id, 'member_suspended', caller_id, member.user_id, member.role, member.role, member.status, 'suspended', private.clean_optional_message(p_message));
  perform private.create_notification(member.user_id, member.workspace_id, 'member_suspended', 'Workspace access suspended',
    'Your access to a workspace has been suspended. Your authored content remains.', 'workspace_member', member.id,
    '/dashboard/notifications', '{}'::jsonb, 'member-suspended:' || member.id::text || ':' || extract(epoch from clock_timestamp())::text, true);
  return jsonb_build_object('memberId', member.id, 'status', 'suspended');
end;
$$;

create function public.reactivate_workspace_member(p_member_id uuid, p_role public.workspace_role default null, p_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); member public.workspace_members%rowtype; next_role public.workspace_role; actor_role public.workspace_role;
begin
  member := private.lock_managed_member(p_member_id, caller_id);
  if member.status <> 'suspended' then raise exception 'MEMBER_NOT_SUSPENDED' using errcode = '55000'; end if;
  next_role := coalesce(p_role, member.role); actor_role := private.workspace_role_for_user(member.workspace_id, caller_id);
  if actor_role = 'administrator' and next_role in ('owner', 'administrator') then raise exception 'ROLE_ASSIGNMENT_DENIED' using errcode = '42501'; end if;
  update public.workspace_members set status = 'active', role = next_role where id = member.id;
  insert into public.membership_events(workspace_id, workspace_member_id, event_type, actor_id, affected_user_id, previous_role, new_role, previous_status, new_status, message)
  values(member.workspace_id, member.id, 'member_reactivated', caller_id, member.user_id, member.role, next_role, member.status, 'active', private.clean_optional_message(p_message));
  perform private.create_notification(member.user_id, member.workspace_id, 'member_reactivated', 'Workspace access restored',
    'Your access to a workspace has been restored.', 'workspace_member', member.id, '/dashboard',
    '{}'::jsonb, 'member-reactivated:' || member.id::text || ':' || extract(epoch from clock_timestamp())::text, true);
  return jsonb_build_object('memberId', member.id, 'status', 'active', 'role', next_role);
end;
$$;

create function public.remove_workspace_member(p_member_id uuid, p_message text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); member public.workspace_members%rowtype;
begin
  member := private.lock_managed_member(p_member_id, caller_id);
  insert into public.membership_events(workspace_id, workspace_member_id, event_type, actor_id, affected_user_id, previous_role, previous_status, message)
  values(member.workspace_id, member.id, 'member_removed', caller_id, member.user_id, member.role, member.status, private.clean_optional_message(p_message));
  perform private.create_notification(member.user_id, member.workspace_id, 'member_removed', 'Removed from workspace',
    'Your workspace membership was removed. Your PostFlow account and authored content remain.', 'workspace', member.workspace_id,
    '/dashboard/notifications', '{}'::jsonb, 'member-removed:' || member.id::text || ':' || extract(epoch from clock_timestamp())::text, true);
  delete from public.workspace_members where id = member.id;
  return jsonb_build_object('memberId', member.id, 'status', 'removed');
end;
$$;

create function public.leave_workspace(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare caller_id uuid := (select auth.uid()); member public.workspace_members%rowtype;
begin
  select * into member from public.workspace_members where workspace_id = p_workspace_id and user_id = caller_id for update;
  if member.id is null then raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.membership_events(workspace_id, workspace_member_id, event_type, actor_id, affected_user_id, previous_role, previous_status)
  values(member.workspace_id, member.id, 'member_left', caller_id, caller_id, member.role, member.status);
  delete from public.workspace_members where id = member.id;
  return jsonb_build_object('workspaceId', p_workspace_id, 'status', 'left');
end;
$$;

create function public.list_eligible_workspace_roles(p_workspace_id uuid)
returns public.workspace_role[] language plpgsql stable security definer set search_path = '' as $$
declare caller_role public.workspace_role := private.workspace_role_for_user(p_workspace_id, (select auth.uid()));
begin
  if caller_role = 'owner' then return enum_range(null::public.workspace_role); end if;
  if caller_role = 'administrator' then return array['content_manager','designer','approver','viewer']::public.workspace_role[]; end if;
  return array[]::public.workspace_role[];
end;
$$;

create function public.mark_notification_read(p_notification_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update public.notifications set read_at = coalesce(read_at, now()) where id = p_notification_id and user_id = (select auth.uid());
  get diagnostics affected = row_count; return affected;
end;
$$;

create function public.mark_notifications_read(p_notification_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_notification_ids is null or cardinality(p_notification_ids) > 100 then raise exception 'INVALID_NOTIFICATION_SELECTION' using errcode = '22023'; end if;
  update public.notifications set read_at = coalesce(read_at, now())
  where user_id = (select auth.uid()) and id = any(p_notification_ids);
  get diagnostics affected = row_count; return affected;
end;
$$;

create function public.mark_all_notifications_read(p_workspace_id uuid default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update public.notifications set read_at = coalesce(read_at, now())
  where user_id = (select auth.uid()) and read_at is null
    and (p_workspace_id is null or workspace_id = p_workspace_id);
  get diagnostics affected = row_count; return affected;
end;
$$;

create function public.archive_notification(p_notification_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update public.notifications set archived_at = coalesce(archived_at, now()) where id = p_notification_id and user_id = (select auth.uid());
  get diagnostics affected = row_count; return affected;
end;
$$;

create function public.unarchive_notification(p_notification_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare affected integer;
begin
  if (select auth.uid()) is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  update public.notifications set archived_at = null where id = p_notification_id and user_id = (select auth.uid());
  get diagnostics affected = row_count; return affected;
end;
$$;

create function private.notify_approval_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare request_row public.approval_requests%rowtype; recipient uuid; notice_type public.notification_type;
begin
  select * into request_row from public.approval_requests where id = new.approval_request_id;
  if new.event_type in ('assigned', 'reassigned') then
    recipient := request_row.assigned_approver_id;
    notice_type := case when new.event_type = 'reassigned' then 'approval_reassigned'::public.notification_type else 'approval_assigned'::public.notification_type end;
  elsif new.event_type in ('approved', 'changes_requested', 'rejected') then
    recipient := request_row.requested_by;
    notice_type := ('approval_' || new.event_type::text)::public.notification_type;
  elsif new.event_type = 'comment_added' then
    recipient := case when new.actor_id = request_row.requested_by then request_row.assigned_approver_id else request_row.requested_by end;
    notice_type := 'approval_comment';
  else return new;
  end if;
  if recipient is not null and recipient is distinct from new.actor_id then
    perform private.create_notification(recipient, new.workspace_id, notice_type, 'Approval update',
      'A post approval needs your attention.', 'approval_request', new.approval_request_id,
      '/dashboard/approvals', '{}'::jsonb, 'approval-event:' || new.id::text || ':' || recipient::text);
  end if;
  return new;
end;
$$;
create trigger approval_events_create_notification after insert on public.approval_events
for each row execute function private.notify_approval_event();

create function private.notify_publishing_job()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient uuid; notice_type public.notification_type;
begin
  if new.status is not distinct from old.status or new.status not in ('succeeded','failed','reconciliation_required') then return new; end if;
  select created_by into recipient from public.posts where id = new.post_id;
  notice_type := ('publishing_' || new.status::text)::public.notification_type;
  perform private.create_notification(recipient, new.workspace_id, notice_type, 'Publishing update',
    case when new.status = 'succeeded' then 'Your post was published successfully.'
      when new.status = 'failed' then 'A post could not be published.'
      else 'A publishing result requires reconciliation.' end,
    'publishing_job', new.id, '/dashboard/posts', jsonb_build_object('status', new.status),
    'publishing-job:' || new.id::text || ':' || new.status::text);
  return new;
end;
$$;
create trigger publishing_jobs_create_notification after update of status on public.publishing_jobs
for each row execute function private.notify_publishing_job();

create function private.notify_social_account_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.connection_status is not distinct from old.connection_status
    or new.connection_status not in ('reconnect_required','expired','error') then return new; end if;
  perform private.create_notification(new.connected_by, new.workspace_id, 'social_account_reconnect_required',
    'Social account needs attention', 'Reconnect the social account to continue publishing.',
    'social_account', new.id, '/dashboard/accounts', jsonb_build_object('status', new.connection_status),
    'social-account:' || new.id::text || ':' || new.connection_status::text);
  return new;
end;
$$;
create trigger social_accounts_create_notification after update of connection_status on public.social_accounts
for each row execute function private.notify_social_account_status();

alter table public.workspace_invitations enable row level security;
alter table public.membership_events enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

create policy membership_events_read_members on public.membership_events for select to authenticated
using(private.is_workspace_member(workspace_id));
create policy notifications_read_own on public.notifications for select to authenticated
using(user_id = (select auth.uid()));
create policy notification_preferences_read_own on public.notification_preferences for select to authenticated
using(user_id = (select auth.uid()));
create policy notification_preferences_insert_own on public.notification_preferences for insert to authenticated
with check(user_id = (select auth.uid()));
create policy notification_preferences_update_own on public.notification_preferences for update to authenticated
using(user_id = (select auth.uid())) with check(user_id = (select auth.uid()));

revoke all on public.workspace_invitations, public.membership_events, public.notifications, public.notification_preferences from public, anon, authenticated;
grant select on public.membership_events, public.notifications to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;

revoke all on function public.list_workspace_invitations(uuid) from public, anon, authenticated;
revoke all on function public.get_workspace_invitation_details(uuid,text) from public, anon, authenticated;
revoke all on function public.create_workspace_invitation(uuid,text,public.workspace_role,uuid,uuid,text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.mark_workspace_invitation_sent(uuid,uuid) from public, anon, authenticated;
revoke all on function public.prepare_workspace_invitation_resend(uuid,uuid,text,uuid,timestamptz) from public, anon, authenticated;
revoke all on function public.accept_workspace_invitation(uuid,text) from public, anon, authenticated;
revoke all on function public.decline_workspace_invitation(uuid,text) from public, anon, authenticated;
revoke all on function public.revoke_workspace_invitation(uuid,text) from public, anon, authenticated;
revoke all on function public.update_workspace_member_role(uuid,public.workspace_role,text) from public, anon, authenticated;
revoke all on function public.transfer_workspace_ownership(uuid,uuid,public.workspace_role,text) from public, anon, authenticated;
revoke all on function public.suspend_workspace_member(uuid,text) from public, anon, authenticated;
revoke all on function public.reactivate_workspace_member(uuid,public.workspace_role,text) from public, anon, authenticated;
revoke all on function public.remove_workspace_member(uuid,text) from public, anon, authenticated;
revoke all on function public.leave_workspace(uuid) from public, anon, authenticated;
revoke all on function public.list_eligible_workspace_roles(uuid) from public, anon, authenticated;
revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated;
revoke all on function public.mark_notifications_read(uuid[]) from public, anon, authenticated;
revoke all on function public.mark_all_notifications_read(uuid) from public, anon, authenticated;
revoke all on function public.archive_notification(uuid) from public, anon, authenticated;
revoke all on function public.unarchive_notification(uuid) from public, anon, authenticated;
revoke all on function private.clean_optional_message(text,integer) from public, anon, authenticated;
revoke all on function private.workspace_role_for_user(uuid,uuid) from public, anon, authenticated;
revoke all on function private.assert_team_manager(uuid,uuid,public.workspace_role) from public, anon, authenticated;
revoke all on function private.metadata_is_safe(jsonb) from public, anon, authenticated;
revoke all on function private.create_notification(uuid,uuid,public.notification_type,text,text,text,uuid,text,jsonb,text,boolean) from public, anon, authenticated;
revoke all on function private.expire_workspace_invitations(uuid) from public, anon, authenticated;
revoke all on function private.assert_invitation_recipient(public.workspace_invitations,text) from public, anon, authenticated;
revoke all on function private.lock_managed_member(uuid,uuid) from public, anon, authenticated;
revoke all on function private.notify_approval_event() from public, anon, authenticated;
revoke all on function private.notify_publishing_job() from public, anon, authenticated;
revoke all on function private.notify_social_account_status() from public, anon, authenticated;
grant execute on function public.create_workspace_invitation(uuid,text,public.workspace_role,uuid,uuid,text,text,timestamptz) to service_role;
grant execute on function public.mark_workspace_invitation_sent(uuid,uuid) to service_role;
grant execute on function public.prepare_workspace_invitation_resend(uuid,uuid,text,uuid,timestamptz) to service_role;
grant execute on function public.list_workspace_invitations(uuid) to authenticated;
grant execute on function public.get_workspace_invitation_details(uuid,text) to authenticated;
grant execute on function public.accept_workspace_invitation(uuid,text) to authenticated;
grant execute on function public.decline_workspace_invitation(uuid,text) to authenticated;
grant execute on function public.revoke_workspace_invitation(uuid,text) to authenticated;
grant execute on function public.update_workspace_member_role(uuid,public.workspace_role,text) to authenticated;
grant execute on function public.transfer_workspace_ownership(uuid,uuid,public.workspace_role,text) to authenticated;
grant execute on function public.suspend_workspace_member(uuid,text) to authenticated;
grant execute on function public.reactivate_workspace_member(uuid,public.workspace_role,text) to authenticated;
grant execute on function public.remove_workspace_member(uuid,text) to authenticated;
grant execute on function public.leave_workspace(uuid) to authenticated;
grant execute on function public.list_eligible_workspace_roles(uuid) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.mark_all_notifications_read(uuid) to authenticated;
grant execute on function public.archive_notification(uuid) to authenticated;
grant execute on function public.unarchive_notification(uuid) to authenticated;

do $$
begin
  if not exists(
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

commit;
