import assert from "node:assert/strict";
import { test } from "node:test";
import { compactTimeAgo, lastInteractionAt } from "./time.ts";

const NOW = new Date("2026-10-24T12:00:00");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

test("compact labels step from now to a date", () => {
  assert.equal(compactTimeAgo(ago(30_000), NOW), "now");
  assert.equal(compactTimeAgo(ago(5 * 60_000), NOW), "5m");
  assert.equal(compactTimeAgo(ago(2 * 3_600_000), NOW), "2h");
  assert.equal(compactTimeAgo(ago(3 * 86_400_000), NOW), "3d");
  assert.equal(compactTimeAgo(new Date("2026-10-01T09:00:00"), NOW), "Oct 1");
});

test("last interaction takes the latest message or attention time", () => {
  const created = "2026-10-24T08:00:00.000Z";
  assert.equal(lastInteractionAt({ createdAt: created, lastUserMessageAt: null }).toISOString(), created);
  const later = lastInteractionAt({
    createdAt: created,
    lastUserMessageAt: "2026-10-24T09:00:00.000Z",
    attentionTimestamp: "2026-10-24T10:00:00.000Z",
  });
  assert.equal(later.toISOString(), "2026-10-24T10:00:00.000Z");
});
