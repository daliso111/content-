"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { SocialPreview } from "@/components/posts/SocialPreview";
import { Tabs } from "@/components/ui/Tabs";
import { PlatformGlyph } from "@/components/ui/PlatformIcon";
import { PLATFORMS } from "@/lib/constants";
import {
  buildLivePreviewDestinations,
  LIVE_PREVIEW_EMPTY_MESSAGE,
  resolveLivePreviewContent,
} from "@/lib/live-preview";
import type {
  MediaItem,
  SocialAccountView,
  SocialPlatform,
} from "@/types";

interface CreatePostLivePreviewProps {
  accounts: SocialAccountView[];
  selectedDestinationIds: string[];
  caption: string;
  customiseCaptions: boolean;
  platformCaptions: Partial<Record<SocialPlatform, string>>;
  media: MediaItem[];
  youtubeTitle: string;
  youtubePrivacyStatus: string;
}

export function CreatePostLivePreview({
  accounts,
  selectedDestinationIds,
  caption,
  customiseCaptions,
  platformCaptions,
  media,
  youtubeTitle,
  youtubePrivacyStatus,
}: CreatePostLivePreviewProps) {
  const [activeDestinationId, setActiveDestinationId] = useState("");
  const destinations = useMemo(
    () => buildLivePreviewDestinations(
      accounts.map(({ account }) => account),
      selectedDestinationIds,
    ),
    [accounts, selectedDestinationIds],
  );
  const activeDestination =
    destinations.find(({ id }) => id === activeDestinationId) ?? destinations[0];

  if (!activeDestination) {
    return (
      <p className="py-10 text-center text-sm text-ink-subtle">
        {LIVE_PREVIEW_EMPTY_MESSAGE}
      </p>
    );
  }

  const platformCounts = destinations.reduce<Partial<Record<SocialPlatform, number>>>(
    (counts, destination) => ({
      ...counts,
      [destination.platform]: (counts[destination.platform] ?? 0) + 1,
    }),
    {},
  );
  const previewContent = resolveLivePreviewContent({
    platform: activeDestination.platform,
    caption,
    customiseCaptions,
    platformCaptions,
    media,
    youtubeTitle,
    youtubePrivacyStatus,
  });

  return (
    <>
      <Tabs
        className="mb-4"
        active={activeDestination.id}
        onChange={setActiveDestinationId}
        tabs={destinations.map((destination) => ({
          id: destination.id,
          label: (
            <span className="flex items-center gap-1.5">
              <PlatformGlyph platform={destination.platform} size="sm" />
              <span>{PLATFORMS[destination.platform].label}</span>
              {(platformCounts[destination.platform] ?? 0) > 1 && (
                <span className="max-w-28 truncate text-xs text-ink-subtle">
                  · {destination.accountName}
                </span>
              )}
            </span>
          ),
        }))}
      />
      {activeDestination.connectionStatus !== "connected" && (
        <div
          role="status"
          className="mb-4 flex gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs text-ink-muted"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>
            This destination is disconnected. Reconnect it before publishing.
          </span>
        </div>
      )}
      {activeDestination.platform === "tiktok" && (
        <div
          role="status"
          className="mb-4 flex gap-2 rounded-lg border border-warning/30 bg-warning-soft p-3 text-xs text-ink-muted"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>
            This preview is approximate; TikTok applies final processing and presentation.
          </span>
        </div>
      )}
      <SocialPreview
        platform={activeDestination.platform}
        caption={previewContent.caption}
        media={previewContent.media}
        accountName={activeDestination.accountName}
        handle={activeDestination.handle}
        avatarUrl={activeDestination.avatarUrl}
        title={previewContent.title}
        privacyStatus={previewContent.privacyStatus}
      />
    </>
  );
}
