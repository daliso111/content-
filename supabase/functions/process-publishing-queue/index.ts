import { createTrustedClient } from "../_shared/database.ts";
import { authorizeWorker, runWorker } from "./worker.ts";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return json({ error: { code: "METHOD_NOT_ALLOWED" } }, 405);
  }
  try {
    authorizeWorker(request, Deno.env.get("PUBLISHING_WORKER_SECRET")?.trim());
    const configured = Number(Deno.env.get("PUBLISHING_BATCH_SIZE") ?? "5");
    const batchSize = Number.isInteger(configured)
      ? Math.min(5, Math.max(1, configured))
      : 5;
    return json(await runWorker(createTrustedClient(), batchSize));
  } catch (error) {
    const unauthorized = error instanceof Error &&
      error.message === "Worker authorization failed.";
    return json({
      error: { code: unauthorized ? "WORKER_UNAUTHORIZED" : "WORKER_FAILED" },
    }, unauthorized ? 401 : 500);
  }
});
