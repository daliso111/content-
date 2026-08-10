import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type NoticeTone = "error" | "success" | "info";

const META = {
  error: {
    icon: AlertCircle,
    className: "border-danger/30 bg-danger-soft text-danger",
  },
  success: {
    icon: CheckCircle2,
    className: "border-success/30 bg-success-soft text-success",
  },
  info: {
    icon: Info,
    className: "border-info/30 bg-info-soft text-info",
  },
} satisfies Record<NoticeTone, { icon: typeof Info; className: string }>;

export function AuthNotice({
  tone,
  children,
}: {
  tone: NoticeTone;
  children: React.ReactNode;
}) {
  const meta = META[tone];
  const Icon = meta.icon;

  return (
    <div
      className={cn("flex items-start gap-2.5 rounded-lg border p-3 text-sm", meta.className)}
      role={tone === "error" ? "alert" : "status"}
      aria-live="polite"
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  );
}
