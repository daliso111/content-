-- Towkn Stage 2B verification. Run sections separately in the SQL editor.
-- Behavior sections are rollback-only and require disposable test users/workspaces.

-- 1. Schema and enum inventory.
select typname, enumlabel, enumsortorder
from pg_type join pg_enum on pg_enum.enumtypid = pg_type.oid
where typname in ('publishing_job_status','publishing_operation','publishing_attempt_outcome')
order by typname, enumsortorder;

select table_name
from information_schema.tables
where table_schema='public'
  and table_name in ('post_destinations','publishing_jobs','publishing_attempts')
order by table_name;

-- 2. Required constraints, indexes, functions and trigger inventory.
select conrelid::regclass as relation, conname, contype
from pg_constraint
where conrelid in ('public.post_destinations'::regclass,'public.publishing_jobs'::regclass,'public.publishing_attempts'::regclass)
order by conrelid::regclass::text, conname;

select tablename,indexname,indexdef from pg_indexes
where schemaname='public' and tablename in ('post_destinations','publishing_jobs','publishing_attempts')
order by tablename,indexname;

select n.nspname as schema_name,p.proname,pg_get_function_identity_arguments(p.oid) as arguments,p.prosecdef
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='private' and p.proname in ('enqueue_due_publications','create_publishing_jobs','recalculate_post_publishing_status'))
   or (n.nspname='public' and p.proname in ('request_publish_now','cancel_post_publication','retry_publishing_job','claim_publishing_queue_batch','finish_publishing_step'))
order by schema_name,proname;

-- 3. Durable queue, HTTP worker dependency and scheduler.
-- No queue message or secret content is returned.
select queue_name,is_partitioned,is_unlogged from pgmq.meta where queue_name='postflow-publishing';
select
  exists(select 1 from pg_extension where extname='pg_net') as pg_net_enabled,
  to_regnamespace('net') is not null as net_schema_available,
  exists(
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname='net' and procedure.proname='http_post'
  ) as net_http_post_available;
-- Expected: every value true.

select jobname,schedule,active
from cron.job
where jobname in (
  'postflow-enqueue-due-publications',
  'postflow-process-publishing-queue'
)
order by jobname;
-- Expected: both jobs are present and active after worker setup.

-- 4. Anonymous and browser table privileges.
select table_name,
  has_table_privilege('anon',format('%I.%I','public',table_name),'SELECT') as anon_select,
  has_table_privilege('authenticated',format('%I.%I','public',table_name),'SELECT') as authenticated_select,
  has_table_privilege('authenticated',format('%I.%I','public',table_name),'INSERT') as authenticated_insert,
  has_table_privilege('authenticated',format('%I.%I','public',table_name),'UPDATE') as authenticated_update,
  has_table_privilege('authenticated',format('%I.%I','public',table_name),'DELETE') as authenticated_delete
from (values ('post_destinations'),('publishing_jobs'),('publishing_attempts')) protected(table_name)
order by table_name;

-- Expected: anon_select false; authenticated_select true; every authenticated write false.
select
  has_schema_privilege('anon','pgmq','USAGE') as anon_queue_schema,
  has_schema_privilege('authenticated','pgmq','USAGE') as browser_queue_schema,
  has_function_privilege('authenticated','public.claim_publishing_queue_batch(integer,integer)','EXECUTE') as browser_claim_worker,
  has_function_privilege('authenticated','public.finish_publishing_step(uuid,bigint,integer,jsonb)','EXECUTE') as browser_finish_worker;
-- Expected: every value false.

-- 5. RLS policy inventory.
select schemaname,tablename,policyname,roles,cmd,qual,with_check
from pg_policies
where schemaname='public' and tablename in ('post_destinations','publishing_jobs','publishing_attempts')
order by tablename,policyname;

-- 6. Safe snapshot audit: all counts must be zero.
select
  count(*) filter(where payload_snapshot::text ~* 'access.?token|authorization|signed.?url|service.?role') as unsafe_snapshot_rows,
  count(*) filter(where jsonb_typeof(payload_snapshot)<>'object') as invalid_snapshot_rows
from public.publishing_jobs;

-- 7. Status aggregation (rollback-only, structural smoke test).
begin;
select private.recalculate_post_publishing_status(id) as recalculated_status
from public.posts where exists(select 1 from public.publishing_jobs where post_id=posts.id)
limit 10;
rollback;

-- 8. Two-user isolation template. Replace only in a private SQL session.
-- Begin a transaction, SET LOCAL ROLE authenticated, set request.jwt.claims to
-- a real disposable Workspace A member, then verify Workspace B destinations,
-- jobs and attempts return no rows. Also call create_post with a Workspace B
-- social account/media ID and confirm the transaction fails. Always ROLLBACK.

-- 9. Idempotency template. In a rollback transaction with disposable data,
-- call private.create_publishing_jobs twice for one post/revision/destination.
-- Verify one publishing_jobs row exists. A succeeded job's duplicate queue
-- delivery must be archived by claim_publishing_queue_batch without a claim.

-- 10. Browser status and deletion protection template. As an authenticated
-- disposable user, direct UPDATE publishing_jobs must be denied, direct UPDATE
-- posts to publishing/published/failed must be denied, and delete_post must
-- raise POST_HAS_PUBLISHING_HISTORY when a job exists. Always ROLLBACK.
