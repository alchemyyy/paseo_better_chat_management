import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Where chats show in the sidebar, per host. Paseo cannot move a chat to another workspace (its
 * workspace and folder are fixed when it starts), so a move only changes where the plugin lists
 * it: `moves` is chat id -> the workspace it shows under. `order` is workspace id -> chat ids in
 * the order dragged there; chats missing from it follow, oldest first.
 */
export const chatPlacement = defineSettings({
  id: "chat-placement",
  scope: "host",
  version: 1,
  schema: z.object({
    moves: z.record(z.string(), z.string()).default({}),
    order: z.record(z.string(), z.array(z.string())).default({}),
  }),
});
