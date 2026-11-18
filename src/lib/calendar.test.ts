import { describe, expect, it } from "vitest";
import {
  calendarBadge,
  dateKey,
  groupAgendaItems,
  isItemScheduledForDate,
  isMeetingPending,
  isOverdue,
  itemDate,
  itemOccurrenceForDate,
  itemsForDate,
  longDate,
  monthDays,
  pendingCountForDate,
  sortItems,
  weekDays,
} from "./calendar";
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
  it("每周任务从开始日期起出现在一个或多个所选星期", () => {
    const recurring = item({ taskSchedule: { mode: "weekly", startsOn: "2026-08-18", weekdays: [1, 3] }, completedDates: ["2026-08-19"] });
    expect(itemsForDate([recurring], new Date(2026, 7, 17))).toHaveLength(0);
    expect(itemsForDate([recurring], new Date(2026, 7, 19))).toHaveLength(1);
    expect(itemsForDate([recurring], new Date(2026, 7, 24))).toHaveLength(1);
    expect(itemsForDate([recurring], new Date(2026, 7, 25))).toHaveLength(0);
    expect(itemOccurrenceForDate(recurring, new Date(2026, 7, 19)).completed).toBe(true);
    expect(itemOccurrenceForDate(recurring, new Date(2026, 7, 24)).completed).toBe(false);
  });
  it("日历角标只统计未完成待办和未开始会议", () => {
    const date = new Date(2026, 7, 18, 12);
    const now = new Date(2026, 7, 18, 10);
    const pendingTask = item({ id: "pending" });
    const completedTask = item({ id: "completed", completed: true });
    const completedOccurrence = item({
      id: "recurring-completed",
      taskSchedule: { mode: "weekly", startsOn: "2026-08-18", weekdays: [2] },
      completedDates: ["2026-08-18"],
    });
    const upcomingMeeting = item({
      id: "upcoming-meeting", type: "meeting", dueAt: null,
      startAt: new Date(2026, 7, 18, 11).toISOString(), endAt: new Date(2026, 7, 18, 12).toISOString(),
    });
    const startedMeeting = item({
      id: "started-meeting", type: "meeting", dueAt: null,
      startAt: new Date(2026, 7, 18, 9).toISOString(), endAt: new Date(2026, 7, 18, 11).toISOString(),
    });
    const completedMeeting = item({
      id: "completed-meeting", type: "meeting", completed: true, dueAt: null,
      startAt: new Date(2026, 7, 18, 13).toISOString(), endAt: new Date(2026, 7, 18, 14).toISOString(),
    });
    expect(calendarBadge([pendingTask, completedTask, completedOccurrence, upcomingMeeting, startedMeeting, completedMeeting], date, now)).toEqual({ count: 2, overdue: false });
  });
  it("过去日期存在未完成待办时将日历角标标记为逾期", () => {
    const date = new Date(2026, 7, 18, 12);
    const now = new Date(2026, 7, 20, 10);
    expect(calendarBadge([item()], date, now)).toEqual({ count: 1, overdue: true });
    expect(calendarBadge([item({ completed: true })], date, now)).toEqual({ count: 0, overdue: false });
  });
  it("已完成任务不会标记逾期", () => {
    expect(isOverdue(item(), new Date("2026-08-20T12:00:00Z"))).toBe(true);
    expect(isOverdue(item({ completed: true }), new Date("2026-08-20T12:00:00Z"))).toBe(false);
  });
  it("跨年周仍从周一开始并覆盖七天", () => {
    expect(weekDays(new Date(2026, 11, 31)).map(dateKey)).toEqual([
      "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31",
      "2027-01-01", "2027-01-02", "2027-01-03",
    ]);
  });
  it("月视图覆盖二月与闰年边界", () => {
    const leapFebruary = monthDays(new Date(2028, 1, 15));
    expect(leapFebruary[0].getDay()).toBe(1);
    expect(leapFebruary.at(-1)?.getDay()).toBe(0);
    expect(leapFebruary.some((day) => day.getMonth() === 1 && day.getDate() === 29)).toBe(true);

    const completeFebruary = monthDays(new Date(2027, 1, 1));
    expect(completeFebruary[0].getDay()).toBe(1);
    expect(completeFebruary.at(-1)?.getDay()).toBe(0);
    expect(completeFebruary.some((day) => day.getMonth() === 2 && day.getDate() === 1)).toBe(false);
    expect(completeFebruary.some((day) => day.getMonth() === 1 && day.getDate() === 28)).toBe(true);
  });
  it("按任务截止时间或会议开始时间确定日期", () => {
    expect(itemDate(item())?.getDate()).toBe(18);
    expect(itemDate(item({ type: "meeting", startAt: new Date(2026, 7, 19, 9).toISOString() }))?.getDate()).toBe(19);
    expect(itemDate(item({ dueAt: null }))).toBeNull();
    expect(itemDate(item({ type: "meeting", startAt: null }))).toBeNull();
  });
  it("单日事项、会议与每周规则按日期匹配", () => {
    const meeting = item({
      type: "meeting",
      dueAt: null,
      startAt: new Date(2026, 7, 18, 9).toISOString(),
      endAt: new Date(2026, 7, 18, 10).toISOString(),
    });
    expect(isItemScheduledForDate(meeting, new Date(2026, 7, 18, 12))).toBe(true);
    expect(isItemScheduledForDate(meeting, new Date(2026, 7, 19, 12))).toBe(false);
    expect(isItemScheduledForDate(item({ dueAt: null }), new Date(2026, 7, 18, 12))).toBe(false);

    const weekly = item({ taskSchedule: { mode: "weekly", startsOn: "2026-08-18", weekdays: [2, 7] } });
    expect(isItemScheduledForDate(weekly, new Date(2026, 7, 18))).toBe(true);
    expect(isItemScheduledForDate(weekly, new Date(2026, 7, 23))).toBe(true);
    expect(isItemScheduledForDate(weekly, new Date(2026, 7, 17))).toBe(false);
    expect(isItemScheduledForDate(weekly, new Date(2026, 7, 20))).toBe(false);
  });
  it("非每周事项不生成发生实例", () => {
    const single = item();
    expect(itemOccurrenceForDate(single, new Date(2026, 7, 18))).toBe(single);
  });
  it("会议角标忽略已完成、缺少开始时间或已经开始会议", () => {
    const date = new Date(2026, 7, 18, 12);
    const now = new Date(2026, 7, 18, 10);
    const meeting = item({
      type: "meeting",
      dueAt: null,
      startAt: new Date(2026, 7, 18, 11).toISOString(),
      endAt: new Date(2026, 7, 18, 12).toISOString(),
    });
    expect(calendarBadge([meeting], date, now)).toEqual({ count: 1, overdue: false });
    expect(calendarBadge([meeting], date, new Date(2026, 7, 18, 11))).toEqual({ count: 0, overdue: false });
    expect(calendarBadge([{ ...meeting, startAt: null }], date, now)).toEqual({ count: 0, overdue: false });
    expect(calendarBadge([{ ...meeting, completed: true }], date, now)).toEqual({ count: 0, overdue: false });
  });
  it("逾期判断覆盖会议、无日期与当天截止", () => {
    expect(isOverdue(item({ type: "meeting", dueAt: null, startAt: new Date(2026, 7, 18, 9).toISOString() }), new Date(2026, 7, 20, 10))).toBe(true);
    expect(isOverdue(item({ dueAt: null }), new Date(2026, 7, 20, 10))).toBe(false);
    expect(isOverdue(item({ dueAt: new Date(2026, 7, 20, 9).toISOString() }), new Date(2026, 7, 20, 18))).toBe(false);
  });
  it("格式化长日期与稳定排序", () => {
    expect(longDate(new Date(2026, 7, 18))).toBe("8月18日 星期二");
    const older = item({ id: "older", createdAt: "2026-08-18T00:00:00.000Z" });
    const newer = item({ id: "newer", createdAt: "2026-08-19T00:00:00.000Z" });
    const later = item({ id: "later", dueAt: new Date(2026, 7, 19, 12).toISOString() });
    const completed = item({ id: "completed", completed: true, dueAt: null });
    const undated = item({ id: "undated", dueAt: null });
    expect(sortItems([completed, undated, older, later, newer]).map((entry) => entry.id)).toEqual([
      "newer", "older", "later", "completed", "undated",
    ]);
  });
});

describe("calendar pending projection and agenda grouping", () => {
  it("待处理计数排除已完成例次与已开始会议，并跟随筛选", () => {
    const date = new Date(2026, 10, 17, 12);
    const now = new Date(2026, 10, 17, 10);
    const task = item({ id: "task", dueAt: new Date(2026, 10, 17, 23, 59).toISOString() });
    const completed = item({ id: "completed", completed: true, dueAt: new Date(2026, 10, 17, 23, 59).toISOString() });
    const recurringDone = item({
      id: "recurring", taskSchedule: { mode: "weekly", startsOn: "2026-11-17", weekdays: [2] }, completedDates: ["2026-11-17"],
    });
    const upcoming = item({ id: "upcoming", type: "meeting", dueAt: null, startAt: new Date(2026, 10, 17, 11).toISOString() });
    const started = item({ id: "started", type: "meeting", dueAt: null, startAt: new Date(2026, 10, 17, 9).toISOString() });
    const items = [task, completed, recurringDone, upcoming, started];

    expect(pendingCountForDate(items, date, "all", now)).toBe(2);
    expect(pendingCountForDate(items, date, "task", now)).toBe(1);
    expect(pendingCountForDate(items, date, "meeting", now)).toBe(1);
    expect(isMeetingPending(upcoming, now)).toBe(true);
    expect(isMeetingPending(started, now)).toBe(false);
  });

  it("展开清单按全天任务与有时间会议分组并保持会议时间顺序", () => {
    const allDay = item({ id: "all-day", type: "task" });
    const later = item({ id: "later", type: "meeting", dueAt: null, startAt: new Date(2026, 7, 18, 15).toISOString() });
    const earlier = item({ id: "earlier", type: "meeting", dueAt: null, startAt: new Date(2026, 7, 18, 9).toISOString() });
    expect(groupAgendaItems([later, allDay, earlier])).toEqual({ allDay: [allDay], timed: [earlier, later] });
  });
});
