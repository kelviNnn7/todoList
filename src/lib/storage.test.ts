import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TodoItem } from "../types";
import { scopedStorageKey } from "./scopedStorage";

const desktop = vi.hoisted(() => ({
  isDesktopRuntime: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("./desktop", () => ({
  isDesktopRuntime: desktop.isDesktopRuntime,
  invoke: desktop.invoke,
}));

import { deleteItem, loadItems, saveItem } from "./storage";

const makeItem = (id: string, title = "本地任务"): TodoItem => ({
  id, type: "task", title, notes: "", startAt: null, endAt: null, dueAt: null, location: "", meetingUrl: "",
  reminderMinutes: null, reminderSentAt: null, reminderAt: null, reminderStatus: "none", snoozeCount: 0, lastReminderAt: null,
  completed: false, source: "local", subtasks: [], taskSchedule: null, completedDates: [], createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z",
});

const setBrowserItems = (value: unknown): void => {
  localStorage.setItem(scopedStorageKey("items.v1"), JSON.stringify(value));
};

describe("storage browser fallback", () => {
  beforeEach(() => {
    localStorage.clear();
    desktop.isDesktopRuntime.mockReset();
    desktop.isDesktopRuntime.mockReturnValue(false);
    desktop.invoke.mockReset();
  });

  it("保存、更新和删除事项", async () => {
    await saveItem(makeItem("1")); await saveItem(makeItem("2")); await saveItem(makeItem("1", "已更新"));
    const loaded = await loadItems();
    expect(loaded).toHaveLength(2); expect(loaded.find((item) => item.id === "1")?.title).toBe("已更新");
    await deleteItem("1"); expect((await loadItems()).map((item) => item.id)).toEqual(["2"]);
  });
  it("损坏数据安全回退为空数组", async () => {
    localStorage.setItem(scopedStorageKey("items.v1"), "not-json");
    expect(await loadItems()).toEqual([]);
  });
  it("顶层不是数组时安全回退为空数组", async () => {
    setBrowserItems({ id: "1" });
    expect(await loadItems()).toEqual([]);
  });
  it("过滤结构不合法的数据", async () => {
    setBrowserItems([{ id: 7 }, null, [], { id: "missing-title" }, makeItem("ok")]);
    expect(await loadItems()).toEqual([makeItem("ok")]);
  });
  it("读取旧字段记录时补齐提醒默认值", async () => {
    const previousSchemaItem = makeItem("previous-schema") as Partial<TodoItem>;
    delete previousSchemaItem.reminderAt; delete previousSchemaItem.reminderStatus; delete previousSchemaItem.snoozeCount; delete previousSchemaItem.lastReminderAt;
    setBrowserItems([previousSchemaItem]);
    expect((await loadItems())[0]).toMatchObject({ id: "previous-schema", reminderAt: null, reminderStatus: "none", snoozeCount: 0, lastReminderAt: null });
  });
  it("归一化非法提醒字段、子任务与重复日期", async () => {
    setBrowserItems([{
      ...makeItem("normalized"),
      reminderAt: 7,
      reminderStatus: "bogus",
      snoozeCount: -1,
      lastReminderAt: 7,
      subtasks: "not-an-array",
      completedDates: ["2026-02-30", "2026-02-28", "2026-02-28", "nope", 7],
    }]);
    const loaded = (await loadItems())[0];
    expect(loaded).toMatchObject({
      reminderAt: null,
      reminderStatus: "none",
      snoozeCount: 0,
      lastReminderAt: null,
      subtasks: [],
      completedDates: ["2026-02-28"],
    });
  });
  it("仅保留合法且去重排序的每周规则", async () => {
    setBrowserItems([
      { ...makeItem("weekly"), taskSchedule: { mode: "weekly", startsOn: "2026-08-18", weekdays: [3, 1, 3, 8, 0, 2] } },
      { ...makeItem("bad-start"), taskSchedule: { mode: "weekly", startsOn: "2026-02-30", weekdays: [1] } },
      { ...makeItem("empty-days"), taskSchedule: { mode: "weekly", startsOn: "2026-08-18", weekdays: [] } },
      { ...makeItem("single"), taskSchedule: { mode: "single", startsOn: "2026-08-18", weekdays: [1] } },
    ]);
    const loaded = await loadItems();
    expect(loaded.find((item) => item.id === "weekly")?.taskSchedule).toEqual({ mode: "weekly", startsOn: "2026-08-18", weekdays: [1, 2, 3] });
    expect(loaded.find((item) => item.id === "bad-start")?.taskSchedule).toBeNull();
    expect(loaded.find((item) => item.id === "empty-days")?.taskSchedule).toBeNull();
    expect(loaded.find((item) => item.id === "single")?.taskSchedule).toBeNull();
  });
  it("保留闰日并拒绝不存在的日期", async () => {
    setBrowserItems([{ ...makeItem("leap"), completedDates: ["2028-02-29", "2028-02-30", "2026-13-01"] }]);
    expect((await loadItems())[0].completedDates).toEqual(["2028-02-29"]);
  });
  it("保存写入失败时向上抛出错误", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    try {
      await expect(saveItem(makeItem("1"))).rejects.toThrow(/quota exceeded/);
    } finally {
      setItem.mockRestore();
    }
  });
  it("删除不存在的记录时保持其余数据不变", async () => {
    await saveItem(makeItem("1"));
    await deleteItem("missing");
    expect((await loadItems()).map((item) => item.id)).toEqual(["1"]);
  });
});

describe("storage desktop bridge", () => {
  beforeEach(() => {
    localStorage.clear();
    desktop.isDesktopRuntime.mockReset();
    desktop.isDesktopRuntime.mockReturnValue(true);
    desktop.invoke.mockReset();
  });

  it("从原生层加载并过滤非法记录", async () => {
    desktop.invoke.mockResolvedValue([JSON.stringify(makeItem("1")), "not-json", JSON.stringify({ id: 2 })]);
    await expect(loadItems()).resolves.toEqual([makeItem("1")]);
    expect(desktop.invoke).toHaveBeenCalledWith("list_items");
  });

  it("原生读取失败时向上抛出错误", async () => {
    desktop.invoke.mockRejectedValue(new Error("database locked"));
    await expect(loadItems()).rejects.toThrow("database locked");
  });

  it("保存时传递 id、序列化载荷与更新时间", async () => {
    const item = makeItem("1", "桌面任务");
    await saveItem(item);
    expect(desktop.invoke).toHaveBeenCalledWith("upsert_item", { id: "1", payload: JSON.stringify(item), updatedAt: item.updatedAt });
  });

  it("删除时传递记录 id", async () => {
    desktop.invoke.mockResolvedValue(undefined);
    await deleteItem("1");
    expect(desktop.invoke).toHaveBeenCalledWith("delete_item", { id: "1" });
  });
});
