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

test("dragged order sorts siblings; chats not in it follow oldest first", () => {
  const agents = [chat("a", "1"), chat("b", "2"), chat("c", "3"), chat("new", "4"), chat("a1", "5"), chat("a2", "6")];
  const parents = { a1: "a", a2: "a" };
  // A child's place among its siblings holds wherever the list puts it relative to other rows
  const order = ["c", "a2", "a", "a1", "b"];
  assert.deepEqual(shape(buildChatRows(agents, parents, order)), ["c", "a", "-a2", "-a1", "b", "new"]);
});
