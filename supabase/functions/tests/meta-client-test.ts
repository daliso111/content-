import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  discoverLinkedInstagramDestination,
  discoverMetaDestinations,
  exchangeAuthorizationCode,
  sanitizeDestinations,
} from "../_shared/meta-client.ts";
import type { MetaConfig } from "../_shared/meta-config.ts";

const config: MetaConfig = {
  appId: "test-app",
  appSecret: "test-secret",
  loginConfigId: "1234567890",
  graphVersion: "v99.0",
  redirectUri: "https://example.test/callback",
  appUrl: new URL("https://example.test"),
};

function mockJson(body: unknown, status = 200): typeof fetch {
  return (() => Promise.resolve(Response.json(body, { status }))) as typeof fetch;
}

Deno.test("discovers a Page and its linked Instagram Professional account without leaking raw data", async () => {
  const observedUrls: string[] = [];
  const observedAuthorizations: string[] = [];
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    observedUrls.push(url.toString());
    observedAuthorizations.push(new Headers(init?.headers).get("Authorization") ?? "");
    if (!url.pathname.endsWith("/me/accounts")) {
      assertEquals(
        url.searchParams.get("fields"),
        "id,name,instagram_business_account{id,username,name}",
      );
      assertEquals(url.searchParams.get("fields")?.includes("account_type"), false);
      assertEquals(url.searchParams.get("fields")?.includes("profile_picture_url"), false);
    }
    return Promise.resolve(Response.json(url.pathname.endsWith("/me/accounts") ? {
      data: [{
        id: "page-1",
        name: "PostFlow Page",
        access_token: "page-token",
        picture: { data: { url: "https://example.test/page.png" } },
      }],
    } : {
      instagram_business_account: {
          id: "ig-1",
          username: "postflow",
          name: "PostFlow",
      },
    }));
  }) as typeof fetch;
  const destinations = await discoverMetaDestinations(config, "user-token", fetcher);
  assertEquals(destinations.length, 2);
  assertEquals(destinations[0].accountType, "facebook_page");
  assertEquals(destinations[1].accountType, "instagram_business");
  assertEquals(destinations[1].parentPageId, "page-1");
  assertEquals(observedUrls.every((url) => !new URL(url).searchParams.has("access_token")), true);
  assertEquals(observedAuthorizations, ["Bearer user-token", "Bearer page-token"]);
  assertEquals("accessToken" in sanitizeDestinations(destinations)[1], false);
});

Deno.test("allows a Page with no linked Instagram account", async () => {
  const destinations = await discoverMetaDestinations(config, "user-token", mockJson({
    data: [{ id: "page-1", name: "Page only", access_token: "page-token" }],
  }));
  assertEquals(destinations.length, 1);
  assertEquals(destinations[0].platform, "facebook");
});

Deno.test("does not guess an unsupported Instagram account type", async () => {
  let call = 0;
  const fetcher = (() => {
    call += 1;
    return Promise.resolve(Response.json(call === 1
      ? {
        data: [{
          id: "page-1",
          name: "Page",
          access_token: "page-token",
        }],
      }
      : {
        instagram_business_account: {
          id: "ig-1",
          username: "personal",
          account_type: "PERSONAL",
        },
      }));
  }) as typeof fetch;
  const destinations = await discoverMetaDestinations(config, "user-token", fetcher);
  assertEquals(destinations.map((destination) => destination.platform), ["facebook"]);
});

Deno.test("maps an empty managed Page response safely", async () => {
  await assertRejects(() => discoverMetaDestinations(config, "user-token", mockJson({ data: [] })));
});

Deno.test("maps provider failures without returning a Graph payload", async () => {
  await assertRejects(() => discoverMetaDestinations(
    config,
    "user-token",
    mockJson({ error: { message: "raw provider detail", code: 2 } }, 503),
  ));
});

Deno.test("maps authorization-code exchange failure safely", async () => {
  await assertRejects(() => exchangeAuthorizationCode(
    config,
    "one-time-code",
    mockJson({ error: { message: "raw exchange detail", code: 100 } }, 400),
  ));
});

Deno.test("authorization-code exchange keeps secrets and codes out of URLs", async () => {
  const observedUrls: string[] = [];
  const observedBodies: string[] = [];
  let call = 0;
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
    observedUrls.push(String(input));
    observedBodies.push(String(init?.body ?? ""));
    call += 1;
    return Promise.resolve(Response.json(call === 1
      ? { access_token: "short-token" }
      : { access_token: "long-token", expires_in: 3600 }));
  }) as typeof fetch;
  await exchangeAuthorizationCode(config, "one-time-code", fetcher);
  assertEquals(observedUrls.every((url) => !url.includes("test-secret") && !url.includes("one-time-code")), true);
  assertEquals(observedBodies[0].includes("one-time-code"), true);
});

Deno.test("follows managed Page cursors without placing the token in the next URL", async () => {
  let accountCall = 0;
  const fetcher = ((input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(String(input));
    assertEquals(requestUrl.searchParams.has("access_token"), false);
    if (!requestUrl.pathname.endsWith("/me/accounts")) {
      assertEquals(new Headers(init?.headers).get("Authorization")?.startsWith("Bearer page-token-"), true);
      return Promise.resolve(Response.json({}));
    }
    assertEquals(new Headers(init?.headers).get("Authorization"), "Bearer user-token");
    accountCall += 1;
    return Promise.resolve(Response.json(accountCall === 1 ? {
        data: [{ id: "page-1", name: "First", access_token: "page-token-1" }],
        paging: { cursors: { after: "next-page" } },
      } : { data: [{ id: "page-2", name: "Second", access_token: "page-token-2" }] }));
  }) as typeof fetch;
  const destinations = await discoverMetaDestinations(config, "user-token", fetcher);
  assertEquals(destinations.map((destination) => destination.platformAccountId), ["page-1", "page-2"]);
});

Deno.test("refresh creates a linked Professional account without requesting account_type", async () => {
  let call = 0;
  const fetcher = ((input: RequestInfo | URL) => {
    call += 1;
    const fields = new URL(String(input)).searchParams.get("fields") ?? "";
    assertEquals(fields.includes("account_type"), false);
    return Promise.resolve(Response.json(call === 1 ? {
      instagram_business_account: { id: "ig-1", username: "postflow" },
    } : {
      id: "ig-1", username: "postflow", name: "PostFlow",
    }));
  }) as typeof fetch;
  const destination = await discoverLinkedInstagramDestination(
    config, "page-1", "page-token", fetcher,
  );
  assertEquals(destination?.platform, "instagram");
  assertEquals(destination?.accountType, "instagram_business");
  assertEquals(destination?.accessToken, "page-token");
  assertEquals(call, 1);
});

Deno.test("refresh falls back to connected_instagram_account without exposing the Page token", async () => {
  const authorizations: string[] = [];
  let call = 0;
  const fetcher = ((_input: RequestInfo | URL, init?: RequestInit) => {
    call += 1;
    authorizations.push(new Headers(init?.headers).get("Authorization") ?? "");
    return Promise.resolve(Response.json(call === 1 ? {} : {
      connected_instagram_account: {
        id: "ig-connected",
        username: "ithacadigitalsolutions",
        name: "Ithaca Digital Solutions",
        profile_picture_url: "https://example.test/instagram.png",
        account_type: "BUSINESS",
      },
    }));
  }) as typeof fetch;

  const destination = await discoverLinkedInstagramDestination(
    config, "page-1", "page-token", fetcher,
  );
  assertEquals(destination?.platformAccountId, "ig-connected");
  assertEquals(destination?.username, "ithacadigitalsolutions");
  assertEquals(destination?.parentPageId, "page-1");
  assertEquals(authorizations, ["Bearer page-token", "Bearer page-token"]);
});
