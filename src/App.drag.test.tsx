import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { scopedStorageKey } from "./lib/scopedStorage";

const desktop = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(() => true),
  invoke: vi.fn(async (command: string) => command === "list_items" ? [] as string[] : undefined),
  listen: vi.fn(async () => () => undefined),
  isAutostartEnabled: vi.fn(async () => false),
  setAutostartEnabled: vi.fn(async () => undefined),
  sendMeetingNotification: vi.fn(async () => undefined),
  startDragging: vi.fn<() => Promise<void>>(),
  startResizeDragging: vi.fn(async () => undefined),
}));

vi.mock("./lib/desktop", () => desktop);

function pendingDrag() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((settle) => { resolve = settle; });
  desktop.startDragging.mockImplementationOnce(() => promise);
  return () => resolve();
}

async function renderApp() {
  const view = render(<App/>);
  await screen.findByText("这一天很清爽");
  const shell = view.container.querySelector("main");
  const topbar = view.container.querySelector("header.topbar");
  if (!shell || !topbar) throw new Error("app shell is missing");
  return { shell, topbar };
}

describe("App 窗口拖动与透明度", () => {
  beforeEach(() => {
    localStorage.clear();
    desktop.startDragging.mockReset();
    desktop.startDragging.mockImplementation(() => new Promise<void>(() => undefined));
  });

  it("原生拖动 promise 完成后总会结束 dragging，不会把 .7 透明度残留到窗口失焦", async () => {
    const { shell, topbar } = await renderApp();
    const resolveDrag = pendingDrag();

    fireEvent.mouseDown(topbar, { button: 0 });
    await waitFor(() => expect(desktop.startDragging).toHaveBeenCalledTimes(1));
    expect(shell).toHaveClass("dragging");

    act(() => resolveDrag());
    await waitFor(() => expect(shell).not.toHaveClass("dragging"));
  });

  it("原生拖动吞掉 pointerup 时，blur、pointercancel 与页面隐藏仍会清理 dragging", async () => {
    const { shell, topbar } = await renderApp();
    pendingDrag();
    fireEvent.mouseDown(topbar, { button: 0 });
    await waitFor(() => expect(shell).toHaveClass("dragging"));

    fireEvent.blur(window);
    await waitFor(() => expect(shell).not.toHaveClass("dragging"));

    fireEvent.mouseDown(topbar, { button: 0 });
    await waitFor(() => expect(shell).toHaveClass("dragging"));
    fireEvent.pointerCancel(window);
    await waitFor(() => expect(shell).not.toHaveClass("dragging"));

    fireEvent.mouseDown(topbar, { button: 0 });
    await waitFor(() => expect(shell).toHaveClass("dragging"));
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await waitFor(() => expect(shell).not.toHaveClass("dragging"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("旧拖动 promise 的清理不会误伤重入后的新拖动", async () => {
    const { shell, topbar } = await renderApp();
    let resolveFirst: () => void = () => undefined;
    desktop.startDragging.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve; }));
    desktop.startDragging.mockImplementationOnce(() => new Promise<void>(() => undefined));

    fireEvent.mouseDown(topbar, { button: 0 });
    await waitFor(() => expect(desktop.startDragging).toHaveBeenCalledTimes(1));
    fireEvent.blur(window);
    await waitFor(() => expect(shell).not.toHaveClass("dragging"));

    fireEvent.mouseDown(topbar, { button: 0 });
    await waitFor(() => expect(desktop.startDragging).toHaveBeenCalledTimes(2));
    expect(shell).toHaveClass("dragging");

    act(() => resolveFirst());
    await waitFor(() => expect(shell).toHaveClass("dragging"));
  });

  it("同一时间只允许一个拖动启动，按钮与锁定状态不会误触拖动", async () => {
    const { topbar } = await renderApp();
    pendingDrag();
    fireEvent.mouseDown(topbar, { button: 0 });
    fireEvent.mouseDown(topbar, { button: 0 });
    await waitFor(() => expect(desktop.startDragging).toHaveBeenCalledTimes(1));

    fireEvent.mouseDown(screen.getByRole("button", { name: "设置" }), { button: 0 });
    expect(desktop.startDragging).toHaveBeenCalledTimes(1);
  });

  it("锁定位置时鼠标按下不会启动拖动", async () => {
    localStorage.setItem(scopedStorageKey("positionLocked"), "true");
    const { topbar } = await renderApp();
    fireEvent.mouseDown(topbar, { button: 0 });
    expect(desktop.startDragging).not.toHaveBeenCalled();
  });

  it("拖动与失焦都不会覆盖用户 55% 透明度设置", async () => {
    localStorage.setItem(scopedStorageKey("appearanceOpacity"), "55");
    const { shell, topbar } = await renderApp();
    expect(shell.style.getPropertyValue("--widget-opacity")).toBe("0.55");

    pendingDrag();
    fireEvent.mouseDown(topbar, { button: 0 });
    await waitFor(() => expect(shell).toHaveClass("dragging"));
    expect(shell.style.getPropertyValue("--widget-opacity")).toBe("0.55");

    fireEvent.blur(window);
    await waitFor(() => expect(shell).not.toHaveClass("dragging"));
    expect(shell.style.getPropertyValue("--widget-opacity")).toBe("0.55");
    expect(localStorage.getItem(scopedStorageKey("appearanceOpacity"))).toBe("55");
  });
});
