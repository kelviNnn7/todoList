import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, addMonths, format, isSameDay, isSameMonth, isToday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { BellRing, BriefcaseBusiness, CalendarDays, Check, ChevronLeft, ChevronRight, Ellipsis, Expand, Lock, Minimize2, Plus, Unlock } from "lucide-react";
import { ItemCard } from "./components/ItemCard";
import { ItemForm } from "./components/ItemForm";
import { dateKey, itemDate, itemsForDate, longDate, monthDays, sortItems, weekDays } from "./lib/calendar";
import { parseIcs } from "./lib/ics";
import { isTaskReminderDue, markReminderFired, quickSnoozeAt, snoozeTask, type QuickSnooze } from "./lib/reminders";
import { deleteItem, loadItems, saveItem } from "./lib/storage";
import type { CalendarViewMode, FilterType, ItemType, TodoItem } from "./types";
import appIcon from "./assets/app-icon.png";
import { getCurrentWindow } from "@tauri-apps/api/window";

type ResizeDirection = "East" | "North" | "NorthEast" | "NorthWest" | "South" | "SouthEast" | "SouthWest" | "West";

const isTauri = () => "__TAURI_INTERNALS__" in window;
const savedOpacity = () => {
  const value = Number(localStorage.getItem("pindo.appearanceOpacity"));
  return Number.isFinite(value) && value >= 55 && value <= 100 ? Math.round(value / 5) * 5 : 95;
};
const savedView = (expanded: boolean): CalendarViewMode => {
  const value = localStorage.getItem(`pindo.calendarView.${expanded ? "expanded" : "widget"}`);
  return value === "week" || value === "month" ? value : expanded ? "month" : "week";
};
const resizeDirections: ResizeDirection[] = ["North", "NorthEast", "East", "SouthEast", "South", "SouthWest", "West", "NorthWest"];
const clampSidebarWidth = (value: number) => Math.min(380, Math.max(220, value));
const savedSidebarWidth = () => {
  const stored = localStorage.getItem("pindo.sidebarWidth");
  if (stored === null) return 286;
  const value = Number(stored);
  return Number.isFinite(value) ? clampSidebarWidth(value) : 286;
};

export default function App() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarAnchor, setCalendarAnchor] = useState(new Date());
  const [viewMode, setViewMode] = useState<CalendarViewMode>(() => savedView(false));
  const [filter, setFilter] = useState<FilterType>("all");
  const [formType, setFormType] = useState<ItemType | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedWindow, setExpandedWindow] = useState(false);
  const [locked, setLocked] = useState(() => localStorage.getItem("pindo.positionLocked") === "true");
  const [edgeSnap, setEdgeSnap] = useState(() => localStorage.getItem("pindo.edgeSnap") !== "false");
  const [dragging, setDragging] = useState(false);
  const [autostart, setAutostart] = useState(false);
  const [desktopWidget, setDesktopWidget] = useState(() => localStorage.getItem("pindo.desktopWidget") === "true");
  const [appearanceOpacity, setAppearanceOpacity] = useState(savedOpacity);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(savedSidebarWidth);
  const [panelResizing, setPanelResizing] = useState(false);
  const importInput = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  const panelResizeStart = useRef({ x: 0, width: 286 });
  const days = useMemo(() => viewMode === "week" ? weekDays(calendarAnchor) : monthDays(calendarAnchor), [calendarAnchor, viewMode]);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { loadItems().then(setItems).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/plugin-autostart").then(({ isEnabled }) => isEnabled().then(setAutostart)).catch(() => setAutostart(false));
  }, []);
  useEffect(() => {
    if (!panelResizing) return;
    const resize = (event: PointerEvent) => setSidebarWidth(clampSidebarWidth(panelResizeStart.current.width + event.clientX - panelResizeStart.current.x));
    const finish = () => {
      setPanelResizing(false);
      setSidebarWidth((width) => {
        localStorage.setItem("pindo.sidebarWidth", String(width));
        return width;
      });
    };
    window.addEventListener("pointermove", resize);
    window.addEventListener("pointerup", finish, { once: true });
    window.addEventListener("blur", finish, { once: true });
    return () => {
      window.removeEventListener("pointermove", resize);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("blur", finish);
    };
  }, [panelResizing]);
  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_desktop_widget_mode", { enabled: desktopWidget })).catch(() => undefined);
  }, [desktopWidget]);
  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_edge_snap", { enabled: edgeSnap })).catch(() => undefined);
  }, [edgeSnap]);
  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_position_locked", { locked })).catch(() => undefined);
  }, [locked]);
  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_widget_opacity", { opacity: appearanceOpacity })).catch(() => undefined);
  }, [appearanceOpacity]);
  useEffect(() => {
    const endDrag = () => setDragging(false);
    window.addEventListener("pointerup", endDrag); window.addEventListener("blur", endDrag);
    return () => { window.removeEventListener("pointerup", endDrag); window.removeEventListener("blur", endDrag); };
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => listen<string>("deep-link", ({ payload }) => {
      if (payload.startsWith("pindo://today")) { const today = new Date(); setSelectedDate(today); setCalendarAnchor(today); }
    })).then((dispose) => { unlisten = dispose; }).catch(() => undefined);
    return () => unlisten?.();
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => listen<boolean>("position-lock-changed", ({ payload }) => {
      setLocked(payload); localStorage.setItem("pindo.positionLocked", String(payload));
    })).then((dispose) => { unlisten = dispose; }).catch(() => undefined);
    return () => unlisten?.();
  }, []);

  const persist = useCallback(async (item: TodoItem) => {
    await saveItem(item); setItems((current) => [item, ...current.filter((value) => value.id !== item.id)]);
  }, []);
  const remove = useCallback(async (id: string) => {
    if (!window.confirm("确定删除这个事项吗？此操作无法撤销。")) return;
    await deleteItem(id); setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    import("@tauri-apps/api/event").then(({ listen }) => listen<{ taskId: string; actionId: string }>("task-reminder-action", ({ payload }) => {
        const { actionId, taskId } = payload;
        const task = taskId ? itemsRef.current.find((item) => item.id === taskId) : undefined;
        if (!task) return;
        if (actionId === "custom" || actionId === "default") {
          const target = itemDate(task); if (target) { setSelectedDate(target); setCalendarAnchor(target); }
          setFocusedItemId(task.id);
          setFilter("task"); setNotice(actionId === "custom" ? "请在任务详情中选择自定义提醒时间" : "已打开提醒任务");
          import("@tauri-apps/api/core").then(({ invoke }) => invoke("show_main_window")).catch(() => undefined); return;
        }
        if (actionId === "30m" || actionId === "1h" || actionId === "tomorrow9") {
          void persist(snoozeTask(task, quickSnoozeAt(actionId as QuickSnooze))).catch((error) => setNotice(error instanceof Error ? error.message : "稍后提醒失败"));
        }
      })).then((dispose) => { unlisten = dispose; }).catch(() => undefined);
    return () => unlisten?.();
  }, [persist]);

  useEffect(() => {
    if (!isTauri()) return;
    const scan = async () => {
      const now = new Date();
      for (const item of itemsRef.current) {
        if (item.type === "meeting" && !item.completed && item.startAt && item.reminderMinutes != null && !item.reminderSentAt) {
          const triggerAt = new Date(item.startAt).getTime() - item.reminderMinutes * 60_000;
          if (now.getTime() >= triggerAt && now.getTime() < new Date(item.startAt).getTime() + 60_000) {
            const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
            let granted = await isPermissionGranted(); if (!granted) granted = (await requestPermission()) === "granted";
            if (granted) sendNotification({ title: `即将开始 · ${item.title}`, body: item.location || `${item.reminderMinutes} 分钟后开始` });
            await persist({ ...item, reminderSentAt: now.toISOString(), updatedAt: now.toISOString() });
          }
        }
        if (isTaskReminderDue(item, now)) {
          const { invoke } = await import("@tauri-apps/api/core");
          await invoke("send_task_notification", { taskId: item.id, title: item.title, body: item.notes || "该处理这项任务了" });
          await persist(markReminderFired(item, now));
        }
      }
    };
    void scan(); const timer = window.setInterval(() => void scan(), 30_000); return () => clearInterval(timer);
  }, [persist]);

  const visible = useMemo(() => sortItems(itemsForDate(items, selectedDate).filter((item) => filter === "all" || item.type === filter)), [items, selectedDate, filter]);
  const counts = useMemo(() => ({ task: items.filter((item) => item.type === "task" && !item.completed).length, meeting: items.filter((item) => item.type === "meeting" && !item.completed).length }), [items]);
  function chooseView(next: CalendarViewMode) { setViewMode(next); setCalendarAnchor(selectedDate); localStorage.setItem(`pindo.calendarView.${expandedWindow ? "expanded" : "widget"}`, next); }
  async function toggleWindow() {
    const next = !expandedWindow; setExpandedWindow(next); setViewMode(savedView(next)); setCalendarAnchor(selectedDate);
    if (isTauri()) { const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_window_mode", { expanded: next }); }
  }
  function toggleLock() {
    const next = !locked; setLocked(next); localStorage.setItem("pindo.positionLocked", String(next));
  }
  function toggleEdgeSnap() { const next = !edgeSnap; setEdgeSnap(next); localStorage.setItem("pindo.edgeSnap", String(next)); }
  async function toggleAutostart() {
    if (!isTauri()) { setNotice("开机自启仅在桌面应用中可用"); return; }
    const plugin = await import("@tauri-apps/plugin-autostart"); if (autostart) await plugin.disable(); else await plugin.enable();
    setAutostart(!autostart); setNotice(`开机自启已${autostart ? "关闭" : "开启"}`); setMenuOpen(false); window.setTimeout(() => setNotice(""), 2500);
  }
  async function toggleDesktopWidget() {
    const next = !desktopWidget; setDesktopWidget(next); localStorage.setItem("pindo.desktopWidget", String(next));
    if (next && expandedWindow) { setExpandedWindow(false); setViewMode(savedView(false)); if (isTauri()) { const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_window_mode", { expanded: false }); } }
    setNotice(next ? "已切换为桌面小组件" : "已恢复普通窗口模式"); window.setTimeout(() => setNotice(""), 2200);
  }
  function updateAppearanceOpacity(value: number) { const next = Math.min(100, Math.max(55, value)); setAppearanceOpacity(next); localStorage.setItem("pindo.appearanceOpacity", String(next)); }
  async function importIcsFile(file: File | undefined) {
    if (!file) return;
    try { const imported = parseIcs(await file.text()); for (const item of imported) await saveItem(item); setItems((current) => [...imported, ...current.filter((item) => !imported.some((value) => value.id === item.id))]); setNotice(`已导入 ${imported.length} 场会议`); }
    catch (error) { setNotice(error instanceof Error ? error.message : "导入失败"); }
    finally { if (importInput.current) importInput.current.value = ""; setMenuOpen(false); window.setTimeout(() => setNotice(""), 3500); }
  }
  const navigateCalendar = (direction: -1 | 1) => setCalendarAnchor((current) => viewMode === "week" ? addDays(current, direction * 7) : addMonths(current, direction));
  const calendarTitle = viewMode === "week" ? `${format(days[0], "M月d日")} — ${format(days[6], "M月d日")}` : format(calendarAnchor, "yyyy年 M月");
  function startWindowResize(direction: ResizeDirection, event: React.PointerEvent) {
    event.preventDefault(); event.stopPropagation();
    if (!isTauri()) return;
    void getCurrentWindow().startResizeDragging(direction);
  }
  function startWindowDrag(event: React.MouseEvent) {
    if (locked || event.button !== 0 || (event.target as HTMLElement).closest("button,input,select,textarea,a,[role=separator]")) return;
    event.preventDefault();
    setDragging(true);
    if (!isTauri()) return;
    void getCurrentWindow().startDragging().catch(() => setNotice("窗口拖动启动失败，请重试"));
  }
  function startPanelResize(event: React.PointerEvent) {
    event.preventDefault(); event.stopPropagation();
    panelResizeStart.current = { x: event.clientX, width: sidebarWidth };
    setPanelResizing(true);
  }
  function resizePanelByKeyboard(event: React.KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    setSidebarWidth((width) => {
      const next = clampSidebarWidth(width + (event.key === "ArrowLeft" ? -10 : 10));
      localStorage.setItem("pindo.sidebarWidth", String(next));
      return next;
    });
  }

  return <main className={`app-shell ${expandedWindow ? "expanded" : ""} ${desktopWidget ? "desktop-widget" : ""} ${locked ? "position-locked" : ""} ${dragging ? "dragging" : ""} ${panelResizing ? "panel-resizing" : ""}`} style={{ "--widget-opacity": appearanceOpacity / 100, "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}>
    {resizeDirections.map((direction) => <div key={direction} className={`window-resize-handle resize-${direction.toLowerCase()}`} aria-hidden="true" onPointerDown={(event) => startWindowResize(direction, event)}/>)}
    <div className="drag-region" onMouseDown={startWindowDrag}/>
    <header className="topbar" onMouseDown={startWindowDrag}>
      <div className="date-heading"><span className="brand-line"><img className="app-glyph" src={appIcon} alt=""/>BluNote</span><h1>{longDate(new Date())}</h1></div>
      <div className="top-actions"><button className="icon-button" aria-label={locked ? "解锁位置" : "锁定位置"} title={locked ? "解锁位置" : "锁定位置"} onClick={toggleLock}>{locked ? <Lock size={17}/> : <Unlock size={17}/>}</button><button className="icon-button" aria-label={expandedWindow ? "收起挂件" : "展开窗口"} title={expandedWindow ? "收起挂件" : "展开窗口"} onClick={toggleWindow}>{expandedWindow ? <Minimize2 size={17}/> : <Expand size={17}/>}</button><button className={`icon-button ${menuOpen ? "pressed" : ""}`} aria-label="更多选项" title="更多选项" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><Ellipsis size={19}/></button><span className="toolbar-divider" aria-hidden="true"/><button className="add-button" onClick={() => setFormType(filter === "meeting" ? "meeting" : "task")} aria-label="新增事项"><Plus size={19}/></button>
        {menuOpen && <div className="app-menu" role="dialog" aria-label="更多设置"><span className="menu-title">小组件</span><label className="menu-setting"><span><strong>桌面小组件</strong><small>驻留桌面，不遮挡其他窗口</small></span><input type="checkbox" checked={desktopWidget} onChange={() => void toggleDesktopWidget()}/><i aria-hidden="true"/></label><label className="menu-setting"><span><strong>锁定位置</strong><small>防止意外拖动挂件</small></span><input type="checkbox" checked={locked} onChange={() => void toggleLock()}/><i aria-hidden="true"/></label><label className="menu-setting"><span><strong>边缘吸附</strong><small>靠近屏幕边缘 8px 自动贴合</small></span><input type="checkbox" checked={edgeSnap} onChange={toggleEdgeSnap}/><i aria-hidden="true"/></label><label className="opacity-setting"><span>外观透明度<output>{appearanceOpacity}%</output></span><input aria-label="外观透明度" type="range" min="55" max="100" step="5" value={appearanceOpacity} onChange={(event) => updateAppearanceOpacity(Number(event.target.value))}/></label><div className="menu-divider"/><button onClick={() => importInput.current?.click()}>导入 ICS 日历</button><button onClick={() => void toggleAutostart()}>开机自启：{autostart ? "开" : "关"}</button><small className="menu-footnote">设置与数据仅保存在本机</small></div>}
        <input ref={importInput} className="visually-hidden" type="file" accept=".ics,text/calendar" onChange={(event) => void importIcsFile(event.target.files?.[0])}/>
      </div>
    </header>
    <nav className="filters" aria-label="事项筛选"><button className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}><CalendarDays size={15}/>全部<span>{counts.task + counts.meeting}</span></button><button className={filter === "task" ? "active" : ""} aria-pressed={filter === "task"} onClick={() => setFilter("task")}><BriefcaseBusiness size={15}/>工作清单<span>{counts.task}</span></button><button className={filter === "meeting" ? "active" : ""} aria-pressed={filter === "meeting"} onClick={() => setFilter("meeting")}><BellRing size={15}/>会议<span>{counts.meeting}</span></button></nav>
    {expandedWindow && <div className="panel-resizer" role="separator" aria-label="调整侧栏宽度" aria-orientation="vertical" aria-valuemin={220} aria-valuemax={380} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={startPanelResize} onKeyDown={resizePanelByKeyboard}><span/></div>}
    <section className={`calendar-panel ${viewMode}`}><div className="view-tabs" aria-label="日历视图"><button className={viewMode === "week" ? "active" : ""} aria-pressed={viewMode === "week"} onClick={() => chooseView("week")}>周</button><button className={viewMode === "month" ? "active" : ""} aria-pressed={viewMode === "month"} onClick={() => chooseView("month")}>月</button></div><div className="calendar-toolbar"><button onClick={() => navigateCalendar(-1)} aria-label={viewMode === "week" ? "上一周" : "上个月"}><ChevronLeft size={15}/></button><button className="calendar-title" onClick={() => { const today = new Date(); setCalendarAnchor(today); setSelectedDate(today); }}>{calendarTitle}</button><button onClick={() => navigateCalendar(1)} aria-label={viewMode === "week" ? "下一周" : "下个月"}><ChevronRight size={15}/></button></div><div className="calendar-grid">{days.map((day) => { const dayItems = itemsForDate(items, day); return <button key={dateKey(day)} className={`${isSameDay(day, selectedDate) ? "selected" : ""} ${isToday(day) ? "today" : ""} ${viewMode === "month" && !isSameMonth(day, calendarAnchor) ? "outside-month" : ""}`} onClick={() => setSelectedDate(day)}><span>{format(day, "EEE", { locale: zhCN })}</span><strong>{format(day, "d")}</strong><i>{dayItems.length > 0 && Math.min(dayItems.length, 9)}</i></button>; })}</div></section>
    <section className="agenda"><div className="agenda-heading"><div><span className="eyebrow">{isToday(selectedDate) ? "今天" : format(selectedDate, "EEEE")}</span><h2>{format(selectedDate, "M月d日")}</h2></div><span>{visible.length} 项安排</span></div><div className="item-list">{loading ? <div className="empty-state">正在加载本地数据…</div> : visible.length ? visible.map((item) => <ItemCard key={item.id} item={item} autoExpand={focusedItemId === item.id} onChange={persist} onDelete={remove}/>) : <div className="empty-state"><span className="empty-icon"><Check size={25}/></span><strong>这一天很清爽</strong><p>没有安排，留一点时间给自己。</p><button onClick={() => setFormType(filter === "meeting" ? "meeting" : "task")}><Plus size={15}/>添加事项</button></div>}</div></section>
    {formType && <ItemForm date={selectedDate} initialType={formType} onClose={() => setFormType(null)} onSave={persist}/>} {notice && <div className="toast" role="status">{notice}</div>}
  </main>;
}
