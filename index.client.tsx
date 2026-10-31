import type { PluginClientContext } from "@getpaseo/plugin/client";
import { retainController } from "./client/controller";
import { createSidebarChats } from "./client/sidebar-chats";
import { IS_WEB } from "./client/web";

export default function contribute(client: PluginClientContext) {
  // The sidebar rows and tab strip it rearranges exist as DOM only on web and Electron
  if (!IS_WEB) return () => {};
  const { controller, release } = retainController();
  client.addSidebarHeaderItem({
    id: "chats",
    title: "Chats in sidebar",
    Component: createSidebarChats(client, controller),
  });
  return release;
}
