// Mirrors the app's fork draft seeding (packages/app/src/hooks/use-fork-agent.ts) and the draft
// attachment scope key (packages/app/src/attachments/workspace-attachments-store.ts).
import type { ForkContextPayload } from "./app-stores";

const CHAT_HISTORY_KIND = "chat_history";

export function draftAttachmentScopeKey(draftId: string): string {
  return ["workspace-attachments", `draft=${encodeURIComponent(draftId.trim())}`].join(":");
}

export function chatHistoryAttachment(input: {
  draftId: string;
  serverId: string;
  agentId: string;
  payload: ForkContextPayload;
}): unknown {
  return {
    kind: CHAT_HISTORY_KIND,
    id: `chat_history:${input.draftId}`,
    attachment: input.payload.attachment,
    source: {
      serverId: input.serverId,
      agentId: input.agentId,
      boundaryMessageId: input.payload.boundaryMessageId,
      boundaryCursor: input.payload.boundaryCursor,
      itemCount: input.payload.itemCount,
    },
  };
}

/** The source agent of a draft seeded by any fork affordance, or null */
export function readForkSource(attachments: readonly unknown[] | undefined): string | null {
  for (const attachment of attachments ?? []) {
    if (!attachment || typeof attachment !== "object") continue;
    const candidate = attachment as { kind?: unknown; source?: { agentId?: unknown } };
    if (candidate.kind === CHAT_HISTORY_KIND && typeof candidate.source?.agentId === "string") {
      return candidate.source.agentId;
    }
  }
  return null;
}
