import assert from "node:assert/strict";
import { test } from "node:test";
import {
  renameChatTab,
  scopeWorkspace,
  type LayoutTab,
  type TabScopeMemory,
  type WorkspaceLayout,
} from "./tab-scope.ts";

const WORKSPACE = "server:ws";
const EXPLORER = { explorerPaneId: "explorer", firstSight: false };

const agentTab = (agentId: string): LayoutTab => ({
  tabId: `agent_${agentId}`,
  target: { kind: "agent", agentId },
});
const fileTab = (path: string): LayoutTab => ({ tabId: `file_${path}`, target: { kind: "file", path } });

function layout(tabs: LayoutTab[], focusedTabId: string, parents?: Record<string, string>): WorkspaceLayout {
  return {
    focusedPaneId: "main",
    parentTabIdByTabId: parents,
    root: {
      kind: "group",
      group: {
        children: [
          { kind: "pane", pane: { id: "main", focusedTabId, tabs } },
          { kind: "pane", pane: { id: "explorer", focusedTabId: "files", tabs: [fileTab("explorer.md")] } },
        ],
      },
    },
  };
}

function freshMemory(): TabScopeMemory {
  return { owners: {}, currentChat: {} };
}

test("only the current chat's chip shows; tabs open on first sight belong to every chat", () => {
  const memory = freshMemory();
  const tabs = [agentTab("a"), agentTab("b"), fileTab("old.ts")];
  const scope = scopeWorkspace(memory, WORKSPACE, layout(tabs, "agent_a"), { ...EXPLORER, firstSight: true });
  assert.deepEqual([...scope.hidden], ["agent_b"]);
  assert.equal(scope.currentChatIdentity, "agent_a");
  assert.equal(scope.focusedChatTabId, "agent_a");
  assert.equal(memory.owners[`${WORKSPACE}\nfile_old.ts`], "");
});

test("a tab opened in one chat hides while another chat is current", () => {
  const memory = freshMemory();
  scopeWorkspace(memory, WORKSPACE, layout([agentTab("a"), agentTab("b")], "agent_a"), EXPLORER);
  const opened = [agentTab("a"), agentTab("b"), fileTab("a.ts")];
  scopeWorkspace(memory, WORKSPACE, layout(opened, "file_a.ts"), EXPLORER);
  assert.equal(memory.owners[`${WORKSPACE}\nfile_a.ts`], "agent_a");

  const inB = scopeWorkspace(memory, WORKSPACE, layout(opened, "agent_b"), EXPLORER);
  assert.deepEqual([...inB.hidden].sort(), ["agent_a", "file_a.ts"]);
  assert.equal(inB.currentChatIdentity, "agent_b");
  // Reading a file keeps the chat it belongs to as the pinned chip
  const backInA = scopeWorkspace(memory, WORKSPACE, layout(opened, "agent_a"), EXPLORER);
  const readingFile = scopeWorkspace(memory, WORKSPACE, layout(opened, "file_a.ts"), EXPLORER);
  assert.deepEqual([...backInA.hidden], ["agent_b"]);
  assert.deepEqual([...readingFile.hidden], ["agent_b"]);
  assert.equal(readingFile.currentChatIdentity, "agent_a");
});

test("the native parent map wins, focused tabs stay visible, closed owners release tabs", () => {
  const memory = freshMemory();
  scopeWorkspace(memory, WORKSPACE, layout([agentTab("a"), agentTab("b")], "agent_a"), EXPLORER);
  const tabs = [agentTab("a"), agentTab("b"), fileTab("b.ts")];
  const focusedFile = scopeWorkspace(memory, WORKSPACE, layout(tabs, "file_b.ts", { "file_b.ts": "agent_b" }), EXPLORER);
  assert.equal(memory.owners[`${WORKSPACE}\nfile_b.ts`], "agent_b");
  assert.equal(focusedFile.hidden.has("file_b.ts"), false);

  const ownerClosed = scopeWorkspace(memory, WORKSPACE, layout([agentTab("a"), fileTab("b.ts")], "agent_a"), EXPLORER);
  assert.equal(ownerClosed.hidden.has("file_b.ts"), false);
});

test("closed tabs are forgotten and drafts hand ownership to their agent tab", () => {
  const memory = freshMemory();
  const draft: LayoutTab = { tabId: "draft_1", target: { kind: "draft", draftId: "draft_1" } };
  scopeWorkspace(memory, WORKSPACE, layout([draft], "draft_1"), EXPLORER);
  scopeWorkspace(memory, WORKSPACE, layout([draft, fileTab("x.ts")], "draft_1"), EXPLORER);
  renameChatTab(memory, WORKSPACE, "draft_1", "agent_z");
  assert.equal(memory.owners[`${WORKSPACE}\nfile_x.ts`], "agent_z");
  assert.equal(memory.currentChat[WORKSPACE], "agent_z");

  scopeWorkspace(memory, WORKSPACE, layout([agentTab("z")], "agent_z"), EXPLORER);
  assert.equal(`${WORKSPACE}\nfile_x.ts` in memory.owners, false);
});

test("the current chat resolves to its agent even when the tab id is persisted", () => {
  const memory = freshMemory();
  const persisted: LayoutTab = { tabId: "tab_41abde1d", target: { kind: "agent", agentId: "a" } };
  const scope = scopeWorkspace(memory, WORKSPACE, layout([persisted, fileTab("x.ts")], "tab_41abde1d"), EXPLORER);
  assert.equal(scope.currentChatTabId, "tab_41abde1d");
  assert.equal(scope.currentChatAgentId, "a");
  assert.equal(scope.currentChatIdentity, "agent_a");
});
