import assert from "node:assert/strict";
import test from "node:test";
import { handleTikTokMediaProxyRequest } from "../cloudflare/tiktok-media-proxy/worker";

const TOKEN = `${"a".repeat(64)}.${"b".repeat(43)}`;
const PUBLIC_URL = `https://media.towkn.com/media/${TOKEN}`;
const EXPECTED_UPSTREAM =
  `https://flipkskpaepmdvoypqca.supabase.co/functions/v1/tiktok-media/media/${TOKEN}`;

test("Cloudflare TikTok media proxy forwards GET without credentials", async () => {
  let upstreamUrl = "";
  let upstreamMethod = "";
  let upstreamHeaders = new Headers();
  const response = await handleTikTokMediaProxyRequest(
    new Request(PUBLIC_URL),
    ((input, init) => {
      const upstream = new Request(input, init);
      upstreamUrl = upstream.url;
      upstreamMethod = upstream.method;
      upstreamHeaders = upstream.headers;
      return Promise.resolve(
        new Response("video", {
          status: 200,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": "5",
            "Accept-Ranges": "bytes",
            ETag: '"safe-etag"',
            Location: "https://must-not-be-forwarded.example",
            "Set-Cookie": "private=value",
          },
        }),
      );
    }) as typeof fetch,
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "video");
  assert.equal(upstreamUrl, EXPECTED_UPSTREAM);
  assert.equal(upstreamMethod, "GET");
  assert.equal(upstreamHeaders.has("Authorization"), false);
  assert.equal(upstreamHeaders.has("apikey"), false);
  assert.equal(response.headers.get("Content-Type"), "video/mp4");
  assert.equal(response.headers.get("ETag"), '"safe-etag"');
  assert.equal(response.headers.has("Location"), false);
  assert.equal(response.headers.has("Set-Cookie"), false);
});

test("Cloudflare TikTok media proxy forwards HEAD without a body", async () => {
  let upstreamMethod = "";
  const response = await handleTikTokMediaProxyRequest(
    new Request(PUBLIC_URL, { method: "HEAD" }),
    ((_input, init) => {
      upstreamMethod = init?.method ?? "";
      return Promise.resolve(
        new Response(null, {
          status: 200,
          headers: { "Content-Type": "video/mp4", "Content-Length": "100" },
        }),
      );
    }) as typeof fetch,
  );
  assert.equal(response.status, 200);
  assert.equal(upstreamMethod, "HEAD");
  assert.equal(response.headers.get("Content-Length"), "100");
  assert.equal(await response.text(), "");
});

test("Cloudflare TikTok media proxy forwards Range and preserves 206 metadata", async () => {
  let forwardedRange: string | null = null;
  const response = await handleTikTokMediaProxyRequest(
    new Request(PUBLIC_URL, { headers: { Range: "bytes=10-19" } }),
    ((_input, init) => {
      forwardedRange = new Headers(init?.headers).get("Range");
      return Promise.resolve(
        new Response("0123456789", {
          status: 206,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": "10",
            "Content-Range": "bytes 10-19/100",
            "Accept-Ranges": "bytes",
          },
        }),
      );
    }) as typeof fetch,
  );
  assert.equal(response.status, 206);
  assert.equal(forwardedRange, "bytes=10-19");
  assert.equal(response.headers.get("Content-Range"), "bytes 10-19/100");
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
});

test("Cloudflare TikTok media proxy rejects unknown paths and invalid methods", async () => {
  let calls = 0;
  const fetcher = (() => {
    calls += 1;
    return Promise.resolve(new Response("must not be called"));
  }) as typeof fetch;
  const unknown = await handleTikTokMediaProxyRequest(
    new Request(`https://media.towkn.com/not-media/${TOKEN}`),
    fetcher,
  );
  assert.equal(unknown.status, 404);

  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    const invalid = await handleTikTokMediaProxyRequest(
      new Request(PUBLIC_URL, { method }),
      fetcher,
    );
    assert.equal(invalid.status, 405);
    assert.equal(invalid.headers.get("Allow"), "GET, HEAD");
  }
  assert.equal(calls, 0);
});

test("Cloudflare TikTok media proxy converts upstream redirects to a safe 502", async () => {
  const response = await handleTikTokMediaProxyRequest(
    new Request(PUBLIC_URL),
    (() =>
      Promise.resolve(
        new Response(null, {
          status: 302,
          headers: { Location: "https://private-upstream.example/object" },
        }),
      )) as typeof fetch,
  );
  assert.equal(response.status, 502);
  assert.equal(response.headers.has("Location"), false);
  assert.equal(
    (await response.text()).includes("private-upstream.example"),
    false,
  );
});

test("Cloudflare TikTok media proxy cannot be redirected by path or query input", async () => {
  const seenUrls: string[] = [];
  const fetcher = ((input) => {
    seenUrls.push(String(input));
    return Promise.resolve(new Response("video"));
  }) as typeof fetch;
  const queryAttempt = await handleTikTokMediaProxyRequest(
    new Request(`${PUBLIC_URL}?url=https://attacker.example/private`),
    fetcher,
  );
  assert.equal(queryAttempt.status, 200);
  assert.deepEqual(seenUrls, [EXPECTED_UPSTREAM]);
  assert.equal(seenUrls[0].includes("attacker.example"), false);

  const pathAttempt = await handleTikTokMediaProxyRequest(
    new Request(`${PUBLIC_URL}/https%3A%2F%2Fattacker.example`),
    fetcher,
  );
  assert.equal(pathAttempt.status, 404);
  assert.equal(seenUrls.length, 1);
  assert.match(seenUrls[0], /flipkskpaepmdvoypqca\.supabase\.co/);
});
