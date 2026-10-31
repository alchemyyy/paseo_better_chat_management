// Mirrors the app's workspace layout shapes (packages/app/src/stores/workspace-layout-actions.ts)
// and tab identities (packages/app/src/workspace-tabs/identity.ts). App-internal; may drift.

export interface TabTarget {
  kind: string;
  agentId?: string;
  draftId?: string;
  parentAgentId?: string;
  subagentId?: string;
  terminalId?: string;
  browserId?: string;
  workspaceId?: string;
  sha?: string;
  pluginId?: string;
  panelId?: string;
  context?: string;
  path?: string;
  /** Draft composer seed: provider, cwd, model, mode, thinking, feature values */
  setup?: Record<string, unknown>;
}

export interface LayoutTab {
  tabId: string;
  target: TabTarget;
}

export interface LayoutPane {
  id: string;
  focusedTabId: string | null;
  /** Present on the store's internal layout nodes */
  tabs?: LayoutTab[];
}

export type LayoutNode =
  | { kind: "pane"; pane: LayoutPane }
  | { kind: "group"; group: { children: LayoutNode[] } };

export interface WorkspaceLayout {
  root: LayoutNode;
  focusedPaneId: string | null;
  /** Tabs opened from another tab, such as a file opened from a chat */
  parentTabIdByTabId?: Record<string, string>;
}

export function collectPanes(root: LayoutNode): LayoutPane[] {
  const panes: LayoutPane[] = [];
  const pending: LayoutNode[] = [root];
  while (pending.length > 0) {
    const node = pending.pop()!;
    if (node.kind === "pane") panes.push(node.pane);
    else for (const child of node.group.children) pending.push(child);
  }
  return panes;
}

/** Chats own the tabs opened while they are current; drafts are chats that have not started */
export function isChatTarget(target: TabTarget): boolean {
  return target.kind === "agent" || target.kind === "provider_subagent" || target.kind === "draft";
}

/** Chats that have started live in the sidebar, so their tab chips are always hidden */
export function isSidebarChatTarget(target: TabTarget): boolean {
  return target.kind === "agent" || target.kind === "provider_subagent";
}

/** The suffix of the tab chip's `workspace-tab-<identity>` test id */
export function tabIdentity(tab: LayoutTab): string {
  const { target } = tab;
  switch (target.kind) {
    case "new_tab":
      return tab.tabId;
    case "draft":
      return target.draftId ?? tab.tabId;
    case "agent":
      return `agent_${target.agentId}`;
    case "provider_subagent": {
      const parent = target.parentAgentId ?? "";
      const subagent = target.subagentId ?? "";
      return `provider_subagent_${parent.length}_${parent}_${subagent.length}_${subagent}`;
    }
    case "terminal":
      return `terminal_${target.terminalId}`;
    case "browser":
      return `browser_${target.browserId}`;
    case "setup":
      return `setup_${target.workspaceId}`;
    case "commit_diff":
      return `commit_diff_${target.sha}`;
    case "working_diff":
      return "working_diff";
    case "changes_tree":
    case "files":
    case "pull_request":
      return target.kind;
    case "plugin": {
      const pluginId = target.pluginId ?? "";
      const panelId = target.panelId ?? "";
      const identity = `${pluginId.length}_${pluginId}_${panelId.length}_${panelId}`;
      if (target.context === "workspace") return `plugin_workspace_${identity}`;
      const agentId = target.agentId ?? "";
      return `plugin_agent_${identity}_${agentId.length}_${agentId}`;
    }
    default:
      return `file_${target.path}`;
  }
}

export interface TabScopeMemory {
  /** `<workspaceKey>\n<tabId>` -> owning chat tab id, "" when the tab belongs to every chat */
  owners: Record<string, string>;
  /** workspaceKey -> the chat tab focused last */
  currentChat: Record<string, string>;
}

export interface WorkspaceScope {
  /** Tab identities whose chips the strip hides */
  hidden: Set<string>;
  /** The focused tab of the focused pane when it is a chat, else null */
  focusedChatTabId: string | null;
  /** Tab id of the current chat: the chat focused last, kept while its files are read */
  currentChatTabId: string | null;
  /** Agent behind the current chat tab; tab ids are not always `agent_<id>` */
  currentChatAgentId: string | null;
  /** Chip identity of the current chat, which stays visible and pinned left-most */
  currentChatIdentity: string | null;
  /** Chip identities of every chat tab, which the strip widens */
  chats: Set<string>;
}

const OWNER_KEY_SEPARATOR = "\n";

function ownerKey(workspaceKey: string, tabId: string): string {
  return `${workspaceKey}${OWNER_KEY_SEPARATOR}${tabId}`;
}

/**
 * Updates ownership for one workspace and returns which chips to hide. A new non-chat tab
 * belongs to the chat it was opened from (the layout's parent map) or else the current chat.
 * Tabs already open on first sight belong to every chat. A tab shows when it belongs to every
 * chat, to the current chat, to a chat no longer open, or is focused in some pane. Chat chips
 * hide except the current chat.
 */
export function scopeWorkspace(
  memory: TabScopeMemory,
  workspaceKey: string,
  layout: WorkspaceLayout,
  options: { explorerPaneId: string | null; firstSight: boolean },
): WorkspaceScope {
  const panes = collectPanes(layout.root).filter((pane) => pane.id !== options.explorerPaneId);
  const tabs: LayoutTab[] = [];
  for (const pane of panes) for (const tab of pane.tabs ?? []) tabs.push(tab);
  const chatTabIds = new Set<string>();
  const chats = new Set<string>();
  for (const tab of tabs) {
    if (!isChatTarget(tab.target)) continue;
    chatTabIds.add(tab.tabId);
    chats.add(tabIdentity(tab));
  }

  const focusedPane = panes.find((pane) => pane.id === layout.focusedPaneId);
  const focusedTabId = focusedPane?.focusedTabId ?? null;
  const focusedChatTabId = focusedTabId && chatTabIds.has(focusedTabId) ? focusedTabId : null;
  if (focusedChatTabId) memory.currentChat[workspaceKey] = focusedChatTabId;
  let current: string | null = memory.currentChat[workspaceKey] ?? null;
  if (current && !chatTabIds.has(current)) current = null;

  const openTabIds = new Set<string>();
  for (const tab of tabs) {
    openTabIds.add(tab.tabId);
    if (isChatTarget(tab.target)) continue;
    const key = ownerKey(workspaceKey, tab.tabId);
    if (key in memory.owners) continue;
    const nativeParent = layout.parentTabIdByTabId?.[tab.tabId];
    if (nativeParent && chatTabIds.has(nativeParent)) memory.owners[key] = nativeParent;
    else memory.owners[key] = options.firstSight ? "" : (current ?? "");
  }
  const prefix = `${workspaceKey}${OWNER_KEY_SEPARATOR}`;
  for (const key of Object.keys(memory.owners)) {
    if (key.startsWith(prefix) && !openTabIds.has(key.slice(prefix.length))) delete memory.owners[key];
  }

  const paneFocusedTabIds = new Set<string>();
  for (const pane of panes) if (pane.focusedTabId) paneFocusedTabIds.add(pane.focusedTabId);
  const hidden = new Set<string>();
  let currentChatIdentity: string | null = null;
  let currentChatAgentId: string | null = null;
  for (const tab of tabs) {
    if (tab.tabId === current) {
      currentChatIdentity = tabIdentity(tab);
      currentChatAgentId = tab.target.kind === "agent" ? (tab.target.agentId ?? null) : null;
      continue;
    }
    if (isSidebarChatTarget(tab.target)) {
      hidden.add(tabIdentity(tab));
      continue;
    }
    if (!current || isChatTarget(tab.target) || paneFocusedTabIds.has(tab.tabId)) continue;
    const owner = memory.owners[ownerKey(workspaceKey, tab.tabId)];
    if (owner && owner !== current && chatTabIds.has(owner)) hidden.add(tabIdentity(tab));
  }
  return { hidden, chats, focusedChatTabId, currentChatTabId: current, currentChatAgentId, currentChatIdentity };
}

/** Moves ownership from a draft tab to the agent tab it became */
export function renameChatTab(
  memory: TabScopeMemory,
  workspaceKey: string,
  fromTabId: string,
  toTabId: string,
): void {
  const prefix = `${workspaceKey}${OWNER_KEY_SEPARATOR}`;
  for (const [key, owner] of Object.entries(memory.owners)) {
    if (owner === fromTabId && key.startsWith(prefix)) memory.owners[key] = toTabId;
  }
  if (memory.currentChat[workspaceKey] === fromTabId) memory.currentChat[workspaceKey] = toTabId;
}
