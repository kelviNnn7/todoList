import { describe, expect, it } from "vitest";
import { dateKey, itemsForDate, isOverdue, monthDays, weekDays } from "./calendar";
import type { TodoItem } from "../types";

const item = (overrides: Partial<TodoItem> = {}): TodoItem => ({
  id: "1", type: "task", title: "测试任务", notes: "", startAt: null, endAt: null,
  dueAt: new Date(2026, 7, 18, 23, 59, 59).toISOString(), location: "", meetingUrl: "", reminderMinutes: null,
  reminderSentAt: null, reminderAt: null, reminderStatus: "none", snoozeCount: 0, lastReminderAt: null,
  completed: false, source: "local", subtasks: [], createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z", ...overrides,
});

describe("calendar", () => {
  it("周视图固定从周一开始并在周日结束", () => {
    const days = weekDays(new Date(2026, 7, 18));
    expect(days).toHaveLength(7);
    expect(dateKey(days[0])).toBe("2026-08-17");
    expect(dateKey(days[6])).toBe("2026-08-23");
    expect(days[0].getDay()).toBe(1);
    expect(days[6].getDay()).toBe(0);
  });
  it("周日仍归入此前周一开始的同一周", () => {
    const days = weekDays(new Date(2026, 7, 23));
    expect(days.map(dateKey)).toEqual([
      "2026-08-17", "2026-08-18", "2026-08-19", "2026-08-20",
      "2026-08-21", "2026-08-22", "2026-08-23",
    ]);
  });
  it("月视图补齐完整周并包含整月", () => {
    const days = monthDays(new Date(2026, 7, 18));
    expect(days[0].getDay()).toBe(1);
    expect(days.at(-1)?.getDay()).toBe(0);
    expect(days.some((day) => day.getMonth() === 7 && day.getDate() === 1)).toBe(true);
    expect(days.some((day) => day.getMonth() === 7 && day.getDate() === 31)).toBe(true);
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
