"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clock3,
  Link2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Unlink,
  Users2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/Modal";
import { PlatformIcon } from "@/components/ui/PlatformIcon";
import { Skeleton } from "@/components/ui/Skeleton";
import { ConnectionBadge } from "@/components/ui/StatusBadge";
import { useToast } from "@/components/ui/Toast";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { callbackErrorMessage, youtubeCallbackErrorMessage } from "@/lib/social-account-errors";
import { socialAccountIdentity } from "@/lib/social-account-presentation";
import { socialAccountService } from "@/lib/services/social-account-service";
import { listRecentPublishingResults } from "@/lib/services/publishing-service";
import { formatDate, formatRelative } from "@/lib/utils";
import type { MetaConnectionOption, PublishingJob, SocialAccountView } from "@/types";

const UNSUPPORTED = ["linkedin", "tiktok", "x"] as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Social accounts could not be loaded.";
}

export default function AccountsPage() {
  const router = useRouter();
  const toast = useToast();
  const { activeWorkspace, activeMembership, loading: workspaceLoading } = useWorkspace();
  const [accounts, setAccounts] = useState<SocialAccountView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toDisconnect, setToDisconnect] = useState<SocialAccountView | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [options, setOptions] = useState<MetaConnectionOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionLoading, setSelectionLoading] = useState(false);
  const [publishingJobs, setPublishingJobs] = useState<PublishingJob[]>([]);
  const [providerPickerOpen, setProviderPickerOpen] = useState(false);
  const queryHandled = useRef(false);

  const canManage = activeMembership?.status === "active"
    && ["owner", "administrator"].includes(activeMembership.role);

  const loadAccounts = useCallback(async () => {
    if (!activeWorkspace) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    try {
      const [nextAccounts, nextJobs] = await Promise.all([
        socialAccountService.listSocialAccounts(activeWorkspace.id),
        listRecentPublishingResults(activeWorkspace.id, 50),
      ]);
      setAccounts(nextAccounts);
      setPublishingJobs(nextJobs);
    } catch (error) {
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [activeWorkspace]);

  useEffect(() => {
    if (!workspaceLoading) void loadAccounts();
  }, [loadAccounts, workspaceLoading]);

  useEffect(() => {
    if (queryHandled.current) return;
    queryHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const callbackError = params.get("connection_error");
    const youtubeError = params.get("youtube_error");
    const callbackSuccess = params.get("connection_success");
    const pendingSession = params.get("meta_session");
    if (!callbackError && !youtubeError && !callbackSuccess && !pendingSession) return;
    router.replace("/dashboard/accounts", { scroll: false });
    if (callbackError) {
      toast.error("Connection not completed", callbackErrorMessage(callbackError));
      return;
    }
    if (youtubeError) {
      toast.error("YouTube connection not completed", youtubeCallbackErrorMessage(youtubeError));
      return;
    }
    if (callbackSuccess) {
      toast.success(callbackSuccess.startsWith("youtube:")
        ? "YouTube channel connected"
        : "Meta connection completed");
      void loadAccounts();
    }
    if (pendingSession) {
      setSelectionLoading(true);
      void socialAccountService.getMetaConnectionOptions(pendingSession)
        .then((result) => {
          setSessionId(result.session.id);
          setOptions(result.options);
          setSelected(new Set());
        })
        .catch((error) => toast.error("Account selection unavailable", errorMessage(error)))
        .finally(() => setSelectionLoading(false));
    }
  }, [loadAccounts, router, toast]);

  const startConnection = async () => {
    if (!activeWorkspace) return;
    setBusyId("connect");
    setProviderPickerOpen(false);
    try {
      const { authorizationUrl } = await socialAccountService.startMetaConnection(activeWorkspace.id);
      window.location.assign(authorizationUrl);
    } catch (error) {
      toast.error("Could not start Meta connection", errorMessage(error));
      setBusyId(null);
    }
  };

  const startYouTubeConnection = async () => {
    if (!activeWorkspace) return;
    setBusyId("connect-youtube");
    setProviderPickerOpen(false);
    try {
      const { authorizationUrl } = await socialAccountService.startYouTubeConnection(activeWorkspace.id);
      window.location.assign(authorizationUrl);
    } catch (error) {
      toast.error("Could not start YouTube connection", errorMessage(error));
      setBusyId(null);
    }
  };

  const completeConnection = async () => {
    if (!sessionId || selected.size === 0) return;
    setBusyId("complete");
    try {
      const connected = await socialAccountService.completeMetaConnection(sessionId, [...selected]);
      setSessionId(null);
      setOptions([]);
      setSelected(new Set());
      await loadAccounts();
      toast.success(
        `${connected.length} ${connected.length === 1 ? "account" : "accounts"} connected`,
        "The selected destinations are ready for PostFlow publishing.",
      );
    } catch (error) {
      toast.error("Connection not completed", errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const refreshAccount = async (view: SocialAccountView) => {
    setBusyId(view.account.id);
    try {
      const result = await socialAccountService.refreshSocialAccount(view.account.id);
      await loadAccounts();
      toast.success(
        `${view.account.account_name} refreshed`,
        result.linkedInstagramAccountId
          ? "Its linked Instagram Professional account is connected too."
          : undefined,
      );
    } catch (error) {
      await loadAccounts();
      toast.error("Account refresh failed", errorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const disconnectAccount = async () => {
    if (!toDisconnect) return;
    const view = toDisconnect;
    setBusyId(view.account.id);
    try {
      const result = await socialAccountService.disconnectSocialAccount(view.account.id);
      await loadAccounts();
      toast.info(
        `${view.account.account_name} disconnected`,
        result.warning ? "PostFlow removed its stored credential. Provider-wide access was left unchanged." : undefined,
      );
    } catch (error) {
      toast.error("Account could not be disconnected", errorMessage(error));
    } finally {
      setBusyId(null);
      setToDisconnect(null);
    }
  };

  const activeCount = accounts.filter(({ account }) => account.connection_status === "connected").length;
  const hasYouTubeAccount = accounts.some(({ account }) => account.platform === "youtube");
  const pageNames = new Map(
    options.filter((option) => option.platform === "facebook")
      .map((option) => [option.platformAccountId, option.accountName]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Social Accounts"
        description="Connect and manage the social channels used by this workspace."
        actions={canManage ? (
          <Button onClick={() => setProviderPickerOpen(true)} loading={busyId?.startsWith("connect") ?? false}>
            <Link2 className="h-4 w-4" aria-hidden /> Connect account
          </Button>
        ) : undefined}
      />

      {!canManage && !workspaceLoading && (
        <div className="flex items-start gap-3 rounded-xl border border-info/30 bg-info-soft px-4 py-3" role="note">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden />
          <p className="text-sm text-ink-muted">
            You can view workspace connections. Only owners and administrators can manage them.
          </p>
        </div>
      )}

      <div className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-soft text-brand-text">
          <Users2 className="h-5 w-5" aria-hidden />
        </span>
        <p className="text-sm text-ink">
          <span className="font-semibold">{activeCount}</span> active social {activeCount === 1 ? "connection" : "connections"}
        </p>
      </div>

      {loading || workspaceLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
      ) : loadError ? (
        <EmptyState
          icon={AlertTriangle}
          title="Social accounts could not be loaded"
          description={loadError}
          action={<Button variant="outline" onClick={loadAccounts}><RotateCcw className="h-4 w-4" /> Retry</Button>}
        />
      ) : accounts.length === 0 ? (
        <EmptyState
          icon={Link2}
          title="No social accounts connected"
          description="Connect Meta destinations or a YouTube channel to get started."
          action={canManage ? <Button onClick={() => setProviderPickerOpen(true)}>Connect account</Button> : undefined}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {accounts.map((view) => (
            <ConnectedAccountCard
              key={view.account.id}
              view={view}
              canManage={Boolean(canManage)}
              busy={busyId === view.account.id}
              onReconnect={view.account.platform === "youtube" ? startYouTubeConnection : startConnection}
              onRefresh={() => refreshAccount(view)}
              onDisconnect={() => setToDisconnect(view)}
              publishingJobs={publishingJobs.filter((job) => job.social_account_id === view.account.id)}
            />
          ))}
        </div>
      )}

      <section className="space-y-3" aria-labelledby="more-platforms-heading">
        <div>
          <h2 id="more-platforms-heading" className="text-sm font-semibold text-ink">More platforms</h2>
          <p className="mt-0.5 text-sm text-ink-muted">Connect YouTube now. Additional networks will be added later.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {!hasYouTubeAccount && (
            <Card className="flex items-center justify-between gap-3 p-4 shadow-none">
              <div className="flex min-w-0 items-center gap-3">
                <PlatformIcon platform="youtube" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">YouTube</p>
                  <p className="truncate text-xs text-ink-muted">Connect your YouTube channel</p>
                </div>
              </div>
              {canManage && <Button size="sm" variant="outline" onClick={startYouTubeConnection}>Connect YouTube</Button>}
            </Card>
          )}
          {UNSUPPORTED.map((platform) => (
            <Card key={platform} className="flex items-center justify-between p-4 shadow-none">
              <div className="flex items-center gap-3">
                <PlatformIcon platform={platform} />
                <span className="text-sm font-semibold capitalize text-ink">{platform === "x" ? "X" : platform}</span>
              </div>
              <Badge>Coming soon</Badge>
            </Card>
          ))}
        </div>
      </section>

      <Modal
        open={providerPickerOpen}
        onClose={() => setProviderPickerOpen(false)}
        title="Connect account"
        description="Choose a provider to connect to this workspace."
      >
        <div className="space-y-2">
          <ProviderChoice
            platform="facebook"
            title="Meta"
            description="Connect Facebook Pages and linked Instagram Professional accounts."
            onClick={startConnection}
          />
          <ProviderChoice
            platform="youtube"
            title="YouTube"
            description="Connect a YouTube channel with secure offline access."
            onClick={startYouTubeConnection}
          />
          <ComingSoonChoice title="Pinterest" marker="P" />
          <ProviderChoice platform="linkedin" title="LinkedIn" description="Coming soon" disabled />
          <ProviderChoice platform="tiktok" title="TikTok" description="Coming soon" disabled />
          <ProviderChoice platform="x" title="X" description="Coming soon" disabled />
        </div>
      </Modal>

      <Modal
        open={Boolean(sessionId) || selectionLoading}
        onClose={() => { setSessionId(null); setOptions([]); setSelected(new Set()); }}
        title="Choose Meta destinations"
        description="Select the Pages and linked Instagram Professional accounts to connect."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setSessionId(null)}>Cancel</Button>
            <Button
              onClick={completeConnection}
              loading={busyId === "complete"}
              disabled={!sessionId || selected.size === 0}
            >
              <Check className="h-4 w-4" aria-hidden /> Connect selected
            </Button>
          </>
        }
      >
        {selectionLoading ? (
          <div className="space-y-3"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        ) : options.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No eligible destinations were returned by Meta.</p>
        ) : (
          <div className="space-y-2">
            {options.map((option) => {
              const checked = selected.has(option.platformAccountId);
              return (
                <label
                  key={`${option.platform}:${option.platformAccountId}`}
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-surface-muted"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.delete(option.platformAccountId);
                      else next.add(option.platformAccountId);
                      return next;
                    })}
                    className="mt-1 h-4 w-4 accent-brand"
                  />
                  <PlatformIcon platform={option.platform} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{option.accountName}</span>
                    <span className="block text-xs text-ink-muted">
                      {option.username ? `@${option.username}` : option.platformAccountId}
                      {option.parentPageId ? ` · Linked to ${pageNames.get(option.parentPageId) ?? "Facebook Page"}` : ""}
                    </span>
                  </span>
                  {option.alreadyConnected && <Badge tone="success">Connected</Badge>}
                </label>
              );
            })}
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={Boolean(toDisconnect)}
        onClose={() => setToDisconnect(null)}
        onConfirm={disconnectAccount}
        title="Disconnect account?"
        message={toDisconnect
          ? `${toDisconnect.account.account_name} will no longer be available to PostFlow. Existing posts and media are preserved.`
          : ""}
        confirmLabel="Disconnect"
        destructive
      />
    </div>
  );
}

function ConnectedAccountCard({
  view,
  canManage,
  busy,
  onReconnect,
  onRefresh,
  onDisconnect,
  publishingJobs,
}: {
  view: SocialAccountView;
  canManage: boolean;
  busy: boolean;
  onReconnect: () => void;
  onRefresh: () => void;
  onDisconnect: () => void;
  publishingJobs: PublishingJob[];
}) {
  const { account, connectedByName } = view;
  const identity = socialAccountIdentity(account);
  const needsReconnect = ["reconnect_required", "expired", "disconnected", "error"].includes(account.connection_status);
  const expiresSoon = account.token_expires_at
    ? new Date(account.token_expires_at).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    : false;
  const expiryText = needsReconnect
    ? "Reconnection required"
    : account.token_expires_at
      ? `Expires on ${formatDate(account.token_expires_at)}`
      : `Expiry not provided by ${account.platform === "youtube" ? "Google" : "Meta"}`;
  const lastSuccess = publishingJobs.find((job) => job.status === "succeeded");
  const recentFailures = publishingJobs.filter((job) => ["failed", "reconciliation_required"].includes(job.status)).length;

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {account.profile_image_url ? (
            <span
              className="h-10 w-10 shrink-0 rounded-lg bg-surface-muted bg-cover bg-center"
              style={{ backgroundImage: `url(${JSON.stringify(account.profile_image_url)})` }}
              role="img"
              aria-label="Account profile"
            />
          ) : <PlatformIcon platform={account.platform} size="lg" />}
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">{identity.platformLabel}</p>
            <p className="truncate text-sm font-semibold text-ink">{identity.primary}</p>
            {identity.secondary && <p className="truncate text-xs text-ink-muted">{identity.secondary}</p>}
          </div>
        </div>
        <ConnectionBadge status={account.connection_status} />
      </div>

      <div className="mt-4 flex-1 space-y-2 border-t border-border pt-4 text-xs text-ink-muted">
        <p className={expiresSoon || needsReconnect ? "flex items-center gap-1.5 text-warning" : "flex items-center gap-1.5"}>
          <Clock3 className="h-3.5 w-3.5" aria-hidden /> {expiryText}
        </p>
        <p>
          {account.last_refreshed_at
            ? `Refreshed ${formatRelative(account.last_refreshed_at)}`
            : "Not refreshed yet"}
        </p>
        <p>{connectedByName ? `Connected by ${connectedByName}` : "Connected by a workspace administrator"}</p>
        {account.platform === "youtube" ? (
          <p>YouTube publishing is not enabled yet</p>
        ) : (
          <>
            <p>{lastSuccess?.completed_at ? `Last published ${formatRelative(lastSuccess.completed_at)}` : "No successful publications yet"}</p>
            {recentFailures > 0 && <p className="text-danger">{recentFailures} recent publishing {recentFailures === 1 ? "issue" : "issues"}</p>}
          </>
        )}
        {account.last_error_message && <p className="text-danger">{account.last_error_message}</p>}
      </div>

      {canManage && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {needsReconnect ? (
            <Button size="sm" onClick={onReconnect}>
              <Link2 className="h-4 w-4" aria-hidden /> Reconnect
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={onRefresh} loading={busy}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Refresh
            </Button>
          )}
          {account.connection_status !== "disconnected" && (
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger-soft"
              onClick={onDisconnect}
              disabled={busy}
            >
              <Unlink className="h-4 w-4" aria-hidden /> Disconnect
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function ProviderChoice({
  platform,
  title,
  description,
  onClick,
  disabled = false,
}: {
  platform: "facebook" | "youtube" | "linkedin" | "tiktok" | "x";
  title: string;
  description: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors enabled:hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
    >
      <PlatformIcon platform={platform} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-ink-muted">{description}</span>
      </span>
      {disabled && <Badge>Coming soon</Badge>}
    </button>
  );
}

function ComingSoonChoice({ title, marker }: { title: string; marker: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-3 opacity-60">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-danger-soft text-sm font-bold text-danger">{marker}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{title}</span>
        <span className="block text-xs text-ink-muted">Coming soon</span>
      </span>
      <Badge>Coming soon</Badge>
    </div>
  );
}
