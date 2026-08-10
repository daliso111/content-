-- The publishing worker Cron invokes its Edge Function through net.http_post.
-- pg_net is installed in the extensions schema but creates the net API schema.
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
