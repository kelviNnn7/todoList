import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isSameDay, isToday } from "date-fns";
import { zhCN } from "date-fns/locale";
import { BellRing, BriefcaseBusiness, CalendarDays, Check, ChevronLeft, ChevronRight, Ellipsis, Expand, Lock, Minimize2, Plus, Unlock } from "lucide-react";
import { ItemCard } from "./components/ItemCard";
import { ItemForm } from "./components/ItemForm";
import { dateKey, itemsForDate, longDate, sortItems, twoWeekDays } from "./lib/calendar";
import { parseIcs } from "./lib/ics";
import { deleteItem, loadItems, saveItem } from "./lib/storage";
import type { FilterType, ItemType, TodoItem } from "./types";

const isTauri = () => "__TAURI_INTERNALS__" in window;
const savedOpacity = () => {
  const value = Number(localStorage.getItem("pindo.appearanceOpacity"));
  return Number.isFinite(value) && value >= 55 && value <= 100 ? Math.round(value / 5) * 5 : 95;
};

export default function App() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarAnchor, setCalendarAnchor] = useState(new Date());
  const [filter, setFilter] = useState<FilterType>("all");
  const [formType, setFormType] = useState<ItemType | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedWindow, setExpandedWindow] = useState(false);
  const [locked, setLocked] = useState(() => localStorage.getItem("pindo.positionLocked") === "true");
  const [autostart, setAutostart] = useState(false);
  const [desktopWidget, setDesktopWidget] = useState(() => localStorage.getItem("pindo.desktopWidget") === "true");
  const [appearanceOpacity, setAppearanceOpacity] = useState(savedOpacity);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const importInput = useRef<HTMLInputElement>(null);
  const days = useMemo(() => twoWeekDays(calendarAnchor), [calendarAnchor]);

  useEffect(() => { loadItems().then(setItems).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/plugin-autostart").then(({ isEnabled }) => isEnabled().then(setAutostart)).catch(() => setAutostart(false));
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    import("@tauri-apps/api/core").then(({ invoke }) => invoke("set_desktop_widget_mode", { enabled: desktopWidget })).catch(() => undefined);
  }, [desktopWidget]);

  const persist = useCallback(async (item: TodoItem) => {
    await saveItem(item);
    setItems((current) => [item, ...current.filter((value) => value.id !== item.id)]);
  }, []);
  const remove = useCallback(async (id: string) => {
    if (!window.confirm("确定删除这个事项吗？此操作无法撤销。")) return;
    await deleteItem(id); setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    const scan = async () => {
      const now = Date.now();
      for (const item of items) {
        if (item.type !== "meeting" || item.completed || !item.startAt || item.reminderMinutes == null || item.reminderSentAt) continue;
        const triggerAt = new Date(item.startAt).getTime() - item.reminderMinutes * 60_000;
        if (now >= triggerAt && now < new Date(item.startAt).getTime() + 60_000) {
          const { isPermissionGranted, requestPermission, sendNotification } = await import("@tauri-apps/plugin-notification");
          let granted = await isPermissionGranted();
          if (!granted) granted = (await requestPermission()) === "granted";
          if (granted) sendNotification({ title: `即将开始 · ${item.title}`, body: item.location || `${item.reminderMinutes} 分钟后开始` });
          await persist({ ...item, reminderSentAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        }
      }
    };
    void scan(); const timer = window.setInterval(() => void scan(), 30_000); return () => clearInterval(timer);
  }, [items, persist]);

  const visible = useMemo(() => sortItems(itemsForDate(items, selectedDate).filter((item) => filter === "all" || item.type === filter)), [items, selectedDate, filter]);
  const counts = useMemo(() => ({ task: items.filter((item) => item.type === "task" && !item.completed).length, meeting: items.filter((item) => item.type === "meeting" && !item.completed).length }), [items]);

  async function toggleWindow() {
    const next = !expandedWindow; setExpandedWindow(next);
    if (isTauri()) { const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_window_mode", { expanded: next }); }
  }
  async function toggleLock() {
    const next = !locked; setLocked(next);
    localStorage.setItem("pindo.positionLocked", String(next));
    if (isTauri()) { const { invoke } = await import("@tauri-apps/api/core"); await invoke("set_position_locked", { locked: next }); }
  }

  async function toggleAutostart() {
    if (!isTauri()) { setNotice("开机自启仅在桌面应用中可用"); return; }
    const plugin = await import("@tauri-apps/plugin-autostart");
    if (autostart) await plugin.disable(); else await plugin.enable();
    setAutostart(!autostart); setNotice(`开机自启已${autostart ? "关闭" : "开启"}`); setMenuOpen(false);
    window.setTimeout(() => setNotice(""), 2500);
  }

  async function toggleDesktopWidget() {
    const next = !desktopWidget;
    setDesktopWidget(next);
    localStorage.setItem("pindo.desktopWidget", String(next));
    if (next && expandedWindow) {
      setExpandedWindow(false);
      if (isTauri()) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("set_window_mode", { expanded: false });
      }
    }
    setNotice(next ? "已切换为桌面小组件" : "已恢复普通窗口模式");
    window.setTimeout(() => setNotice(""), 2200);
  }

  function updateAppearanceOpacity(value: number) {
    const next = Math.min(100, Math.max(55, value));
    setAppearanceOpacity(next);
    localStorage.setItem("pindo.appearanceOpacity", String(next));
  }

  async function importIcsFile(file: File | undefined) {
    if (!file) return;
    try {
      const imported = parseIcs(await file.text());
      for (const item of imported) await saveItem(item);
      setItems((current) => [...imported, ...current.filter((item) => !imported.some((value) => value.id === item.id))]);
      setNotice(`已导入 ${imported.length} 场会议`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "导入失败"); }
    finally { if (importInput.current) importInput.current.value = ""; setMenuOpen(false); window.setTimeout(() => setNotice(""), 3500); }
  }

  return <main className={`app-shell ${expandedWindow ? "expanded" : ""} ${desktopWidget ? "desktop-widget" : ""}`} style={{ "--widget-opacity": appearanceOpacity / 100 } as React.CSSProperties}>
    <div className="drag-region" data-tauri-drag-region={locked ? undefined : ""} />
    <header className="topbar" data-tauri-drag-region={locked ? undefined : ""}>
      <div className="date-heading" data-tauri-drag-region={locked ? undefined : ""}>
        <span className="brand-line" data-tauri-drag-region={locked ? undefined : ""}><i className="app-glyph"><Check size={11} strokeWidth={3}/></i>钉事 · PinDo</span>
        <h1 data-tauri-drag-region={locked ? undefined : ""}>{longDate(new Date())}</h1>
      </div>
      <div className="top-actions">
        <button className="icon-button" aria-label={locked ? "解锁位置" : "锁定位置"} title={locked ? "解锁位置" : "锁定位置"} onClick={toggleLock}>{locked ? <Lock size={17}/> : <Unlock size={17}/>}</button>
        <button className="icon-button" aria-label={expandedWindow ? "收起挂件" : "展开窗口"} title={expandedWindow ? "收起挂件" : "展开窗口"} onClick={toggleWindow}>{expandedWindow ? <Minimize2 size={17}/> : <Expand size={17}/>}</button>
        <button className={`icon-button ${menuOpen ? "pressed" : ""}`} aria-label="更多选项" title="更多选项" aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}><Ellipsis size={19}/></button>
        <span className="toolbar-divider" aria-hidden="true"/>
        <button className="add-button" onClick={() => setFormType(filter === "meeting" ? "meeting" : "task")} aria-label="新增事项"><Plus size={19}/></button>
        {menuOpen && <div className="app-menu" role="dialog" aria-label="更多设置">
          <span className="menu-title">小组件</span>
          <label className="menu-setting"><span><strong>桌面小组件</strong><small>驻留桌面，不遮挡其他窗口</small></span><input type="checkbox" checked={desktopWidget} onChange={() => void toggleDesktopWidget()}/><i aria-hidden="true"/></label>
          <label className="opacity-setting"><span>外观透明度<output>{appearanceOpacity}%</output></span><input aria-label="外观透明度" type="range" min="55" max="100" step="5" value={appearanceOpacity} onChange={(event) => updateAppearanceOpacity(Number(event.target.value))}/></label>
          <div className="menu-divider"/>
          <button onClick={() => importInput.current?.click()}>导入 ICS 日历</button><button onClick={() => void toggleAutostart()}>开机自启：{autostart ? "开" : "关"}</button><small className="menu-footnote">设置与数据仅保存在本机</small>
        </div>}
        <input ref={importInput} className="visually-hidden" type="file" accept=".ics,text/calendar" onChange={(event) => void importIcsFile(event.target.files?.[0])}/>
      </div>
    </header>

    <nav className="filters" aria-label="事项筛选">
      <button className={filter === "all" ? "active" : ""} aria-pressed={filter === "all"} onClick={() => setFilter("all")}><CalendarDays size={15}/>全部<span>{counts.task + counts.meeting}</span></button>
      <button className={filter === "task" ? "active" : ""} aria-pressed={filter === "task"} onClick={() => setFilter("task")}><BriefcaseBusiness size={15}/>工作清单<span>{counts.task}</span></button>
      <button className={filter === "meeting" ? "active" : ""} aria-pressed={filter === "meeting"} onClick={() => setFilter("meeting")}><BellRing size={15}/>会议<span>{counts.meeting}</span></button>
    </nav>

    <section className="calendar-panel">
      <div className="calendar-toolbar"><button onClick={() => setCalendarAnchor(addDays(calendarAnchor, -14))} aria-label="前两周"><ChevronLeft size={15}/></button><span>{format(days[0], "M月d日")} — {format(days[13], "M月d日")}</span><button onClick={() => setCalendarAnchor(addDays(calendarAnchor, 14))} aria-label="后两周"><ChevronRight size={15}/></button></div>
      <div className="calendar-grid">
        {days.map((day) => { const dayItems = itemsForDate(items, day); return <button key={dateKey(day)} className={`${isSameDay(day, selectedDate) ? "selected" : ""} ${isToday(day) ? "today" : ""}`} onClick={() => setSelectedDate(day)}><span>{format(day, "EEE", { locale: zhCN })}</span><strong>{format(day, "d")}</strong><i>{dayItems.length > 0 && Math.min(dayItems.length, 9)}</i></button>; })}
      </div>
    </section>

    <section className="agenda">
      <div className="agenda-heading"><div><span className="eyebrow">{isToday(selectedDate) ? "今天" : format(selectedDate, "EEEE")}</span><h2>{format(selectedDate, "M月d日")}</h2></div><span>{visible.length} 项安排</span></div>
      <div className="item-list">
        {loading ? <div className="empty-state">正在加载本地数据…</div> : visible.length ? visible.map((item) => <ItemCard key={item.id} item={item} onChange={persist} onDelete={remove}/>) : <div className="empty-state"><span className="empty-icon"><Check size={25}/></span><strong>这一天很清爽</strong><p>没有安排，留一点时间给自己。</p><button onClick={() => setFormType(filter === "meeting" ? "meeting" : "task")}><Plus size={15}/>添加事项</button></div>}
      </div>
    </section>
    {formType && <ItemForm date={selectedDate} initialType={formType} onClose={() => setFormType(null)} onSave={persist}/>} 
    {notice && <div className="toast" role="status">{notice}</div>}
  </main>;
}
