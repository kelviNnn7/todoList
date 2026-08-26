import { afterEach, describe, expect, it, vi } from "vitest";
import { endResizeDragging, invoke, isDesktopRuntime, isElectronRuntime, startResizeDragging, updateResizeDragging } from "./desktop";

afterEach(() => {
  delete window.desktopBridge;
});

function installBridge() {
  const desktop = {
    invoke: vi.fn().mockResolvedValue(["saved-item"]),
    listen: vi.fn().mockResolvedValue(() => undefined),
    isAutostartEnabled: vi.fn().mockResolvedValue(false),
    setAutostartEnabled: vi.fn().mockResolvedValue(undefined),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    startDragging: vi.fn().mockResolvedValue(undefined),
    startResizeDragging: vi.fn().mockResolvedValue(undefined),
    updateResizeDragging: vi.fn().mockResolvedValue(undefined),
    endResizeDragging: vi.fn().mockResolvedValue(undefined),
  };
  window.desktopBridge = desktop as unknown as NonNullable<typeof window.desktopBridge>;
  return desktop;
}

describe("desktop runtime bridge", () => {
  it("keeps the browser fallback separate from desktop runtimes", () => {
    expect(isDesktopRuntime()).toBe(false);
    expect(isElectronRuntime()).toBe(false);
  });

  it("routes storage commands through the isolated desktop bridge", async () => {
    const desktop = installBridge();
    await expect(invoke<string[]>("list_items")).resolves.toEqual(["saved-item"]);
    expect(desktop.invoke).toHaveBeenCalledWith("list_items", undefined);
    expect(isDesktopRuntime()).toBe(true);
    expect(isElectronRuntime()).toBe(true);
  });

  it("routes the complete managed resize lifecycle", async () => {
    const desktop = installBridge();
    await startResizeDragging("SouthEast", { x: 100, y: 120 });
    await updateResizeDragging({ x: 150, y: 180 });
    await endResizeDragging();
    expect(desktop.startResizeDragging).toHaveBeenCalledWith("SouthEast", { x: 100, y: 120 });
    expect(desktop.updateResizeDragging).toHaveBeenCalledWith({ x: 150, y: 180 });
    expect(desktop.endResizeDragging).toHaveBeenCalledOnce();
  });
});
