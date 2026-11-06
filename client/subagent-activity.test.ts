import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applySubagentRemove,
  applySubagentUpsert,
  NO_RUNNING_SUBAGENTS,
  replaceParentSubagents,
} from "./subagent-activity.ts";

const sub = (id: string, status: string, parentAgentId = "chat") => ({ id, parentAgentId, status });

test("a chat stays running until its last subagent stops", () => {
  let state = applySubagentUpsert(NO_RUNNING_SUBAGENTS, sub("a", "running"));
  state = applySubagentUpsert(state, sub("b", "running"));
  state = applySubagentUpsert(state, sub("a", "completed"));
  assert.deepEqual([...(state.get("chat") ?? [])], ["b"]);
  state = applySubagentUpsert(state, sub("b", "failed"));
  assert.equal(state.has("chat"), false);
});

test("a removed running subagent stops counting", () => {
  const state = applySubagentUpsert(NO_RUNNING_SUBAGENTS, sub("a", "running"));
  assert.equal(applySubagentRemove(state, "chat", "a").has("chat"), false);
});

test("updates that change nothing keep the same state", () => {
  const state = applySubagentUpsert(NO_RUNNING_SUBAGENTS, sub("a", "running"));
  assert.equal(applySubagentUpsert(state, sub("a", "running")), state);
  assert.equal(applySubagentUpsert(state, sub("x", "completed")), state);
  assert.equal(applySubagentRemove(state, "chat", "x"), state);
  assert.equal(replaceParentSubagents(state, "chat", [sub("a", "running"), sub("c", "completed")]), state);
});

test("a resync replaces only that chat's subagents", () => {
  let state = applySubagentUpsert(NO_RUNNING_SUBAGENTS, sub("a", "running"));
  state = applySubagentUpsert(state, sub("o", "running", "other"));
  state = replaceParentSubagents(state, "chat", [sub("a", "completed")]);
  assert.equal(state.has("chat"), false);
  assert.equal(state.has("other"), true);
});
