// NOTE: App-internal. Drags a workspace row to reorder it within its project, the way Paseo
// drags projects; past the project's first or last row the gesture becomes a drag of the whole
// project. Paseo 0.14 drags workspace rows only under the manual sort, its nested dnd-kit lists
// cannot pass a drag from a workspace to its project, and the plugin's chat containers sit
// between the rows outside dnd-kit's items. So this module moves the rows itself on web, writes
// the order through the project block's own `onWorkspaceReorder` (sidebar-workspace-list.tsx
// ProjectBlock), and starts the project drag by pressing the project row for dnd-kit's
// MouseSensor (draggable-list.web.tsx).
import { sidebarViewStore } from "./app-stores";
import { findAncestorProps } from "./fiber";
import { displacement, dropIndex, moveIndex, placeDragged } from "./workspace-order";
import {
  closestWorkspaceRow,
  type DomElement,
  findProjectRow,
  isPinnedRow,
  listRows,
  rowWorkspaceKey,
  setDragGesture,
  setListDragging,
  slotAfter,
  workspaceRowItem,
} from "./web";

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface DomInputEvent {
  readonly target: DomElement | null;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly isPrimary: boolean;
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly key: string;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
}
interface DomMouseEventInit {
  bubbles: boolean;
  cancelable: boolean;
  composed: boolean;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  button: number;
  buttons: number;
}
declare const window: {
  addEventListener(type: string, listener: (event: DomInputEvent) => void, capture: boolean): void;
  removeEventListener(type: string, listener: (event: DomInputEvent) => void, capture: boolean): void;
};
declare const document: { dispatchEvent(event: unknown): boolean };
declare const MouseEvent: new (type: string, init: DomMouseEventInit) => unknown;
declare function requestAnimationFrame(callback: () => void): number;
declare function getSelection(): { removeAllRanges(): void } | null;

/** sidebar-workspace-list.tsx SidebarWorkspacePlacement, as far as reordering reads it */
interface Placement {
  workspaceKey: string;
}
/** sidebar-workspace-list.tsx ProjectBlock props */
interface ProjectBlockProps {
  project: { viewKey: string; workspaces: readonly Placement[] };
  onWorkspaceReorder(projectViewKey: string, workspaces: Placement[]): void;
}

/** Paseo's drag lists start a mouse drag after this much movement (draggable-list.web.tsx) */
const ACTIVATION_DISTANCE_PX = 6;
/** The replayed project press starts this far behind the pointer, past the activation distance */
const HANDOFF_DISTANCE_PX = 8;
/** dnd-kit sortable's default for rows making room */
const SHIFT_TRANSITION = "transform 200ms ease";
/** The dragged row's look in Paseo's drag lists (draggable-list.web.tsx) */
const DRAGGED_Z_INDEX = "1000";
const DRAGGED_OPACITY = "0.9";
/** Inline styles the drag sets, restored afterwards; transition last so the snap back is instant */
const STYLE_PROPERTIES = ["transform", "z-index", "opacity", "transition"] as const;
type SavedStyle = Record<(typeof STYLE_PROPERTIES)[number], string>;

/** A workspace row's list item and its chat container, which move together */
interface Unit {
  key: string;
  elements: DomElement[];
  top: number;
  bottom: number;
}

interface Pending {
  pointerId: number;
  startX: number;
  startY: number;
  row: DomElement;
  list: DomElement;
}

interface Active extends Pending {
  units: Unit[];
  middles: number[];
  from: number;
  to: number;
  /** The list's top when the drag began; the sidebar may scroll under the drag */
  listTop: number;
  saved: Map<DomElement, SavedStyle>;
}

function isProjectBlockProps(props: Record<string, unknown>): boolean {
  const project = props.project as Record<string, unknown> | null | undefined;
  return (
    typeof props.onWorkspaceReorder === "function" &&
    typeof project === "object" &&
    project !== null &&
    typeof project.viewKey === "string" &&
    Array.isArray(project.workspaces)
  );
}

function projectBlockProps(list: DomElement): ProjectBlockProps | null {
  return findAncestorProps(list, isProjectBlockProps) as ProjectBlockProps | null;
}

function measureUnits(list: DomElement): Unit[] {
  const units: Unit[] = [];
  for (const row of listRows(list)) {
    const item = workspaceRowItem(row);
    if (item.parentElement !== list) continue;
    const slot = slotAfter(item);
    const top = item.getBoundingClientRect().top;
    const last = (slot ?? item).getBoundingClientRect();
    units.push({ key: rowWorkspaceKey(row), elements: slot ? [item, slot] : [item], top, bottom: last.top + last.height });
  }
  return units;
}

/** Sets an inline style, or removes it for an empty value */
function setStyle(element: DomElement, name: string, value: string): void {
  if (value) element.style.setProperty(name, value);
  else element.style.removeProperty(name);
}

/**
 * Starts the workspace drag on web. `onReordered` runs once React has applied a drop, so the
 * chat containers can follow their rows. Returns the uninstaller.
 */
export function installWorkspaceDrag(onReordered: () => void): () => void {
  let pending: Pending | null = null;
  let active: Active | null = null;
  /**
   * The gesture left this module, handed to Paseo's project drag or cancelled with Escape, and
   * lasts until the pointer is released
   */
  let spent = false;
  let suppressClick = false;

  const restore = (drag: Active) => {
    for (const [element, values] of drag.saved) {
      element.style.setProperty("transition", "none");
      for (const name of STYLE_PROPERTIES) {
        // Lay out the restored position before the row's own transition returns
        if (name === "transition") element.getBoundingClientRect();
        setStyle(element, name, values[name]);
      }
    }
    setListDragging(drag.list, false);
  };

  const finish = () => {
    if (active) restore(active);
    active = null;
    pending = null;
    spent = false;
    setDragGesture(false);
  };

  const begin = (start: Pending, event: DomInputEvent) => {
    const units = measureUnits(start.list);
    const from = units.findIndex((unit) => unit.key === rowWorkspaceKey(start.row));
    if (from < 0) {
      pending = null;
      return;
    }
    const saved = new Map<DomElement, SavedStyle>();
    for (const [index, unit] of units.entries()) {
      for (const element of unit.elements) {
        const values = {} as SavedStyle;
        for (const name of STYLE_PROPERTIES) values[name] = element.style.getPropertyValue(name);
        saved.set(element, values);
        if (index === from) {
          element.style.setProperty("transition", "none");
          element.style.setProperty("z-index", DRAGGED_Z_INDEX);
          element.style.setProperty("opacity", DRAGGED_OPACITY);
        } else {
          element.style.setProperty("transition", SHIFT_TRANSITION);
        }
      }
    }
    active = {
      ...start,
      units,
      middles: units.map((unit) => (unit.top + unit.bottom) / 2),
      from,
      to: from,
      listTop: start.list.getBoundingClientRect().top,
      saved,
    };
    pending = null;
    setDragGesture(true);
    setListDragging(start.list, true);
    getSelection()?.removeAllRanges();
    move(active, event);
  };

  /** Ends the row drag and presses the project row so dnd-kit drags the project from here on */
  const handOff = (drag: Active, event: DomInputEvent, direction: number) => {
    const viewKey = projectBlockProps(drag.list)?.project.viewKey;
    restore(drag);
    active = null;
    spent = true;
    const projectRow = viewKey === undefined ? null : findProjectRow(viewKey);
    if (!projectRow) return;
    const init: DomMouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: event.clientX,
      clientY: event.clientY - direction * HANDOFF_DISTANCE_PX,
      screenX: event.clientX,
      screenY: event.clientY - direction * HANDOFF_DISTANCE_PX,
      button: 0,
      buttons: 1,
    };
    projectRow.dispatchEvent(new MouseEvent("mousedown", init) as never);
    // MouseSensor listens on the document; this move passes its activation distance
    document.dispatchEvent(new MouseEvent("mousemove", { ...init, clientY: event.clientY, screenY: event.clientY }));
  };

  const move = (drag: Active, event: DomInputEvent) => {
    // In the coordinates the rows were measured in
    const y = event.clientY - (drag.list.getBoundingClientRect().top - drag.listTop);
    const first = drag.units[0];
    const last = drag.units[drag.units.length - 1];
    if (y < first.top || y > last.bottom) {
      handOff(drag, event, y < first.top ? -1 : 1);
      return;
    }
    const delta = y - drag.startY;
    const dragged = drag.units[drag.from];
    const height = dragged.bottom - dragged.top;
    drag.to = dropIndex(drag.middles, drag.from, dragged.top + delta, dragged.bottom + delta);
    for (const [index, unit] of drag.units.entries()) {
      const offset = index === drag.from ? delta : displacement(index, drag.from, drag.to, height);
      const transform = offset === 0 ? "" : `translate3d(0px, ${offset}px, 0px)`;
      for (const element of unit.elements) setStyle(element, "transform", transform);
    }
  };

  const drop = (drag: Active) => {
    restore(drag);
    active = null;
    if (drag.to === drag.from) return;
    const props = projectBlockProps(drag.list);
    if (!props) return;
    const dragged = drag.units[drag.from].key;
    const visible = moveIndex(
      drag.units.map((unit) => unit.key),
      drag.from,
      drag.to,
    );
    const { project } = props;
    const order = placeDragged(
      project.workspaces.map((workspace) => workspace.workspaceKey),
      visible,
      dragged,
    );
    const byKey = new Map(project.workspaces.map((workspace) => [workspace.workspaceKey, workspace]));
    props.onWorkspaceReorder(
      project.viewKey,
      order.flatMap((key) => byKey.get(key) ?? []),
    );
    // Paseo applies a stored workspace order only under the manual sort
    const view = sidebarViewStore(true)?.getState();
    if (!view) console.warn("[better-chat-management] Sidebar sort not found; the new order shows under Sort > Manual");
    else if (view.workspaceSort !== "manual") view.setWorkspaceSort("manual");
    // React applies the store change in a microtask; the frame callback covers a later commit
    queueMicrotask(onReordered);
    requestAnimationFrame(onReordered);
  };

  const onPointerDown = (event: DomInputEvent) => {
    suppressClick = false;
    if (active || spent) return;
    pending = null;
    if (event.button !== 0 || !event.isPrimary || event.pointerType === "touch") return;
    const row = closestWorkspaceRow(event.target);
    if (!row || isPinnedRow(row)) return;
    const list = workspaceRowItem(row).parentElement;
    if (!list || !projectBlockProps(list)) return;
    pending = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, row, list };
  };

  // Under the manual sort the row is also Paseo's dnd-kit handle, which starts from React's
  // mousedown; keeping the press from React leaves the gesture to this module
  const onMouseDown = (event: DomInputEvent) => {
    if (!pending || !event.target || !pending.row.contains(event.target)) return;
    const sort = sidebarViewStore()?.getState().workspaceSort;
    if (sort === undefined || sort === "manual") event.stopPropagation();
  };

  const onPointerMove = (event: DomInputEvent) => {
    if (active && event.pointerId === active.pointerId) {
      move(active, event);
      return;
    }
    if (!pending || event.pointerId !== pending.pointerId) return;
    const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
    if (distance > ACTIVATION_DISTANCE_PX) begin(pending, event);
  };

  const onPointerUp = (event: DomInputEvent) => {
    const id = active?.pointerId ?? pending?.pointerId;
    if (id !== undefined && event.pointerId !== id) return;
    const moved = active !== null || spent;
    if (active) drop(active);
    // The row's click would select the workspace the drag let go of
    if (moved) {
      suppressClick = true;
      // The click that follows this release is dispatched before any timer runs
      setTimeout(() => (suppressClick = false), 0);
    }
    finish();
  };

  const onClick = (event: DomInputEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const onKeyDown = (event: DomInputEvent) => {
    if (!active || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    restore(active);
    active = null;
    spent = true;
  };

  const onBlur = (event: DomInputEvent) => {
    // Elements' blurs reach the window's capture phase too; only leaving the window ends the drag
    if ((event.target as unknown) === window) finish();
  };

  // An image or link in the row would otherwise start the browser's own drag
  const onNativeDragStart = (event: DomInputEvent) => {
    if (pending || active) event.preventDefault();
  };

  const listeners: [string, (event: DomInputEvent) => void][] = [
    ["pointerdown", onPointerDown],
    ["mousedown", onMouseDown],
    ["pointermove", onPointerMove],
    ["pointerup", onPointerUp],
    ["pointercancel", finish],
    ["blur", onBlur],
    ["click", onClick],
    ["keydown", onKeyDown],
    ["dragstart", onNativeDragStart],
  ];
  for (const [type, listener] of listeners) window.addEventListener(type, listener, true);
  return () => {
    for (const [type, listener] of listeners) window.removeEventListener(type, listener, true);
    finish();
  };
}
