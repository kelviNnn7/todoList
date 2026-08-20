import { describe, expect, it } from "vitest";
import type { TodoItem } from "../types";
import { canSnooze, isTaskReminderDue, markReminderFired, quickSnoozeAt, snoozeTask } from "./reminders";

const task = (overrides: Partial<TodoItem> = {}): TodoItem => ({
  id: "task-1", type: "task", title: "提交评审", notes: "", startAt: null, endAt: null,
  dueAt: "2026-08-20T15:59:59.000Z", location: "", meetingUrl: "", reminderMinutes: null, reminderSentAt: null,
  reminderAt: "2026-08-20T01:00:00.000Z", reminderStatus: "pending", snoozeCount: 0, lastReminderAt: null,
  completed: false, source: "local", subtasks: [], createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z",
  ...overrides,
});

describe("task reminders", () => {
  it("仅在任务提醒到期且状态可触发时返回 true", () => {
    const now = new Date("2026-08-20T02:00:00.000Z");
    expect(isTaskReminderDue(task(), now)).toBe(true);
    expect(isTaskReminderDue(task({ completed: true }), now)).toBe(false);
    expect(isTaskReminderDue(task({ reminderStatus: "fired" }), now)).toBe(false);
  });
  it("触发后进入 fired，并可稍后 30 分钟", () => {
    const now = new Date("2026-08-20T02:00:00.000Z");
    const fired = markReminderFired(task(), now);
    const snoozed = snoozeTask(fired, quickSnoozeAt("30m", now), now);
    expect(fired.reminderStatus).toBe("fired");
    expect(snoozed.reminderStatus).toBe("snoozed");
    expect(snoozed.reminderAt).toBe("2026-08-20T02:30:00.000Z");
    expect(snoozed.snoozeCount).toBe(1);
  });
  it("同一天最多允许稍后 3 次，跨天重新计数", () => {
    const now = new Date("2026-08-20T02:00:00.000Z");
    const capped = task({ reminderStatus: "fired", snoozeCount: 3, lastReminderAt: now.toISOString() });
    expect(canSnooze(capped, now)).toBe(false);
    expect(() => snoozeTask(capped, quickSnoozeAt("1h", now), now)).toThrow(/3 次/);
    expect(canSnooze(capped, new Date("2026-08-21T02:00:00.000Z"))).toBe(true);
  });
  it("明天 9 点会清零秒和毫秒", () => {
    const target = quickSnoozeAt("tomorrow9", new Date(2026, 7, 20, 22, 45, 18, 123));
    expect([target.getDate(), target.getHours(), target.getMinutes(), target.getSeconds(), target.getMilliseconds()]).toEqual([21, 9, 0, 0, 0]);
  });
});
