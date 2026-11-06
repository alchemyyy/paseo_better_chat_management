// NOTE: App-internal DOM. Drags a sidebar chat row: within its workspace's list it reorders the
// chat among its siblings (rows nested under it move along), and dropped on another workspace of
// the same host it moves the chat there. The rows are the plugin's own (sidebar-chats.tsx), so
// this module only moves them visually; `onDrop` saves the result and React re-renders the list.
import { displacement, dropIndex, moveIndex } from "./workspace-order";
import {
  chatDropZones,
  chatRowList,
  chatRowsIn,
  closestChatHandleRow,
  createDragMarker,
  type ChatDropZone,
  type ChatRowInfo,
  type DomElement,
  type DragMarker,
  liftStackingContexts,
  setDragGesture,
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
  stopImmediatePropagation(): void;
}
declare const window: {
  addEventListener(type: string, listener: (event: DomInputEvent) => void, capture: boolean): void;
  removeEventListener(type: string, listener: (event: DomInputEvent) => void, capture: boolean): void;
};
declare function getSelection(): { removeAllRanges(): void } | null;

export interface ChatDrop {
  agentId: string;
  /** Workspace keys (`serverId:workspaceId`) the chat was listed under and is dropped on */
  fromKey: string;
  toKey: string;
  /** The row it now goes before: a sibling when reordering, a top-level row when moving; null for last */
  beforeId: string | null;
}

/** Paseo's drag lists start a mouse drag after this much movement (draggable-list.web.tsx) */
const ACTIVATION_DISTANCE_PX = 6;
const SHIFT_TRANSITION = "transform 200ms ease";
const DRAGGED_Z_INDEX = "1000";
const DRAGGED_OPACITY = "0.9";
const LINE_HEIGHT_PX = 2;
/** Inline styles the drag sets, restored afterwards; transition last so the snap back is instant */
const STYLE_PROPERTIES = ["transform", "z-index", "opacity", "transition"] as const;
type SavedStyle = Record<(typeof STYLE_PROPERTIES)[number], string>;

/** A sibling row and the rows nested under it, which move together */
interface Unit {
  agentId: string;
  elements: DomElement[];
  top: number;
  bottom: number;
}

interface Pending {
  pointerId: number;
  startY: number;
  startX: number;
  row: DomElement;
  list: DomElement;
  fromKey: string;
}

interface Active extends Pending {
  units: Unit[];
  middles: number[];
  from: number;
  to: number;
  /** The list's top when the drag began; the sidebar may scroll under the drag */
  listTop: number;
  saved: Map<DomElement, SavedStyle>;
  target: ChatDropZone | null;
  beforeId: string | null;
  zone: DragMarker;
  line: DragMarker;
  /** Puts back the z-indexes raised so the row draws over other projects' blocks */
  unlift: () => void;
}

function setStyle(element: DomElement, name: string, value: string): void {
  if (value) element.style.setProperty(name, value);
  else element.style.removeProperty(name);
}

/** The dragged row's siblings in its list, each with the rows nested under it */
function measureUnits(rows: readonly ChatRowInfo[], dragged: ChatRowInfo): Unit[] {
  const units: Unit[] = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (row.depth !== dragged.depth || row.parentId !== dragged.parentId) continue;
    const elements = [row.element];
    for (let next = index + 1; next < rows.length && rows[next].depth > row.depth; next++) {
      elements.push(rows[next].element);
    }
    const first = row.element.getBoundingClientRect();
    const last = elements[elements.length - 1].getBoundingClientRect();
    units.push({ agentId: row.agentId, elements, top: first.top, bottom: last.top + last.height });
  }
  return units;
}

/** Where a chat dropped at `y` lands in a target list: before the first top-level row below `y` */
function landing(list: DomElement, y: number): { beforeId: string | null; lineY: number } {
  const roots = chatRowsIn(list).filter((row) => row.depth === 0);
  for (const row of roots) {
    const rect = row.element.getBoundingClientRect();
    if (y < rect.top + rect.height / 2) return { beforeId: row.agentId, lineY: rect.top };
  }
  const rows = chatRowsIn(list);
  const last = rows.length > 0 ? rows[rows.length - 1].element.getBoundingClientRect() : null;
  return { beforeId: null, lineY: last ? last.top + last.height : list.getBoundingClientRect().top };
}

/**
 * Starts chat dragging for one host's rows on web. `onDrop` runs for a drop that changes the
 * chat's order or workspace. Returns the uninstaller.
 */
export function installChatDrag(serverId: string, onDrop: (drop: ChatDrop) => void): () => void {
  let pending: Pending | null = null;
  let active: Active | null = null;
  /** Escape cancelled the drag; the gesture lasts until the pointer is released */
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
    drag.zone.remove();
    drag.line.remove();
    drag.unlift();
  };

  const finish = () => {
    if (active) restore(active);
    active = null;
    pending = null;
    spent = false;
    setDragGesture(false);
  };

  const begin = (start: Pending, event: DomInputEvent) => {
    const rows = chatRowsIn(start.list);
    const dragged = rows.find((row) => row.element === start.row);
    if (!dragged) {
      pending = null;
      return;
    }
    const units = measureUnits(rows, dragged);
    const from = units.findIndex((unit) => unit.agentId === dragged.agentId);
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
      target: null,
      beforeId: null,
      zone: createDragMarker("zone"),
      line: createDragMarker("line"),
      unlift: liftStackingContexts(start.list),
    };
    pending = null;
    setDragGesture(true);
    getSelection()?.removeAllRanges();
    move(active, event);
  };

  const move = (drag: Active, event: DomInputEvent) => {
    // In the coordinates the rows were measured in
    const scrolled = drag.list.getBoundingClientRect().top - drag.listTop;
    const delta = event.clientY - scrolled - drag.startY;
    const zone =
      chatDropZones().find(
        (candidate) =>
          event.clientX >= candidate.left &&
          event.clientX <= candidate.right &&
          event.clientY >= candidate.top &&
          event.clientY <= candidate.bottom,
      ) ?? null;
    const dragged = drag.units[drag.from];
    const reordering = zone?.list === drag.list;
    const moving = !reordering && zone !== null && zone.workspaceKey.startsWith(`${serverId}:`);
    drag.target = reordering || moving ? zone : null;
    drag.to = reordering
      ? dropIndex(drag.middles, drag.from, dragged.top + delta, dragged.bottom + delta)
      : drag.from;
    for (const [index, unit] of drag.units.entries()) {
      const offset = index === drag.from ? delta : displacement(index, drag.from, drag.to, dragged.bottom - dragged.top);
      for (const element of unit.elements) setStyle(element, "transform", offset === 0 ? "" : `translate3d(0px, ${offset}px, 0px)`);
    }
    if (!moving || !zone) {
      drag.zone.place(null);
      drag.line.place(null);
      drag.beforeId = null;
      return;
    }
    drag.zone.place({ top: zone.top, left: zone.left, width: zone.right - zone.left, height: zone.bottom - zone.top });
    const { beforeId, lineY } = landing(zone.list, event.clientY);
    drag.beforeId = beforeId;
    const listRect = zone.list.getBoundingClientRect();
    drag.line.place({ top: lineY - LINE_HEIGHT_PX / 2, left: listRect.left, width: listRect.width, height: LINE_HEIGHT_PX });
  };

  const drop = (drag: Active) => {
    restore(drag);
    active = null;
    const agentId = drag.units[drag.from].agentId;
    if (drag.target?.list === drag.list) {
      if (drag.to === drag.from) return;
      const order = moveIndex(
        drag.units.map((unit) => unit.agentId),
        drag.from,
        drag.to,
      );
      onDrop({ agentId, fromKey: drag.fromKey, toKey: drag.fromKey, beforeId: order[drag.to + 1] ?? null });
      return;
    }
    if (drag.target) onDrop({ agentId, fromKey: drag.fromKey, toKey: drag.target.workspaceKey, beforeId: drag.beforeId });
  };

  const onPointerDown = (event: DomInputEvent) => {
    suppressClick = false;
    if (active || spent) return;
    pending = null;
    if (event.button !== 0 || !event.isPrimary || event.pointerType === "touch") return;
    const row = closestChatHandleRow(event.target);
    const place = row ? chatRowList(row) : null;
    if (!row || !place || !place.workspaceKey.startsWith(`${serverId}:`)) return;
    pending = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      row,
      list: place.list,
      fromKey: place.workspaceKey,
    };
  };

  const onPointerMove = (event: DomInputEvent) => {
    if (active && event.pointerId === active.pointerId) {
      move(active, event);
      return;
    }
    if (!pending || event.pointerId !== pending.pointerId) return;
    if (Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > ACTIVATION_DISTANCE_PX) {
      begin(pending, event);
    }
  };

  const onPointerUp = (event: DomInputEvent) => {
    const id = active?.pointerId ?? pending?.pointerId;
    if (id !== undefined && event.pointerId !== id) return;
    const moved = active !== null || spent;
    if (active) drop(active);
    // The row's click would open the chat the drag let go of
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
