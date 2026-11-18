import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { scopedStorageKey } from "./lib/scopedStorage";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const shellRule = () => source("src/styles.css").match(/\.app-shell\s*\{([^}]*)\}/)?.[1] ?? "";
const runBootstrap = (storage: Storage) => {
  runInNewContext(source("public/appearance-bootstrap.js"), {
    window: { localStorage: storage },
    document,
  });
};

describe("v0.3.9 透明背景回归", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty("--widget-opacity");
    delete document.documentElement.dataset.widgetOpacity;
  });

  it("100% 背景由主元素自身绘制，不再依赖负 z-index 伪元素或外壳 backdrop", () => {
    const css = source("src/styles.css");
    const rule = shellRule();

    expect(rule).toContain("background-color: transparent");
    expect(rule).toContain("background-image: linear-gradient(145deg, rgb(var(--shell-top) / var(--widget-opacity");
    expect(rule).not.toContain("background: transparent");
    expect(rule).not.toContain("backdrop-filter");
    expect(css).not.toMatch(/\.app-shell::(?:before|after)/);
    expect(css).not.toMatch(/\.app-shell[^{]*\{[^}]*z-index:\s*-1/);
  });

  it("首帧阻塞脚本在应用模块之前同步读取 100% 设置", () => {
    const html = source("index.html");
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toContain('<script src="/appearance-bootstrap.js"></script>');
    expect(html.indexOf("appearance-bootstrap.js")).toBeLessThan(html.indexOf("/src/main.tsx"));

    localStorage.setItem(scopedStorageKey("appearanceOpacity"), "100");
    runBootstrap(localStorage);
    expect(document.documentElement.style.getPropertyValue("--widget-opacity")).toBe("1");
    expect(document.documentElement.dataset.widgetOpacity).toBe("100");
  });

  it("首帧脚本对 55/75/95 保持用户档位，非法值不覆盖默认", () => {
    for (const value of ["55", "75", "95"]) {
      localStorage.setItem(scopedStorageKey("appearanceOpacity"), value);
      runBootstrap(localStorage);
      expect(document.documentElement.style.getPropertyValue("--widget-opacity")).toBe(String(Number(value) / 100));
    }

    localStorage.setItem(scopedStorageKey("appearanceOpacity"), "101");
    document.documentElement.style.setProperty("--widget-opacity", "0.75");
    runBootstrap(localStorage);
    expect(document.documentElement.style.getPropertyValue("--widget-opacity")).toBe("0.75");
  });

  it("100% 在首次渲染、blur/focus 与 dragging 状态下都不改变单一 alpha", async () => {
    localStorage.setItem(scopedStorageKey("appearanceOpacity"), "100");
    const { container } = render(<App/>);
    await screen.findByText("这一天很清爽");
    const shell = container.querySelector("main");
    if (!shell) throw new Error("app shell is missing");

    expect(shell).toHaveStyle({ "--widget-opacity": "1" });
    fireEvent.blur(window);
    expect(shell).toHaveStyle({ "--widget-opacity": "1" });
    fireEvent.focus(window);
    expect(shell).toHaveStyle({ "--widget-opacity": "1" });
    shell.classList.add("dragging");
    expect(shell).toHaveStyle({ "--widget-opacity": "1" });
    expect(shell.style.getPropertyValue("--widget-opacity")).toBe("1");
  });

  it("macOS 原生窗口保持透明且没有原生 alpha 覆盖 CSS 设置", () => {
    const config = JSON.parse(source("src-tauri/tauri.conf.json"));
    const mainWindow = config.app.windows.find((window: { label?: string }) => window.label === "main");
    expect(mainWindow.transparent).toBe(true);
    expect(mainWindow).not.toHaveProperty("backgroundColor");
    expect(source("src-tauri/src/lib.rs")).not.toMatch(/set_alpha|set_window_opacity/);
  });

  it("55% 在首次渲染、blur/focus 与 dragging 状态下保持设定值", async () => {
    localStorage.setItem(scopedStorageKey("appearanceOpacity"), "55");
    const { container } = render(<App/>);
    await screen.findByText("这一天很清爽");
    const shell = container.querySelector("main");
    if (!shell) throw new Error("app shell is missing");

    expect(shell.style.getPropertyValue("--widget-opacity")).toBe("0.55");
    fireEvent.blur(window);
    fireEvent.focus(window);
    shell.classList.add("dragging");
    expect(shell.style.getPropertyValue("--widget-opacity")).toBe("0.55");
    expect(localStorage.getItem(scopedStorageKey("appearanceOpacity"))).toBe("55");
  });
});
