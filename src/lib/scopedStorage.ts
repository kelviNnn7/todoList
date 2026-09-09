const STORAGE_NAMESPACE = "todo";

export function scopedStorageKey(name: string): string {
  return `${STORAGE_NAMESPACE}.${name}`;
}

export function readScopedValue(name: string): string | null {
  return localStorage.getItem(scopedStorageKey(name));
}

export function writeScopedValue(name: string, value: string): void {
  localStorage.setItem(scopedStorageKey(name), value);
}
