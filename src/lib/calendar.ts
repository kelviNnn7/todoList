import { addDays, endOfMonth, endOfWeek, format, isBefore, isSameDay, parseISO, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { FilterType, TodoItem } from "../types";

export function weekDays(anchor: Date): Date[] {
  const first = startOfWeek(startOfDay(anchor), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => addDays(first, index));
}

export function monthDays(anchor: Date): Date[] {
  const first = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const last = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const count = Math.round((startOfDay(last).getTime() - startOfDay(first).getTime()) / 86_400_000) + 1;
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

export function itemDate(item: TodoItem): Date | null {
  const value = item.type === "meeting" ? item.startAt : item.dueAt;
  return value ? parseISO(value) : null;
}

function isoWeekday(date: Date): number {
  return date.getDay() || 7;
}

export function isItemScheduledForDate(item: TodoItem, date: Date): boolean {
  if (item.type !== "task" || item.taskSchedule?.mode !== "weekly") {
    const target = itemDate(item);
    return Boolean(target && isSameDay(target, date));
  }
  return dateKey(date) >= item.taskSchedule.startsOn && item.taskSchedule.weekdays.includes(isoWeekday(date));
}

export function itemOccurrenceForDate(item: TodoItem, date: Date): TodoItem {
  if (item.type !== "task" || item.taskSchedule?.mode !== "weekly") return item;
  const occurrenceDate = dateKey(date);
  return { ...item, dueAt: new Date(`${occurrenceDate}T23:59:59`).toISOString(), completed: (item.completedDates ?? []).includes(occurrenceDate) };
}

export function itemsForDate(items: TodoItem[], date: Date): TodoItem[] {
  return items.filter((item) => isItemScheduledForDate(item, date));
}

export function isMeetingPending(item: TodoItem, now = new Date()): boolean {
  return item.type === "meeting" && !item.completed && Boolean(item.startAt && parseISO(item.startAt).getTime() > now.getTime());
}

export function calendarBadge(items: TodoItem[], date: Date, now = new Date()): { count: number; overdue: boolean } {
  const dateIsPast = isBefore(startOfDay(date), startOfDay(now));
  return itemsForDate(items, date).reduce<{ count: number; overdue: boolean }>((badge, item) => {
    if (item.type === "task") {
      if (!itemOccurrenceForDate(item, date).completed) {
        badge.count += 1;
        badge.overdue ||= dateIsPast;
      }
      return badge;
    }
    if (isMeetingPending(item, now)) badge.count += 1;
    return badge;
  }, { count: 0, overdue: false });
}

/**
 * Pending count for the selected day header. It follows the same projection as
 * the calendar badge: incomplete task occurrences plus meetings that have not
 * started yet. Completed items stay in the list but never inflate this count.
 */
export function pendingCountForDate(items: TodoItem[], date: Date, filter: FilterType = "all", now = new Date()): number {
  return itemsForDate(items, date).reduce((count, item) => {
    if (filter !== "all" && item.type !== filter) return count;
    if (item.type === "task") return count + (itemOccurrenceForDate(item, date).completed ? 0 : 1);
    return count + (isMeetingPending(item, now) ? 1 : 0);
  }, 0);
}

export interface AgendaGroups {
  allDay: TodoItem[];
  timed: TodoItem[];
}

/** Expanded desktop layout groups a shared surface by all-day and timed rows. */
export function groupAgendaItems(items: TodoItem[]): AgendaGroups {
  const ordered = sortItems(items);
  return {
    allDay: ordered.filter((item) => item.type === "task" || !item.startAt),
    timed: ordered
      .filter((item) => item.type === "meeting" && item.startAt)
      .sort((a, b) => (itemDate(a)?.getTime() ?? 0) - (itemDate(b)?.getTime() ?? 0)),
  };
}

export function isOverdue(item: TodoItem, now = new Date()): boolean {
  const target = itemDate(item);
  return Boolean(target && !item.completed && isBefore(target, startOfDay(now)));
}

export function longDate(date: Date): string {
  return format(date, "M月d日 EEEE", { locale: zhCN });
}

export function dateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function sortItems(items: TodoItem[]): TodoItem[] {
  // Completion never reorders the list: a row keeps its position so focus,
  // reading order and scroll offset stay stable when the user checks it.
  return [...items].sort((a, b) => {
    const ad = itemDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bd = itemDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ad - bd || b.createdAt.localeCompare(a.createdAt);
  });
}
