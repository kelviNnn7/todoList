import type { TodoItem, WeeklyTaskSchedule } from "../types";
import { readScopedValue, writeScopedValue } from "./scopedStorage";
import { invoke, isDesktopRuntime } from "./desktop";

const FALLBACK_ENTRY = "items.v1";

function isDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day;
}

function parseTaskSchedule(value: Partial<TodoItem>): WeeklyTaskSchedule | null {
  if (value.taskSchedule?.mode !== "weekly" || !isDateKey(value.taskSchedule.startsOn) || !Array.isArray(value.taskSchedule.weekdays)) return null;
  const weekdays = value.taskSchedule.weekdays.filter((day): day is number => Number.isInteger(day) && day >= 1 && day <= 7);
  return weekdays.length > 0 ? { mode: "weekly", startsOn: value.taskSchedule.startsOn, weekdays: [...new Set(weekdays)].sort() } : null;
}

function safeParse(payload: string): TodoItem | null {
  try {
    const value = JSON.parse(payload) as Partial<TodoItem>;
    if (!value || typeof value.id !== "string" || typeof value.title !== "string") return null;
    return {
      ...value,
      reminderAt: typeof value.reminderAt === "string" ? value.reminderAt : null,
      reminderStatus: ["pending", "fired", "snoozed"].includes(value.reminderStatus ?? "") ? value.reminderStatus! : "none",
      snoozeCount: Number.isInteger(value.snoozeCount) && value.snoozeCount! >= 0 ? value.snoozeCount! : 0,
      lastReminderAt: typeof value.lastReminderAt === "string" ? value.lastReminderAt : null,
      subtasks: Array.isArray(value.subtasks) ? value.subtasks : [],
      taskSchedule: parseTaskSchedule(value),
      completedDates: Array.isArray(value.completedDates) ? [...new Set(value.completedDates.filter(isDateKey))].sort() : [],
    } as TodoItem;
  } catch { return null; }
}

export async function loadItems(): Promise<TodoItem[]> {
  if (isDesktopRuntime()) {
    const rows = await invoke<string[]>("list_items");
    return rows.map(safeParse).filter((item): item is TodoItem => item !== null);
  }
  return (safeParseArray(readScopedValue(FALLBACK_ENTRY)) ?? []);
}

function safeParseArray(payload: string | null): TodoItem[] | null {
  if (!payload) return [];
  try {
    const value = JSON.parse(payload);
    if (!Array.isArray(value)) return null;
    return value.map((item) => safeParse(JSON.stringify(item))).filter((item): item is TodoItem => item !== null);
  } catch { return null; }
}

export async function saveItem(item: TodoItem): Promise<void> {
  if (isDesktopRuntime()) {
    await invoke("upsert_item", { id: item.id, payload: JSON.stringify(item), updatedAt: item.updatedAt });
    return;
  }
  const items = await loadItems();
  const next = items.filter((current) => current.id !== item.id);
  writeScopedValue(FALLBACK_ENTRY, JSON.stringify([item, ...next]));
}

export async function deleteItem(id: string): Promise<void> {
  if (isDesktopRuntime()) { await invoke("delete_item", { id }); return; }
  const items = await loadItems();
  writeScopedValue(FALLBACK_ENTRY, JSON.stringify(items.filter((item) => item.id !== id)));
}
