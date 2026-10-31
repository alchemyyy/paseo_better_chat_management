import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { memo, type ReactNode, useCallback, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ChatTimestamp } from "./chat-timestamp";
import type { PaseoAgent } from "./fork";
import type { RowBackdrop } from "./web";

type Theme = PluginSidebarItemProps["theme"];

const TOGGLE_HEIGHT = 28;
const ROW_HEIGHT = 26;
/** Chat rows' left padding (2px in from Paseo's rows, with web.ts WORKSPACE_ROW_PULL_PX); their status glyph centres half a lead slot past it */
export const BASE_INDENT = 28;
const CHEVRON_SIZE = 12;
const CHEVRON_NUDGE = 1;
/** Extra inset of the "Archived" heading past its computed glyph position */
const HEADING_INSET = 11;
/** Chat rows' status glyph slot and its gap to the title (sidebar-chats.tsx) */
export const LEAD_SLOT_WIDTH = 14;
const LEAD_GAP = 6;
const HOVER_TINT = 0.06;
const UNTITLED_CHAT = "New chat";

interface ArchivedChatsProps {
  theme: Theme;
  /** This workspace's archived chats, newest first; null until loaded */
  chats: readonly PaseoAgent[] | null;
  loading: boolean;
  /** Left padding that puts the heading's glyph halfway between the workspace and chat glyphs */
  headingIndent: number;
  /** The workspace's current chat, highlighted like an active chat when it is archived */
  selectedAgentId: string | null;
  backdrop: RowBackdrop | null;
  /** Asks for a fresh archived list; called on every expand */
  onExpand(): void;
  onOpen(agent: PaseoAgent): void;
}

/** A collapsed "Archived" entry at the end of a workspace's chats that lists its archived chats */
export const ArchivedChats = memo(function ArchivedChats({
  theme,
  chats,
  loading,
  headingIndent,
  selectedAgentId,
  backdrop,
  onExpand,
  onOpen,
}: ArchivedChatsProps) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => {
    setExpanded((current) => {
      if (!current) onExpand();
      return !current;
    });
  }, [onExpand]);

  const label = "Archived";

  return (
    <>
      <HoverRow theme={theme} height={TOGGLE_HEIGHT} indent={headingIndent + HEADING_INSET} onPress={toggle} accessibilityLabel={label}>
        <View style={styles.leadSlot}>
          <Icon name="Archive" size={CHEVRON_SIZE} color={theme.colors.foregroundMuted} />
        </View>
        <Text style={[styles.toggleText, { color: theme.colors.foregroundMuted }]} numberOfLines={1} selectable={false}>
          {label}
        </Text>
        <View style={styles.chevron}>
          <Icon name={expanded ? "ChevronDown" : "ChevronRight"} size={CHEVRON_SIZE} color={theme.colors.foregroundMuted} />
        </View>
      </HoverRow>
      {expanded && loading && !chats ? (
        <Text style={[styles.note, { color: theme.colors.foregroundMuted }]}>Loading...</Text>
      ) : null}
      {expanded && chats && chats.length === 0 ? (
        <Text style={[styles.note, { color: theme.colors.foregroundMuted }]}>No archived chats</Text>
      ) : null}
      {expanded && chats
        ? chats.map((agent) => (
            <ArchivedRow
              key={agent.id}
              agent={agent}
              theme={theme}
              selected={agent.id === selectedAgentId}
              backdrop={backdrop}
              onOpen={onOpen}
            />
          ))
        : null}
    </>
  );
});

const ArchivedRow = memo(function ArchivedRow({
  agent,
  theme,
  selected,
  backdrop,
  onOpen,
}: {
  agent: PaseoAgent;
  theme: Theme;
  selected: boolean;
  backdrop: RowBackdrop | null;
  onOpen(agent: PaseoAgent): void;
}) {
  const handlePress = useCallback(() => onOpen(agent), [agent, onOpen]);
  const archivedAt = agent.archivedAt ? new Date(agent.archivedAt) : new Date(agent.updatedAt);
  return (
    <HoverRow
      theme={theme}
      height={ROW_HEIGHT}
      indent={BASE_INDENT}
      agentId={agent.id}
      highlight={selected ? (backdrop ?? { color: theme.colors.surface2, radius: "6px" }) : null}
      onPress={handlePress}
      accessibilityLabel={agent.title ?? UNTITLED_CHAT}
    >
      <View style={[styles.leadSlot, styles.rowLead]}>
        <Icon name="Archive" size={CHEVRON_SIZE} color={theme.colors.foregroundMuted} />
      </View>
      <Text
        style={[styles.title, { color: selected ? theme.colors.foreground : theme.colors.foregroundMuted }]}
        numberOfLines={1}
        selectable={false}
      >
        {agent.title ?? UNTITLED_CHAT}
      </Text>
      <ChatTimestamp at={archivedAt} theme={theme} />
    </HoverRow>
  );
});

/** A full-width pressable row with the hover tint pattern from docs/hover.md */
function HoverRow({
  theme,
  height,
  indent,
  highlight = null,
  agentId,
  onPress,
  accessibilityLabel,
  children,
}: {
  theme: Theme;
  height: number;
  indent: number;
  /** A persistent background, such as the current chat's */
  highlight?: RowBackdrop | null;
  /** Lets the controller mark this row when it is the open chat (web.ts markCurrentChat) */
  agentId?: string;
  onPress(): void;
  accessibilityLabel: string;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const handleEnter = useCallback(() => setHovered(true), []);
  const handleLeave = useCallback(() => setHovered(false), []);
  return (
    <View
      {...(agentId ? { dataSet: { betterChatAgent: agentId } } : {})}
      style={[
        styles.frame,
        { height },
        highlight
          ? { backgroundColor: highlight.color, borderRadius: Number.parseFloat(highlight.radius) || 6 }
          : null,
      ]}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
    >
      {hovered && !highlight ? (
        <View pointerEvents="none" style={[styles.tint, { backgroundColor: theme.colors.foreground, opacity: HOVER_TINT }]} />
      ) : null}
      <Pressable style={[styles.press, { paddingLeft: indent }]} onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
        {children}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 6,
  },
  tint: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 6,
  },
  press: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: LEAD_GAP,
    paddingRight: 8,
  },
  // Sized like the workspace title (sidebar-workspace-row-content.tsx), heavier to read as a heading
  // Same lead slot as a chat row's status glyph, so text starts on the chat title rail
  leadSlot: {
    width: LEAD_SLOT_WIDTH,
    alignItems: "center",
    justifyContent: "center",
  },
  // Archived chats' icon sits where a chat row's status dot is drawn: 2px right of the slot (sidebar-chats.tsx dotSlot)
  rowLead: {
    transform: [{ translateX: 2 }],
  },
  // Shrinks rather than fills, so the chevron sits right after the text
  // Nudged down to sit on the semi-bold text's optical centre rather than its line box
  chevron: {
    marginTop: CHEVRON_NUDGE,
  },
  toggleText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 20,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    opacity: 0.8,
  },
  note: {
    fontSize: 12,
    paddingLeft: BASE_INDENT + LEAD_SLOT_WIDTH + LEAD_GAP,
    paddingVertical: 4,
  },
});
