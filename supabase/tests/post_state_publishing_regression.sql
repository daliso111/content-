-- PostFlow post-state regression coverage.
-- Run only against a disposable/local database. The transaction always rolls back.

begin;

create temporary table post_state_test_ids(
  scenario text primary key,
  post_id uuid not null
) on commit drop;
grant select, insert on post_state_test_ids to authenticated;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000007001',
  'authenticated', 'authenticated', 'post-state-regression@example.test', '', now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.social_accounts(
  id, workspace_id, platform, account_type, platform_account_id, account_name,
  connection_status, connected_by, connected_at, granted_scopes
)
select
  '00000000-0000-0000-0000-000000007002', membership.workspace_id,
  'facebook', 'facebook_page', 'post-state-test-page', 'Post state test page',
  'connected', membership.user_id, now(),
  array['pages_show_list','pages_read_engagement','pages_manage_posts']::text[]
from public.workspace_members as membership
where membership.user_id = '00000000-0000-0000-0000-000000007001'
limit 1;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '00000000-0000-0000-0000-000000007001',
    'role', 'authenticated'
  )::text,
  true
);

do $$
declare
  workspace_id uuid;
  destination_id uuid := '00000000-0000-0000-0000-000000007002';
  draft_post public.posts%rowtype;
  scheduled_post public.posts%rowtype;
  publish_post public.posts%rowtype;
  failed_post public.posts%rowtype;
  cancelled_post public.posts%rowtype;
  historical_post public.posts%rowtype;
  post_platforms jsonb := '[{
    "platform":"facebook",
    "platform_caption":null,
    "platform_title":null,
    "platform_settings":{}
  }]'::jsonb;
begin
  select membership.workspace_id into workspace_id
  from public.workspace_members as membership
  where membership.user_id = auth.uid()
  limit 1;

  -- New Save Draft persists content without creating any queue history.
  draft_post := public.create_post(
    workspace_id, 'New draft', 'draft', null, 'UTC', false, null,
    post_platforms, array[]::uuid[], array[destination_id]
  );
  if draft_post.status <> 'draft'
     or exists(select 1 from public.publishing_jobs where post_id = draft_post.id)
     or exists(
       select 1 from public.publishing_attempts as attempt
       join public.publishing_jobs as job on job.id = attempt.publishing_job_id
       where job.post_id = draft_post.id
     ) then
    raise exception 'New Save Draft enqueued publishing work';
  end if;

  -- Editing an existing draft remains a content-only write.
  draft_post := public.update_post(
    draft_post.id, draft_post.revision, 'Edited draft', 'draft', null, 'UTC',
    false, null, post_platforms, array[]::uuid[], array[destination_id]
  );
  if draft_post.status <> 'draft'
     or draft_post.caption <> 'Edited draft'
     or exists(select 1 from public.publishing_jobs where post_id = draft_post.id)
     or exists(
       select 1 from public.publishing_attempts as attempt
       join public.publishing_jobs as job on job.id = attempt.publishing_job_id
       where job.post_id = draft_post.id
     ) then
    raise exception 'Existing Save Draft enqueued publishing work';
  end if;

  -- Scheduling persists the durable plan; the cron enqueue remains due-time only.
  scheduled_post := public.create_post(
    workspace_id, 'Scheduled post', 'scheduled', now() + interval '1 hour',
    'UTC', false, null, post_platforms, array[]::uuid[], array[destination_id]
  );
  if scheduled_post.status <> 'scheduled'
     or scheduled_post.scheduled_at is null
     or exists(select 1 from public.publishing_jobs where post_id = scheduled_post.id) then
    raise exception 'Schedule Post did not persist the expected pre-enqueue plan';
  end if;

  -- Publish Now is the explicit path that creates a current-revision job.
  publish_post := public.create_post(
    workspace_id, 'Publish now', 'draft', null, 'UTC', false, null,
    post_platforms, array[]::uuid[], array[destination_id]
  );
  perform public.request_publish_now(publish_post.id, publish_post.revision);
  if (select status from public.posts where id = publish_post.id) <> 'publishing'
     or (select count(*) from public.publishing_jobs where post_id = publish_post.id) <> 1 then
    raise exception 'Publish Now did not create an active publishing job';
  end if;
  insert into post_state_test_ids values ('succeeded', publish_post.id);

  failed_post := public.create_post(
    workspace_id, 'Failed publish', 'draft', null, 'UTC', false, null,
    post_platforms, array[]::uuid[], array[destination_id]
  );
  perform public.request_publish_now(failed_post.id, failed_post.revision);
  insert into post_state_test_ids values ('failed', failed_post.id);

  cancelled_post := public.create_post(
    workspace_id, 'Cancelled publish', 'draft', null, 'UTC', false, null,
    post_platforms, array[]::uuid[], array[destination_id]
  );
  perform public.request_publish_now(cancelled_post.id, cancelled_post.revision);
  insert into post_state_test_ids values ('cancelled', cancelled_post.id);

  historical_post := public.create_post(
    workspace_id, 'Historical publish', 'draft', null, 'UTC', false, null,
    post_platforms, array[]::uuid[], array[destination_id]
  );
  perform public.request_publish_now(historical_post.id, historical_post.revision);
  insert into post_state_test_ids values ('historical', historical_post.id);
end;
$$;

reset role;

do $$
declare
  target_post_id uuid;
  visible_status public.post_status;
begin
  select post_id into target_post_id from post_state_test_ids where scenario = 'succeeded';
  update public.publishing_jobs
  set status = 'succeeded', completed_at = now()
  where post_id = target_post_id;
  visible_status := private.recalculate_post_publishing_status(target_post_id);
  if visible_status <> 'published' then
    raise exception 'Succeeded current jobs must derive Published';
  end if;

  select post_id into target_post_id from post_state_test_ids where scenario = 'failed';
  update public.publishing_jobs
  set status = 'failed', completed_at = now()
  where post_id = target_post_id;
  visible_status := private.recalculate_post_publishing_status(target_post_id);
  if visible_status <> 'failed' then
    raise exception 'Failed current jobs must derive Failed';
  end if;

  select post_id into target_post_id from post_state_test_ids where scenario = 'cancelled';
  update public.publishing_jobs
  set status = 'cancelled', completed_at = now()
  where post_id = target_post_id;
  visible_status := private.recalculate_post_publishing_status(target_post_id);
  if visible_status <> 'cancelled' then
    raise exception 'Cancelled current jobs must derive Cancelled';
  end if;

  -- A queued job from an older revision is history, not a current operation.
  select post_id into target_post_id from post_state_test_ids where scenario = 'historical';
  perform set_config('postflow.post_rpc_write', 'allowed', true);
  update public.posts
  set revision = revision + 1, status = 'draft', failure_message = null
  where id = target_post_id;
  perform set_config('postflow.post_rpc_write', '', true);

  visible_status := private.recalculate_post_publishing_status(target_post_id);
  if visible_status <> 'draft' then
    raise exception 'Historical active jobs must not derive Publishing';
  end if;

  update public.publishing_jobs set status = 'succeeded' where post_id = target_post_id;
  if private.recalculate_post_publishing_status(target_post_id) <> 'draft' then
    raise exception 'Historical succeeded jobs must preserve Draft';
  end if;
  update public.publishing_jobs set status = 'failed' where post_id = target_post_id;
  if private.recalculate_post_publishing_status(target_post_id) <> 'draft' then
    raise exception 'Historical failed jobs must preserve Draft';
  end if;
  update public.publishing_jobs set status = 'cancelled' where post_id = target_post_id;
  if private.recalculate_post_publishing_status(target_post_id) <> 'draft' then
    raise exception 'Historical cancelled jobs must preserve Draft';
  end if;
end;
$$;

rollback;
