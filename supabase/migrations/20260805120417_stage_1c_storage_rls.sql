begin;

do $$
declare
  bucket_name text;
  bucket_public boolean;
  bucket_file_size_limit bigint;
  bucket_allowed_mime_types text[];
  expected_mime_types constant text[] := array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'application/pdf'
  ]::text[];
begin
  select
    bucket.name,
    bucket.public,
    bucket.file_size_limit,
    bucket.allowed_mime_types
  into
    bucket_name,
    bucket_public,
    bucket_file_size_limit,
    bucket_allowed_mime_types
  from storage.buckets as bucket
  where bucket.id = 'postflow-media';

  if not found then
    raise exception
      'The postflow-media bucket is missing. Seed it from supabase/config.toml or create it in the Storage dashboard before applying Stage 1C.'
      using errcode = 'P0001';
  end if;

  if bucket_name is distinct from 'postflow-media'
     or bucket_public is distinct from false
     or bucket_file_size_limit is distinct from 52428800
     or bucket_allowed_mime_types is null
     or pg_catalog.cardinality(bucket_allowed_mime_types)
       is distinct from pg_catalog.cardinality(expected_mime_types)
     or not (
       bucket_allowed_mime_types @> expected_mime_types
       and expected_mime_types @> bucket_allowed_mime_types
     ) then
    raise exception
      'The postflow-media bucket configuration does not match supabase/config.toml. Re-seed it or correct it in the Storage dashboard before retrying Stage 1C.'
      using errcode = 'P0001';
  end if;
end;
$$;

create or replace function private.storage_object_workspace_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when pg_catalog.split_part(coalesce(object_name, ''), '/', 1)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then pg_catalog.split_part(object_name, '/', 1)::uuid
    else null
  end;
$$;

create or replace function private.storage_object_uploader_id(object_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when pg_catalog.split_part(coalesce(object_name, ''), '/', 2)
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then pg_catalog.split_part(object_name, '/', 2)::uuid
    else null
  end;
$$;

create or replace function private.storage_object_path_is_valid(object_name text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    object_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9]{4}/(0[1-9]|1[0-2])/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9]([a-z0-9-]*[a-z0-9])?\.(jpg|jpeg|png|webp|gif|avif|mp4|webm|mov|pdf)$',
    false
  );
$$;

revoke all on function private.storage_object_workspace_id(text)
from public, anon, authenticated;
revoke all on function private.storage_object_uploader_id(text)
from public, anon, authenticated;
revoke all on function private.storage_object_path_is_valid(text)
from public, anon, authenticated;

grant execute on function private.storage_object_workspace_id(text) to authenticated;
grant execute on function private.storage_object_uploader_id(text) to authenticated;
grant execute on function private.storage_object_path_is_valid(text) to authenticated;

drop policy if exists postflow_media_select_members on storage.objects;
create policy postflow_media_select_members
on storage.objects
for select
to authenticated
using (
  bucket_id = 'postflow-media'
  and private.is_workspace_member(
    private.storage_object_workspace_id(name)
  )
);

drop policy if exists postflow_media_insert_creators on storage.objects;
create policy postflow_media_insert_creators
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'postflow-media'
  and private.storage_object_path_is_valid(name)
  and private.storage_object_uploader_id(name) = (select auth.uid())
  and private.can_create_content(
    private.storage_object_workspace_id(name)
  )
);

drop policy if exists postflow_media_delete_authorized on storage.objects;
create policy postflow_media_delete_authorized
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'postflow-media'
  and private.is_workspace_member(
    private.storage_object_workspace_id(name)
  )
  and (
    private.can_manage_content(
      private.storage_object_workspace_id(name)
    )
    or (
      private.has_workspace_role(
        private.storage_object_workspace_id(name),
        array['designer'::public.workspace_role]
      )
      and private.storage_object_uploader_id(name) = (select auth.uid())
      and owner_id = (select auth.uid())::text
    )
  )
);

grant select, insert, delete on storage.objects to authenticated;

create or replace function private.prevent_linked_media_asset_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.post_media as link
    where link.media_asset_id = old.id
  ) then
    raise exception 'Media used by a post cannot be deleted'
      using errcode = '23503';
  end if;
  return old;
end;
$$;

revoke all on function private.prevent_linked_media_asset_delete()
from public, anon, authenticated;

drop trigger if exists media_assets_prevent_linked_delete
on public.media_assets;
create trigger media_assets_prevent_linked_delete
before delete on public.media_assets
for each row execute function private.prevent_linked_media_asset_delete();

commit;
