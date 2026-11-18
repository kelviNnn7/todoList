import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = () => readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("v0.3.9 V2 interaction contract", () => {
  it("取消了 V2 明确移除的日历光束，且悬停不再改变格子尺寸", () => {
    const source = css();
    expect(source).not.toContain("calendar-beam");
    expect(source).not.toMatch(/\.day-cell:hover[^{]*\{[^}]*transform:/);
    expect(source).toContain(".day-cell:focus-visible");
    expect(source).toContain("outline-offset: 2px");
  });

  it("按压与浮层使用规定时长和曲线，键盘/减少动态可即时切换", () => {
    const source = css();
    expect(source).toContain("opacity 180ms var(--ease-out), transform 180ms var(--ease-out)");
    expect(source).toContain("transition-duration: 120ms");
    expect(source).toContain('.item-form[data-instant="true"] { transition: none; }');
    expect(source).toContain("scale(.97)");
    expect(source).toContain("prefers-reduced-motion: reduce");
  });

  it("外壳保持单层直接绘制而内容与浮层使用不透明表面", () => {
    const source = css();
    const shell = source.match(/\.app-shell\s*\{([^}]*)\}/)?.[1] ?? "";
    expect(shell).toContain("background-color: transparent");
    expect(shell).toContain("background-image: linear-gradient(145deg, rgb(var(--shell-top) / var(--widget-opacity");
    expect(shell).not.toContain("backdrop-filter");
    expect(source).not.toMatch(/\.app-shell::(?:before|after)/);
    expect(source).toContain("--surface: #fff");
    expect(source).toContain("background: var(--surface)");
  });
});
