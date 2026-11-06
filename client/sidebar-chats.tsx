import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { usePaseo, useSettings } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { forkLineage } from "../shared/lineage";
import { chatPlacement } from "../shared/placement";
import {
  EMPTY_PLACEMENT,
  moveChat,
  placeChats,
  reorderChat,
  samePlacement,
  withoutMovesTo,
  type PlacedChat,
  type Placement,
} from "./chat-placement";
import { installChatDrag, type ChatDrop } from "./chat-drag";
import { buildChatRows, PARENT_AGENT_LABEL, type ChatRow } from "./chat-tree";
import { getCollapsed, subscribeCollapsed } from "./collapsed-workspaces";
import type { ChatSlot, Controller } from "./controller";
import type { RowBackdrop } from "./web";
import { forkChat, type PaseoAgent } from "./fork";
import { HoverIconButton } from "./hover-button";
import { PathMenu } from "./path-menu";
import { recordFork } from "./lineage";
import { draftStore, sessionStore, type DraftState } from "./app-stores";
import { updatePlacement } from "./placement-store";
import { chatStatus, StatusGlyph } from "./status-glyph";
import {
  applySubagentRemove,
  applySubagentUpsert,
  NO_RUNNING_SUBAGENTS,
  replaceParentSubagents,
  type RunningSubagents,
} from "./subagent-activity";
import { ArchivedChats, BASE_INDENT as ARCHIVED_BASE_INDENT, LEAD_SLOT_WIDTH } from "./archived-chats";
import { renameChat } from "./chat-rename";
import { ChatTimestamp } from "./chat-timestamp";
import { lastInteractionAt } from "./time";
import { NewChatButton } from "./new-chat";
import { createDomPortal, pressWorkspaceRow } from "./web";

type Theme = PluginSidebarItemProps["theme"];

// shortcut: one page of chats and workspaces per host; later ones arrive only as live updates
const AGENT_PAGE_LIMIT = 200;
const HOST_ICON_SIZE = 12;
// Leading space would collapse in single-line text; the line's gap spaces the separator
const INFO_SEPARATOR = "· ";
const WORKSPACE_PAGE_LIMIT = 200;
const ROW_HEIGHT = 28;
const BASE_INDENT = 28;
const DEPTH_INDENT = 14;
const UNTITLED_CHAT = "New chat";
/** Two presses this close together are a double-click; React Native Web has no dblclick */
const DOUBLE_PRESS_MS = 350;
const EMPTY_PARENTS: Readonly<Record<string, string>> = {};
const EMPTY_ROWS: readonly ChatRow<PaseoAgent>[] = [];
const EMPTY_AGENTS: readonly PaseoAgent[] = [];
const NO_DRAFTS: DraftState["drafts"] = {};
const NO_PENDING: ReadonlySet<string> = new Set();
const NO_MOVED: ReadonlyMap<string, string> = new Map();
/**
 * Marks left of a chat's status glyph: moved from its workspace, message left unsent. Two marks
 * fit between the project rail (10px in) and the 28px chat indent at this size and spacing.
 */
const MARK_SIZE = 9;
const MARK_GAP = 1;
/** The status glyph's widest mark (the 12px running ring) starts this far into its slot */
const GLYPH_INSET = 3;
/** An optimistic placement waits this long for the saved one before showing what is stored */
const PLACEMENT_SETTLE_MS = 2000;
// shortcut: the newest archived chats across the host only; older ones need paging
const ARCHIVED_PAGE_LIMIT = 200;


function useHostAgents(paseo: ReturnType<typeof usePaseo>): ReadonlyMap<string, PaseoAgent> {
  const [agents, setAgents] = useState<ReadonlyMap<string, PaseoAgent>>(() => new Map());
  useEffect(() => {
    let stopped = false;
    let release: (() => Promise<void>) | null = null;
    const replace = (entries: readonly { agent: PaseoAgent }[]) =>
      setAgents(new Map(entries.map((entry) => [entry.agent.id, entry.agent])));
    paseo.agents
      .list({ subscribe: {}, page: { limit: AGENT_PAGE_LIMIT } })
      .then(({ entries, subscription }) => {
        if (stopped) {
          void subscription.release();
          return;
        }
        release = () => subscription.release();
        replace(entries);
        subscription.subscribe({
          // Snapshots also arrive after reconnect and replace the view
          snapshot: ({ entries: snapshotEntries }) => replace(snapshotEntries),
          update: (message) => {
            if (message.type !== "agent_update") return;
            const update = message.payload;
            setAgents((previous) => {
              const next = new Map(previous);
              if (update.kind === "remove") next.delete(update.agentId);
              else next.set(update.agent.id, update.agent);
              return next;
            });
          },
        });
      })
      .catch((error: unknown) => {
        if (!stopped) console.error("[better-chat-management] Chat observation failed", error);
      });
    return () => {
      stopped = true;
      void release?.();
    };
  }, [paseo]);
  return agents;
}

interface HostWorkspace {
  /** The folder the workspace runs in */
  directory: string;
  name: string;
}

interface HostWorkspaces {
  byId: ReadonlyMap<string, HostWorkspace>;
  /** The first page arrived; until then a workspace missing from `byId` may still exist */
  loaded: boolean;
  /** Workspaces archived or removed while observed */
  gone: ReadonlySet<string>;
}

const NO_WORKSPACES: HostWorkspaces = { byId: new Map(), loaded: false, gone: new Set() };

function useHostWorkspaces(paseo: ReturnType<typeof usePaseo>): HostWorkspaces {
  const [workspaces, setWorkspaces] = useState<HostWorkspaces>(NO_WORKSPACES);
  useEffect(() => {
    let stopped = false;
    let release: (() => Promise<void>) | null = null;
    type Entry = { id: string; name: string; title?: string | null; workspaceDirectory?: string; projectRootPath: string };
    const describe = (workspace: Entry): HostWorkspace => ({
      directory: workspace.workspaceDirectory ?? workspace.projectRootPath,
      name: workspace.title || workspace.name,
    });
    const replace = (entries: readonly Entry[]) =>
      setWorkspaces((previous) => ({
        byId: new Map(entries.map((workspace) => [workspace.id, describe(workspace)])),
        loaded: true,
        gone: previous.gone,
      }));
    const drop = (id: string) =>
      setWorkspaces((previous) => {
        const byId = new Map(previous.byId);
        byId.delete(id);
        return { byId, loaded: previous.loaded, gone: new Set(previous.gone).add(id) };
      });
    paseo.workspaces
      // Chats can be dragged onto background workspaces the sidebar shows too
      .list({ subscribe: {}, filter: { includeBackground: true }, page: { limit: WORKSPACE_PAGE_LIMIT } })
      .then(({ entries, subscription }) => {
        if (stopped) {
          void subscription.release();
          return;
        }
        release = () => subscription.release();
        replace(entries);
        subscription.subscribe({
          snapshot: ({ entries: snapshotEntries }) => replace(snapshotEntries),
          update: (message) => {
            if (message.type !== "workspace_update") return;
            const update = message.payload;
            if (update.kind === "remove") {
              drop(update.id);
              return;
            }
            // Archiving reaches the sidebar as an upsert stamped with when it began
            if ("archivingAt" in update.workspace && update.workspace.archivingAt) {
              drop(update.workspace.id);
              return;
            }
            setWorkspaces((previous) => ({
              ...previous,
              byId: new Map(previous.byId).set(update.workspace.id, describe(update.workspace)),
            }));
          },
        });
      })
      .catch((error: unknown) => {
        if (!stopped) console.error("[better-chat-management] Workspace observation failed", error);
      });
    return () => {
      stopped = true;
      void release?.();
    };
  }, [paseo]);
  return workspaces;
}

/**
 * Chats with a message typed but not sent, from the app's composer drafts. The draft store is
 * found once a composer mounts, so the search repeats as the controller sees the app change.
 */
function usePendingDrafts(serverId: string, controller: Controller): ReadonlySet<string> {
  const [store, setStore] = useState(() => draftStore());
  useEffect(() => {
    if (store) return;
    return controller.subscribe(() => {
      const found = draftStore();
      if (found) setStore(found);
    });
  }, [store]);
  const subscribe = useCallback((listener: () => void) => store?.subscribe(listener) ?? (() => {}), [store]);
  const drafts = useSyncExternalStore(subscribe, () => store?.getState().drafts ?? NO_DRAFTS);
  const previous = useRef<ReadonlySet<string>>(NO_PENDING);
  return useMemo(() => {
    const prefix = `agent:${serverId}:`;
    const pending = new Set<string>();
    for (const [key, draft] of Object.entries(drafts)) {
      if (!key.startsWith(prefix) || draft?.lifecycle !== "active") continue;
      if (draft.input.text.trim() || draft.input.attachments.length > 0) pending.add(key.slice(prefix.length));
    }
    // Typing changes the drafts on every key; the set changes only when a chat gains or loses one
    const same = pending.size === previous.current.size && [...pending].every((id) => previous.current.has(id));
    if (!same) previous.current = pending;
    return previous.current;
  }, [drafts, serverId]);
}

/**
 * Chats whose provider subagents are still running, from the host's live subagent updates. A
 * reconnect can drop updates, so the chats last seen with running subagents list theirs again;
 * subagents already running when the sidebar mounted show from their next update.
 */
function useRunningSubagents(paseo: ReturnType<typeof usePaseo>, serverId: string): RunningSubagents {
  const [running, setRunning] = useState<RunningSubagents>(NO_RUNNING_SUBAGENTS);
  const latest = useRef(running);
  latest.current = running;
  useEffect(() => {
    let stopped = false;
    const observation = paseo.observeEvents(["agent.provider_subagents.update"]);
    const resync = () => {
      const client = sessionStore(true)?.getState().sessions[serverId]?.client;
      if (!client?.listProviderSubagents) return;
      for (const parentAgentId of latest.current.keys()) {
        client
          .listProviderSubagents(parentAgentId)
          .then(({ subagents }) => {
            if (!stopped) setRunning((previous) => replaceParentSubagents(previous, parentAgentId, subagents));
          })
          .catch(() => {
            // The chat was archived or unloaded since; its subagents went with it
            if (!stopped) setRunning((previous) => replaceParentSubagents(previous, parentAgentId, []));
          });
      }
    };
    const unsubscribe = observation.subscribe({
      snapshot: resync,
      update: (message) => {
        if (message.type !== "agent.provider_subagents.update") return;
        const update = message.payload;
        if (update.kind === "upsert") setRunning((previous) => applySubagentUpsert(previous, update.subagent));
        else if (update.kind === "remove") {
          setRunning((previous) => applySubagentRemove(previous, update.parentAgentId, update.subagentId));
        }
      },
    });
    return () => {
      stopped = true;
      unsubscribe();
      void observation.release();
    };
  }, [paseo, serverId]);
  return running;
}

interface ChatRowViewProps {
  row: ChatRow<PaseoAgent>;
  theme: Theme;
  selected: boolean;
  /** Provider subagents the chat started are still running */
  subagentsRunning: boolean;
  /** The selected workspace row's background, copied so chats highlight alike */
  backdrop: RowBackdrop | null;
  onOpen(agent: PaseoAgent): void;
  onFork(agent: PaseoAgent): Promise<void>;
  onArchive(agent: PaseoAgent): Promise<void>;
  onRename(agent: PaseoAgent, name: string): Promise<void>;
  /** The workspace the chat started in, when it shows under another one */
  movedFrom: string | null;
  /** A message was typed in the chat and left unsent */
  pendingMessage: boolean;
}

/** Marks just left of the status glyph: moved out of its workspace, message left unsent */
function ChatMarks({
  indent,
  movedFrom,
  pendingMessage,
  theme,
}: {
  indent: number;
  movedFrom: string | null;
  pendingMessage: boolean;
  theme: Theme;
}) {
  const count = (movedFrom === null ? 0 : 1) + (pendingMessage ? 1 : 0);
  if (count === 0) return null;
  const width = count * MARK_SIZE + (count - 1) * MARK_GAP;
  return (
    // Row-reverse puts the first mark next to the glyph; the marks sit in the indent, so the title keeps its place
    <View pointerEvents="none" style={[styles.marks, { left: indent + GLYPH_INSET - MARK_GAP - width, width }]}>
      {movedFrom === null ? null : (
        <View accessibilityLabel={`Moved from ${movedFrom}`}>
          <Icon name="Feather" size={MARK_SIZE} color={theme.colors.foregroundMuted} />
        </View>
      )}
      {pendingMessage ? (
        <View accessibilityLabel="Unsent message">
          <Icon name="PencilLine" size={MARK_SIZE} color={theme.colors.foregroundMuted} />
        </View>
      ) : null}
    </View>
  );
}

/** Inline title editor: Enter or leaving the box saves, Escape cancels */
function TitleEditor({
  initial,
  theme,
  onDone,
}: {
  initial: string;
  theme: Theme;
  onDone(name: string | null): void;
}) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const finish = useCallback(
    (name: string | null) => {
      if (finished.current) return;
      finished.current = true;
      onDone(name);
    },
    [onDone],
  );
  const handleKey = useCallback(
    (event: { nativeEvent: { key: string } }) => {
      if (event.nativeEvent.key === "Escape") finish(null);
    },
    [finish],
  );
  return (
    <TextInput
      value={value}
      onChangeText={setValue}
      autoFocus
      selectTextOnFocus
      onSubmitEditing={() => finish(value)}
      onBlur={() => finish(value)}
      onKeyPress={handleKey}
      style={[
        styles.titleInput,
        { color: theme.colors.foreground, borderColor: theme.colors.border, backgroundColor: theme.colors.surface0 },
      ]}
    />
  );
}

const ChatRowView = memo(function ChatRowView({
  row,
  theme,
  selected,
  subagentsRunning,
  backdrop,
  onOpen,
  onFork,
  onArchive,
  onRename,
  movedFrom,
  pendingMessage,
}: ChatRowViewProps) {
  const { agent, depth } = row;
  const indent = BASE_INDENT + depth * DEPTH_INDENT;
  const [renaming, setRenaming] = useState(false);
  const lastPress = useRef(0);
  const [forking, setForking] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const handleArchive = useCallback(() => {
    if (archiving) return;
    setArchiving(true);
    // The row unmounts once the archive lands; reset only when it failed
    void onArchive(agent).catch(() => setArchiving(false));
  }, [agent, archiving, onArchive]);
  const [hovered, setHovered] = useState(false);
  const handleEnter = useCallback(() => setHovered(true), []);
  const handleLeave = useCallback(() => setHovered(false), []);
  const handleOpen = useCallback(() => {
    const now = Date.now();
    if (now - lastPress.current < DOUBLE_PRESS_MS) {
      lastPress.current = 0;
      setRenaming(true);
      return;
    }
    lastPress.current = now;
    onOpen(agent);
  }, [agent, onOpen]);
  const handleRenamed = useCallback(
    (name: string | null) => {
      setRenaming(false);
      const trimmed = name?.trim();
      if (trimmed && trimmed !== (agent.title ?? "")) void onRename(agent, trimmed);
    },
    [agent, onRename],
  );
  const handleFork = useCallback(() => {
    if (forking) return;
    setForking(true);
    void onFork(agent).finally(() => setForking(false));
  }, [agent, forking, onFork]);

  // The whole row, fork button included, carries the highlight, as a workspace row does
  // The current chat's backdrop comes from the controller marking this row (web.ts
  // markCurrentChat), the same way the workspace row's backdrop reaches the host line
  const frameHighlight = hovered && !selected ? { backgroundColor: theme.colors.surface1 } : null;
  // Its place in the list's tree lets chat-drag.ts move it among its siblings
  const dataSet = { betterChatAgent: agent.id, betterChatDepth: String(depth), betterChatParent: row.parentId ?? "" } as object;
  const handleDataSet = { betterChatHandle: "true" } as object;
  const marks = <ChatMarks indent={indent} movedFrom={movedFrom} pendingMessage={pendingMessage} theme={theme} />;

  return (
    <View
      {...{ dataSet }}
      style={[styles.rowFrame, frameHighlight]}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
    >
      {renaming ? (
        // A plain row while editing: a Pressable around the input would take its Space and Enter
        <View style={[styles.row, { paddingLeft: indent }]}>
          {marks}
          <View style={styles.dotSlot}>
            <StatusGlyph status={chatStatus(agent, subagentsRunning)} theme={theme} />
          </View>
          <TitleEditor initial={agent.title ?? ""} theme={theme} onDone={handleRenamed} />
        </View>
      ) : (
        <Pressable
          {...{ dataSet: handleDataSet }}
          style={[styles.row, { paddingLeft: indent }]}
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={agent.title ?? UNTITLED_CHAT}
        >
          {marks}
          <View style={styles.dotSlot}>
            <StatusGlyph status={chatStatus(agent, subagentsRunning)} theme={theme} />
          </View>
          <Text
            style={[styles.title, { color: selected ? theme.colors.foreground : theme.colors.foregroundMuted }]}
            numberOfLines={1}
            selectable={false}
          >
            {agent.title ?? UNTITLED_CHAT}
          </Text>
          <ChatTimestamp at={lastInteractionAt(agent)} theme={theme} />
        </Pressable>
      )}
      <View style={styles.forkSlot}>
        <HoverIconButton
          icon="Split"
          theme={theme}
          onPress={handleFork}
          disabled={forking}
          accessibilityLabel="Fork chat"
        />
      </View>
      <View style={styles.forkSlot}>
        <HoverIconButton
          icon="Archive"
          theme={theme}
          onPress={handleArchive}
          disabled={archiving}
          accessibilityLabel="Archive chat"
        />
      </View>
    </View>
  );
});

interface WorkspaceChatsProps {
  slot: ChatSlot;
  rows: readonly ChatRow<PaseoAgent>[];
  archived: readonly PaseoAgent[] | null;
  archivedLoading: boolean;
  archivedIndent: number;
  onExpandArchived(): void;
  theme: Theme;
  selectedAgentId: string | null;
  runningSubagents: RunningSubagents;
  /** Chat id -> the name of the workspace it started in, for chats shown under another one */
  movedFrom: ReadonlyMap<string, string>;
  /** Chats with a message left unsent */
  pendingDrafts: ReadonlySet<string>;
  backdrop: RowBackdrop | null;
  onOpen(slot: ChatSlot, agent: PaseoAgent): void;
  onFork(slot: ChatSlot, agent: PaseoAgent): Promise<void>;
  onArchive(agent: PaseoAgent): Promise<void>;
  onRename(slot: ChatSlot, agent: PaseoAgent, name: string): Promise<void>;
}

const WorkspaceChats = memo(function WorkspaceChats({
  slot,
  rows,
  archived,
  archivedLoading,
  archivedIndent,
  onExpandArchived,
  theme,
  selectedAgentId,
  runningSubagents,
  movedFrom,
  pendingDrafts,
  backdrop,
  onOpen,
  onFork,
  onArchive,
  onRename,
}: WorkspaceChatsProps) {
  const open = useCallback((agent: PaseoAgent) => onOpen(slot, agent), [onOpen, slot]);
  const fork = useCallback((agent: PaseoAgent) => onFork(slot, agent), [onFork, slot]);
  const rename = useCallback((agent: PaseoAgent, name: string) => onRename(slot, agent, name), [onRename, slot]);
  return (
    <>
      {rows.map((row) => (
        <ChatRowView
          key={row.agent.id}
          row={row}
          theme={theme}
          selected={row.agent.id === selectedAgentId}
          subagentsRunning={runningSubagents.has(row.agent.id)}
          movedFrom={movedFrom.get(row.agent.id) ?? null}
          pendingMessage={row.agent.id !== selectedAgentId && pendingDrafts.has(row.agent.id)}
          backdrop={backdrop}
          onOpen={open}
          onFork={fork}
          onArchive={onArchive}
          onRename={rename}
        />
      ))}
      <ArchivedChats
        theme={theme}
        chats={archived}
        loading={archivedLoading}
        headingIndent={archivedIndent}
        selectedAgentId={selectedAgentId}
        backdrop={backdrop}
        onExpand={onExpandArchived}
        onOpen={open}
      />
    </>
  );
});

/** Renders nothing in the sidebar header; each workspace's chats render under its row */
export function createSidebarChats(
  client: PluginClientContext,
  controller: Controller,
): ComponentType<PluginSidebarItemProps> {
  return function SidebarChats({ theme, host }: PluginSidebarItemProps) {
    const paseo = usePaseo();
    const toast = useToast();
    const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
    const collapsedWorkspaces = useSyncExternalStore(subscribeCollapsed, getCollapsed);
    const agents = useHostAgents(paseo);
    const workspaces = useHostWorkspaces(paseo);
    const runningSubagents = useRunningSubagents(paseo, host.id);
    const pendingDrafts = usePendingDrafts(host.id, controller);
    const lineage = useSettings(forkLineage);
    const storedParents = lineage.status === "ready" ? lineage.values.parents : EMPTY_PARENTS;
    const placementSettings = useSettings(chatPlacement);
    const storedPlacement: Placement = placementSettings.status === "ready" ? placementSettings.values : EMPTY_PLACEMENT;
    // A drop shows at once; the stored placement takes over once it holds the drop
    const [optimistic, setOptimistic] = useState<Placement | null>(null);
    useEffect(() => {
      if (optimistic && samePlacement(storedPlacement, optimistic)) setOptimistic(null);
    }, [storedPlacement, optimistic]);
    const placement = optimistic ?? storedPlacement;

    useEffect(
      () =>
        controller.bindHost(host.id, {
          recordFork: (child, parent) => recordFork(client.rpc, child, parent),
        }),
      [host.id],
    );

    // Until the workspaces load, a move cannot be checked and is trusted
    const isLive = useCallback(
      (workspaceId: string) => !workspaces.gone.has(workspaceId) && (!workspaces.loaded || workspaces.byId.has(workspaceId)),
      [workspaces],
    );

    const { placedChats, rowsByWorkspace, movedFrom, movedInto } = useMemo(() => {
      const parents = { ...storedParents, ...snapshot.localForkParents };
      const chats = [...agents.values()].filter((agent) => agent.workspaceId && !agent.archivedAt && !agent.internal);
      const placed: PlacedChat[] = chats.map((agent) => ({
        id: agent.id,
        workspaceId: agent.workspaceId ?? "",
        parentId: parents[agent.id] ?? agent.labels[PARENT_AGENT_LABEL],
      }));
      const shownIn = placeChats(placed, placement.moves, isLive);
      const chatsByWorkspace = new Map<string, PaseoAgent[]>();
      const moved = new Map<string, string>();
      const into = new Map<string, Set<string>>();
      for (const agent of chats) {
        const workspaceId = shownIn.get(agent.id) ?? agent.workspaceId ?? "";
        const listed = chatsByWorkspace.get(workspaceId) ?? [];
        listed.push(agent);
        chatsByWorkspace.set(workspaceId, listed);
        if (agent.workspaceId && workspaceId !== agent.workspaceId) {
          moved.set(agent.id, workspaces.byId.get(agent.workspaceId)?.name ?? "another workspace");
          into.set(workspaceId, (into.get(workspaceId) ?? new Set()).add(agent.id));
        }
      }
      const rows = new Map<string, ChatRow<PaseoAgent>[]>();
      for (const [workspaceId, listed] of chatsByWorkspace) {
        rows.set(workspaceId, buildChatRows(listed, parents, placement.order[workspaceId]));
      }
      return { placedChats: placed, rowsByWorkspace: rows, movedFrom: moved.size > 0 ? moved : NO_MOVED, movedInto: into };
    }, [agents, storedParents, snapshot.localForkParents, placement, isLive, workspaces.byId]);

    // Opening a moved chat shows it in the workspace it is listed under; its tab must survive there
    useEffect(() => {
      controller.setMovedChats(host.id, movedInto);
    }, [host.id, movedInto]);
    useEffect(() => () => controller.setMovedChats(host.id, new Map()), [host.id]);

    // A chat moved to a workspace that is archived goes back where it belongs, for good
    useEffect(() => {
      if (withoutMovesTo(storedPlacement, (workspaceId) => workspaces.gone.has(workspaceId)) === storedPlacement) return;
      updatePlacement(client.rpc, (current) => withoutMovesTo(current, (workspaceId) => workspaces.gone.has(workspaceId))).catch(
        (error: unknown) => console.warn("[better-chat-management] Could not return moved chats", error),
      );
    }, [storedPlacement, workspaces.gone]);

    const handleDrop = useCallback(
      (drop: ChatDrop) => {
        const toWorkspace = drop.toKey.slice(drop.toKey.lastIndexOf(":") + 1);
        const targetRowIds = (rowsByWorkspace.get(toWorkspace) ?? EMPTY_ROWS).map((row) => row.agent.id);
        const change = (current: Placement) =>
          drop.toKey === drop.fromKey
            ? reorderChat(current, toWorkspace, targetRowIds, drop.agentId, drop.beforeId)
            : moveChat(current, placedChats, isLive, {
                chatId: drop.agentId,
                target: toWorkspace,
                targetRowIds,
                beforeId: drop.beforeId,
              });
        const next = change(placement);
        setOptimistic(next);
        updatePlacement(client.rpc, change)
          .then(() => setTimeout(() => setOptimistic((current) => (current === next ? null : current)), PLACEMENT_SETTLE_MS))
          .catch((error: unknown) => {
            setOptimistic(null);
            toast.error(error instanceof Error ? error.message : "Could not save where the chat goes");
          });
      },
      [rowsByWorkspace, placedChats, isLive, placement, toast],
    );
    const dropRef = useRef(handleDrop);
    dropRef.current = handleDrop;
    useEffect(() => installChatDrag(host.id, (drop) => dropRef.current(drop)), [host.id]);

    // Archived chats load on demand: the live list leaves them out
    const [fetchedArchived, setFetchedArchived] = useState<readonly PaseoAgent[] | null>(null);
    const [archivedLoading, setArchivedLoading] = useState(false);
    const loadArchived = useCallback(() => {
      setArchivedLoading(true);
      paseo.agents
        .list({
          filter: { includeArchived: true },
          sort: [{ key: "updated_at", direction: "desc" }],
          page: { limit: ARCHIVED_PAGE_LIMIT },
        })
        .then(({ entries }) => setFetchedArchived(entries.map((entry) => entry.agent).filter((agent) => agent.archivedAt)))
        .catch((error: unknown) => toast.error(error instanceof Error ? error.message : "Could not load archived chats"))
        .finally(() => setArchivedLoading(false));
    }, [paseo, toast]);
    const archivedByWorkspace = useMemo(() => {
      if (!fetchedArchived) return null;
      // Chats archived since the fetch arrive through the live list with archivedAt set
      const byId = new Map<string, PaseoAgent>();
      for (const agent of fetchedArchived) byId.set(agent.id, agent);
      for (const agent of agents.values()) {
        if (agent.archivedAt) byId.set(agent.id, agent);
        else byId.delete(agent.id);
      }
      const grouped = new Map<string, PaseoAgent[]>();
      for (const agent of byId.values()) {
        if (!agent.workspaceId || agent.internal) continue;
        const chats = grouped.get(agent.workspaceId) ?? [];
        chats.push(agent);
        grouped.set(agent.workspaceId, chats);
      }
      for (const chats of grouped.values()) {
        chats.sort((left, right) => (right.archivedAt ?? "").localeCompare(left.archivedAt ?? ""));
      }
      return grouped;
    }, [agents, fetchedArchived]);

    // Heading glyph halfway between the workspace row's status glyph and the chats' glyphs
    const chatGlyphCenter = ARCHIVED_BASE_INDENT + LEAD_SLOT_WIDTH / 2;
    const workspaceGlyphCenter = snapshot.workspaceGlyphCenter ?? chatGlyphCenter;
    const archivedIndent = Math.max(0, (workspaceGlyphCenter + chatGlyphCenter) / 2 - LEAD_SLOT_WIDTH / 2);

    const showError = useCallback((message: string) => toast.error(message), [toast]);
    const handleOpen = useCallback(
      (slot: ChatSlot, agent: PaseoAgent) => {
        // Archived chats open pinned so Paseo keeps their tab; a message sent there unarchives them
        const options = agent.archivedAt ? { pin: true } : undefined;
        if (!controller.openTarget(slot.serverId, slot.workspaceId, { kind: "agent", agentId: agent.id }, options)) {
          toast.error("Could not open this chat");
        }
      },
      [toast],
    );
    const handleFork = useCallback(
      async (slot: ChatSlot, agent: PaseoAgent) => {
        try {
          await forkChat(controller, { serverId: slot.serverId, workspaceId: slot.workspaceId, agent });
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not fork this chat");
        }
      },
      [toast],
    );

    const handleRename = useCallback(
      async (slot: ChatSlot, agent: PaseoAgent, name: string) => {
        try {
          await renameChat(slot.serverId, agent.id, name);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not rename this chat");
        }
      },
      [toast],
    );
    const handleArchive = useCallback(
      async (agent: PaseoAgent) => {
        try {
          await paseo.agents.ref(agent.id).archive();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Could not archive this chat");
          throw error;
        }
      },
      [paseo, toast],
    );

    return (
      <>
        {snapshot.slots
          .filter((slot) => slot.serverId === host.id)
          .map((slot) => {
            if (slot.kind === "info") {
              const directory = workspaces.byId.get(slot.workspaceId)?.directory;
              return createDomPortal(
                // The whole host line answers left clicks as the workspace row does
                <Pressable
                  style={styles.info}
                  onPress={() => pressWorkspaceRow(slot.workspaceKey)}
                  accessibilityRole="button"
                  accessibilityLabel="Select workspace"
                >
                  <Icon name="Monitor" size={HOST_ICON_SIZE} color={theme.colors.foregroundMuted} />
                  <Text style={[styles.infoHost, { color: theme.colors.foregroundMuted }]} numberOfLines={1} selectable={false}>
                    {host.label}
                  </Text>
                  {directory ? (
                    <PathMenu
                      path={directory}
                      theme={theme}
                      style={styles.infoPathFrame}
                      onError={showError}
                    >
                      <Text
                        style={[styles.infoPath, { color: theme.colors.foregroundMuted }]}
                        numberOfLines={1}
                        ellipsizeMode="middle"
                        selectable={false}
                      >
                        {`${INFO_SEPARATOR}${directory}`}
                      </Text>
                    </PathMenu>
                  ) : null}
                </Pressable>,
                slot.element,
                slot.id,
              );
            }
            if (slot.kind === "new-chat") {
              return createDomPortal(
                <NewChatButton
                  slot={slot}
                  theme={theme}
                  paseo={paseo}
                  controller={controller}
                  onError={showError}
                />,
                slot.element,
                slot.id,
              );
            }
            // A collapsed workspace keeps its host line and drops its chats and archived entry
            if (collapsedWorkspaces.has(slot.workspaceKey)) return null;
            const rows = rowsByWorkspace.get(slot.workspaceId) ?? EMPTY_ROWS;
            const selectedAgentId = snapshot.selectedWorkspaceKeys.includes(slot.workspaceKey)
              ? (snapshot.currentChatAgentIdByWorkspace[slot.workspaceKey] ?? null)
              : null;
            return createDomPortal(
              <WorkspaceChats
                slot={slot}
                rows={rows}
                archived={archivedByWorkspace ? (archivedByWorkspace.get(slot.workspaceId) ?? EMPTY_AGENTS) : null}
                archivedLoading={archivedLoading}
                archivedIndent={archivedIndent}
                onExpandArchived={loadArchived}
                theme={theme}
                selectedAgentId={selectedAgentId}
                runningSubagents={runningSubagents}
                movedFrom={movedFrom}
                pendingDrafts={pendingDrafts}
                backdrop={snapshot.selectedBackdrop}
                onOpen={handleOpen}
                onFork={handleFork}
                onArchive={handleArchive}
                onRename={handleRename}
              />,
              slot.element,
              slot.id,
            );
          })}
      </>
    );
  };
}

const styles = StyleSheet.create({
  info: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingLeft: BASE_INDENT,
    paddingRight: 8,
    paddingBottom: 6,
    // Sits 1px closer to the row above without moving the chats below
    transform: [{ translateY: -1 }],
  },
  infoHost: {
    flexShrink: 0,
    fontSize: 11,
  },
  infoPathFrame: {
    flex: 1,
    minWidth: 0,
  },
  infoPath: {
    fontSize: 11,
  },
  rowFrame: {
    flexDirection: "row",
    alignItems: "center",
    height: ROW_HEIGHT,
    borderRadius: 6,
  },
  row: {
    flex: 1,
    minWidth: 0,
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 4,
  },
  dotSlot: {
    width: 14,
    marginRight: 6,
    alignItems: "center",
    justifyContent: "center",
    // Drawn 2px right of its slot, like the workspace row's dot (web.ts), without moving the title
    transform: [{ translateX: 2 }],
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
  },
  titleInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderRadius: 4,
  },

  marks: {
    position: "absolute",
    top: 0,
    bottom: 0,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: MARK_GAP,
  },
  forkSlot: {
    width: ROW_HEIGHT,
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
});
