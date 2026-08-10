"use client";

import { useState } from "react";
import {
  User2,
  Building2,
  Palette,
  Bell,
  Send,
  ShieldCheck,
  CreditCard,
  Check,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormField, Input, Select, Textarea, Toggle } from "@/components/ui/Field";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Toast";
import { currentUser, workspaces } from "@/data/mock-team";
import {
  COUNTRIES,
  INDUSTRIES,
  LANGUAGES,
  TIMEZONES,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

type SectionId =
  | "profile"
  | "workspace"
  | "brand"
  | "notifications"
  | "publishing"
  | "security"
  | "billing";

const SECTIONS: { id: SectionId; label: string; icon: typeof User2 }[] = [
  { id: "profile", label: "Profile", icon: User2 },
  { id: "workspace", label: "Workspace", icon: Building2 },
  { id: "brand", label: "Brand", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "publishing", label: "Publishing", icon: Send },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "billing", label: "Billing", icon: CreditCard },
];

export default function SettingsPage() {
  const [section, setSection] = useState<SectionId>("profile");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your profile, workspace, brand and publishing preferences."
      />

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Section nav */}
        <nav
          className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible"
          aria-label="Settings sections"
        >
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            const active = section === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => setSection(s.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-brand-soft text-brand-text"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
                {s.label}
              </button>
            );
          })}
        </nav>

        {/* Section content */}
        <div>
          {section === "profile" && <ProfileSection />}
          {section === "workspace" && <WorkspaceSection />}
          {section === "brand" && <BrandSection />}
          {section === "notifications" && <NotificationsSection />}
          {section === "publishing" && <PublishingSection />}
          {section === "security" && <SecuritySection />}
          {section === "billing" && <BillingSection />}
        </div>
      </div>
    </div>
  );
}

/** Shared save handler that simulates a persistence round-trip. */
function useSimulatedSave() {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  return {
    saving,
    save: (message = "Your changes have been saved.") => {
      setSaving(true);
      setTimeout(() => {
        setSaving(false);
        toast.success("Settings saved", message);
      }, 600);
    },
  };
}

function SectionCard({
  title,
  description,
  children,
  onSave,
  saving,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody className="space-y-4">{children}</CardBody>
      <div className="flex justify-end border-t border-border px-5 py-4">
        <Button onClick={onSave} loading={saving}>
          <Check className="h-4 w-4" aria-hidden /> Save changes
        </Button>
      </div>
    </Card>
  );
}

/* --------------------------------------------------------------- Profile */
function ProfileSection() {
  const { save, saving } = useSimulatedSave();
  return (
    <SectionCard
      title="Profile"
      description="Update your personal details."
      onSave={save}
      saving={saving}
    >
      <div className="flex items-center gap-4">
        <Avatar name={currentUser.name} color={currentUser.avatarColor} size="lg" />
        <Button variant="outline" size="sm">
          Change photo
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Full name" htmlFor="p-name">
          <Input id="p-name" defaultValue={currentUser.name} />
        </FormField>
        <FormField label="Email" htmlFor="p-email">
          <Input id="p-email" type="email" defaultValue={currentUser.email} />
        </FormField>
        <FormField label="Phone number" htmlFor="p-phone">
          <Input id="p-phone" type="tel" placeholder="+254 700 000 000" />
        </FormField>
        <FormField label="Role" htmlFor="p-role">
          <Input id="p-role" defaultValue={currentUser.role} disabled />
        </FormField>
      </div>
    </SectionCard>
  );
}

/* ------------------------------------------------------------- Workspace */
function WorkspaceSection() {
  const { save, saving } = useSimulatedSave();
  return (
    <SectionCard
      title="Workspace"
      description="Details about your organisation."
      onSave={save}
      saving={saving}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Workspace name" htmlFor="w-name">
          <Input id="w-name" defaultValue={workspaces[0].name} />
        </FormField>
        <FormField label="Industry" htmlFor="w-industry">
          <Select id="w-industry" defaultValue={workspaces[0].industry}>
            {INDUSTRIES.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Time zone" htmlFor="w-tz">
          <Select id="w-tz" defaultValue={TIMEZONES[0]}>
            {TIMEZONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Country" htmlFor="w-country">
          <Select id="w-country" defaultValue="Kenya">
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </FormField>
        <FormField label="Default language" htmlFor="w-lang">
          <Select id="w-lang" defaultValue="English">
            {LANGUAGES.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
        </FormField>
      </div>
    </SectionCard>
  );
}

/* ----------------------------------------------------------------- Brand */
function BrandSection() {
  const { save, saving } = useSimulatedSave();
  const [colors, setColors] = useState(["#4F46E5", "#0EA5E9", "#16A34A"]);
  return (
    <SectionCard
      title="Brand"
      description="Keep your content on-brand across every platform."
      onSave={save}
      saving={saving}
    >
      <FormField label="Logo">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-brand text-white">
            <Send className="h-7 w-7 -rotate-12" aria-hidden />
          </div>
          <Button variant="outline" size="sm">
            Upload logo
          </Button>
        </div>
      </FormField>
      <FormField label="Brand colours">
        <div className="flex items-center gap-3">
          {colors.map((c, i) => (
            <label
              key={i}
              className="flex items-center gap-2 rounded-lg border border-border p-1.5"
            >
              <input
                type="color"
                value={c}
                onChange={(e) =>
                  setColors((prev) =>
                    prev.map((x, idx) => (idx === i ? e.target.value : x)),
                  )
                }
                className="h-8 w-8 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label={`Brand colour ${i + 1}`}
              />
              <span className="pr-1 text-xs font-medium text-ink-muted">{c}</span>
            </label>
          ))}
        </div>
      </FormField>
      <FormField label="Brand voice" htmlFor="b-voice" hint="How your brand sounds in captions.">
        <Textarea
          id="b-voice"
          rows={3}
          defaultValue="Friendly, confident and helpful. We keep things clear and never over-promise."
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Preferred hashtags" htmlFor="b-tags">
          <Input id="b-tags" defaultValue="#northwind #socialmadesimple" />
        </FormField>
        <FormField label="Words to avoid" htmlFor="b-avoid">
          <Input id="b-avoid" placeholder="e.g. cheap, guaranteed" />
        </FormField>
      </div>
    </SectionCard>
  );
}

/* --------------------------------------------------------- Notifications */
function NotificationsSection() {
  const { save, saving } = useSimulatedSave();
  const [prefs, setPrefs] = useState({
    approvals: true,
    published: true,
    failed: true,
    weekly: false,
    mentions: true,
  });
  const rows: { key: keyof typeof prefs; label: string; desc: string }[] = [
    { key: "approvals", label: "Approval requests", desc: "When a post needs your review." },
    { key: "published", label: "Post published", desc: "When a scheduled post goes live." },
    { key: "failed", label: "Publishing failures", desc: "When a post fails to publish." },
    { key: "weekly", label: "Weekly summary", desc: "A digest of last week's performance." },
    { key: "mentions", label: "Comments & mentions", desc: "When someone mentions you." },
  ];
  return (
    <SectionCard
      title="Notifications"
      description="Choose what you want to be notified about."
      onSave={save}
      saving={saving}
    >
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex items-center justify-between gap-4 border-b border-border pb-4 last:border-0 last:pb-0"
        >
          <div>
            <p className="text-sm font-medium text-ink">{row.label}</p>
            <p className="text-xs text-ink-subtle">{row.desc}</p>
          </div>
          <Toggle
            checked={prefs[row.key]}
            onChange={(v) => setPrefs((p) => ({ ...p, [row.key]: v }))}
            label={row.label}
          />
        </div>
      ))}
    </SectionCard>
  );
}

/* ------------------------------------------------------------ Publishing */
function PublishingSection() {
  const { save, saving } = useSimulatedSave();
  const [requireApproval, setRequireApproval] = useState(true);
  const [notify, setNotify] = useState(true);
  return (
    <SectionCard
      title="Publishing"
      description="Control how and when content is published."
      onSave={save}
      saving={saving}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Default posting time" htmlFor="pub-time">
          <Input id="pub-time" type="time" defaultValue="09:00" />
        </FormField>
        <FormField label="Default time zone" htmlFor="pub-tz">
          <Select id="pub-tz" defaultValue={TIMEZONES[0]}>
            {TIMEZONES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </FormField>
        <FormField
          label="Failed-post retries"
          htmlFor="pub-retries"
          hint="How many times to retry a failed post."
        >
          <Select id="pub-retries" defaultValue="2">
            <option value="0">No retries</option>
            <option value="1">1 retry</option>
            <option value="2">2 retries</option>
            <option value="3">3 retries</option>
          </Select>
        </FormField>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted/50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-ink">Require approval before publishing</p>
          <p className="text-xs text-ink-subtle">
            Every post must be approved before it can go live.
          </p>
        </div>
        <Toggle checked={requireApproval} onChange={setRequireApproval} label="Require approval" />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted/50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-ink">Publishing notifications</p>
          <p className="text-xs text-ink-subtle">
            Notify the team when posts publish or fail.
          </p>
        </div>
        <Toggle checked={notify} onChange={setNotify} label="Publishing notifications" />
      </div>
    </SectionCard>
  );
}

/* -------------------------------------------------------------- Security */
function SecuritySection() {
  const { save, saving } = useSimulatedSave();
  const [twoFa, setTwoFa] = useState(false);
  return (
    <SectionCard
      title="Security"
      description="Keep your account safe."
      onSave={save}
      saving={saving}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Current password" htmlFor="s-cur">
          <Input id="s-cur" type="password" placeholder="••••••••" />
        </FormField>
        <div className="hidden sm:block" />
        <FormField label="New password" htmlFor="s-new">
          <Input id="s-new" type="password" placeholder="••••••••" />
        </FormField>
        <FormField label="Confirm new password" htmlFor="s-confirm">
          <Input id="s-confirm" type="password" placeholder="••••••••" />
        </FormField>
      </div>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted/50 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-ink">Two-factor authentication</p>
          <p className="text-xs text-ink-subtle">
            Add an extra layer of security at sign-in.
          </p>
        </div>
        <Toggle checked={twoFa} onChange={setTwoFa} label="Two-factor authentication" />
      </div>
    </SectionCard>
  );
}

/* --------------------------------------------------------------- Billing */
function BillingSection() {
  return (
    <Card>
      <CardHeader title="Billing" description="Manage your plan and payment method." />
      <CardBody className="space-y-4">
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface-muted/50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-base font-semibold text-ink">Agency plan</p>
              <Badge tone="brand">Current</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-muted">
              Unlimited workspaces · 6 team members · All platforms
            </p>
          </div>
          <p className="text-2xl font-bold text-ink">
            $49
            <span className="text-sm font-normal text-ink-subtle">/mo</span>
          </p>
        </div>
        <div className="rounded-xl border border-dashed border-border bg-surface p-5 text-center">
          <CreditCard className="mx-auto mb-2 h-8 w-8 text-ink-subtle" aria-hidden />
          <p className="text-sm font-medium text-ink">
            Billing is a placeholder in this demo
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            Payment integration will be added in a later phase. No card is required.
          </p>
          <Button variant="outline" className="mt-4" disabled>
            Manage payment method
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
