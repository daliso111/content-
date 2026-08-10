import type { MockApprovalRequest } from "@/types";
import { memberById } from "./mock-team";
import { postById } from "./mock-posts";

export const approvalRequests: MockApprovalRequest[] = [
  {
    id: "apr_1",
    post: postById.post_2,
    submittedBy: memberById.tm_4,
    submittedAt: "2026-08-04T08:15:00Z",
    assignedTo: memberById.tm_5,
    state: "awaiting",
    comments: [
      {
        id: "cmt_1",
        author: memberById.tm_4,
        message:
          "Ready for review — LinkedIn caption is a bit longer per your note.",
        createdAt: "2026-08-04T08:16:00Z",
      },
    ],
  },
  {
    id: "apr_2",
    post: postById.post_10,
    submittedBy: memberById.tm_4,
    submittedAt: "2026-08-04T11:05:00Z",
    assignedTo: memberById.tm_5,
    state: "awaiting",
    comments: [],
  },
  {
    id: "apr_3",
    post: postById.post_1,
    submittedBy: memberById.tm_1,
    submittedAt: "2026-08-02T09:10:00Z",
    assignedTo: memberById.tm_5,
    state: "changes_requested",
    comments: [
      {
        id: "cmt_2",
        author: memberById.tm_5,
        message:
          "Love it — can we tighten the hook and add the discount detail?",
        createdAt: "2026-08-02T10:00:00Z",
        decision: "changes_requested",
      },
    ],
  },
  {
    id: "apr_4",
    post: postById.post_4,
    submittedBy: memberById.tm_3,
    submittedAt: "2026-08-03T12:00:00Z",
    assignedTo: memberById.tm_1,
    state: "approved",
    comments: [
      {
        id: "cmt_3",
        author: memberById.tm_1,
        message: "Approved — great work, ship it. 🚀",
        createdAt: "2026-08-05T07:45:00Z",
        decision: "approved",
      },
    ],
  },
  {
    id: "apr_5",
    post: postById.post_13,
    submittedBy: memberById.tm_3,
    submittedAt: "2026-08-03T13:30:00Z",
    assignedTo: memberById.tm_5,
    state: "approved",
    comments: [
      {
        id: "cmt_4",
        author: memberById.tm_5,
        message: "Creative direction looks strong. Approved.",
        createdAt: "2026-08-05T06:30:00Z",
        decision: "approved",
      },
    ],
  },
  {
    id: "apr_6",
    post: postById.post_8,
    submittedBy: memberById.tm_3,
    submittedAt: "2026-07-31T09:00:00Z",
    assignedTo: memberById.tm_1,
    state: "rejected",
    comments: [
      {
        id: "cmt_5",
        author: memberById.tm_1,
        message:
          "Let's hold this one — the tips overlap with last week's post.",
        createdAt: "2026-07-31T10:00:00Z",
        decision: "rejected",
      },
    ],
  },
];
