import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import type { openFolderRpc } from "../shared/file-browser";

/** The program that shows a folder in the host's file browser, with its arguments */
function folderCommand(folder: string): { command: string; args: string[]; verbatim: boolean } {
  switch (process.platform) {
    case "win32":
      // Explorer parses its own command line: pass the quoted path verbatim. A trailing
      // backslash (a drive root) would escape the closing quote, and needs no quoting anyway.
      return { command: "explorer.exe", args: [folder.endsWith("\\") ? folder : `"${folder}"`], verbatim: true };
    case "darwin":
      return { command: "open", args: [folder], verbatim: false };
    default:
      return { command: "xdg-open", args: [folder], verbatim: false };
  }
}

/**
 * Opens a workspace folder in the daemon host's file browser. Spawns directly rather than through
 * the SDK, whose `windowsHide` starts Windows GUI programs hidden.
 */
export async function openFolder({ path: folder }: RpcInput<typeof openFolderRpc>): Promise<RpcOutput<typeof openFolderRpc>> {
  if (!path.isAbsolute(folder)) throw new Error(`Not an absolute path: ${folder}`);
  const resolved = path.resolve(folder);
  const stats = await stat(resolved).catch(() => null);
  if (!stats?.isDirectory()) throw new Error(`${resolved} is not a folder`);
  const { command, args, verbatim } = folderCommand(resolved);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      windowsVerbatimArguments: verbatim,
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
  return {};
}
