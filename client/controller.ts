import { attachmentsStore, layoutStore, type LayoutState, type OpenTabInput, type TabSnapshot } from "./app-stores";
import { findAncestorProps, type StoreApi } from "./fiber";
import { draftAttachmentScopeKey, readForkSource } from "./fork-attachment";
import { installTabMenuSplits } from "./tab-menu";
import { wrapStoreAction } from "./layout-wrap";
import { installWorkspaceDrag } from "./workspace-drag";
import {
  collectPanes,
  type LayoutTab,
  renameChatTab,
  scopeWorkspace,
  type TabScopeMemory,
  type TabTarget,
} from "./tab-scope";
import {
  applyTabVisibility,
  clearTabVisibility,
  type DomElement,
  findWorkspaceRow,
  installStyle,
  observeDom,
  readRowBackdrop,
  markCurrentChat,
  setSelectedBackdrop,
  setCurrentChatInset,
  measureRowGlyphCenter,
  type RowBackdrop,
  placeSlot,
  readStorage,
  readWorkspaceRows,
  removeAllSlots,
  removeStaleSlots,
  suppressRowHover,
  syncProjectRails,
  writeStorage,
} from "./web";

export interface ChatSlot {
  id: string;
  /** Chats go under the row; the new chat button sits on it */
  kind: "chats" | "info" | "new-chat";
  serverId: string;
  workspaceId: string;
  workspaceKey: string;
  element: DomElement;
}

export interface ControllerSnapshot {
  slots: readonly ChatSlot[];
  /** workspaceKey -> agent id of its current chat, which stays current while its files are read */
  currentChatAgentIdByWorkspace: Readonly<Record<string, string | null>>;
  /** A selected workspace row's background and corner radius, for chats to highlight alike */
  selectedBackdrop: RowBackdrop | null;
  /** Where a workspace row's status glyph centres, in px from the left of its chat list */
  workspaceGlyphCenter: number | null;
  selectedWorkspaceKeys: readonly string[];
  /** Forks recorded this session, shown before the lineage settings round-trip */
  localForkParents: Readonly<Record<string, string>>;
}

export type ForkRecorder = (childAgentId: string, parentAgentId: string) => Promise<void>;

/** What one host's plugin installation lends the shared engine */
export interface HostBinding {
  recordFork: ForkRecorder;
}

export interface Controller {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ControllerSnapshot;
  /** Lets forks on `serverId` persist through that host's plugin installation */
  bindHost(serverId: string, binding: HostBinding): () => void;
  /**
   * Shows a tab target in a workspace, navigating there first; false when unavailable. `pin`
   * keeps an archived chat's tab open, which Paseo otherwise closes as inactive.
   */
  openTarget(serverId: string, workspaceId: string, target: TabTarget, options?: { pin?: boolean }): boolean;
  /** The next agent created from this draft is a fork of `parentAgentId` */
  expectFork(draftId: string, parentAgentId: string): void;
  /**
   * The chats `serverId`'s sidebar lists under a workspace other than their own, by workspace
   * id. Paseo closes a tab whose chat belongs elsewhere; these keep their tabs there.
   */
  setMovedChats(serverId: string, chatsByWorkspace: ReadonlyMap<string, ReadonlySet<string>>): void;
}

// These keys and marks keep the plugin's former id ("better-chat-display"): changing them would
// lose saved tab scopes and leave a running page's controller unrecognized, so it would wrap twice
const GLOBAL_KEY = "__paseoBetterChatDisplayV2";
// COMPAT(legacyController): the first builds kept one never-replaced controller here; remove once no session predates V2
const LEGACY_GLOBAL_KEY = "__paseoBetterChatDisplay";
const STORAGE_KEY = "better-chat-display:tab-scope";
const SYNC_DELAY_MS = 60;
const ROW_TEST_ID_PREFIX = "sidebar-workspace-row-";
const WRAPPED_MARK = "__betterChatDisplayWrapped";
// COMPAT(legacyWrappers): wrappers from builds before the shared link protocol keep their
// original here; reinstalling unwraps them. Remove once no session predates the protocol
const ORIGINAL_KEY = "__betterChatDisplayOriginal";
const WRAP_OWNER = "better-chat-management";
const WRAP_OPTIONS = {
  legacyOriginal: (fn: object) => (ORIGINAL_KEY in fn ? (fn[ORIGINAL_KEY] as never) : undefined),
  props: { [WRAPPED_MARK]: true },
};

type ControllerMethods = Omit<Controller, "subscribe">;

const EMPTY_SNAPSHOT: ControllerSnapshot = {
  slots: [],
  currentChatAgentIdByWorkspace: {},
  selectedBackdrop: null,
  workspaceGlyphCenter: null,
  selectedWorkspaceKeys: [],
  localForkParents: {},
};

/**
 * Serves a controller whose engine is gone. Paseo runs a plugin's cleanup before React unmounts
 * the components it contributed, so their effect cleanups, and any render in between, still call
 * a released controller: it shows nothing and changes nothing.
 */
const STOPPED_METHODS: ControllerMethods = {
  getSnapshot: () => EMPTY_SNAPSHOT,
  bindHost: () => () => {},
  openTarget: () => false,
  expectFork: () => {},
  setMovedChats: () => {},
};

interface Engine {
  methods: ControllerMethods;
  stop(): void;
}

/**
 * Lives on the app's global object across plugin reloads. Subscribers and host bindings stay
 * here so a newer engine can take over without the sidebar resubscribing.
 */
interface SharedBox {
  engine: Engine | null;
  retainCount: number;
  listeners: Set<() => void>;
  recorders: Map<string, HostBinding>;
  /** serverId -> workspace id -> chats listed there though they belong to another workspace */
  movedChats: Map<string, ReadonlyMap<string, ReadonlySet<string>>>;
}

function splitWorkspaceKey(workspaceKey: string): { serverId: string; workspaceId: string } | null {
  const separator = workspaceKey.indexOf(":");
  if (separator <= 0) return null;
  return { serverId: workspaceKey.slice(0, separator), workspaceId: workspaceKey.slice(separator + 1) };
}

function withFilePanePlacement(state: LayoutState, input: OpenTabInput): OpenTabInput {
  if (input.target.kind !== "file" || state.layoutMode !== "split-panes") return input;
  const mode = input.placement?.mode;
  if (mode === "pane" || mode === "ambient") return input;
  const layout = state.layoutByWorkspace[input.workspaceKey];
  const path = input.target.path;
  const alreadyOpen =
    layout !== undefined &&
    collectPanes(layout.root).some((pane) =>
      (pane.tabs ?? []).some((tab) => tab.target.kind === "file" && tab.target.path === path),
    );
  if (alreadyOpen) return input;
  const paneId = state.ensureSidePane(input.workspaceKey);
  return paneId ? { ...input, placement: { mode: "prefer", paneId } } : input;
}

function findTab(
  state: LayoutState,
  workspaceKey: string,
  tabId: string,
): { tab: LayoutTab; paneId: string } | null {
  const layout = state.layoutByWorkspace[workspaceKey];
  if (!layout) return null;
  for (const pane of collectPanes(layout.root)) {
    const tab = (pane.tabs ?? []).find((candidate) => candidate.tabId === tabId);
    if (tab) return { tab, paneId: pane.id };
  }
  return null;
}

function findDraftId(state: LayoutState, workspaceKey: string, tabId: string): string | null {
  const layout = state.layoutByWorkspace[workspaceKey];
  if (!layout) return null;
  for (const pane of collectPanes(layout.root)) {
    for (const tab of pane.tabs ?? []) {
      if (tab.tabId === tabId && tab.target.kind === "draft") return tab.target.draftId ?? null;
    }
  }
  return null;
}

function loadMemory(): TabScopeMemory {
  const empty: TabScopeMemory = { owners: {}, currentChat: {} };
  const raw = readStorage(STORAGE_KEY);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<TabScopeMemory>;
    return { owners: { ...parsed.owners }, currentChat: { ...parsed.currentChat } };
  } catch {
    return empty;
  }
}

function sameSlots(left: readonly ChatSlot[], right: readonly ChatSlot[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((slot, index) => slot.id === right[index].id && slot.element === right[index].element);
}

function sameRecord(left: Readonly<Record<string, unknown>>, right: Readonly<Record<string, unknown>>): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

function createEngine(box: SharedBox): Engine {
  const { listeners, recorders } = box;
  /** draftId -> source agent id */
  const expectedForks = new Map<string, string>();
  const seenWorkspaces = new Set<string>();
  const memory = loadMemory();
  let savedMemory = JSON.stringify(memory);
  let snapshot: ControllerSnapshot = EMPTY_SNAPSHOT;
  let lastSelected: readonly string[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  let subscribedStore: StoreApi<LayoutState> | null = null;
  let releaseStore: (() => void) | null = null;
  let restoreConvert: (() => void) | null = null;
  let restoreOpenTab: (() => void) | null = null;
  let restoreReplaceTab: (() => void) | null = null;
  let restoreReconcile: (() => void) | null = null;
  /** Each chat list and the agent whose row it marks current, re-applied when React re-renders */
  let currentByList = new Map<DomElement, string | null>();
  const remarkCurrentChats = () => {
    for (const [list, agentId] of currentByList) markCurrentChat(list, agentId);
  };

  const publish = (next: ControllerSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  const schedule = () => {
    if (stopped || timer) return;
    timer = setTimeout(sync, SYNC_DELAY_MS);
  };

  const noteNativeFork = (draftId: string) => {
    if (expectedForks.has(draftId)) return;
    const attachments = attachmentsStore()?.getState().attachmentsByScope[draftAttachmentScopeKey(draftId)];
    const source = readForkSource(attachments);
    if (source) expectedForks.set(draftId, source);
  };

  const onDraftConverted = (
    workspaceKey: string,
    draftTabId: string,
    draftId: string | null,
    agentTabId: string | null,
    agentId: string,
  ) => {
    if (agentTabId) renameChatTab(memory, workspaceKey, draftTabId, agentTabId);
    const parentAgentId = draftId ? expectedForks.get(draftId) : undefined;
    if (!draftId || !parentAgentId) return;
    expectedForks.delete(draftId);
    publish({ ...snapshot, localForkParents: { ...snapshot.localForkParents, [agentId]: parentAgentId } });
    const serverId = splitWorkspaceKey(workspaceKey)?.serverId;
    const recordFork = serverId ? recorders.get(serverId)?.recordFork : undefined;
    recordFork?.(agentId, parentAgentId).catch((error: unknown) => {
      console.warn("[better-chat-management] Could not save fork lineage", error);
    });
  };

  /** Draft tabs become agent tabs here, which is the only place a fork's new agent id shows up */
  const interceptConvert = (store: StoreApi<LayoutState>) => {
    type Convert = LayoutState["convertDraftToAgent"];
    restoreConvert = wrapStoreAction<Convert>(
      store,
      "convertDraftToAgent",
      WRAP_OWNER,
      (next) => (workspaceKey, tabId, agentId) => {
        // Tab ids are not always the draft id; the tab's target carries it
        const draftId = findDraftId(store.getState(), workspaceKey, tabId);
        if (draftId) noteNativeFork(draftId);
        const agentTabId = next(workspaceKey, tabId, agentId);
        try {
          onDraftConverted(workspaceKey, tabId, draftId, agentTabId, agentId);
        } catch (error) {
          console.warn("[better-chat-management] Fork tracking failed", error);
        }
        return agentTabId;
      },
      WRAP_OPTIONS,
    );
  };

  /**
   * New file tabs open in the side pane beside the chat, so every source (chat links, file
   * trees, search) lands in one file area. Pane-local opens ("pane") and app-driven ones
   * ("ambient") keep their placement, and a file already open is revealed where it is.
   */
  const interceptOpenTab = (store: StoreApi<LayoutState>) => {
    restoreOpenTab = wrapStoreAction<LayoutState["openTab"]>(
      store,
      "openTab",
      WRAP_OWNER,
      (next) => (input: OpenTabInput) => {
        try {
          return next(withFilePanePlacement(store.getState(), input));
        } catch (error) {
          console.warn("[better-chat-management] File placement failed", error);
          return next(input);
        }
      },
      WRAP_OPTIONS,
    );
  };

  /**
   * Paseo's file preview swaps an unmodified file tab for the next file. Files accumulate as
   * tabs instead: a file replacing a different file opens beside it in the same pane.
   */
  const interceptReplaceTab = (store: StoreApi<LayoutState>) => {
    restoreReplaceTab = wrapStoreAction<LayoutState["replaceTab"]>(
      store,
      "replaceTab",
      WRAP_OWNER,
      (next) => (workspaceKey: string, tabId: string, target: TabTarget, state?: unknown) => {
        const current = findTab(store.getState(), workspaceKey, tabId);
        const isPreviewSwap =
          state === undefined &&
          current !== null &&
          current.tab.target.kind === "file" &&
          target.kind === "file" &&
          current.tab.target.path !== target.path;
        if (!isPreviewSwap) return next(workspaceKey, tabId, target, state);
        return store.getState().openTab({
          workspaceKey,
          target,
          intent: "reveal",
          placement: { mode: "pane", paneId: current.paneId },
        });
      },
      WRAP_OPTIONS,
    );
  };

  /**
   * Paseo closes agent tabs whose chat belongs to another workspace when it reconciles a
   * workspace's tabs. A chat the sidebar lists under this workspace counts as its own here, so
   * opening it there keeps its tab.
   */
  const interceptReconcile = (store: StoreApi<LayoutState>) => {
    restoreReconcile = wrapStoreAction<LayoutState["reconcileTabs"]>(
      store,
      "reconcileTabs",
      WRAP_OWNER,
      (next) => (workspaceKey: string, tabSnapshot: TabSnapshot) => {
        const ids = splitWorkspaceKey(workspaceKey);
        const moved = ids ? box.movedChats.get(ids.serverId)?.get(ids.workspaceId) : undefined;
        if (!moved || moved.size === 0) return next(workspaceKey, tabSnapshot);
        return next(workspaceKey, {
          ...tabSnapshot,
          activeAgentIds: new Set([...tabSnapshot.activeAgentIds, ...moved]),
          foreignAgentIds: [...(tabSnapshot.foreignAgentIds ?? [])].filter((agentId) => !moved.has(agentId)),
        });
      },
      WRAP_OPTIONS,
    );
  };

  const attachStore = (): StoreApi<LayoutState> | null => {
    const store = layoutStore();
    if (store && store !== subscribedStore) {
      releaseStore?.();
      restoreConvert?.();
      restoreOpenTab?.();
      restoreReplaceTab?.();
      restoreReconcile?.();
      subscribedStore = store;
      releaseStore = store.subscribe(schedule);
      interceptConvert(store);
      interceptOpenTab(store);
      interceptReplaceTab(store);
      interceptReconcile(store);
    }
    return subscribedStore;
  };

  /** Last published left edge of the current chat's backdrop */
  let currentChatInset: number | null = null;

  function sync(): void {
    timer = null;
    if (stopped) return;
    const store = attachStore();
    const rows = readWorkspaceRows();
    const selectedNow = [...new Set(rows.filter((row) => row.selected).map((row) => row.workspaceKey))];
    // A collapsed sidebar shows no rows; keep scoping the workspace that was selected
    if (selectedNow.length > 0 || rows.length > 0) lastSelected = selectedNow;

    const currentChatAgentIdByWorkspace: Record<string, string | null> = {};
    let selectedBackdrop = snapshot.selectedBackdrop;
    let workspaceGlyphCenter: number | null = null;
    const hidden = new Set<string>();
    const pinned = new Set<string>();
    const chats = new Set<string>();
    if (store) {
      const state = store.getState();
      for (const [workspaceKey, layout] of Object.entries(state.layoutByWorkspace)) {
        if (!layout) continue;
        const firstSight = !seenWorkspaces.has(workspaceKey);
        seenWorkspaces.add(workspaceKey);
        const scope = scopeWorkspace(memory, workspaceKey, layout, {
          explorerPaneId: state.explorerSidebarPaneIdByWorkspace[workspaceKey] ?? null,
          firstSight,
        });
        currentChatAgentIdByWorkspace[workspaceKey] = scope.currentChatAgentId;
        if (lastSelected.includes(workspaceKey)) {
          for (const identity of scope.hidden) hidden.add(identity);
          for (const identity of scope.chats) chats.add(identity);
          if (scope.currentChatIdentity) pinned.add(scope.currentChatIdentity);
        }
        for (const pane of collectPanes(layout.root)) {
          for (const tab of pane.tabs ?? []) {
            if (tab.target.kind === "draft" && tab.target.draftId) noteNativeFork(tab.target.draftId);
          }
        }
      }
      const serialized = JSON.stringify(memory);
      if (serialized !== savedMemory) {
        savedMemory = serialized;
        writeStorage(STORAGE_KEY, serialized);
      }
    }
    applyTabVisibility(hidden, pinned, chats);

    const slots: ChatSlot[] = [];
    const live = new Set<DomElement>();
    const nextCurrentByList = new Map<DomElement, string | null>();
    for (const row of rows) {
      const ids = splitWorkspaceKey(row.workspaceKey);
      if (!ids) continue;
      const placed = placeSlot(row.element, row.workspaceKey);
      if (!placed) continue;
      live.add(placed.wrapper);
      const base = { ...ids, workspaceKey: row.workspaceKey };
      slots.push({ ...base, kind: "info", id: `${placed.id}-info`, element: placed.info });
      slots.push({ ...base, kind: "chats", id: `${placed.id}-chats`, element: placed.list });
      workspaceGlyphCenter ??= measureRowGlyphCenter(row.element, placed.list);
      const backdrop = row.selected ? readRowBackdrop(row.element) : null;
      if (backdrop && (backdrop.color !== selectedBackdrop?.color || backdrop.radius !== selectedBackdrop.radius)) {
        selectedBackdrop = backdrop;
        setSelectedBackdrop(backdrop);
      }
      const currentAgentId = row.selected ? (currentChatAgentIdByWorkspace[row.workspaceKey] ?? null) : null;
      nextCurrentByList.set(placed.list, currentAgentId);
      markCurrentChat(placed.list, currentAgentId);
      slots.push({ ...base, kind: "new-chat", id: `${placed.id}-buttons`, element: placed.overlay });
    }
    removeStaleSlots(live);
    syncProjectRails();
    const inset = workspaceGlyphCenter === null ? null : Math.round(workspaceGlyphCenter);
    if (inset !== null && inset !== currentChatInset) {
      currentChatInset = inset;
      setCurrentChatInset(inset);
    }
    currentByList = nextCurrentByList;

    const next: ControllerSnapshot = {
      slots: sameSlots(slots, snapshot.slots) ? snapshot.slots : slots,
      currentChatAgentIdByWorkspace: sameRecord(currentChatAgentIdByWorkspace, snapshot.currentChatAgentIdByWorkspace)
        ? snapshot.currentChatAgentIdByWorkspace
        : currentChatAgentIdByWorkspace,
      selectedBackdrop,
      // Sub-pixel jitter keeps the old value so the sidebar does not re-render for nothing
      workspaceGlyphCenter:
        workspaceGlyphCenter === null ||
        Math.abs(workspaceGlyphCenter - (snapshot.workspaceGlyphCenter ?? Number.NaN)) < 0.5
          ? snapshot.workspaceGlyphCenter
          : workspaceGlyphCenter,
      selectedWorkspaceKeys:
        lastSelected.join("\n") === snapshot.selectedWorkspaceKeys.join("\n")
          ? snapshot.selectedWorkspaceKeys
          : lastSelected,
      localForkParents: snapshot.localForkParents,
    };
    if (
      next.slots !== snapshot.slots ||
      next.currentChatAgentIdByWorkspace !== snapshot.currentChatAgentIdByWorkspace ||
      next.selectedBackdrop !== snapshot.selectedBackdrop ||
      next.workspaceGlyphCenter !== snapshot.workspaceGlyphCenter ||
      next.selectedWorkspaceKeys !== snapshot.selectedWorkspaceKeys
    ) {
      publish(next);
    }
  }

  const pressWorkspaceRow = (workspaceKey: string): boolean => {
    const row = findWorkspaceRow(workspaceKey);
    if (!row) return false;
    const testId = `${ROW_TEST_ID_PREFIX}${workspaceKey}`;
    const props = findAncestorProps(row, (candidate) => candidate.testID === testId && typeof candidate.onPress === "function");
    if (!props) return false;
    (props.onPress as () => void)();
    return true;
  };

  const methods: ControllerMethods = {
    getSnapshot: () => snapshot,
    bindHost(serverId, binding) {
      recorders.set(serverId, binding);
      return () => {
        if (recorders.get(serverId) === binding) recorders.delete(serverId);
      };
    },
    openTarget(serverId, workspaceId, target, options) {
      const store = attachStore();
      if (!store) return false;
      const workspaceKey = `${serverId}:${workspaceId}`;
      // The row's own press navigates the route; it may reveal an attention chat, so ours goes last
      if (!snapshot.selectedWorkspaceKeys.includes(workspaceKey) && !pressWorkspaceRow(workspaceKey)) return false;
      const tabId = store.getState().openTab({
        workspaceKey,
        target,
        intent: "reveal",
        ...(options?.pin ? { pin: true } : {}),
      });
      if (tabId) store.getState().focusTab(workspaceKey, tabId);
      schedule();
      return true;
    },
    expectFork(draftId, parentAgentId) {
      expectedForks.set(draftId, parentAgentId);
    },
    setMovedChats(serverId, chatsByWorkspace) {
      box.movedChats.set(serverId, chatsByWorkspace);
    },
  };

  const releaseStyle = installStyle();
  const releaseHover = suppressRowHover();
  // A drop moves list items; the chat containers follow them before the next paint
  const releaseDrag = installWorkspaceDrag(() => {
    clearTimeout(timer ?? undefined);
    sync();
  });
  const releaseTabMenu = installTabMenuSplits({
    layoutStore: attachStore,
    selectedWorkspaces: () => lastSelected,
  });
  const stopObserving = observeDom(
    (urgent) => {
      if (!urgent) {
        schedule();
        return;
      }
      if (timer) clearTimeout(timer);
      sync();
    },
    remarkCurrentChats,
    syncProjectRails,
  );
  schedule();

  return {
    methods,
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      stopObserving();
      releaseStore?.();
      restoreConvert?.();
      restoreOpenTab?.();
      restoreReplaceTab?.();
      restoreReconcile?.();
      releaseStyle();
      releaseHover();
      releaseDrag();
      releaseTabMenu();
      clearTabVisibility();
      removeAllSlots();
    },
  };
}

/**
 * One engine serves every installation of this plugin (one per connected host), since the
 * sidebar and tab strip are shared app UI. Each retain starts a fresh engine from the newest
 * bundle: other hosts' installations still hold the old one through a reload, and keeping it
 * would run stale code. The last release stops it.
 */
export function retainController(): { controller: Controller; release(): void } {
  const holder = globalThis as unknown as Record<string, SharedBox | undefined>;
  const box: SharedBox = holder[GLOBAL_KEY] ?? {
    engine: null,
    retainCount: 0,
    listeners: new Set(),
    recorders: new Map(),
    movedChats: new Map(),
  };
  // A box made by a build from before moved chats lacks the map
  box.movedChats ??= new Map();
  holder[GLOBAL_KEY] = box;
  // An app session that ran the first builds still has that controller syncing the same DOM
  const legacy = (globalThis as unknown as Record<string, { stop?: () => void } | undefined>)[LEGACY_GLOBAL_KEY];
  if (legacy) {
    legacy.stop?.();
    (globalThis as unknown as Record<string, unknown>)[LEGACY_GLOBAL_KEY] = undefined;
  }
  box.engine?.stop();
  box.engine = createEngine(box);
  box.retainCount += 1;
  for (const listener of box.listeners) listener();

  const engine = (): ControllerMethods => box.engine?.methods ?? STOPPED_METHODS;
  const controller: Controller = {
    subscribe(listener) {
      box.listeners.add(listener);
      return () => box.listeners.delete(listener);
    },
    getSnapshot: () => engine().getSnapshot(),
    bindHost: (serverId, binding) => engine().bindHost(serverId, binding),
    openTarget: (serverId, workspaceId, target, options) => engine().openTarget(serverId, workspaceId, target, options),
    expectFork: (draftId, parentAgentId) => engine().expectFork(draftId, parentAgentId),
    setMovedChats: (serverId, chatsByWorkspace) => engine().setMovedChats(serverId, chatsByWorkspace),
  };
  let released = false;
  return {
    controller,
    release() {
      if (released) return;
      released = true;
      box.retainCount -= 1;
      if (box.retainCount > 0) return;
      box.engine?.stop();
      box.engine = null;
      if (holder[GLOBAL_KEY] === box) holder[GLOBAL_KEY] = undefined;
    },
  };
}
