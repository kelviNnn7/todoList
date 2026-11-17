import { describe, expect, it } from "vitest";
import type { TodoItem } from "../types";
import {
  MAX_DAILY_SNOOZES,
  canSnooze,
  isTaskReminderDue,
  markReminderFired,
  quickSnoozeAt,
  snoozeTask,
  snoozesToday,
} from "./reminders";

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
  it("仅任务类型、未完成且状态为 pending/snoozed 时参与通知", () => {
    const now = new Date("2026-08-20T02:00:00.000Z");
    expect(isTaskReminderDue(task({ type: "meeting" }), now)).toBe(false);
    expect(isTaskReminderDue(task({ reminderAt: null }), now)).toBe(false);
    expect(isTaskReminderDue(task({ reminderStatus: "none" }), now)).toBe(false);
    expect(isTaskReminderDue(task({ reminderStatus: "snoozed" }), now)).toBe(true);
    expect(isTaskReminderDue(task({ reminderAt: "2026-08-20T02:00:00.000Z" }), now)).toBe(true);
    expect(isTaskReminderDue(task({ reminderAt: "2026-08-20T02:00:01.000Z" }), now)).toBe(false);
  });
  it("按自然日统计稍后次数，跨日或缺少记录归零", () => {
    const now = new Date(2026, 7, 20, 10, 0, 0);
    const sameDay = new Date(2026, 7, 20, 1, 0, 0).toISOString();
    const previousDay = new Date(2026, 7, 19, 23, 0, 0).toISOString();
    expect(snoozesToday(task(), now)).toBe(0);
    expect(snoozesToday(task({ snoozeCount: 2 }), now)).toBe(0);
    expect(snoozesToday(task({ snoozeCount: 2, lastReminderAt: sameDay }), now)).toBe(2);
    expect(snoozesToday(task({ snoozeCount: 2, lastReminderAt: previousDay }), now)).toBe(0);
    expect(canSnooze(task({ snoozeCount: 2, lastReminderAt: sameDay }), now)).toBe(true);
    expect(canSnooze(task({ snoozeCount: 3, lastReminderAt: sameDay }), now)).toBe(false);
  });
  it("快捷键 1 小时和每日上限常量", () => {
    expect(MAX_DAILY_SNOOZES).toBe(3);
    expect(quickSnoozeAt("1h", new Date("2026-08-20T02:00:00.000Z")).toISOString()).toBe("2026-08-20T03:00:00.000Z");
  });
  it("稍后提醒保留原提醒内容并写入审计时间", () => {
    const now = new Date("2026-08-20T02:00:00.000Z");
    const target = new Date("2026-08-20T05:30:00.000Z");
    const snoozed = snoozeTask(task(), target, now);
    expect(snoozed.reminderAt).toBe(target.toISOString());
    expect(snoozed.reminderStatus).toBe("snoozed");
    expect(snoozed.snoozeCount).toBe(1);
    expect(snoozed.lastReminderAt).toBe(now.toISOString());
    expect(snoozed.updatedAt).toBe(now.toISOString());
    expect(snoozed.title).toBe("提交评审");
  });
  it("跨日后的第一次稍后从 1 重新计数", () => {
    const now = new Date(2026, 7, 21, 10, 0, 0);
    const previousDay = new Date(2026, 7, 20, 10, 0, 0).toISOString();
    const snoozed = snoozeTask(task({ snoozeCount: 3, lastReminderAt: previousDay }), quickSnoozeAt("30m", now), now);
    expect(snoozed.snoozeCount).toBe(1);
  });
  it("触发提醒只更新状态与时间，不修改提醒计划", () => {
    const now = new Date("2026-08-20T02:00:00.000Z");
    const fired = markReminderFired(task(), now);
    expect(fired.reminderStatus).toBe("fired");
    expect(fired.reminderAt).toBe("2026-08-20T01:00:00.000Z");
    expect(fired.snoozeCount).toBe(0);
    expect(fired.lastReminderAt).toBe(now.toISOString());
    expect(fired.updatedAt).toBe(now.toISOString());
  });
});
