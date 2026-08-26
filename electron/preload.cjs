const { contextBridge, ipcRenderer } = require("electron");

const allowedCommands = new Set([
  "list_items",
  "upsert_item",
  "delete_item",
  "send_task_notification",
  "show_main_window",
  "set_widget_opacity",
  "set_window_mode",
  "set_position_locked",
  "set_edge_snap",
  "set_desktop_widget_mode",
  "start_window_resize",
  "update_window_resize",
  "end_window_resize"
]);
const allowedEvents = new Set(["deep-link", "position-lock-changed", "task-reminder-action"]);

contextBridge.exposeInMainWorld("desktopBridge", {
  invoke(command, args = {}) {
    if (!allowedCommands.has(command)) return Promise.reject(new Error("Unsupported desktop command"));
    return ipcRenderer.invoke(`desktop:${command}`, args);
  },
  listen(event, listener) {
    if (!allowedEvents.has(event)) return Promise.reject(new Error("Unsupported desktop event"));
    const channel = `desktop:${event}`;
    const handler = (_event, payload) => listener(payload);
    ipcRenderer.on(channel, handler);
    return Promise.resolve(() => ipcRenderer.removeListener(channel, handler));
  },
  isAutostartEnabled: () => ipcRenderer.invoke("desktop:autostart:get"),
  setAutostartEnabled: (enabled) => ipcRenderer.invoke("desktop:autostart:set", Boolean(enabled)),
  sendNotification: (options) => ipcRenderer.invoke("desktop:meeting-notification", options),
  startDragging: () => Promise.resolve(),
  startResizeDragging: (direction, point) => ipcRenderer.invoke("desktop:start_window_resize", { direction, point }),
  updateResizeDragging: (point) => ipcRenderer.invoke("desktop:update_window_resize", { point }),
  endResizeDragging: () => ipcRenderer.invoke("desktop:end_window_resize")
});
