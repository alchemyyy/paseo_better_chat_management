import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { forkLineage } from "../shared/lineage";

const lineageRpc = settingsRpc(forkLineage.id);
const MAX_WRITE_ATTEMPTS = 3;

/** Adds one fork to the host's lineage document; a concurrent save retries on the new revision */
export async function recordFork(
  rpc: PluginClientContext["rpc"],
  childAgentId: string,
  parentAgentId: string,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const current = await rpc(lineageRpc.read, {});
    const parsed = current.status === "ready" ? forkLineage.schema.safeParse(current.values) : null;
    // An unreadable document is replaced rather than blocking every later fork
    const parents = parsed?.success ? parsed.data.parents : {};
    const result = await rpc(lineageRpc.write, {
      revision: current.revision,
      values: { parents: { ...parents, [childAgentId]: parentAgentId } },
    });
    if (result.status === "saved") return;
    if (result.status === "invalid") throw new Error(result.error);
  }
  throw new Error("Fork lineage kept changing while saving");
}
