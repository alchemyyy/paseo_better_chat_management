import { sessionStore } from "./app-stores";

/**
 * Renames a chat through the app's own daemon connection; the plugin SDK has no agent rename.
 * The new title reaches the sidebar through the normal agent updates.
 */
export async function renameChat(serverId: string, agentId: string, name: string): Promise<void> {
  const client = sessionStore(true)?.getState().sessions[serverId]?.client;
  if (!client?.updateAgent) throw new Error("Renaming is unavailable: the host connection was not found");
  await client.updateAgent(agentId, { name });
}
