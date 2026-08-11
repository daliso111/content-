# PostFlow

A polished, responsive social-media automation and scheduling platform built for
agencies and small businesses to plan, approve and publish content across
multiple networks from one workspace.

> **Backend Stage 3A (implemented locally):** Supabase Auth, the multi-tenant
> PostgreSQL schema, private Storage, transactional post CRUD, secure Meta
> connections, durable publishing, and revision-scoped approvals are implemented.
> Apply the outstanding migrations and deploy/configure the Edge Functions before
> treating them as live. Provider analytics remain demo-only. Firebase serves the
> static export.

`PostFlow` is a temporary product name — see [Rebranding](#rebranding) to change it.

---

## Tech stack

- **Next.js 15** (App Router) with **static export** (`output: "export"`)
- **TypeScript** (strict, no `any`)
- **Tailwind CSS** with a token-based design system (light + optional dark)
- **lucide-react** icons
- Dependency-free **SVG charts** (no charting library)
- **Supabase Auth** through the browser-only `@supabase/supabase-js` client
- **Supabase PostgreSQL** migration with workspace-scoped RLS
- **Supabase Storage** with private signed URLs and resumable TUS uploads
- **date-fns-tz** for workspace-local scheduling and UTC persistence

---

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure authentication
Copy-Item .env.example .env.local  # PowerShell
# Add your Supabase Project URL and publishable key to .env.local

# 3. Run the dev server
npm run dev
# open http://localhost:3000

# 4. Build the static site
npm run build         # outputs to ./out

# 5. Preview the production build locally
npm run serve         # serves ./out via `npx serve`
```

> **Note:** `npm install` needs network access to the npm registry. If it fails
> with `ECONNRESET`, it's a connectivity issue — retry on a stable connection:
> `npm install --fetch-retries=5`.

---

## Routes

| Route                     | Description                                        |
| ------------------------- | -------------------------------------------------- |
| `/`                       | Marketing landing page                             |
| `/sign-in`                | Supabase email/password sign-in                    |
| `/sign-up`                | Supabase account creation and email confirmation   |
| `/forgot-password`        | Request a password-recovery email                  |
| `/update-password`        | Validate recovery session and choose a new password |
| `/dashboard`              | Live post metrics/lists plus labelled demo analytics |
| `/dashboard/create`       | Persisted post composer with platform previews     |
| `/dashboard/create?post=<uuid>` | Static-export-compatible post editing       |
| `/dashboard/calendar`     | Month / week / list calendar of scheduled posts    |
| `/dashboard/posts`        | Posts management (grid/table, filters, bulk, pages) |
| `/dashboard/media`        | Media library (grid/list, upload, details)         |
| `/dashboard/accounts`     | Meta, YouTube, and TikTok account connections       |
| `/dashboard/approvals`    | Approval centre with review modal                  |
| `/dashboard/analytics`    | Analytics dashboard with charts                    |
| `/dashboard/team`         | Team members table + invite modal                  |
| `/dashboard/settings`     | Profile, workspace, brand, publishing, etc.        |

All `/dashboard` routes are protected by a browser-side authentication guard.
Signed-out users are sent to `/sign-in`; authenticated users are redirected
away from guest-only authentication pages. Client-side guards preserve static
export compatibility and prevent dashboard content from appearing before the
initial session check finishes.

---

## Project structure

```text
app/                     # App Router pages
  page.tsx               # Landing
  providers.tsx          # Root client providers
  sign-in/ sign-up/      # Account access and registration
  forgot-password/       # Password-reset email request
  update-password/       # Recovery-session password update
  dashboard/
    layout.tsx           # Dashboard shell (sidebar + top bar)
    page.tsx             # Overview
    create/ calendar/ posts/ media/ accounts/
    approvals/ analytics/ team/ settings/
components/
  auth/                  # Route guards and authentication feedback
  layout/                # Sidebar, TopBar, MobileNav, PageHeader, Logo, shell
  ui/                    # Design-system primitives (Button, Card, Modal, …)
  dashboard/             # MetricCard
  posts/                 # PostCard, PostDetail, SocialPreview
  media/                 # MediaThumbnail
  analytics/             # SVG chart components
  marketing/             # Landing + auth building blocks
data/                    # Mock data (posts, media, accounts, team, analytics…)
contexts/                # Supabase authentication state and actions
types/                   # TypeScript domain models
lib/                     # utils, constants, navigation, services, Supabase client
supabase/                # CLI config, migrations, database docs and RLS tests
```

### Reusable components

Sidebar, mobile nav, top bar, page header, metric card, post card, platform
icon, status badge, empty state, confirmation modal, toast, upload area, tabs,
dropdown menu, search input, filter controls, data table, skeleton loader,
pagination, and social-post previews (Facebook, Instagram, LinkedIn, TikTok, X).

---

## Live and demo data

Authentication, workspaces, media, post CRUD, schedules, approvals, dashboard
metrics/lists, Posts and Calendar use Supabase after their migrations are applied.
Facebook and Instagram connections and publishing require Stages 2A/2B plus the
deployed worker. YouTube connection/publishing and TikTok account connection are
implemented in their respective stages; TikTok publishing is not supported.
LinkedIn and X are coming soon. Engagement analytics and AI suggestions remain
demo-only.

---

## Authentication setup

1. Create or select a project in Supabase.
2. Open the project **Connect** settings.
3. Copy the **Project URL**.
4. Copy the **publishable key**.
5. Create `.env.local` in the project root.
6. Add the following public values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key
```

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is accepted temporarily for projects that still
use the legacy public anon key, but the publishable key is preferred. Restart
the development server after changing environment variables.

Never add a service-role key, secret key, database password or social-platform
access token to frontend environment variables. `.env.local` is ignored by Git.

### Supabase URL configuration

In the Supabase dashboard, open **Authentication → URL Configuration**.

For local development, configure:

```text
Site URL: http://localhost:3000
Additional Redirect URL: http://localhost:3000/**
```

For production, set the Site URL to the Firebase Hosting or custom-domain URL.
Add exact allowed redirect URLs for:

```text
https://your-domain.example/sign-in
https://your-domain.example/update-password
```

When **Confirm email** is enabled in Supabase, sign-up creates the account but
does not create a session. PostFlow displays the submitted email address and
asks the user to confirm it before signing in. When confirmation is disabled,
Supabase returns a session and PostFlow opens the dashboard immediately.

### Authentication flow

- The root `AuthProvider` restores the saved Supabase session and subscribes to
  sign-in, sign-out, token-refresh and password-recovery events.
- Sign-in and sign-up retain the existing form validation and toast feedback.
- Password-reset responses do not reveal whether an email address exists.
- Recovery links open `/update-password`, where the recovery session is checked
  before the password form is enabled.
- Signing out clears the Supabase session and returns the user to `/sign-in`.
- Google OAuth is deliberately disabled and labelled as coming soon.

---

## Stage 1B database and RLS

The migration in
[`supabase/migrations/20260805112607_stage_1b_core_schema_rls.sql`](./supabase/migrations/20260805112607_stage_1b_core_schema_rls.sql)
creates these workspace-scoped tables:

| Table               | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `profiles`          | Public application profile for an Auth user  |
| `workspaces`        | Business or client workspace                 |
| `workspace_members` | User role and active membership              |
| `posts`             | Core post content and lifecycle              |
| `post_platforms`    | Platform-specific captions and settings      |
| `media_assets`      | Media metadata only; no Storage bucket yet   |
| `post_media`        | Ordered post-to-media relationships          |

It also creates `workspace_role`, `membership_status`, `social_platform`,
`post_status`, and `media_type` enums. Workspace roles are enforced in
PostgreSQL: owners control the workspace, administrators manage settings,
content managers manage all content, designers manage their own drafts and
media, and approvers/viewers are read-only during this stage.

### Tenant isolation

RLS is enabled on all seven tables. Authorization helpers live in the
unexposed `private` schema, use active `workspace_members` rows rather than user
metadata, and have fixed empty search paths. Anonymous access is revoked.
Composite foreign keys prevent posts and media from being related across
workspaces, while triggers prevent workspace IDs and creator identities from
being changed. Direct membership writes remain denied until the invitation and
ownership-transfer workflow is implemented.

### User bootstrap

The `on_auth_user_created` trigger creates a profile, a collision-resistant
initial workspace, and an active owner membership for every new Auth user. The
migration runs the same idempotent bootstrap function over existing
`auth.users`, so Stage 1A accounts are backfilled without changing credentials.
The last active owner cannot be removed, suspended, or demoted.

### Apply and verify

The repository is not automatically linked to a remote Supabase project. Apply
the migration through the Supabase SQL Editor or link the correct project and
use the normal CLI workflow:

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase migration list
supabase db push
npm run db:types
```

`npm run db:types` must be run after applying the migration so
[`types/database.generated.ts`](./types/database.generated.ts) reflects the
actual remote schema. Use `verifyCurrentUserBootstrap()` from
[`lib/services/database-service.ts`](./lib/services/database-service.ts) for a
temporary authenticated bootstrap check. Follow
[`supabase/tests/stage_1b_rls_verification.sql`](./supabase/tests/stage_1b_rls_verification.sql)
with two real test accounts to test role permissions and workspace isolation.
Full safe-application instructions are in
[`supabase/README.md`](./supabase/README.md).

Never expose a service-role key, secret key, database password, Auth token, or
social-platform credential in source or frontend environment variables.

---

## Stage 1C private media storage

Stage 1C adds the idempotent migration
[`supabase/migrations/20260805120417_stage_1c_storage_rls.sql`](./supabase/migrations/20260805120417_stage_1c_storage_rls.sql)
and a private bucket named `postflow-media`. The bucket accepts JPEG, PNG,
WebP, GIF, AVIF, MP4, WebM, QuickTime video and PDF files. Its object limit is
50 MB; browser validation further limits images to 10 MB, videos to 50 MB,
PDFs to 20 MB, and each batch to 10 files or 100 MB combined.

Objects use this identity-bound path:

```text
{workspace_id}/{user_id}/{YYYY}/{MM}/{uuid}-{sanitized-file-name.ext}
```

Names are derived from the final browser filename only, unsafe characters are
collapsed to hyphens, extensions are lowercase, and uploads never overwrite an
existing path. Files up to and including 6 MB use the regular Supabase Storage
API. Larger files use `tus-js-client` against the direct Supabase Storage host
with 6 MB chunks, retry delays, resumable fingerprints, progress and cancel.

### Access and private previews

- Active workspace members may list media and create one-hour signed URLs.
- Owner, administrator, content manager and designer roles may upload.
- Owner, administrator and content manager roles may delete any unused media.
- Designers may delete only their own unused media.
- Approvers and viewers have read-only media access.
- Anonymous users have no PostFlow Storage policies. Existing project-wide
  Storage grants are left unchanged so unrelated buckets are not disrupted.

Signed URLs are temporary presentation data: they are never stored in
PostgreSQL or `localStorage`. Each upload writes file metadata to
`media_assets` only after the object succeeds. If metadata extraction or the
database insert fails, PostFlow attempts to remove the new object. Deletion
removes the object through the Storage API and then removes its metadata; a
database trigger blocks metadata deletion while `post_media` links exist.
Because Storage and PostgreSQL operations are not atomic, the interface reports
partial deletion failures instead of hiding them.

### Apply and verify Stage 1C

Confirm the target project before applying anything. First create or reconcile
the remote bucket from the checked-in `config.toml` through the Storage API:

```bash
supabase link --project-ref <your-project-ref>
supabase seed buckets --linked
supabase migration list
supabase db push --dry-run
supabase db push
npm run db:types
```

The migration verifies that `postflow-media` is private with the exact MIME and
size restrictions and fails with a clear message if bucket seeding was skipped.
For a SQL Editor workflow, create the bucket in Storage with the same settings
before running the migration. Run
[`supabase/tests/stage_1c_storage_verification.sql`](./supabase/tests/stage_1c_storage_verification.sql)
section by section, then perform its two-account Storage API tests. Never run a
linked database reset or delete Storage metadata with SQL.

The checked-in database type file remains provisional until all migrations are
applied to a linked remote project. Regenerate it with `npm run db:types` after
application.

---

## Stage 1D real post CRUD

The local migration
[`supabase/migrations/20260805125425_stage_1d_post_crud.sql`](./supabase/migrations/20260805125425_stage_1d_post_crud.sql)
adds `posts.revision`, database-managed revision increments, immutable identity
guards, deferred final-state validation and five `SECURITY INVOKER` RPCs:
`create_post`, `update_post`, `delete_post`, `delete_posts` and
`duplicate_post`. Only `authenticated` may execute them; `anon` and `public`
are revoked. Authenticated writes to `posts`, `post_platforms`, and `post_media`
must carry the transaction-local context established by these RPCs, preventing
direct Data API writes from bypassing revision checks. RLS remains authoritative
inside every invoker function.

Post, platform and ordered `post_media` writes happen in one database
transaction. Media assets and Storage objects are referenced, never copied or
deleted with a post. Single and bulk deletion cascade only the child
relationships. Duplicate creates a new revision-1 draft with no schedule or
publishing result.

### Statuses, roles and conflicts

Browser clients may write only `draft`, `scheduled` and `cancelled`. Publishing
and approval result states are read-only until their trusted workflows exist.
A schedule requires a future UTC timestamp, a valid IANA time zone, a platform,
and caption or media content. The editor accepts workspace-local date/time and
uses `date-fns-tz` for DST-aware UTC conversion.

Owners, administrators and content managers can manage and schedule workspace
posts. Designers can create, edit and delete only their own drafts and can
duplicate visible posts into drafts. Approvers and viewers are read-only.
PostgreSQL enforces these rules; hidden controls are only a usability layer.

Editing uses `/dashboard/create?post=<uuid>` so static export needs no dynamic
route. `update_post` locks the row and compares the submitted revision. A stale
revision opens a conflict dialog that preserves local text and offers reload or
copy; it never silently overwrites the newer record.

### Apply and verify Stage 1D

Stages must be applied chronologically: Stage 1B, Stage 1C bucket plus
migration, then Stage 1D. This repository is not currently linked, so Stages 1C
and 1D have not been applied or browser-verified remotely.

```bash
supabase link --project-ref <your-project-ref>
supabase seed buckets --linked
supabase migration list
supabase db push --dry-run
supabase db push
npm run db:types
```

Run
[`supabase/tests/stage_1d_post_crud_verification.sql`](./supabase/tests/stage_1d_post_crud_verification.sql)
section by section. Catalog checks come first; run the behavior transaction only
with non-production accounts, then complete the two-user role and workspace
isolation pass and the browser checklist. Never use `supabase db reset --linked`
or expose a service-role/secret key to frontend code.

---

## Stage 2A Meta account connections

Stage 2A replaces the simulated Facebook and Instagram controls with a static
frontend calling six Supabase Edge Functions. The migration
[`supabase/migrations/20260805225307_stage_2a_social_connections.sql`](./supabase/migrations/20260805225307_stage_2a_social_connections.sql)
stores only sanitized connection metadata in `public.social_accounts`.
Credentials, hashed single-use OAuth state, and 15-minute selection sessions
live in the unexposed `private` schema. Only active workspace owners and
administrators can manage connections; every active member may read its own
workspace metadata. Browser roles cannot write account rows or access private
tables.

The callback exchanges the authorization code, discovers managed Facebook
Pages and linked Instagram Professional accounts, encrypts the temporary user
token, then redirects to the static Accounts page with only a session UUID. The
user selects destinations; the completion function re-discovers them, encrypts
each Page token, and commits all selected rows and credentials in one database
transaction. No access token, ciphertext, app secret, or authorization code is
sent to the frontend. Disconnect removes the local credential but deliberately
does not revoke provider-wide Meta permissions because that can affect other
destinations connected by the same Meta user.

### Meta application setup

1. Create or select a Meta developer application.
2. Configure Facebook Login for Business or the currently supported Meta OAuth product.
3. Add the deployed `meta-oauth-callback` Function URL as an exact OAuth redirect URI.
4. Configure a public PostFlow privacy-policy URL.
5. Configure public data-deletion instructions.
6. Add development users, testers, Facebook Pages, and linked Instagram Professional accounts.
7. Verify the scopes in `supabase/functions/_shared/meta-config.ts` against the current Meta documentation and app dashboard.
8. Complete Meta App Review and business-verification requirements before non-role users connect.
9. Test Facebook Pages and Instagram Business or Creator accounts, not personal Instagram accounts.
10. Keep the Meta app secret and every provider token out of frontend environment variables.

The scoped permissions support Page discovery/basic metadata and the later Page
and Instagram publishing stage. Advertising, messaging, friends, and personal
timeline permissions are not requested. Permission availability and review
requirements can change, so verify them in Meta's current documentation before
production deployment. Stage 2A does **not** publish posts.

### Function secrets and deployment

Set the placeholders from `supabase/functions/.env.example` in an ignored local
file: `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_API_VERSION`,
`META_OAUTH_REDIRECT_URI`, `POSTFLOW_APP_URL`, `ALLOWED_APP_ORIGINS`, and
`SOCIAL_TOKEN_ENCRYPTION_KEY`. The origins value is a comma-separated exact
allowlist. Include `http://localhost:3000` only in the ignored local secrets
file; hosted secrets should contain only Firebase Hosting and custom production
origins. The encryption key must be a base64-encoded 32-byte random key.

```bash
supabase secrets set --env-file supabase/functions/.env.production
supabase functions deploy meta-oauth-start
supabase functions deploy meta-oauth-callback --no-verify-jwt
supabase functions deploy meta-connection-options
supabase functions deploy meta-connection-complete
supabase functions deploy social-account-refresh
supabase functions deploy social-account-disconnect
```

Only the callback disables gateway JWT verification; it validates hashed,
expiring, single-use state internally. Every other function retains JWT
verification and calls Supabase Auth to establish the user. Tokens use
AES-256-GCM with a fresh 96-bit IV and a `v1` marker. For future key rotation,
deploy code able to read both versions, re-encrypt credentials during trusted
refresh/reconnect, and retire the old key after no old-version rows remain.

Apply migrations in order through Stage 2A, run
[`supabase/tests/stage_2a_social_connections_verification.sql`](./supabase/tests/stage_2a_social_connections_verification.sql)
section by section, deploy the Functions, configure secrets, and only then run
the two-user and real Meta browser checklist. This repository is not linked to
a remote Supabase project, so Stage 2A has not been applied, deployed, or
browser-tested. Regenerate types with `npm run db:types` after the remote
migration succeeds.

---

## Stage 2E-A TikTok account connection

Stage 2E-A connects one TikTok user account through the static Social Accounts
page and server-side Supabase Edge Functions. It requests only
`user.info.basic`; it does not request Content Posting API scopes and does not
make TikTok a publishing destination. The migration is
[`supabase/migrations/20260810120000_stage_2e_a_tiktok_connections.sql`](./supabase/migrations/20260810120000_stage_2e_a_tiktok_connections.sql).

Configure these server-only placeholders in the ignored Edge Function secrets
file: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and
`TIKTOK_OAUTH_REDIRECT_URI`. The flow also uses `POSTFLOW_APP_URL`,
`ALLOWED_APP_ORIGINS`, and `SOCIAL_TOKEN_ENCRYPTION_KEY`. Never add the TikTok
client secret or provider tokens to a `NEXT_PUBLIC_*` variable or Firebase
configuration.

In the TikTok Developer Sandbox, add the exact deployed callback URL as the Login
Kit redirect URI, enable Login Kit, request `user.info.basic`, and add the test
TikTok users who will complete authorization. After applying the migration,
deploy only the functions used by this stage:

```bash
supabase functions deploy tiktok-oauth-start
supabase functions deploy tiktok-oauth-callback --no-verify-jwt
supabase functions deploy social-account-refresh
supabase functions deploy social-account-disconnect
```

Run the Deno tests and
[`supabase/tests/stage_2e_a_tiktok_connection_regression.sql`](./supabase/tests/stage_2e_a_tiktok_connection_regression.sql)
against a disposable/local database. Then connect from Dashboard → Social
Accounts → Connect account → TikTok, confirm the basic profile appears, refresh
it, reconnect it, and disconnect it. TikTok video/photo publishing, scheduling,
analytics, comments, and messaging remain intentionally unavailable.

---

## Stage 2B publishing queue

Stage 2B adds durable Meta publishing without changing the static Next.js
architecture. The composer stores selected `post_destinations` in the same RPC
transaction as the post, platform rows and media links. Scheduling requires at
least one connected destination; drafts may remain destination-free. Owners,
administrators and content managers may schedule, publish, cancel or retry.
Designers may save their own drafts, while approvers and viewers remain read
only.

Supported operations are Facebook Page text, one image, and a qualifying Reel,
plus Instagram Professional one-image feed posts and qualifying Reels. Stories,
carousels, multi-image albums, personal Instagram accounts and every non-Meta
network remain unsupported and are rejected rather than silently altered.

The once-per-minute database Cron calls
`private.enqueue_due_publications(100)`. It locks due posts with
`FOR UPDATE SKIP LOCKED`, creates one immutable job per post revision and
destination, and sends only `{version, publishingJobId}` to the private durable
`postflow-publishing` pgmq queue. Snapshots contain the final caption, provider
settings, media IDs, paths and MIME metadata; they never contain tokens or
signed URLs.

`process-publishing-queue` claims at most five jobs and performs one provider
step per pass. Long-running containers are requeued instead of holding the
Function open. Safe transient failures use jittered 30-second, 2-minute,
5-minute, 15-minute and 30-minute backoff. A timeout after a final provider
submission becomes `reconciliation_required` and is never blindly retried.
Exactly-once database job creation does not imply exactly-once provider effects.

Credentials are decrypted only in worker memory. The private Storage bucket
remains private; the worker verifies the media row and object, creates a short
temporary signed URL immediately before submission, and never persists or logs
it. Per-account jobs, attempts, safe errors, retry timing, verified permalinks
and reconciliation guidance are visible at
`/dashboard/posts?publishing=<post-id>`.

### Deploy Stage 2B

Apply migrations in order: Stage 1B, 1C, 1D, 2A, then
`20260806110000_stage_2b_meta_publishing.sql`. Confirm each prior migration is
live before claiming media or Meta publishing works. Then configure the
placeholders in `supabase/functions/.env.example`, using a long random
`PUBLISHING_WORKER_SECRET`, and deploy only the worker without gateway JWT
verification:

```bash
supabase secrets set --env-file supabase/functions/.env.production
supabase functions deploy process-publishing-queue --no-verify-jwt
```

The worker still requires its constant-time checked
`x-postflow-worker-secret` header. Store the project URL and matching worker
secret in Supabase Vault, then run
`supabase/setup/stage_2b_worker_cron.example.sql` privately after replacing its
placeholders. Never commit the edited setup SQL. Use Meta test Pages and app-role
accounts until App Review is complete.

Run `supabase/tests/stage_2b_publishing_verification.sql` in small sections, then
complete the two-user isolation and rollback-only behavior templates. Run mocked
Edge tests with:

```bash
npx --yes deno test --allow-env supabase/functions/tests/*-test.ts
```

Real publication still requires the migration, Function, Meta secrets, Vault
secrets and both Cron jobs to be live. Manual provider verification is the only
Stage 2B reconciliation path; webhooks, analytics ingestion, provider deletion,
transcoding and automatic token-refresh Cron remain out of scope.

---

## Stage 3A approval workflow

Stage 3A replaces the simulated Approval Centre with workspace-scoped
`approval_requests`, immutable `approval_comments`, and append-only
`approval_events`. One pending request may exist per post. Submission records
the exact content revision, assigned approver, optional message and deadline.
Approving preserves that revision and returns a future, destination-backed post
to `scheduled`; otherwise it becomes `approved`. A planned time that passes
during review never triggers immediate publication.

Owners, administrators, content managers and designers may submit. Designers
may submit only their own drafts. Only owners, administrators and approvers may
decide requests, and approvers must be assigned unless the caller is an owner or
administrator. The requester and post creator can never approve, including
owners. Another active eligible member is therefore required.

Content, platform, media, destination, schedule or assignment edits advance the
post revision and supersede an approval for the edited revision. Workflow-only
status changes do not advance it. When `approval_required` is true, both Publish
Now and scheduled enqueue require an approved request matching the exact current
revision. Designers cannot change that flag; owners, administrators and content
managers can.

Comments are correction-by-addition: browser clients cannot update or delete
them and cannot create system comments. Events cannot be written by browser
clients. Hard deletion is blocked once approval history exists, preserving the
audit trail; Stage 3A does not introduce post archival.

Apply `20260806170000_stage_3a_approval_workflow.sql` after Stages 1B, 1C, 1D,
2A and 2B. Then regenerate the provisional types:

```bash
npm run db:types
```

Run `supabase/tests/stage_3a_approval_verification.sql` section by section, then
complete the rollback-only two-user role/isolation tests and the browser flow
with separate creator and approver accounts. This local implementation is not
live until the migration is applied and that two-user verification passes.
Email, SMS, push notifications, invitations, multi-stage approval chains,
external approval links, realtime dependency and AI review are deferred.

---

## Stage 3B teams and notifications

Stage 3B replaces the mock Team and top-bar notification data with workspace
memberships, hashed application invitations, append-only membership events and
private in-app notifications. Owners may invite and manage every role.
Administrators may manage only content managers, designers, approvers and
viewers. Lower roles have read-only team visibility. PostgreSQL enforces this
hierarchy even when a control is hidden in the interface.

Existing confirmed PostFlow users receive an in-app invitation and accept it
while signed in. New users receive Supabase Auth's invitation email from the
trusted `invite-workspace-member` Function. Only a SHA-256 hash is stored; the
raw application token exists only while the Function builds the acceptance URL
and while that URL is being used. Resending replaces the hash and invalidates
the older link. The static `/accept-invite` route supports both paths and
removes token parameters from browser history after the action.

Suspension keeps the membership but immediately removes workspace access
because every existing authorization helper requires `status = active`.
Removal deletes only the membership, preserving the Auth user, authored posts,
media metadata and the append-only event. The existing Stage 1B trigger still
prevents demoting, suspending, removing or leaving as the final active owner.
Ownership transfer first promotes the target and then demotes the caller in one
transaction.

Notifications cover team changes, approval events, terminal publishing states
and social-account reconnect states. They are readable only by their user and
read/archive changes go through owner-scoped RPCs. Realtime updates the badge
and latest list, but explicit reads remain authoritative after reconnects or
when Realtime is unavailable. Optional category preferences do not suppress
critical suspension, removal, revocation or ownership notices. No custom email,
SMS or push-notification preferences are claimed.

The Stage 1B Auth bootstrap remains unchanged for signup reliability. A new
user invited by email may therefore receive both a personal workspace and the
invited workspace after acceptance. PostFlow never trusts client-controlled
user metadata to select an invitation.

### Deploy Stage 3B

Apply migrations in order through
`20260806170000_stage_3a_approval_workflow.sql`, then apply
`20260806180000_stage_3b_team_notifications.sql`. Configure
`POSTFLOW_APP_URL` and `ALLOWED_APP_ORIGINS` as Edge Function secrets. Add these
exact routes to Supabase Auth URL Configuration:

```text
http://localhost:3000/accept-invite
https://your-production-domain/accept-invite
```

Deploy the authenticated Functions without `--no-verify-jwt`:

```bash
npx supabase functions deploy invite-workspace-member
npx supabase functions deploy resend-workspace-invitation
npm run db:types
```

Run `supabase/tests/stage_3b_team_notifications_verification.sql` one numbered
section at a time. Then run the mocked Edge suite and the full local checks:

```bash
npx --yes deno check supabase/functions/invite-workspace-member/index.ts
npx --yes deno check supabase/functions/resend-workspace-invitation/index.ts
npx --yes deno test --allow-env supabase/functions/tests/*-test.ts
npm run lint
npx tsc --noEmit
npm run build
```

Use separate owner, administrator, viewer, new-user and existing-user accounts
for the browser matrix. Confirm email delivery, in-app acceptance, isolation,
suspension, reactivation, removal, ownership protection, persistent/live
notifications, empty localStorage token results and secret-free frontend
bundles. This repository implementation is not operational until the migration
and Functions are deployed, redirect URLs are configured and that two-user
verification succeeds. Custom SMTP, public/guest approvals, push delivery,
SCIM, groups, per-platform member permissions and automatic notification
retention jobs remain deferred.

---

## Stage 4A operational analytics

The Analytics page reads one workspace-scoped aggregate from
`get_operational_analytics`. It reports PostFlow's own posts and publishing
records; it does not claim Meta reach, impressions, engagement or audience
insights. Filters support 7, 30 and 90 day periods, a custom period of up to
366 days, and Facebook or Instagram. Campaign filtering remains disabled
until campaigns have a real data model.

Metric definitions are intentionally operational:

- **Total posts** counts posts created in the selected period and compares them
  with the immediately preceding period of equal length.
- **Success rate** is `succeeded / (succeeded + failed)`. Jobs requiring
  reconciliation are reported separately because their provider outcome is
  not yet authoritative.
- **Publishing delay** measures completion after the scheduled job time.
- **Schedule consistency** is the share of successfully scheduled posts that
  complete no more than five minutes after their intended time. Publish Now
  jobs are excluded.
- **Content type** counts each post once per attached media type, or as text
  when it has no media. Time-series and weekday buckets use the workspace
  timezone.

Apply migrations in order through Stage 3B, then run
`supabase/migrations/20260806200000_stage_4a_operational_analytics.sql`. Run
`supabase/tests/stage_4a_operational_analytics_verification.sql` in a
non-production project and keep its fixture checks inside their rollback
transaction. After the remote migration succeeds, regenerate the provisional
RPC type:

```bash
npm run db:types
```

Stage 4A is not considered live until the migration and verification SQL have
passed on the linked project and authenticated browser tests confirm workspace
isolation, filters, empty/error states and timezone boundaries.

---

## Backend integration status

Supabase authentication, social account connections and publishing use dedicated
services. The unrelated AI placeholder remains in [`lib/services.ts`](./lib/services.ts):

| Service        | Status                                      |
| -------------- | ------------------------------------------- |
| `auth.*`       | Supabase Auth — implemented in Stage 1A     |
| `post-service` | Stage 1D CRUD and post reads implemented locally |
| `db.*`         | Workspace and media metadata connected      |
| `storage.*`    | Private Supabase Storage — implemented      |
| `social-account-service` | Stage 2A connection management implemented locally |
| `publishing-service` | Stage 2B queue controls and RLS reads implemented locally |
| `approval-service` | Stage 3A approval reads and controlled RPC actions implemented locally |
| `team-service` | Stage 3B invitations, roles and membership history implemented locally |
| `notification-service` | Stage 3B private notification history and preferences implemented locally |
| `analytics-service` | Stage 4A workspace-scoped operational aggregates implemented locally |
| `ai.*`         | Caption and hashtag generation — mocked     |

The remaining call sites already expose service-shaped interfaces, allowing
later stages to replace their implementations without redesigning the UI.

---

## Deploying to Firebase Hosting

The static export in `./out` is deployed as-is.

**One-time setup**

```bash
npm install -g firebase-tools
firebase login
```

Edit [`.firebaserc`](./.firebaserc) and replace `postflow-demo` with your real
Firebase project ID (or run `firebase use --add`).

**Build & deploy**

```bash
npm run build          # generates ./out
firebase deploy --only hosting
```

[`firebase.json`](./firebase.json) is already configured to serve the `out`
directory with `cleanUrls` and long-cache headers for static assets.

---

## Rebranding

The product name and logo are centralised:

- **Name / tagline** — `APP_NAME` and `APP_TAGLINE` in
  [`lib/constants.ts`](./lib/constants.ts)
- **Logo mark** — [`components/layout/Logo.tsx`](./components/layout/Logo.tsx)
- **Colours** — CSS variables in [`app/globals.css`](./app/globals.css)
  (consumed by [`tailwind.config.ts`](./tailwind.config.ts))

---

## Accessibility

Semantic HTML, labelled controls, visible focus rings, keyboard-accessible
modals/menus (Escape to close, focus management), descriptive button labels,
alt text, and colour choices with adequate contrast. Charts expose
`role="img"` with descriptive labels and pair colour with text so meaning never
depends on colour alone.

---

## Scripts

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the dev server                 |
| `npm run build` | Build the static export to `./out`   |
| `npm run serve` | Preview the built `./out` locally    |
| `npm run lint`  | Run Next.js ESLint                   |
| `npm run db:types` | Regenerate types from linked Supabase |
