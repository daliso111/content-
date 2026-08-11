"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Clock, LogIn, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormField, Input } from "@/components/ui/Field";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { acceptInvitation, declineInvitation, getInvitationDetails } from "@/lib/services/team-service";
import { ROLE_META } from "@/lib/constants";
import type { InvitationActionResult } from "@/types";

export default function AcceptInvitePage() {
  return <Suspense fallback={<InviteShell><Skeleton className="h-44 w-full" /></InviteShell>}><AcceptInviteContent /></Suspense>;
}

function AcceptInviteContent() {
  const search = useSearchParams(); const router = useRouter();
  const { user, loading: authLoading, updatePassword } = useAuth();
  const { refreshWorkspaces, selectWorkspace } = useWorkspace();
  const invitationId = search.get("invitation") ?? ""; const token = search.get("token") ?? undefined;
  const [details, setDetails] = useState<(InvitationActionResult & { message?: string; inviterName?: string }) | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false); const [password, setPassword] = useState("");
  const needsPassword = Boolean(user?.invited_at);
  const returnPath = useMemo(() => `/accept-invite?invitation=${encodeURIComponent(invitationId)}${token ? `&token=${encodeURIComponent(token)}` : ""}`, [invitationId, token]);

  useEffect(() => {
    if (authLoading) return; if (!user) { setLoading(false); return; }
    if (!invitationId) { setError("This invitation link is incomplete."); setLoading(false); return; }
    setLoading(true); getInvitationDetails(invitationId, token).then(setDetails).catch((reason: Error) => setError(reason.message)).finally(() => setLoading(false));
  }, [authLoading, invitationId, token, user]);
  const accept = async () => {
    setWorking(true); setError(null);
    try {
      if (needsPassword) {
        if (password.length < 8) throw new Error("Create a password with at least 8 characters before joining.");
        const passwordResult = await updatePassword(password); if (!passwordResult.success) throw new Error(passwordResult.error);
      }
      const joined = await acceptInvitation(invitationId, token);
      router.replace(`/accept-invite?invitation=${encodeURIComponent(invitationId)}`);
      await refreshWorkspaces(); if (joined.workspaceId) selectWorkspace(joined.workspaceId);
      router.replace("/dashboard");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The invitation could not be accepted."); }
    finally { setWorking(false); }
  };
  const decline = async () => {
    setWorking(true); setError(null);
    try { await declineInvitation(invitationId, token); router.replace(`/accept-invite?invitation=${encodeURIComponent(invitationId)}`); setDetails((current) => current ? { ...current, status: "declined" } : current); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The invitation could not be declined."); }
    finally { setWorking(false); }
  };
  if (authLoading || loading) return <InviteShell><Skeleton className="h-44 w-full" /></InviteShell>;
  if (!user) return <InviteShell><StateIcon icon={LogIn} /><h1 className="text-xl font-semibold text-ink">Sign in to review this invitation</h1><p className="mt-2 text-sm text-ink-muted">Use the email address that received the invitation.</p><Link href={`/sign-in?next=${encodeURIComponent(returnPath)}`} className="mt-6 inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-white">Sign in</Link></InviteShell>;
  if (error && !details) return <InviteShell><StateIcon icon={XCircle} danger /><h1 className="text-xl font-semibold text-ink">Invitation unavailable</h1><p className="mt-2 text-sm text-danger">{error}</p><Link href="/dashboard" className="mt-6 text-sm font-medium text-brand-text">Return to dashboard</Link></InviteShell>;
  const role = details?.role; const terminal = details?.status && details.status !== "pending";
  return <InviteShell><StateIcon icon={terminal ? Clock : ShieldCheck} />
    <h1 className="text-xl font-semibold text-ink">{details?.workspaceName ?? "Workspace invitation"}</h1>
    <p className="mt-2 text-sm text-ink-muted">{role ? `You have been invited as ${ROLE_META[role].label}.` : "Review your workspace invitation."}</p>
    {details?.inviterName && <p className="mt-1 text-sm text-ink-subtle">Invited by {details.inviterName}</p>}
    {details?.message && <p className="mt-4 border-l-2 border-brand pl-3 text-sm text-ink-muted">{details.message}</p>}
    {terminal ? <div className="mt-6"><CheckCircle2 className="mx-auto h-6 w-6 text-success" /><p className="mt-2 text-sm font-medium capitalize text-ink">Invitation {details?.status}</p></div>
      : <><p className="mt-4 text-xs text-ink-subtle">Expires {details?.expiresAt ? new Date(details.expiresAt).toLocaleString() : "soon"}</p>
        {needsPassword && <FormField label="Create your Towkn password" htmlFor="invite-password" hint="At least 8 characters"><Input id="invite-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></FormField>}
        {error && <p className="mt-4 text-sm text-danger">{error}</p>}
        <div className="mt-6 flex justify-center gap-3"><Button variant="outline" onClick={() => void decline()} loading={working}>Decline</Button><Button onClick={() => void accept()} loading={working}><CheckCircle2 className="h-4 w-4" /> Accept invitation</Button></div></>}
  </InviteShell>;
}

function InviteShell({ children }: { children: React.ReactNode }) { return <main className="flex min-h-screen items-center justify-center bg-canvas px-4"><section className="w-full max-w-lg border border-border bg-surface p-8 text-center shadow-card">{children}</section></main>; }
function StateIcon({ icon: Icon, danger = false }: { icon: typeof ShieldCheck; danger?: boolean }) { return <span className={`mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-lg ${danger ? "bg-danger-soft text-danger" : "bg-brand-soft text-brand-text"}`}><Icon className="h-6 w-6" /></span>; }
