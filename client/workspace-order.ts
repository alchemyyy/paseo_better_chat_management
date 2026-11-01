// Pure placement rules for dragging a workspace row within its project's list.

/**
 * The index the dragged row takes. It passes a row above once its top edge rises past that
 * row's middle, and a row below once its bottom edge sinks past it, so a tall row (one with its
 * chats listed) moves as readily as a short one. `middles` are the rows' resting middles in list
 * order, the dragged row's included; `top` and `bottom` are the dragged row's current edges.
 */
export function dropIndex(middles: readonly number[], from: number, top: number, bottom: number): number {
  let index = from;
  for (let other = 0; other < from; other++) {
    if (top < middles[other]) index--;
  }
  for (let other = from + 1; other < middles.length; other++) {
    if (bottom > middles[other]) index++;
  }
  return index;
}

/** How far the row at `index` moves aside while the row at `from` hovers at `to` */
export function displacement(index: number, from: number, to: number, draggedHeight: number): number {
  if (from < to && index > from && index <= to) return -draggedHeight;
  if (to < from && index >= to && index < from) return draggedHeight;
  return 0;
}

/** `keys` with the item at `from` moved to `to` */
export function moveIndex(keys: readonly string[], from: number, to: number): string[] {
  const next = keys.slice();
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) next.splice(to, 0, moved);
  return next;
}

/**
 * The project's full workspace order after a drop. Only `visible` (the rows shown, in their new
 * order) moved; rows hidden behind "Show more" keep their places. `dragged` goes before the
 * visible row now after it, or else after the visible row now before it.
 */
export function placeDragged(full: readonly string[], visible: readonly string[], dragged: string): string[] {
  const at = visible.indexOf(dragged);
  const rest = full.filter((key) => key !== dragged);
  if (at < 0 || rest.length === full.length) return full.slice();
  const after = at + 1 < visible.length ? rest.indexOf(visible[at + 1]) : -1;
  if (after >= 0) {
    rest.splice(after, 0, dragged);
    return rest;
  }
  const before = at > 0 ? rest.indexOf(visible[at - 1]) : -1;
  if (before >= 0) {
    rest.splice(before + 1, 0, dragged);
    return rest;
  }
  return full.slice();
}
