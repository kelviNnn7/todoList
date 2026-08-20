import { addDays, addHours, addMinutes, isSameDay, set } from "date-fns";
import type { TodoItem } from "../types";

export const MAX_DAILY_SNOOZES = 3;

export function isTaskReminderDue(item: TodoItem, now = new Date()): boolean {
  if (item.type !== "task" || item.completed || !item.reminderAt) return false;
  if (item.reminderStatus !== "pending" && item.reminderStatus !== "snoozed") return false;
  return new Date(item.reminderAt).getTime() <= now.getTime();
}

export function snoozesToday(item: TodoItem, now = new Date()): number {
  if (!item.lastReminderAt || !isSameDay(new Date(item.lastReminderAt), now)) return 0;
  return item.snoozeCount;
}

export function canSnooze(item: TodoItem, now = new Date()): boolean {
  return snoozesToday(item, now) < MAX_DAILY_SNOOZES;
}

export type QuickSnooze = "30m" | "1h" | "tomorrow9";

export function quickSnoozeAt(kind: QuickSnooze, now = new Date()): Date {
  if (kind === "30m") return addMinutes(now, 30);
  if (kind === "1h") return addHours(now, 1);
  return set(addDays(now, 1), { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 });
}

export function snoozeTask(item: TodoItem, reminderAt: Date, now = new Date()): TodoItem {
  if (!canSnooze(item, now)) throw new Error("今天已达到 3 次稍后提醒上限");
  const currentCount = snoozesToday(item, now);
  return {
    ...item,
    reminderAt: reminderAt.toISOString(),
    reminderStatus: "snoozed",
    snoozeCount: currentCount + 1,
    lastReminderAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function markReminderFired(item: TodoItem, now = new Date()): TodoItem {
  return {
    ...item,
    reminderStatus: "fired",
    lastReminderAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}
