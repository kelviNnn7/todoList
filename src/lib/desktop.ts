export type Unlisten = () => void;

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;

export const isDesktopRuntime = () => isTauriRuntime();

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const api = await import("@tauri-apps/api/core");
  return api.invoke<T>(command, args);
}

export async function listen<T>(event: string, listener: (payload: T) => void): Promise<Unlisten> {
  const api = await import("@tauri-apps/api/event");
  return api.listen<T>(event, ({ payload }) => listener(payload));
}

export async function isAutostartEnabled(): Promise<boolean> {
  const plugin = await import("@tauri-apps/plugin-autostart");
  return plugin.isEnabled();
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  const plugin = await import("@tauri-apps/plugin-autostart");
  if (enabled) await plugin.enable();
  else await plugin.disable();
}

export async function sendMeetingNotification(title: string, body: string): Promise<void> {
  const plugin = await import("@tauri-apps/plugin-notification");
  let granted = await plugin.isPermissionGranted();
  if (!granted) granted = (await plugin.requestPermission()) === "granted";
  if (granted) plugin.sendNotification({ title, body });
}

export async function startDragging(): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().startDragging();
}

export async function startResizeDragging(direction: string): Promise<void> {
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().startResizeDragging(direction as Parameters<ReturnType<typeof getCurrentWindow>["startResizeDragging"]>[0]);
}
