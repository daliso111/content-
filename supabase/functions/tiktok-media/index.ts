import { handleTikTokMediaRequest } from "./handler.ts";

Deno.serve((request) => handleTikTokMediaRequest(request));
