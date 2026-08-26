const STORAGE_NAMESPACE = "todo";
const LEGACY_NAMESPACE = ["pin", "do"].join("");

export function scopedStorageKey(name: string): string {
  return `${STORAGE_NAMESPACE}.${name}`;
}

function legacyStorageKey(name: string): string {
  return `${LEGACY_NAMESPACE}.${name}`;
}

export function readScopedValue(name: string): string | null {
  const key = scopedStorageKey(name);
  const current = localStorage.getItem(key);
  if (current !== null) return current;

  const legacyKey = legacyStorageKey(name);
  const legacy = localStorage.getItem(legacyKey);
  if (legacy !== null) {
    localStorage.setItem(key, legacy);
    localStorage.removeItem(legacyKey);
  }
  return legacy;
}

export function writeScopedValue(name: string, value: string): void {
  localStorage.setItem(scopedStorageKey(name), value);
}
