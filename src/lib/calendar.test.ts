import { describe, expect, it } from "vitest";
import { itemsForDate, isOverdue, monthDays, weekDays } from "./calendar";
import type { TodoItem } from "../types";

const item = (overrides: Partial<TodoItem> = {}): TodoItem => ({
  id: "1", type: "task", title: "测试任务", notes: "", startAt: null, endAt: null,
  dueAt: new Date(2026, 7, 18, 23, 59, 59).toISOString(), location: "", meetingUrl: "", reminderMinutes: null,
  reminderSentAt: null, reminderAt: null, reminderStatus: "none", snoozeCount: 0, lastReminderAt: null,
  completed: false, source: "local", subtasks: [], createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z", ...overrides,
});

describe("calendar", () => {
  it("周视图始终生成从当天开始的连续 7 天", () => {
    const days = weekDays(new Date(2026, 7, 18));
    expect(days).toHaveLength(7);
    expect(days[0].getDate()).toBe(18);
    expect(days[6].getDate()).toBe(24);
    expect(days[6].getTime() - days[0].getTime()).toBe(6 * 86400000);
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
