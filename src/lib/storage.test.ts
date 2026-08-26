import { beforeEach, describe, expect, it } from "vitest";
import { deleteItem, loadItems, saveItem } from "./storage";
import type { TodoItem } from "../types";
import { scopedStorageKey } from "./scopedStorage";

const legacyStorageKey = (name: string) => `${["pin", "do"].join("")}.${name}`;

const makeItem = (id: string, title = "本地任务"): TodoItem => ({
  id, type: "task", title, notes: "", startAt: null, endAt: null, dueAt: null, location: "", meetingUrl: "",
  reminderMinutes: null, reminderSentAt: null, reminderAt: null, reminderStatus: "none", snoozeCount: 0, lastReminderAt: null,
  completed: false, source: "local", subtasks: [], createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z",
});

describe("storage browser fallback", () => {
  beforeEach(() => localStorage.clear());
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
  it("过滤结构不合法的数据", async () => {
    localStorage.setItem(scopedStorageKey("items.v1"), JSON.stringify([{ id: 7 }, makeItem("ok")]));
    expect(await loadItems()).toEqual([makeItem("ok")]);
  });
  it("无损迁移 v0.1 数据并补齐提醒默认值", async () => {
    const legacy = makeItem("legacy") as Partial<TodoItem>;
    delete legacy.reminderAt; delete legacy.reminderStatus; delete legacy.snoozeCount; delete legacy.lastReminderAt;
    localStorage.setItem(legacyStorageKey("items.v1"), JSON.stringify([legacy]));
    expect((await loadItems())[0]).toMatchObject({ id: "legacy", reminderAt: null, reminderStatus: "none", snoozeCount: 0, lastReminderAt: null });
    expect(localStorage.getItem(scopedStorageKey("items.v1"))).not.toBeNull();
    expect(localStorage.getItem(legacyStorageKey("items.v1"))).toBeNull();
  });
});
