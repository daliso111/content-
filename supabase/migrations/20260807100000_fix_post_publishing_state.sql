begin;

-- Publishing state belongs to the current persisted revision. Older jobs remain
-- immutable history and must not drive the visible state of a newer revision.
create or replace function private.recalculate_post_publishing_status(target_post_id uuid)
returns public.post_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_post public.posts%rowtype;
  next_status public.post_status;
  safe_message text;
  current_job_count integer;
  success_count integer;
  failure_count integer;
  cancelled_count integer;
begin
  select * into target_post
  from public.posts
  where id = target_post_id
  for update;

  if not found then
    raise exception 'POST_NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists(
    select 1
    from public.publishing_jobs
    where post_id = target_post.id
      and post_revision = target_post.revision
      and status = 'reconciliation_required'
  ) then
    next_status := 'failed';
    safe_message := 'Manual provider verification required for one or more destinations.';
  elsif exists(
    select 1
    from public.publishing_jobs
    where post_id = target_post.id
      and post_revision = target_post.revision
      and status in ('queued', 'processing', 'waiting_provider', 'retry_wait')
  ) then
    next_status := 'publishing';
    safe_message := null;
  else
    select
      count(*),
      count(*) filter(where status = 'succeeded'),
      count(*) filter(where status = 'failed'),
      count(*) filter(where status = 'cancelled')
    into current_job_count, success_count, failure_count, cancelled_count
    from public.publishing_jobs
    where post_id = target_post.id
      and post_revision = target_post.revision;

    -- No current-revision operation exists. Preserve draft, approval and
    -- scheduling state instead of deriving state from historical jobs.
    if current_job_count = 0 then
      return target_post.status;
    elsif failure_count > 0 then
      next_status := 'failed';
      safe_message := case
        when success_count > 0 then
          'Some destinations published; one or more destinations failed.'
        else
          'Publishing failed for every destination.'
      end;
    elsif success_count = current_job_count then
      next_status := 'published';
      safe_message := null;
    elsif cancelled_count > 0 then
      next_status := 'cancelled';
      safe_message := null;
    else
      return target_post.status;
    end if;
  end if;

  perform set_config('postflow.post_rpc_write', 'allowed', true);
  update public.posts
  set status = next_status,
      failure_message = safe_message,
      published_at = case
        when next_status = 'published' then coalesce(published_at, now())
        else published_at
      end
  where id = target_post.id;
  perform set_config('postflow.post_rpc_write', '', true);

  return next_status;
end;
$$;

create or replace function public.cancel_post_publication(p_post_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.posts%rowtype;
  guaranteed integer;
  uncertain integer;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into target from public.posts where id = p_post_id for update;
  if not found then raise exception 'POST_NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.can_manage_content(target.workspace_id) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  update public.publishing_jobs
  set status = 'cancelled',
      completed_at = now(),
      safe_error_code = 'CANCELLED_BY_USER',
      retryable = false
  where post_id = target.id
    and post_revision = target.revision
    and (
      status in ('queued', 'retry_wait')
      or status = 'waiting_provider'
        and provider_container_id is null
        and started_at is null
    );
  get diagnostics guaranteed = row_count;

  update public.publishing_jobs
  set status = 'reconciliation_required',
      completed_at = now(),
      ambiguous_result = true,
      safe_error_code = 'CANCELLATION_NOT_GUARANTEED',
      safe_error_message = 'Provider submission may already have started; verify the destination.'
  where post_id = target.id
    and post_revision = target.revision
    and status in ('processing', 'waiting_provider')
    and (provider_container_id is not null or started_at is not null);
  get diagnostics uncertain = row_count;

  if guaranteed + uncertain > 0 then
    perform private.recalculate_post_publishing_status(target.id);
  end if;

  return jsonb_build_object(
    'postId', target.id,
    'cancelledJobs', guaranteed,
    'reconciliationRequired', uncertain
  );
end;
$$;

create or replace function public.retry_publishing_job(p_publishing_job_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.publishing_jobs%rowtype;
  target_post public.posts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into target
  from public.publishing_jobs
  where id = p_publishing_job_id
  for update;
  if not found then raise exception 'JOB_NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.can_manage_content(target.workspace_id) then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  select * into target_post from public.posts where id = target.post_id for update;
  if not found
     or target.post_revision <> target_post.revision
     or target.status <> 'failed'
     or target.retryable is not true
     or target.attempt_count >= target.max_attempts then
    raise exception 'RETRY_NOT_ALLOWED' using errcode = '55000';
  end if;

  update public.publishing_jobs
  set status = 'queued',
      available_at = now(),
      next_attempt_at = null,
      safe_error_code = null,
      safe_error_message = null,
      completed_at = null
  where id = target.id;
  perform pgmq.send(
    'postflow-publishing',
    jsonb_build_object('version', 1, 'publishingJobId', target.id)
  );
  perform private.recalculate_post_publishing_status(target.post_id);
  return jsonb_build_object('publishingJobId', target.id, 'status', 'queued');
end;
$$;

commit;
