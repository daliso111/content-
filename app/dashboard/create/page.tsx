"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Hash,
  Smile,
  Sparkles,
  X,
  Save,
  CalendarClock,
  ShieldCheck,
  Zap,
  Clock,
  Globe,
  ImagePlus,
  RefreshCw,
  Send,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Textarea, Input, Select, FormField, Toggle } from "@/components/ui/Field";
import { UploadArea } from "@/components/ui/UploadArea";
import { Modal } from "@/components/ui/Modal";
import { SearchInput } from "@/components/ui/SearchInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { MediaThumbnail } from "@/components/media/MediaThumbnail";
import { PlatformGlyph } from "@/components/ui/PlatformIcon";
import { CreatePostLivePreview } from "@/components/posts/CreatePostLivePreview";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { PLATFORM_LIST, PLATFORMS, TIMEZONES } from "@/lib/constants";
import { ai } from "@/lib/services";
import { MEDIA_ACCEPT, validateMediaBatch } from "@/lib/media-validation";
import {
  cancelUpload,
  getMediaAsset,
  listMediaAssets,
  toMediaItem,
  uploadMediaFile,
} from "@/lib/services/storage-service";
import { getStorageErrorMessage } from "@/lib/storage-errors";
import { getPublishingErrorMessage, publishingErrorMessage } from "@/lib/publishing-errors";
import {
  validatePublishingMediaForPlatforms,
  type PublishingMediaPlatform,
} from "@/lib/publishing-media-validation";
import {
  createPost,
  getPostById,
  updatePost,
} from "@/lib/services/post-service";
import { getTikTokCreatorInfo, listSocialAccounts } from "@/lib/services/social-account-service";
import { requestPublishNow } from "@/lib/services/publishing-service";
import {
  getLatestPostApproval,
  listEligibleApprovers,
  submitForApproval,
  withdrawRequest,
} from "@/lib/services/approval-service";
import { PostConflictError, getPostErrorMessage } from "@/lib/post-errors";
import { utcToWorkspaceFields, workspaceDateTimeToUtc } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import {
  DEFAULT_YOUTUBE_PRIVACY,
  validateYouTubePublishing,
  youtubeValidationMessage,
} from "@/lib/youtube-publishing";
import {
  COMPOSER_DESTINATION_PLATFORMS,
  partitionComposerDestinationIds,
  readTikTokComposerDestinationIds,
  selectableComposerDestinationAccounts,
} from "@/lib/composer-platforms";
import {
  normalizeTikTokPublishingSettings,
  readTikTokPublishingSettings,
  TIKTOK_VIDEO_PUBLISH_SCOPE,
  tiktokValidationMessage,
  validateTikTokPublishing,
} from "@/lib/tiktok-publishing";
import type {
  MediaAssetPresentation,
  MediaUploadQueueItem,
  PostPlatformInput,
  PostStatus,
  PostWithRelations,
  SocialPlatform,
  SocialAccountView,
  ApprovalRequestWithRelations,
  EligibleApprover,
  TikTokCreatorInfoResult,
  Json,
} from "@/types";

const EMOJIS = ["😀", "🎉", "🚀", "🔥", "💜", "✨", "👏", "📈", "🙌", "☀️", "💡", "📌"];
const UPLOAD_ROLES = ["owner", "administrator", "content_manager", "designer"];

export default function CreatePostPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm text-ink-muted">Loading post editor…</div>}>
      <CreatePostEditor />
    </Suspense>
  );
}

function CreatePostEditor() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const toastRef = useRef(toast);
  const { user } = useAuth();
  const { activeWorkspace, activeMembership } = useWorkspace();
  const captionRef = useRef<HTMLTextAreaElement>(null);

  const [caption, setCaption] = useState("");
  const [selected, setSelected] = useState<SocialPlatform[]>([
    "instagram",
    "facebook",
  ]);
  const [selectedMedia, setSelectedMedia] = useState<MediaAssetPresentation[]>([]);
  const [accounts, setAccounts] = useState<SocialAccountView[]>([]);
  const [selectedDestinationIds, setSelectedDestinationIds] = useState<string[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [supersedeConfirmOpen, setSupersedeConfirmOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [library, setLibrary] = useState<MediaAssetPresentation[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());
  const [uploadQueue, setUploadQueue] = useState<MediaUploadQueueItem[]>([]);
  const [postId, setPostId] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [loadedPost, setLoadedPost] = useState<PostWithRelations | null>(null);
  const [latestApproval, setLatestApproval] = useState<ApprovalRequestWithRelations | null>(null);
  const [eligibleApprovers, setEligibleApprovers] = useState<EligibleApprover[]>([]);
  const [selectedApproverId, setSelectedApproverId] = useState("");
  const [approvalMessage, setApprovalMessage] = useState("");
  const [approvalDueAt, setApprovalDueAt] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [editSupersede, setEditSupersede] = useState(false);
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [platformDetails, setPlatformDetails] = useState<Partial<Record<SocialPlatform, Pick<PostPlatformInput, "platform_title" | "platform_settings">>>>({});
  const [editorLoading, setEditorLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [tiktokCreatorInfo, setTikTokCreatorInfo] = useState<TikTokCreatorInfoResult | null>(null);
  const [tiktokCreatorLoading, setTikTokCreatorLoading] = useState(false);
  const [tiktokCreatorError, setTikTokCreatorError] = useState<string | null>(null);

  const [perPlatform, setPerPlatform] = useState(false);
  const [captions, setCaptions] = useState<Partial<Record<SocialPlatform, string>>>(
    {},
  );

  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [timezone, setTimezone] = useState("UTC");
  const [aiLoading, setAiLoading] = useState(false);
  const media = useMemo(() => selectedMedia.map(toMediaItem), [selectedMedia]);
  const canUpload =
    !!activeMembership && UPLOAD_ROLES.includes(activeMembership.role);
  const canManage = !!activeMembership && ["owner", "administrator", "content_manager"].includes(activeMembership.role);
  const approvalSettingAllowed = canManage;
  const editableWorkflowStatus = !loadedPost || ["draft", "scheduled", "cancelled"].includes(loadedPost.post.status)
    || (editSupersede && ["pending_approval", "approved"].includes(loadedPost.post.status));
  const canEdit =
    (canManage && editableWorkflowStatus) ||
    (!!activeMembership &&
      activeMembership.role === "designer" &&
      (!loadedPost ||
        (loadedPost.post.created_by === user?.id &&
          (loadedPost.post.status === "draft" || (editSupersede && ["pending_approval", "approved"].includes(loadedPost.post.status))))));
  const availableApprovers = eligibleApprovers.filter(
    (approver) => approver.userId !== user?.id && approver.userId !== loadedPost?.post.created_by,
  );
  const requestedPostId = searchParams.get("post");

  useEffect(() => {
    toastRef.current = toast;
  }, [toast]);
  const currentSnapshot = useMemo(
    () =>
      serializeEditor({
        caption,
        selected,
        captions,
        platformDetails,
        mediaAssetIds: selectedMedia.map((item) => item.asset.id),
        destinationAccountIds: selectedDestinationIds,
        date,
        time,
        timezone,
        assignedTo,
        approvalRequired,
      }),
    [approvalRequired, assignedTo, caption, captions, date, platformDetails, selected, selectedDestinationIds, selectedMedia, time, timezone],
  );
  const dirty = baseline !== null && currentSnapshot !== baseline;

  // The smallest character limit among selected platforms drives the counter.
  const charLimit = useMemo(() => {
    if (selected.length === 0) return 2200;
    return Math.min(...selected.map((p) => PLATFORMS[p].charLimit));
  }, [selected]);

  const togglePlatform = (p: SocialPlatform) => {
    if (p === "youtube") {
      setPlatformDetails((current) => ({
        ...current,
        youtube: {
          ...current.youtube,
          platform_settings: {
            ...platformSettingsObject(current.youtube?.platform_settings),
            privacyStatus: youtubePrivacyStatus(current.youtube?.platform_settings),
          },
        },
      }));
    }
    setSelected((prev) => {
      const next = prev.includes(p)
        ? prev.filter((x) => x !== p)
        : [...prev, p];
      if (!next.includes(p)) {
        setSelectedDestinationIds((ids) => ids.filter((id) => accounts.find((item) => item.account.id === id)?.account.platform !== p));
      }
      return next;
    });
  };

  useEffect(() => {
    if (!activeWorkspace) {
      setAccounts([]);
      return;
    }
    setAccountsLoading(true);
    void listSocialAccounts(activeWorkspace.id)
      .then(setAccounts)
      .catch(() => setAccounts([]))
      .finally(() => setAccountsLoading(false));
  }, [activeWorkspace]);

  const insertEmoji = (emoji: string) => {
    setCaption((c) => c + emoji);
    setEmojiOpen(false);
    captionRef.current?.focus();
  };

  const loadLibrary = useCallback(async () => {
    if (!activeWorkspace) return;
    setLibraryLoading(true);
    setLibraryError(null);
    try {
      const result = await listMediaAssets(activeWorkspace.id, {
        page: 1,
        pageSize: 50,
        search: libraryQuery,
      });
      setLibrary(result.items);
    } catch (loadError) {
      setLibraryError(getStorageErrorMessage(loadError));
    } finally {
      setLibraryLoading(false);
    }
  }, [activeWorkspace, libraryQuery]);

  useEffect(() => {
    setSelectedMedia([]);
    setPickerSelection(new Set());
    setUploadQueue([]);
  }, [activeWorkspace?.id]);

  const loadPost = useCallback(async () => {
    if (!requestedPostId || !activeWorkspace) return;
    setEditorLoading(true);
    try {
      const [item, approval] = await Promise.all([
        getPostById(requestedPostId),
        getLatestPostApproval(requestedPostId),
      ]);
      if (!item || item.post.workspace_id !== activeWorkspace.id) {
        toastRef.current.error("Post unavailable", "This post is not available in the active workspace.");
        router.replace("/dashboard/create");
        return;
      }
      const nextSelected = item.platforms.map((platform) => platform.platform);
      const nextCaptions = Object.fromEntries(
        item.platforms.flatMap((platform) =>
          platform.platform_caption ? [[platform.platform, platform.platform_caption]] : [],
        ),
      );
      const nextDetails = Object.fromEntries(
        item.platforms.map((platform) => [
          platform.platform,
          {
            platform_title: platform.platform_title,
            platform_settings: platform.platform_settings,
          },
        ]),
      );
      const nextTimezone = item.post.timezone || activeWorkspace.timezone || "UTC";
      const scheduleFields = item.post.scheduled_at
        ? utcToWorkspaceFields(item.post.scheduled_at, nextTimezone)
        : { date: "", time: "09:00" };
      setPostId(item.post.id);
      setRevision(item.post.revision);
      setLoadedPost(item);
      setLatestApproval(approval);
      setApprovalRequired(item.post.approval_required);
      setEditSupersede(false);
      setCaption(item.post.caption);
      setSelected(nextSelected);
      setCaptions(nextCaptions);
      setPerPlatform(Object.keys(nextCaptions).length > 0);
      setPlatformDetails(nextDetails);
      setSelectedMedia(item.media);
      const savedTikTokDestinationIds = item.platforms.flatMap((platform) =>
        platform.platform === "tiktok"
          ? readTikTokComposerDestinationIds(platform.platform_settings)
          : [],
      );
      const nextDestinationIds = [
        ...new Set([
          ...item.destinations.map((destination) => destination.social_account_id),
          ...savedTikTokDestinationIds,
        ]),
      ];
      setSelectedDestinationIds(nextDestinationIds);
      setAssignedTo(item.post.assigned_to);
      setDate(scheduleFields.date);
      setTime(scheduleFields.time);
      setTimezone(nextTimezone);
      setBaseline(
        serializeEditor({
          caption: item.post.caption,
          selected: nextSelected,
          captions: nextCaptions,
          platformDetails: nextDetails,
          mediaAssetIds: item.media.map((mediaItem) => mediaItem.asset.id),
          destinationAccountIds: nextDestinationIds,
          date: scheduleFields.date,
          time: scheduleFields.time,
          timezone: nextTimezone,
          assignedTo: item.post.assigned_to,
          approvalRequired: item.post.approval_required,
        }),
      );
      setConflictOpen(false);
    } catch (loadError) {
      toastRef.current.error("Post could not be loaded", getPostErrorMessage(loadError));
    } finally {
      setEditorLoading(false);
    }
  }, [activeWorkspace, requestedPostId, router]);

  useEffect(() => {
    if (!activeWorkspace) return;
    if (requestedPostId) {
      void loadPost();
      return;
    }
    const initialTimezone = activeWorkspace.timezone || "UTC";
    setPostId(null);
    setRevision(null);
    setLoadedPost(null);
    setLatestApproval(null);
    setApprovalRequired(false);
    setEditSupersede(false);
    setCaption("");
    setSelected(["instagram", "facebook"]);
    setCaptions({});
    setPerPlatform(false);
    setPlatformDetails({});
    setAssignedTo(null);
    setSelectedDestinationIds([]);
    setDate("");
    setTime("09:00");
    setTimezone(initialTimezone);
    setBaseline(
      serializeEditor({
        caption: "",
        selected: ["instagram", "facebook"],
        captions: {},
        platformDetails: {},
        mediaAssetIds: [],
        destinationAccountIds: [],
        date: "",
        time: "09:00",
        timezone: initialTimezone,
        assignedTo: null,
        approvalRequired: false,
      }),
    );
  }, [activeWorkspace, loadPost, requestedPostId]);

  useEffect(() => {
    if (!activeWorkspace) {
      setEligibleApprovers([]);
      return;
    }
    void listEligibleApprovers(activeWorkspace.id)
      .then(setEligibleApprovers)
      .catch(() => setEligibleApprovers([]));
  }, [activeWorkspace]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!mediaPickerOpen) return;
    const timer = window.setTimeout(() => void loadLibrary(), libraryQuery ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [libraryQuery, loadLibrary, mediaPickerOpen]);

  useEffect(() => {
    if (!selectedMedia.length) return;
    const timer = window.setInterval(() => {
      void Promise.all(selectedMedia.map((item) => getMediaAsset(item.asset.id))).then(
        (refreshed) => setSelectedMedia(refreshed.filter((item) => item !== null)),
      );
    }, 55 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [selectedMedia]);

  const updateUpload = useCallback(
    (id: string, update: Partial<MediaUploadQueueItem>) =>
      setUploadQueue((current) =>
        current.map((item) => (item.id === id ? { ...item, ...update } : item)),
      ),
    [],
  );

  const runUpload = useCallback(
    async (queueItem: MediaUploadQueueItem) => {
      if (!activeWorkspace) return;
      updateUpload(queueItem.id, { state: "uploading", progress: 0, error: null });
      try {
        const uploaded = await uploadMediaFile(activeWorkspace.id, queueItem.file, {
          uploadId: queueItem.id,
          onProgress: (progress) => updateUpload(queueItem.id, { progress }),
        });
        updateUpload(queueItem.id, { state: "complete", progress: 100 });
        setSelectedMedia((current) =>
          current.some((item) => item.asset.id === uploaded.asset.id)
            ? current
            : [...current, uploaded],
        );
        setLibrary((current) => [uploaded, ...current]);
        toast.success("Media uploaded", `${queueItem.file.name} is saved to ${activeWorkspace.name}.`);
      } catch (uploadError) {
        const message = getStorageErrorMessage(uploadError);
        updateUpload(queueItem.id, {
          state: message.toLowerCase().includes("cancel") ? "cancelled" : "failed",
          error: message,
        });
        toast.error("Upload failed", message);
      }
    },
    [activeWorkspace, toast, updateUpload],
  );

  const handleFiles = (files: File[]) => {
    if (!canUpload) {
      toast.error("Read-only workspace", "Your role does not permit media uploads.");
      return;
    }
    try {
      validateMediaBatch(files);
    } catch (batchError) {
      toast.error("Files not accepted", getStorageErrorMessage(batchError));
      return;
    }
    const next = files.map<MediaUploadQueueItem>((file) => ({
      id: crypto.randomUUID(),
      file,
      progress: 0,
      state: "queued",
      error: null,
    }));
    setUploadQueue((current) => [...next, ...current]);
    for (const queueItem of next) void runUpload(queueItem);
  };

  const removeMedia = (id: string) => {
    setSelectedMedia((current) => current.filter((item) => item.asset.id !== id));
  };

  const runAi = async () => {
    setAiLoading(true);
    const suggestion = await ai.suggestCaption(caption.slice(0, 40));
    setCaption(suggestion);
    setAiLoading(false);
    toast.info("AI suggestion added", "This is a placeholder — no AI is called yet.");
  };

  const captionFor = (p: SocialPlatform) =>
    perPlatform && captions[p] !== undefined ? captions[p]! : caption;

  const connectedDestinations = useMemo(
    () => selectableComposerDestinationAccounts(accounts, activeWorkspace?.id ?? ""),
    [accounts, activeWorkspace?.id],
  );
  const selectedDestinationAccounts = useMemo(
    () => accounts.filter(({ account }) => selectedDestinationIds.includes(account.id)),
    [accounts, selectedDestinationIds],
  );
  const hasYouTubeDestination = selectedDestinationAccounts.some(
    ({ account }) => account.platform === "youtube",
  );
  const selectedTikTokAccounts = selectedDestinationAccounts.filter(
    ({ account }) => account.platform === "tiktok",
  );
  const selectedTikTokAccount = selectedTikTokAccounts.length === 1
    ? selectedTikTokAccounts[0].account
    : null;
  const hasTikTokPublishingPermission = Boolean(
    selectedTikTokAccount?.granted_scopes.includes(TIKTOK_VIDEO_PUBLISH_SCOPE),
  );
  const destinationCapabilities = useMemo(
    () => partitionComposerDestinationIds(accounts, selectedDestinationIds),
    [accounts, selectedDestinationIds],
  );
  const youtubeTitle = platformDetails.youtube?.platform_title ?? "";
  const youtubePrivacy = youtubePrivacyStatus(platformDetails.youtube?.platform_settings);
  const tiktokSettings = readTikTokPublishingSettings(platformDetails.tiktok?.platform_settings);

  const updateTikTokSettings = (updates: Record<string, Json>) => {
    setPlatformDetails((current) => ({
      ...current,
      tiktok: {
        ...current.tiktok,
        platform_settings: {
          ...platformSettingsObject(current.tiktok?.platform_settings),
          ...updates,
        },
      },
    }));
  };

  useEffect(() => {
    if (!activeWorkspace || !selectedTikTokAccount || !hasTikTokPublishingPermission) {
      setTikTokCreatorInfo(null);
      setTikTokCreatorLoading(false);
      setTikTokCreatorError(null);
      return;
    }
    let cancelled = false;
    setTikTokCreatorLoading(true);
    setTikTokCreatorError(null);
    void getTikTokCreatorInfo(activeWorkspace.id, selectedTikTokAccount.id)
      .then((creator) => {
        if (cancelled) return;
        setTikTokCreatorInfo(creator);
        setPlatformDetails((current) => {
          const existing = readTikTokPublishingSettings(current.tiktok?.platform_settings);
          return {
            ...current,
            tiktok: {
              ...current.tiktok,
              platform_settings: {
                ...platformSettingsObject(current.tiktok?.platform_settings),
                privacyLevel: creator.privacyLevelOptions.includes(existing.privacyLevel)
                  ? existing.privacyLevel
                  : "",
                disableComment: creator.commentDisabled ? true : existing.disableComment,
                disableDuet: creator.duetDisabled ? true : existing.disableDuet,
                disableStitch: creator.stitchDisabled ? true : existing.disableStitch,
                brandContentToggle: existing.brandContentToggle,
                brandOrganicToggle: existing.brandOrganicToggle,
                publishConsent: existing.publishConsent,
                creatorMaxVideoPostDurationSec: creator.maxVideoPostDurationSec,
              },
            },
          };
        });
      })
      .catch(() => {
        if (!cancelled) setTikTokCreatorError("TikTok publishing settings could not be loaded.");
      })
      .finally(() => {
        if (!cancelled) setTikTokCreatorLoading(false);
      });
    return () => { cancelled = true; };
  }, [activeWorkspace, hasTikTokPublishingPermission, selectedTikTokAccount]);

  const validateScheduled = () => {
    if (selected.length === 0) {
      toast.error("Select a platform", "Choose at least one platform to post to.");
      return false;
    }
    if (selectedDestinationIds.length === 0) {
      toast.error("Choose a destination", "Select at least one connected social account.");
      return false;
    }
    if (selectedDestinationIds.some((id) => accounts.find((item) => item.account.id === id)?.account.connection_status !== "connected")) {
      toast.error("Reconnect an account", "Every publishing destination must be connected.");
      return false;
    }
    if (selectedTikTokAccounts.length > 1) {
      toast.error("Choose one TikTok account", "This release supports one TikTok destination per post.");
      return false;
    }
    const mediaError = validatePublishingMediaForPlatforms(
      selectedDestinationAccounts.map(({ account }) => account.platform as PublishingMediaPlatform),
      selectedMedia,
    );
    if (mediaError) {
      const platform = mediaError.split("_")[0];
      const platformName = platform.charAt(0) + platform.slice(1).toLowerCase();
      toast.error(`${platformName} content is not ready`, publishingErrorMessage(mediaError));
      return false;
    }
    const hasDestinationCaption = selectedDestinationAccounts.some(
      ({ account }) => captionFor(account.platform).trim().length > 0,
    );
    if (!hasDestinationCaption && media.length === 0) {
      toast.error("Add some content", "Write a caption or add media first.");
      return false;
    }
    if (selectedTikTokAccount) {
      const tiktokError = validateTikTokPublishing(
        selectedMedia,
        tiktokCreatorInfo,
        tiktokSettings,
        hasTikTokPublishingPermission,
      );
      if (tiktokError) {
        toast.error("TikTok content is not ready", tiktokValidationMessage(tiktokError));
        return false;
      }
    }
    if (hasYouTubeDestination) {
      const youtubeError = validateYouTubePublishing(
        selectedMedia,
        youtubeTitle,
        captionFor("youtube"),
        youtubePrivacy,
      );
      if (youtubeError) {
        toast.error("YouTube content is not ready", youtubeValidationMessage(youtubeError));
        return false;
      }
    }
    return true;
  };

  const persistPost = async (status: Extract<PostStatus, "draft" | "scheduled">) => {
    if (!activeWorkspace || !canEdit || mutating) return;
    if (status === "scheduled" && !validateScheduled()) return;
    let scheduledAt: string | null = null;
    if (status === "scheduled" || date) {
      if (!date && status === "scheduled") {
        toast.error("Pick a date", "Choose a date and time to schedule this post.");
        return;
      }
      if (date) try {
        scheduledAt = workspaceDateTimeToUtc(date, time, timezone);
        if (new Date(scheduledAt).getTime() <= Date.now()) {
          toast.error("Choose a future time", "Scheduled posts must be set in the future.");
          return;
        }
      } catch (scheduleError) {
        toast.error("Invalid schedule", scheduleError instanceof Error ? scheduleError.message : "Choose a valid schedule.");
        return;
      }
    }

    const input = {
      workspaceId: activeWorkspace.id,
      caption,
      status,
      scheduledAt,
      timezone,
      approvalRequired,
      assignedTo,
      platforms: selected.map((platform) => {
        const settings = platformDetails[platform]?.platform_settings ?? {};
        return {
          platform,
          platform_caption: perPlatform ? captions[platform]?.trim() || null : null,
          platform_title: platformDetails[platform]?.platform_title ?? null,
          platform_settings: platform === "tiktok"
            ? normalizeTikTokPublishingSettings(settings)
            : settings,
        };
      }),
      mediaAssetIds: selectedMedia.map((item) => item.asset.id),
      destinationAccountIds: destinationCapabilities.publishableIds,
    };

    setMutating(true);
    try {
      const result = postId && revision !== null
        ? await updatePost(postId, revision, input)
        : await createPost(input);
      setPostId(result.postId);
      setRevision(result.revision);
      setBaseline(currentSnapshot);
      const refreshed = await getPostById(result.postId);
      if (refreshed) setLoadedPost(refreshed);
      router.replace(`/dashboard/create?post=${result.postId}`);
      toast.success(status === "scheduled" ? "Post scheduled" : postId ? "Draft saved" : "Draft created", `Revision ${result.revision} is saved to ${activeWorkspace.name}.`);
      return result;
    } catch (mutationError) {
      if (mutationError instanceof PostConflictError || getPostErrorMessage(mutationError).includes("member saved")) {
        setConflictOpen(true);
      } else {
        toast.error("Post was not saved", getPostErrorMessage(mutationError));
      }
      return null;
    } finally {
      setMutating(false);
    }
  };

  const onSaveDraft = () => {
    setPublishConfirmOpen(false);
    void persistPost("draft");
  };
  const openApprovalModal = () => {
    const first = availableApprovers[0];
    if (!first) {
      toast.error("Another approver is required", "Add an active owner, administrator, or approver who is not the post creator.");
      return;
    }
    setSelectedApproverId((current) => availableApprovers.some((item) => item.userId === current) ? current : first.userId);
    setApprovalModalOpen(true);
  };
  const onSchedule = () => {
    const validApproval = latestApproval?.request.status === "approved"
      && latestApproval.request.post_revision === revision;
    if (approvalRequired && !validApproval) {
      openApprovalModal();
      toast.info("Approval required", "Submit this draft for approval before scheduling it.");
      return;
    }
    void persistPost("scheduled");
  };
  const onSubmitApproval = async () => {
    if (!selectedApproverId) {
      toast.error("Choose an approver", "Select another active owner, administrator, or approver.");
      return;
    }
    const saved = await persistPost("draft");
    if (!saved) return;
    setMutating(true);
    try {
      const result = await submitForApproval({
        postId: saved.postId,
        expectedRevision: saved.revision,
        assignedApproverId: selectedApproverId,
        submissionMessage: approvalMessage.trim() || null,
        dueAt: approvalDueAt ? new Date(approvalDueAt).toISOString() : null,
      });
      setApprovalModalOpen(false);
      setApprovalMessage("");
      setApprovalDueAt("");
      toast.success("Sent for approval", `Revision ${result.postRevision} is awaiting review.`);
      await loadPost();
    } catch (approvalError) {
      toast.error("Approval request failed", approvalError instanceof Error ? approvalError.message : "Please try again.");
    } finally {
      setMutating(false);
    }
  };
  const onWithdrawApproval = async () => {
    if (!latestApproval) return;
    setMutating(true);
    try {
      await withdrawRequest(latestApproval.request.id);
      toast.success("Request withdrawn", "The post is a draft again.");
      await loadPost();
    } catch (approvalError) {
      toast.error("Request could not be withdrawn", approvalError instanceof Error ? approvalError.message : "Please try again.");
    } finally {
      setMutating(false);
    }
  };
  const onPublishNow = async () => {
    if (!publishConfirmOpen) return;
    if (!canManage || !validateScheduled()) return;
    const validApproval = latestApproval?.request.status === "approved"
      && latestApproval.request.post_revision === revision;
    if (approvalRequired && !validApproval) {
      toast.error("Approval required", "The current revision must be approved before publishing.");
      return;
    }
    setPublishConfirmOpen(false);
    const saved = await persistPost("draft");
    if (!saved) return;
    setMutating(true);
    try {
      await requestPublishNow(saved.postId, saved.revision);
      toast.success("Publishing queued", "Towkn will update each destination as it completes.");
      router.push(`/dashboard/posts?publishing=${saved.postId}`);
    } catch (publishError) {
      toast.error("Publishing was not queued", getPublishingErrorMessage(publishError));
    } finally {
      setMutating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={postId ? "Edit Post" : "Create Post"}
        description={postId ? `Editing revision ${revision ?? "…"}` : "Create a persisted draft or schedule it for later."}
        actions={
          <Button type="button" variant="outline" onClick={onSaveDraft} loading={mutating} disabled={!canEdit || editorLoading}>
            <Save className="h-4 w-4" aria-hidden /> Save Draft
          </Button>
        }
      />

      <div className="rounded-lg border border-info/30 bg-info-soft px-4 py-3 text-sm text-ink-muted">
        Scheduled and immediate publishing run from the durable queue, even after this browser is closed.
      </div>

      {latestApproval && (
        <div className={cn(
          "rounded-lg border px-4 py-3 text-sm",
          latestApproval.request.status === "approved" && !latestApproval.stale
            ? "border-success/30 bg-success-soft text-success"
            : latestApproval.request.status === "pending"
              ? "border-warning/30 bg-warning-soft text-ink-muted"
              : "border-info/30 bg-info-soft text-ink-muted",
        )}>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            <span className="font-semibold capitalize">{latestApproval.request.status.replaceAll("_", " ")}</span>
            <span>Revision {latestApproval.request.post_revision}</span>
            {latestApproval.approver && <span>· {latestApproval.approver.name}</span>}
            {latestApproval.request.due_at && <span>· Due {new Date(latestApproval.request.due_at).toLocaleString()}</span>}
            {latestApproval.stale && <span className="font-semibold text-danger">· Stale</span>}
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => router.push("/dashboard/approvals")}>View approval</Button>
            {latestApproval.request.status === "pending" && (latestApproval.request.requested_by === user?.id || canManage) && (
              <Button size="sm" variant="ghost" loading={mutating} onClick={() => void onWithdrawApproval()}>Withdraw</Button>
            )}
          </div>
          {latestApproval.request.status === "changes_requested" && latestApproval.request.resolution_message && (
            <p className="mt-2 font-medium">Changes requested: {latestApproval.request.resolution_message}</p>
          )}
          {latestApproval.request.status === "rejected" && latestApproval.request.resolution_message && (
            <p className="mt-2 font-medium">Rejection reason: {latestApproval.request.resolution_message}</p>
          )}
        </div>
      )}

      {!canEdit && !editorLoading && (
        <div className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-ink-muted">
          <div className="flex flex-wrap items-center gap-3">
            <span>{["pending_approval", "approved"].includes(loadedPost?.post.status ?? "") ? "This revision is locked by its approval workflow." : "This post is read-only for your current workspace role."}</span>
            {["pending_approval", "approved"].includes(loadedPost?.post.status ?? "") && (canManage || loadedPost?.post.created_by === user?.id) && (
              <Button size="sm" variant="outline" onClick={() => setSupersedeConfirmOpen(true)}>Edit and supersede</Button>
            )}
          </div>
        </div>
      )}

      {editorLoading && <div className="py-10 text-center text-sm text-ink-muted">Loading saved post…</div>}

      {!editorLoading && <div className="grid gap-6 lg:grid-cols-5">
        {/* Composer */}
        <div className="space-y-6 lg:col-span-3">
          <Card>
            <CardHeader title="Content" description="Write your caption and add media" />
            <CardBody className="space-y-4">
              {/* Caption */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="caption" className="label mb-0">
                    Caption
                  </label>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      caption.length > charLimit
                        ? "text-danger"
                        : "text-ink-subtle",
                    )}
                  >
                    {caption.length} / {charLimit}
                  </span>
                </div>
                <Textarea
                  id="caption"
                  ref={captionRef}
                  rows={5}
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="What would you like to share?"
                  invalid={caption.length > charLimit}
                  disabled={!canEdit}
                />
                <div className="relative mt-2 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setEmojiOpen((o) => !o)}
                    disabled={!canEdit}
                  >
                    <Smile className="h-4 w-4" aria-hidden /> Emoji
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => setCaption((c) => `${c}#`)}
                    disabled={!canEdit}
                  >
                    <Hash className="h-4 w-4" aria-hidden /> Hashtag
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={runAi}
                    loading={aiLoading}
                    disabled={!canEdit}
                  >
                    <Sparkles className="h-4 w-4" aria-hidden /> AI Assistant
                  </Button>
                  {emojiOpen && (
                    <div className="absolute left-0 top-full z-20 mt-1.5 grid grid-cols-6 gap-1 rounded-xl border border-border bg-surface p-2 shadow-pop">
                      {EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => insertEmoji(e)}
                          className="rounded-lg p-1.5 text-lg hover:bg-surface-muted"
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Media */}
              <div>
                <p className="label">Media</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!canEdit}
                    onClick={() => {
                      setPickerSelection(new Set(selectedMedia.map((item) => item.asset.id)));
                      setMediaPickerOpen(true);
                    }}
                  >
                    <ImagePlus className="h-4 w-4" aria-hidden /> Choose from library
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => void loadLibrary()}>
                    <RefreshCw className="h-4 w-4" aria-hidden /> Refresh media
                  </Button>
                </div>
                {canUpload ? (
                  <UploadArea
                    onFiles={handleFiles}
                    accept={MEDIA_ACCEPT}
                    hint="Uploads save to your active workspace"
                    compact
                  />
                ) : (
                  <p className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                    Your {activeMembership?.role.replace("_", " ")} role can select workspace media but cannot upload.
                  </p>
                )}
                {uploadQueue.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {uploadQueue.map((queueItem) => (
                      <ComposerUploadRow
                        key={queueItem.id}
                        item={queueItem}
                        onCancel={() => void cancelUpload(queueItem.id)}
                        onRetry={() => void runUpload(queueItem)}
                      />
                    ))}
                  </div>
                )}
                {media.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">
                    {media.map((m) => (
                      <div key={m.id} className="group relative">
                        <MediaThumbnail item={m} className="aspect-square w-full" />
                        <button
                          type="button"
                          onClick={() => removeMedia(m.id)}
                          aria-label={`Remove ${m.name}`}
                          className={cn("absolute right-1.5 top-1.5 h-6 w-6 items-center justify-center rounded-full bg-ink/70 text-white opacity-0 transition-opacity group-hover:opacity-100", canEdit ? "flex" : "hidden")}
                        >
                          <X className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          {/* Platforms */}
          <Card>
            <CardHeader
              title="Platforms"
              description="Choose where this content will be published"
            />
            <CardBody className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {PLATFORM_LIST.filter((p) => COMPOSER_DESTINATION_PLATFORMS.includes(p.id as (typeof COMPOSER_DESTINATION_PLATFORMS)[number])).map((p) => {
                  const active = selected.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePlatform(p.id)}
                      disabled={!canEdit}
                      aria-pressed={active}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "border-brand bg-brand-soft text-brand-text"
                          : "border-border bg-surface text-ink-muted hover:bg-surface-muted",
                      )}
                    >
                      <span style={{ color: p.color }}>
                        <PlatformGlyph platform={p.id} size="md" />
                      </span>
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface-muted/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">
                    Customise caption per platform
                  </p>
                  <p className="text-xs text-ink-subtle">
                    Fine-tune the message for each network
                  </p>
                </div>
                <span className={cn(!canEdit && "pointer-events-none opacity-50")}>
                  <Toggle checked={perPlatform} onChange={setPerPlatform} />
                </span>
              </div>
              {perPlatform && selected.length > 0 && (
                <div className="space-y-3">
                  {selected.map((p) => (
                    <FormField
                      key={p}
                      label={`${PLATFORMS[p].label} caption`}
                      htmlFor={`cap-${p}`}
                    >
                      <Textarea
                        id={`cap-${p}`}
                        rows={2}
                        value={captions[p] ?? caption}
                        onChange={(e) =>
                          setCaptions((c) => ({ ...c, [p]: e.target.value }))
                        }
                        placeholder={`Tailor your ${PLATFORMS[p].label} caption…`}
                        disabled={!canEdit}
                      />
                    </FormField>
                  ))}
                </div>
              )}
              {selected.includes("youtube") && (
                <div className="space-y-4 rounded-xl border border-border bg-surface-muted/40 p-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">YouTube video details</p>
                    <p className="text-xs text-ink-subtle">These details are stored with the YouTube platform revision.</p>
                  </div>
                  <FormField label="Title" htmlFor="youtube-title" required hint={`${youtubeTitle.length}/100`}>
                    <Input
                      id="youtube-title"
                      value={youtubeTitle}
                      maxLength={100}
                      disabled={!canEdit}
                      placeholder="Add a YouTube video title"
                      onChange={(event) => setPlatformDetails((current) => ({
                        ...current,
                        youtube: { ...current.youtube, platform_title: event.target.value },
                      }))}
                    />
                  </FormField>
                  <FormField label="Description" htmlFor="youtube-description" hint="Uses the YouTube platform caption when customised; otherwise the main caption.">
                    <Textarea
                      id="youtube-description"
                      rows={3}
                      maxLength={5000}
                      value={captionFor("youtube")}
                      disabled={!canEdit}
                      onChange={(event) => {
                        if (perPlatform) setCaptions((current) => ({ ...current, youtube: event.target.value }));
                        else setCaption(event.target.value);
                      }}
                      placeholder="Describe the video"
                    />
                  </FormField>
                  <FormField label="Privacy status" htmlFor="youtube-privacy">
                    <Select
                      id="youtube-privacy"
                      value={youtubePrivacy}
                      disabled={!canEdit}
                      onChange={(event) => setPlatformDetails((current) => ({
                        ...current,
                        youtube: {
                          ...current.youtube,
                          platform_settings: {
                            ...platformSettingsObject(current.youtube?.platform_settings),
                            privacyStatus: event.target.value,
                          },
                        },
                      }))}
                    >
                      <option value="private">Private</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="public">Public</option>
                    </Select>
                  </FormField>
                </div>
              )}
              {selected.includes("tiktok") && (
                <div className="space-y-4 rounded-xl border border-border bg-surface-muted/40 p-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">TikTok Direct Post settings</p>
                    <p className="text-xs text-ink-subtle">Creator limits are loaded securely from TikTok for the selected account.</p>
                  </div>
                  {!selectedTikTokAccount ? (
                    <p className="text-sm text-ink-muted">Select one connected TikTok account below.</p>
                  ) : !hasTikTokPublishingPermission ? (
                    <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-ink-muted">Publishing permission required. Enable TikTok publishing from Social Accounts.</p>
                  ) : tiktokCreatorLoading ? (
                    <p className="text-sm text-ink-muted">Loading TikTok Creator Info…</p>
                  ) : tiktokCreatorError ? (
                    <p role="alert" className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">{tiktokCreatorError}</p>
                  ) : tiktokCreatorInfo ? (
                    <>
                      <p className="text-xs text-ink-muted">
                        {tiktokCreatorInfo.creatorUsername ? `@${tiktokCreatorInfo.creatorUsername}` : tiktokCreatorInfo.creatorNickname ?? "TikTok creator"}
                        {` · Up to ${tiktokCreatorInfo.maxVideoPostDurationSec} seconds`}
                      </p>
                      <FormField label="TikTok caption" htmlFor="tiktok-caption" hint={`${captionFor("tiktok").length}/2200`}>
                        <Textarea
                          id="tiktok-caption"
                          rows={3}
                          maxLength={2200}
                          value={captionFor("tiktok")}
                          disabled={!canEdit}
                          onChange={(event) => {
                            if (perPlatform) setCaptions((current) => ({ ...current, tiktok: event.target.value }));
                            else setCaption(event.target.value);
                          }}
                          placeholder="Write the TikTok caption"
                        />
                      </FormField>
                      <FormField label="Privacy" htmlFor="tiktok-privacy" required>
                        <Select
                          id="tiktok-privacy"
                          value={tiktokSettings.privacyLevel}
                          disabled={!canEdit}
                          onChange={(event) => updateTikTokSettings({ privacyLevel: event.target.value })}
                        >
                          <option value="">Choose privacy…</option>
                          {tiktokCreatorInfo.privacyLevelOptions.map((option) => (
                            <option key={option} value={option}>{tiktokPrivacyLabel(option)}</option>
                          ))}
                        </Select>
                      </FormField>
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium text-ink">Interactions</legend>
                        {([
                          ["Comments", "disableComment", tiktokCreatorInfo.commentDisabled],
                          ["Duet", "disableDuet", tiktokCreatorInfo.duetDisabled],
                          ["Stitch", "disableStitch", tiktokCreatorInfo.stitchDisabled],
                        ] as const).map(([label, key, providerDisabled]) => (
                          <label key={key} className={cn("flex items-center gap-2 text-sm text-ink", providerDisabled && "opacity-60")}>
                            <input
                              type="checkbox"
                              checked={!tiktokSettings[key]}
                              disabled={!canEdit || providerDisabled}
                              onChange={(event) => updateTikTokSettings({ [key]: !event.target.checked })}
                              className="h-4 w-4 accent-brand"
                            />
                            Allow {label}
                            {providerDisabled && <span className="text-xs text-ink-subtle">Unavailable for this creator</span>}
                          </label>
                        ))}
                      </fieldset>
                      <fieldset className="space-y-2">
                        <legend className="text-sm font-medium text-ink">Commercial content disclosure</legend>
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input type="checkbox" checked={tiktokSettings.brandOrganicToggle} disabled={!canEdit} onChange={(event) => updateTikTokSettings({ brandOrganicToggle: event.target.checked })} className="h-4 w-4 accent-brand" />
                          Your brand (promoting yourself or your business)
                        </label>
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input type="checkbox" checked={tiktokSettings.brandContentToggle} disabled={!canEdit} onChange={(event) => updateTikTokSettings({ brandContentToggle: event.target.checked })} className="h-4 w-4 accent-brand" />
                          Branded content (promoting another brand)
                        </label>
                      </fieldset>
                      <label className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-3 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={tiktokSettings.publishConsent}
                          disabled={!canEdit}
                          onChange={(event) => updateTikTokSettings({ publishConsent: event.target.checked })}
                          className="mt-0.5 h-4 w-4 accent-brand"
                        />
                        <span>By posting, I agree to TikTok&apos;s Music Usage Confirmation and confirm this content should be sent to TikTok.</span>
                      </label>
                    </>
                  ) : null}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Destinations" description="Choose the connected social accounts you want to publish to." />
            <CardBody className="space-y-4">
              {accountsLoading ? (
                <p className="py-4 text-center text-sm text-ink-muted">Loading connected accounts…</p>
              ) : connectedDestinations.length === 0 ? (
                <p className="rounded-lg border border-border bg-surface-muted px-3 py-3 text-sm text-ink-muted">Connect a social account on the Accounts page before scheduling or publishing.</p>
              ) : COMPOSER_DESTINATION_PLATFORMS.map((platform) => {
                const platformAccounts = connectedDestinations.filter(({ account }) => account.platform === platform);
                if (!platformAccounts.length) return null;
                return (
                  <div key={platform}>
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold capitalize text-ink"><PlatformGlyph platform={platform} size="sm" />{platform}</p>
                    <div className="space-y-2">
                      {platformAccounts.map(({ account }) => {
                        const connected = account.connection_status === "connected";
                        const selectedDestination = selectedDestinationIds.includes(account.id);
                        const expirySoon = account.token_expires_at && new Date(account.token_expires_at).getTime() < Date.now() + 7 * 86400000;
                        return (
                          <label key={account.id} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5", selectedDestination ? "border-brand bg-brand-soft" : "border-border", (!connected || !canEdit) && "opacity-70")}>
                            <input
                              type="checkbox"
                              checked={selectedDestination}
                              disabled={!connected || !canEdit}
                              onChange={(event) => {
                                setSelectedDestinationIds((ids) => event.target.checked ? [...ids, account.id] : ids.filter((id) => id !== account.id));
                                if (event.target.checked && !selected.includes(platform)) {
                                  setSelected((items) => [...items, platform]);
                                  if (platform === "youtube") {
                                    setPlatformDetails((current) => ({
                                      ...current,
                                      youtube: {
                                        ...current.youtube,
                                        platform_settings: {
                                          ...platformSettingsObject(current.youtube?.platform_settings),
                                          privacyStatus: youtubePrivacyStatus(current.youtube?.platform_settings),
                                        },
                                      },
                                    }));
                                  }
                                }
                              }}
                              className="h-4 w-4 accent-brand"
                            />
                            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink">{account.account_name}</span><span className="block truncate text-xs text-ink-subtle">{account.username ? `@${account.username}` : account.account_type.replaceAll("_", " ")}</span></span>
                            <span className="text-right text-xs font-semibold">
                              <span className={cn("block", connected && !expirySoon ? "text-success" : "text-warning")}>{!connected ? account.connection_status.replaceAll("_", " ") : expirySoon ? "Expires soon" : "Connected"}</span>
                              {platform === "tiktok" && (
                                <span className={cn("mt-0.5 block", account.granted_scopes.includes(TIKTOK_VIDEO_PUBLISH_SCOPE) ? "text-success" : "text-warning")}>
                                  {account.granted_scopes.includes(TIKTOK_VIDEO_PUBLISH_SCOPE) ? "TikTok publishing enabled" : "Publishing permission required"}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {selectedTikTokAccounts.length > 1 && (
                <div role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-sm text-ink-muted">This release supports one TikTok destination per post.</div>
              )}
            </CardBody>
          </Card>

          {/* Schedule */}
          <Card>
            <CardHeader title="Schedule" description="Pick when this post goes live" />
            <CardBody className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-surface-muted/50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink">Require approval</p>
                  <p className="text-xs text-ink-subtle">Publishing is blocked until this exact revision is approved.</p>
                </div>
                <span className={cn(!approvalSettingAllowed && "pointer-events-none opacity-60")}>
                  <Toggle checked={approvalRequired} onChange={setApprovalRequired} label="Require approval" />
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label="Date" htmlFor="date">
                  <div className="relative">
                    <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
                    <Input
                      id="date"
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      className="pl-9"
                      disabled={!canEdit}
                    />
                  </div>
                </FormField>
                <FormField label="Time" htmlFor="time">
                  <div className="relative">
                    <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
                    <Input
                      id="time"
                      type="time"
                      value={time}
                      onChange={(e) => setTime(e.target.value)}
                      className="pl-9"
                      disabled={!canEdit}
                    />
                  </div>
                </FormField>
                <FormField label="Time zone" htmlFor="tz">
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
                    <Select
                      id="tz"
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="pl-9"
                      disabled={!canEdit}
                    >
                      {[...new Set([activeWorkspace?.timezone ?? "UTC", "UTC", ...TIMEZONES.map((tz) => tz.split(" ")[0])])].map((tz) => (
                        <option key={tz} value={tz}>
                          {tz}
                        </option>
                      ))}
                    </Select>
                  </div>
                </FormField>
              </div>
            </CardBody>
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <Button type="button" variant="outline" onClick={onSaveDraft} loading={mutating} disabled={!canEdit}>
              <Save className="h-4 w-4" aria-hidden /> Save Draft
            </Button>
            {latestApproval?.request.status === "pending" ? (
              <Button variant="secondary" onClick={() => router.push("/dashboard/approvals")}>
                <ShieldCheck className="h-4 w-4" aria-hidden /> Approval pending
              </Button>
            ) : (
              <Button variant="secondary" onClick={openApprovalModal} disabled={!canEdit || availableApprovers.length === 0}>
                <ShieldCheck className="h-4 w-4" aria-hidden /> Send for Approval
              </Button>
            )}
            <Button type="button" onClick={onSchedule} loading={mutating} disabled={!canManage}>
              <CalendarClock className="h-4 w-4" aria-hidden /> Schedule Post
            </Button>
            <Button type="button" onClick={() => setPublishConfirmOpen(true)} loading={mutating} disabled={!canManage || selectedDestinationIds.length === 0}>
              <Zap className="h-4 w-4" aria-hidden /> Publish Now
            </Button>
          </div>
        </div>

        {/* Preview */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-20">
            <Card>
              <CardHeader
                title="Live preview"
                description="An approximate preview using your selected destinations and current content"
              />
              <CardBody className="lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
                <CreatePostLivePreview
                  accounts={accounts}
                  selectedDestinationIds={selectedDestinationIds}
                  caption={caption}
                  customiseCaptions={perPlatform}
                  platformCaptions={captions}
                  media={media}
                  youtubeTitle={youtubeTitle}
                  youtubePrivacyStatus={youtubePrivacy}
                />
              </CardBody>
            </Card>
          </div>
        </div>
      </div>}

      <Modal
        open={publishConfirmOpen}
        onClose={() => setPublishConfirmOpen(false)}
        title="Queue this post now?"
        description={`Towkn will publish the latest saved revision to ${selectedDestinationIds.length} destination${selectedDestinationIds.length === 1 ? "" : "s"}.`}
        size="sm"
        footer={<><Button type="button" variant="outline" onClick={() => setPublishConfirmOpen(false)}>Cancel</Button><Button type="button" onClick={() => void onPublishNow()} loading={mutating}><Zap className="h-4 w-4" /> Queue publishing</Button></>}
      >
        <p className="text-sm text-ink-muted">The queued status confirms durable delivery, not provider publication. Results will appear separately for each account.</p>
      </Modal>

      <Modal
        open={approvalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        title="Submit for approval"
        description="The saved revision will be locked until it is resolved or deliberately superseded."
        size="md"
        footer={<><Button variant="outline" onClick={() => setApprovalModalOpen(false)}>Cancel</Button><Button onClick={() => void onSubmitApproval()} loading={mutating}><Send className="h-4 w-4" /> Submit revision</Button></>}
      >
        <div className="space-y-4">
          <FormField label="Approver" required>
            <Select value={selectedApproverId} onChange={(event) => setSelectedApproverId(event.target.value)}>
              <option value="">Choose an approver</option>
              {availableApprovers.map((approver) => <option key={approver.userId} value={approver.userId}>{approver.name} · {approver.role.replaceAll("_", " ")}</option>)}
            </Select>
          </FormField>
          <FormField label="Deadline" hint="Optional and must be in the future.">
            <Input type="datetime-local" min={new Date().toISOString().slice(0, 16)} value={approvalDueAt} onChange={(event) => setApprovalDueAt(event.target.value)} />
          </FormField>
          <FormField label="Submission message">
            <Textarea value={approvalMessage} maxLength={5000} onChange={(event) => setApprovalMessage(event.target.value)} placeholder="Share context for the reviewer" />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={supersedeConfirmOpen}
        onClose={() => setSupersedeConfirmOpen(false)}
        title="Edit and invalidate approval?"
        size="sm"
        footer={<><Button variant="outline" onClick={() => setSupersedeConfirmOpen(false)}>Keep locked</Button><Button variant="danger" onClick={() => { setEditSupersede(true); setSupersedeConfirmOpen(false); }}>Edit and supersede</Button></>}
      >
        <p className="text-sm text-ink-muted">Saving content changes will supersede the current request or approval. The new revision must be submitted again before publishing.</p>
      </Modal>

      <Modal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        title="Choose workspace media"
        description={`Private media from ${activeWorkspace?.name ?? "your active workspace"}.`}
        size="xl"
        footer={
          <>
            <Button variant="outline" onClick={() => setMediaPickerOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                const candidates = new Map(
                  [...selectedMedia, ...library].map((item) => [item.asset.id, item]),
                );
                setSelectedMedia(
                  [...pickerSelection].flatMap((id) => {
                    const item = candidates.get(id);
                    return item ? [item] : [];
                  }),
                );
                setMediaPickerOpen(false);
              }}
            >
              Add {pickerSelection.size} selected
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <SearchInput
              value={libraryQuery}
              onChange={setLibraryQuery}
              placeholder="Search workspace media…"
              className="flex-1"
            />
            <Button variant="outline" onClick={() => void loadLibrary()} aria-label="Refresh workspace media">
              <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
            </Button>
          </div>
          {libraryLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="aspect-square w-full" />
              ))}
            </div>
          ) : libraryError ? (
            <div className="rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
              <p>{libraryError}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => void loadLibrary()}>Retry</Button>
            </div>
          ) : library.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-subtle">No workspace media matches this search.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {library.map((item) => {
                const mediaItem = toMediaItem(item);
                const chosen = pickerSelection.has(item.asset.id);
                return (
                  <button
                    key={item.asset.id}
                    type="button"
                    aria-pressed={chosen}
                    onClick={() =>
                      setPickerSelection((current) => {
                        const next = new Set(current);
                        if (next.has(item.asset.id)) next.delete(item.asset.id);
                        else next.add(item.asset.id);
                        return next;
                      })
                    }
                    className={cn(
                      "overflow-hidden rounded-lg border bg-surface text-left transition-colors",
                      chosen ? "border-brand ring-2 ring-brand/20" : "border-border hover:border-border-strong",
                    )}
                  >
                    <MediaThumbnail item={mediaItem} rounded="rounded-none" className="aspect-square w-full" />
                    <p className="truncate px-2.5 py-2 text-xs font-medium text-ink">{item.asset.file_name}</p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={conflictOpen}
        onClose={() => setConflictOpen(false)}
        title="Newer post changes found"
        description="Another workspace member saved this post first. Your unsaved form remains visible."
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                void navigator.clipboard.writeText(caption);
                toast.info("Caption copied", "Your current caption is on the clipboard.");
              }}
            >
              Copy caption
            </Button>
            <Button
              onClick={() => {
                setConflictOpen(false);
                void loadPost();
              }}
            >
              Reload latest
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-muted">
          Reloading replaces this form with the latest database revision. There is no force-overwrite option.
        </p>
      </Modal>
    </div>
  );
}

function serializeEditor(value: {
  caption: string;
  selected: SocialPlatform[];
  captions: Partial<Record<SocialPlatform, string>>;
  platformDetails: Partial<Record<SocialPlatform, Pick<PostPlatformInput, "platform_title" | "platform_settings">>>;
  mediaAssetIds: string[];
  destinationAccountIds: string[];
  date: string;
  time: string;
  timezone: string;
  assignedTo: string | null;
  approvalRequired: boolean;
}): string {
  return JSON.stringify({
    ...value,
    selected: [...value.selected].sort(),
    mediaAssetIds: [...value.mediaAssetIds],
    destinationAccountIds: [...value.destinationAccountIds].sort(),
  });
}

function platformSettingsObject(value: PostPlatformInput["platform_settings"]): Record<string, Json> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, Json>
    : {};
}

function youtubePrivacyStatus(value: PostPlatformInput["platform_settings"]): string {
  const privacy = platformSettingsObject(value).privacyStatus;
  return typeof privacy === "string" && ["private", "unlisted", "public"].includes(privacy)
    ? privacy
    : DEFAULT_YOUTUBE_PRIVACY;
}

function tiktokPrivacyLabel(value: string): string {
  switch (value) {
    case "PUBLIC_TO_EVERYONE": return "Everyone";
    case "MUTUAL_FOLLOW_FRIENDS": return "Friends";
    case "FOLLOWER_OF_CREATOR": return "Followers";
    case "SELF_ONLY": return "Only me";
    default: return value.replaceAll("_", " ").toLowerCase();
  }
}

function ComposerUploadRow({ item, onCancel, onRetry }: {
  item: MediaUploadQueueItem;
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{item.file.name}</p>
        <span className="text-xs capitalize text-ink-muted">{item.state}</span>
        {item.state === "uploading" && (
          <button type="button" onClick={onCancel} aria-label={`Cancel ${item.file.name}`} className="rounded-md p-1 text-ink-muted hover:bg-surface-muted">
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
        {(item.state === "failed" || item.state === "cancelled") && (
          <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
        )}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted">
        <div className="h-full bg-brand transition-[width]" style={{ width: `${item.progress}%` }} />
      </div>
      {item.error && <p className="mt-1 text-xs text-danger">{item.error}</p>}
    </div>
  );
}
