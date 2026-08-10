begin;

create type public.approval_request_status as enum (
  'pending',
  'approved',
  'changes_requested',
  'rejected',
  'withdrawn',
  'superseded',
  'cancelled'
);

create type public.approval_event_type as enum (
  'submitted',
  'assigned',
  'reassigned',
  'approved',
  'changes_requested',
  'rejected',
  'withdrawn',
  'superseded',
  'comment_added',
  'deadline_changed'
);

create type public.approval_comment_type as enum (
  'comment',
  'change_instruction',
  'rejection_reason',
  'system'
);

create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  post_id uuid not null,
  post_revision bigint not null,
  status public.approval_request_status not null default 'pending',
  requested_by uuid not null references auth.users(id) on delete restrict,
  assigned_approver_id uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  submission_message text,
  resolution_message text,
  due_at timestamptz,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  superseded_at timestamptz,
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint approval_requests_id_workspace_key unique(id, workspace_id),
  constraint approval_requests_post_workspace_fkey
    foreign key(post_id, workspace_id)
    references public.posts(id, workspace_id) on delete cascade,
  constraint approval_requests_revision_positive check(post_revision > 0),
  constraint approval_requests_submission_message_valid check(
    submission_message is null or (
      submission_message = btrim(submission_message)
      and char_length(submission_message) between 1 and 5000
    )
  ),
  constraint approval_requests_resolution_message_valid check(
    resolution_message is null or (
      resolution_message = btrim(resolution_message)
      and char_length(resolution_message) between 1 and 5000
    )
  ),
  constraint approval_requests_resolution_time_valid check(
    status = 'pending' or resolved_at is not null
  ),
  constraint approval_requests_superseded_time_valid check(
    status <> 'superseded' or superseded_at is not null
  ),
  constraint approval_requests_withdrawn_time_valid check(
    status <> 'withdrawn' or withdrawn_at is not null
  )
);

create unique index approval_requests_one_pending_post_idx
  on public.approval_requests(post_id)
  where status = 'pending';
create index approval_requests_workspace_id_idx on public.approval_requests(workspace_id);
create index approval_requests_post_id_idx on public.approval_requests(post_id);
create index approval_requests_requested_by_idx on public.approval_requests(requested_by);
create index approval_requests_assigned_approver_id_idx on public.approval_requests(assigned_approver_id);
create index approval_requests_status_idx on public.approval_requests(status);
create index approval_requests_due_at_idx on public.approval_requests(due_at);
create index approval_requests_workspace_status_due_idx on public.approval_requests(workspace_id, status, due_at);
create index approval_requests_post_revision_idx on public.approval_requests(post_id, post_revision);

create table public.approval_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  approval_request_id uuid not null,
  author_id uuid not null references auth.users(id) on delete restrict,
  comment_type public.approval_comment_type not null default 'comment',
  body text not null,
  created_at timestamptz not null default now(),
  constraint approval_comments_request_workspace_fkey
    foreign key(approval_request_id, workspace_id)
    references public.approval_requests(id, workspace_id) on delete cascade,
  constraint approval_comments_body_valid check(
    body = btrim(body) and char_length(body) between 1 and 5000
  )
);

create index approval_comments_request_id_idx on public.approval_comments(approval_request_id);
create index approval_comments_workspace_id_idx on public.approval_comments(workspace_id);
create index approval_comments_author_id_idx on public.approval_comments(author_id);

create table public.approval_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  approval_request_id uuid not null,
  post_id uuid not null,
  post_revision bigint not null,
  event_type public.approval_event_type not null,
  actor_id uuid references auth.users(id) on delete set null,
  previous_status public.approval_request_status,
  new_status public.approval_request_status,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint approval_events_request_workspace_fkey
    foreign key(approval_request_id, workspace_id)
    references public.approval_requests(id, workspace_id) on delete cascade,
  constraint approval_events_post_workspace_fkey
    foreign key(post_id, workspace_id)
    references public.posts(id, workspace_id) on delete cascade,
  constraint approval_events_revision_positive check(post_revision > 0),
  constraint approval_events_message_valid check(
    message is null or (
      message = btrim(message) and char_length(message) between 1 and 5000
    )
  ),
  constraint approval_events_metadata_object check(jsonb_typeof(metadata) = 'object')
);

create index approval_events_request_id_idx on public.approval_events(approval_request_id);
create index approval_events_post_id_idx on public.approval_events(post_id);
create index approval_events_workspace_id_idx on public.approval_events(workspace_id);
create index approval_events_created_at_idx on public.approval_events(created_at);

create trigger approval_requests_set_updated_at
before update on public.approval_requests
for each row execute function private.set_updated_at();

create or replace function private.increment_post_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.revision := 1;
  elsif new.revision is distinct from old.revision then
    if new.revision <> old.revision + 1 then
      raise exception 'POST_REVISION_INVALID' using errcode = '23514';
    end if;
  else
    new.revision := old.revision;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_browser_post_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.role()) = 'authenticated'
     and coalesce(current_setting('postflow.post_rpc_write', true), '') <> 'allowed' then
    raise exception 'Post mutations must use controlled PostFlow RPC functions'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create function private.approval_member_role(
  target_workspace_id uuid,
  target_user_id uuid
)
returns public.workspace_role
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.workspace_members as membership
  where membership.workspace_id = target_workspace_id
    and membership.user_id = target_user_id
    and membership.status = 'active'::public.membership_status;
$$;

create function private.is_approval_capable(
  target_workspace_id uuid,
  target_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.approval_member_role(target_workspace_id, target_user_id) in (
      'owner'::public.workspace_role,
      'administrator'::public.workspace_role,
      'approver'::public.workspace_role
    ),
    false
  );
$$;

create function private.assert_eligible_approver(
  target_workspace_id uuid,
  target_approver_id uuid,
  target_requester_id uuid,
  target_post_creator_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_approver_id is null then
    raise exception 'NO_ELIGIBLE_APPROVER' using errcode = '22023';
  end if;
  if not private.is_user_workspace_member(target_workspace_id, target_approver_id) then
    raise exception 'APPROVER_WRONG_WORKSPACE' using errcode = '42501';
  end if;
  if not private.is_approval_capable(target_workspace_id, target_approver_id) then
    raise exception 'APPROVER_ROLE_INVALID' using errcode = '42501';
  end if;
  if target_approver_id = target_requester_id
     or target_approver_id = target_post_creator_id then
    raise exception 'SELF_APPROVAL_DENIED' using errcode = '42501';
  end if;
end;
$$;

create function private.append_approval_event(
  target_request public.approval_requests,
  target_event_type public.approval_event_type,
  target_actor_id uuid,
  target_previous_status public.approval_request_status,
  target_new_status public.approval_request_status,
  target_message text default null,
  target_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  if jsonb_typeof(coalesce(target_metadata, '{}'::jsonb)) <> 'object' then
    raise exception 'APPROVAL_EVENT_METADATA_INVALID' using errcode = '22023';
  end if;
  insert into public.approval_events(
    workspace_id, approval_request_id, post_id, post_revision, event_type,
    actor_id, previous_status, new_status, message, metadata
  ) values (
    target_request.workspace_id, target_request.id, target_request.post_id,
    target_request.post_revision, target_event_type, target_actor_id,
    target_previous_status, target_new_status,
    nullif(btrim(coalesce(target_message, '')), ''),
    coalesce(target_metadata, '{}'::jsonb)
  ) returning id into created_id;
  return created_id;
end;
$$;

create function private.invalidate_post_approval_for_edit(
  target_post public.posts,
  target_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare request_row public.approval_requests%rowtype;
  previous_status public.approval_request_status;
begin
  for request_row in
    select * from public.approval_requests
    where post_id = target_post.id
      and post_revision = target_post.revision
      and status in ('pending', 'approved')
    order by requested_at desc
    for update
  loop
    previous_status := request_row.status;
    update public.approval_requests
    set status = 'superseded',
        resolved_by = coalesce(resolved_by, target_actor_id),
        resolved_at = coalesce(resolved_at, now()),
        superseded_at = now(),
        resolution_message = coalesce(
          resolution_message,
          'Approval invalidated because the post content was edited.'
        )
    where id = request_row.id
    returning * into request_row;
    perform private.append_approval_event(
      request_row,
      'superseded',
      target_actor_id,
      previous_status,
      'superseded',
      'Approval invalidated because the post content was edited.',
      jsonb_build_object('reason', 'post_edited')
    );
  end loop;
end;
$$;

create function private.has_valid_post_approval(target_post_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
    from public.posts as post
    join public.approval_requests as request
      on request.post_id = post.id
     and request.workspace_id = post.workspace_id
     and request.post_revision = post.revision
     and request.status = 'approved'::public.approval_request_status
    where post.id = target_post_id
  );
$$;

create or replace function private.validate_publishing_post(target_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare destination record; target_post public.posts%rowtype;
begin
  select * into target_post from public.posts where id = target_post_id;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  if target_post.approval_required
     and not private.has_valid_post_approval(target_post.id) then
    raise exception 'PUBLISHING_BLOCKED_APPROVAL_REQUIRED' using errcode = '42501';
  end if;
  if not exists(select 1 from public.post_destinations where post_id = target_post_id) then
    raise exception 'NO_DESTINATION_SELECTED' using errcode = '22023';
  end if;
  for destination in
    select destination_row.*, account.platform, account.connection_status,
      account.granted_scopes, credential.expires_at
    from public.post_destinations as destination_row
    join public.social_accounts as account on account.id = destination_row.social_account_id
    left join private.social_credentials as credential on credential.social_account_id = account.id
    where destination_row.post_id = target_post_id
  loop
    if destination.connection_status <> 'connected'
       or destination.expires_at is not null and destination.expires_at <= now() then
      raise exception 'ACCOUNT_DISCONNECTED' using errcode = '22023';
    end if;
    if destination.platform = 'facebook'
       and not destination.granted_scopes @> array[
         'pages_show_list','pages_read_engagement','pages_manage_posts'
       ]::text[] then
      raise exception 'MISSING_PERMISSION' using errcode = '42501';
    end if;
    if destination.platform = 'instagram'
       and not destination.granted_scopes @> array[
         'pages_show_list','pages_read_engagement','instagram_basic','instagram_content_publish'
       ]::text[] then
      raise exception 'MISSING_PERMISSION' using errcode = '42501';
    end if;
    perform private.publishing_operation_for(target_post_id, destination.platform);
  end loop;
end;
$$;

create or replace function public.create_post(
  p_workspace_id uuid, p_caption text, p_status public.post_status,
  p_scheduled_at timestamptz, p_timezone text, p_approval_required boolean,
  p_assigned_to uuid, p_platforms jsonb, p_media_asset_ids uuid[],
  p_destination_account_ids uuid[]
)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.workspace_role;
  created_post public.posts%rowtype;
begin
  if caller_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  caller_role := private.approval_member_role(p_workspace_id, caller_id);
  if caller_role is null
     or caller_role not in ('owner','administrator','content_manager','designer') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('draft','scheduled','cancelled') then
    raise exception 'POST_STATUS_RESERVED' using errcode = '42501';
  end if;
  if caller_role = 'designer' and p_status <> 'draft' then
    raise exception 'DESIGNER_DRAFT_ONLY' using errcode = '42501';
  end if;
  if caller_role = 'designer' and coalesce(p_approval_required, false) then
    raise exception 'APPROVAL_SETTING_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_assigned_to is not null
     and not private.is_user_workspace_member(p_workspace_id, p_assigned_to) then
    raise exception 'ASSIGNEE_INVALID' using errcode = '22023';
  end if;
  if btrim(coalesce(p_timezone, '')) = ''
     or not exists(select 1 from pg_timezone_names where name = btrim(p_timezone)) then
    raise exception 'TIMEZONE_INVALID' using errcode = '22023';
  end if;
  perform set_config('postflow.post_rpc_write', 'allowed', true);
  insert into public.posts(
    workspace_id, created_by, assigned_to, caption, status, scheduled_at,
    timezone, approval_required, published_at, failure_message
  ) values (
    p_workspace_id, caller_id, p_assigned_to, coalesce(p_caption, ''), p_status,
    p_scheduled_at, btrim(p_timezone), coalesce(p_approval_required, false), null, null
  ) returning * into created_post;
  perform private.replace_post_children(
    created_post.id, created_post.workspace_id, p_platforms, p_media_asset_ids
  );
  perform private.replace_post_destinations(
    created_post.id, created_post.workspace_id, p_destination_account_ids
  );
  perform private.validate_post_state(created_post.id);
  if p_status = 'scheduled' then
    perform private.validate_publishing_post(created_post.id);
  end if;
  select * into created_post from public.posts where id = created_post.id;
  perform set_config('postflow.post_rpc_write', '', true);
  return created_post;
end;
$$;

create or replace function public.update_post(
  p_post_id uuid, p_expected_revision bigint, p_caption text,
  p_status public.post_status, p_scheduled_at timestamptz, p_timezone text,
  p_approval_required boolean, p_assigned_to uuid, p_platforms jsonb,
  p_media_asset_ids uuid[], p_destination_account_ids uuid[]
)
returns public.posts
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.workspace_role;
  current_post public.posts%rowtype;
  updated_post public.posts%rowtype;
begin
  if caller_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into current_post from public.posts where id = p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  caller_role := private.approval_member_role(current_post.workspace_id, caller_id);
  if caller_role is null then raise exception 'PERMISSION_DENIED' using errcode = '42501'; end if;
  if caller_role not in ('owner','administrator','content_manager','designer')
     or caller_role = 'designer' and current_post.created_by <> caller_id then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if exists(select 1 from public.publishing_jobs where post_id = p_post_id) then
    raise exception 'POST_HAS_PUBLISHING_HISTORY' using errcode = '55000';
  end if;
  if current_post.status not in ('draft','scheduled','cancelled','pending_approval','approved') then
    raise exception 'POST_READ_ONLY' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision <> current_post.revision then
    raise exception 'POST_REVISION_CONFLICT' using errcode = '40001';
  end if;
  if p_status is null or p_status not in ('draft','scheduled','cancelled') then
    raise exception 'POST_STATUS_RESERVED' using errcode = '42501';
  end if;
  if current_post.status in ('pending_approval','approved') and p_status <> 'draft' then
    raise exception 'APPROVAL_INVALIDATED_BY_EDIT' using errcode = '42501';
  end if;
  if current_post.approval_required and current_post.status = 'scheduled'
     and p_status <> 'draft' then
    raise exception 'APPROVAL_INVALIDATED_BY_EDIT' using errcode = '42501';
  end if;
  if caller_role = 'designer' and p_status <> 'draft' then
    raise exception 'DESIGNER_DRAFT_ONLY' using errcode = '42501';
  end if;
  if p_approval_required is distinct from current_post.approval_required
     and caller_role not in ('owner','administrator','content_manager') then
    raise exception 'APPROVAL_SETTING_PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_assigned_to is not null
     and not private.is_user_workspace_member(current_post.workspace_id, p_assigned_to) then
    raise exception 'ASSIGNEE_INVALID' using errcode = '22023';
  end if;
  if btrim(coalesce(p_timezone, '')) = ''
     or not exists(select 1 from pg_timezone_names where name = btrim(p_timezone)) then
    raise exception 'TIMEZONE_INVALID' using errcode = '22023';
  end if;

  perform private.invalidate_post_approval_for_edit(current_post, caller_id);
  perform set_config('postflow.post_rpc_write', 'allowed', true);
  update public.posts
  set assigned_to = p_assigned_to,
      caption = coalesce(p_caption, ''),
      status = p_status,
      scheduled_at = p_scheduled_at,
      timezone = btrim(p_timezone),
      approval_required = coalesce(p_approval_required, false),
      revision = current_post.revision + 1
  where id = current_post.id
  returning * into updated_post;
  perform private.replace_post_children(
    updated_post.id, updated_post.workspace_id, p_platforms, p_media_asset_ids
  );
  perform private.replace_post_destinations(
    updated_post.id, updated_post.workspace_id, p_destination_account_ids
  );
  perform private.validate_post_state(updated_post.id);
  if p_status = 'scheduled' then
    perform private.validate_publishing_post(updated_post.id);
  end if;
  select * into updated_post from public.posts where id = updated_post.id;
  perform set_config('postflow.post_rpc_write', '', true);
  return updated_post;
end;
$$;

create function public.submit_post_for_approval(
  p_post_id uuid,
  p_expected_revision bigint,
  p_assigned_approver_id uuid,
  p_submission_message text default null,
  p_due_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.workspace_role;
  target_post public.posts%rowtype;
  stale_request public.approval_requests%rowtype;
  created_request public.approval_requests%rowtype;
  clean_message text := nullif(btrim(coalesce(p_submission_message, '')), '');
begin
  if caller_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into target_post from public.posts where id = p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  caller_role := private.approval_member_role(target_post.workspace_id, caller_id);
  if caller_role is null
     or caller_role not in ('owner','administrator','content_manager','designer') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if caller_role = 'designer' and target_post.created_by <> caller_id then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if target_post.status <> 'draft' then
    raise exception 'POST_NOT_DRAFT' using errcode = '55000';
  end if;
  if p_expected_revision is null or p_expected_revision <> target_post.revision then
    raise exception 'POST_REVISION_CONFLICT' using errcode = '40001';
  end if;
  if p_due_at is not null and p_due_at <= now() then
    raise exception 'DEADLINE_IN_PAST' using errcode = '22023';
  end if;
  if clean_message is not null and char_length(clean_message) > 5000 then
    raise exception 'MESSAGE_TOO_LONG' using errcode = '22023';
  end if;
  if not (
    btrim(target_post.caption) <> ''
    or exists(select 1 from public.post_platforms where post_id = target_post.id and btrim(coalesce(platform_caption, '')) <> '')
    or exists(select 1 from public.post_media where post_id = target_post.id)
  ) then
    raise exception 'POST_CONTENT_REQUIRED' using errcode = '22023';
  end if;
  perform private.assert_eligible_approver(
    target_post.workspace_id, p_assigned_approver_id, caller_id, target_post.created_by
  );

  select * into stale_request
  from public.approval_requests
  where post_id = target_post.id and status = 'pending'
  for update;
  if found then
    if stale_request.post_revision = target_post.revision then
      raise exception 'SUBMISSION_ALREADY_PENDING' using errcode = '23505';
    end if;
    update public.approval_requests
    set status = 'superseded', resolved_at = now(), superseded_at = now(),
        resolution_message = 'Superseded by a newer approval submission.'
    where id = stale_request.id returning * into stale_request;
    perform private.append_approval_event(
      stale_request, 'superseded', caller_id, 'pending', 'superseded',
      'Superseded by a newer approval submission.',
      jsonb_build_object('reason', 'new_submission')
    );
  end if;

  insert into public.approval_requests(
    workspace_id, post_id, post_revision, requested_by, assigned_approver_id,
    submission_message, due_at
  ) values (
    target_post.workspace_id, target_post.id, target_post.revision, caller_id,
    p_assigned_approver_id, clean_message, p_due_at
  ) returning * into created_request;

  perform set_config('postflow.post_rpc_write', 'allowed', true);
  update public.posts set status = 'pending_approval' where id = target_post.id;
  perform set_config('postflow.post_rpc_write', '', true);
  perform private.append_approval_event(
    created_request, 'submitted', caller_id, null, 'pending', clean_message,
    jsonb_build_object('assignedApproverId', p_assigned_approver_id)
  );
  perform private.append_approval_event(
    created_request, 'assigned', caller_id, 'pending', 'pending', null,
    jsonb_build_object('assignedApproverId', p_assigned_approver_id)
  );
  if clean_message is not null then
    insert into public.approval_comments(
      workspace_id, approval_request_id, author_id, comment_type, body
    ) values (
      created_request.workspace_id, created_request.id, caller_id, 'comment', clean_message
    );
  end if;
  return jsonb_build_object(
    'requestId', created_request.id,
    'status', created_request.status,
    'postId', created_request.post_id,
    'postRevision', created_request.post_revision,
    'postStatus', 'pending_approval'
  );
end;
$$;

create function public.approve_post(
  p_approval_request_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.workspace_role;
  request_row public.approval_requests%rowtype;
  target_post public.posts%rowtype;
  clean_message text := nullif(btrim(coalesce(p_message, '')), '');
  next_post_status public.post_status;
begin
  if caller_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into request_row from public.approval_requests
  where id = p_approval_request_id for update;
  if not found then raise exception 'APPROVAL_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into target_post from public.posts where id = request_row.post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  caller_role := private.approval_member_role(request_row.workspace_id, caller_id);
  if caller_role is null or caller_role not in ('owner','administrator','approver') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if caller_id <> request_row.assigned_approver_id
     and caller_role not in ('owner','administrator') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if caller_id = request_row.requested_by or caller_id = target_post.created_by then
    raise exception 'SELF_APPROVAL_DENIED' using errcode = '42501';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'APPROVAL_ALREADY_RESOLVED' using errcode = '55000';
  end if;
  if target_post.revision <> request_row.post_revision
     or target_post.status <> 'pending_approval' then
    raise exception 'APPROVAL_REQUEST_STALE' using errcode = '40001';
  end if;
  if clean_message is not null and char_length(clean_message) > 5000 then
    raise exception 'MESSAGE_TOO_LONG' using errcode = '22023';
  end if;
  next_post_status := case
    when target_post.scheduled_at is not null
      and target_post.scheduled_at > now()
      and exists(select 1 from public.post_destinations where post_id = target_post.id)
    then 'scheduled'::public.post_status
    else 'approved'::public.post_status
  end;
  update public.approval_requests
  set status = 'approved', resolved_by = caller_id, resolved_at = now(),
      resolution_message = clean_message
  where id = request_row.id returning * into request_row;
  perform set_config('postflow.post_rpc_write', 'allowed', true);
  update public.posts set status = next_post_status where id = target_post.id;
  perform set_config('postflow.post_rpc_write', '', true);
  if clean_message is not null then
    insert into public.approval_comments(
      workspace_id, approval_request_id, author_id, comment_type, body
    ) values (request_row.workspace_id, request_row.id, caller_id, 'comment', clean_message);
  end if;
  perform private.append_approval_event(
    request_row, 'approved', caller_id, 'pending', 'approved', clean_message,
    jsonb_build_object('postStatus', next_post_status)
  );
  return jsonb_build_object(
    'requestId', request_row.id, 'requestStatus', request_row.status,
    'postId', target_post.id, 'postRevision', target_post.revision,
    'postStatus', next_post_status
  );
end;
$$;

create function private.resolve_approval_request(
  p_approval_request_id uuid,
  p_message text,
  p_new_status public.approval_request_status,
  p_event_type public.approval_event_type,
  p_comment_type public.approval_comment_type
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.workspace_role;
  request_row public.approval_requests%rowtype;
  target_post public.posts%rowtype;
  clean_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if caller_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_new_status not in ('changes_requested','rejected') then
    raise exception 'APPROVAL_RESOLUTION_INVALID' using errcode = '22023';
  end if;
  if clean_message is null then raise exception 'APPROVAL_MESSAGE_REQUIRED' using errcode = '22023'; end if;
  if char_length(clean_message) > 5000 then raise exception 'MESSAGE_TOO_LONG' using errcode = '22023'; end if;
  select * into request_row from public.approval_requests
  where id = p_approval_request_id for update;
  if not found then raise exception 'APPROVAL_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into target_post from public.posts where id = request_row.post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  caller_role := private.approval_member_role(request_row.workspace_id, caller_id);
  if caller_role is null or caller_role not in ('owner','administrator','approver') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if caller_id <> request_row.assigned_approver_id
     and caller_role not in ('owner','administrator') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if caller_id = request_row.requested_by or caller_id = target_post.created_by then
    raise exception 'SELF_APPROVAL_DENIED' using errcode = '42501';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'APPROVAL_ALREADY_RESOLVED' using errcode = '55000';
  end if;
  if target_post.revision <> request_row.post_revision
     or target_post.status <> 'pending_approval' then
    raise exception 'APPROVAL_REQUEST_STALE' using errcode = '40001';
  end if;
  update public.approval_requests
  set status = p_new_status, resolved_by = caller_id, resolved_at = now(),
      resolution_message = clean_message
  where id = request_row.id returning * into request_row;
  perform set_config('postflow.post_rpc_write', 'allowed', true);
  update public.posts set status = 'draft' where id = target_post.id;
  perform set_config('postflow.post_rpc_write', '', true);
  insert into public.approval_comments(
    workspace_id, approval_request_id, author_id, comment_type, body
  ) values (
    request_row.workspace_id, request_row.id, caller_id, p_comment_type, clean_message
  );
  perform private.append_approval_event(
    request_row, p_event_type, caller_id, 'pending', p_new_status, clean_message
  );
  return jsonb_build_object(
    'requestId', request_row.id, 'requestStatus', request_row.status,
    'postId', target_post.id, 'postRevision', target_post.revision,
    'postStatus', 'draft'
  );
end;
$$;

create function public.request_post_changes(
  p_approval_request_id uuid,
  p_message text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.resolve_approval_request(
    p_approval_request_id, p_message, 'changes_requested',
    'changes_requested', 'change_instruction'
  );
$$;

create function public.reject_post(
  p_approval_request_id uuid,
  p_message text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select private.resolve_approval_request(
    p_approval_request_id, p_message, 'rejected', 'rejected', 'rejection_reason'
  );
$$;

create function public.withdraw_approval_request(
  p_approval_request_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.workspace_role;
  request_row public.approval_requests%rowtype;
  target_post public.posts%rowtype;
  clean_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if caller_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into request_row from public.approval_requests
  where id = p_approval_request_id for update;
  if not found then raise exception 'APPROVAL_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  caller_role := private.approval_member_role(request_row.workspace_id, caller_id);
  if caller_role is null then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if caller_id <> request_row.requested_by and caller_role not in ('owner','administrator') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'APPROVAL_ALREADY_RESOLVED' using errcode = '55000';
  end if;
  select * into target_post from public.posts where id = request_row.post_id for update;
  update public.approval_requests
  set status = 'withdrawn', resolved_by = caller_id, resolved_at = now(),
      withdrawn_at = now(), resolution_message = clean_message
  where id = request_row.id returning * into request_row;
  if target_post.id is not null and target_post.status = 'pending_approval'
     and target_post.revision = request_row.post_revision then
    perform set_config('postflow.post_rpc_write', 'allowed', true);
    update public.posts set status = 'draft' where id = target_post.id;
    perform set_config('postflow.post_rpc_write', '', true);
  end if;
  perform private.append_approval_event(
    request_row, 'withdrawn', caller_id, 'pending', 'withdrawn', clean_message
  );
  return jsonb_build_object(
    'requestId', request_row.id, 'requestStatus', request_row.status,
    'postId', request_row.post_id, 'postRevision', request_row.post_revision,
    'postStatus', 'draft'
  );
end;
$$;

create function public.reassign_approval_request(
  p_approval_request_id uuid,
  p_new_approver_id uuid,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.workspace_role;
  request_row public.approval_requests%rowtype;
  target_post public.posts%rowtype;
  previous_approver uuid;
  clean_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if caller_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into request_row from public.approval_requests
  where id = p_approval_request_id for update;
  if not found then raise exception 'APPROVAL_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  caller_role := private.approval_member_role(request_row.workspace_id, caller_id);
  if caller_role is null then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if caller_id <> request_row.requested_by and caller_role not in ('owner','administrator') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'APPROVAL_ALREADY_RESOLVED' using errcode = '55000';
  end if;
  select * into target_post from public.posts where id = request_row.post_id;
  perform private.assert_eligible_approver(
    request_row.workspace_id, p_new_approver_id,
    request_row.requested_by, target_post.created_by
  );
  previous_approver := request_row.assigned_approver_id;
  update public.approval_requests set assigned_approver_id = p_new_approver_id
  where id = request_row.id returning * into request_row;
  perform private.append_approval_event(
    request_row, 'reassigned', caller_id, 'pending', 'pending', clean_message,
    jsonb_build_object(
      'previousApproverId', previous_approver,
      'assignedApproverId', p_new_approver_id
    )
  );
  return jsonb_build_object(
    'requestId', request_row.id, 'requestStatus', request_row.status,
    'postId', request_row.post_id, 'postRevision', request_row.post_revision,
    'assignedApproverId', request_row.assigned_approver_id
  );
end;
$$;

create function public.add_approval_comment(
  p_approval_request_id uuid,
  p_body text
)
returns public.approval_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  request_row public.approval_requests%rowtype;
  clean_body text := nullif(btrim(coalesce(p_body, '')), '');
  created_comment public.approval_comments%rowtype;
begin
  if caller_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if clean_body is null then raise exception 'COMMENT_EMPTY' using errcode = '22023'; end if;
  if char_length(clean_body) > 5000 then raise exception 'COMMENT_TOO_LONG' using errcode = '22023'; end if;
  select * into request_row from public.approval_requests
  where id = p_approval_request_id;
  if not found then raise exception 'APPROVAL_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.is_workspace_member(request_row.workspace_id) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  insert into public.approval_comments(
    workspace_id, approval_request_id, author_id, comment_type, body
  ) values (
    request_row.workspace_id, request_row.id, caller_id, 'comment', clean_body
  ) returning * into created_comment;
  perform private.append_approval_event(
    request_row, 'comment_added', caller_id, request_row.status,
    request_row.status, null, jsonb_build_object('commentId', created_comment.id)
  );
  return created_comment;
end;
$$;

create function public.change_approval_deadline(
  p_approval_request_id uuid,
  p_due_at timestamptz,
  p_message text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  caller_role public.workspace_role;
  request_row public.approval_requests%rowtype;
  previous_due_at timestamptz;
  clean_message text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if caller_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_due_at is not null and p_due_at <= now() then
    raise exception 'DEADLINE_IN_PAST' using errcode = '22023';
  end if;
  select * into request_row from public.approval_requests
  where id = p_approval_request_id for update;
  if not found then raise exception 'APPROVAL_REQUEST_NOT_FOUND' using errcode = 'P0002'; end if;
  caller_role := private.approval_member_role(request_row.workspace_id, caller_id);
  if caller_role is null then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if caller_id not in (request_row.requested_by, request_row.assigned_approver_id)
     and caller_role not in ('owner','administrator') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if request_row.status <> 'pending' then
    raise exception 'APPROVAL_ALREADY_RESOLVED' using errcode = '55000';
  end if;
  previous_due_at := request_row.due_at;
  update public.approval_requests set due_at = p_due_at
  where id = request_row.id returning * into request_row;
  perform private.append_approval_event(
    request_row, 'deadline_changed', caller_id, 'pending', 'pending', clean_message,
    jsonb_build_object('previousDueAt', previous_due_at, 'dueAt', p_due_at)
  );
  return jsonb_build_object(
    'requestId', request_row.id, 'requestStatus', request_row.status,
    'postId', request_row.post_id, 'postRevision', request_row.post_revision,
    'dueAt', request_row.due_at
  );
end;
$$;

create function private.prevent_approval_history_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists(select 1 from public.approval_requests where post_id = old.id) then
    raise exception 'This post has approval history and cannot be permanently deleted. Cancel or archive it instead.'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

create trigger posts_preserve_approval_history
before delete on public.posts
for each row execute function private.prevent_approval_history_delete();

create or replace function public.delete_post(p_post_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare target public.posts%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into target from public.posts where id = p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  if exists(select 1 from public.approval_requests where post_id = target.id) then
    raise exception 'This post has approval history and cannot be permanently deleted. Cancel or archive it instead.'
      using errcode = '55000';
  end if;
  if exists(select 1 from public.publishing_jobs where post_id = target.id) then
    raise exception 'POST_HAS_PUBLISHING_HISTORY' using errcode = '55000';
  end if;
  if not private.can_delete_post(target.id) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  perform set_config('postflow.post_rpc_write', 'allowed', true);
  delete from public.posts where id = target.id;
  perform set_config('postflow.post_rpc_write', '', true);
  return target.id;
end;
$$;

create or replace function public.delete_posts(p_post_ids uuid[])
returns uuid[]
language plpgsql
security invoker
set search_path = ''
as $$
declare target_id uuid; deleted_ids uuid[] := array[]::uuid[];
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if cardinality(coalesce(p_post_ids, array[]::uuid[])) between 1 and 100 is not true then
    raise exception 'POST_SELECTION_INVALID' using errcode = '22023';
  end if;
  if array_position(p_post_ids, null) is not null then
    raise exception 'POST_SELECTION_INVALID' using errcode = '22023';
  end if;
  for target_id in select distinct unnest(p_post_ids) order by 1 loop
    deleted_ids := array_append(deleted_ids, public.delete_post(target_id));
  end loop;
  return deleted_ids;
end;
$$;

alter table public.approval_requests enable row level security;
alter table public.approval_comments enable row level security;
alter table public.approval_events enable row level security;

create policy approval_requests_read_workspace_members
on public.approval_requests for select to authenticated
using(private.is_workspace_member(workspace_id));

create policy approval_comments_read_workspace_members
on public.approval_comments for select to authenticated
using(private.is_workspace_member(workspace_id));

create policy approval_events_read_workspace_members
on public.approval_events for select to authenticated
using(private.is_workspace_member(workspace_id));

revoke all on table public.approval_requests, public.approval_comments,
  public.approval_events from public, anon, authenticated;
grant select on table public.approval_requests, public.approval_comments,
  public.approval_events to authenticated;
grant select, insert, update, delete on table public.approval_requests,
  public.approval_comments, public.approval_events to service_role;

revoke all on function private.approval_member_role(uuid,uuid),
  private.is_approval_capable(uuid,uuid),
  private.assert_eligible_approver(uuid,uuid,uuid,uuid),
  private.append_approval_event(public.approval_requests,public.approval_event_type,uuid,public.approval_request_status,public.approval_request_status,text,jsonb),
  private.invalidate_post_approval_for_edit(public.posts,uuid),
  private.has_valid_post_approval(uuid),
  private.resolve_approval_request(uuid,text,public.approval_request_status,public.approval_event_type,public.approval_comment_type),
  private.prevent_approval_history_delete()
from public, anon, authenticated;

revoke all on function public.submit_post_for_approval(uuid,bigint,uuid,text,timestamptz),
  public.approve_post(uuid,text),
  public.request_post_changes(uuid,text),
  public.reject_post(uuid,text),
  public.withdraw_approval_request(uuid,text),
  public.reassign_approval_request(uuid,uuid,text),
  public.add_approval_comment(uuid,text),
  public.change_approval_deadline(uuid,timestamptz,text)
from public, anon, authenticated;

grant execute on function public.submit_post_for_approval(uuid,bigint,uuid,text,timestamptz),
  public.approve_post(uuid,text),
  public.request_post_changes(uuid,text),
  public.reject_post(uuid,text),
  public.withdraw_approval_request(uuid,text),
  public.reassign_approval_request(uuid,uuid,text),
  public.add_approval_comment(uuid,text),
  public.change_approval_deadline(uuid,timestamptz,text)
to authenticated;

revoke all on function public.update_post(uuid,bigint,text,public.post_status,timestamptz,text,boolean,uuid,jsonb,uuid[],uuid[]),
  public.create_post(uuid,text,public.post_status,timestamptz,text,boolean,uuid,jsonb,uuid[],uuid[]),
  public.delete_post(uuid), public.delete_posts(uuid[])
from public, anon, authenticated;
grant execute on function public.update_post(uuid,bigint,text,public.post_status,timestamptz,text,boolean,uuid,jsonb,uuid[],uuid[]),
  public.create_post(uuid,text,public.post_status,timestamptz,text,boolean,uuid,jsonb,uuid[],uuid[]),
  public.delete_post(uuid), public.delete_posts(uuid[])
to authenticated;

commit;
