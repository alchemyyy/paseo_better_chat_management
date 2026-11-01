# Better chat management

Paseo plugin that lists chats under their workspace in the sidebar, nests forks under their source chat, and keeps only the current chat's tabs in the tab strip.

## Install

Requires [Paseo](https://paseo.sh) 0.13.0 or later with plugins turned on (Settings > Plugins > Enable plugins).

```sh
paseo plugin install https://github.com/alchemyyy/paseo_better_chat_management
```

`paseo plugin update better-chat-management` updates it, and `paseo plugin remove better-chat-management` removes it. The [Plugin manager](https://github.com/alchemyyy/paseo_plugin_manager) plugin checks and updates installed plugins from the sidebar.

The `paseo` command comes with the desktop app: Settings > Integrations > Command line puts it on `PATH`, or run `paseo.cmd` from the app's `resources\bin` folder.

To work on the plugin, clone this repository and install the folder instead (`paseo plugin install <folder>`), then run `paseo plugin reload better-chat-management` after editing it.

## Features

### Sidebar chats
- Each workspace row lists its chats underneath. Forks nest under the chat they were forked from, chats launched by another agent nest under their launcher, and siblings sort oldest first.
- Each chat row shows a status glyph matching the workspace row's (including the running ring), the title ("New chat" if untitled), and a compact last-activity time (`now`, `5m`, `2h`, `3d`, then a date).
- Click a chat to open it. Double-click to rename it inline: Enter or leaving the box saves, Escape cancels.
- Each row has **Fork chat** and **Archive chat** buttons. Forking opens a draft in the same workspace that carries the chat history and the source chat's provider, model, mode, and features.
- The open chat's row is highlighted like the selected workspace row.
- A collapsed **Archived** entry at the end of each workspace's chats lists its archived chats, newest first, and reloads them on every expand. An archived chat opens pinned so its tab stays open. Sending a message there unarchives it.
- Under the selected workspace row, an info line shows the host name and the workspace folder.
- Workspace rows get a **+** (new chat) button and an always-visible **Workspace actions** menu button. Left-click **+** opens a draft with the composer's remembered settings. Right-click lists the host's backends and starts the draft with the one you pick. The menu button opens the row's own context menu.
- Workspace rows no longer show hover highlights, the hover-only menu, or the hover card. Project rows are more compact.
- Drag a workspace row to reorder it within its project, the way projects reorder; its chats move with it. The first drop switches the sidebar's Sort to Manual, since Paseo shows a saved workspace order only under that sort. Drag past the project's first or last workspace and the gesture becomes a drag of the whole project, as if it had started on the project row. Escape cancels a workspace drag. Pinned workspaces keep Paseo's own drag.

### Tab strip
- Chat tabs are hidden, except the current chat's, which stays visible at the left.
- Chat tabs (started chats and drafts) can grow to 480px, three times Paseo's 160px tab limit, to show more of the title. A short title keeps its normal width. In a crowded strip the chat tab shrinks first, but never below Paseo's own width, so other tabs stay in view.
- Tabs opened while a chat is current belong to that chat and hide when you switch to another chat. Tabs that were already open when the plugin loaded, and focused tabs, stay visible.
- New file tabs open in the side pane next to the chat. A file that is already open is shown where it is. When Paseo's file preview would replace an unmodified file tab, the new file opens as a separate tab beside it.
- The file tab context menu adds **Split left/right/up/down**.
- The plugin replaces Paseo's close-left/right/others. Its version skips the confirmation dialog and closes only file-like, diff, plugin, and setup tabs. It never closes chats, terminals, browsers, tabs with unsaved changes, or tabs pinned with the [editor-enhancements](https://github.com/alchemyyy/paseo_editor_enhancements) plugin.

Pinned tabs, the per-pane LRU limit, gutter line references, and companion editor windows moved to editor-enhancements.

### Data
- Fork lineage (fork id to source chat id) is stored in a host-scoped plugin settings document, `fork-lineage`, because Paseo does not record it.
- Tab ownership is kept in the app's `localStorage` under the plugin's former id, `better-chat-display`. Without storage it lasts only for the session.

## Limitations

- Runs only in Paseo's web and desktop (Electron) UI.
- The plugin SDK cannot reach the sidebar rows, tab strip, fork flow, or rename. The plugin reaches them through Paseo's internal DOM test ids, React fibers, and zustand stores, so a Paseo update can break these features.
