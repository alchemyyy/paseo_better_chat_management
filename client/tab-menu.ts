// "Split left/right/up/down" in a file tab's context menu. The menu is app UI
// (packages/app/src/screens/workspace/workspace-tab-menu.ts), so the entries are clones of its
// own "Copy file path" item, which keeps the menu's typography and spacing exactly.
import type { LayoutState } from "./app-stores";
import type { StoreApi } from "./fiber";
import { collectPanes, tabIdentity } from "./tab-scope";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface MenuElement {
  readonly parentElement: MenuElement | null;
  readonly nextSibling: MenuElement | null;
  readonly children: ArrayLike<MenuElement>;
  textContent: string | null;
  innerHTML: string;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  querySelector(selector: string): MenuElement | null;
  querySelectorAll(selector: string): ArrayLike<MenuElement>;
  closest(selector: string): MenuElement | null;
  cloneNode(deep: boolean): MenuElement;
  insertBefore(node: MenuElement, reference: MenuElement | null): void;
  addEventListener(type: string, listener: (event: { preventDefault(): void; stopPropagation(): void }) => void): void;
  remove(): void;
}
declare const window: {
  addEventListener(type: string, listener: (event: never) => void, capture: boolean): void;
  removeEventListener(type: string, listener: (event: never) => void, capture: boolean): void;
};
declare const document: {
  body: MenuElement;
  querySelector(selector: string): MenuElement | null;
  head: MenuElement & { appendChild(node: MenuElement): void };
  createElement(tag: string): MenuElement;
  querySelectorAll(selector: string): ArrayLike<MenuElement>;
  dispatchEvent(event: unknown): boolean;
};
declare const MutationObserver: new (callback: () => void) => {
  observe(target: MenuElement, options: Record<string, boolean>): void;
  disconnect(): void;
};
declare const KeyboardEvent: new (type: string, init: { key: string; bubbles: boolean }) => unknown;

type SplitPosition = "left" | "right" | "top" | "bottom";

/** Menu content carries `workspace-tab-context-<tabId>`; only file tabs offer "Copy file path" */
const MENU_PREFIX = "workspace-tab-context-";
const MENU_SELECTOR = `[data-testid^="${MENU_PREFIX}"]`;
const TEMPLATE_SELECTOR = '[data-testid$="-copy-file-path"]';
const ADDED_ATTRIBUTE = "data-better-chat-split-added";
const ITEM_ATTRIBUTE = "data-better-chat-menu-item";
const STYLE_OWNER = "better-chat-management-tab-menu";
const STYLE_TEXT = [
  `[${ITEM_ATTRIBUTE}]{cursor:pointer}`,
  `[${ITEM_ATTRIBUTE}]:hover{background-color:color-mix(in srgb, currentColor 10%, transparent)}`,
].join("");

// Lucide arrow icon paths (stroke-based, like the menu's other icons)
const SPLITS: readonly { position: SplitPosition; label: string; icon: string }[] = [
  { position: "left", label: "Split left", icon: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>' },
  { position: "right", label: "Split right", icon: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>' },
  { position: "top", label: "Split up", icon: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>' },
  { position: "bottom", label: "Split down", icon: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>' },
];

/**
 * Pins belong to the editor-enhancements plugin, which publishes them on its window-global
 * registry (paseo_editor_enhancements/client/hosts.ts `isTabPinned`). Without it nothing is pinned.
 */
const EDITOR_REGISTRY_KEY = "__paseoEditorEnhancements";

function isPinnedByEditor(workspaceKey: string, identity: string): boolean {
  const registry = (globalThis as unknown as Record<string, { isTabPinned?: unknown } | undefined>)[EDITOR_REGISTRY_KEY];
  const isTabPinned = registry?.isTabPinned;
  return typeof isTabPinned === "function" && Boolean(isTabPinned(workspaceKey, identity));
}

/** The deepest element holding the item's visible text */
function findLabel(item: MenuElement): MenuElement | null {
  let found: MenuElement | null = null;
  const pending: MenuElement[] = [item];
  while (pending.length > 0) {
    const element = pending.pop()!;
    if (element.querySelector("svg") === null && element.children.length === 0 && (element.textContent ?? "").trim()) {
      found = element;
    }
    for (let index = 0; index < element.children.length; index++) pending.push(element.children[index]);
  }
  return found;
}

/** Where a tab lives: its workspace and pane, preferring the selected workspace when ids repeat */
function locateTab(
  state: LayoutState,
  tabId: string,
  preferredWorkspaces: readonly string[],
): { workspaceKey: string; paneId: string } | null {
  const keys = Object.keys(state.layoutByWorkspace).sort(
    (left, right) => Number(preferredWorkspaces.includes(right)) - Number(preferredWorkspaces.includes(left)),
  );
  for (const workspaceKey of keys) {
    const layout = state.layoutByWorkspace[workspaceKey];
    if (!layout) continue;
    for (const pane of collectPanes(layout.root)) {
      if ((pane.tabs ?? []).some((tab) => tab.tabId === tabId)) return { workspaceKey, paneId: pane.id };
    }
  }
  return null;
}

function closeMenu(): void {
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

type BulkClose = "close-left" | "close-right" | "close-others";
const BULK_CLOSE_SUFFIXES: readonly BulkClose[] = ["close-left", "close-right", "close-others"];
/**
 * Kinds a bulk close removes from the layout. Chats would be archived, and terminals and
 * browsers own processes and webviews that only the app's own close path tears down.
 */
const BULK_CLOSABLE_KINDS = new Set([
  "file",
  "working_diff",
  "commit_diff",
  "changes_tree",
  "files",
  "pull_request",
  "plugin",
  "new_tab",
  "setup",
]);
const POINTER_EVENTS = ["pointerdown", "mousedown", "pointerup", "mouseup", "touchstart", "touchend"];

function bulkCloseOf(element: MenuElement | null): { tabId: string; action: BulkClose } | null {
  const item = element?.closest?.(`[data-testid^="${MENU_PREFIX}"]`) ?? null;
  const testId = item?.getAttribute("data-testid") ?? "";
  for (const action of BULK_CLOSE_SUFFIXES) {
    const suffix = `-${action}`;
    if (testId.endsWith(suffix)) return { tabId: testId.slice(MENU_PREFIX.length, -suffix.length), action };
  }
  return null;
}

/** Watches for file tab menus and adds split entries to each; returns the teardown */
export function installTabMenuSplits(input: {
  layoutStore(): StoreApi<LayoutState> | null;
  selectedWorkspaces(): readonly string[];
}): () => void {
  const style = document.createElement("style");
  style.setAttribute("data-owner", STYLE_OWNER);
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);

  const split = (tabId: string, position: SplitPosition) => {
    const store = input.layoutStore();
    if (!store) return;
    const location = locateTab(store.getState(), tabId, input.selectedWorkspaces());
    if (!location) return;
    store.getState().splitPane(location.workspaceKey, { tabId, targetPaneId: location.paneId, position });
  };

  const decorate = (menu: MenuElement, template: MenuElement) => {
    if (!template.parentElement) return;
    menu.setAttribute(ADDED_ATTRIBUTE, "true");
    const tabId = (menu.getAttribute("data-testid") ?? "").slice(MENU_PREFIX.length);
    const entries = SPLITS.map((entry) => ({ ...entry, run: () => split(tabId, entry.position) }));
    let anchor = template;
    for (const entry of entries) {
      const item = template.cloneNode(true);
      item.removeAttribute("data-testid");
      item.setAttribute(ITEM_ATTRIBUTE, entry.position);
      const label = findLabel(item);
      if (label) label.textContent = entry.label;
      const icon = item.querySelector("svg");
      if (icon) icon.innerHTML = entry.icon;
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        entry.run();
      });
      template.parentElement?.insertBefore(item, anchor.nextSibling);
      anchor = item;
    }
  };

  const scan = () => {
    const menus = document.querySelectorAll(`${MENU_SELECTOR}:not([${ADDED_ATTRIBUTE}])`);
    for (let index = 0; index < menus.length; index++) {
      // Non-file tab menus have no template and are skipped; items still rendering retry later
      const template = menus[index].querySelector(TEMPLATE_SELECTOR);
      if (template) decorate(menus[index], template);
    }
  };

  /**
   * Paseo's own close-left/right/others confirms in a dialog and archives every chat in the set,
   * including chats this plugin hides from the strip. These run instead: no dialog, and only
   * tabs that are safe to drop from the layout, never unsaved or pinned ones.
   */
  const bulkClose = (tabId: string, action: BulkClose) => {
    const store = input.layoutStore();
    if (!store) return;
    const state = store.getState();
    const location = locateTab(state, tabId, input.selectedWorkspaces());
    const layout = location ? state.layoutByWorkspace[location.workspaceKey] : undefined;
    if (!location || !layout) return;
    const pane = collectPanes(layout.root).find((candidate) => candidate.id === location.paneId);
    const tabs = pane?.tabs ?? [];
    const index = tabs.findIndex((tab) => tab.tabId === tabId);
    if (index < 0) return;
    let span = tabs.filter((tab) => tab.tabId !== tabId);
    if (action === "close-left") span = tabs.slice(0, index);
    if (action === "close-right") span = tabs.slice(index + 1);
    for (const tab of span) {
      if (!BULK_CLOSABLE_KINDS.has(tab.target.kind)) continue;
      const identity = tabIdentity(tab);
      if (isPinnedByEditor(location.workspaceKey, identity)) continue;
      if (document.querySelector(`[data-testid="workspace-tab-modified-${identity}"]`)) continue;
      state.closeTab(location.workspaceKey, tab.tabId);
    }
  };

  // Presses on the three items stop here, before the app's press handling sees them
  const swallowPress = (event: { target: MenuElement | null; preventDefault(): void; stopPropagation(): void }) => {
    if (!bulkCloseOf(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  const onClick = (event: { target: MenuElement | null; preventDefault(): void; stopPropagation(): void }) => {
    const bulk = bulkCloseOf(event.target);
    if (!bulk) return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu();
    bulkClose(bulk.tabId, bulk.action);
  };
  for (const type of POINTER_EVENTS) window.addEventListener(type, swallowPress, true);
  window.addEventListener("click", onClick, true);

  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();

  return () => {
    for (const type of POINTER_EVENTS) window.removeEventListener(type, swallowPress, true);
    window.removeEventListener("click", onClick, true);
    observer.disconnect();
    const items = document.querySelectorAll(`[${ITEM_ATTRIBUTE}]`);
    for (let index = 0; index < items.length; index++) items[index].remove();
    style.remove();
  };
}
