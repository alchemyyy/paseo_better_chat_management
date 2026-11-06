import type { PluginServerContext } from "@getpaseo/plugin/server";
import { openFolder } from "./server/file-browser";
import { openFolderRpc } from "./shared/file-browser";
import { forkLineage } from "./shared/lineage";
import { chatPlacement } from "./shared/placement";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(forkLineage);
  server.registerSettings(chatPlacement);
  server.handle(openFolderRpc, openFolder);
  return () => {};
}
