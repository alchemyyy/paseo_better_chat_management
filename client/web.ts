import type { ReactNode } from "react";
import { Platform } from "react-native";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface DomStyle {
  height: string;
  transform: string;
  color: string;
  backgroundColor: string;
  borderBottomLeftRadius: string;
  borderBottomRightRadius: string;
  borderTopLeftRadius: string;
  paddingTop: string;
  zIndex: string;
  setProperty(name: string, value: string): void;
  getPropertyValue(name: string): string;
  removeProperty(name: string): string;
}
export interface DomMouseEvent {
  preventDefault(): void;
}
export interface DomElement {
  readonly parentElement: DomElement | null;
  readonly nextSibling: DomElement | null;
  readonly previousElementSibling: DomElement | null;
  readonly firstElementChild: DomElement | null;
  readonly lastElementChild: DomElement | null;
  readonly isConnected: boolean;
  readonly style: DomStyle;
  textContent: string | null;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  insertBefore(node: DomElement, reference: DomElement | null): void;
  appendChild(node: DomElement): void;
  remove(): void;
  closest(selector: string): DomElement | null;
  matches(selector: string): boolean;
  querySelector(selector: string): DomElement | null;
  contains(other: DomElement): boolean;
  getBoundingClientRect(): { top: number; left: number; width: number; height: number };
  querySelectorAll(selector: string): ArrayLike<DomElement>;
  dispatchEvent(event: DomEvent): boolean;
}
interface DomMutationRecord {
  type: string;
  target: DomElement;
  addedNodes: ArrayLike<DomElement>;
  removedNodes: ArrayLike<DomElement>;
}
interface DomMutationObserver {
  observe(target: DomElement, options: Record<string, unknown>): void;
  disconnect(): void;
}
declare const document: {
  documentElement: DomElement & { style: { setProperty(name: string, value: string): void } };
  body: DomElement;
  head: DomElement;
  getElementById(id: string): DomElement | null;
  createElement(tag: string): DomElement;
  querySelectorAll(selector: string): ArrayLike<DomElement>;
};
interface DomEvent {
  readonly type: string;
  readonly target: DomElement | null;
  readonly relatedTarget: DomElement | null;
  stopImmediatePropagation(): void;
}
interface DomPointerEventInit {
  bubbles: boolean;
  cancelable: boolean;
  composed: boolean;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  pointerId?: number;
  pointerType?: string;
  isPrimary?: boolean;
  relatedTarget: DomElement | null;
  button?: number;
  buttons?: number;
}
type DomEventConstructor = new (type: string, init: DomPointerEventInit) => DomEvent;
interface DomEventTarget {
  addEventListener(type: string, listener: (event: DomEvent) => void, capture: boolean): void;
  removeEventListener(type: string, listener: (event: DomEvent) => void, capture: boolean): void;
}
declare const window: DomEventTarget & {
  getComputedStyle(element: DomElement): DomStyle;
};
declare const MouseEvent: DomEventConstructor;
declare const PointerEvent: DomEventConstructor;
declare const MutationObserver: new (
  callback: (records: ArrayLike<DomMutationRecord>) => void,
) => DomMutationObserver;
declare const localStorage: {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const IS_WEB = Platform.OS === "web";

/** Workspace rows carry `sidebar-workspace-row-<serverId>:<workspaceId>` (sidebar-workspace-list.tsx) */
const ROW_TEST_ID_PREFIX = "sidebar-workspace-row-";
const ROW_SELECTOR = `[data-testid^="${ROW_TEST_ID_PREFIX}"]`;
const ROW_LIST_SELECTOR = '[data-testid^="sidebar-workspace-list-"], [data-testid="sidebar-pinned-list"]';
/** Pinned workspaces (sidebar-workspace-list.tsx); their rows belong to no project */
const PINNED_SECTION_SELECTOR = '[data-testid="sidebar-pinned-section"]';
/** Tab chips carry `workspace-tab-<identity>` (workspace-desktop-tabs-row.tsx) */
const TAB_SCROLL_SELECTOR = '[data-testid="workspace-tabs-scroll"]';
const TAB_TEST_ID_PREFIX = "workspace-tab-";
/** Started chats live in the sidebar, so their chips hide even before the layout store is found */
const CHAT_IDENTITY_PREFIXES = ["agent_", "provider_subagent_"];
const SLOT_ATTRIBUTE = "data-better-chat-slot";
const SLOT_KEY_ATTRIBUTE = "data-better-chat-workspace";
const HIDDEN_ATTRIBUTE = "data-better-chat-hidden";
const STYLE_ELEMENT_ID = "better-chat-management-style";
const PINNED_ATTRIBUTE = "data-better-chat-pinned";
/** Chat chips grow to fit their title up to this, 3x Paseo's TAB_MAX_WIDTH (workspace-desktop-tabs-row.tsx) */
const CHAT_TAB_MAX_WIDTH_PX = 480;
const WIDE_CHIP_ATTRIBUTE = "data-better-chat-wide-chip";
const WIDE_ITEM_ATTRIBUTE = "data-better-chat-wide-item";
const WIDE_ROW_ATTRIBUTE = "data-better-chat-wide-row";
const NEW_CHAT_ATTRIBUTE = "data-better-chat-new";
const HAS_NEW_CHAT_ATTRIBUTE = "data-better-chat-has-new";
const LIST_ATTRIBUTE = "data-better-chat-list";
const INFO_ATTRIBUTE = "data-better-chat-info";
/** Marks a workspace row's list item, whose next sibling is its slot */
const ITEM_ATTRIBUTE = "data-better-chat-item";
/** Set briefly on a selected row to read Paseo's own background past the plugin's override */
const PROBE_ATTRIBUTE = "data-better-chat-probe";
/** Chat rows carry their agent id (React Native Web renders `dataSet` as data-* attributes) */
const CHAT_AGENT_ATTRIBUTE = "data-better-chat-agent";
/** On the chat row's title area, where a drag can start; and the row's place in its list's tree */
const CHAT_HANDLE_ATTRIBUTE = "data-better-chat-handle";
const CHAT_DEPTH_ATTRIBUTE = "data-better-chat-depth";
const CHAT_PARENT_ATTRIBUTE = "data-better-chat-parent";
/** Drop feedback while a chat is dragged: "zone" over the target workspace, "line" where it lands */
const DRAG_MARKER_ATTRIBUTE = "data-better-chat-drag-marker";
const CURRENT_CHAT_ATTRIBUTE = "data-better-chat-current";
const SELECTED_COLOR_VARIABLE = "--better-chat-selected-color";
const SELECTED_RADIUS_VARIABLE = "--better-chat-selected-radius";
/**
 * Unselected workspaces get a faint lightened tint with a soft 1px edge rather than a dimmed copy
 * of the selected fill: the edge shows the block's extent while the fill barely touches the text's
 * contrast. The tint is the selected color lifted toward white.
 */
const IDLE_BACKDROP_TINT = `color-mix(in srgb, var(${SELECTED_COLOR_VARIABLE}) 60%, #fff)`;
const IDLE_BACKDROP_FILL = `color-mix(in srgb, ${IDLE_BACKDROP_TINT} 4%, transparent)`;
/** 10% lighter than the fill's tint */
const IDLE_BACKDROP_EDGE = `color-mix(in srgb, color-mix(in srgb, ${IDLE_BACKDROP_TINT} 90%, #fff) 14%, transparent)`;
/** Drop feedback's tint: the backdrop tint, with a neutral grey before any workspace is selected */
const DRAG_MARKER_TINT = `color-mix(in srgb, var(${SELECTED_COLOR_VARIABLE}, #6b7280) 60%, #fff)`;
/** Above the other projects' blocks (dnd-kit gives each drag item z-index 1) while a chat is dragged out of its own */
const LIFTED_Z_INDEX = "1000";
/** A hair under 1px; the browser antialiases it rather than snapping to whole pixels on HiDPI */
const IDLE_BACKDROP_EDGE_PX = 0.8;
/** The current chat's backdrop starts here, under the workspace row's status glyph */
const CURRENT_CHAT_INSET_VARIABLE = "--better-chat-current-inset";
/** Paseo's workspace hover card (workspace-hover-card.tsx); focus would still open it */
const HOVER_CARD_SELECTOR = '[data-testid="workspace-hover-card"]';
/** Room for the collapse, new chat, and menu buttons (3 x 22px, 2px gaps, 6px edge) so the row's trailing content does not sit under them */
const NEW_CHAT_RESERVE_PX = 76;
/** Tighter than the row's own bottom padding so the host line sits close to the meta line */
const ROW_BOTTOM_PADDING_PX = 1;
/**
 * The meta line (branch/project, workspace-meta-row/index.tsx) is drawn this far down so the gap
 * above it matches the gap to the host line below it; only its drawing moves, so the host line
 * and the chats keep their place. Measured: title-to-branch ink gap ~8.5px, branch-to-host ~11.5px.
 */
const META_ROW_SHIFT_PX = 0.5;
const META_ROW_SELECTOR = `${ROW_SELECTOR} :has(> [data-testid="sidebar-workspace-branch"], > [data-testid="sidebar-workspace-project"])`;
/** Project rows carry `sidebar-project-row-<viewKey>` (sidebar-workspace-list.tsx) */
const PROJECT_ROW_SELECTOR = '[data-testid^="sidebar-project-row-"]';
const PROJECT_ROW_HEIGHT_PX = 28;
const PROJECT_ROW_PADDING_PX = 4;
const PROJECT_ROW_GAP_PX = 2;
/** Paseo pads project rows 8px left (sidebar-workspace-list.tsx projectRow); the plugin takes 6 off */
const PROJECT_ROW_PADDING_LEFT_PX = 2;
/**
 * A project's row is `sidebar-project-row-<viewKey>`. Its workspace list carries
 * `sidebar-workspace-list-<viewKey>` only while sorting is automatic: the manual sort's
 * DraggableList drops the test id, so the plugin finds lists by their rows and marks them.
 */
const WORKSPACE_LIST_ATTRIBUTE = "data-better-chat-workspace-list";
const PROJECT_ROW_PREFIX = "sidebar-project-row-";
/** Set on a project's workspace list while it draws the rail joining it to the project icon */
const RAIL_ATTRIBUTE = "data-better-chat-rail";
/** Set on a workspace list while one of its rows is dragged; the rail hides until the drop */
const LIST_DRAGGING_ATTRIBUTE = "data-better-chat-dragging";
/** Set on the document element for a whole workspace drag gesture, project hand-off included */
const DRAG_GESTURE_ATTRIBUTE = "data-better-chat-workspace-drag";
/**
 * Marks a project's block (header plus workspace list). Paseo pads an expanded block 12px below
 * (sidebar-workspace-list.tsx projectBlockExpanded); the plugin closes that to PROJECT_GAP_PX.
 * A project's lone workspace under the manual sort makes the block its own list (workspaceRowItem),
 * so the rules below also match an element that is both.
 */
const PROJECT_BLOCK_ATTRIBUTE = "data-better-chat-project-block";
const PROJECT_GAP_PX = 6;
/**
 * The rail's shape (an SVG data URL used as a mask) and the box it fills, relative to the list.
 * The color comes from the box's fill, so hover changes only the fill and never re-renders the shape.
 */
const RAIL_IMAGE_VARIABLE = "--better-chat-rail-image";
const RAIL_COLOR_VARIABLE = "--better-chat-rail-color";
const RAIL_HOVER_COLOR_VARIABLE = "--better-chat-rail-hover-color";
const RAIL_BOX_TOP_VARIABLE = "--better-chat-rail-box-top";
const RAIL_BOX_WIDTH_VARIABLE = "--better-chat-rail-box-width";
const RAIL_BOX_HEIGHT_VARIABLE = "--better-chat-rail-box-height";
/** Space between the project icon and the rail's top */
const RAIL_ICON_GAP_PX = 4;
/** Where the rail turns when the list's last row cannot be measured: half the Archived heading's 28px height */
const RAIL_END_PX = 14;
const RAIL_ARM_PX = 8;
const RAIL_RADIUS_PX = 4;
/** Thin, but heavier than a hairline so antialiasing keeps it even along its length */
const RAIL_STROKE_PX = 1.2;
/** Room around the path so strokes at the box edges are not cut */
const RAIL_BOX_PAD_PX = 2;
/** Share of the project title's color the rail takes, and a slightly stronger share while the project is hovered */
const RAIL_OPACITY_PERCENT = 40;
const RAIL_HOVER_OPACITY_PERCENT = 55;
/** Workspace rows' status dot (sidebar-workspace-row-content.tsx), drawn this far right of its slot */
const WORKSPACE_STATUS_SELECTOR = '[data-testid^="workspace-status-indicator-"]';
const STATUS_NUDGE_PX = 2;
/**
 * Workspace rows sit this much further left than Paseo's 8px padding (sidebar-workspace-list.tsx
 * workspaceRow); their info lines and chats follow (sidebar-chats.tsx BASE_INDENT), and their
 * status dots are shifted back so they stay where they were
 */
const WORKSPACE_ROW_PULL_PX = 2;
const WORKSPACE_ROW_PADDING_LEFT_PX = 8 - WORKSPACE_ROW_PULL_PX;
/** Per project list: how far its workspace status dots shift to sit on the project rail */
const STATUS_SHIFT_VARIABLE = "--better-chat-status-shift";
/**
 * Around each railed workspace status dot the rail opens into a ring, 3px past the running
 * ring's radius (status-ring/geometry.ts: 6px dot + (1.5 gap + 1.5 stroke) * 2 = 12px across),
 * of which only two arcs draw: 2N degrees centred on its top and bottom, the points with
 * |y| >= R cos N. The rail stops at the arcs, so nothing draws inside a ring.
 */
const STATUS_RING_RADIUS_PX = 12 / 2 + 3;
const STATUS_RING_ARC_HALF_ANGLE_DEG = 45;
/** The workspace row's trailing timestamp (workspace-trailing/index.tsx) */
const TIMESTAMP_SELECTOR = '[data-testid="sidebar-workspace-timestamp"]';
const TIMESTAMP_GAP_PX = 6;
/** The workspace row's branch/worktree name (workspace-meta-row/index.tsx IdentityItem); RN Web Text carries dir="auto" */
const BRANCH_TEXT_SELECTOR = '[data-testid="sidebar-workspace-branch"] [dir="auto"]';
const BRANCH_TEXT_COLOR = "#c4b5fd";
/** Title line height (sidebar-workspace-row-content.tsx) and the plugin's button size */
const TITLE_LINE_HEIGHT_PX = 20;
const BAR_BUTTON_SIZE_PX = 22;
const HOVER_ZONE_SELECTOR = `[${HAS_NEW_CHAT_ATTRIBUTE}="true"]`;
const ENTER_EVENTS = ["pointerenter", "mouseenter"];
const OVER_EVENTS = ["pointerover", "mouseover"];
const OUT_EVENTS = ["pointerout", "mouseout"];
const STYLE_TEXT = [
  `[${HIDDEN_ATTRIBUTE}="true"]{display:none !important}`,
  // Flex order pins the chip without reordering the app's persisted tabs
  `[${PINNED_ATTRIBUTE}="true"]{order:-1}`,
  // Paseo sizes every chip inline (min/width/max = its layout width). A chat chip fits its title up to
  // CHAT_TAB_MAX_WIDTH_PX instead, never narrower than Paseo's width. The strip's content is held to
  // the viewport so a crowded strip shrinks the chat chip back toward Paseo's width rather than
  // pushing the other chips out of view.
  `[${WIDE_CHIP_ATTRIBUTE}="true"]{width:auto !important;max-width:${CHAT_TAB_MAX_WIDTH_PX}px !important}`,
  `[${WIDE_ITEM_ATTRIBUTE}="true"]{flex-shrink:1 !important;min-width:0 !important}`,
  `[${WIDE_ROW_ATTRIBUTE}="true"]{max-width:100% !important}`,
  `[${HAS_NEW_CHAT_ATTRIBUTE}="true"] ${ROW_SELECTOR}{padding-right:${NEW_CHAT_RESERVE_PX}px !important;padding-bottom:${ROW_BOTTOM_PADDING_PX}px !important}`,
  `${HOVER_CARD_SELECTOR}{display:none !important}`,
  // The open chat's row wears the selected workspace row's backdrop, set as variables below, cut off
  // on the left where the workspace status glyph sits; the row's own fill gives way to it
  `[${CURRENT_CHAT_ATTRIBUTE}="true"]{background-color:transparent !important;position:relative;isolation:isolate}`,
  `[${CURRENT_CHAT_ATTRIBUTE}="true"]::before{content:"";position:absolute;top:0;bottom:0;right:0;left:var(${CURRENT_CHAT_INSET_VARIABLE},0px);z-index:-1;pointer-events:none;background-color:var(${SELECTED_COLOR_VARIABLE});border-radius:var(${SELECTED_RADIUS_VARIABLE})}`,
  // Compact project rows; Paseo's 36px desktop row height has no user setting (styles/density.ts)
  `${PROJECT_ROW_SELECTOR}{min-height:${PROJECT_ROW_HEIGHT_PX}px !important;padding-top:${PROJECT_ROW_PADDING_PX}px !important;padding-bottom:${PROJECT_ROW_PADDING_PX}px !important;padding-left:${PROJECT_ROW_PADDING_LEFT_PX}px !important;margin-bottom:${PROJECT_ROW_GAP_PX}px !important}`,
  // An L from under the project icon down the project's workspaces and chats, opening into a ring
  // around each workspace's status dot and turning at the last row: one SVG path, so every part
  // shares the stroke, antialiasing, and joins
  `[${RAIL_ATTRIBUTE}]{position:relative}`,
  `[${PROJECT_BLOCK_ATTRIBUTE}]:has([${WORKSPACE_LIST_ATTRIBUTE}]),[${PROJECT_BLOCK_ATTRIBUTE}][${WORKSPACE_LIST_ATTRIBUTE}]{padding-bottom:${PROJECT_GAP_PX}px !important}`,
  // Above the rows, so a selected workspace's solid backdrop cannot cover the ring arcs reaching into it
  `[${RAIL_ATTRIBUTE}]::before{content:"";position:absolute;z-index:1;pointer-events:none;left:0;top:var(${RAIL_BOX_TOP_VARIABLE});width:var(${RAIL_BOX_WIDTH_VARIABLE});height:var(${RAIL_BOX_HEIGHT_VARIABLE});background-color:var(${RAIL_COLOR_VARIABLE});-webkit-mask:var(${RAIL_IMAGE_VARIABLE}) no-repeat 0 0 / 100% 100%;mask:var(${RAIL_IMAGE_VARIABLE}) no-repeat 0 0 / 100% 100%}`,
  `[${PROJECT_BLOCK_ATTRIBUTE}]:has(${PROJECT_ROW_SELECTOR}:hover) [${RAIL_ATTRIBUTE}]::before,[${PROJECT_BLOCK_ATTRIBUTE}][${RAIL_ATTRIBUTE}]:has(${PROJECT_ROW_SELECTOR}:hover)::before{background-color:var(${RAIL_HOVER_COLOR_VARIABLE})}`,
  // The rail's rings sit on resting rows, so it steps aside while the rows move
  `[${RAIL_ATTRIBUTE}][${LIST_DRAGGING_ATTRIBUTE}]::before{visibility:hidden}`,
  `[${DRAG_GESTURE_ATTRIBUTE}],[${DRAG_GESTURE_ATTRIBUTE}] *{user-select:none !important;-webkit-user-select:none !important}`,
  `${ROW_SELECTOR}{padding-left:${WORKSPACE_ROW_PADDING_LEFT_PX}px !important}`,
  `${WORKSPACE_STATUS_SELECTOR}{transform:translateX(${STATUS_NUDGE_PX + WORKSPACE_ROW_PULL_PX}px)}`,
  `[${RAIL_ATTRIBUTE}] ${WORKSPACE_STATUS_SELECTOR}{transform:translateX(var(${STATUS_SHIFT_VARIABLE}))}`,
  `[${SLOT_KEY_ATTRIBUTE}]{position:relative;display:flex;flex-direction:column}`,
  // A 2px gap between the workspace's backdrop (ending at the host line) and its first chat
  `[${LIST_ATTRIBUTE}]{display:flex;flex-direction:column;padding-top:2px}`,
  `[${INFO_ATTRIBUTE}]{display:flex;flex-direction:column;position:relative;isolation:isolate}`,
  // The row and its host line read as one block: the row's lower margin goes and their backdrops join
  `${ROW_SELECTOR}{position:relative;isolation:isolate;margin-bottom:0 !important}`,
  `${ROW_SELECTOR}:not([${PROBE_ATTRIBUTE}]){background-color:transparent !important}`,
  `${ROW_SELECTOR}::before,[${INFO_ATTRIBUTE}]::before{content:"";position:absolute;z-index:-1;pointer-events:none;top:0;bottom:0;right:0;background-color:${IDLE_BACKDROP_FILL}}`,
  // Every workspace wears a backdrop over its row and host line, Paseo's full row width: full strength
  // while selected, faint otherwise. The edge runs round the block's outside only: no line where the
  // row meets its host line
  `${ROW_SELECTOR}::before{left:0;border-radius:var(${SELECTED_RADIUS_VARIABLE}) var(${SELECTED_RADIUS_VARIABLE}) 0 0;box-shadow:inset ${IDLE_BACKDROP_EDGE_PX}px ${IDLE_BACKDROP_EDGE_PX}px 0 0 ${IDLE_BACKDROP_EDGE},inset -${IDLE_BACKDROP_EDGE_PX}px 0 0 0 ${IDLE_BACKDROP_EDGE}}`,
  `[${INFO_ATTRIBUTE}]::before{left:0;border-radius:0 0 var(${SELECTED_RADIUS_VARIABLE}) var(${SELECTED_RADIUS_VARIABLE});box-shadow:inset ${IDLE_BACKDROP_EDGE_PX}px -${IDLE_BACKDROP_EDGE_PX}px 0 0 ${IDLE_BACKDROP_EDGE},inset -${IDLE_BACKDROP_EDGE_PX}px 0 0 0 ${IDLE_BACKDROP_EDGE}}`,
  `${ROW_SELECTOR}[aria-selected="true"]::before,[${ITEM_ATTRIBUTE}]:has(${ROW_SELECTOR}[aria-selected="true"]) + [${SLOT_ATTRIBUTE}] > [${INFO_ATTRIBUTE}]::before{background-color:var(${SELECTED_COLOR_VARIABLE});box-shadow:none}`,
  // Sits over the row above; only the buttons take pointer input
  `[${NEW_CHAT_ATTRIBUTE}]{position:absolute;bottom:100%;right:6px;display:flex;flex-direction:row;align-items:flex-start;gap:2px;z-index:2;pointer-events:none;box-sizing:border-box}`,
  // The row's timestamp joins the button bar: same title line, a small gap before "+"
  `[${HAS_NEW_CHAT_ATTRIBUTE}="true"] ${TIMESTAMP_SELECTOR}{margin-right:${TIMESTAMP_GAP_PX}px}`,
  `[${NEW_CHAT_ATTRIBUTE}] > *{pointer-events:auto}`,
  `${BRANCH_TEXT_SELECTOR}{color:${BRANCH_TEXT_COLOR} !important}`,
  `${META_ROW_SELECTOR}{transform:translateY(${META_ROW_SHIFT_PX}px)}`,
  `[${DRAG_MARKER_ATTRIBUTE}]{position:fixed;pointer-events:none;z-index:2147483000;box-sizing:border-box}`,
  `[${DRAG_MARKER_ATTRIBUTE}="zone"]{border-radius:var(${SELECTED_RADIUS_VARIABLE},6px);background-color:color-mix(in srgb,${DRAG_MARKER_TINT} 10%,transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,${DRAG_MARKER_TINT} 45%,transparent)}`,
  `[${DRAG_MARKER_ATTRIBUTE}="line"]{border-radius:1px;background-color:color-mix(in srgb,${DRAG_MARKER_TINT} 80%,transparent)}`,
].join("");
const REACT_PORTAL_TYPE = Symbol.for("react.portal");
const MAX_ROW_CLIMB = 12;

export function findReactRootContainer(): DomElement | null {
  return document.getElementById("root");
}

/** Each engine owns its own style element, so an older engine stopping late cannot remove ours */
export function installStyle(): () => void {
  const style = document.createElement("style");
  style.setAttribute("data-owner", STYLE_ELEMENT_ID);
  style.textContent = STYLE_TEXT;
  document.head.appendChild(style);
  return () => style.remove();
}

export interface WorkspaceRow {
  workspaceKey: string;
  element: DomElement;
  selected: boolean;
}

export function readWorkspaceRows(): WorkspaceRow[] {
  const rows: WorkspaceRow[] = [];
  const elements = document.querySelectorAll(ROW_SELECTOR);
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];
    const testId = element.getAttribute("data-testid") ?? "";
    rows.push({
      workspaceKey: testId.slice(ROW_TEST_ID_PREFIX.length),
      element,
      selected: element.getAttribute("aria-selected") === "true",
    });
  }
  return rows;
}

/** The workspace row element for a key, preferring the project list over the pinned copy */
export function findWorkspaceRow(workspaceKey: string): DomElement | null {
  const elements = document.querySelectorAll(ROW_SELECTOR);
  let found: DomElement | null = null;
  for (let index = 0; index < elements.length; index++) {
    const testId = elements[index].getAttribute("data-testid") ?? "";
    if (testId.slice(ROW_TEST_ID_PREFIX.length) === workspaceKey) found = elements[index];
  }
  return found;
}

/**
 * The outermost ancestor that holds only this row: the list item. Chats go after it, outside
 * the row's hover card and drag handle. A list holding a single row has no marker of its own
 * under manual sorting, so the climb also stops below the project's block and the pinned section.
 */
export function workspaceRowItem(row: DomElement): DomElement {
  let item = row;
  for (let depth = 0; depth < MAX_ROW_CLIMB; depth++) {
    const parent = item.parentElement;
    if (!parent || parent.matches(ROW_LIST_SELECTOR) || parent.matches(PINNED_SECTION_SELECTOR)) break;
    if (parent.querySelectorAll(ROW_SELECTOR).length > 1) break;
    if (parent.querySelector(PROJECT_ROW_SELECTOR)) break;
    item = parent;
  }
  return item;
}

/** The workspace key in a row's test id */
export function rowWorkspaceKey(row: DomElement): string {
  return (row.getAttribute("data-testid") ?? "").slice(ROW_TEST_ID_PREFIX.length);
}

/** The workspace row `target` is in, or null */
export function closestWorkspaceRow(target: DomElement | null): DomElement | null {
  if (!target || typeof target.closest !== "function") return null;
  return target.closest(ROW_SELECTOR);
}

export function isPinnedRow(row: DomElement): boolean {
  return row.closest(PINNED_SECTION_SELECTOR) !== null;
}

/** The rows of a workspace list, in order */
export function listRows(list: DomElement): DomElement[] {
  const rows: DomElement[] = [];
  const elements = list.querySelectorAll(ROW_SELECTOR);
  for (let index = 0; index < elements.length; index++) rows.push(elements[index]);
  return rows;
}

/** The chat container that follows a row's list item, or null */
export function slotAfter(item: DomElement): DomElement | null {
  const next = item.nextSibling;
  return next !== null && typeof next.getAttribute === "function" && next.getAttribute(SLOT_ATTRIBUTE) !== null
    ? next
    : null;
}

/** A workspace's sidebar area that takes a dropped chat: its row and the chat container after it */
export interface ChatDropZone {
  workspaceKey: string;
  /** The workspace's chat rows render here */
  list: DomElement;
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export function chatDropZones(): ChatDropZone[] {
  const zones: ChatDropZone[] = [];
  const slots = document.querySelectorAll(`[${SLOT_ATTRIBUTE}]`);
  for (let index = 0; index < slots.length; index++) {
    const slot = slots[index];
    const list = childWith(slot, LIST_ATTRIBUTE);
    const item = slot.previousElementSibling;
    if (!list || !item || item.getAttribute(ITEM_ATTRIBUTE) === null) continue;
    const itemRect = item.getBoundingClientRect();
    const slotRect = slot.getBoundingClientRect();
    if (itemRect.height === 0 && slotRect.height === 0) continue;
    zones.push({
      workspaceKey: slot.getAttribute(SLOT_KEY_ATTRIBUTE) ?? "",
      list,
      top: Math.min(itemRect.top, slotRect.top),
      bottom: Math.max(itemRect.top + itemRect.height, slotRect.top + slotRect.height),
      left: Math.min(itemRect.left, slotRect.left),
      right: Math.max(itemRect.left + itemRect.width, slotRect.left + slotRect.width),
    });
  }
  return zones;
}

/** The chat row a press on its drag handle (the row's title area) started in, or null */
export function closestChatHandleRow(target: DomElement | null): DomElement | null {
  if (!target || typeof target.closest !== "function") return null;
  if (target.closest("input, textarea")) return null;
  return target.closest(`[${CHAT_HANDLE_ATTRIBUTE}]`)?.closest(`[${CHAT_AGENT_ATTRIBUTE}]`) ?? null;
}

/** The chat list holding a chat row and its workspace key, or null */
export function chatRowList(row: DomElement): { list: DomElement; workspaceKey: string } | null {
  const list = row.parentElement;
  if (!list || list.getAttribute(LIST_ATTRIBUTE) === null) return null;
  const workspaceKey = list.parentElement?.getAttribute(SLOT_KEY_ATTRIBUTE);
  return workspaceKey ? { list, workspaceKey } : null;
}

/** A chat row's place in its list's tree, from the attributes sidebar-chats.tsx renders */
export interface ChatRowInfo {
  element: DomElement;
  agentId: string;
  depth: number;
  /** The row it nests under in this list, or "" for a top-level row */
  parentId: string;
}

export function chatRowsIn(list: DomElement): ChatRowInfo[] {
  const rows: ChatRowInfo[] = [];
  const elements = list.querySelectorAll(`:scope > [${CHAT_AGENT_ATTRIBUTE}]`);
  for (let index = 0; index < elements.length; index++) {
    const element = elements[index];
    rows.push({
      element,
      agentId: element.getAttribute(CHAT_AGENT_ATTRIBUTE) ?? "",
      depth: Number(element.getAttribute(CHAT_DEPTH_ATTRIBUTE) ?? 0),
      parentId: element.getAttribute(CHAT_PARENT_ATTRIBUTE) ?? "",
    });
  }
  return rows;
}

/**
 * Raises every stacking context `element` sits in above its siblings, so a row dragged out of
 * its project's block draws over the blocks after it (each project's drag item has its own
 * z-index). Returns the function that puts the z-indexes back.
 */
export function liftStackingContexts(element: DomElement): () => void {
  const lifted: [DomElement, string][] = [];
  for (let ancestor = element.parentElement; ancestor && ancestor !== document.body; ancestor = ancestor.parentElement) {
    if (window.getComputedStyle(ancestor).zIndex === "auto") continue;
    lifted.push([ancestor, ancestor.style.getPropertyValue("z-index")]);
    ancestor.style.setProperty("z-index", LIFTED_Z_INDEX);
  }
  return () => {
    for (const [ancestor, zIndex] of lifted) {
      if (zIndex) ancestor.style.setProperty("z-index", zIndex);
      else ancestor.style.removeProperty("z-index");
    }
  };
}

/** A fixed box over the page, for drag feedback outside React's trees */
export interface DragMarker {
  /** Shows the box there, or hides it for null */
  place(box: { top: number; left: number; width: number; height: number } | null): void;
  remove(): void;
}

export function createDragMarker(look: string): DragMarker {
  const marker = document.createElement("div");
  marker.setAttribute(DRAG_MARKER_ATTRIBUTE, look);
  marker.style.setProperty("display", "none");
  document.body.appendChild(marker);
  return {
    place(box) {
      if (!box) {
        marker.style.setProperty("display", "none");
        return;
      }
      marker.style.setProperty("display", "block");
      marker.style.setProperty("top", `${box.top}px`);
      marker.style.setProperty("left", `${box.left}px`);
      marker.style.setProperty("width", `${box.width}px`);
      marker.style.setProperty("height", `${box.height}px`);
    },
    remove: () => marker.remove(),
  };
}

/** A project's header row, by view key */
export function findProjectRow(viewKey: string): DomElement | null {
  const rows = document.querySelectorAll(PROJECT_ROW_SELECTOR);
  for (let index = 0; index < rows.length; index++) {
    if (rows[index].getAttribute("data-testid") === `${PROJECT_ROW_PREFIX}${viewKey}`) return rows[index];
  }
  return null;
}

/** Marks a workspace list while one of its rows is dragged, and the document for the whole gesture */
export function setListDragging(list: DomElement, on: boolean): void {
  setFlag(list, LIST_DRAGGING_ATTRIBUTE, on);
}

export function setDragGesture(on: boolean): void {
  setFlag(document.documentElement, DRAG_GESTURE_ATTRIBUTE, on);
}

let nextSlotId = 1;

export interface PlacedSlot {
  id: string;
  /** Removal unit, right after the row's list item */
  wrapper: DomElement;
  /** The host line renders here, its backdrop joined to the row's */
  info: DomElement;
  /** Chat rows render here */
  list: DomElement;
  /** Row buttons render here, drawn over the row's right edge */
  overlay: DomElement;
}

function childWith(parent: DomElement, attribute: string): DomElement | null {
  return parent.querySelector(`:scope > [${attribute}]`);
}

/**
 * Keeps one container right after each row's list item. Its overlay draws the row buttons on
 * top of the row while staying outside the row's DOM, so presses never reach the row's own
 * press, drag, or focus handling.
 */
export function placeSlot(row: DomElement, workspaceKey: string): PlacedSlot | null {
  const item = workspaceRowItem(row);
  const parent = item.parentElement;
  if (!parent) return null;
  if (item.getAttribute(ITEM_ATTRIBUTE) === null) item.setAttribute(ITEM_ATTRIBUTE, "true");
  // The row's container reserves room for the buttons and is where hover is suppressed
  const zone = row.parentElement;
  if (zone && zone.getAttribute(HAS_NEW_CHAT_ATTRIBUTE) === null) zone.setAttribute(HAS_NEW_CHAT_ATTRIBUTE, "true");
  const next = item.nextSibling;
  // Text nodes have no getAttribute
  const isOwnSlot =
    next !== null &&
    typeof next.getAttribute === "function" &&
    next.getAttribute(SLOT_ATTRIBUTE) !== null &&
    next.getAttribute(SLOT_KEY_ATTRIBUTE) === workspaceKey;
  let wrapper = isOwnSlot ? next : null;
  // A reorder moves the list items but not the plugin's containers; one left behind moves back
  // after its item, so its chats stay mounted
  const siblings = wrapper ? null : parent.querySelectorAll(`:scope > [${SLOT_ATTRIBUTE}]`);
  for (let index = 0; siblings && index < siblings.length; index++) {
    if (siblings[index].getAttribute(SLOT_KEY_ATTRIBUTE) !== workspaceKey) continue;
    wrapper = siblings[index];
    parent.insertBefore(wrapper, next);
    break;
  }
  if (!wrapper) {
    wrapper = document.createElement("div");
    wrapper.setAttribute(SLOT_ATTRIBUTE, String(nextSlotId++));
    wrapper.setAttribute(SLOT_KEY_ATTRIBUTE, workspaceKey);
    const overlay = document.createElement("div");
    overlay.setAttribute(NEW_CHAT_ATTRIBUTE, "true");
    const info = document.createElement("div");
    info.setAttribute(INFO_ATTRIBUTE, "true");
    const list = document.createElement("div");
    list.setAttribute(LIST_ATTRIBUTE, "true");
    wrapper.appendChild(overlay);
    wrapper.appendChild(info);
    wrapper.appendChild(list);
    parent.insertBefore(wrapper, next);
  }
  const overlay = childWith(wrapper, NEW_CHAT_ATTRIBUTE);
  const info = childWith(wrapper, INFO_ATTRIBUTE);
  const list = childWith(wrapper, LIST_ATTRIBUTE);
  if (!overlay || !info || !list) return null;
  const itemRect = item.getBoundingClientRect();
  const height = `${itemRect.height}px`;
  if (overlay.style.height !== height) overlay.style.height = height;
  // Centre the buttons on the title line rather than the whole row
  const titleTop =
    row.getBoundingClientRect().top - itemRect.top + (Number.parseFloat(window.getComputedStyle(row).paddingTop) || 0);
  const paddingTop = `${Math.max(0, titleTop + (TITLE_LINE_HEIGHT_PX - BAR_BUTTON_SIZE_PX) / 2)}px`;
  if (overlay.style.paddingTop !== paddingTop) overlay.style.paddingTop = paddingTop;
  return { id: wrapper.getAttribute(SLOT_ATTRIBUTE) ?? "", wrapper, info, list, overlay };
}

export interface RowBackdrop {
  color: string;
  radius: string;
}

/**
 * The selected row's own background and corner radius, read past the plugin's override, for the
 * workspace and current chat backdrops to wear
 */
export function readRowBackdrop(row: DomElement): RowBackdrop {
  row.setAttribute(PROBE_ATTRIBUTE, "true");
  const computed = window.getComputedStyle(row);
  const backdrop = { color: computed.backgroundColor, radius: computed.borderTopLeftRadius };
  row.removeAttribute(PROBE_ATTRIBUTE);
  return backdrop;
}

/** Publishes the selected workspace row's backdrop for the current chat rule */
export function setSelectedBackdrop(backdrop: RowBackdrop): void {
  const style = document.documentElement.style;
  style.setProperty(SELECTED_COLOR_VARIABLE, backdrop.color);
  style.setProperty(SELECTED_RADIUS_VARIABLE, backdrop.radius);
}

/** Where the current chat's backdrop starts, in px from the left of its chat list */
export function setCurrentChatInset(px: number): void {
  document.documentElement.style.setProperty(CURRENT_CHAT_INSET_VARIABLE, `${px}px`);
}

/** Marks the row of `agentId` inside a chat list as current and unmarks the others */
export function markCurrentChat(list: DomElement, agentId: string | null): void {
  const rows = list.querySelectorAll(`[${CHAT_AGENT_ATTRIBUTE}]`);
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const current = agentId !== null && row.getAttribute(CHAT_AGENT_ATTRIBUTE) === agentId;
    if (current && row.getAttribute(CURRENT_CHAT_ATTRIBUTE) !== "true") row.setAttribute(CURRENT_CHAT_ATTRIBUTE, "true");
    else if (!current && row.getAttribute(CURRENT_CHAT_ATTRIBUTE) !== null) row.removeAttribute(CURRENT_CHAT_ATTRIBUTE);
  }
}

/** Horizontal centre of a status glyph without its CSS shift, from the left of `reference` */
function glyphSlotCenter(glyph: DomElement, reference: DomElement): number | null {
  const glyphRect = glyph.getBoundingClientRect();
  if (glyphRect.width === 0) return null;
  // matrix(a, b, c, d, tx, ty): take the shift back out
  const shift = Number(window.getComputedStyle(glyph).transform.match(/^matrix\((?:[^,]*,){4}\s*([-\d.e]+)/)?.[1] ?? 0);
  return glyphRect.left + glyphRect.width / 2 - shift - reference.getBoundingClientRect().left;
}

/** Horizontal centre of the row's status glyph slot, measured from the left of `reference` */
export function measureRowGlyphCenter(row: DomElement, reference: DomElement): number | null {
  const glyph = row.querySelector(WORKSPACE_STATUS_SELECTOR);
  return glyph ? glyphSlotCenter(glyph, reference) : null;
}

/** Removes chat containers that no longer follow a workspace row */
export function removeStaleSlots(live: ReadonlySet<DomElement>): void {
  const slots = document.querySelectorAll(`[${SLOT_ATTRIBUTE}]`);
  for (let index = 0; index < slots.length; index++) {
    if (!live.has(slots[index])) slots[index].remove();
  }
}

export interface ProjectList {
  viewKey: string;
  /** The parent of the project's workspace list items */
  list: DomElement;
  projectRow: DomElement;
}

/**
 * Each expanded project's workspace list with its project row, under either sort: the list is
 * the parent of the project's row items, and its project the one project row in the nearest
 * ancestor that holds any. Marks each list for the block spacing rule and unmarks the rest.
 */
export function findProjectLists(): ProjectList[] {
  const found: ProjectList[] = [];
  const seen = new Set<DomElement>();
  const rows = document.querySelectorAll(ROW_SELECTOR);
  for (let index = 0; index < rows.length; index++) {
    if (isPinnedRow(rows[index])) continue;
    const list = workspaceRowItem(rows[index]).parentElement;
    if (!list || seen.has(list)) continue;
    seen.add(list);
    let projectRow: DomElement | null = null;
    for (let block: DomElement | null = list; block; block = block.parentElement) {
      const projectRows = block.querySelectorAll(PROJECT_ROW_SELECTOR);
      if (projectRows.length === 0) continue;
      if (projectRows.length === 1) projectRow = projectRows[0];
      break;
    }
    if (!projectRow) continue;
    if (list.getAttribute(WORKSPACE_LIST_ATTRIBUTE) === null) list.setAttribute(WORKSPACE_LIST_ATTRIBUTE, "true");
    const viewKey = (projectRow.getAttribute("data-testid") ?? "").slice(PROJECT_ROW_PREFIX.length);
    found.push({ viewKey, list, projectRow });
  }
  unmarkOthers(WORKSPACE_LIST_ATTRIBUTE, new Set(found.map(({ list }) => list)));
  return found;
}

/**
 * Removes `attribute` from every element carrying it except `keep`. A list can outlive its rows:
 * a project's lone workspace makes the project's own block its list under the manual sort
 * (workspaceRowItem), and that block stays when the project collapses, so a mark left on it
 * would keep drawing the old rail and spacing.
 */
function unmarkOthers(attribute: string, keep: ReadonlySet<DomElement>): void {
  const marked = document.querySelectorAll(`[${attribute}]`);
  for (let index = 0; index < marked.length; index++) {
    if (!keep.has(marked[index])) marked[index].removeAttribute(attribute);
  }
}

/**
 * Joins each expanded project's workspace list to its project icon with a rail: the list's
 * ::before, placed by variables measured here from the icon's slot (project-leading-visual.tsx)
 * and colored from the project title. Lists without a matching project row lose the rail, as
 * does every element that is no longer a list.
 */
export function syncProjectRails(): void {
  const blocks = new Set<DomElement>();
  const railed = new Set<DomElement>();
  for (const { list, projectRow } of findProjectLists()) {
    // The block is the nearest element holding both the project's header and its list: the list
    // itself when it holds the header
    let block: DomElement | null = list;
    while (block && !block.contains(projectRow)) block = block.parentElement;
    if (block) {
      blocks.add(block);
      if (block.getAttribute(PROJECT_BLOCK_ATTRIBUTE) === null) block.setAttribute(PROJECT_BLOCK_ATTRIBUTE, "true");
    }
    // The row's first child is its left group, whose first child is the icon slot
    const slot = projectRow.firstElementChild?.firstElementChild;
    // The title, after the icon slot: the icon's own letter is text too, and hover swaps it for a chevron
    const title = projectRow.firstElementChild?.lastElementChild?.querySelector('[dir="auto"]');
    const slotRect = slot?.getBoundingClientRect();
    if (!slotRect || slotRect.width === 0 || !title) continue;
    railed.add(list);
    const listRect = list.getBoundingClientRect();
    // Quarter-pixel steps keep the key stable against sub-pixel layout jitter
    const quarter = (value: number) => Math.round(value * 4) / 4;
    const x = quarter(slotRect.left + slotRect.width / 2 - listRect.left);
    const railTop = quarter(slotRect.top + slotRect.height + RAIL_ICON_GAP_PX - listRect.top);
    const railBottom = quarter(lastRowMiddle(list) ?? listRect.height - RAIL_END_PX);
    const color = window.getComputedStyle(title).color;
    // The workspace status dots shift onto the rail's centre
    const glyph = list.querySelector(WORKSPACE_STATUS_SELECTOR);
    const glyphCenter = glyph ? glyphSlotCenter(glyph, list) : null;
    const shift = glyphCenter === null ? STATUS_NUDGE_PX : quarter(x - glyphCenter);
    const ringCenters: number[] = [];
    const glyphs = list.querySelectorAll(WORKSPACE_STATUS_SELECTOR);
    for (let glyphIndex = 0; glyphIndex < glyphs.length; glyphIndex++) {
      const rect = glyphs[glyphIndex].getBoundingClientRect();
      if (rect.height > 0) ringCenters.push(quarter(rect.top + rect.height / 2 - listRect.top));
    }
    const drawing = drawRail(x, railTop, railBottom, ringCenters);
    const key = `${x}|${railTop}|${railBottom}|${color}|${shift}|${ringCenters.join(",")}`;
    if (list.getAttribute(RAIL_ATTRIBUTE) === key) continue;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.width}" height="${drawing.height}" ` +
      `viewBox="0 ${drawing.top} ${drawing.width} ${drawing.height}">` +
      `<path d="${drawing.path}" fill="none" stroke="#000" ` +
      `stroke-width="${RAIL_STROKE_PX}" stroke-linejoin="round" shape-rendering="geometricPrecision"/></svg>`;
    list.style.setProperty(RAIL_IMAGE_VARIABLE, `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
    list.style.setProperty(RAIL_COLOR_VARIABLE, `color-mix(in srgb, ${color} ${RAIL_OPACITY_PERCENT}%, transparent)`);
    list.style.setProperty(RAIL_HOVER_COLOR_VARIABLE, `color-mix(in srgb, ${color} ${RAIL_HOVER_OPACITY_PERCENT}%, transparent)`);
    list.style.setProperty(RAIL_BOX_TOP_VARIABLE, `${drawing.top}px`);
    list.style.setProperty(RAIL_BOX_WIDTH_VARIABLE, `${drawing.width}px`);
    list.style.setProperty(RAIL_BOX_HEIGHT_VARIABLE, `${drawing.height}px`);
    list.style.setProperty(STATUS_SHIFT_VARIABLE, `${shift}px`);
    list.setAttribute(RAIL_ATTRIBUTE, key);
  }
  unmarkOthers(PROJECT_BLOCK_ATTRIBUTE, blocks);
  unmarkOthers(RAIL_ATTRIBUTE, railed);
}

/**
 * Middle of the last row the list shows, from its top: the last workspace's last chat or archived
 * entry, or its host line while its chats are collapsed
 */
function lastRowMiddle(list: DomElement): number | null {
  const slots = list.querySelectorAll(`[${SLOT_ATTRIBUTE}]`);
  const slot = slots.length > 0 ? slots[slots.length - 1] : null;
  if (!slot) return null;
  for (const attribute of [LIST_ATTRIBUTE, INFO_ATTRIBUTE]) {
    const row = childWith(slot, attribute)?.lastElementChild;
    const rect = row?.getBoundingClientRect();
    if (rect && rect.height > 0) return rect.top + rect.height / 2 - list.getBoundingClientRect().top;
  }
  return null;
}

/**
 * The rail as one SVG path in list coordinates: down from `top` at `x`, opening into top and
 * bottom arcs around each ring centre, then a rounded turn right at `bottom`. Returns the path
 * with the box (from the list's left edge) that holds it.
 */
function drawRail(
  x: number,
  top: number,
  bottom: number,
  ringCenters: readonly number[],
): { path: string; top: number; width: number; height: number } {
  // The stroke's centre line sits half a stroke inside the ring's outer edge
  const radius = STATUS_RING_RADIUS_PX - RAIL_STROKE_PX / 2;
  const angle = (STATUS_RING_ARC_HALF_ANGLE_DEG * Math.PI) / 180;
  const dx = radius * Math.sin(angle);
  const dy = radius * Math.cos(angle);
  const n = (value: number) => Number(value.toFixed(3));
  const parts: string[] = [];
  let from = top;
  for (const cy of [...ringCenters].sort((a, b) => a - b)) {
    if (cy + radius > bottom - RAIL_RADIUS_PX) break;
    // Rail down to the ring's top, the top arc, then on from the ring's bottom with its arc
    if (cy - radius > from) parts.push(`M${n(x)} ${n(from)}V${n(cy - radius)}`);
    parts.push(`M${n(x - dx)} ${n(cy - dy)}A${n(radius)} ${n(radius)} 0 0 1 ${n(x + dx)} ${n(cy - dy)}`);
    parts.push(`M${n(x + dx)} ${n(cy + dy)}A${n(radius)} ${n(radius)} 0 0 1 ${n(x - dx)} ${n(cy + dy)}`);
    from = Math.max(from, cy + radius);
  }
  parts.push(
    `M${n(x)} ${n(from)}V${n(bottom - RAIL_RADIUS_PX)}` +
      `Q${n(x)} ${n(bottom)} ${n(x + RAIL_RADIUS_PX)} ${n(bottom)}H${n(x + RAIL_ARM_PX)}`,
  );
  const boxTop = Math.floor(Math.min(top, ...ringCenters.map((cy) => cy - STATUS_RING_RADIUS_PX)) - RAIL_BOX_PAD_PX);
  const boxBottom = Math.ceil(bottom + RAIL_BOX_PAD_PX);
  const width = Math.ceil(x + Math.max(RAIL_ARM_PX, STATUS_RING_RADIUS_PX) + RAIL_BOX_PAD_PX);
  return { path: parts.join(""), top: boxTop, width, height: boxBottom - boxTop };
}

export function removeAllSlots(): void {
  removeStaleSlots(new Set());
  for (const attribute of [
    HAS_NEW_CHAT_ATTRIBUTE,
    ITEM_ATTRIBUTE,
    RAIL_ATTRIBUTE,
    PROJECT_BLOCK_ATTRIBUTE,
    WORKSPACE_LIST_ATTRIBUTE,
    LIST_DRAGGING_ATTRIBUTE,
    DRAG_GESTURE_ATTRIBUTE,
  ]) {
    const hosts = document.querySelectorAll(`[${attribute}]`);
    for (let index = 0; index < hosts.length; index++) hosts[index].removeAttribute(attribute);
  }
}

/**
 * Hides the tab strip items whose chip identity is in `hidden` or is a chat, shows the rest, pins
 * `pinned` chats visible and left-most, and widens the chips of `chats`
 */
export function applyTabVisibility(
  hidden: ReadonlySet<string>,
  pinned: ReadonlySet<string>,
  chats: ReadonlySet<string>,
): void {
  const scrolls = document.querySelectorAll(TAB_SCROLL_SELECTOR);
  for (let scrollIndex = 0; scrollIndex < scrolls.length; scrollIndex++) {
    const content = scrolls[scrollIndex].firstElementChild;
    if (!content) continue;
    const handled = new Set<DomElement>();
    let hasWide = false;
    const chips = content.querySelectorAll(`[data-testid^="${TAB_TEST_ID_PREFIX}"]`);
    for (let index = 0; index < chips.length; index++) {
      const chip = chips[index];
      let item = chip;
      while (item.parentElement && item.parentElement !== content) item = item.parentElement;
      // Document order visits the chip before its own descendants that share the prefix
      if (handled.has(item)) continue;
      handled.add(item);
      const identity = (chip.getAttribute("data-testid") ?? "").slice(TAB_TEST_ID_PREFIX.length);
      const isPinned = pinned.has(identity);
      const isChat = chats.has(identity) || CHAT_IDENTITY_PREFIXES.some((prefix) => identity.startsWith(prefix));
      const isHidden = !isPinned && (isChat || hidden.has(identity));
      const isWide = isChat && !isHidden;
      hasWide ||= isWide;
      setFlag(item, HIDDEN_ATTRIBUTE, isHidden);
      setFlag(item, PINNED_ATTRIBUTE, isPinned);
      setFlag(item, WIDE_ITEM_ATTRIBUTE, isWide);
      setFlag(chip, WIDE_CHIP_ATTRIBUTE, isWide);
    }
    setFlag(content, WIDE_ROW_ATTRIBUTE, hasWide);
  }
}

function setFlag(element: DomElement, attribute: string, on: boolean): void {
  if (on) element.setAttribute(attribute, "true");
  else if (element.getAttribute(attribute) !== null) element.removeAttribute(attribute);
}

export function clearTabVisibility(): void {
  for (const attribute of [HIDDEN_ATTRIBUTE, PINNED_ATTRIBUTE, WIDE_CHIP_ATTRIBUTE, WIDE_ITEM_ATTRIBUTE, WIDE_ROW_ATTRIBUTE]) {
    const items = document.querySelectorAll(`[${attribute}]`);
    for (let index = 0; index < items.length; index++) items[index].removeAttribute(attribute);
  }
}

function isOwnNode(node: DomElement | null | undefined): boolean {
  if (!node || typeof node.closest !== "function") return false;
  return node.closest(`[${SLOT_ATTRIBUTE}]`) !== null;
}

/**
 * Calls `onChange` for DOM changes outside the plugin's own containers. Mutation callbacks run
 * before the browser paints, so an urgent change handled synchronously shows in the same frame.
 */
export function observeDom(
  onChange: (urgent: boolean) => void,
  onOwnRender: () => void,
  onOwnLayout: () => void,
): () => void {
  const observer = new MutationObserver((records) => {
    let changed = false;
    let ownRendered = false;
    let ownLaidOut = false;
    for (let index = 0; index < records.length; index++) {
      const record = records[index];
      // React rendering inside the plugin's containers, such as a newly mounted chat row
      if (record.type === "childList" && isOwnNode(record.target)) {
        if (record.addedNodes.length > 0) ownRendered = true;
        // Chats mounting or unmounting (collapse, archived lists) change the rail's length
        ownLaidOut = true;
      }
      // A workspace row changing selection repaints its joined backdrop in this same frame
      if (record.type === "attributes" && record.target.matches(ROW_SELECTOR)) {
        onChange(true);
        return;
      }
      if (changed || isOwnNode(record.target)) continue;
      if (onlyOwnNodes(record.addedNodes) && onlyOwnNodes(record.removedNodes)) {
        // A childList record always moves at least one node; an attribute record moves none
        if (record.addedNodes.length + record.removedNodes.length > 0) continue;
      }
      changed = true;
    }
    if (ownRendered) onOwnRender();
    if (ownLaidOut) onOwnLayout();
    if (changed) onChange(false);
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["aria-selected"],
  });
  return () => observer.disconnect();
}

function onlyOwnNodes(nodes: ArrayLike<DomElement>): boolean {
  for (let index = 0; index < nodes.length; index++) {
    if (!isOwnNode(nodes[index])) return false;
  }
  return true;
}

function inHoverZone(node: DomElement | null): boolean {
  return Boolean(node && typeof node.closest === "function" && node.closest(HOVER_ZONE_SELECTOR));
}

/**
 * Keeps hover out of workspace rows: no highlight, no hover-only kebab, no hover card. Events
 * that enter a row stop at the window in the capture phase, before React and the row's own
 * listeners. Leaving other UI for a row still delivers that UI's leave, replayed as
 * leaving the window, so plugin chat rows do not stay highlighted.
 */
export function suppressRowHover(): () => void {
  const replays = new WeakSet<DomEvent>();
  const onEnter = (event: DomEvent) => {
    if (inHoverZone(event.target)) event.stopImmediatePropagation();
  };
  const onOver = (event: DomEvent) => {
    if (inHoverZone(event.target)) event.stopImmediatePropagation();
  };
  const onOut = (event: DomEvent) => {
    if (replays.has(event)) return;
    // Only entering a row matters; leaving one also delivers the enter of whatever is next,
    // such as the row buttons drawn over it
    if (!inHoverZone(event.relatedTarget)) return;
    event.stopImmediatePropagation();
    if (inHoverZone(event.target) || !event.target) return;
    const source = event as unknown as DomPointerEventInit;
    const Constructor = event.type === "pointerout" ? PointerEvent : MouseEvent;
    const replay = new Constructor(event.type, { ...pick(source), relatedTarget: null });
    replays.add(replay);
    event.target.dispatchEvent(replay);
  };
  for (const type of ENTER_EVENTS) window.addEventListener(type, onEnter, true);
  for (const type of OVER_EVENTS) window.addEventListener(type, onOver, true);
  for (const type of OUT_EVENTS) window.addEventListener(type, onOut, true);
  return () => {
    for (const type of ENTER_EVENTS) window.removeEventListener(type, onEnter, true);
    for (const type of OVER_EVENTS) window.removeEventListener(type, onOver, true);
    for (const type of OUT_EVENTS) window.removeEventListener(type, onOut, true);
  };
}

function pick(source: DomPointerEventInit): Omit<DomPointerEventInit, "relatedTarget"> {
  return {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: source.clientX,
    clientY: source.clientY,
    screenX: source.screenX,
    screenY: source.screenY,
    pointerId: source.pointerId,
    pointerType: source.pointerType,
    isPrimary: source.isPrimary,
    button: source.button,
    buttons: source.buttons,
  };
}

/** Opens the workspace row's own context menu at a viewport point */
export function openRowContextMenu(workspaceKey: string, clientX: number, clientY: number): boolean {
  const row = findWorkspaceRow(workspaceKey);
  if (!row) return false;
  row.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      button: 2,
      buttons: 2,
      relatedTarget: null,
    }),
  );
  return true;
}

/**
 * Presses the workspace row as a left click would. React Native Web fires a Pressable's onPress
 * from the browser's click event, so a dispatched click selects the workspace.
 */
export function pressWorkspaceRow(workspaceKey: string): boolean {
  const row = findWorkspaceRow(workspaceKey);
  if (!row) return false;
  const rect = row.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  row.dispatchEvent(
    new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
      screenX: clientX,
      screenY: clientY,
      button: 0,
      buttons: 0,
      relatedTarget: null,
    }),
  );
  return true;
}

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage full or disabled: ownership falls back to this session only
  }
}

interface DomAnimation {
  startTime: number | null;
  cancel(): void;
}
interface DomAnimatable {
  animate(keyframes: Record<string, string[]>, options: Record<string, unknown>): DomAnimation;
}

/** Period and shared timeline of the app's running ring (components/status-ring/geometry.ts) */
const SPIN_PERIOD_MS = 900;
const SPIN_KEYFRAMES = { transform: ["rotate(0deg)", "rotate(360deg)"] };
const SPIN_TIMING = { duration: SPIN_PERIOD_MS, easing: "linear", iterations: Number.POSITIVE_INFINITY };

/**
 * Rotates a React Native Web view forever on the document timeline's zero start, so every ring
 * turns in step with the app's own. Returns the stop function.
 */
export function spinForever(view: unknown): () => void {
  const element = view as Partial<DomAnimatable> | null;
  if (!element || typeof element.animate !== "function") return () => {};
  const animation = element.animate(SPIN_KEYFRAMES, SPIN_TIMING);
  animation.startTime = 0;
  return () => animation.cancel();
}

/** react-dom's createPortal result; the host bundle offers plugins no react-dom import */
export function createDomPortal(children: ReactNode, container: DomElement, key: string): ReactNode {
  return {
    $$typeof: REACT_PORTAL_TYPE,
    key,
    children,
    containerInfo: container,
    implementation: null,
  } as unknown as ReactNode;
}
