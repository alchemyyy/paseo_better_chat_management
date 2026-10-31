import type { usePaseo } from "@getpaseo/plugin/client";
import { attachmentsStore, type AttachmentsState, sessionStore, type SessionState } from "./app-stores";
import type { Controller } from "./controller";
import type { StoreApi } from "./fiber";
import { chatHistoryAttachment, draftAttachmentScopeKey } from "./fork-attachment";

type PaseoApi = ReturnType<typeof usePaseo>;
export type PaseoAgent = Awaited<ReturnType<PaseoApi["agents"]["list"]>>["entries"][number]["agent"];

const STORE_WAIT_MS = 3000;
const STORE_POLL_MS = 300;

export function generateDraftId(): string {
  return `draft_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/** Same seed as the app's fork: the source chat's provider, model, mode, and features */
function draftSetup(agent: PaseoAgent): Record<string, unknown> {
  const featureValues: Record<string, unknown> = {};
  for (const feature of agent.features ?? []) featureValues[feature.id] = feature.value;
  return {
    provider: agent.provider,
    cwd: agent.cwd,
    modeId: agent.currentModeId ?? agent.runtimeInfo?.modeId ?? null,
    model: agent.model ?? agent.runtimeInfo?.model ?? null,
    thinkingOptionId: agent.thinkingOptionId ?? agent.runtimeInfo?.thinkingOptionId ?? null,
    featureValues,
  };
}

async function waitForStores(): Promise<{
  attachments: StoreApi<AttachmentsState>;
  session: StoreApi<SessionState>;
} | null> {
  const deadline = Date.now() + STORE_WAIT_MS;
  for (;;) {
    const attachments = attachmentsStore(true);
    const session = sessionStore(true);
    if (attachments && session) return { attachments, session };
    if (Date.now() >= deadline) return null;
    await new Promise((resolve) => setTimeout(resolve, STORE_POLL_MS));
  }
}

/**
 * Forks a whole chat into a new draft in its workspace, like the turn footer's "Fork in new
 * tab" while a turn is running: the draft carries the chat history and the source's settings.
 */
export async function forkChat(
  controller: Controller,
  input: { serverId: string; workspaceId: string; agent: PaseoAgent },
): Promise<void> {
  const { serverId, workspaceId, agent } = input;
  let attachments = attachmentsStore();
  let session = sessionStore();
  if (!attachments || !session) {
    // Only mounted composers subscribe to the attachments store; opening the chat mounts one
    controller.openTarget(serverId, workspaceId, { kind: "agent", agentId: agent.id });
    const stores = await waitForStores();
    if (!stores) throw new Error("Forking is unavailable: Paseo's draft store was not found");
    attachments = stores.attachments;
    session = stores.session;
  }
  const client = session.getState().sessions[serverId]?.client;
  if (!client) throw new Error("The host is disconnected");

  const draftId = generateDraftId();
  const payload = await client.buildAgentForkContext(agent.id, {});
  if (!payload.attachment) throw new Error("Could not fork this chat");
  attachments.getState().setWorkspaceAttachments({
    scopeKey: draftAttachmentScopeKey(draftId),
    attachments: [chatHistoryAttachment({ draftId, serverId, agentId: agent.id, payload })],
  });
  controller.expectFork(draftId, agent.id);
  const opened = controller.openTarget(serverId, workspaceId, {
    kind: "draft",
    draftId,
    setup: draftSetup(agent),
  });
  if (!opened) throw new Error("Could not open the fork draft");
}
