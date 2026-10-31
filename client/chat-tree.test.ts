import assert from "node:assert/strict";
import { test } from "node:test";
import { buildChatRows, PARENT_AGENT_LABEL, type ChatAgent } from "./chat-tree.ts";

function chat(id: string, createdAt: string, labels: Record<string, string> = {}): ChatAgent {
  return { id, title: id, createdAt, labels };
}

function shape(rows: { agent: ChatAgent; depth: number }[]): string[] {
  return rows.map((row) => `${"-".repeat(row.depth)}${row.agent.id}`);
}

test("nests forks under their source, siblings oldest first", () => {
  const agents = [chat("b", "2"), chat("a", "1"), chat("a2", "4"), chat("a1", "3"), chat("a1x", "5")];
  const parents = { a1: "a", a2: "a", a1x: "a1" };
  assert.deepEqual(shape(buildChatRows(agents, parents)), ["a", "-a1", "--a1x", "-a2", "b"]);
});

test("nests agent-launched chats by label and prefers fork lineage", () => {
  const agents = [
    chat("root", "1"),
    chat("other", "2"),
    chat("sub", "3", { [PARENT_AGENT_LABEL]: "root" }),
    chat("fork", "4", { [PARENT_AGENT_LABEL]: "root" }),
  ];
  assert.deepEqual(shape(buildChatRows(agents, { fork: "other" })), ["root", "-sub", "other", "-fork"]);
});

test("missing parents and cycles still show every chat", () => {
  const agents = [chat("x", "1"), chat("y", "2"), chat("orphan", "3")];
  const parents = { x: "y", y: "x", orphan: "archived" };
  assert.deepEqual(shape(buildChatRows(agents, parents)), ["orphan", "x", "-y"]);
});
