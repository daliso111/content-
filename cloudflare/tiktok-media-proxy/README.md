# Towkn TikTok media proxy

This credential-free Cloudflare Worker exposes only:

```text
GET  https://media.towkn.com/media/<SIGNED_TOKEN>
HEAD https://media.towkn.com/media/<SIGNED_TOKEN>
```

It forwards the same token to the fixed Towkn Supabase Edge Function:

```text
https://flipkskpaepmdvoypqca.supabase.co/functions/v1/tiktok-media/media/<SIGNED_TOKEN>
```

The Worker does not validate or replace the HMAC token. The Supabase function
remains responsible for token verification, workspace/media binding, database
lookup, and private Storage streaming. The Worker contains no provider or
Supabase credentials and does not log request URLs.

## Deploy and attach the custom domain

1. From this directory, deploy the Worker with `npx wrangler deploy`.
2. In Cloudflare Dashboard, open **Compute (Workers & Pages)**.
3. Select **towkn-tiktok-media-proxy**.
4. Open **Settings**, then **Domains & Routes**.
5. Choose **Add**, then **Custom Domain**.
6. Enter `media.towkn.com` and choose **Add Custom Domain**.
7. Wait until Cloudflare reports the custom domain as active. Cloudflare creates
   the required DNS record and certificate after this explicit confirmation.

Before step 5, remove or resolve any existing CNAME on `media.towkn.com`;
Cloudflare cannot attach a Worker Custom Domain to a hostname that already has
one.

The custom domain is deliberately absent from `wrangler.toml`, so deploying the
Worker does not attach or change DNS automatically.
