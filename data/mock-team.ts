import type { AppUser, TeamMember, Workspace } from "@/types";

export const workspaces: Workspace[] = [
  {
    id: "ws_1",
    name: "Northwind Agency",
    industry: "Marketing Agency",
    plan: "Agency",
    colorToken: "#4F46E5",
  },
  {
    id: "ws_2",
    name: "Bloom & Co.",
    industry: "E-commerce",
    plan: "Growth",
    colorToken: "#0EA5E9",
  },
  {
    id: "ws_3",
    name: "Peak Fitness",
    industry: "Health & Wellness",
    plan: "Starter",
    colorToken: "#16A34A",
  },
];

export const currentUser: AppUser = {
  id: "usr_me",
  name: "Amara Okafor",
  email: "amara@northwind.agency",
  role: "Owner",
  avatarColor: "#4F46E5",
};

export const teamMembers: TeamMember[] = [
  {
    id: "tm_1",
    name: "Amara Okafor",
    email: "amara@northwind.agency",
    avatarColor: "#4F46E5",
    role: "owner",
    status: "active",
    lastActive: "2026-08-05T08:10:00Z",
    joinedAt: "2025-01-12T09:00:00Z",
  },
  {
    id: "tm_2",
    name: "Daniel Mensah",
    email: "daniel@northwind.agency",
    avatarColor: "#0EA5E9",
    role: "administrator",
    status: "active",
    lastActive: "2026-08-04T16:45:00Z",
    joinedAt: "2025-02-03T09:00:00Z",
  },
  {
    id: "tm_3",
    name: "Sofia Ramirez",
    email: "sofia@northwind.agency",
    avatarColor: "#16A34A",
    role: "content_manager",
    status: "active",
    lastActive: "2026-08-05T07:30:00Z",
    joinedAt: "2025-03-18T09:00:00Z",
  },
  {
    id: "tm_4",
    name: "Kwame Boateng",
    email: "kwame@northwind.agency",
    avatarColor: "#EA580C",
    role: "designer",
    status: "active",
    lastActive: "2026-08-03T12:20:00Z",
    joinedAt: "2025-04-22T09:00:00Z",
  },
  {
    id: "tm_5",
    name: "Priya Nair",
    email: "priya@northwind.agency",
    avatarColor: "#DB2777",
    role: "approver",
    status: "active",
    lastActive: "2026-08-05T06:05:00Z",
    joinedAt: "2025-05-09T09:00:00Z",
  },
  {
    id: "tm_6",
    name: "Liam Walsh",
    email: "liam@northwind.agency",
    avatarColor: "#9333EA",
    role: "viewer",
    status: "invited",
    lastActive: "2026-07-28T10:00:00Z",
    joinedAt: "2026-07-28T10:00:00Z",
  },
  {
    id: "tm_7",
    name: "Yuki Tanaka",
    email: "yuki@northwind.agency",
    avatarColor: "#0D9488",
    role: "designer",
    status: "suspended",
    lastActive: "2026-06-15T14:00:00Z",
    joinedAt: "2025-06-01T09:00:00Z",
  },
];

/** Convenience lookups used across mock data. */
export const memberById = Object.fromEntries(
  teamMembers.map((m) => [m.id, m]),
) as Record<string, TeamMember>;
