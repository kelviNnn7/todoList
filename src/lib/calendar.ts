import { addDays, endOfMonth, endOfWeek, format, isBefore, isSameDay, parseISO, startOfDay, startOfMonth, startOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { TodoItem } from "../types";

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

export function itemsForDate(items: TodoItem[], date: Date): TodoItem[] {
  return items.filter((item) => {
    const target = itemDate(item);
    return target && isSameDay(target, date);
  });
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
  return [...items].sort((a, b) => {
    if (a.completed !== b.completed) return Number(a.completed) - Number(b.completed);
    const ad = itemDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bd = itemDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return ad - bd || b.createdAt.localeCompare(a.createdAt);
  });
}
