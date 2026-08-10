import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  PenSquare,
  Calendar,
  FileText,
  Images,
  Share2,
  CheckCircle2,
  BarChart3,
  Users,
  Settings,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Optional badge count key resolved from mock data. */
  badge?: number;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Create Post", href: "/dashboard/create", icon: PenSquare },
  { label: "Calendar", href: "/dashboard/calendar", icon: Calendar },
  { label: "Posts", href: "/dashboard/posts", icon: FileText },
  { label: "Media Library", href: "/dashboard/media", icon: Images },
  { label: "Social Accounts", href: "/dashboard/accounts", icon: Share2 },
  {
    label: "Approvals",
    href: "/dashboard/approvals",
    icon: CheckCircle2,
    badge: 3,
  },
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Team", href: "/dashboard/team", icon: Users },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];
