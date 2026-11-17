import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  invoke,
  isAutostartEnabled,
  isDesktopRuntime,
  listen,
  sendMeetingNotification,
  setAutostartEnabled,
  startDragging,
  startResizeDragging,
} from "./desktop";

const mocks = vi.hoisted(() => {
  const startDragging = vi.fn();
  const startResizeDragging = vi.fn();
  return {
    invoke: vi.fn(),
    listen: vi.fn(),
    isEnabled: vi.fn(),
    enable: vi.fn(),
    disable: vi.fn(),
    isPermissionGranted: vi.fn(),
    requestPermission: vi.fn(),
    sendNotification: vi.fn(),
    startDragging,
    startResizeDragging,
    getCurrentWindow: vi.fn(() => ({ startDragging, startResizeDragging })),
  };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: mocks.getCurrentWindow }));
vi.mock("@tauri-apps/plugin-autostart", () => ({
  isEnabled: mocks.isEnabled,
  enable: mocks.enable,
  disable: mocks.disable,
}));
vi.mock("@tauri-apps/plugin-notification", () => ({
  isPermissionGranted: mocks.isPermissionGranted,
  requestPermission: mocks.requestPermission,
  sendNotification: mocks.sendNotification,
}));

describe("desktop bridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  afterEach(() => {
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("在没有 Tauri 注入时保持浏览器预览路径", () => {
    expect(isDesktopRuntime()).toBe(false);
  });

  it("检测到 Tauri 注入时切换为桌面运行时", () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    expect(isDesktopRuntime()).toBe(true);
  });

  it("转发命令与参数并返回原生结果", async () => {
    mocks.invoke.mockResolvedValue([{ id: "1" }]);
    await expect(invoke("list_items", { limit: 10 })).resolves.toEqual([{ id: "1" }]);
    expect(mocks.invoke).toHaveBeenCalledWith("list_items", { limit: 10 });
  });

  it("转发事件监听并解包 payload", async () => {
    const unsubscribe = vi.fn();
    const listener = vi.fn();
    mocks.listen.mockImplementation(async (_event: string, handler: (event: { payload: unknown }) => void) => {
      handler({ payload: { id: "1" } });
      return unsubscribe;
    });

    await expect(listen("reminder", listener)).resolves.toBe(unsubscribe);
    expect(mocks.listen).toHaveBeenCalledWith("reminder", expect.any(Function));
    expect(listener).toHaveBeenCalledWith({ id: "1" });
  });

  it("读取与切换自启动状态", async () => {
    mocks.isEnabled.mockResolvedValue(true);
    await expect(isAutostartEnabled()).resolves.toBe(true);

    await setAutostartEnabled(true);
    expect(mocks.enable).toHaveBeenCalledTimes(1);
    expect(mocks.disable).not.toHaveBeenCalled();

    await setAutostartEnabled(false);
    expect(mocks.disable).toHaveBeenCalledTimes(1);
  });

  it("自启动插件失败时向上抛出错误", async () => {
    mocks.enable.mockRejectedValue(new Error("permission denied"));
    await expect(setAutostartEnabled(true)).rejects.toThrow("permission denied");
  });

  it("通知权限已授予时直接发送会议通知", async () => {
    mocks.isPermissionGranted.mockResolvedValue(true);
    await sendMeetingNotification("周会", "10:00 开始");
    expect(mocks.requestPermission).not.toHaveBeenCalled();
    expect(mocks.sendNotification).toHaveBeenCalledWith({ title: "周会", body: "10:00 开始" });
  });

  it("通知权限未授予时请求一次并在同意后发送", async () => {
    mocks.isPermissionGranted.mockResolvedValue(false);
    mocks.requestPermission.mockResolvedValue("granted");
    await sendMeetingNotification("周会", "10:00 开始");
    expect(mocks.requestPermission).toHaveBeenCalledTimes(1);
    expect(mocks.sendNotification).toHaveBeenCalledTimes(1);
  });

  it("通知权限被拒绝时不发送通知", async () => {
    mocks.isPermissionGranted.mockResolvedValue(false);
    mocks.requestPermission.mockResolvedValue("denied");
    await sendMeetingNotification("周会", "10:00 开始");
    expect(mocks.sendNotification).not.toHaveBeenCalled();
  });

  it("转发窗口拖动与八向缩放", async () => {
    await startDragging();
    await startResizeDragging("NorthEast");
    expect(mocks.getCurrentWindow).toHaveBeenCalledTimes(2);
    expect(mocks.startDragging).toHaveBeenCalledTimes(1);
    expect(mocks.startResizeDragging).toHaveBeenCalledWith("NorthEast");
  });
});
