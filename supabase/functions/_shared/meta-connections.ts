import type { MetaDestination } from "./meta-client.ts";

export function expandSelectedMetaDestinations(
  destinations: readonly MetaDestination[],
  selectedAccountIds: readonly string[],
): MetaDestination[] {
  const selectedIds = new Set(selectedAccountIds);
  const selectedPageIds = new Set(
    destinations
      .filter((destination) =>
        destination.platform === "facebook"
        && selectedIds.has(destination.platformAccountId)
      )
      .map((destination) => destination.platformAccountId),
  );

  return destinations.filter((destination) =>
    selectedIds.has(destination.platformAccountId)
    || (
      destination.platform === "instagram"
      && destination.parentPageId !== null
      && selectedPageIds.has(destination.parentPageId)
    )
  );
}
