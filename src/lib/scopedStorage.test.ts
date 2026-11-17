import { beforeEach, describe, expect, it, vi } from "vitest";
import { readScopedValue, scopedStorageKey, writeScopedValue } from "./scopedStorage";

describe("scopedStorage", () => {
  beforeEach(() => localStorage.clear());

  it("使用固定命名空间隔离浏览器预览数据", () => {
    expect(scopedStorageKey("items.v1")).toBe("todo.items.v1");
    expect(scopedStorageKey("preferences")).toBe("todo.preferences");
  });

  it("读写命名空间内的值，缺失时返回 null", () => {
    expect(readScopedValue("items.v1")).toBeNull();
    writeScopedValue("items.v1", "[]");
    expect(readScopedValue("items.v1")).toBe("[]");
    writeScopedValue("items.v1", '[{"id":"1"}]');
    expect(readScopedValue("items.v1")).toBe('[{"id":"1"}]');
  });

  it("不读取命名空间之外的键", () => {
    localStorage.setItem("items.v1", "outside");
    expect(readScopedValue("items.v1")).toBeNull();
  });

  it("写入失败时向上抛出错误，便于调用方处理配额问题", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    try {
      expect(() => writeScopedValue("items.v1", "[]")).toThrow(/quota exceeded/);
    } finally {
      setItem.mockRestore();
    }
  });
});
