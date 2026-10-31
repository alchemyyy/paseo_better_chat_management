import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { usePaseo, useSettings } from "@getpaseo/plugin/client";
import { Icon, useToast } from "@getpaseo/plugin/client/ui";
import { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ComponentType } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { forkLineage } from "../shared/lineage";
import { buildChatRows, type ChatRow } from "./chat-tree";
import { getCollapsed, subscribeCollapsed } from "./collapsed-workspaces";
import type { ChatSlot, Controller } from "./controller";
import type { RowBackdrop } from "./web";
import { forkChat, type PaseoAgent } from "./fork";
import { HoverIconButton } from "./hover-button";
import { PathMenu } from "./path-menu";
import { recordFork } from "./lineage";
import { chatStatus, StatusGlyph } from "./status-glyph";
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

/** workspaceId -> the folder the workspace runs in */
function useHostWorkspaceDirectories(paseo: ReturnType<typeof usePaseo>): ReadonlyMap<string, string> {
  const [directories, setDirectories] = useState<ReadonlyMap<string, string>>(() => new Map());
  useEffect(() => {
    let stopped = false;
    let release: (() => Promise<void>) | null = null;
    const directoryOf = (workspace: { workspaceDirectory?: string; projectRootPath: string }) =>
      workspace.workspaceDirectory ?? workspace.projectRootPath;
    const replace = (entries: readonly { id: string; workspaceDirectory?: string; projectRootPath: string }[]) =>
      setDirectories(new Map(entries.map((workspace) => [workspace.id, directoryOf(workspace)])));
    paseo.workspaces
      .list({ subscribe: {}, page: { limit: WORKSPACE_PAGE_LIMIT } })
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
            setDirectories((previous) => {
              const next = new Map(previous);
              if (update.kind === "remove") next.delete(update.id);
              else next.set(update.workspace.id, directoryOf(update.workspace));
              return next;
            });
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
  return directories;
}

interface ChatRowViewProps {
  row: ChatRow<PaseoAgent>;
  theme: Theme;
  selected: boolean;
  /** The selected workspace row's background, copied so chats highlight alike */
  backdrop: RowBackdrop | null;
  onOpen(agent: PaseoAgent): void;
  onFork(agent: PaseoAgent): Promise<void>;
  onArchive(agent: PaseoAgent): Promise<void>;
  onRename(agent: PaseoAgent, name: string): Promise<void>;
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
  backdrop,
  onOpen,
  onFork,
  onArchive,
  onRename,
}: ChatRowViewProps) {
  const { agent, depth } = row;
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
  const dataSet = { betterChatAgent: agent.id } as object;

  return (
    <View
      {...{ dataSet }}
      style={[styles.rowFrame, frameHighlight]}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
    >
      {renaming ? (
        // A plain row while editing: a Pressable around the input would take its Space and Enter
        <View style={[styles.row, { paddingLeft: BASE_INDENT + depth * DEPTH_INDENT }]}>
          <View style={styles.dotSlot}>
            <StatusGlyph status={chatStatus(agent)} theme={theme} />
          </View>
          <TitleEditor initial={agent.title ?? ""} theme={theme} onDone={handleRenamed} />
        </View>
      ) : (
        <Pressable
          style={[styles.row, { paddingLeft: BASE_INDENT + depth * DEPTH_INDENT }]}
          onPress={handleOpen}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          accessibilityLabel={agent.title ?? UNTITLED_CHAT}
        >
          <View style={styles.dotSlot}>
            <StatusGlyph status={chatStatus(agent)} theme={theme} />
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
    const directories = useHostWorkspaceDirectories(paseo);
    const lineage = useSettings(forkLineage);
    const storedParents = lineage.status === "ready" ? lineage.values.parents : EMPTY_PARENTS;

    useEffect(
      () =>
        controller.bindHost(host.id, {
          recordFork: (child, parent) => recordFork(client.rpc, child, parent),
        }),
      [host.id],
    );

    const rowsByWorkspace = useMemo(() => {
      const parents = { ...storedParents, ...snapshot.localForkParents };
      const chatsByWorkspace = new Map<string, PaseoAgent[]>();
      for (const agent of agents.values()) {
        if (!agent.workspaceId || agent.archivedAt || agent.internal) continue;
        const chats = chatsByWorkspace.get(agent.workspaceId) ?? [];
        chats.push(agent);
        chatsByWorkspace.set(agent.workspaceId, chats);
      }
      const rows = new Map<string, ChatRow<PaseoAgent>[]>();
      for (const [workspaceId, chats] of chatsByWorkspace) rows.set(workspaceId, buildChatRows(chats, parents));
      return rows;
    }, [agents, storedParents, snapshot.localForkParents]);

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
                  {directories.get(slot.workspaceId) ? (
                    <PathMenu
                      path={directories.get(slot.workspaceId) ?? ""}
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
                        {`${INFO_SEPARATOR}${directories.get(slot.workspaceId)}`}
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

  forkSlot: {
    width: ROW_HEIGHT,
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
});
