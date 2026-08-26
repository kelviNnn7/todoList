import type { TodoItem } from "../types";
import { readScopedValue, writeScopedValue } from "./scopedStorage";
import { invoke, isDesktopRuntime } from "./desktop";

const FALLBACK_ENTRY = "items.v1";

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
