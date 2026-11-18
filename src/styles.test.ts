import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = () => readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
const rule = (selector: string) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css().match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

describe("v0.3.10 calendar surface contract", () => {
  it("只在指针悬停格启动 900ms 单圈光束，键盘焦点不启动", () => {
    const source = css();
    expect(source).toContain(".day-beam-trace");
    expect(source).toContain("stroke-width: 1.5");
    expect(source).toContain("animation-name: calendar-beam-trace");
    expect(source).toContain("animation-duration: 900ms");
    expect(source).toContain("animation-fill-mode: both");
    expect(source).toContain("url(#day-beam-gradient)");
    expect(source).toContain("stroke-dasharray: 16 84");
    expect(source).toContain("stroke-dashoffset: 0");
    expect(source).toMatch(/@keyframes calendar-beam-trace \{\s*0% \{ stroke-dashoffset: 0; opacity: 1; \}\s*90% \{ stroke-dashoffset: -90; opacity: 1; \}\s*100% \{ stroke-dashoffset: -100; opacity: 0; \}/);
    expect(source).not.toMatch(/day-cell[^{]*:focus-visible[^{]*::(?:after|before)/);
    expect(source).not.toMatch(/day-cell[^{]*:hover[^{]*::(?:after|before)/);
    expect(source).not.toContain("-webkit-mask");
  });

  it("减少动态时只留静态描边，移动轨迹不残留", () => {
    const source = css();
    expect(source).toContain("prefers-reduced-motion: reduce");
    expect(source).toMatch(/\.day-cell\.beam-active \.day-beam-trace \{ animation: none; opacity: 0; stroke-dashoffset: 0; \}/);
    expect(source).toContain(".day-beam { position: absolute; inset: 0; z-index: 1;");
    expect(source).toContain("pointer-events: none");
    expect(source).toContain(".day-beam-static { stroke: rgba(34, 211, 238, .3); }");
  });

  it("外壳是唯一的材质层，子表面不再叠加第二层 alpha", () => {
    const source = css();
    const shell = rule(".app-shell");
    expect(shell).toContain("background-color: transparent");
    expect(shell).toContain("background-image: linear-gradient(145deg, rgb(var(--shell-top) / var(--widget-opacity");
    expect(shell).toContain("background-clip: padding-box");
    expect(shell).not.toContain("backdrop-filter");
    expect(source).toContain("--surface: transparent");
    expect(source).toMatch(/\.topbar\s*\{[^}]*background: transparent/);
    expect(source).toMatch(/\.calendar-panel\s*\{[^}]*background: transparent/);
    expect(source).toMatch(/\.agenda-header\s*\{[^}]*background: transparent/);
    expect(source).toMatch(/\.item-group\s*\{[^}]*background: transparent/);
    expect(source).toMatch(/\.item-form\s*\{[^}]*background: transparent/);
    expect(source).not.toMatch(/\.app-shell[^{]*\{[^}]*opacity:/);
    expect(source).not.toMatch(/\.app-shell::(?:before|after)/);
  });

  it("100% 使用确定性实色，降低透明度时强制不透", () => {
    const source = css();
    expect(source).toMatch(/\.app-shell\.opaque \{ background-color: rgb\(var\(--shell-bottom\)\); background-image: none; border-color: rgb\(var\(--shell-border-rgb\)\); \}/);
    expect(source).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(source).toMatch(/prefers-reduced-transparency: reduce\)[\s\S]*?\.app-shell \{[^}]*background-color: rgb\(var\(--shell-bottom\)\)[^}]*background-image: none;[^}]*border-color: rgb\(var\(--shell-border-rgb\)\);/);
    expect(source).toContain("--widget-opacity: .95");
  });

  it("低档填色控件只用单材质和最多 7.5% 色相 tint，100% 保留全色", () => {
    const source = css();
    expect(source).toContain("--selection-fill: rgba(36, 72, 190, .06)");
    expect(source).toContain("--selection-fill-strong: rgba(36, 72, 190, .07)");
    expect(source).toContain("--selection-edge: rgba(36, 72, 190, .72)");
    const start = source.indexOf(".app-shell:not(.opaque) .add-button");
    const low = source.slice(start, source.indexOf("@keyframes calendar-beam-trace", start));
    expect(low).toContain("background: var(--selection-fill)");
    expect(low).toContain("color: var(--selection-ink)");
    expect(low).not.toContain("--on-accent");
    expect(low).toMatch(/\.app-shell:not\(\.opaque\) \.add-button \{ box-shadow: inset 0 0 0 1px var\(--selection-edge\); \}/);
    expect(low).toMatch(/\.app-shell:not\(\.opaque\) \.button\.primary \{ border-color: var\(--selection-edge\); box-shadow: none; \}/);
    expect(low).toMatch(/\.app-shell:not\(\.opaque\) \.check\[aria-pressed="true"\],[\s\S]*?\.weekday-picker button\.active \{ border-color: var\(--selection-edge\); \}/);
    expect(low).toMatch(/\.app-shell:not\(\.opaque\) \.day-cell\.selected \{[\s\S]*?background: var\(--selection-fill\);[\s\S]*?inset 0 0 0 1\.5px var\(--selection-edge\)/);
    expect(low).toMatch(/\.app-shell:not\(\.opaque\) \.day-cell\.selected \.day-number,[\s\S]*?color: var\(--selection-ink\)/);
    expect(rule(".app-shell .add-button")).toContain("background: var(--accent-solid)");
    expect(rule(".day-cell.selected")).toContain("background: var(--accent-solid)");
    expect(rule(".button.primary")).toContain("background: var(--accent-solid)");
    expect(rule(".check[aria-pressed=\"true\"]")).toContain("background: var(--accent-solid)");
  });

  it("日期标题 18/17/22、660、1.25，且不使用省略号", () => {
    const source = css();
    const heading = rule(".agenda-heading h2");
    expect(heading).toContain("font-size: calc(18px * var(--font-scale))");
    expect(heading).toContain("font-weight: 660");
    expect(heading).toContain("line-height: 1.25");
    expect(heading).toContain("text-overflow: clip");
    expect(heading).not.toContain("ellipsis");
    expect(source).toContain(".expanded .agenda-heading h2 { font-size: calc(22px * var(--font-scale)); }");
    expect(source).toMatch(/@media \(max-width: 350px\) \{\s*\.agenda-heading h2 \{ font-size: calc\(17px \* var\(--font-scale\)\); \}/);
    expect(source).toContain(".agenda-heading { flex: 0 0 auto; display: flex; flex-wrap: wrap;");
  });

  it("跨月日期不再降低父元素 opacity", () => {
    const source = css();
    expect(source).not.toContain(".day-cell.outside-month:not(.selected) { opacity:");
    expect(source).toMatch(/\.day-cell\.outside-month:not\(\.selected\) \.day-number,[\s\S]*?color: var\(--text-secondary\)/);
    expect(source).toContain(".day-cell.outside-month:not(.selected) .dot { opacity: .62; }");
  });

  it("浮层只遮蔽重叠正文，不铺全屏遮罩", () => {
    const source = css();
    expect(source).toMatch(/\.overlay-occluded, \.overlay-occluded \* \{\s*color: transparent !important;/);
    expect(source).not.toContain("backdrop: rgba(0, 0, 0");
  });
});
