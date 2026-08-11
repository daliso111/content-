-- Treat TikTok Direct Post publish_id values as opaque provider strings.
begin;

alter table private.tiktok_publish_sessions
  drop constraint tiktok_publish_id_safe,
  add constraint tiktok_publish_id_safe check (
    publish_id is null
    or (
      char_length(publish_id) <= 64
      and publish_id ~ '[^[:space:]]'
    )
  );

create or replace function public.store_tiktok_publish_id(
  p_publishing_job_id uuid,
  p_publish_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_publish_id is null
     or char_length(p_publish_id) > 64
     or p_publish_id !~ '[^[:space:]]' then
    raise exception 'INVALID_TIKTOK_PUBLISH_ID' using errcode = '22023';
  end if;
  update private.tiktok_publish_sessions
  set publish_id = p_publish_id,
      provider_status = 'INITIALIZED',
      next_status_check_at = now() + interval '30 seconds'
  where publishing_job_id = p_publishing_job_id
    and submission_started_at is not null
    and (publish_id is null or publish_id = p_publish_id);
  if not found then
    raise exception 'TIKTOK_SUBMISSION_STATE_INVALID' using errcode = '55000';
  end if;
end;
$$;

comment on function public.store_tiktok_publish_id(uuid, text) is
  'Service-role-only persistence for an exact opaque TikTok Direct Post publish_id.';

revoke all on function public.store_tiktok_publish_id(uuid, text)
from public, anon, authenticated;
grant execute on function public.store_tiktok_publish_id(uuid, text)
to service_role;

commit;
