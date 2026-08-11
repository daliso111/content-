import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  generateTikTokMediaRelayUrl,
  resolveTikTokMediaTtlSeconds,
  signTikTokMediaToken,
  TikTokMediaTokenError,
  verifyTikTokMediaToken,
} from "../_shared/tiktok-media-token.ts";
import { initializeVideoPost } from "../_shared/tiktok-posting-client.ts";
import {
  findTikTokRelayMediaAsset,
  handleTikTokMediaRequest,
  type TikTokMediaHandlerDependencies,
  type TikTokRelayMediaAsset,
} from "../tiktok-media/handler.ts";

const WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSPACE_ID = "11111111-1111-4111-8111-222222222222";
const MEDIA_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_MEDIA_ID = "22222222-2222-4222-8222-333333333333";
const SIGNING_KEY = "test-only-tiktok-media-signing-key-at-least-32-bytes";
const NOW = 2_000_000_000;
const SERVICE_SECRET = "test-service-role-value-never-returned";
const STORAGE_PATH = `${WORKSPACE_ID}/uploader/2026/08/private-video.mp4`;

const videoAsset: TikTokRelayMediaAsset = {
  id: MEDIA_ID,
  workspace_id: WORKSPACE_ID,
  storage_bucket: "postflow-media",
  storage_path: STORAGE_PATH,
  media_type: "video",
  mime_type: "video/mp4",
};

function environment(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    SUPABASE_URL: "https://project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_SECRET,
    TIKTOK_MEDIA_SIGNING_KEY: SIGNING_KEY,
    TIKTOK_MEDIA_VERIFICATION_FILENAME: "tiktok-verification.txt",
    TIKTOK_MEDIA_VERIFICATION_CONTENT: "exact-verification-content",
    ...overrides,
  };
  return (name: string) => values[name];
}

async function mediaToken(
  workspaceId = WORKSPACE_ID,
  mediaAssetId = MEDIA_ID,
  expiresAt = NOW + 3600,
): Promise<string> {
  return signTikTokMediaToken(
    { workspaceId, mediaAssetId, expiresAt },
    SIGNING_KEY,
  );
}

async function mediaRequest(
  token: string,
  init: RequestInit = {},
): Promise<Request> {
  return new Request(
    `https://project.supabase.co/functions/v1/tiktok-media/media/${token}`,
    init,
  );
}

function dependencies(
  overrides: Partial<TikTokMediaHandlerDependencies> = {},
): TikTokMediaHandlerDependencies {
  return {
    env: environment(),
    nowSeconds: NOW,
    findAsset: () => Promise.resolve(videoAsset),
    fetcher: (() =>
      Promise.resolve(
        new Response("video", {
          status: 200,
          headers: {
            "Content-Type": "video/mp4",
            "Content-Length": "5",
            "Accept-Ranges": "bytes",
          },
        }),
      )) as typeof fetch,
    ...overrides,
  };
}

Deno.test("TikTok relay token accepts valid payload and rejects expiry, alteration, and malformed values", async () => {
  const valid = await mediaToken();
  assertEquals(await verifyTikTokMediaToken(valid, SIGNING_KEY, NOW), {
    workspaceId: WORKSPACE_ID,
    mediaAssetId: MEDIA_ID,
    expiresAt: NOW + 3600,
  });

  const expired = await mediaToken(WORKSPACE_ID, MEDIA_ID, NOW);
  await assertRejects(
    () => verifyTikTokMediaToken(expired, SIGNING_KEY, NOW),
    TikTokMediaTokenError,
  );

  const [payload, signature] = valid.split(".");
  const alteredSignature = `${signature[0] === "A" ? "B" : "A"}${
    signature.slice(1)
  }`;
  await assertRejects(
    () =>
      verifyTikTokMediaToken(
        `${payload}.${alteredSignature}`,
        SIGNING_KEY,
        NOW,
      ),
    TikTokMediaTokenError,
  );
  await assertRejects(
    () => verifyTikTokMediaToken("malformed", SIGNING_KEY, NOW),
    TikTokMediaTokenError,
  );
});

Deno.test("TikTok relay URL has the stable prefix and respects video TTL", async () => {
  const url = await generateTikTokMediaRelayUrl(WORKSPACE_ID, MEDIA_ID, {
    supabaseUrl: "https://project.supabase.co",
    signingKey: SIGNING_KEY,
    ttlSeconds: 7200,
    nowSeconds: NOW,
  });
  assertStringIncludes(
    url,
    "https://project.supabase.co/functions/v1/tiktok-media/media/",
  );
  assertEquals(url.includes("/storage/v1/object/sign/"), false);
  const token = decodeURIComponent(new URL(url).pathname.split("/").at(-1)!);
  assertEquals(
    (await verifyTikTokMediaToken(token, SIGNING_KEY, NOW)).expiresAt,
    NOW + 7200,
  );
  assertEquals(resolveTikTokMediaTtlSeconds(undefined), 21_600);
  assertEquals(resolveTikTokMediaTtlSeconds("300"), 300);
  assertEquals(resolveTikTokMediaTtlSeconds("86401"), 21_600);
});

Deno.test("TikTok public media base changes only the URL wrapper, not the signed token", async () => {
  const options = {
    supabaseUrl: "https://project.supabase.co",
    signingKey: SIGNING_KEY,
    ttlSeconds: 7200,
    nowSeconds: NOW,
  };
  const fallbackUrl = await generateTikTokMediaRelayUrl(
    WORKSPACE_ID,
    MEDIA_ID,
    options,
  );
  const previousPublicBase = Deno.env.get("TIKTOK_MEDIA_PUBLIC_BASE_URL");
  Deno.env.set("TIKTOK_MEDIA_PUBLIC_BASE_URL", "https://media.towkn.com/");
  let publicUrl = "";
  try {
    publicUrl = await generateTikTokMediaRelayUrl(
      WORKSPACE_ID,
      MEDIA_ID,
      options,
    );
  } finally {
    if (previousPublicBase === undefined) {
      Deno.env.delete("TIKTOK_MEDIA_PUBLIC_BASE_URL");
    } else {
      Deno.env.set("TIKTOK_MEDIA_PUBLIC_BASE_URL", previousPublicBase);
    }
  }
  assertEquals(
    publicUrl,
    `https://media.towkn.com/media/${fallbackUrl.split("/").at(-1)}`,
  );
  assertEquals(publicUrl.includes("supabase.co"), false);
  assertEquals(publicUrl.includes("/storage/v1/object/sign/"), false);
  assertEquals(publicUrl.includes("/functions/v1/tiktok-media"), false);
});

Deno.test("TikTok Direct Post receives the relay URL instead of a Storage signed URL", async () => {
  const relayUrl = await generateTikTokMediaRelayUrl(WORKSPACE_ID, MEDIA_ID, {
    supabaseUrl: "https://project.supabase.co",
    publicBaseUrl: "https://media.towkn.com",
    signingKey: SIGNING_KEY,
    ttlSeconds: 3600,
    nowSeconds: NOW,
  });
  let suppliedVideoUrl = "";
  await initializeVideoPost(
    "test-access-token",
    {
      title: "Relay URL test",
      privacyLevel: "SELF_ONLY",
      disableComment: true,
      disableDuet: true,
      disableStitch: true,
      brandContentToggle: false,
      brandOrganicToggle: false,
      videoUrl: relayUrl,
    },
    ((_input, init) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        source_info?: { video_url?: string };
      };
      suppliedVideoUrl = requestBody.source_info?.video_url ?? "";
      return Promise.resolve(Response.json({
        data: { publish_id: "publish-123" },
        error: { code: "ok" },
      }));
    }) as typeof fetch,
  );
  assertStringIncludes(suppliedVideoUrl, "https://media.towkn.com/media/");
  assertEquals(suppliedVideoUrl.includes("/storage/v1/object/sign/"), false);
  assertEquals(
    suppliedVideoUrl.includes("supabase.co/functions/v1/tiktok-media"),
    false,
  );
});

Deno.test("TikTok relay database lookup binds media, workspace, bucket, and video type", async () => {
  const filters: Array<[string, unknown]> = [];
  const query = {
    select: () => query,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    maybeSingle: () => Promise.resolve({ data: videoAsset, error: null }),
  };
  const client = {
    from: (table: string) => {
      assertEquals(table, "media_assets");
      return query;
    },
  } as unknown as SupabaseClient;
  assertEquals(
    await findTikTokRelayMediaAsset(client, WORKSPACE_ID, MEDIA_ID),
    videoAsset,
  );
  assertEquals(filters, [
    ["id", MEDIA_ID],
    ["workspace_id", WORKSPACE_ID],
    ["storage_bucket", "postflow-media"],
    ["media_type", "video"],
  ]);
});

Deno.test("TikTok relay streams a complete private Storage response without leaking credentials", async () => {
  let upstreamUrl = "";
  let upstreamAuthorization: string | null = null;
  let upstreamApiKey: string | null = null;
  const response = await handleTikTokMediaRequest(
    await mediaRequest(await mediaToken()),
    dependencies({
      fetcher: ((input, init) => {
        const upstreamRequest = new Request(input, init);
        upstreamUrl = upstreamRequest.url;
        upstreamAuthorization = upstreamRequest.headers.get("Authorization");
        upstreamApiKey = upstreamRequest.headers.get("apikey");
        return Promise.resolve(
          new Response("video", {
            status: 200,
            headers: {
              "Content-Type": "video/mp4",
              "Content-Length": "5",
              "Accept-Ranges": "bytes",
              ETag: '"safe-etag"',
              "Set-Cookie": "private-cookie=value",
              "x-private-storage-header": "internal",
            },
          }),
        );
      }) as typeof fetch,
    }),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.text(), "video");
  assertEquals(response.headers.get("Content-Type"), "video/mp4");
  assertEquals(response.headers.get("Accept-Ranges"), "bytes");
  assertEquals(response.headers.get("ETag"), '"safe-etag"');
  assertEquals(response.headers.has("Set-Cookie"), false);
  assertEquals(response.headers.has("x-private-storage-header"), false);
  assertStringIncludes(
    upstreamUrl,
    "/storage/v1/object/authenticated/postflow-media/",
  );
  assertEquals(upstreamAuthorization, `Bearer ${SERVICE_SECRET}`);
  assertEquals(upstreamApiKey, SERVICE_SECRET);
  assertEquals(response.headers.has("Authorization"), false);
  assertEquals(response.headers.has("apikey"), false);
});

Deno.test("TikTok relay rejects different workspace, different media, missing, and non-video assets", async () => {
  let storageCalls = 0;
  const fetcher = (() => {
    storageCalls += 1;
    return Promise.resolve(new Response("must not be called"));
  }) as typeof fetch;
  const findAsset = (workspaceId: string, mediaAssetId: string) =>
    Promise.resolve(
      workspaceId === WORKSPACE_ID && mediaAssetId === MEDIA_ID
        ? videoAsset
        : null,
    );

  for (
    const token of [
      await mediaToken(OTHER_WORKSPACE_ID, MEDIA_ID),
      await mediaToken(WORKSPACE_ID, OTHER_MEDIA_ID),
    ]
  ) {
    const response = await handleTikTokMediaRequest(
      await mediaRequest(token),
      dependencies({ findAsset, fetcher }),
    );
    assertEquals(response.status, 404);
  }

  const missing = await handleTikTokMediaRequest(
    await mediaRequest(await mediaToken()),
    dependencies({ findAsset: () => Promise.resolve(null), fetcher }),
  );
  assertEquals(missing.status, 404);

  const nonVideo = await handleTikTokMediaRequest(
    await mediaRequest(await mediaToken()),
    dependencies({
      findAsset: () =>
        Promise.resolve({
          ...videoAsset,
          media_type: "image",
          mime_type: "image/jpeg",
        }),
      fetcher,
    }),
  );
  assertEquals(nonVideo.status, 404);
  assertEquals(storageCalls, 0);
});

Deno.test("TikTok relay forwards a valid Range and preserves a 206 response", async () => {
  let forwardedRange: string | null = null;
  const response = await handleTikTokMediaRequest(
    await mediaRequest(await mediaToken(), {
      headers: { Range: "bytes=10-19" },
    }),
    dependencies({
      fetcher: ((_input, init) => {
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
    }),
  );
  assertEquals(response.status, 206);
  assertEquals(forwardedRange, "bytes=10-19");
  assertEquals(response.headers.get("Content-Range"), "bytes 10-19/100");
  assertEquals(response.headers.get("Content-Length"), "10");
  assertEquals(response.headers.get("Accept-Ranges"), "bytes");
});

Deno.test("TikTok relay supports HEAD, rejects invalid methods, and never forwards redirects", async () => {
  let upstreamMethod = "";
  const head = await handleTikTokMediaRequest(
    await mediaRequest(await mediaToken(), { method: "HEAD" }),
    dependencies({
      fetcher: ((_input, init) => {
        upstreamMethod = init?.method ?? "";
        return Promise.resolve(
          new Response(null, {
            status: 200,
            headers: { "Content-Type": "video/mp4", "Content-Length": "100" },
          }),
        );
      }) as typeof fetch,
    }),
  );
  assertEquals(head.status, 200);
  assertEquals(upstreamMethod, "HEAD");
  assertEquals(await head.text(), "");
  assertEquals(head.headers.get("Content-Length"), "100");

  const invalidMethod = await handleTikTokMediaRequest(
    await mediaRequest(await mediaToken(), { method: "POST" }),
    dependencies(),
  );
  assertEquals(invalidMethod.status, 405);
  assertEquals(invalidMethod.headers.get("Allow"), "GET, HEAD");

  const redirect = await handleTikTokMediaRequest(
    await mediaRequest(await mediaToken()),
    dependencies({
      fetcher: (() =>
        Promise.resolve(
          new Response(null, {
            status: 302,
            headers: { Location: "https://private.example/storage-object" },
          }),
        )) as typeof fetch,
    }),
  );
  assertEquals(redirect.status, 502);
  assertEquals(redirect.headers.has("Location"), false);
});

Deno.test("TikTok relay errors never expose private paths or service credentials", async () => {
  const response = await handleTikTokMediaRequest(
    await mediaRequest(await mediaToken()),
    dependencies({
      fetcher: (() =>
        Promise.reject(
          new Error(`${SERVICE_SECRET} failed while reading ${STORAGE_PATH}`),
        )) as typeof fetch,
    }),
  );
  const body = await response.text();
  assertEquals(response.status, 502);
  assertEquals(body.includes(SERVICE_SECRET), false);
  assertEquals(body.includes(STORAGE_PATH), false);
});

Deno.test("TikTok verification route returns only the exact configured file", async () => {
  const exact = await handleTikTokMediaRequest(
    new Request(
      "https://project.supabase.co/functions/v1/tiktok-media/tiktok-verification.txt",
    ),
    dependencies(),
  );
  assertEquals(exact.status, 200);
  assertEquals(exact.headers.get("Content-Type"), "text/plain; charset=utf-8");
  assertEquals(await exact.text(), "exact-verification-content");

  const wrong = await handleTikTokMediaRequest(
    new Request(
      "https://project.supabase.co/functions/v1/tiktok-media/wrong-file.txt",
    ),
    dependencies(),
  );
  assertEquals(wrong.status, 404);
  assertEquals(
    (await wrong.text()).includes("exact-verification-content"),
    false,
  );
});

Deno.test("TikTok is the only publishing branch that replaces signed Storage URLs", async () => {
  const source = await Deno.readTextFile(
    new URL("../_shared/publishing/publisher.ts", import.meta.url),
  );
  const youtubeBranch = source.slice(
    source.indexOf('if (claim.job.platform === "youtube")'),
    source.indexOf('if (claim.job.platform === "tiktok")'),
  );
  const tiktokBranch = source.slice(
    source.indexOf('if (claim.job.platform === "tiktok")'),
    source.indexOf("const token = await decryptToken"),
  );
  const metaBranch = source.slice(
    source.indexOf("const token = await decryptToken"),
  );
  assertStringIncludes(youtubeBranch, "signedMediaUrl(");
  assertStringIncludes(tiktokBranch, "generateTikTokMediaRelayUrl(");
  assertEquals(tiktokBranch.includes("signedMediaUrl("), false);
  assertStringIncludes(metaBranch, "signedMediaUrl(");
});
