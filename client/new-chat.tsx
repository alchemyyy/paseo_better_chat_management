import type { PluginSidebarItemProps, usePaseo } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { memo, useCallback, useRef, useState, useSyncExternalStore } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import type { ChatSlot, Controller } from "./controller";
import { getCollapsed, subscribeCollapsed, toggleCollapsed } from "./collapsed-workspaces";
import { HoverIconButton } from "./hover-button";
import { generateDraftId } from "./fork";
import { type DomMouseEvent, openRowContextMenu } from "./web";

type Theme = PluginSidebarItemProps["theme"];
type PaseoApi = ReturnType<typeof usePaseo>;
type ProviderEntry = Awaited<ReturnType<PaseoApi["providers"]["snapshot"]>>["entries"][number];

interface PressState {
  pressed: boolean;
  hovered?: boolean;
}

interface MenuState {
  x: number;
  y: number;
  status: "loading" | "ready" | "error";
  cwd: string | null;
  providers: readonly ProviderEntry[];
  error: string | null;
}

const PROVIDER_ICON_SIZE = 14;
const MENU_WIDTH = 220;
const MENU_OFFSET = 4;

interface NewChatButtonProps {
  slot: ChatSlot;
  theme: Theme;
  paseo: PaseoApi;
  controller: Controller;
  onError(message: string): void;
}

/**
 * The collapse, new chat, and always-visible workspace menu buttons. Collapse hides the
 * workspace's chats. New chat: left click opens a draft with the composer's remembered agent
 * settings, as the tab strip's new chat does; right click lists this host's backends and seeds
 * the draft with the pick. The menu button opens the row's own context menu, which holds the same
 * actions as its hover-only kebab. All render over the row from outside its DOM, so the row never
 * sees their presses.
 */
export const NewChatButton = memo(function NewChatButton({
  slot,
  theme,
  paseo,
  controller,
  onError,
}: NewChatButtonProps) {
  const buttonRef = useRef<View>(null);
  const menuButtonRef = useRef<View>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed).has(slot.workspaceKey);
  const toggleChats = useCallback(() => toggleCollapsed(slot.workspaceKey), [slot.workspaceKey]);

  const openDraft = useCallback(
    (setup?: Record<string, unknown>) => {
      const target = { kind: "draft", draftId: generateDraftId(), ...(setup ? { setup } : {}) };
      if (!controller.openTarget(slot.serverId, slot.workspaceId, target)) onError("Could not open a new chat");
    },
    [controller, onError, slot],
  );
  const handlePress = useCallback(() => openDraft(), [openDraft]);

  const handleContextMenu = useCallback(
    (event: DomMouseEvent) => {
      event.preventDefault();
      buttonRef.current?.measureInWindow((x, y, width, height) => {
        setMenu({ x: x + width - MENU_WIDTH, y: y + height + MENU_OFFSET, status: "loading", cwd: null, providers: [], error: null });
        Promise.all([paseo.workspaces.ref(slot.workspaceId).refresh(), paseo.providers.snapshot()])
          .then(([workspace, snapshot]) => {
            const providers = snapshot.entries.filter((entry) => entry.enabled !== false);
            const cwd = workspace?.workspaceDirectory ?? workspace?.projectRootPath ?? null;
            setMenu((current) => current && { ...current, status: "ready", cwd, providers });
          })
          .catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Could not load backends";
            setMenu((current) => current && { ...current, status: "error", error: message });
          });
      });
    },
    [paseo, slot.workspaceId],
  );

  const closeMenu = useCallback(() => setMenu(null), []);
  const openWorkspaceMenu = useCallback(() => {
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      if (!openRowContextMenu(slot.workspaceKey, x + width / 2, y + height)) onError("Could not open the workspace menu");
    });
  }, [onError, slot.workspaceKey]);
  const pickProvider = useCallback(
    (entry: ProviderEntry) => {
      const cwd = menu?.cwd;
      setMenu(null);
      if (!cwd) {
        onError("This workspace has no directory");
        return;
      }
      openDraft({
        provider: entry.provider,
        cwd,
        modeId: entry.defaultModeId ?? null,
        model: null,
        thinkingOptionId: null,
        featureValues: {},
      });
    },
    [menu?.cwd, onError, openDraft],
  );

  // React Native Web forwards onContextMenu to the DOM; its types do not declare it
  const contextMenuProps = { onContextMenu: handleContextMenu } as object;

  return (
    <>
      <HoverIconButton
        icon={collapsed ? "ChevronRight" : "ChevronDown"}
        theme={theme}
        onPress={toggleChats}
        accessibilityLabel={collapsed ? "Show chats" : "Hide chats"}
      />
      <HoverIconButton
        ref={buttonRef}
        icon="Plus"
        theme={theme}
        active={menu !== null}
        onPress={handlePress}
        accessibilityLabel="New chat"
        pressableProps={contextMenuProps}
      />
      <HoverIconButton
        ref={menuButtonRef}
        icon="MoreVertical"
        theme={theme}
        onPress={openWorkspaceMenu}
        accessibilityLabel="Workspace actions"
      />
      {menu ? (
        <Modal transparent visible onRequestClose={closeMenu}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeMenu} accessibilityLabel="Close menu" />
          <View
            style={[
              styles.menu,
              {
                left: Math.max(MENU_OFFSET, menu.x),
                top: menu.y,
                backgroundColor: theme.colors.surface1,
                borderColor: theme.colors.border,
              },
            ]}
          >
            <Text style={[styles.menuHeader, { color: theme.colors.foregroundMuted }]}>New chat with</Text>
            {menu.status === "loading" ? (
              <Text style={[styles.menuNote, { color: theme.colors.foregroundMuted }]}>Loading backends...</Text>
            ) : null}
            {menu.status === "error" ? (
              <Text style={[styles.menuNote, { color: theme.colors.statusDanger }]}>{menu.error}</Text>
            ) : null}
            {menu.status === "ready" && menu.providers.length === 0 ? (
              <Text style={[styles.menuNote, { color: theme.colors.foregroundMuted }]}>No backends enabled</Text>
            ) : null}
            {menu.providers.map((entry) => (
              <ProviderRow key={entry.provider} entry={entry} theme={theme} onPick={pickProvider} />
            ))}
          </View>
        </Modal>
      ) : null}
    </>
  );
});

const ProviderRow = memo(function ProviderRow({
  entry,
  theme,
  onPick,
}: {
  entry: ProviderEntry;
  theme: Theme;
  onPick(entry: ProviderEntry): void;
}) {
  const ready = entry.status === "ready";
  const handlePress = useCallback(() => onPick(entry), [entry, onPick]);
  const rowStyle = useCallback(
    (state: PressState) => [
      styles.menuRow,
      state.hovered || state.pressed ? { backgroundColor: theme.colors.surface2 } : null,
    ],
    [theme],
  );
  return (
    <Pressable style={rowStyle as never} onPress={handlePress} accessibilityRole="menuitem">
      <View style={styles.providerIcon}>
        {entry.iconSvg ? (
          <Icon icon={{ svg: entry.iconSvg }} size={PROVIDER_ICON_SIZE} color={theme.colors.foreground} />
        ) : (
          <Icon name="Bot" size={PROVIDER_ICON_SIZE} color={theme.colors.foregroundMuted} />
        )}
      </View>
      <Text
        style={[styles.menuLabel, { color: ready ? theme.colors.foreground : theme.colors.foregroundMuted }]}
        numberOfLines={1}
      >
        {entry.label ?? entry.provider}
      </Text>
      {ready ? null : (
        <Text style={[styles.menuStatus, { color: theme.colors.foregroundMuted }]}>{entry.status}</Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  menu: {
    position: "absolute",
    width: MENU_WIDTH,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  menuHeader: {
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  menuNote: {
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 28,
    paddingHorizontal: 10,
  },
  providerIcon: {
    width: PROVIDER_ICON_SIZE,
    alignItems: "center",
  },
  menuLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
  },
  menuStatus: {
    fontSize: 11,
  },
});
