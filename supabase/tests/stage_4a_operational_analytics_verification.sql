-- PostFlow Stage 4A operational analytics verification.
-- Run against a non-production database after applying all migrations.
-- The behavior fixture is isolated in a transaction and always rolls back.

-- 1. Structural security and performance checks. This block raises on failure.
do $$
declare
  target regprocedure := 'public.get_operational_analytics(uuid,timestamptz,timestamptz,public.social_platform,text)'::regprocedure;
  is_security_definer boolean;
  function_config text[];
begin
  select procedure_row.prosecdef, procedure_row.proconfig
  into is_security_definer, function_config
  from pg_catalog.pg_proc as procedure_row
  where procedure_row.oid = target;

  if is_security_definer is not true then
    raise exception 'Stage 4A RPC must be SECURITY DEFINER';
  end if;
  if function_config is null or not ('search_path=""' = any(function_config)) then
    raise exception 'Stage 4A RPC must pin an empty search_path';
  end if;
  if pg_catalog.has_function_privilege('anon', target, 'EXECUTE') then
    raise exception 'anon must not execute Stage 4A RPC';
  end if;
  if not pg_catalog.has_function_privilege('authenticated', target, 'EXECUTE') then
    raise exception 'authenticated must execute Stage 4A RPC';
  end if;
  if pg_catalog.to_regclass('public.posts_workspace_created_at_idx') is null
     or pg_catalog.to_regclass('public.publishing_jobs_workspace_completed_at_idx') is null
     or pg_catalog.to_regclass('public.publishing_jobs_workspace_platform_completed_at_idx') is null
     or pg_catalog.to_regclass('public.publishing_attempts_workspace_started_at_idx') is null then
    raise exception 'One or more Stage 4A indexes are missing';
  end if;
end;
$$;

-- 2. Rollback-only behavior checks with mixed Facebook/Instagram outcomes.
begin;

create temporary table stage_4a_context on commit drop as
select
  member.user_id,
  member.workspace_id,
  pg_catalog.gen_random_uuid() as foreign_workspace_id,
  pg_catalog.gen_random_uuid() as previous_post_id,
  pg_catalog.gen_random_uuid() as facebook_success_post_id,
  pg_catalog.gen_random_uuid() as instagram_failure_post_id,
  pg_catalog.gen_random_uuid() as facebook_reconciliation_post_id,
  pg_catalog.gen_random_uuid() as instagram_success_post_id,
  pg_catalog.gen_random_uuid() as facebook_active_post_id,
  pg_catalog.gen_random_uuid() as facebook_cancelled_post_id,
  pg_catalog.gen_random_uuid() as facebook_account_id,
  pg_catalog.gen_random_uuid() as instagram_account_id,
  pg_catalog.gen_random_uuid() as media_asset_id,
  pg_catalog.gen_random_uuid() as graphic_asset_id,
  pg_catalog.gen_random_uuid() as facebook_success_job_id,
  pg_catalog.gen_random_uuid() as instagram_failure_job_id,
  pg_catalog.gen_random_uuid() as facebook_reconciliation_job_id,
  pg_catalog.gen_random_uuid() as instagram_success_job_id,
  pg_catalog.gen_random_uuid() as facebook_active_job_id,
  pg_catalog.gen_random_uuid() as facebook_cancelled_job_id
from public.workspace_members as member
where member.status = 'active'
order by member.created_at
limit 1;

do $$
declare
  context_row pg_temp.stage_4a_context%rowtype;
  previous_platform_id uuid := pg_catalog.gen_random_uuid();
  facebook_success_platform_id uuid := pg_catalog.gen_random_uuid();
  instagram_failure_platform_id uuid := pg_catalog.gen_random_uuid();
  facebook_reconciliation_platform_id uuid := pg_catalog.gen_random_uuid();
  instagram_success_platform_id uuid := pg_catalog.gen_random_uuid();
  facebook_active_platform_id uuid := pg_catalog.gen_random_uuid();
  facebook_cancelled_platform_id uuid := pg_catalog.gen_random_uuid();
  previous_destination_id uuid := pg_catalog.gen_random_uuid();
  facebook_success_destination_id uuid := pg_catalog.gen_random_uuid();
  instagram_failure_destination_id uuid := pg_catalog.gen_random_uuid();
  facebook_reconciliation_destination_id uuid := pg_catalog.gen_random_uuid();
  instagram_success_destination_id uuid := pg_catalog.gen_random_uuid();
  facebook_active_destination_id uuid := pg_catalog.gen_random_uuid();
  facebook_cancelled_destination_id uuid := pg_catalog.gen_random_uuid();
begin
  select * into context_row from pg_temp.stage_4a_context;
  if context_row.user_id is null then
    raise exception 'A disposable active workspace member is required for Stage 4A verification';
  end if;

  insert into public.workspaces(id, name, slug, timezone)
  values (
    context_row.foreign_workspace_id,
    'Stage 4A foreign workspace',
    'stage-4a-foreign-' || context_row.foreign_workspace_id::text,
    'Africa/Lusaka'
  );

  perform pg_catalog.set_config('postflow.post_rpc_write', 'allowed', true);

  insert into public.posts(id, workspace_id, created_by, caption, status, scheduled_at, timezone, created_at)
  values
    (context_row.previous_post_id, context_row.workspace_id, context_row.user_id, 'Previous baseline', 'draft', null, 'Africa/Lusaka', '2099-02-25 12:00+00'),
    (context_row.facebook_success_post_id, context_row.workspace_id, context_row.user_id, 'Facebook scheduled success', 'published', '2099-03-02 10:00+00', 'Africa/Lusaka', '2099-03-02 08:00+00'),
    (context_row.instagram_failure_post_id, context_row.workspace_id, context_row.user_id, 'Instagram failure', 'failed', null, 'Africa/Lusaka', '2099-03-03 08:00+00'),
    (context_row.facebook_reconciliation_post_id, context_row.workspace_id, context_row.user_id, 'Facebook needs review', 'publishing', null, 'Africa/Lusaka', '2099-03-04 08:00+00'),
    (context_row.instagram_success_post_id, context_row.workspace_id, context_row.user_id, 'Instagram publish now success', 'published', null, 'Africa/Lusaka', '2099-03-05 08:00+00'),
    (context_row.facebook_active_post_id, context_row.workspace_id, context_row.user_id, 'Facebook active', 'scheduled', '2099-03-07 10:00+00', 'Africa/Lusaka', '2099-03-06 08:00+00'),
    (context_row.facebook_cancelled_post_id, context_row.workspace_id, context_row.user_id, 'Facebook cancelled', 'cancelled', null, 'Africa/Lusaka', '2099-03-06 09:00+00');

  insert into public.post_platforms(id, workspace_id, post_id, platform)
  values
    (previous_platform_id, context_row.workspace_id, context_row.previous_post_id, 'facebook'),
    (facebook_success_platform_id, context_row.workspace_id, context_row.facebook_success_post_id, 'facebook'),
    (instagram_failure_platform_id, context_row.workspace_id, context_row.instagram_failure_post_id, 'instagram'),
    (facebook_reconciliation_platform_id, context_row.workspace_id, context_row.facebook_reconciliation_post_id, 'facebook'),
    (instagram_success_platform_id, context_row.workspace_id, context_row.instagram_success_post_id, 'instagram'),
    (facebook_active_platform_id, context_row.workspace_id, context_row.facebook_active_post_id, 'facebook'),
    (facebook_cancelled_platform_id, context_row.workspace_id, context_row.facebook_cancelled_post_id, 'facebook');

  insert into public.social_accounts(
    id, workspace_id, platform, account_type, platform_account_id, account_name,
    username, connection_status, connected_by, connected_at
  ) values
    (context_row.facebook_account_id, context_row.workspace_id, 'facebook', 'facebook_page', 'stage-4a-facebook-' || context_row.facebook_account_id, 'Stage 4A Facebook', 'stage4afb', 'connected', context_row.user_id, now()),
    (context_row.instagram_account_id, context_row.workspace_id, 'instagram', 'instagram_business', 'stage-4a-instagram-' || context_row.instagram_account_id, 'Stage 4A Instagram', 'stage4aig', 'connected', context_row.user_id, now());

  insert into public.post_destinations(id, workspace_id, post_id, post_platform_id, social_account_id)
  values
    (previous_destination_id, context_row.workspace_id, context_row.previous_post_id, previous_platform_id, context_row.facebook_account_id),
    (facebook_success_destination_id, context_row.workspace_id, context_row.facebook_success_post_id, facebook_success_platform_id, context_row.facebook_account_id),
    (instagram_failure_destination_id, context_row.workspace_id, context_row.instagram_failure_post_id, instagram_failure_platform_id, context_row.instagram_account_id),
    (facebook_reconciliation_destination_id, context_row.workspace_id, context_row.facebook_reconciliation_post_id, facebook_reconciliation_platform_id, context_row.facebook_account_id),
    (instagram_success_destination_id, context_row.workspace_id, context_row.instagram_success_post_id, instagram_success_platform_id, context_row.instagram_account_id),
    (facebook_active_destination_id, context_row.workspace_id, context_row.facebook_active_post_id, facebook_active_platform_id, context_row.facebook_account_id),
    (facebook_cancelled_destination_id, context_row.workspace_id, context_row.facebook_cancelled_post_id, facebook_cancelled_platform_id, context_row.facebook_account_id);

  insert into public.media_assets(id, workspace_id, uploaded_by, file_name, media_type, storage_path)
  values
    (context_row.media_asset_id, context_row.workspace_id, context_row.user_id, 'stage-4a.jpg', 'image', context_row.workspace_id::text || '/stage-4a.jpg'),
    (context_row.graphic_asset_id, context_row.workspace_id, context_row.user_id, 'stage-4a-graphic.png', 'graphic', context_row.workspace_id::text || '/stage-4a-graphic.png');
  insert into public.post_media(workspace_id, post_id, media_asset_id)
  values
    (context_row.workspace_id, context_row.facebook_success_post_id, context_row.media_asset_id),
    (context_row.workspace_id, context_row.facebook_success_post_id, context_row.graphic_asset_id);

  insert into public.publishing_jobs(
    id, workspace_id, post_id, post_revision, post_destination_id, social_account_id,
    platform, operation, status, scheduled_for, attempt_count, payload_snapshot,
    completed_at, ambiguous_result
  ) values
    (context_row.facebook_success_job_id, context_row.workspace_id, context_row.facebook_success_post_id, 1, facebook_success_destination_id, context_row.facebook_account_id, 'facebook', 'facebook_image', 'succeeded', '2099-03-02 10:00+00', 1, '{}', '2099-03-02 10:04+00', false),
    (context_row.instagram_failure_job_id, context_row.workspace_id, context_row.instagram_failure_post_id, 1, instagram_failure_destination_id, context_row.instagram_account_id, 'instagram', 'instagram_image', 'failed', '2099-03-03 10:00+00', 2, '{}', '2099-03-03 10:10+00', false),
    (context_row.facebook_reconciliation_job_id, context_row.workspace_id, context_row.facebook_reconciliation_post_id, 1, facebook_reconciliation_destination_id, context_row.facebook_account_id, 'facebook', 'facebook_text', 'reconciliation_required', '2099-03-04 10:00+00', 1, '{}', '2099-03-04 10:06+00', true),
    (context_row.instagram_success_job_id, context_row.workspace_id, context_row.instagram_success_post_id, 1, instagram_success_destination_id, context_row.instagram_account_id, 'instagram', 'instagram_image', 'succeeded', '2099-03-05 10:00+00', 1, '{}', '2099-03-05 10:02+00', false),
    (context_row.facebook_active_job_id, context_row.workspace_id, context_row.facebook_active_post_id, 1, facebook_active_destination_id, context_row.facebook_account_id, 'facebook', 'facebook_text', 'queued', '2099-03-07 10:00+00', 0, '{}', null, false),
    (context_row.facebook_cancelled_job_id, context_row.workspace_id, context_row.facebook_cancelled_post_id, 1, facebook_cancelled_destination_id, context_row.facebook_account_id, 'facebook', 'facebook_text', 'cancelled', '2099-03-06 10:00+00', 0, '{}', '2099-03-06 10:01+00', false);

  insert into public.publishing_attempts(
    workspace_id, publishing_job_id, attempt_number, phase, outcome, started_at, finished_at
  ) values (
    context_row.workspace_id, context_row.instagram_failure_job_id, 1,
    'publish', 'permanent_failure', '2099-03-03 10:09+00', '2099-03-03 10:10+00'
  );

  perform pg_catalog.set_config('postflow.post_rpc_write', '', true);
end;
$$;

grant select on table pg_temp.stage_4a_context to authenticated;

-- Authentication must be enforced independently of EXECUTE privilege.
select pg_catalog.set_config('request.jwt.claim.sub', '', true);
do $$
declare
  test_workspace_id uuid;
begin
  select workspace_id into test_workspace_id from pg_temp.stage_4a_context;
  begin
    perform public.get_operational_analytics(
      test_workspace_id, '2099-03-01 22:00+00', '2099-03-08 22:00+00', null, 'Africa/Lusaka'
    );
    raise exception 'Unauthenticated analytics call unexpectedly succeeded';
  exception when insufficient_privilege then
    if sqlerrm <> 'ANALYTICS_AUTH_REQUIRED' then raise; end if;
  end;
end;
$$;

select pg_catalog.set_config('request.jwt.claim.sub', user_id::text, true)
from pg_temp.stage_4a_context;
select pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  context_row pg_temp.stage_4a_context%rowtype;
  result jsonb;
  filtered jsonb;
  empty_result jsonb;
begin
  select * into context_row from pg_temp.stage_4a_context;

  result := public.get_operational_analytics(
    context_row.workspace_id,
    '2099-03-01 22:00+00',
    '2099-03-08 22:00+00',
    null,
    'Africa/Lusaka'
  );

  if (result #>> '{posts,current}')::integer <> 6
     or (result #>> '{posts,previous}')::integer <> 1 then
    raise exception 'Current/prior post aggregation failed: %', result->'posts';
  end if;
  if (result #>> '{publishing,successful}')::integer <> 2
     or (result #>> '{publishing,failed}')::integer <> 1
     or (result #>> '{publishing,reconciliation_required}')::integer <> 1
     or (result #>> '{publishing,active}')::integer <> 1
     or (result #>> '{publishing,cancelled}')::integer <> 1 then
    raise exception 'Publishing status aggregation failed: %', result->'publishing';
  end if;
  if (result #>> '{publishing,retry_count}')::integer <> 1
     or (result #>> '{publishing,failure_attempt_count}')::integer <> 1 then
    raise exception 'Retry/failure-attempt aggregation failed: %', result->'publishing';
  end if;
  if (result #>> '{publishing,scheduled_succeeded_count}')::integer <> 1
     or (result #>> '{publishing,on_time_count}')::integer <> 1
     or (result #>> '{publishing,consistency_rate}')::numeric <> 100.0 then
    raise exception 'Scheduled consistency or Publish Now exclusion failed: %', result->'publishing';
  end if;
  if (result #>> '{publishing,success_rate}')::numeric <> 66.7 then
    raise exception 'Success-rate denominator failed: %', result->'publishing';
  end if;
  if jsonb_array_length(result->'platform_results') <> 2
     or jsonb_array_length(result->'content_types') <> 3
     or jsonb_array_length(result->'weekday_activity') <> 7
     or jsonb_array_length(result->'recent_results') <> 4 then
    raise exception 'One or more result arrays have the wrong shape: %', result;
  end if;
  if (
    select (item->>'posts')::integer
    from jsonb_array_elements(result->'content_types') as item
    where item->>'type' = 'image'
  ) <> 1 or (
    select (item->>'posts')::integer
    from jsonb_array_elements(result->'content_types') as item
    where item->>'type' = 'graphic'
  ) <> 1 or (
    select (item->>'posts')::integer
    from jsonb_array_elements(result->'content_types') as item
    where item->>'type' = 'text'
  ) <> 5 then
    raise exception 'Distinct-post-per-media-type counting failed: %', result->'content_types';
  end if;
  if (
    select (item->>'succeeded')::integer
    from jsonb_array_elements(result->'platform_results') as item
    where item->>'platform' = 'facebook'
  ) <> 1 or (
    select (item->>'reconciliation_required')::integer
    from jsonb_array_elements(result->'platform_results') as item
    where item->>'platform' = 'facebook'
  ) <> 1 or (
    select (item->>'failed')::integer
    from jsonb_array_elements(result->'platform_results') as item
    where item->>'platform' = 'instagram'
  ) <> 1 then
    raise exception 'Platform result counts do not match fixture jobs: %', result->'platform_results';
  end if;
  -- Cancelled jobs must appear in the platform breakdown so it reconciles with
  -- the workspace-wide job total, but must never move the success rate.
  if (
    select (item->>'cancelled')::integer
    from jsonb_array_elements(result->'platform_results') as item
    where item->>'platform' = 'facebook'
  ) <> 1 then
    raise exception 'Cancelled jobs are missing from the platform breakdown: %', result->'platform_results';
  end if;
  if (
    select sum((item->>'succeeded')::integer + (item->>'failed')::integer
      + (item->>'reconciliation_required')::integer + (item->>'cancelled')::integer)
    from jsonb_array_elements(result->'platform_results') as item
  ) <> (result #>> '{publishing,successful}')::integer
     + (result #>> '{publishing,failed}')::integer
     + (result #>> '{publishing,reconciliation_required}')::integer
     + (result #>> '{publishing,cancelled}')::integer then
    raise exception 'Platform breakdown does not reconcile with the job totals: %', result;
  end if;
  -- 2 succeeded of 3 terminal jobs stays 66.7 even though a cancelled job exists.
  if (result #>> '{publishing,success_rate}')::numeric <> 66.7 then
    raise exception 'Cancelled jobs must not affect the success rate: %', result->'publishing';
  end if;
  if (result #>> '{publishing,average_delay_seconds}')::numeric <> 180
     or (result #>> '{publishing,median_delay_seconds}')::numeric <> 180 then
    raise exception 'Publishing delay aggregation failed: %', result->'publishing';
  end if;
  if extract(epoch from (
       (result #>> '{current_range,end_at}')::timestamptz
       - (result #>> '{current_range,start_at}')::timestamptz
     )) <> extract(epoch from (
       (result #>> '{comparison_range,end_at}')::timestamptz
       - (result #>> '{comparison_range,start_at}')::timestamptz
     )) then
    raise exception 'Comparison period duration differs from the current period';
  end if;
  if result->>'bucket_kind' <> 'day'
     or jsonb_array_length(result->'time_series') <> 7 then
    raise exception 'Timezone-aware daily bucketing failed: %', result->'time_series';
  end if;
  if ((result #>> '{time_series,0,bucket_start}')::timestamptz at time zone 'Africa/Lusaka')::date <> date '2099-03-02' then
    raise exception 'First time-series bucket does not begin on the supplied timezone date: %', result->'time_series';
  end if;

  filtered := public.get_operational_analytics(
    context_row.workspace_id,
    '2099-03-01 22:00+00',
    '2099-03-08 22:00+00',
    'facebook',
    'Africa/Lusaka'
  );
  if (filtered #>> '{posts,current}')::integer <> 4
     or jsonb_array_length(filtered->'platform_results') <> 1
     or filtered #>> '{platform_results,0,platform}' <> 'facebook'
     or (filtered #>> '{publishing,cancelled}')::integer <> 1 then
    raise exception 'Facebook filtering failed: %', filtered;
  end if;

  empty_result := public.get_operational_analytics(
    context_row.workspace_id,
    '2100-01-01 22:00+00',
    '2100-01-08 22:00+00',
    null,
    'Africa/Lusaka'
  );
  if (empty_result #>> '{posts,current}')::integer <> 0
     or jsonb_array_length(empty_result->'platform_results') <> 0
     or jsonb_array_length(empty_result->'content_types') <> 0
     or jsonb_array_length(empty_result->'time_series') <> 0
     or jsonb_array_length(empty_result->'weekday_activity') <> 0
     or jsonb_array_length(empty_result->'recent_results') <> 0 then
    raise exception 'Zero-result shape failed: %', empty_result;
  end if;

  begin
    perform public.get_operational_analytics(
      context_row.workspace_id,
      '2099-03-08 22:00+00', '2099-03-01 22:00+00', null, 'Africa/Lusaka'
    );
    raise exception 'Reversed analytics range unexpectedly succeeded';
  exception when invalid_parameter_value then
    if sqlerrm <> 'ANALYTICS_DATE_RANGE_INVALID' then raise; end if;
  end;

  begin
    perform public.get_operational_analytics(
      context_row.foreign_workspace_id,
      '2099-03-01 22:00+00', '2099-03-08 22:00+00', null, 'Africa/Lusaka'
    );
    raise exception 'Cross-workspace analytics unexpectedly succeeded';
  exception when insufficient_privilege then
    if sqlerrm <> 'ANALYTICS_WORKSPACE_DENIED' then raise; end if;
  end;

  begin
    perform public.get_operational_analytics(
      context_row.workspace_id,
      '2099-03-01 22:00+00', '2100-03-08 22:00+00', null, 'Africa/Lusaka'
    );
    raise exception 'Oversized analytics range unexpectedly succeeded';
  exception when invalid_parameter_value then
    if sqlerrm <> 'ANALYTICS_RANGE_TOO_LARGE' then raise; end if;
  end;

  begin
    perform public.get_operational_analytics(
      context_row.workspace_id,
      '2099-03-01 22:00+00', '2099-03-08 22:00+00', null, 'Not/A_Timezone'
    );
    raise exception 'Invalid timezone unexpectedly succeeded';
  exception when invalid_parameter_value then
    if sqlerrm <> 'ANALYTICS_TIMEZONE_INVALID' then raise; end if;
  end;
end;
$$;

reset role;
rollback;
