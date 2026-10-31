import type { PluginServerContext } from "@getpaseo/plugin/server";
import { openFolder } from "./server/file-browser";
import { openFolderRpc } from "./shared/file-browser";
import { forkLineage } from "./shared/lineage";

export default function contribute(server: PluginServerContext) {
  server.registerSettings(forkLineage);
  server.handle(openFolderRpc, openFolder);
  return () => {};
}
