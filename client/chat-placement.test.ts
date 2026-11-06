import assert from "node:assert/strict";
import { test } from "node:test";
import {
  insertBefore,
  moveChat,
  placeChats,
  reorderChat,
  samePlacement,
  withoutMovesTo,
  type Placement,
} from "./chat-placement.ts";

const chat = (id: string, workspaceId: string, parentId?: string) => ({ id, workspaceId, parentId });
const live = (...ids: string[]) => (workspaceId: string) => ids.includes(workspaceId);
const empty: Placement = { moves: {}, order: {} };

test("a moved chat takes its forks and their children, not other chats", () => {
  const chats = [chat("root", "A"), chat("fork", "A", "root"), chat("sub", "A", "fork"), chat("other", "A")];
  const placed = placeChats(chats, { root: "B" }, live("A", "B"));
  assert.deepEqual(Object.fromEntries(placed), { root: "B", fork: "B", sub: "B", other: "A" });
});

test("a move to a workspace that is gone shows the chat where it belongs", () => {
  const chats = [chat("root", "A"), chat("fork", "A", "root")];
  const placed = placeChats(chats, { root: "B", fork: "C" }, live("A"));
  assert.deepEqual(Object.fromEntries(placed), { root: "A", fork: "A" });
});

test("a child from another workspace does not follow its parent", () => {
  const chats = [chat("root", "A"), chat("fork", "Z", "root")];
  assert.equal(placeChats(chats, { root: "B" }, live("A", "B", "Z")).get("fork"), "Z");
});

test("parent cycles stay home", () => {
  const chats = [chat("x", "A", "y"), chat("y", "A", "x")];
  assert.deepEqual(Object.fromEntries(placeChats(chats, {}, live("A"))), { x: "A", y: "A" });
});

test("moving saves the move and the drop position; moving back where it belongs clears it", () => {
  const chats = [chat("a", "A"), chat("b", "B")];
  const moved = moveChat(empty, chats, live("A", "B"), { chatId: "a", target: "B", targetRowIds: ["b"], beforeId: "b" });
  assert.deepEqual(moved.moves, { a: "B" });
  assert.deepEqual(moved.order.B, ["a", "b"]);
  const back = moveChat(moved, chats, live("A", "B"), { chatId: "a", target: "A", targetRowIds: [], beforeId: null });
  assert.deepEqual(back.moves, {});
});

test("a fork dragged home while its parent is away keeps an explicit move", () => {
  const chats = [chat("root", "A"), chat("fork", "A", "root")];
  const placement: Placement = { moves: { root: "B" }, order: {} };
  const next = moveChat(placement, chats, live("A", "B"), { chatId: "fork", target: "A", targetRowIds: [], beforeId: null });
  assert.deepEqual(next.moves, { root: "B", fork: "A" });
  assert.equal(placeChats(chats, next.moves, live("A", "B")).get("fork"), "A");
});

test("reordering moves the chat before the given row or to the end", () => {
  assert.deepEqual(insertBefore(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  assert.deepEqual(insertBefore(["a", "b", "c"], "a", null), ["b", "c", "a"]);
  assert.deepEqual(reorderChat(empty, "A", ["a", "b"], "b", "a").order, { A: ["b", "a"] });
});

test("gone workspaces lose the moves to them and their order; nothing gone keeps the same placement", () => {
  const placement: Placement = { moves: { a: "B", b: "C" }, order: { B: ["a"], C: ["b"] } };
  assert.deepEqual(withoutMovesTo(placement, (id) => id === "B"), { moves: { b: "C" }, order: { C: ["b"] } });
  assert.equal(withoutMovesTo(placement, () => false), placement);
});

test("placements compare by content, not key order", () => {
  const left: Placement = { moves: { a: "B", c: "D" }, order: { B: ["a", "x"] } };
  assert.equal(samePlacement(left, { moves: { c: "D", a: "B" }, order: { B: ["a", "x"] } }), true);
  assert.equal(samePlacement(left, { moves: { a: "B", c: "D" }, order: { B: ["x", "a"] } }), false);
  assert.equal(samePlacement(left, { moves: { a: "B" }, order: { B: ["a", "x"] } }), false);
});
