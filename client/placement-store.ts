import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { chatPlacement } from "../shared/placement";
import type { Placement } from "./chat-placement";

const placementRpc = settingsRpc(chatPlacement.id);
const MAX_WRITE_ATTEMPTS = 3;

/**
 * Saves `change` applied to the host's latest placement document; a concurrent save retries on
 * the new revision, so another window's move is kept
 */
export async function updatePlacement(
  rpc: PluginClientContext["rpc"],
  change: (current: Placement) => Placement,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const current = await rpc(placementRpc.read, {});
    const parsed = current.status === "ready" ? chatPlacement.schema.safeParse(current.values) : null;
    // An unreadable document is replaced rather than blocking every later drag
    const base = parsed?.success ? parsed.data : { moves: {}, order: {} };
    const next = change(base);
    if (next === base) return;
    const values = {
      moves: { ...next.moves },
      order: Object.fromEntries(Object.entries(next.order).map(([workspaceId, ids]) => [workspaceId, [...ids]])),
    };
    const result = await rpc(placementRpc.write, { revision: current.revision, values });
    if (result.status === "saved") return;
    if (result.status === "invalid") throw new Error(result.error);
  }
  throw new Error("Chat placement kept changing while saving");
}
