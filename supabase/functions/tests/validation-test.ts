import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertAllowedOrigin, corsHeaders } from "../_shared/cors.ts";
import { buildMetaAuthorizationUrl, getMetaConfig, missingMetaScopes } from "../_shared/meta-config.ts";
import { requireUniqueIds, validateReturnPath } from "../_shared/validation.ts";

Deno.test("allows only the Stage 2A return path", () => {
  assertEquals(validateReturnPath("/dashboard/accounts"), "/dashboard/accounts");
  assertThrows(() => validateReturnPath("https://attacker.test"));
});

Deno.test("rejects duplicate account selection", () => {
  assertThrows(() => requireUniqueIds(["page-1", "page-1"]));
  assertEquals(requireUniqueIds(["page-1", "ig-1"]), ["page-1", "ig-1"]);
});

Deno.test("CORS returns the exact allowed origin and rejects another origin", () => {
  Deno.env.set("ALLOWED_APP_ORIGINS", "https://app.example.test");
  const allowed = new Request("https://function.example.test", {
    headers: { Origin: "https://app.example.test" },
  });
  const denied = new Request("https://function.example.test", {
    headers: { Origin: "https://attacker.test" },
  });
  assertAllowedOrigin(allowed);
  assertEquals(new Headers(corsHeaders(allowed)).get("Access-Control-Allow-Origin"), "https://app.example.test");
  assertThrows(() => assertAllowedOrigin(denied));
});

Deno.test("localhost requires explicit development configuration", () => {
  Deno.env.set("ALLOWED_APP_ORIGINS", "https://app.example.test");
  const localhost = new Request("https://function.example.test", {
    headers: { Origin: "http://localhost:3000" },
  });
  assertThrows(() => assertAllowedOrigin(localhost));
  Deno.env.set("ALLOWED_APP_ORIGINS", "http://localhost:3000");
  assertAllowedOrigin(localhost);
});

Deno.test("required scopes are destination-specific", () => {
  const pageScopes = ["pages_show_list", "pages_read_engagement", "pages_manage_posts"];
  assertEquals(missingMetaScopes("facebook", pageScopes), []);
  assertEquals(missingMetaScopes("instagram", pageScopes), [
    "instagram_basic",
    "instagram_content_publish",
  ]);
});

Deno.test("Business Login authorization URL uses the server-side configuration", () => {
  const authorizationUrl = new URL(buildMetaAuthorizationUrl({
    appId: "test-app",
    appSecret: "test-secret",
    loginConfigId: "1234567890",
    graphVersion: "v99.0",
    redirectUri: "https://example.test/callback",
    appUrl: new URL("https://example.test"),
  }, "test-state"));

  assertEquals(authorizationUrl.searchParams.get("client_id"), "test-app");
  assertEquals(authorizationUrl.searchParams.get("redirect_uri"), "https://example.test/callback");
  assertEquals(authorizationUrl.searchParams.get("state"), "test-state");
  assertEquals(authorizationUrl.searchParams.get("response_type"), "code");
  assertEquals(authorizationUrl.searchParams.get("config_id"), "1234567890");
  assertEquals(authorizationUrl.searchParams.get("override_default_response_type"), "true");
  assertEquals(authorizationUrl.searchParams.has("scope"), false);
  assertEquals(authorizationUrl.searchParams.has("auth_type"), false);
});

Deno.test("server Meta configuration requires a numeric Business Login configuration ID", () => {
  const variableNames = [
    "META_APP_ID",
    "META_APP_SECRET",
    "META_LOGIN_CONFIG_ID",
    "META_GRAPH_API_VERSION",
    "META_OAUTH_REDIRECT_URI",
    "POSTFLOW_APP_URL",
    "ALLOWED_APP_ORIGINS",
  ] as const;
  const originalValues = new Map(variableNames.map((name) => [name, Deno.env.get(name)]));

  try {
    Deno.env.set("META_APP_ID", "test-app");
    Deno.env.set("META_APP_SECRET", "test-secret");
    Deno.env.set("META_GRAPH_API_VERSION", "v99.0");
    Deno.env.set("META_OAUTH_REDIRECT_URI", "https://example.test/callback");
    Deno.env.set("POSTFLOW_APP_URL", "https://example.test");
    Deno.env.set("ALLOWED_APP_ORIGINS", "https://example.test");
    Deno.env.set("META_LOGIN_CONFIG_ID", "not-a-configuration-id");
    assertThrows(() => getMetaConfig());

    Deno.env.set("META_LOGIN_CONFIG_ID", "1234567890");
    assertEquals(getMetaConfig().loginConfigId, "1234567890");
  } finally {
    for (const [name, value] of originalValues) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
});
