// Pure rules for where chats show in the sidebar: moved to another workspace, and dragged order.

export interface Placement {
  /** Chat id -> the workspace it shows under instead of the one it started in */
  moves: Readonly<Record<string, string>>;
  /** Workspace id -> chat ids in their dragged order */
  order: Readonly<Record<string, readonly string[]>>;
}

export interface PlacedChat {
  id: string;
  /** The workspace the chat started in, where it keeps running */
  workspaceId: string;
  /** The chat it nests under: the one it was forked from, or the agent that launched it */
  parentId: string | undefined;
}

export const EMPTY_PLACEMENT: Placement = { moves: {}, order: {} };

/**
 * Chat id -> the workspace it shows under. A saved move to a live workspace wins. Otherwise a
 * chat follows its parent when both started in the same workspace, so a moved chat takes its
 * forks along, and else stays in the workspace it started in.
 */
export function placeChats(
  chats: readonly PlacedChat[],
  moves: Readonly<Record<string, string>>,
  isLive: (workspaceId: string) => boolean,
): Map<string, string> {
  const byId = new Map(chats.map((chat) => [chat.id, chat]));
  const placed = new Map<string, string>();
  const place = (chat: PlacedChat, visiting: Set<string>): string => {
    const known = placed.get(chat.id);
    if (known !== undefined) return known;
    const moved = moves[chat.id];
    let workspaceId = chat.workspaceId;
    if (moved !== undefined && isLive(moved)) workspaceId = moved;
    else {
      const parent = chat.parentId === undefined ? undefined : byId.get(chat.parentId);
      // A parent cycle has no placed end; its members stay home
      if (parent && parent.workspaceId === chat.workspaceId && !visiting.has(parent.id)) {
        visiting.add(chat.id);
        workspaceId = place(parent, visiting);
      }
    }
    placed.set(chat.id, workspaceId);
    return workspaceId;
  };
  for (const chat of chats) place(chat, new Set());
  return placed;
}

/** `rowIds` with `chatId` moved before `beforeId`, or to the end when it is null or absent */
export function insertBefore(rowIds: readonly string[], chatId: string, beforeId: string | null): string[] {
  const next = rowIds.filter((id) => id !== chatId);
  const at = beforeId === null ? -1 : next.indexOf(beforeId);
  next.splice(at < 0 ? next.length : at, 0, chatId);
  return next;
}

/** The placement after dragging a chat to `beforeId` within its workspace's rows `rowIds` */
export function reorderChat(
  placement: Placement,
  workspaceId: string,
  rowIds: readonly string[],
  chatId: string,
  beforeId: string | null,
): Placement {
  return { ...placement, order: { ...placement.order, [workspaceId]: insertBefore(rowIds, chatId, beforeId) } };
}

/**
 * The placement after dropping a chat on workspace `target` before its row `beforeId`. The move
 * is saved only where the chat would not show by itself, so dropping it back where it belongs
 * clears the move.
 */
export function moveChat(
  placement: Placement,
  chats: readonly PlacedChat[],
  isLive: (workspaceId: string) => boolean,
  move: { chatId: string; target: string; targetRowIds: readonly string[]; beforeId: string | null },
): Placement {
  const moves: Record<string, string> = { ...placement.moves };
  delete moves[move.chatId];
  if (move.target !== placeChats(chats, moves, isLive).get(move.chatId)) moves[move.chatId] = move.target;
  return {
    moves,
    order: { ...placement.order, [move.target]: insertBefore(move.targetRowIds, move.chatId, move.beforeId) },
  };
}

/**
 * The placement without moves to, or orders of, workspaces `isGone` reports, or `placement`
 * itself if it names none
 */
export function withoutMovesTo(placement: Placement, isGone: (workspaceId: string) => boolean): Placement {
  const moves = Object.entries(placement.moves).filter(([, workspaceId]) => !isGone(workspaceId));
  const order = Object.entries(placement.order).filter(([workspaceId]) => !isGone(workspaceId));
  if (moves.length === Object.keys(placement.moves).length && order.length === Object.keys(placement.order).length) {
    return placement;
  }
  return { moves: Object.fromEntries(moves), order: Object.fromEntries(order) };
}

/** Same moves and orders, whatever order their keys were written in */
export function samePlacement(left: Placement, right: Placement): boolean {
  const sameRecord = <Value>(a: Readonly<Record<string, Value>>, b: Readonly<Record<string, Value>>, same: (x: Value, y: Value) => boolean) =>
    Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => key in b && same(value, b[key]));
  return (
    sameRecord(left.moves, right.moves, (x, y) => x === y) &&
    sameRecord(left.order, right.order, (x, y) => x.length === y.length && x.every((id, index) => id === y[index]))
  );
}
