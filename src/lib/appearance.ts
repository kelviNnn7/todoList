import { readScopedValue } from "./scopedStorage";

export const MIN_WIDGET_OPACITY = 55;
export const MAX_WIDGET_OPACITY = 100;
export const WIDGET_OPACITY_STEP = 5;
export const DEFAULT_WIDGET_OPACITY = 95;

/**
 * Normalizes the persisted appearance value to the 55–100 / step-5 domain.
 * Invalid or out-of-range values fall back to the product default instead of
 * leaking a partially applied setting into the first paint.
 */
export function normalizeWidgetOpacity(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < MIN_WIDGET_OPACITY || numeric > MAX_WIDGET_OPACITY) {
    return DEFAULT_WIDGET_OPACITY;
  }
  return Math.round(numeric / WIDGET_OPACITY_STEP) * WIDGET_OPACITY_STEP;
}

export function readStoredWidgetOpacity(): number {
  return normalizeWidgetOpacity(readScopedValue("appearanceOpacity"));
}

/**
 * Applies the single user alpha to the document before React mounts. The shell
 * itself turns this value into an opaque background at 100% and a stable
 * background alpha at lower levels.
 */
export function applyWidgetOpacity(opacity: number, root: HTMLElement = document.documentElement): number {
  const normalized = normalizeWidgetOpacity(opacity);
  root.style.setProperty("--widget-opacity", String(normalized / 100));
  root.dataset.widgetOpacity = String(normalized);
  return normalized;
}
