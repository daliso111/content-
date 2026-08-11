"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Ban, History, Mail, MoreVertical, RefreshCw, Shield, Trash2,
  UserCheck, UserMinus, UserPlus, Users,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField, Input, Select, Textarea } from "@/components/ui/Field";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { Modal } from "@/components/ui/Modal";
import { Pagination } from "@/components/ui/Pagination";
import { SearchInput } from "@/components/ui/SearchInput";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/hooks/useWorkspace";
import { ROLE_META } from "@/lib/constants";
import {
  inviteMember, leaveWorkspace, listEligibleRolesForCurrentUser, listMembershipEvents,
  listWorkspaceInvitations, listWorkspaceMembers, reactivateMember, removeMember,
  resendInvitation, revokeInvitation, suspendMember, transferOwnership, updateMemberRole,
} from "@/lib/services/team-service";
import { formatRelative, isValidEmail } from "@/lib/utils";
import type { MembershipEvent, TeamRole, TeamRoleOption, WorkspaceInvitation, WorkspaceMember } from "@/types";

type Tab = "active" | "suspended" | "invitations" | "history";
type PendingAction = { kind: "suspend" | "remove" | "transfer"; member: WorkspaceMember } | null;
const PAGE_SIZE = 10;

export default function TeamPage() {
  const toast = useToast(); const { user } = useAuth();
  const { activeWorkspace, activeMembership, refreshWorkspaces } = useWorkspace();
  const [members, setMembers] = useState<WorkspaceMember[]>([]); const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([]);
  const [events, setEvents] = useState<MembershipEvent[]>([]); const [eventTotal, setEventTotal] = useState(0);
  const [roles, setRoles] = useState<TeamRoleOption[]>([]); const [tab, setTab] = useState<Tab>("active");
  const [query, setQuery] = useState(""); const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false); const [roleMember, setRoleMember] = useState<WorkspaceMember | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null); const [working, setWorking] = useState(false);
  const canManage = roles.length > 0;

  const load = useCallback(async () => {
    if (!activeWorkspace) { setMembers([]); setInvitations([]); setEvents([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [nextMembers, nextInvitations, nextRoles, history] = await Promise.all([
        listWorkspaceMembers(activeWorkspace.id), listWorkspaceInvitations(activeWorkspace.id),
        listEligibleRolesForCurrentUser(activeWorkspace.id), listMembershipEvents(activeWorkspace.id, { page: tab === "history" ? page : 1, pageSize: PAGE_SIZE }),
      ]);
      setMembers(nextMembers); setInvitations(nextInvitations); setRoles(nextRoles); setEvents(history.items); setEventTotal(history.total);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Team data could not be loaded."); }
    finally { setLoading(false); }
  }, [activeWorkspace, page, tab]);
  useEffect(() => { void load(); }, [load]);

  const filteredMembers = useMemo(() => members.filter((member) => {
    if (tab === "active" && member.status !== "active") return false;
    if (tab === "suspended" && member.status !== "suspended") return false;
    if (roleFilter !== "all" && member.role !== roleFilter) return false;
    return !query || `${member.fullName} ${member.email ?? ""}`.toLowerCase().includes(query.toLowerCase());
  }), [members, query, roleFilter, tab]);
  const filteredInvitations = useMemo(() => invitations.filter((invitation) => {
    if (statusFilter !== "all" && invitation.status !== statusFilter) return false;
    if (roleFilter !== "all" && invitation.role !== roleFilter) return false;
    return !query || invitation.email.toLowerCase().includes(query.toLowerCase());
  }), [invitations, query, roleFilter, statusFilter]);
  const rows = tab === "invitations" ? filteredInvitations : filteredMembers;
  const pagedMembers = filteredMembers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pagedInvitations = filteredInvitations.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const perform = async (action: () => Promise<unknown>, success: string, refreshWorkspace = false) => {
    setWorking(true);
    try { await action(); toast.success(success); await load(); if (refreshWorkspace) await refreshWorkspaces(); }
    catch (reason) { toast.error("Action failed", reason instanceof Error ? reason.message : "Please try again."); }
    finally { setWorking(false); }
  };
  const confirmAction = async () => {
    if (!pendingAction || !activeWorkspace) return;
    const { kind, member } = pendingAction;
    if (kind === "suspend") await perform(() => suspendMember(member.id), "Member suspended", true);
    if (kind === "remove") await perform(() => removeMember(member.id), "Member removed", true);
    if (kind === "transfer") await perform(() => transferOwnership({ workspaceId: activeWorkspace.id, newOwnerMemberId: member.id }), "Ownership transferred", true);
    setPendingAction(null);
  };
  const canManageMember = (member: WorkspaceMember) => canManage && member.userId !== user?.id
    && (activeMembership?.role === "owner" || !["owner", "administrator"].includes(member.role));

  const memberColumns: Column<WorkspaceMember>[] = [
    { key: "member", header: "Member", cell: (member) => <div className="flex items-center gap-3"><Avatar name={member.fullName} color="#2563EB" size="md" /><div className="min-w-0"><p className="truncate font-medium text-ink">{member.fullName}</p>{member.email && <p className="truncate text-xs text-ink-subtle">{member.email}</p>}</div></div> },
    { key: "role", header: "Role", cell: (member) => <Badge tone={ROLE_META[member.role].tone}>{ROLE_META[member.role].label}</Badge> },
    { key: "status", header: "Status", cell: (member) => <Badge tone={member.status === "active" ? "success" : "danger"} dot>{member.status === "active" ? "Active" : "Suspended"}</Badge> },
    { key: "joined", header: "Joined", cell: (member) => <span className="text-ink-muted">{member.joinedAt ? formatRelative(member.joinedAt) : "Unavailable"}</span> },
    { key: "active", header: "Last active", cell: () => <span className="text-ink-subtle">Unavailable</span> },
    { key: "actions", header: "", headerClassName: "w-10", cell: (member) => canManageMember(member) ? <MemberMenu member={member} owner={activeMembership?.role === "owner"} onRole={() => setRoleMember(member)} onSuspend={() => setPendingAction({ kind: "suspend", member })} onReactivate={() => void perform(() => reactivateMember(member.id), "Member reactivated", true)} onRemove={() => setPendingAction({ kind: "remove", member })} onTransfer={() => setPendingAction({ kind: "transfer", member })} /> : null },
  ];
  const invitationColumns: Column<WorkspaceInvitation>[] = [
    { key: "email", header: "Invitation", cell: (invite) => <div><p className="font-medium text-ink">{invite.email}</p><p className="text-xs text-ink-subtle">Invited by {invite.inviterName || "Workspace manager"}</p></div> },
    { key: "role", header: "Role", cell: (invite) => <Badge tone={ROLE_META[invite.role].tone}>{ROLE_META[invite.role].label}</Badge> },
    { key: "status", header: "Status", cell: (invite) => <Badge tone={invite.status === "pending" ? "warning" : invite.status === "accepted" ? "success" : "neutral"}>{invite.status}</Badge> },
    { key: "expiry", header: "Expires", cell: (invite) => <span className="text-ink-muted">{new Date(invite.expiresAt).toLocaleDateString()}</span> },
    { key: "resends", header: "Resends", cell: (invite) => invite.resendCount },
    { key: "actions", header: "", headerClassName: "w-10", cell: (invite) => canManage && ["pending", "expired"].includes(invite.status) ? <Dropdown trigger={<span className="inline-flex rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"><MoreVertical className="h-4 w-4" /></span>} items={[
      { label: "Resend invitation", icon: <RefreshCw />, onClick: () => void perform(() => resendInvitation(invite.id), "Invitation resent") },
      ...(invite.status === "pending" ? [{ label: "Revoke invitation", icon: <Ban />, destructive: true, separated: true, onClick: () => void perform(() => revokeInvitation(invite.id), "Invitation revoked") }] : []),
    ]} /> : null },
  ];

  if (!activeWorkspace && !loading) return <EmptyState icon={Users} title="No active workspace" description="Join or create a workspace to manage a team." />;
  return <div className="space-y-6">
    <PageHeader title="Team" description="Manage workspace access, invitations and membership history."
      actions={<div className="flex gap-2">{activeMembership && <Button variant="outline" onClick={() => void perform(() => leaveWorkspace(activeWorkspace!.id), "You left the workspace", true)}><UserMinus className="h-4 w-4" /> Leave</Button>}{canManage && <Button onClick={() => setInviteOpen(true)}><UserPlus className="h-4 w-4" /> Invite Member</Button>}</div>} />
    <Tabs active={tab} onChange={(id) => { setTab(id as Tab); setPage(1); }} tabs={[
      { id: "active", label: "Active", count: members.filter((m) => m.status === "active").length },
      { id: "suspended", label: "Suspended", count: members.filter((m) => m.status === "suspended").length },
      { id: "invitations", label: "Invitations", count: invitations.filter((i) => i.status === "pending").length },
      { id: "history", label: "History", count: eventTotal },
    ]} />
    {tab !== "history" && <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><SearchInput value={query} onChange={(value) => { setQuery(value); setPage(1); }} placeholder="Search members or invitations…" className="sm:max-w-xs" /><FilterSelect label="Role" value={roleFilter} onChange={(value) => { setRoleFilter(value); setPage(1); }} options={[{ value: "all", label: "All roles" }, ...Object.entries(ROLE_META).map(([value, meta]) => ({ value, label: meta.label }))]} />{tab === "invitations" && <FilterSelect label="Status" value={statusFilter} onChange={(value) => { setStatusFilter(value); setPage(1); }} options={["all", "pending", "accepted", "declined", "revoked", "expired"].map((value) => ({ value, label: value === "all" ? "All statuses" : value[0].toUpperCase() + value.slice(1) }))} />}<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="h-4 w-4" /> Refresh</Button></div>}
    {loading ? <div className="space-y-3">{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      : error ? <EmptyState icon={Users} title="Team unavailable" description={error} action={<Button onClick={() => void load()}>Retry</Button>} />
      : tab === "history" ? <HistoryList events={events} />
      : tab === "invitations" ? <DataTable columns={invitationColumns} rows={pagedInvitations} rowKey={(invite) => invite.id} empty={<EmptyState icon={Mail} title="No invitations found" description="Invite a teammate or change the filters." />} />
      : <DataTable columns={memberColumns} rows={pagedMembers} rowKey={(member) => member.id} empty={<EmptyState icon={Users} title={`No ${tab} members`} description="No workspace members match these filters." />} />}
    <Pagination page={page} pageCount={Math.max(1, Math.ceil((tab === "history" ? eventTotal : rows.length) / PAGE_SIZE))} onPageChange={setPage} totalItems={tab === "history" ? eventTotal : rows.length} pageSize={PAGE_SIZE} />
    <InviteModal open={inviteOpen} roles={roles} workspaceId={activeWorkspace?.id ?? ""} onClose={() => setInviteOpen(false)} onInvited={async (delivery) => { setInviteOpen(false); toast.success("Invitation created", delivery === "email" ? "Supabase Auth was asked to send the invitation email." : "The existing Towkn user received an in-app invitation."); await load(); }} />
    <RoleModal member={roleMember} roles={roles} open={Boolean(roleMember)} onClose={() => setRoleMember(null)} onSave={async (role) => { if (!roleMember) return; await perform(() => updateMemberRole({ memberId: roleMember.id, newRole: role }), "Role updated"); setRoleMember(null); }} working={working} />
    <ConfirmModal open={Boolean(pendingAction)} onClose={() => setPendingAction(null)} onConfirm={() => void confirmAction()} destructive={pendingAction?.kind === "remove"} confirmLabel={pendingAction?.kind === "transfer" ? "Transfer ownership" : pendingAction?.kind === "remove" ? "Remove member" : "Suspend access"}
      title={pendingAction?.kind === "transfer" ? "Transfer workspace ownership?" : pendingAction?.kind === "remove" ? "Remove workspace member?" : "Suspend workspace access?"}
      message={pendingAction?.kind === "transfer" ? `${pendingAction.member.fullName} becomes owner and your role becomes Administrator.` : pendingAction?.kind === "remove" ? "The membership is removed, but the Towkn account and authored content are preserved." : "Access is removed immediately. Authored content remains in the workspace."} />
  </div>;
}

function MemberMenu({ member, owner, onRole, onSuspend, onReactivate, onRemove, onTransfer }: { member: WorkspaceMember; owner: boolean; onRole: () => void; onSuspend: () => void; onReactivate: () => void; onRemove: () => void; onTransfer: () => void }) {
  return <Dropdown trigger={<span className="inline-flex rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted"><MoreVertical className="h-4 w-4" /></span>} items={[
    { label: "Change role", icon: <Shield />, onClick: onRole },
    ...(member.status === "suspended" ? [{ label: "Reactivate", icon: <UserCheck />, onClick: onReactivate }] : [{ label: "Suspend", icon: <Ban />, onClick: onSuspend }]),
    ...(owner && member.status === "active" && member.role !== "owner" ? [{ label: "Transfer ownership", icon: <Shield />, separated: true, onClick: onTransfer }] : []),
    { label: "Remove", icon: <Trash2 />, destructive: true, separated: true, onClick: onRemove },
  ]} />;
}

function InviteModal({ open, onClose, onInvited, roles, workspaceId }: { open: boolean; onClose: () => void; onInvited: (delivery?: "email" | "in_app") => Promise<void>; roles: TeamRoleOption[]; workspaceId: string }) {
  const [email, setEmail] = useState(""); const [role, setRole] = useState<TeamRole>("viewer"); const [message, setMessage] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  useEffect(() => { if (open && roles.length && !roles.some((item) => item.value === role)) setRole(roles[0].value); }, [open, role, roles]);
  const submit = async () => {
    if (!isValidEmail(email)) { setError("Enter a valid email address."); return; }
    setLoading(true); setError("");
    try { const created = await inviteMember({ workspaceId, email, role, message: message || undefined }); setEmail(""); setMessage(""); await onInvited(created.delivery); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Invitation failed."); }
    finally { setLoading(false); }
  };
  return <Modal open={open} onClose={onClose} title="Invite workspace member" description="Existing Towkn users receive an in-app invitation; new users receive a Supabase Auth email." footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void submit()} loading={loading}><Mail className="h-4 w-4" /> Send invitation</Button></>}>
    <div className="space-y-4"><FormField label="Email address" htmlFor="invite-email" error={error} required><Input id="invite-email" type="email" value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} /></FormField>
      <FormField label="Role" htmlFor="invite-role" hint={roles.find((item) => item.value === role)?.description}><Select id="invite-role" value={role} onChange={(event) => setRole(event.target.value as TeamRole)}>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></FormField>
      <FormField label="Message (optional)" htmlFor="invite-message"><Textarea id="invite-message" maxLength={1000} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} /></FormField>
    </div></Modal>;
}

function RoleModal({ member, roles, open, onClose, onSave, working }: { member: WorkspaceMember | null; roles: TeamRoleOption[]; open: boolean; onClose: () => void; onSave: (role: TeamRole) => Promise<void>; working: boolean }) {
  const [role, setRole] = useState<TeamRole>("viewer"); useEffect(() => { if (member) setRole(member.role); }, [member]);
  return <Modal open={open} onClose={onClose} title="Change member role" description={`Current role: ${member ? ROLE_META[member.role].label : ""}`} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => void onSave(role)} loading={working}>Update role</Button></>}>
    <FormField label="New role" htmlFor="member-role" hint={ROLE_META[role].description}><Select id="member-role" value={role} onChange={(event) => setRole(event.target.value as TeamRole)}>{roles.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</Select></FormField>
    {role === "owner" && <p className="mt-3 text-sm text-warning">Owner access includes full workspace and team control.</p>}
  </Modal>;
}

function HistoryList({ events }: { events: MembershipEvent[] }) {
  if (!events.length) return <EmptyState icon={History} title="No membership history" description="Team activity will appear here." />;
  return <div className="divide-y divide-border border-y border-border bg-surface">{events.map((event) => <div key={event.id} className="flex items-start justify-between gap-4 px-4 py-3"><div><p className="text-sm font-medium text-ink">{event.eventType.replaceAll("_", " ")}</p><p className="mt-0.5 text-xs text-ink-muted">{event.actorName || "System"}{event.affectedUserName ? ` · ${event.affectedUserName}` : ""}{event.previousRole && event.newRole ? ` · ${ROLE_META[event.previousRole].label} to ${ROLE_META[event.newRole].label}` : ""}</p>{event.message && <p className="mt-1 text-xs text-ink-subtle">{event.message}</p>}</div><time className="shrink-0 text-xs text-ink-subtle">{formatRelative(event.createdAt)}</time></div>)}</div>;
}
