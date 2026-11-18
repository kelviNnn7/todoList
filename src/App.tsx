import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, format, isSameDay, isSameMonth, isToday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Check, ChevronLeft, ChevronRight, Expand, Minimize2, Plus, SlidersHorizontal } from "lucide-react";
import { ItemCard } from "./components/ItemCard";
import { ItemForm } from "./components/ItemForm";
import {
  calendarBadge,
  dateKey,
  groupAgendaItems,
  itemDate,
  itemOccurrenceForDate,
  itemsForDate,
  monthDays,
  pendingCountForDate,
  sortItems,
  weekDays,
} from "./lib/calendar";
import { parseIcs } from "./lib/ics";
import { isTaskReminderDue, markReminderFired, quickSnoozeAt, snoozeTask, type QuickSnooze } from "./lib/reminders";
import { deleteItem, loadItems, saveItem } from "./lib/storage";
import { readScopedValue, writeScopedValue } from "./lib/scopedStorage";
import { MAX_WIDGET_OPACITY, MIN_WIDGET_OPACITY, normalizeWidgetOpacity, readStoredWidgetOpacity } from "./lib/appearance";
import { invoke, isAutostartEnabled, isDesktopRuntime, listen, sendMeetingNotification, setAutostartEnabled, startDragging, startResizeDragging } from "./lib/desktop";
import type { CalendarViewMode, FilterType, ItemType, TodoItem } from "./types";
import appIcon from "./assets/app-icon.png";

type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";
type FontLevel = 1 | 2 | 3 | 4;
type ToastKind = "info" | "error" | "success";
type OpenModality = "pointer" | "keyboard";

interface UndoRecord {
  itemId: string;
  occurrenceDate: string;
  title: string;
  beforeSubtasks: Array<{ id: string; completed: boolean }>;
  afterSubtasks: Array<{ id: string; completed: boolean }>;
}

const weekdayLabels = ["一", "二", "三", "四", "五", "六", "日"];
const savedView = (expanded: boolean): CalendarViewMode => {
  const value = readScopedValue(`calendarView.${expanded ? "expanded" : "widget"}`);
  return value === "week" || value === "month" ? value : expanded ? "month" : "week";
};
const savedFontLevel = (): FontLevel => {
  const value = readScopedValue("appearanceFontSize");
  if (value === "2" || value === "large") return 2;
  if (value === "3") return 3;
  if (value === "4") return 4;
  return 1;
};
const fontScale: Record<FontLevel, number> = { 1: 1, 2: 1.15, 3: 1.3, 4: 1.45 };
const resizeDirections: ResizeDirection[] = ["North", "NorthEast", "East", "SouthEast", "South", "SouthWest", "West", "NorthWest"];
const dayLabel = (day: Date) => `${format(day, "M月d日")} ${format(day, "EEEE", { locale: zhCN })}`;
const focusCheckFor = (id: string) => requestAnimationFrame(() => {
  const target = [...document.querySelectorAll<HTMLElement>("[data-check-id]")].find((element) => element.dataset.checkId === id);
  target?.focus();
});

export default function App() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [focusedDate, setFocusedDate] = useState(new Date());
  const [calendarAnchor, setCalendarAnchor] = useState(new Date());
  const [calendarNow, setCalendarNow] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => savedView(false));
  const [filter, setFilter] = useState<FilterType>("all");
  const [formType, setFormType] = useState<ItemType | null>(null);
  const [editingItem, setEditingItem] = useState<TodoItem | null>(null);
  const [formModality, setFormModality] = useState<OpenModality>("pointer");
  const [formAnchor, setFormAnchor] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedWindow, setExpandedWindow] = useState(false);
  const [expandedItemIds, setExpandedItemIds] = useState<string[]>([]);
  const [locked, setLocked] = useState(() => readScopedValue("positionLocked") === "true");
  const [edgeSnap, setEdgeSnap] = useState(() => readScopedValue("edgeSnap") !== "false");
  const [dragging, setDragging] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [desktopWidget, setDesktopWidget] = useState(() => readScopedValue("desktopWidget") === "true");
  const [appearanceOpacity, setAppearanceOpacity] = useState(readStoredWidgetOpacity);
  const [appearanceFontLevel, setAppearanceFontLevel] = useState<FontLevel>(savedFontLevel);
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const [undo, setUndo] = useState<UndoRecord | null>(null);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [highlightedItemId, setHighlightedItemId] = useState<string | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const menuContainer = useRef<HTMLSpanElement>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const listScroll = useRef(0);
  const grid = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const itemsRef = useRef(items);
  const draggingRef = useRef(false);
  const dragTokenRef = useRef(0);
  const systemDateKey = useRef(dateKey(calendarNow));
  const toastTimer = useRef<number | undefined>(undefined);
  const openModality = useRef<OpenModality>("pointer");
  const days = useMemo(() => viewMode === "week" ? weekDays(calendarAnchor) : monthDays(calendarAnchor), [calendarAnchor, viewMode]);

  const notify = useCallback((message: string, kind: ToastKind = "info", options: { keepUndo?: boolean; duration?: number } = {}) => {
    if (!options.keepUndo) setUndo(null);
    setToast({ message, kind });
    if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToast(null);
      setUndo(null);
    }, options.duration ?? 4200);
  }, []);

  useEffect(() => () => { if (toastTimer.current !== undefined) window.clearTimeout(toastTimer.current); }, []);

  const showToday = useCallback((today = new Date()) => {
    systemDateKey.current = dateKey(today);
    setCalendarNow(today);
    setSelectedDate(today);
    setFocusedDate(today);
    setCalendarAnchor(today);
  }, []);
  const syncSystemDate = useCallback((now = new Date()) => {
    if (systemDateKey.current !== dateKey(now)) {
      showToday(now);
      return;
    }
    setCalendarNow(now);
  }, [showToday]);
  const endWindowDrag = useCallback((token?: number) => {
    if (token !== undefined && token !== dragTokenRef.current) return;
    draggingRef.current = false;
    dragTokenRef.current += 1;
    setDragging(false);
  }, []);

  const persist = useCallback(async (item: TodoItem) => {
    await saveItem(item);
    const next = [item, ...itemsRef.current.filter((value) => value.id !== item.id)];
    itemsRef.current = next;
    setItems(next);
  }, []);

  const persistOccurrenceFor = useCallback(async (changed: TodoItem, occurrenceDate: Date) => {
    const original = itemsRef.current.find((item) => item.id === changed.id);
    if (!original || original.type !== "task" || original.taskSchedule?.mode !== "weekly") {
      await persist(changed);
      return;
    }
    const occurrence = dateKey(occurrenceDate);
    const completedDates = new Set(original.completedDates ?? []);
    if (changed.completed) completedDates.add(occurrence); else completedDates.delete(occurrence);
    await persist({ ...original, ...changed, dueAt: original.dueAt, completed: false, completedDates: [...completedDates].sort(), updatedAt: new Date().toISOString() });
  }, [persist]);

  const changeItem = useCallback(async (changed: TodoItem) => {
    const original = itemsRef.current.find((item) => item.id === changed.id);
    try {
      await persistOccurrenceFor(changed, selectedDate);
    } catch {
      notify("保存失败，请重试", "error");
      throw new Error("保存失败");
    }
    if (original && !original.completed && changed.completed) {
      const record: UndoRecord = {
        itemId: changed.id,
        occurrenceDate: dateKey(selectedDate),
        title: changed.title,
        beforeSubtasks: original.subtasks.map((subtask) => ({ id: subtask.id, completed: subtask.completed })),
        afterSubtasks: changed.subtasks.map((subtask) => ({ id: subtask.id, completed: subtask.completed })),
      };
      notify("已标记完成", "success", { keepUndo: true, duration: 12000 });
      setUndo(record);
    } else if (!changed.completed) {
      setUndo((current) => current?.itemId === changed.id ? null : current);
    }
  }, [notify, persistOccurrenceFor, selectedDate]);

  const undoCompletion = useCallback(async () => {
    const record = undo;
    if (!record) return;
    const current = itemsRef.current.find((item) => item.id === record.itemId);
    if (!current) {
      setUndo(null);
      notify("事项已不存在，无法撤销", "error");
      return;
    }
    if (current.type === "task" && current.taskSchedule?.mode === "weekly") {
      const completedDates = current.completedDates ?? [];
      if (!completedDates.includes(record.occurrenceDate)) {
        setUndo(null);
        notify("该日期的完成状态已改变", "info");
        return;
      }
      const next = { ...current, completedDates: completedDates.filter((value) => value !== record.occurrenceDate), updatedAt: new Date().toISOString() };
      try {
        await persist(next);
        setUndo(null);
        notify("已撤销完成");
        focusCheckFor(current.id);
      } catch {
        notify("撤销失败，请重试", "error", { keepUndo: true, duration: 12000 });
      }
      return;
    }
    if (!current.completed) {
      setUndo(null);
      notify("该事项已恢复为待处理", "info");
      return;
    }
    const subtasks = current.subtasks.map((subtask) => {
      const before = record.beforeSubtasks.find((value) => value.id === subtask.id);
      const after = record.afterSubtasks.find((value) => value.id === subtask.id);
      if (before && after && subtask.completed === after.completed && after.completed !== before.completed) {
        return { ...subtask, completed: before.completed };
      }
      return subtask;
    });
    const next = { ...current, completed: false, subtasks, updatedAt: new Date().toISOString() };
    try {
      await persist(next);
      setUndo(null);
      notify("已撤销完成");
      focusCheckFor(current.id);
    } catch {
      notify("撤销失败，请重试", "error", { keepUndo: true, duration: 12000 });
    }
  }, [notify, persist, undo]);

  const remove = useCallback(async (id: string) => {
    if (!window.confirm("确定删除这个事项吗？此操作无法撤销。")) return;
    try {
      await deleteItem(id);
      const next = itemsRef.current.filter((item) => item.id !== id);
      itemsRef.current = next;
      setItems(next);
      setUndo((current) => current?.itemId === id ? null : current);
    } catch {
      notify("删除失败，请重试", "error");
    }
  }, [notify]);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => {
    const markPointer = () => { openModality.current = "pointer"; };
    const markKeyboard = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "Tab") openModality.current = "keyboard";
    };
    document.addEventListener("pointerdown", markPointer, true);
    document.addEventListener("keydown", markKeyboard, true);
    return () => {
      document.removeEventListener("pointerdown", markPointer, true);
      document.removeEventListener("keydown", markKeyboard, true);
    };
  }, []);
  useEffect(() => {
    let active = true;
    loadItems()
      .then((loaded) => { if (active) { itemsRef.current = loaded; setItems(loaded); } })
      .catch(() => { if (active) notify("本地数据加载失败，请重试", "error"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [notify]);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    isAutostartEnabled().then(setAutostart).catch(() => setAutostart(false));
  }, []);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    invoke("set_desktop_widget_mode", { enabled: desktopWidget }).catch(() => undefined);
  }, [desktopWidget]);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    invoke("set_edge_snap", { enabled: edgeSnap }).catch(() => undefined);
  }, [edgeSnap]);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    invoke("set_position_locked", { locked }).catch(() => undefined);
  }, [locked]);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    invoke("set_widget_opacity", { opacity: appearanceOpacity }).catch(() => undefined);
  }, [appearanceOpacity]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!menuContainer.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [menuOpen]);
  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      settingsButton.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [menuOpen]);
  useEffect(() => {
    const endDrag = () => endWindowDrag();
    const endDragWhenHidden = () => {
      if (document.visibilityState === "hidden") endWindowDrag();
    };
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    window.addEventListener("mouseup", endDrag);
    window.addEventListener("blur", endDrag);
    document.addEventListener("visibilitychange", endDragWhenHidden);
    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("mouseup", endDrag);
      window.removeEventListener("blur", endDrag);
      document.removeEventListener("visibilitychange", endDragWhenHidden);
    };
  }, [endWindowDrag]);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let unlisten: (() => void) | undefined;
    listen<string>("deep-link", (payload) => {
      if (payload.endsWith("://today")) showToday();
    }).then((dispose) => { unlisten = dispose; }).catch(() => undefined);
    return () => unlisten?.();
  }, [showToday]);
  useEffect(() => {
    const syncWhenActive = () => {
      if (document.visibilityState === "visible") syncSystemDate();
    };
    window.addEventListener("focus", syncWhenActive);
    document.addEventListener("visibilitychange", syncWhenActive);
    return () => {
      window.removeEventListener("focus", syncWhenActive);
      document.removeEventListener("visibilitychange", syncWhenActive);
    };
  }, [syncSystemDate]);
  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let unlisten: (() => void) | undefined;
    listen<boolean>("position-lock-changed", (payload) => {
      setLocked(payload); writeScopedValue("positionLocked", String(payload));
    }).then((dispose) => { unlisten = dispose; }).catch(() => undefined);
    return () => unlisten?.();
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    let unlisten: (() => void) | undefined;
    listen<{ taskId: string; actionId: string }>("task-reminder-action", (payload) => {
      const { actionId, taskId } = payload;
      const task = taskId ? itemsRef.current.find((item) => item.id === taskId) : undefined;
      if (!task) return;
      if (actionId === "custom" || actionId === "default") {
        const target = itemDate(task);
        if (target) { setSelectedDate(target); setFocusedDate(target); setCalendarAnchor(target); }
        setFocusedItemId(task.id);
        setExpandedItemIds((current) => current.includes(task.id) ? current : [...current, task.id]);
        setFilter("task");
        notify(actionId === "custom" ? "请在任务详情中选择自定义提醒时间" : "已打开提醒任务");
        invoke("show_main_window").catch(() => undefined);
        return;
      }
      if (actionId === "30m" || actionId === "1h" || actionId === "tomorrow9") {
        void persist(snoozeTask(task, quickSnoozeAt(actionId as QuickSnooze))).catch(() => notify("稍后提醒失败", "error"));
      }
    }).then((dispose) => { unlisten = dispose; }).catch(() => undefined);
    return () => unlisten?.();
  }, [notify, persist]);

  useEffect(() => {
    const scan = async () => {
      const now = new Date();
      syncSystemDate(now);
      if (!isDesktopRuntime()) return;
      for (const item of itemsRef.current) {
        if (item.type === "meeting" && !item.completed && item.startAt && item.reminderMinutes != null && !item.reminderSentAt) {
          const triggerAt = new Date(item.startAt).getTime() - item.reminderMinutes * 60_000;
          if (now.getTime() >= triggerAt && now.getTime() < new Date(item.startAt).getTime() + 60_000) {
            await sendMeetingNotification(`即将开始 · ${item.title}`, item.location || `${item.reminderMinutes} 分钟后开始`);
            await persist({ ...item, reminderSentAt: now.toISOString(), updatedAt: now.toISOString() });
          }
        }
        if (isTaskReminderDue(item, now)) {
          await invoke("send_task_notification", { taskId: item.id, title: item.title, body: item.notes || "该处理这项任务了" });
          await persist(markReminderFired(item, now));
        }
      }
    };
    void scan();
    const timer = window.setInterval(() => void scan(), 30_000);
    return () => clearInterval(timer);
  }, [persist, syncSystemDate]);

  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    const target = [...(grid.current?.querySelectorAll<HTMLElement>("[data-date]") ?? [])].find((element) => element.dataset.date === key);
    target?.focus();
  }, [focusedDate, days, viewMode]);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    element.scrollTop = Math.min(listScroll.current, Math.max(0, element.scrollHeight - element.clientHeight));
  }, [expandedWindow]);

  useEffect(() => {
    const element = list.current;
    if (!element) return;
    listScroll.current = 0;
    element.scrollTop = 0;
  }, [selectedDate, filter]);

  const visible = useMemo(() => sortItems(itemsForDate(items, selectedDate).filter((item) => filter === "all" || item.type === filter).map((item) => itemOccurrenceForDate(item, selectedDate))), [items, selectedDate, filter]);
  const counts = useMemo(() => ({
    all: pendingCountForDate(items, selectedDate, "all", calendarNow),
    task: pendingCountForDate(items, selectedDate, "task", calendarNow),
    meeting: pendingCountForDate(items, selectedDate, "meeting", calendarNow),
  }), [items, selectedDate, calendarNow]);
  const groups = useMemo(() => groupAgendaItems(visible), [visible]);
  const compactItems = useMemo(() => [...groups.allDay, ...groups.timed], [groups]);

  useEffect(() => {
    if (!highlightedItemId) return;
    const timer = window.setTimeout(() => setHighlightedItemId(null), 2600);
    return () => window.clearTimeout(timer);
  }, [highlightedItemId]);
  useEffect(() => {
    if (!highlightedItemId) return;
    const element = list.current;
    if (!element) return;
    // Only a newly added row changes the item count; completing a row must not re-scroll the list.
    const row = [...element.querySelectorAll<HTMLElement>("[data-item-id]")].find((value) => value.dataset.itemId === highlightedItemId);
    if (!row) return;
    row.classList.add("just-created");
    const listRect = element.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    element.scrollTop = Math.max(0, element.scrollTop + rowRect.top - listRect.top - 4);
    return () => row.classList.remove("just-created");
  }, [highlightedItemId, items.length]);

  function openCreate(type: ItemType, trigger?: HTMLElement | null) {
    setMenuOpen(false);
    setFormAnchor(trigger ?? newButton.current);
    setFormModality(openModality.current);
    setEditingItem(null);
    setFormType(type);
  }
  function openEdit(item: TodoItem, trigger?: HTMLElement) {
    const original = itemsRef.current.find((value) => value.id === item.id) ?? item;
    setFormAnchor(trigger ?? newButton.current);
    setFormModality(openModality.current);
    setEditingItem(original);
    setFormType(original.type);
  }
  function closeForm(restoreFocus = true) {
    const trigger = formAnchor;
    setFormType(null);
    setEditingItem(null);
    if (!restoreFocus) return;
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus();
      else newButton.current?.focus();
    });
  }
  function chooseView(next: CalendarViewMode) {
    setViewMode(next);
    setCalendarAnchor(selectedDate);
    setFocusedDate(selectedDate);
    writeScopedValue(`calendarView.${expandedWindow ? "expanded" : "widget"}`, next);
  }
  async function toggleWindow() {
    const next = !expandedWindow;
    setExpandedWindow(next);
    writeScopedValue(`calendarView.${next ? "expanded" : "widget"}`, viewMode);
    if (isDesktopRuntime()) await invoke("set_window_mode", { expanded: next });
  }
  function toggleLock() {
    const next = !locked; setLocked(next); writeScopedValue("positionLocked", String(next));
  }
  function toggleEdgeSnap() { const next = !edgeSnap; setEdgeSnap(next); writeScopedValue("edgeSnap", String(next)); }
  async function toggleAutostart() {
    if (!isDesktopRuntime()) { notify("开机自启仅在桌面应用中可用"); return; }
    await setAutostartEnabled(!autostart);
    setAutostart(!autostart); notify(`开机自启已${autostart ? "关闭" : "开启"}`); setMenuOpen(false);
  }
  async function toggleDesktopWidget() {
    const next = !desktopWidget; setDesktopWidget(next); writeScopedValue("desktopWidget", String(next));
    if (next && expandedWindow) {
      setExpandedWindow(false);
      writeScopedValue("calendarView.widget", viewMode);
      if (isDesktopRuntime()) await invoke("set_window_mode", { expanded: false });
    }
    notify(next ? "已切换为桌面小组件" : "已恢复普通窗口模式");
  }
  function updateAppearanceOpacity(value: number) { const next = normalizeWidgetOpacity(Math.min(MAX_WIDGET_OPACITY, Math.max(MIN_WIDGET_OPACITY, value))); setAppearanceOpacity(next); writeScopedValue("appearanceOpacity", String(next)); }
  function updateAppearanceFontLevel(value: number) { const next = Math.min(4, Math.max(1, Math.round(value))) as FontLevel; setAppearanceFontLevel(next); writeScopedValue("appearanceFontSize", String(next)); }
  async function importIcsFile(file: File | undefined) {
    if (!file) return;
    try {
      const imported = parseIcs(await file.text());
      for (const item of imported) await saveItem(item);
      const next = [...imported, ...itemsRef.current.filter((item) => !imported.some((value) => value.id === item.id))];
      itemsRef.current = next;
      setItems(next);
      notify(`已导入 ${imported.length} 场会议`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "导入失败", "error");
    } finally {
      if (importInput.current) importInput.current.value = "";
      setMenuOpen(false);
    }
  }
  function navigateCalendar(direction: -1 | 1) {
    const nextAnchor = viewMode === "week" ? addDays(calendarAnchor, direction * 7) : addMonths(calendarAnchor, direction);
    const nextDays = viewMode === "week" ? weekDays(nextAnchor) : monthDays(nextAnchor);
    setCalendarAnchor(nextAnchor);
    setFocusedDate(nextDays.some((day) => isSameDay(day, selectedDate)) ? selectedDate : viewMode === "week" ? nextDays[0] : new Date(nextAnchor.getFullYear(), nextAnchor.getMonth(), 1));
  }
  const calendarTitle = viewMode === "week" ? `${format(days[0], "M月d日")} — ${format(days[6], "M月d日")}` : format(calendarAnchor, "yyyy年 M月");
  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const key = event.key;
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      setSelectedDate(focusedDate);
      return;
    }
    const delta = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1 : key === "ArrowUp" ? -7 : key === "ArrowDown" ? 7 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = addDays(focusedDate, delta);
    if (next < days[0] || next > days[days.length - 1]) setCalendarAnchor(next);
    pendingFocus.current = dateKey(next);
    setFocusedDate(next);
  }
  function startWindowResize(direction: ResizeDirection, event: React.PointerEvent) {
    event.preventDefault(); event.stopPropagation();
    if (!isDesktopRuntime()) return;
    void startResizeDragging(direction);
  }
  async function startWindowDrag(event: React.MouseEvent) {
    if (locked || draggingRef.current || event.button !== 0 || (event.target as HTMLElement).closest("button,input,select,textarea,a,label,.app-menu,.item-form,[role=separator]")) return;
    event.preventDefault();
    draggingRef.current = true;
    const token = dragTokenRef.current + 1;
    dragTokenRef.current = token;
    setDragging(true);
    if (!isDesktopRuntime()) { endWindowDrag(token); return; }
    try {
      await startDragging();
    } catch {
      notify("窗口拖动启动失败，请重试", "error");
    } finally {
      endWindowDrag(token);
    }
  }

  const renderItem = (item: TodoItem) => <ItemCard
    key={item.id}
    item={item}
    now={calendarNow}
    autoExpand={focusedItemId === item.id}
    expanded={expandedItemIds.includes(item.id)}
    onToggleExpanded={(next) => setExpandedItemIds((current) => next ? current.includes(item.id) ? current : [...current, item.id] : current.filter((id) => id !== item.id))}
    onChange={changeItem}
    onDelete={remove}
    onEdit={(value, trigger) => openEdit(value, trigger)}
  />;

  return <main className={`app-shell ${expandedWindow ? "expanded" : "compact"} ${desktopWidget ? "desktop-widget" : ""} ${locked ? "position-locked" : ""} ${dragging ? "dragging" : ""}`} style={{ "--widget-opacity": appearanceOpacity / 100, "--font-scale": fontScale[appearanceFontLevel] } as React.CSSProperties}>
    {resizeDirections.map((direction) => <div key={direction} className={`window-resize-handle resize-${direction.toLowerCase()}`} aria-hidden="true" onPointerDown={(event) => startWindowResize(direction, event)}/>)}
    <div className="drag-region" onMouseDown={startWindowDrag}/>
    <header className="topbar" onMouseDown={startWindowDrag}>
      <div className="brand-lockup"><img className="app-glyph" src={appIcon} alt=""/><span className="brand-word">BluNote</span></div>
      <div className="top-actions">
        <span className="menu-container" ref={menuContainer}>
          <button ref={settingsButton} className={`icon-button ${menuOpen ? "pressed" : ""}`} aria-label="设置" title="设置" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => { if (!menuOpen) closeForm(false); setMenuOpen((value) => !value); }}>
            <SlidersHorizontal size={17}/>
          </button>
          {menuOpen && <div className="app-menu" role="dialog" aria-label="更多设置">
            <span className="menu-title">外观与窗口</span>
            <label className="menu-setting"><span><strong>桌面小组件</strong><small>驻留桌面，不遮挡其他窗口</small></span><input type="checkbox" checked={desktopWidget} onChange={() => void toggleDesktopWidget()}/><i aria-hidden="true"/></label>
            <label className="menu-setting"><span><strong>锁定位置</strong><small>防止意外拖动挂件</small></span><input type="checkbox" checked={locked} onChange={() => void toggleLock()}/><i aria-hidden="true"/></label>
            <label className="menu-setting"><span><strong>边缘吸附</strong><small>靠近屏幕边缘 8px 自动贴合</small></span><input type="checkbox" checked={edgeSnap} onChange={toggleEdgeSnap}/><i aria-hidden="true"/></label>
            <label className="opacity-setting"><span>外观透明度<output>{appearanceOpacity}%</output></span><input aria-label="外观透明度" type="range" min="55" max="100" step="5" value={appearanceOpacity} onChange={(event) => updateAppearanceOpacity(Number(event.target.value))}/></label>
            <label className="font-size-setting"><span>字体大小</span><input aria-label="字体大小" aria-valuetext={`${appearanceFontLevel} 档，${Math.round(fontScale[appearanceFontLevel] * 100)}%`} type="range" min="1" max="4" step="1" value={appearanceFontLevel} onChange={(event) => updateAppearanceFontLevel(Number(event.target.value))}/><span className="font-scale-ticks" aria-hidden="true"><i>1</i><i>2</i><i>3</i><i>4</i></span></label>
            <div className="menu-divider"/>
            <button onClick={() => importInput.current?.click()}>导入 ICS 日历</button>
            <button onClick={() => void toggleAutostart()}>开机自启：{autostart ? "开" : "关"}</button>
            <small className="menu-footnote">设置与数据仅保存在本机</small>
          </div>}
        </span>
        <button className="icon-button" aria-label={expandedWindow ? "收起挂件" : "展开窗口"} title={expandedWindow ? "收起挂件" : "展开窗口"} onClick={() => void toggleWindow()}>{expandedWindow ? <Minimize2 size={17}/> : <Expand size={17}/>}</button>
        <button
          ref={newButton}
          className="add-button"
          aria-label="新增事项"
          aria-haspopup="dialog"
          aria-expanded={Boolean(formType && !editingItem)}
          onPointerDown={() => { openModality.current = "pointer"; }}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openModality.current = "keyboard"; }}
          onClick={(event) => openCreate(filter === "meeting" ? "meeting" : "task", event.currentTarget)}
        ><Plus size={17}/><span className="new-label-full">新建事项</span><span className="new-label-compact">新建</span></button>
        <input ref={importInput} className="visually-hidden" type="file" accept=".ics,text/calendar" tabIndex={-1} onChange={(event) => void importIcsFile(event.target.files?.[0])}/>
      </div>
    </header>
    <div className="workspace">
      <section className={`calendar-panel ${viewMode}`} aria-label="日历">
        <div className="calendar-header">
          <span className="calendar-title" aria-live="polite">{calendarTitle}</span>
          <div className="calendar-controls">
            <button className="today-button" onClick={() => showToday()}>今天</button>
            <span className="nav-group">
              <button onClick={() => navigateCalendar(-1)} aria-label={viewMode === "week" ? "上一周" : "上个月"}><ChevronLeft size={15}/></button>
              <button onClick={() => navigateCalendar(1)} aria-label={viewMode === "week" ? "下一周" : "下个月"}><ChevronRight size={15}/></button>
            </span>
            <span className="view-switch" role="group" aria-label="日历视图">
              <button className={viewMode === "week" ? "active" : ""} aria-pressed={viewMode === "week"} onClick={() => chooseView("week")}>周</button>
              <button className={viewMode === "month" ? "active" : ""} aria-pressed={viewMode === "month"} onClick={() => chooseView("month")}>月</button>
            </span>
          </div>
        </div>
        {viewMode === "month" && <div className="weekday-row" aria-hidden="true">{weekdayLabels.map((label) => <span key={label}>{label}</span>)}</div>}
        <div ref={grid} className={`calendar-grid ${viewMode}`} role="group" aria-label={`${calendarTitle}日期`} onKeyDown={handleGridKeyDown}>
          {days.map((day) => {
            const badge = calendarBadge(items, day, calendarNow);
            const selected = isSameDay(day, selectedDate);
            const label = `${dayLabel(day)}${isToday(day) ? "，今天" : ""}${selected ? "，已选中" : ""}，${badge.count > 0 ? `${badge.count} 项待处理` : "无待处理事项"}${badge.overdue ? "，有逾期事项" : ""}`;
            return <button
              key={dateKey(day)}
              className={`day-cell ${selected ? "selected" : ""} ${isToday(day) ? "today" : ""} ${viewMode === "month" && !isSameMonth(day, calendarAnchor) ? "outside-month" : ""} ${badge.overdue ? "has-overdue" : ""}`}
              data-date={dateKey(day)}
              tabIndex={isSameDay(day, focusedDate) ? 0 : -1}
              aria-label={label}
              aria-pressed={selected}
              onFocus={() => setFocusedDate(day)}
              onClick={() => { setSelectedDate(day); setFocusedDate(day); }}
            >
              {viewMode === "week" && <span className="day-weekday">{weekdayLabels[(day.getDay() + 6) % 7]}</span>}
              <strong className="day-number">{format(day, "d")}</strong>
              {viewMode === "week"
                ? badge.count > 0 && <span className={`day-count ${badge.overdue ? "overdue" : ""}`} aria-hidden="true">{Math.min(badge.count, 9)}</span>
                : <span className="day-dots" aria-hidden="true">{badge.count > 0 && <i className="dot pending"/>}{badge.overdue && <i className="dot overdue"/>}</span>}
            </button>;
          })}
        </div>
        <div className="calendar-legend"><span><i className="dot pending" aria-hidden="true"/>有待处理事项</span><span><i className="dot overdue" aria-hidden="true"/>有逾期</span><span className="visually-hidden">角标包含未完成待办与尚未开始的会议，逾期以琥珀色和文字提示同时表达。</span></div>
      </section>
      <section className="agenda">
        <div className="agenda-header">
          <header className="agenda-heading">
            <div className="agenda-title"><span className="eyebrow">{format(selectedDate, "EEEE", { locale: zhCN })}</span><h2>{isToday(selectedDate) ? `今天 · ${format(selectedDate, "M月d日")}` : format(selectedDate, "M月d日")}</h2></div>
            <span className="pending-count" aria-live="polite">{counts[filter]} 项待处理</span>
          </header>
          <nav className="filters" aria-label="事项筛选">
            <button className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}>全部<span>{counts.all}</span></button>
            <button className={filter === "task" ? "active" : ""} aria-pressed={filter === "task"} onClick={() => setFilter("task")}>工作清单<span>{counts.task}</span></button>
            <button className={filter === "meeting" ? "active" : ""} aria-pressed={filter === "meeting"} onClick={() => setFilter("meeting")}>会议<span>{counts.meeting}</span></button>
          </nav>
        </div>
        <div ref={list} className="agenda-body" role="region" aria-label={`${format(selectedDate, "M月d日")}待办列表`} tabIndex={0} onScroll={() => { listScroll.current = list.current?.scrollTop ?? 0; }}>
          {loading ? <div className="empty-state"><strong>正在加载本地数据…</strong></div> : visible.length ? (
            expandedWindow
              ? <>
                {groups.allDay.length > 0 && <section className="agenda-section" aria-label="全天"><h3>全天<span>{groups.allDay.length}</span></h3><div className="item-group">{groups.allDay.map(renderItem)}</div></section>}
                {groups.timed.length > 0 && <section className="agenda-section" aria-label="有时间"><h3>有时间<span>{groups.timed.length}</span></h3><div className="item-group">{groups.timed.map(renderItem)}</div></section>}
              </>
              : <div className="item-group compact-group">{compactItems.map(renderItem)}</div>
          ) : <div className="empty-state"><span className="empty-icon"><Check size={23}/></span><strong>这一天很清爽</strong><p>没有安排，留一点时间给自己。</p><button onPointerDown={() => { openModality.current = "pointer"; }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openModality.current = "keyboard"; }} onClick={(event) => openCreate(filter === "meeting" ? "meeting" : "task", event.currentTarget)}><Plus size={15}/>添加事项</button></div>}
        </div>
      </section>
    </div>
    {formType && <ItemForm key={editingItem?.id ?? `new-${formType}`} date={selectedDate} initialType={formType} initialItem={editingItem ?? undefined} anchor={formAnchor} openModality={formModality} onClose={() => closeForm(true)} onSave={async (item) => {
      const creating = !editingItem;
      try {
        await persist(item);
      } catch {
        notify("保存失败，请重试", "error");
        throw new Error("保存失败，请重试");
      }
      if (creating) {
        const savedDate = itemDate(item) ?? selectedDate;
        setHighlightedItemId(item.id);
        notify(`已添加到${format(savedDate, "M月d日")}`, "success");
      }
    }}/>}
    {toast && <div className={`toast ${toast.kind}`} role={toast.kind === "error" ? "alert" : "status"} aria-live={toast.kind === "error" ? "assertive" : "polite"}>
      <span>{toast.message}</span>
      {undo && <button onClick={() => void undoCompletion()}>撤销</button>}
    </div>}
  </main>;
}
