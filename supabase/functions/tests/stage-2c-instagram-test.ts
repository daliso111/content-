import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { socialAccountIdentity } from "../../../lib/social-account-presentation.ts";
import { expandSelectedMetaDestinations } from "../_shared/meta-connections.ts";
import type { MetaDestination } from "../_shared/meta-client.ts";

const facebook: MetaDestination = {
  platform: "facebook",
  platformAccountId: "page-1",
  accountName: "Ithaca Digital Solutions",
  username: null,
  profileImageUrl: null,
  accountType: "facebook_page",
  parentPageId: null,
  accessToken: "page-token",
};

const instagram: MetaDestination = {
  platform: "instagram",
  platformAccountId: "ig-1",
  accountName: "ithacadigitalsolutions",
  username: "ithacadigitalsolutions",
  profileImageUrl: null,
  accountType: "instagram_business",
  parentPageId: "page-1",
  accessToken: "page-token",
};

Deno.test("selecting a Facebook Page also connects its linked Instagram account once", () => {
  const selected = expandSelectedMetaDestinations(
    [facebook, instagram],
    ["page-1"],
  );
  assertEquals(selected.map((destination) => destination.platform), ["facebook", "instagram"]);
  assertEquals(new Set(selected.map((destination) => destination.platformAccountId)).size, 2);
  assertEquals(selected[0], facebook);
});

Deno.test("a Facebook Page without linked Instagram remains intact", () => {
  assertEquals(expandSelectedMetaDestinations([facebook], ["page-1"]), [facebook]);
});

Deno.test("explicit Instagram selection is not duplicated during reconnect", () => {
  const selected = expandSelectedMetaDestinations(
    [facebook, instagram],
    ["page-1", "ig-1"],
  );
  assertEquals(selected.length, 2);
  assertEquals(selected.filter((destination) => destination.platform === "instagram").length, 1);
});

Deno.test("Social Accounts presents Facebook and Instagram as separate identities", () => {
  const facebookIdentity = socialAccountIdentity({
    platform: "facebook",
    account_name: "Ithaca Digital Solutions",
    username: null,
    platform_account_id: "page-1",
  });
  const instagramIdentity = socialAccountIdentity({
    platform: "instagram",
    account_name: "ithacadigitalsolutions",
    username: "ithacadigitalsolutions",
    platform_account_id: "ig-1",
  });
  assertEquals(facebookIdentity.platformLabel, "Facebook");
  assertEquals(facebookIdentity.primary, "Ithaca Digital Solutions");
  assertEquals(instagramIdentity.platformLabel, "Instagram");
  assertEquals(instagramIdentity.primary, "@ithacadigitalsolutions");
});
