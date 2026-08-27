import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { format, getISODay, isValid, parseISO } from "date-fns";
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

interface Props { date: Date; initialType: ItemType; initialItem?: TodoItem; onClose: () => void; onSave: (item: TodoItem) => Promise<void> }

export function ItemForm({ date, initialType, initialItem, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(() => initialDraft(date, initialType, initialItem));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
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

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSubmitted(true);
    if (Object.keys(errors).length) return;
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
    try { await onSave(item); onClose(); } finally { setSaving(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="item-form-title">
      <header className="modal-header"><div><span className="eyebrow">{initialItem ? "编辑事项" : "新增事项"}</span><h2 id="item-form-title">{initialItem ? `继续编辑${initialItem.type === "meeting" ? "会议" : "任务"}` : "安排你的下一步"}</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18}/></button></header>
      <form onSubmit={submit}>
        <div className="segmented" aria-label="事项类型">
          <button type="button" className={draft.type === "task" ? "active" : ""} onClick={() => update("type", "task")}>工作任务</button>
          <button type="button" className={draft.type === "meeting" ? "active" : ""} onClick={() => update("type", "meeting")}>部门会议</button>
        </div>
        <label>标题<input autoFocus maxLength={160} value={draft.title} onChange={(e) => update("title", e.target.value)} placeholder={draft.type === "task" ? "例如：完成需求评审" : "例如：产品周会"}/>{submitted && errors.title && <span className="field-error">{errors.title}</span>}</label>
        {draft.type === "task" ? <div className="task-schedule">
          <span className="field-label">重复方式</span>
          <div className="schedule-mode" aria-label="任务重复方式">
            <button type="button" className={draft.taskScheduleMode === "single" ? "active" : ""} aria-pressed={draft.taskScheduleMode === "single"} onClick={() => chooseTaskSchedule("single")}>单日</button>
            <button type="button" className={draft.taskScheduleMode === "weekly" ? "active" : ""} aria-pressed={draft.taskScheduleMode === "weekly"} onClick={() => chooseTaskSchedule("weekly")}>每周</button>
          </div>
          <label>{draft.taskScheduleMode === "weekly" ? "开始日期" : "日期"}<input type="date" value={draft.date} onChange={(e) => update("date", e.target.value)}/>{submitted && errors.date && <span className="field-error">{errors.date}</span>}</label>
          {draft.taskScheduleMode === "weekly" && <fieldset className="weekday-picker"><legend>重复日期（可多选）</legend><div>{weekdayOptions.map((day) => <button type="button" key={day.value} className={draft.repeatWeekdays.includes(day.value) ? "active" : ""} aria-pressed={draft.repeatWeekdays.includes(day.value)} aria-label={`星期${day.label}`} onClick={() => toggleWeekday(day.value)}>{day.label}</button>)}</div>{submitted && errors.repeatWeekdays && <span className="field-error">{errors.repeatWeekdays}</span>}<small className="field-hint">从开始日期起，按所选星期重复</small></fieldset>}
        </div> : <div className="form-row"><label>日期<input type="date" value={draft.date} onChange={(e) => update("date", e.target.value)}/></label><label>开始<input type="time" value={draft.startTime} onChange={(e) => update("startTime", e.target.value)}/></label><label>结束<input type="time" value={draft.endTime} onChange={(e) => update("endTime", e.target.value)}/></label></div>}
        {submitted && (errors.startAt || errors.endAt) && <span className="field-error">{errors.startAt || errors.endAt}</span>}
        {draft.type === "meeting" ? <>
          <div className="form-row"><label>地点<input maxLength={200} value={draft.location} onChange={(e) => update("location", e.target.value)} placeholder="可选"/></label><label>提前提醒<select value={draft.reminderMinutes} onChange={(e) => update("reminderMinutes", Number(e.target.value))}><option value={5}>5 分钟</option><option value={15}>15 分钟</option><option value={30}>30 分钟</option><option value={60}>60 分钟</option></select></label></div>
          <label>会议链接<input value={draft.meetingUrl} onChange={(e) => update("meetingUrl", e.target.value)} placeholder="https://"/>{submitted && errors.meetingUrl && <span className="field-error">{errors.meetingUrl}</span>}</label>
        </> : <div className="subtasks">{draft.taskScheduleMode === "single" ? <label>任务提醒<input aria-label="任务提醒时间" type="datetime-local" value={draft.taskReminderAt} onChange={(e) => update("taskReminderAt", e.target.value)}/><small className="field-hint">可选；触发后可稍后 30 分钟、1 小时或明天 9:00 再提醒</small>{submitted && errors.reminderAt && <span className="field-error">{errors.reminderAt}</span>}</label> : <small className="field-hint weekly-reminder-hint">每周任务暂不设置重复提醒，可在单日任务中使用提醒。</small>}<div className="section-label"><span>子任务</span><button type="button" onClick={() => update("subtasks", [...draft.subtasks, { title: "", dueAt: "" }])}><Plus size={14}/>添加</button></div>
          {draft.subtasks.map((subtask, index) => <div className="subtask-edit" key={index}><input aria-label={`子任务 ${index + 1}`} maxLength={160} value={subtask.title} onChange={(e) => update("subtasks", draft.subtasks.map((item, i) => i === index ? { ...item, title: e.target.value } : item))}/><input aria-label={`子任务 ${index + 1} 计划时间`} type="datetime-local" value={subtask.dueAt} onChange={(e) => update("subtasks", draft.subtasks.map((item, i) => i === index ? { ...item, dueAt: e.target.value } : item))}/><button type="button" className="icon-button" onClick={() => update("subtasks", draft.subtasks.filter((_, i) => i !== index))} aria-label="删除子任务"><Trash2 size={16}/></button></div>)}
          {submitted && errors.subtasks && <span className="field-error">{errors.subtasks}</span>}
        </div>}
        <label>备注<textarea maxLength={4000} rows={3} value={draft.notes} onChange={(e) => update("notes", e.target.value)} placeholder="补充上下文（可选）"/></label>
        <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={saving}>{saving ? "保存中…" : initialItem ? "保存修改" : "保存事项"}</button></footer>
      </form>
    </section>
  </div>;
}
