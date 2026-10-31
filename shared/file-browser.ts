import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** Opens a folder on the daemon host in its OS file browser */
export const openFolderRpc = defineRpc({
  name: "chat-management.open-folder",
  input: z.object({ path: z.string().min(1) }),
  output: z.object({}),
});
