import { Badge } from "./Badge";
import {
  APPROVAL_STATE_META,
  CONNECTION_STATUS_META,
  POST_STATUS_META,
} from "@/lib/constants";
import type { ApprovalState, ConnectionStatus, PostStatus } from "@/types";

export function PostStatusBadge({ status }: { status: PostStatus }) {
  const meta = POST_STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

export function ApprovalStateBadge({ state }: { state: ApprovalState }) {
  const meta = APPROVAL_STATE_META[state];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}

export function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  const meta = CONNECTION_STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot>
      {meta.label}
    </Badge>
  );
}
