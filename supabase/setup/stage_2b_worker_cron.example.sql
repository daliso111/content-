-- Run manually after deploying process-publishing-queue.
-- Replace placeholder values only in the SQL editor; never commit real secrets.
-- Existing named secrets are preserved, so this setup is safe to rerun.
-- IMPORTANT: review/cancel unintended visible queue jobs before enabling pg_net;
-- an active worker Cron can process them as soon as net.http_post is available.
create extension if not exists pg_net with schema extensions;

do $$
begin
  if to_regnamespace('net') is null or not exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'net'
      and procedure.proname = 'http_post'
  ) then
    raise exception 'PG_NET_HTTP_POST_UNAVAILABLE';
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from vault.decrypted_secrets where name = 'postflow_project_url'
  ) then
    perform vault.create_secret(
      'https://your-project-ref.supabase.co',
      'postflow_project_url'
    );
  end if;

  if not exists (
    select 1 from vault.decrypted_secrets
    where name = 'postflow_publishing_worker_secret'
  ) then
    perform vault.create_secret(
      'replace-with-a-long-random-worker-secret',
      'postflow_publishing_worker_secret'
    );
  end if;
end;
$$;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname='postflow-process-publishing-queue';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule(
    'postflow-process-publishing-queue',
    '* * * * *',
    $cron$
      select net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name='postflow_project_url') || '/functions/v1/process-publishing-queue',
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-postflow-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='postflow_publishing_worker_secret')
        ),
        body := '{"source":"cron"}'::jsonb,
        timeout_milliseconds := 50000
      );
    $cron$
  );
end;
$$;
