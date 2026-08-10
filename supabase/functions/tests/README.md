# Stage 2A and 2B Edge Function tests

Provider unit tests use mocked `fetch` responses and never call Meta. Run them
from the repository root with Deno installed:

```bash
npx --yes deno test --allow-env supabase/functions/tests/*-test.ts
```

The automated tests cover AES-GCM round trips, unique IVs, tamper detection,
Page-only and paginated discovery, recognized Instagram account typing, no
Pages, safe provider failure mapping, secret-free URLs, required-scope checks,
return-path/selection validation, exact-origin CORS, worker-secret rejection,
queue-empty handling, Facebook/Instagram publishing state transitions, bounded
retry, retry exhaustion, safe URL redaction and ambiguous-result handling.
Complete the remaining HTTP and database integration cases
against a local Supabase stack with placeholder-only local secrets:

| Case | Expected result |
| --- | --- |
| Missing or invalid JWT | Authenticated functions return `AUTH_REQUIRED` |
| Viewer starts/completes connection | `WORKSPACE_ROLE_DENIED` |
| Owner starts connection | Hashed state row, safe authorization URL, 10-minute expiry |
| Invalid, expired or reused state | Callback redirects with the matching safe state code |
| Provider cancellation or missing code | Safe callback error; no token or code in redirect |
| Token exchange failure | `META_TOKEN_EXCHANGE_FAILED`; consumed state stays unusable |
| Multiple selections | All rows and credentials commit, or the whole RPC rolls back |
| Already connected destination | Existing metadata and encrypted credential are replaced safely |
| Expired connection session | `CONNECTION_SESSION_EXPIRED`; no account changes |
| Disconnect then reconnect | Credential removed, history preserved, later OAuth restores it |
| Token decryption failure | Safe error and `reconnect_required`; no crypto detail returned |
| Disallowed CORS origin | `CORS_DENIED` with no wildcard origin header |
| Unsafe return path | `UNSAFE_RETURN_PATH`; no state row created |

Also run the callback against mocked Page sets with zero, one, and many linked
Instagram accounts. Inspect browser storage and URLs to confirm they never
contain user tokens, Page tokens, ciphertext, authorization codes, or secrets.
