import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ACTIVE_PUBLISHING_JOB_STATUSES,
  isActivePublishingJobStatus,
  isCurrentRevisionPublishingJob,
} from "../../../types/publishing.ts";

Deno.test("only unfinished queue states represent active publishing", () => {
  assertEquals(ACTIVE_PUBLISHING_JOB_STATUSES, [
    "queued",
    "processing",
    "waiting_provider",
    "retry_wait",
  ]);
  assertEquals(isActivePublishingJobStatus("succeeded"), false);
  assertEquals(isActivePublishingJobStatus("failed"), false);
  assertEquals(isActivePublishingJobStatus("cancelled"), false);
  assertEquals(isActivePublishingJobStatus("reconciliation_required"), false);
});

Deno.test("historical jobs never represent the current publishing operation", () => {
  assertEquals(isCurrentRevisionPublishingJob({ post_revision: 3 }, 3), true);
  assertEquals(isCurrentRevisionPublishingJob({ post_revision: 2 }, 3), false);
  assertEquals(isCurrentRevisionPublishingJob({ post_revision: 3 }, null), false);
});
