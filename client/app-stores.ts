// NOTE: App-internal store shapes, found through fiber.ts. Each one names the app file it mirrors.
import { scanStores, type StoreApi } from "./fiber";
import type { TabTarget, WorkspaceLayout } from "./tab-scope";
import { findReactRootContainer } from "./web";

/** packages/app/src/stores/workspace-layout-actions.ts WorkspaceTabPlacement */
export type TabPlacement =
  | { mode: "pane"; paneId: string }
  | { mode: "prefer"; paneId: string }
  | { mode: "focused" }
  | { mode: "ambient" };

export interface OpenTabInput {
  workspaceKey: string;
  target: TabTarget;
  intent: string;
  pin?: boolean;
  placement?: TabPlacement;
  parentTabId?: string;
}

/** packages/app/src/stores/workspace-layout-store.ts */
export interface LayoutState {
  layoutByWorkspace: Record<string, WorkspaceLayout | undefined>;
  explorerSidebarPaneIdByWorkspace: Record<string, string | null | undefined>;
  /** "split-panes" is the only layout with a side pane */
  layoutMode: string;
  /** `pin` keeps an agent tab open while the agent is not active, such as archived */
  openTab(input: OpenTabInput): string | null;
  closeTab(workspaceKey: string, tabId: string): void;
  /** Swaps a tab's target in place; Paseo's file preview uses it to reuse an unmodified file tab */
  replaceTab(workspaceKey: string, tabId: string, target: TabTarget, state?: unknown): string | null;
  /** The ordinary right-side pane, created when absent */
  ensureSidePane(workspaceKey: string, options?: { focus: boolean }): string | null;
  focusTab(workspaceKey: string, tabId: string): void;
  convertDraftToAgent(workspaceKey: string, tabId: string, agentId: string): string | null;
  /** Moves a tab into a new pane on one side of `targetPaneId`; returns the new pane id */
  splitPane(
    workspaceKey: string,
    input: { tabId: string; targetPaneId: string; position: "left" | "right" | "top" | "bottom" },
  ): string | null;
}

/** packages/app/src/attachments/workspace-attachments-store.ts */
export interface AttachmentsState {
  attachmentsByScope: Record<string, readonly unknown[] | undefined>;
  setWorkspaceAttachments(input: { scopeKey: string; attachments: readonly unknown[] }): void;
}

/** packages/client/src/daemon-client.ts `buildAgentForkContext` */
export interface ForkContextPayload {
  attachment: unknown | null;
  itemCount: number;
  boundaryCursor: unknown;
  boundaryMessageId: string | null;
}

/** packages/app/src/stores/session-store.ts */
export interface SessionState {
  sessions: Record<
    string,
    | {
        client?: {
          buildAgentForkContext(agentId: string, options?: object): Promise<ForkContextPayload>;
          updateAgent?(agentId: string, updates: { name?: string }): Promise<void>;
        } | null;
      }
    | undefined
  >;
}

type StoreName = "layout" | "attachments" | "session";

const MIN_SCAN_INTERVAL_MS = 1500;
const found: { layout?: StoreApi<LayoutState>; attachments?: StoreApi<AttachmentsState>; session?: StoreApi<SessionState> } = {};
let lastScanAt = 0;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function classify(state: unknown): StoreName | null {
  const fields = record(state);
  if (!fields) return null;
  if (
    record(fields.layoutByWorkspace) &&
    typeof fields.openTab === "function" &&
    typeof fields.focusTab === "function" &&
    typeof fields.convertDraftToAgent === "function"
  ) {
    return "layout";
  }
  if (record(fields.attachmentsByScope) && typeof fields.setWorkspaceAttachments === "function") {
    return "attachments";
  }
  const sessions = record(fields.sessions);
  if (sessions) {
    for (const session of Object.values(sessions)) {
      const client = record(record(session)?.client);
      if (client && typeof client.buildAgentForkContext === "function") return "session";
    }
  }
  return null;
}

/** Scans the fiber tree for every store not found yet; throttled because a scan walks all fibers */
function scan(force: boolean): void {
  if (found.layout && found.attachments && found.session) return;
  const now = Date.now();
  if (!force && now - lastScanAt < MIN_SCAN_INTERVAL_MS) return;
  lastScanAt = now;
  const container = findReactRootContainer();
  if (!container) return;
  scanStores(container, (store) => {
    const name = classify(store.getState());
    if (name && !found[name]) (found as Record<StoreName, unknown>)[name] = store;
    return Boolean(found.layout && found.attachments && found.session);
  });
}

export function layoutStore(): StoreApi<LayoutState> | null {
  if (!found.layout) scan(false);
  return found.layout ?? null;
}

/** Only mounted composers subscribe to this store; `force` rescans right after one mounts */
export function attachmentsStore(force = false): StoreApi<AttachmentsState> | null {
  if (!found.attachments) scan(force);
  return found.attachments ?? null;
}

export function sessionStore(force = false): StoreApi<SessionState> | null {
  if (!found.session) scan(force);
  return found.session ?? null;
}
