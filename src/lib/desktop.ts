export type Unlisten = () => void;

type DesktopBridge = {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
  listen<T>(event: string, listener: (payload: T) => void): Promise<Unlisten>;
  isAutostartEnabled(): Promise<boolean>;
  setAutostartEnabled(enabled: boolean): Promise<void>;
  sendNotification(options: { title: string; body: string }): Promise<void>;
  startDragging(): Promise<void>;
  startResizeDragging(direction: string, point?: { x: number; y: number }): Promise<void>;
  updateResizeDragging(point: { x: number; y: number }): Promise<void>;
  endResizeDragging(): Promise<void>;
};

declare global {
  interface Window {
    desktopBridge?: DesktopBridge;
  }
}

const isTauriRuntime = () => "__TAURI_INTERNALS__" in window;
const bridge = () => window.desktopBridge;

export const isDesktopRuntime = () => isTauriRuntime() || Boolean(bridge());
export const isElectronRuntime = () => Boolean(bridge());

export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const desktop = bridge();
  if (desktop) return desktop.invoke<T>(command, args);
  const api = await import("@tauri-apps/api/core");
  return api.invoke<T>(command, args);
}

export async function listen<T>(event: string, listener: (payload: T) => void): Promise<Unlisten> {
  const desktop = bridge();
  if (desktop) return desktop.listen<T>(event, listener);
  const api = await import("@tauri-apps/api/event");
  return api.listen<T>(event, ({ payload }) => listener(payload));
}

export async function isAutostartEnabled(): Promise<boolean> {
  const desktop = bridge();
  if (desktop) return desktop.isAutostartEnabled();
  const plugin = await import("@tauri-apps/plugin-autostart");
  return plugin.isEnabled();
}

export async function setAutostartEnabled(enabled: boolean): Promise<void> {
  const desktop = bridge();
  if (desktop) return desktop.setAutostartEnabled(enabled);
  const plugin = await import("@tauri-apps/plugin-autostart");
  if (enabled) await plugin.enable();
  else await plugin.disable();
}

export async function sendMeetingNotification(title: string, body: string): Promise<void> {
  const desktop = bridge();
  if (desktop) return desktop.sendNotification({ title, body });
  const plugin = await import("@tauri-apps/plugin-notification");
  let granted = await plugin.isPermissionGranted();
  if (!granted) granted = (await plugin.requestPermission()) === "granted";
  if (granted) plugin.sendNotification({ title, body });
}

export async function startDragging(): Promise<void> {
  const desktop = bridge();
  if (desktop) return desktop.startDragging();
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().startDragging();
}

export async function startResizeDragging(direction: string, point?: { x: number; y: number }): Promise<void> {
  const desktop = bridge();
  if (desktop) return desktop.startResizeDragging(direction, point);
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().startResizeDragging(direction as Parameters<ReturnType<typeof getCurrentWindow>["startResizeDragging"]>[0]);
}

export async function updateResizeDragging(point: { x: number; y: number }): Promise<void> {
  return bridge()?.updateResizeDragging(point);
}

export async function endResizeDragging(): Promise<void> {
  return bridge()?.endResizeDragging();
}
