/*
 * Blocking first-paint bootstrap. Keep the storage key and normalization in
 * sync with src/lib/scopedStorage.ts and src/lib/appearance.ts.
 *
 * This file is loaded as a classic script in <head> before the app bundle so a
 * saved 100% setting can never be painted with the CSS fallback of 95%.
 */
(function () {
  try {
    var raw = window.localStorage.getItem("todo.appearanceOpacity");
    if (raw === null) return;
    var value = Number(raw);
    if (!Number.isFinite(value) || value < 55 || value > 100) return;
    var normalized = Math.round(value / 5) * 5;
    document.documentElement.style.setProperty("--widget-opacity", String(normalized / 100));
    document.documentElement.dataset.widgetOpacity = String(normalized);
  } catch (_error) {
    /* Storage can be unavailable; the CSS fallback remains the product default. */
  }
})();
