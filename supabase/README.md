# Towkn Supabase

This directory contains the local Supabase configuration, database migrations,
and verification SQL for Towkn. Firebase remains the static frontend host;
Supabase provides authentication, PostgreSQL and private media Storage.

## Stage 1B migration

The primary migration is:

```text
supabase/migrations/20260805112607_stage_1b_core_schema_rls.sql
```

It creates the seven Stage 1B tables, five enum types, non-recursive RLS helper
functions in the unexposed `private` schema, all table policies, bootstrap and
timestamp triggers, owner protection, existing-user backfill, and the secure
`public.create_workspace(text)` RPC.

The local API schema list in `config.toml` intentionally excludes `private`.
Keep it excluded from the Supabase Data API in every environment.

## Stage 1C migration

The Storage migration is:

```text
supabase/migrations/20260805120417_stage_1c_storage_rls.sql
```

It verifies the private `postflow-media` bucket, its 50 MB object limit and the
approved MIME allowlist, adds safe workspace and uploader path helpers, and
creates authenticated SELECT, INSERT and DELETE RLS policies on
`storage.objects`. There is deliberately no UPDATE policy. It also adds a
trigger that refuses to delete a `media_assets` row while `post_media` still
references it.

The bucket is configured in `config.toml` under
`[storage.buckets.postflow-media]`. Seed this definition through the Storage API
before applying the migration. Neither setup deletes buckets or objects, and
application uploads/downloads/deletions always use the Storage API rather than
direct SQL against Storage metadata tables.

## Stage 1D migration

The post CRUD migration is:

```text
supabase/migrations/20260805125425_stage_1d_post_crud.sql
```

It adds database-managed post revisions, optimistic conflict detection,
immutable post identity guards, deferred schedule/content validation, stricter
browser-controlled statuses, and transactional `create_post`, `update_post`,
`delete_post`, `delete_posts` and `duplicate_post` RPCs. These functions are
`SECURITY INVOKER` with an empty `search_path`; execution is revoked from
`public` and `anon` and granted only to `authenticated`. Existing table grants
and RLS remain the authorization boundary. Table triggers reject direct
authenticated mutations of `posts`, `post_platforms`, and `post_media`; each
RPC opens and clears a transaction-local write context around its own DML.

## Stage 2A migration and Edge Functions

The social connection migration is:

```text
supabase/migrations/20260805225307_stage_2a_social_connections.sql
```

It creates `public.social_accounts`, `private.social_credentials`,
`private.oauth_connection_states`, and `private.social_connection_sessions`,
plus the two social connection enums. Active members can select public metadata
through RLS. Browser roles have no mutation grant and no private-table access.
Eight `SECURITY DEFINER` RPCs are executable only by `service_role`; every
management RPC checks an active owner/administrator membership. The `private`
schema remains absent from `api.schemas`.

Six Edge Functions implement Meta OAuth start/callback, sanitized destination
selection, transactional completion, manual refresh, and disconnect. Only
`meta-oauth-callback` has `verify_jwt = false`; it uses hashed, 10-minute,
single-use state. Authenticated Functions validate the gateway JWT and call
`auth.getUser()`. CORS uses only exact origins configured in
`ALLOWED_APP_ORIGINS`, never a wildcard. Add localhost only to local secrets.

Set the placeholders from `functions/.env.example` in an ignored production
file, then configure hosted secrets without displaying their values:

```bash
supabase secrets set --env-file supabase/functions/.env.production
supabase functions deploy meta-oauth-start
supabase functions deploy meta-oauth-callback --no-verify-jwt
supabase functions deploy meta-connection-options
supabase functions deploy meta-connection-complete
supabase functions deploy social-account-refresh
supabase functions deploy social-account-disconnect
```

Never put Meta secrets, tokens, the Supabase server key, or the 32-byte
base64-encoded `SOCIAL_TOKEN_ENCRYPTION_KEY` in frontend configuration.
Credentials use AES-256-GCM, a fresh 96-bit IV, authenticated ciphertext, and a
`v1` marker. Future rotation should deploy dual-version decryption, re-encrypt
during trusted refresh/reconnect, then retire the old key only after its rows
are gone.

Configure Meta's exact callback URL, privacy policy, data-deletion instructions,
development roles, test Pages, and linked Instagram Business or Creator
accounts. Recheck the scopes centralized in `_shared/meta-config.ts` against
the current Meta app dashboard. Non-role users may require App Review and
business verification. Personal Instagram, publishing, analytics, webhooks,
automatic token refresh, and provider-wide revocation are outside Stage 2A.

## Apply safely

Choose one method and verify the target project before applying anything.

### Method A: SQL Editor

1. Open the intended Supabase project.
2. Open **Storage** and create or update `postflow-media` to match the private,
   50 MB, nine-MIME-type definition in `config.toml`.
3. Open **SQL Editor**.
4. Apply unapplied migrations in chronological order: Stage 1B, Stage 1C,
   Stage 1D, Stage 2A, Stage 2B, then Stage 3A. Run each migration in a separate SQL Editor query.
5. Review the selected project and SQL.
6. Run it once.
7. Run the matching verification SQL section by section.

### Method B: Supabase CLI

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase seed buckets --linked
supabase migration list
supabase db push --dry-run
supabase db push
```

Never use `supabase db reset --linked` and never place a database password,
service-role key, secret key, or access token in source files.

## Generate database types

After the migration has been applied, regenerate the checked-in provisional
types from the actual remote schema:

```bash
npm run db:types
```

The script uses the linked project and writes `types/database.generated.ts`.
Review the diff before committing it.

## Verify Storage

Run `tests/stage_1c_storage_verification.sql` one section at a time. It safely
checks bucket configuration, helper behavior, policy inventory, lack of an
UPDATE policy, anonymous policy exposure and the linked-media trigger. Then use two
non-production Auth accounts to exercise workspace isolation and each role via
the Storage API as described in the file.

Do not insert, update or delete rows in `storage.objects` manually. Do not make
the bucket public to troubleshoot signed URLs. Remove any test objects through
the Storage API and never use `supabase db reset --linked`.

## Verify post CRUD

Run `tests/stage_1d_post_crud_verification.sql` in numbered sections after both
Stage 1C and Stage 1D are applied. Use this order:

1. Revision schema and trigger inventory.
2. RPC security and grant inventory.
3. Anonymous table-privilege checks.
4. Non-production test-data readiness.
5. Rollback-only owner behavior transaction.
6. Two-user role matrix, workspace isolation and browser workflow.

The behavior section automatically chooses an active owner and embeds no user
identifier or credential. Use it only outside production and confirm the final
`ROLLBACK`. Test browser creation, refresh/edit, media attachment, scheduling,
calendar/dashboard refresh, duplicate/delete and a two-tab stale revision only
after the migrations are genuinely live. A local SQL lint also requires the
Supabase Docker database to be running.

## Verify Stage 2A

Run `tests/stage_2a_social_connections_verification.sql` one numbered section
at a time. It checks schema objects, enums, constraints, indexes, RLS, browser
grant denial, private-table denial, and trusted RPC grants. Complete the final
two-user matrix with real non-production Auth sessions; do not paste IDs or
JWTs into the SQL file.

Mocked provider and encryption tests are under `functions/tests`:

```bash
deno test --allow-env supabase/functions/tests/token-crypto-test.ts supabase/functions/tests/meta-client-test.ts supabase/functions/tests/validation-test.ts
```

For HTTP integration, start the local Supabase stack and serve Functions with
an ignored local secrets file. Tests must mock Meta and never call the live
Graph API. After migration, deployment, and secret configuration, perform real
OAuth as an owner, confirm viewer denial and second-workspace isolation, and
inspect browser URLs/storage for credential leakage. This local repository is
not linked, so none of those remote or real-provider results are claimed.

## Stage 2B queue and Meta publishing

Apply `migrations/20260806110000_stage_2b_meta_publishing.sql` only after Stages
1B through 2A. It enables durable pgmq and pg_cron modules, creates the private
`postflow-publishing` queue, destination/job/attempt tables, RLS, browser RPCs,
service-role worker RPCs, status aggregation and the once-per-minute database
scheduler. The queue is not added to the Data API schemas and anon/authenticated
roles have no pgmq schema access.

Deploy the worker and preserve JWT settings on every other Function:

```bash
supabase functions deploy process-publishing-queue --no-verify-jwt
```

Set `PUBLISHING_WORKER_SECRET` and the optional batch/URL TTL values from
`functions/.env.example` through Supabase secrets. The worker gateway is open to
Cron but the Function accepts only POST requests carrying the dedicated secret
header. Tokens are decrypted only in the worker and temporary media URLs are
created only after the authoritative database row and Storage object are
confirmed.

The worker invocation Cron cannot be created securely by the migration because
its secret must not be committed. Before enabling the worker, review and cancel
any unintended visible queue jobs because they can be processed immediately.
In a private SQL Editor session, replace the placeholders in
`setup/stage_2b_worker_cron.example.sql`; that script verifies/enables `pg_net`,
stores the project URL and worker secret in Vault, and creates/replaces the
once-per-minute HTTP Cron. Do not save the edited values in the repository.

Run `tests/stage_2b_publishing_verification.sql` section by section. It checks
schema, queue, Cron, grants, RLS and snapshot hygiene, then provides rollback
templates for two-workspace isolation, idempotency, status protection and
history-preserving deletion. Provider tests are entirely mocked:

```bash
npx --yes deno check functions/process-publishing-queue/index.ts
npx --yes deno test --allow-env functions/tests/*-test.ts
```

Use Meta test Pages and app-role accounts for browser verification. Scheduled
publishing works without an open browser only after both Cron jobs are active.
An ambiguous final provider timeout is intentionally not retried and requires
manual verification. Stage 2B does not implement webhooks, reconciliation
automation, carousels, Stories, transcoding, analytics ingestion or provider
content deletion.

## Stage 3A approvals

Apply `migrations/20260806170000_stage_3a_approval_workflow.sql` only after
Stages 1B through 2B. It adds the approval request, comment and event enums and
tables, member-only read policies, controlled authenticated RPCs, self-approval
protection, exact-revision decisions, edit invalidation and approval-aware
publishing validation.

Submission roles are owner, administrator, content manager and designer;
designers may submit only their own drafts. Approval roles are owner,
administrator and approver. A requester or post creator cannot approve their
own work. Request Changes and Reject require a message. Withdraw, reassign,
deadline and comment operations preserve immutable history.

The Stage 3A revision trigger advances only when `update_post` intentionally
saves publishing content. Approval and publishing status changes preserve the
approved revision. Editing a pending or approved revision supersedes its
request, returns the post to draft, and blocks Publish Now and scheduled enqueue
until the new revision is approved. Posts with approval history cannot be hard
deleted; archival is intentionally deferred rather than introduced as a risky
schema change.

Run `tests/stage_3a_approval_verification.sql` one numbered section at a time.
The first sections safely audit enums, tables, constraints, indexes, RLS,
grants, RPC security, metadata hygiene and publishing protection. Complete the
commented rollback templates only with disposable users in a non-production
project. Use at least two authenticated users and a second workspace for the
browser role/isolation checklist.

After the migration is applied remotely, regenerate the provisional types:

```bash
npm run db:types
```

Do not claim approvals are live until separate creator and approver accounts
have completed submit, changes, resubmit, approve, stale-edit, rejection,
withdrawal and workspace-isolation tests. Notifications, invitations,
multi-stage chains, external links, realtime dependency and AI review are not
implemented in Stage 3A.

## Stage 3B teams and notifications

Apply `migrations/20260806180000_stage_3b_team_notifications.sql` after Stage
3A. It creates `workspace_invitations`, `membership_events`, `notifications`
and `notification_preferences`; direct invitation reads are denied because the
table contains token hashes. `list_workspace_invitations` and
`get_workspace_invitation_details` expose sanitized records. Membership,
invitation and notification mutations use authenticated RPCs, while invitation
creation/resend preparation is granted only to `service_role` for the trusted
Functions.

The Auth bootstrap trigger is deliberately unchanged. New invited users can
receive a personal workspace before accepting the offered workspace. This is a
known reliability tradeoff and does not auto-accept or trust Auth metadata.

Set `POSTFLOW_APP_URL` and `ALLOWED_APP_ORIGINS` from `functions/.env.example`
as Function secrets. In Supabase Auth URL Configuration allow
`http://localhost:3000/accept-invite` and the production equivalent. Then:

```bash
supabase functions deploy invite-workspace-member
supabase functions deploy resend-workspace-invitation
```

Both Functions retain gateway JWT verification. Never deploy them with
`--no-verify-jwt`. Existing confirmed Auth users receive an in-app invitation;
new or invite-only Auth users follow Supabase Auth email delivery. Raw tokens,
token hashes and Auth Admin responses are never returned to the browser.

Run `tests/stage_3b_team_notifications_verification.sql` one section at a time.
Complete its rollback templates with disposable real Auth users, then test the
new-user email and existing-user in-app flows in separate browsers. Verify role
hierarchy, cross-workspace denial, last-owner protection, atomic ownership
transfer, suspension/reactivation/removal, private notification read/archive,
Realtime reconnect and secret-free browser storage/bundles. Regenerate types
only after the migration is applied:

```bash
npm run db:types
```

Realtime is an update channel, not the correctness source; the frontend
refetches authoritative rows. This stage does not add custom SMTP, SMS, push,
guest links, SCIM, groups or Auth-user deletion.

## Stage 4A operational analytics

Apply `migrations/20260806200000_stage_4a_operational_analytics.sql` after the
Stage 3B migration. It adds supporting indexes and the authenticated
`get_operational_analytics` RPC. The function verifies active workspace
membership, accepts a maximum 366-day half-open UTC range, validates the IANA
timezone, and returns one JSON aggregate for the dashboard. Anonymous and
direct public execution remain denied.

The aggregate contains Towkn operational data only: post volume and its
equal prior period, terminal and active publishing-job counts, retries,
attempt failures, platform and media-type distributions, success time series,
weekday completion counts, publishing-delay statistics, schedule consistency
and five recent terminal results. Reconciliation-required jobs are not counted
as either successes or failures. No Meta Insights data is fetched or inferred.

Run `tests/stage_4a_operational_analytics_verification.sql` in a non-production
project. Its fixture section uses future-dated disposable records and always
rolls back. It verifies authorization, filters, equal-period comparison,
timezone bucketing, empty results, delay/consistency formulas and invalid-input
denial. Then regenerate the provisional client type:

```bash
npm run db:types
```

Do not claim this stage is live until the linked-project migration and SQL
verification pass and separate authenticated browser sessions confirm
workspace isolation and filter behavior.

## Verify bootstrap records

The migration backfills existing `auth.users` rows and the Auth trigger handles
new users. Each user receives a profile and, when they have no membership, an
initial workspace with an active owner membership.

From authenticated development code, temporarily call:

```ts
import { verifyCurrentUserBootstrap } from "@/lib/services/database-service";

const result = await verifyCurrentUserBootstrap();
```

Do not add a permanent debug page. The helper returns existence flags, the
initial workspace ID, and whether the membership is an active owner; it does not
expose authentication secrets.

## RLS verification

Use two real test accounts created through Supabase Auth. Follow
`tests/stage_1b_rls_verification.sql` to verify anonymous denial, workspace
isolation, each role, immutable workspace relationships, and last-owner
protection. Keep all mutation checks in transactions and roll them back.
