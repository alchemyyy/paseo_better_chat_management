// A workspace path that opens a small menu on right-click: the full path, and an action to show the
// folder in the host's file browser. Left clicks pass on to the host line around it. The menu is
// portalled to document.body with fixed positioning, so the sidebar's overflow clipping cannot cut
// it off. Web-only; native renders the child alone.
import type { PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/ui";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { openFolderRpc } from "../shared/file-browser";
import { createDomPortal, type DomElement } from "./web";

type Theme = PluginSidebarItemProps["theme"];

// This plugin typechecks without the DOM library. Declare only what this module uses.
interface AnchorElement {
  getBoundingClientRect(): { left: number; top: number; bottom: number };
  contains(other: unknown): boolean;
}
interface MenuEvent {
  readonly key?: string;
  readonly target: unknown;
  preventDefault?(): void;
}
declare const document: {
  body: DomElement;
  addEventListener(type: string, listener: (event: MenuEvent) => void, capture: boolean): void;
  removeEventListener(type: string, listener: (event: MenuEvent) => void, capture: boolean): void;
};
declare const window: {
  innerWidth: number;
  innerHeight: number;
  addEventListener(type: string, listener: () => void, capture: boolean): void;
  removeEventListener(type: string, listener: () => void, capture: boolean): void;
};

const MENU_WIDTH = 360;
const MENU_OFFSET_PX = 4;
const VIEWPORT_MARGIN_PX = 8;
const PATH_FONT_SIZE = 14;
const ITEM_FONT_SIZE = 13;
const ICON_SIZE = 14;

export function PathMenu({
  path,
  theme,
  style,
  onError,
  children,
}: {
  path: string;
  theme: Theme;
  style?: object;
  onError(message: string): void;
  children: ReactNode;
}) {
  const openFolder = useRpc(openFolderRpc);
  const anchor = useRef<View>(null);
  const menu = useRef<View>(null);
  const [position, setPosition] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const [hovered, setHovered] = useState(false);
  const close = useCallback(() => {
    setPosition(null);
    setHovered(false);
  }, []);

  const toggle = useCallback((event: MenuEvent) => {
    // Paseo's window menu would otherwise open over ours
    event.preventDefault?.();
    if (position) {
      close();
      return;
    }
    // React Native Web refs are the DOM element
    const element = anchor.current as unknown as AnchorElement | null;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const left = Math.max(VIEWPORT_MARGIN_PX, Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN_PX));
    // Opens below the path; the lower half of the window opens it above instead
    const above = rect.bottom > window.innerHeight / 2;
    setPosition({ left, top: above ? rect.top - MENU_OFFSET_PX : rect.bottom + MENU_OFFSET_PX, above });
  }, [close, position]);

  // A press outside the menu and path, Escape, scrolling, or resizing closes it
  useEffect(() => {
    if (!position) return;
    const outside = (event: MenuEvent) => {
      const menuElement = menu.current as unknown as AnchorElement | null;
      const anchorElement = anchor.current as unknown as AnchorElement | null;
      if (menuElement?.contains(event.target) || anchorElement?.contains(event.target)) return;
      close();
    };
    const escape = (event: MenuEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close, true);
    };
  }, [close, position]);

  const handleOpenFolder = useCallback(() => {
    close();
    openFolder({ path }).catch((error: unknown) =>
      onError(`Could not open the folder: ${error instanceof Error ? error.message : String(error)}`),
    );
  }, [close, onError, openFolder, path]);

  if (Platform.OS !== "web") return <View style={style}>{children}</View>;
  return (
    <>
      {/* React Native Web forwards onContextMenu to the DOM; its types do not declare it */}
      <View ref={anchor} style={style} accessibilityLabel={path} {...({ onContextMenu: toggle } as object)}>
        {children}
      </View>
      {position
        ? createDomPortal(
            <View
              ref={menu}
              accessibilityRole="menu"
              style={[
                styles.menu,
                {
                  left: position.left,
                  // Anchored by its bottom edge when it opens above the path
                  ...(position.above
                    ? { bottom: window.innerHeight - position.top }
                    : { top: position.top }),
                  backgroundColor: theme.colors.surface1,
                  borderColor: theme.colors.border,
                },
              ]}
            >
              <Text style={[styles.path, { color: theme.colors.foreground }]} selectable>
                {path}
              </Text>
              <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
              <Pressable
                accessibilityRole="menuitem"
                style={[styles.item, hovered ? { backgroundColor: theme.colors.surface2 } : null]}
                onHoverIn={() => setHovered(true)}
                onHoverOut={() => setHovered(false)}
                onPress={handleOpenFolder}
              >
                <Icon name="FolderOpen" size={ICON_SIZE} color={theme.colors.foregroundMuted} />
                <Text style={[styles.itemLabel, { color: theme.colors.foreground }]} numberOfLines={1}>
                  Open in file browser
                </Text>
              </Pressable>
            </View>,
            document.body,
            `path-menu-${path}`,
          )
        : null}
    </>
  );
}

const styles = StyleSheet.create({
  menu: {
    // React Native Web passes `fixed` through to CSS; the type only lists native values
    position: "fixed" as "absolute",
    zIndex: 2147483647,
    width: MENU_WIDTH,
    maxWidth: `calc(100vw - ${VIEWPORT_MARGIN_PX * 2}px)` as unknown as number,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  path: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: PATH_FONT_SIZE,
    lineHeight: 20,
    fontWeight: "400",
    // Long paths wrap anywhere rather than overflowing the menu
    wordBreak: "break-all",
  } as object,
  separator: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 4,
    marginHorizontal: 8,
  },
  item: {
    height: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
  },
  itemLabel: {
    flex: 1,
    fontSize: ITEM_FONT_SIZE,
    fontWeight: "400",
  },
});
