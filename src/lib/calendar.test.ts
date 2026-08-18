import { describe, expect, it } from "vitest";
import { itemsForDate, isOverdue, twoWeekDays } from "./calendar";
import type { TodoItem } from "../types";

const item = (overrides: Partial<TodoItem> = {}): TodoItem => ({
  id: "1", type: "task", title: "测试任务", notes: "", startAt: null, endAt: null,
  dueAt: new Date(2026, 7, 18, 23, 59, 59).toISOString(), location: "", meetingUrl: "", reminderMinutes: null,
  reminderSentAt: null, completed: false, source: "local", subtasks: [], createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z", ...overrides,
});

describe("calendar", () => {
  it("始终生成从周一开始的 14 天", () => {
    const days = twoWeekDays(new Date(2026, 7, 18));
    expect(days).toHaveLength(14);
    expect(days[0].getDay()).toBe(1);
    expect(days[13].getTime() - days[0].getTime()).toBe(13 * 86400000);
  });
  it("按任务截止日期筛选", () => {
    expect(itemsForDate([item()], new Date(2026, 7, 18, 12))).toHaveLength(1);
    expect(itemsForDate([item()], new Date(2026, 7, 19, 12))).toHaveLength(0);
  });
  it("已完成任务不会标记逾期", () => {
    expect(isOverdue(item(), new Date("2026-08-20T12:00:00Z"))).toBe(true);
    expect(isOverdue(item({ completed: true }), new Date("2026-08-20T12:00:00Z"))).toBe(false);
  });
});
