-- Stage 4A: workspace-scoped operational analytics.
-- This deliberately reports PostFlow records only; it does not fabricate provider insights.

begin;

create index if not exists posts_workspace_created_at_idx
  on public.posts (workspace_id, created_at desc);

create index if not exists publishing_jobs_workspace_completed_at_idx
  on public.publishing_jobs (workspace_id, completed_at desc)
  where completed_at is not null;

create index if not exists publishing_jobs_workspace_platform_completed_at_idx
  on public.publishing_jobs (workspace_id, platform, completed_at desc)
  where completed_at is not null;

create index if not exists publishing_attempts_workspace_started_at_idx
  on public.publishing_attempts (workspace_id, started_at desc);

create or replace function public.get_operational_analytics(
  p_workspace_id uuid,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_platform public.social_platform default null,
  p_timezone text default 'UTC'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_duration interval;
  v_comparison_start timestamptz;
  v_current_posts bigint := 0;
  v_previous_posts bigint := 0;
  v_successful bigint := 0;
  v_failed bigint := 0;
  v_reconciliation bigint := 0;
  v_active bigint := 0;
  v_cancelled bigint := 0;
  v_retry_count bigint := 0;
  v_failure_attempt_count bigint := 0;
  v_average_delay_seconds numeric;
  v_median_delay_seconds numeric;
  v_on_time_count bigint := 0;
  v_scheduled_succeeded_count bigint := 0;
  v_success_rate numeric;
  v_consistency_rate numeric;
  v_bucket_kind text;
  v_bucket_step interval;
  v_platform_results jsonb := '[]'::jsonb;
  v_content_types jsonb := '[]'::jsonb;
  v_time_series jsonb := '[]'::jsonb;
  v_weekday_activity jsonb := '[]'::jsonb;
  v_recent_results jsonb := '[]'::jsonb;
  v_latest_completed_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'ANALYTICS_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_workspace_id is null or not private.is_workspace_member(p_workspace_id) then
    raise exception 'ANALYTICS_WORKSPACE_DENIED' using errcode = '42501';
  end if;
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'ANALYTICS_DATE_RANGE_INVALID' using errcode = '22023';
  end if;

  v_duration := p_end_at - p_start_at;
  if v_duration > interval '366 days' then
    raise exception 'ANALYTICS_RANGE_TOO_LARGE' using errcode = '22023';
  end if;
  if p_timezone is null
     or btrim(p_timezone) = ''
     or not exists (
       select 1 from pg_catalog.pg_timezone_names where name = btrim(p_timezone)
     ) then
    raise exception 'ANALYTICS_TIMEZONE_INVALID' using errcode = '22023';
  end if;

  p_timezone := btrim(p_timezone);
  v_comparison_start := p_start_at - v_duration;
  v_bucket_kind := case when v_duration <= interval '45 days' then 'day' else 'week' end;
  v_bucket_step := case when v_bucket_kind = 'day' then interval '1 day' else interval '1 week' end;

  select count(*) into v_current_posts
  from public.posts as post
  where post.workspace_id = p_workspace_id
    and post.created_at >= p_start_at and post.created_at < p_end_at
    and (
      p_platform is null or exists (
        select 1 from public.post_platforms as platform_row
        where platform_row.post_id = post.id and platform_row.platform = p_platform
      )
    );

  select count(*) into v_previous_posts
  from public.posts as post
  where post.workspace_id = p_workspace_id
    and post.created_at >= v_comparison_start and post.created_at < p_start_at
    and (
      p_platform is null or exists (
        select 1 from public.post_platforms as platform_row
        where platform_row.post_id = post.id and platform_row.platform = p_platform
      )
    );

  select
    count(*) filter (where job.status = 'succeeded'),
    count(*) filter (where job.status = 'failed'),
    count(*) filter (where job.status = 'reconciliation_required'),
    count(*) filter (where job.status = 'cancelled'),
    coalesce(sum(greatest(job.attempt_count - 1, 0)), 0),
    max(job.completed_at)
  into
    v_successful, v_failed, v_reconciliation, v_cancelled,
    v_retry_count, v_latest_completed_at
  from public.publishing_jobs as job
  where job.workspace_id = p_workspace_id
    and job.completed_at >= p_start_at and job.completed_at < p_end_at
    and (p_platform is null or job.platform = p_platform);

  select count(*) into v_active
  from public.publishing_jobs as job
  where job.workspace_id = p_workspace_id
    and job.status in ('queued', 'processing', 'waiting_provider', 'retry_wait')
    and job.scheduled_for >= p_start_at and job.scheduled_for < p_end_at
    and (p_platform is null or job.platform = p_platform);

  select count(*) into v_failure_attempt_count
  from public.publishing_attempts as attempt
  join public.publishing_jobs as job on job.id = attempt.publishing_job_id
  where attempt.workspace_id = p_workspace_id
    and attempt.started_at >= p_start_at and attempt.started_at < p_end_at
    and attempt.outcome in ('transient_failure', 'permanent_failure', 'ambiguous')
    and (p_platform is null or job.platform = p_platform);

  select
    avg(greatest(extract(epoch from job.completed_at - job.scheduled_for), 0)),
    percentile_cont(0.5) within group (
      order by greatest(extract(epoch from job.completed_at - job.scheduled_for), 0)
    )
  into v_average_delay_seconds, v_median_delay_seconds
  from public.publishing_jobs as job
  where job.workspace_id = p_workspace_id
    and job.status = 'succeeded'
    and job.completed_at >= p_start_at and job.completed_at < p_end_at
    and (p_platform is null or job.platform = p_platform);

  select
    count(*) filter (where job.completed_at <= job.scheduled_for + interval '5 minutes'),
    count(*)
  into v_on_time_count, v_scheduled_succeeded_count
  from public.publishing_jobs as job
  join public.posts as post on post.id = job.post_id
  where job.workspace_id = p_workspace_id
    and job.status = 'succeeded'
    and job.completed_at >= p_start_at and job.completed_at < p_end_at
    and post.scheduled_at is not null
    and abs(extract(epoch from job.scheduled_for - post.scheduled_at)) < 1
    and (p_platform is null or job.platform = p_platform);

  v_success_rate := case
    when v_successful + v_failed = 0 then null
    else round(100.0 * v_successful / (v_successful + v_failed), 1)
  end;
  v_consistency_rate := case
    when v_scheduled_succeeded_count = 0 then null
    else round(100.0 * v_on_time_count / v_scheduled_succeeded_count, 1)
  end;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'platform', result.platform,
      'succeeded', result.succeeded,
      'failed', result.failed,
      'reconciliation_required', result.reconciliation_required
    ) order by result.total desc, result.platform
  ), '[]'::jsonb)
  into v_platform_results
  from (
    select
      job.platform,
      count(*) filter (where job.status = 'succeeded') as succeeded,
      count(*) filter (where job.status = 'failed') as failed,
      count(*) filter (where job.status = 'reconciliation_required') as reconciliation_required,
      count(*) as total
    from public.publishing_jobs as job
    where job.workspace_id = p_workspace_id
      and job.completed_at >= p_start_at and job.completed_at < p_end_at
      and job.status in ('succeeded', 'failed', 'reconciliation_required')
      and (p_platform is null or job.platform = p_platform)
    group by job.platform
  ) as result;

  with base_posts as (
    select post.id
    from public.posts as post
    where post.workspace_id = p_workspace_id
      and post.created_at >= p_start_at and post.created_at < p_end_at
      and (
        p_platform is null or exists (
          select 1 from public.post_platforms as platform_row
          where platform_row.post_id = post.id and platform_row.platform = p_platform
        )
      )
  ), content_counts as (
    select asset.media_type::text as content_type, count(distinct base.id) as post_count
    from base_posts as base
    join public.post_media as link on link.post_id = base.id
    join public.media_assets as asset on asset.id = link.media_asset_id
    group by asset.media_type
    union all
    select 'text', count(*)
    from base_posts as base
    where not exists (select 1 from public.post_media as link where link.post_id = base.id)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object('type', content_type, 'posts', post_count)
    order by case content_type
      when 'image' then 1 when 'video' then 2 when 'graphic' then 3
      when 'document' then 4 when 'logo' then 5 else 6 end
  ), '[]'::jsonb)
  into v_content_types
  from content_counts
  where post_count > 0;

  if v_successful + v_failed > 0 then
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'bucket_start', bucket.bucket_local at time zone p_timezone,
        'successful', bucket.successful,
        'failed', bucket.failed
      ) order by bucket.bucket_local
    ), '[]'::jsonb)
    into v_time_series
    from (
      select
        series.bucket_local,
        count(job.id) filter (where job.status = 'succeeded') as successful,
        count(job.id) filter (where job.status = 'failed') as failed
      from pg_catalog.generate_series(
        date_trunc(v_bucket_kind, timezone(p_timezone, p_start_at)),
        date_trunc(v_bucket_kind, timezone(p_timezone, p_end_at - interval '1 microsecond')),
        v_bucket_step
      ) as series(bucket_local)
      left join public.publishing_jobs as job
        on date_trunc(v_bucket_kind, timezone(p_timezone, job.completed_at)) = series.bucket_local
       and job.workspace_id = p_workspace_id
       and job.completed_at >= p_start_at and job.completed_at < p_end_at
       and job.status in ('succeeded', 'failed')
       and (p_platform is null or job.platform = p_platform)
      group by series.bucket_local
    ) as bucket;
  end if;

  if v_successful > 0 then
    with weekdays(day_index, label) as (
      values (1, 'Mon'), (2, 'Tue'), (3, 'Wed'), (4, 'Thu'),
             (5, 'Fri'), (6, 'Sat'), (7, 'Sun')
    ), counts as (
      select extract(isodow from timezone(p_timezone, job.completed_at))::integer as day_index,
        count(*) as jobs
      from public.publishing_jobs as job
      where job.workspace_id = p_workspace_id
        and job.status = 'succeeded'
        and job.completed_at >= p_start_at and job.completed_at < p_end_at
        and (p_platform is null or job.platform = p_platform)
      group by 1
    )
    select jsonb_agg(jsonb_build_object(
      'day_index', weekdays.day_index,
      'label', weekdays.label,
      'jobs', coalesce(counts.jobs, 0)
    ) order by weekdays.day_index)
    into v_weekday_activity
    from weekdays left join counts using (day_index);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'job_id', recent.id,
    'post_id', recent.post_id,
    'caption', recent.caption,
    'platform', recent.platform,
    'social_account_id', recent.social_account_id,
    'account_name', recent.account_name,
    'account_username', recent.username,
    'status', recent.status,
    'completed_at', recent.completed_at,
    'provider_permalink', recent.provider_permalink,
    'attempt_count', recent.attempt_count
  ) order by recent.completed_at desc), '[]'::jsonb)
  into v_recent_results
  from (
    select job.id, job.post_id, post.caption, job.platform, job.social_account_id,
      account.account_name, account.username, job.status, job.completed_at,
      job.provider_permalink, job.attempt_count
    from public.publishing_jobs as job
    join public.posts as post on post.id = job.post_id
    join public.social_accounts as account on account.id = job.social_account_id
    where job.workspace_id = p_workspace_id
      and job.completed_at >= p_start_at and job.completed_at < p_end_at
      and job.status in ('succeeded', 'failed', 'reconciliation_required')
      and (p_platform is null or job.platform = p_platform)
    order by job.completed_at desc, job.id
    limit 5
  ) as recent;

  return jsonb_build_object(
    'current_range', jsonb_build_object('start_at', p_start_at, 'end_at', p_end_at),
    'comparison_range', jsonb_build_object('start_at', v_comparison_start, 'end_at', p_start_at),
    'bucket_kind', v_bucket_kind,
    'posts', jsonb_build_object('current', v_current_posts, 'previous', v_previous_posts),
    'publishing', jsonb_build_object(
      'successful', v_successful,
      'failed', v_failed,
      'reconciliation_required', v_reconciliation,
      'active', v_active,
      'cancelled', v_cancelled,
      'success_rate', v_success_rate,
      'retry_count', v_retry_count,
      'failure_attempt_count', v_failure_attempt_count,
      'average_delay_seconds', v_average_delay_seconds,
      'median_delay_seconds', v_median_delay_seconds,
      'on_time_count', v_on_time_count,
      'scheduled_succeeded_count', v_scheduled_succeeded_count,
      'consistency_rate', v_consistency_rate
    ),
    'platform_results', v_platform_results,
    'content_types', v_content_types,
    'time_series', v_time_series,
    'weekday_activity', v_weekday_activity,
    'recent_results', v_recent_results,
    'data_freshness', jsonb_build_object(
      'generated_at', statement_timestamp(),
      'latest_completed_at', v_latest_completed_at
    )
  );
end;
$$;

revoke all on function public.get_operational_analytics(
  uuid, timestamptz, timestamptz, public.social_platform, text
) from public, anon, authenticated;

grant execute on function public.get_operational_analytics(
  uuid, timestamptz, timestamptz, public.social_platform, text
) to authenticated;

commit;
