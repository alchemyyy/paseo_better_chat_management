import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * Fork lineage per host: forked chat id -> source chat id. Paseo does not record which chat a
 * fork came from (the chat history attachment carries no agent id on the wire), so the plugin
 * stores it in its host-scoped settings document.
 */
export const forkLineage = defineSettings({
  id: "fork-lineage",
  scope: "host",
  version: 1,
  schema: z.object({
    parents: z.record(z.string(), z.string()).default({}),
  }),
});
