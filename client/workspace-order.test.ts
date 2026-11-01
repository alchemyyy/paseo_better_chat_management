import assert from "node:assert/strict";
import { test } from "node:test";
import { displacement, dropIndex, moveIndex, placeDragged } from "./workspace-order.ts";

test("the dragged row passes a row once its leading edge crosses that row's middle", () => {
  // Rows of height 20, 60 (with chats), 20 laid out from 0
  const middles = [10, 50, 90];
  // The first row moving down leads with its bottom edge
  assert.equal(dropIndex(middles, 0, 29, 49), 0);
  assert.equal(dropIndex(middles, 0, 31, 51), 1);
  assert.equal(dropIndex(middles, 0, 71, 91), 2);
  // The last row moving up leads with its top edge
  assert.equal(dropIndex(middles, 2, 51, 71), 2);
  assert.equal(dropIndex(middles, 2, 49, 69), 1);
  assert.equal(dropIndex(middles, 2, 9, 29), 0);
});

test("a tall row reaches either end without travelling past its neighbours' far edges", () => {
  const middles = [10, 50, 90];
  // The 60px middle row, resting at 20..80, moved 11px either way
  assert.equal(dropIndex(middles, 1, 9, 69), 0);
  assert.equal(dropIndex(middles, 1, 31, 91), 2);
  assert.equal(dropIndex(middles, 1, 15, 75), 1);
});

test("rows between the origin and the target make room for the dragged row only", () => {
  // Row 1 dragged down to 3: rows 2 and 3 move up, rows 0 and 4 stay
  assert.deepEqual([0, 2, 3, 4].map((index) => displacement(index, 1, 3, 30)), [0, -30, -30, 0]);
  // Row 3 dragged up to 1: rows 1 and 2 move down
  assert.deepEqual([0, 1, 2, 4].map((index) => displacement(index, 3, 1, 30)), [0, 30, 30, 0]);
  assert.deepEqual([0, 1, 2].map((index) => displacement(index, 1, 1, 30)), [0, 0, 0]);
});

test("moveIndex reorders the shown keys", () => {
  assert.deepEqual(moveIndex(["a", "b", "c", "d"], 3, 1), ["a", "d", "b", "c"]);
  assert.deepEqual(moveIndex(["a", "b", "c", "d"], 0, 3), ["b", "c", "d", "a"]);
});

test("rows hidden behind Show more keep their places around a drop", () => {
  // h1 and h2 are hidden; the shown rows are a, b, c
  const full = ["a", "h1", "b", "c", "h2"];
  assert.deepEqual(placeDragged(full, ["c", "a", "b"], "c"), ["c", "a", "h1", "b", "h2"]);
  assert.deepEqual(placeDragged(full, ["b", "c", "a"], "a"), ["h1", "b", "c", "a", "h2"]);
  assert.deepEqual(placeDragged(full, ["a", "c", "b"], "c"), ["a", "h1", "c", "b", "h2"]);
});

test("a dragged key missing from the project leaves the order unchanged", () => {
  assert.deepEqual(placeDragged(["a", "b"], ["b", "x"], "x"), ["a", "b"]);
});
