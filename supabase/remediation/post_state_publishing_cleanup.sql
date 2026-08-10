-- READ-ONLY audit. This query does not mutate publishing jobs or posts.
select
  post.id as post_id,
  post.workspace_id,
  post.revision,
  post.status,
  count(job.id) filter(where job.post_revision = post.revision) as current_revision_jobs,
  count(job.id) filter(
    where job.post_revision = post.revision
      and job.status in ('queued','processing','waiting_provider','retry_wait')
  ) as current_active_jobs,
  count(job.id) filter(where job.post_revision <> post.revision) as historical_jobs,
  max(job.updated_at) filter(
    where job.post_revision = post.revision
      and job.status in ('queued','processing','waiting_provider','retry_wait')
  ) as last_active_job_update
from public.posts as post
left join public.publishing_jobs as job on job.post_id = post.id
where post.status = 'publishing'
group by post.id, post.workspace_id, post.revision, post.status
having count(job.id) filter(
  where job.post_revision = post.revision
    and job.status in ('queued','processing','waiting_provider','retry_wait')
) = 0
or max(job.updated_at) filter(
  where job.post_revision = post.revision
    and job.status in ('queued','processing','waiting_provider','retry_wait')
) < now() - interval '15 minutes'
order by last_active_job_update nulls first;

-- REVIEW-ONLY remediation template. Every statement remains commented and the
-- template defaults to ROLLBACK. Add only reviewed post IDs. Never use it for an
-- old processing/waiting_provider job until the provider result is verified.
--
-- begin;
-- create temporary table reviewed_stale_posts(post_id uuid primary key);
-- insert into reviewed_stale_posts(post_id) values
--   ('REPLACE-WITH-REVIEWED-POST-UUID');
--
-- -- Refuse cleanup if any selected post still has an active current operation.
-- do $$
-- begin
--   if exists(
--     select 1
--     from reviewed_stale_posts as reviewed
--     join public.posts as post on post.id = reviewed.post_id
--     join public.publishing_jobs as job on job.post_id = post.id
--       and job.post_revision = post.revision
--       and job.status in ('queued','processing','waiting_provider','retry_wait')
--   ) then
--     raise exception 'Selected post still has an active current publishing job';
--   end if;
-- end;
-- $$;
--
-- -- Current terminal jobs derive Published, Failed or Cancelled using the fixed
-- -- function. Posts with historical jobs only remain unchanged for manual review.
-- select private.recalculate_post_publishing_status(reviewed.post_id)
-- from reviewed_stale_posts as reviewed;
--
-- -- Restore workflow state only for reviewed rows with no current-revision jobs.
-- select set_config('postflow.post_rpc_write', 'allowed', true);
-- update public.posts as post
-- set status = case
--       when exists(
--         select 1 from public.approval_requests as request
--         where request.post_id = post.id
--           and request.post_revision = post.revision
--           and request.status = 'pending'
--       ) then 'pending_approval'::public.post_status
--       when post.scheduled_at > now()
--         and (
--           not post.approval_required
--           or private.has_valid_post_approval(post.id)
--         ) then 'scheduled'::public.post_status
--       when private.has_valid_post_approval(post.id)
--         then 'approved'::public.post_status
--       else 'draft'::public.post_status
--     end,
--     failure_message = null
-- from reviewed_stale_posts as reviewed
-- where post.id = reviewed.post_id
--   and post.status = 'publishing'
--   and not exists(
--     select 1 from public.publishing_jobs as job
--     where job.post_id = post.id
--       and job.post_revision = post.revision
--   );
-- select set_config('postflow.post_rpc_write', '', true);
--
-- select post.id, post.revision, post.status, post.scheduled_at
-- from public.posts as post
-- join reviewed_stale_posts as reviewed on reviewed.post_id = post.id;
-- rollback;
