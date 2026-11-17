import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WIDGET_OPACITY,
  MAX_WIDGET_OPACITY,
  MIN_WIDGET_OPACITY,
  applyWidgetOpacity,
  normalizeWidgetOpacity,
  readStoredWidgetOpacity,
} from "./appearance";
import { scopedStorageKey } from "./scopedStorage";

describe("外观透明度归一化", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.style.removeProperty("--widget-opacity");
    delete document.documentElement.dataset.widgetOpacity;
  });

  it("接受 55–100 的档位并按 5 的步长取整", () => {
    expect(normalizeWidgetOpacity(MIN_WIDGET_OPACITY)).toBe(55);
    expect(normalizeWidgetOpacity(75)).toBe(75);
    expect(normalizeWidgetOpacity(100)).toBe(MAX_WIDGET_OPACITY);
    expect(normalizeWidgetOpacity("80")).toBe(80);
    expect(normalizeWidgetOpacity(57)).toBe(55);
    expect(normalizeWidgetOpacity(58)).toBe(60);
  });

  it("非法、越界和非数字值回退到产品默认值", () => {
    for (const value of [null, "", "abc", 54, 101, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
      expect(normalizeWidgetOpacity(value)).toBe(DEFAULT_WIDGET_OPACITY);
    }
  });

  it("同步读取已保存设置，缺失或损坏时回退默认值", () => {
    expect(readStoredWidgetOpacity()).toBe(DEFAULT_WIDGET_OPACITY);

    localStorage.setItem(scopedStorageKey("appearanceOpacity"), "100");
    expect(readStoredWidgetOpacity()).toBe(100);

    localStorage.setItem(scopedStorageKey("appearanceOpacity"), "not-a-number");
    expect(readStoredWidgetOpacity()).toBe(DEFAULT_WIDGET_OPACITY);
  });

  it("在 React 挂载前把单一 alpha 写到文档根元素", () => {
    expect(applyWidgetOpacity(100)).toBe(100);
    expect(document.documentElement.style.getPropertyValue("--widget-opacity")).toBe("1");
    expect(document.documentElement.dataset.widgetOpacity).toBe("100");

    expect(applyWidgetOpacity(57)).toBe(55);
    expect(document.documentElement.style.getPropertyValue("--widget-opacity")).toBe("0.55");
    expect(document.documentElement.dataset.widgetOpacity).toBe("55");
  });

  it("可显式指定应用透明度的根节点", () => {
    const root = document.createElement("div");
    expect(applyWidgetOpacity(75, root)).toBe(75);
    expect(root.style.getPropertyValue("--widget-opacity")).toBe("0.75");
    expect(root.dataset.widgetOpacity).toBe("75");
  });
});
