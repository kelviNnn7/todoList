import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, Plus, Trash2, X } from "lucide-react";
import { format, getISODay, isValid, parseISO } from "date-fns";
import { zhCN } from "date-fns/locale";
import type { ItemDraft, ItemType, TodoItem } from "../types";
import { validateDraft } from "../lib/validation";

const localDateTime = (value: string | null) => value ? format(parseISO(value), "yyyy-MM-dd'T'HH:mm") : "";
const weekdayOptions = [
  { value: 1, label: "一" }, { value: 2, label: "二" }, { value: 3, label: "三" }, { value: 4, label: "四" },
  { value: 5, label: "五" }, { value: 6, label: "六" }, { value: 7, label: "日" },
];
const initialDraft = (date: Date, type: ItemType, item?: TodoItem): ItemDraft => item ? ({
  type: item.type,
  title: item.title,
  notes: item.notes,
  date: format(parseISO(item.type === "meeting" && item.startAt ? item.startAt : item.dueAt || date.toISOString()), "yyyy-MM-dd"),
  startTime: item.startAt ? format(parseISO(item.startAt), "HH:mm") : "09:30",
  endTime: item.endAt ? format(parseISO(item.endAt), "HH:mm") : "10:00",
  location: item.location,
  meetingUrl: item.meetingUrl,
  reminderMinutes: item.reminderMinutes ?? 15,
  taskReminderAt: localDateTime(item.reminderAt),
  taskScheduleMode: item.taskSchedule?.mode === "weekly" ? "weekly" : "single",
  repeatWeekdays: item.taskSchedule?.mode === "weekly" ? item.taskSchedule.weekdays : [],
  subtasks: item.subtasks.map((subtask) => ({ id: subtask.id, title: subtask.title, completed: subtask.completed, dueAt: localDateTime(subtask.dueAt) })),
}) : ({
  type, title: "", notes: "", date: format(date, "yyyy-MM-dd"), startTime: "09:30", endTime: "10:00",
  location: "", meetingUrl: "", reminderMinutes: 15, taskReminderAt: "", taskScheduleMode: "single", repeatWeekdays: [], subtasks: [],
});

interface Props {
  date: Date;
  initialType: ItemType;
  initialItem?: TodoItem;
  anchor?: HTMLElement | null;
  openModality?: "pointer" | "keyboard";
  onClose: () => void;
  onSave: (item: TodoItem) => Promise<void>;
}

interface Placement { top: number; left: number; width: number; maxHeight: number; origin: string }

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));
const wantsReducedMotion = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function ItemForm({ date, initialType, initialItem, anchor, openModality = "pointer", onClose, onSave }: Props) {
  const [draft, setDraft] = useState(() => initialDraft(date, initialType, initialItem));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [advanced, setAdvanced] = useState(Boolean(initialItem) || initialType === "meeting");
  const [phase, setPhase] = useState<"entering" | "open" | "closing">("entering");
  const [placement, setPlacement] = useState<Placement>({ top: 52, left: 8, width: 400, maxHeight: 520, origin: "top right" });
  const [saveError, setSaveError] = useState("");
  const section = useRef<HTMLElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const closing = useRef(false);
  const onCloseRef = useRef(onClose);
  const instant = openModality === "keyboard" || wantsReducedMotion();
  const errors = useMemo(() => validateDraft(draft), [draft]);
  const update = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  function chooseTaskSchedule(mode: ItemDraft["taskScheduleMode"]) {
    setDraft((current) => ({
      ...current,
      taskScheduleMode: mode,
      repeatWeekdays: mode === "weekly" && current.repeatWeekdays.length === 0 ? [getISODay(isValid(parseISO(current.date)) ? parseISO(current.date) : new Date())] : current.repeatWeekdays,
    }));
  }
  function toggleWeekday(day: number) {
    update("repeatWeekdays", draft.repeatWeekdays.includes(day) ? draft.repeatWeekdays.filter((value) => value !== day) : [...draft.repeatWeekdays, day].sort());
  }
  function chooseType(type: ItemType) {
    update("type", type);
    if (type === "meeting") setAdvanced(true);
  }

  function requestClose() {
    if (closing.current) return;
    if (instant) { onCloseRef.current(); return; }
    closing.current = true;
    setPhase("closing");
    closeTimer.current = window.setTimeout(() => onCloseRef.current(), 120);
  }

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setPhase("open"));
    titleInput.current?.focus();
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => { if (closeTimer.current !== undefined) window.clearTimeout(closeTimer.current); }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.isComposing) {
        event.preventDefault();
        requestClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useLayoutEffect(() => {
    const measure = () => {
      const element = section.current;
      if (!element) return;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const width = Math.min(400, viewportWidth - 16);
      const anchorRect = anchor?.getBoundingClientRect();
      let left = anchorRect ? anchorRect.right - width : (viewportWidth - width) / 2;
      left = clamp(left, 8, viewportWidth - width - 8);
      const measuredHeight = Math.min(element.offsetHeight || 460, viewportHeight - 16);
      let top = anchorRect ? anchorRect.bottom + 8 : (viewportHeight - measuredHeight) / 2;
      let origin = "top right";
      if (top + measuredHeight > viewportHeight - 8) {
        const above = anchorRect ? anchorRect.top - measuredHeight - 8 : 8;
        if (above >= 8) { top = above; origin = "bottom right"; }
        else top = 8;
      }
      top = clamp(top, 8, Math.max(8, viewportHeight - measuredHeight - 8));
      setPlacement({ top, left, width, maxHeight: Math.max(220, viewportHeight - top - 8), origin });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [anchor, advanced, draft.type, draft.subtasks.length]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSubmitted(true);
    setSaveError("");
    if (Object.keys(errors).length) {
      if (errors.startAt || errors.endAt || errors.meetingUrl || errors.repeatWeekdays || errors.subtasks || errors.reminderAt) setAdvanced(true);
      return;
    }
    const now = new Date().toISOString();
    const startAt = draft.type === "meeting" ? new Date(`${draft.date}T${draft.startTime}:00`).toISOString() : null;
    const endAt = draft.type === "meeting" && draft.endTime ? new Date(`${draft.date}T${draft.endTime}:00`).toISOString() : null;
    const reminderAt = draft.type === "task" && draft.taskScheduleMode === "single" && draft.taskReminderAt ? new Date(draft.taskReminderAt).toISOString() : null;
    const reminderChanged = reminderAt !== (initialItem?.reminderAt ?? null);
    const meetingReminderChanged = startAt !== (initialItem?.startAt ?? null) || draft.reminderMinutes !== initialItem?.reminderMinutes;
    const taskSchedule = draft.type === "task" && draft.taskScheduleMode === "weekly"
      ? { mode: "weekly" as const, startsOn: draft.date, weekdays: draft.repeatWeekdays }
      : null;
    const scheduleUnchanged = JSON.stringify(taskSchedule) === JSON.stringify(initialItem?.taskSchedule ?? null);
    const item: TodoItem = {
      id: initialItem?.id ?? crypto.randomUUID(), type: draft.type, title: draft.title.trim(), notes: draft.notes.trim(), startAt, endAt,
      dueAt: draft.type === "task" && draft.date ? new Date(`${draft.date}T23:59:59`).toISOString() : null,
      location: draft.location.trim(), meetingUrl: draft.meetingUrl.trim(), reminderMinutes: draft.type === "meeting" ? draft.reminderMinutes : null,
      reminderSentAt: draft.type === "meeting" && !meetingReminderChanged ? initialItem?.reminderSentAt ?? null : null,
      reminderAt,
      reminderStatus: draft.type === "task" && reminderAt ? (reminderChanged ? "pending" : initialItem?.reminderStatus ?? "pending") : "none",
      snoozeCount: draft.type === "task" && !reminderChanged ? initialItem?.snoozeCount ?? 0 : 0,
      lastReminderAt: draft.type === "task" && !reminderChanged ? initialItem?.lastReminderAt ?? null : null,
      completed: initialItem?.completed ?? false, source: initialItem?.source ?? "local",
      subtasks: draft.subtasks.map((subtask) => ({ id: subtask.id ?? crypto.randomUUID(), title: subtask.title.trim(), completed: subtask.completed ?? false, dueAt: subtask.dueAt ? new Date(subtask.dueAt).toISOString() : null })),
      taskSchedule,
      completedDates: scheduleUnchanged ? initialItem?.completedDates ?? [] : [],
      createdAt: initialItem?.createdAt ?? now, updatedAt: now,
    };
    setSaving(true);
    try {
      await onSave(item);
      requestClose();
    } catch (error) {
      setSaveError(error instanceof Error && error.message ? error.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  function trapFocus(event: React.KeyboardEvent) {
    if (event.key !== "Tab" || !section.current) return;
    const focusable = [...section.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]")]
      .filter((element) => element.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  const dateText = isValid(parseISO(draft.date)) ? `${format(parseISO(draft.date), "M月d日")} · ${format(parseISO(draft.date), "EEEE", { locale: zhCN })}` : "选择日期";
  const advancedSummary = draft.type === "task" ? "备注、提醒、重复与子任务" : "时间、地点、链接与提醒";
  const dialogTitle = initialItem ? `编辑${draft.type === "meeting" ? "会议" : "任务"}` : "新建事项";
  const saveLabel = saving ? "保存中…" : initialItem ? "保存修改" : draft.type === "meeting" ? "保存会议" : "保存任务";

  return <div className="popover-layer">
    <section
      ref={section}
      className="item-form"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-form-title"
      data-phase={phase}
      data-instant={instant ? "true" : "false"}
      style={{ top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight, transformOrigin: placement.origin } as React.CSSProperties}
      onKeyDown={trapFocus}
    >
      <header className="form-header">
        <div><span className="eyebrow">{initialItem ? "编辑事项" : "快速新增"}</span><h2 id="item-form-title">{dialogTitle}</h2></div>
        <button type="button" className="icon-button" onClick={requestClose} aria-label="关闭"><X size={17}/></button>
      </header>
      <form onSubmit={submit} noValidate>
        <div className="segmented" role="group" aria-label="事项类型">
          <button type="button" className={draft.type === "task" ? "active" : ""} aria-pressed={draft.type === "task"} onClick={() => chooseType("task")}>工作任务</button>
          <button type="button" className={draft.type === "meeting" ? "active" : ""} aria-pressed={draft.type === "meeting"} onClick={() => chooseType("meeting")}>会议</button>
        </div>
        <label className="form-field title-field">标题<input ref={titleInput} maxLength={160} value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder={draft.type === "task" ? "例如：汇总评审反馈" : "例如：产品周会"}/>{submitted && errors.title && <span className="field-error">{errors.title}</span>}</label>
        <label className="date-field">
          <CalendarDays size={15}/>
          <span className="date-caption">日期</span>
          <span className="date-value">{dateText}</span>
          <input aria-label="日期" type="date" value={draft.date} onChange={(event) => update("date", event.target.value)}/>
          {submitted && errors.date && <span className="field-error">{errors.date}</span>}
        </label>
        <button type="button" className="more-toggle" aria-expanded={advanced} aria-controls="item-more-settings" onClick={() => setAdvanced((value) => !value)}>
          <span>{advanced ? "收起更多设置" : "更多设置"}</span>
          <small>{advanced ? "已展开，可直接编辑" : advancedSummary}</small>
          <ChevronDown size={15} className={advanced ? "open" : ""}/>
        </button>
        {advanced && <div className="extra-fields" id="item-more-settings">
          {draft.type === "task" ? <div className="task-schedule">
            <span className="field-label">重复方式</span>
            <div className="schedule-mode" role="group" aria-label="任务重复方式">
              <button type="button" className={draft.taskScheduleMode === "single" ? "active" : ""} aria-pressed={draft.taskScheduleMode === "single"} onClick={() => chooseTaskSchedule("single")}>单日</button>
              <button type="button" className={draft.taskScheduleMode === "weekly" ? "active" : ""} aria-pressed={draft.taskScheduleMode === "weekly"} onClick={() => chooseTaskSchedule("weekly")}>每周</button>
            </div>
            {draft.taskScheduleMode === "weekly" && <fieldset className="weekday-picker"><legend>重复日期（可多选）</legend><div>{weekdayOptions.map((day) => <button type="button" key={day.value} className={draft.repeatWeekdays.includes(day.value) ? "active" : ""} aria-pressed={draft.repeatWeekdays.includes(day.value)} aria-label={`星期${day.label}`} onClick={() => toggleWeekday(day.value)}>{day.label}</button>)}</div>{submitted && errors.repeatWeekdays && <span className="field-error">{errors.repeatWeekdays}</span>}<small className="field-hint">从开始日期起，按所选星期重复；每个日期可独立完成</small></fieldset>}
            {draft.taskScheduleMode === "single" ? <label className="form-field">任务提醒<input aria-label="任务提醒时间" type="datetime-local" value={draft.taskReminderAt} onChange={(event) => update("taskReminderAt", event.target.value)}/><small className="field-hint">可选；触发后可稍后 30 分钟、1 小时或明天 9:00 再提醒</small>{submitted && errors.reminderAt && <span className="field-error">{errors.reminderAt}</span>}</label> : <small className="field-hint weekly-reminder-hint">每周任务暂不设置重复提醒，可在单日任务中使用提醒。</small>}
          </div> : <>
            <div className="form-row">
              <label className="form-field">开始<input aria-label="开始时间" type="time" value={draft.startTime} onChange={(event) => update("startTime", event.target.value)}/></label>
              <label className="form-field">结束<input aria-label="结束时间" type="time" value={draft.endTime} onChange={(event) => update("endTime", event.target.value)}/></label>
              <label className="form-field">提前提醒<select aria-label="提前提醒" value={draft.reminderMinutes} onChange={(event) => update("reminderMinutes", Number(event.target.value))}><option value={5}>5 分钟</option><option value={15}>15 分钟</option><option value={30}>30 分钟</option><option value={60}>60 分钟</option></select></label>
            </div>
            {submitted && (errors.startAt || errors.endAt) && <span className="field-error">{errors.startAt || errors.endAt}</span>}
            <div className="form-row two">
              <label className="form-field">地点<input aria-label="地点" maxLength={200} value={draft.location} onChange={(event) => update("location", event.target.value)} placeholder="可选"/></label>
              <label className="form-field">会议链接<input aria-label="会议链接" value={draft.meetingUrl} onChange={(event) => update("meetingUrl", event.target.value)} placeholder="https://"/>{submitted && errors.meetingUrl && <span className="field-error">{errors.meetingUrl}</span>}</label>
            </div>
          </>}
          {draft.type === "task" && <div className="subtasks">
            <div className="section-label"><span>子任务</span><button type="button" onClick={() => update("subtasks", [...draft.subtasks, { title: "", dueAt: "" }])}><Plus size={14}/>添加</button></div>
            {draft.subtasks.map((subtask, index) => <div className="subtask-edit" key={index}>
              <input aria-label={`子任务 ${index + 1}`} maxLength={160} value={subtask.title} onChange={(event) => update("subtasks", draft.subtasks.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} placeholder="子任务标题"/>
              <input aria-label={`子任务 ${index + 1} 计划时间`} type="datetime-local" value={subtask.dueAt} onChange={(event) => update("subtasks", draft.subtasks.map((item, i) => i === index ? { ...item, dueAt: event.target.value } : item))}/>
              <button type="button" className="icon-button" onClick={() => update("subtasks", draft.subtasks.filter((_, i) => i !== index))} aria-label="删除子任务"><Trash2 size={16}/></button>
            </div>)}
            {submitted && errors.subtasks && <span className="field-error">{errors.subtasks}</span>}
          </div>}
          <label className="form-field">备注<textarea maxLength={4000} rows={3} value={draft.notes} onChange={(event) => update("notes", event.target.value)} placeholder="补充上下文（可选）"/>{submitted && errors.notes && <span className="field-error">{errors.notes}</span>}</label>
        </div>}
        {saveError && <p className="form-error" role="alert">{saveError}。输入已保留，可重试。</p>}
        <footer className="form-actions">
          <span className="form-hint">仅标题必填</span>
          <button type="button" className="button secondary" onClick={requestClose}>取消</button>
          <button className="button primary" disabled={saving}>{saveLabel}</button>
        </footer>
      </form>
    </section>
  </div>;
}
