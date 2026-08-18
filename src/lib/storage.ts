import type { TodoItem } from "../types";

const FALLBACK_KEY = "pindo.items.v1";

const inTauri = () => "__TAURI_INTERNALS__" in window;

function safeParse(payload: string): TodoItem | null {
  try {
    const value = JSON.parse(payload) as TodoItem;
    if (!value || typeof value.id !== "string" || typeof value.title !== "string") return null;
    return { ...value, subtasks: Array.isArray(value.subtasks) ? value.subtasks : [] };
  } catch { return null; }
}

export async function loadItems(): Promise<TodoItem[]> {
  if (inTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    const rows = await invoke<string[]>("list_items");
    return rows.map(safeParse).filter((item): item is TodoItem => item !== null);
  }
  return (safeParseArray(localStorage.getItem(FALLBACK_KEY)) ?? []);
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
  if (inTauri()) {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("upsert_item", { id: item.id, payload: JSON.stringify(item), updatedAt: item.updatedAt });
    return;
  }
  const items = await loadItems();
  const next = items.filter((current) => current.id !== item.id);
  localStorage.setItem(FALLBACK_KEY, JSON.stringify([item, ...next]));
}

export async function deleteItem(id: string): Promise<void> {
  if (inTauri()) { const { invoke } = await import("@tauri-apps/api/core"); await invoke("delete_item", { id }); return; }
  const items = await loadItems();
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(items.filter((item) => item.id !== id)));
}
