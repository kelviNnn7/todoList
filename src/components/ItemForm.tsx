import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { format } from "date-fns";
import type { ItemDraft, ItemType, TodoItem } from "../types";
import { validateDraft } from "../lib/validation";

const initialDraft = (date: Date, type: ItemType): ItemDraft => ({
  type, title: "", notes: "", date: format(date, "yyyy-MM-dd"), startTime: "09:30", endTime: "10:00",
  location: "", meetingUrl: "", reminderMinutes: 15, subtasks: [],
});

interface Props { date: Date; initialType: ItemType; onClose: () => void; onSave: (item: TodoItem) => Promise<void> }

export function ItemForm({ date, initialType, onClose, onSave }: Props) {
  const [draft, setDraft] = useState(() => initialDraft(date, initialType));
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const errors = useMemo(() => validateDraft(draft), [draft]);
  const update = <K extends keyof ItemDraft>(key: K, value: ItemDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSubmitted(true);
    if (Object.keys(errors).length) return;
    const now = new Date().toISOString();
    const startAt = draft.type === "meeting" ? new Date(`${draft.date}T${draft.startTime}:00`).toISOString() : null;
    const endAt = draft.type === "meeting" && draft.endTime ? new Date(`${draft.date}T${draft.endTime}:00`).toISOString() : null;
    const item: TodoItem = {
      id: crypto.randomUUID(), type: draft.type, title: draft.title.trim(), notes: draft.notes.trim(), startAt, endAt,
      dueAt: draft.type === "task" && draft.date ? new Date(`${draft.date}T23:59:59`).toISOString() : null,
      location: draft.location.trim(), meetingUrl: draft.meetingUrl.trim(), reminderMinutes: draft.type === "meeting" ? draft.reminderMinutes : null,
      reminderSentAt: null, completed: false, source: "local",
      subtasks: draft.subtasks.map((subtask) => ({ id: crypto.randomUUID(), title: subtask.title.trim(), completed: false, dueAt: subtask.dueAt ? new Date(subtask.dueAt).toISOString() : null })),
      createdAt: now, updatedAt: now,
    };
    setSaving(true);
    try { await onSave(item); onClose(); } finally { setSaving(false); }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="new-item-title">
      <header className="modal-header"><div><span className="eyebrow">新增事项</span><h2 id="new-item-title">安排你的下一步</h2></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18}/></button></header>
      <form onSubmit={submit}>
        <div className="segmented" aria-label="事项类型">
          <button type="button" className={draft.type === "task" ? "active" : ""} onClick={() => update("type", "task")}>工作任务</button>
          <button type="button" className={draft.type === "meeting" ? "active" : ""} onClick={() => update("type", "meeting")}>部门会议</button>
        </div>
        <label>标题<input autoFocus maxLength={160} value={draft.title} onChange={(e) => update("title", e.target.value)} placeholder={draft.type === "task" ? "例如：完成需求评审" : "例如：产品周会"}/>{submitted && errors.title && <span className="field-error">{errors.title}</span>}</label>
        <div className="form-row"><label>日期<input type="date" value={draft.date} onChange={(e) => update("date", e.target.value)}/></label>{draft.type === "meeting" && <><label>开始<input type="time" value={draft.startTime} onChange={(e) => update("startTime", e.target.value)}/></label><label>结束<input type="time" value={draft.endTime} onChange={(e) => update("endTime", e.target.value)}/></label></>}</div>
        {submitted && (errors.startAt || errors.endAt) && <span className="field-error">{errors.startAt || errors.endAt}</span>}
        {draft.type === "meeting" ? <>
          <div className="form-row"><label>地点<input maxLength={200} value={draft.location} onChange={(e) => update("location", e.target.value)} placeholder="可选"/></label><label>提前提醒<select value={draft.reminderMinutes} onChange={(e) => update("reminderMinutes", Number(e.target.value))}><option value={5}>5 分钟</option><option value={15}>15 分钟</option><option value={30}>30 分钟</option><option value={60}>60 分钟</option></select></label></div>
          <label>会议链接<input value={draft.meetingUrl} onChange={(e) => update("meetingUrl", e.target.value)} placeholder="https://"/>{submitted && errors.meetingUrl && <span className="field-error">{errors.meetingUrl}</span>}</label>
        </> : <div className="subtasks"><div className="section-label"><span>子任务</span><button type="button" onClick={() => update("subtasks", [...draft.subtasks, { title: "", dueAt: "" }])}><Plus size={14}/>添加</button></div>
          {draft.subtasks.map((subtask, index) => <div className="subtask-edit" key={index}><input aria-label={`子任务 ${index + 1}`} maxLength={160} value={subtask.title} onChange={(e) => update("subtasks", draft.subtasks.map((item, i) => i === index ? { ...item, title: e.target.value } : item))}/><input aria-label={`子任务 ${index + 1} 计划时间`} type="datetime-local" value={subtask.dueAt} onChange={(e) => update("subtasks", draft.subtasks.map((item, i) => i === index ? { ...item, dueAt: e.target.value } : item))}/><button type="button" className="icon-button" onClick={() => update("subtasks", draft.subtasks.filter((_, i) => i !== index))} aria-label="删除子任务"><Trash2 size={16}/></button></div>)}
          {submitted && errors.subtasks && <span className="field-error">{errors.subtasks}</span>}
        </div>}
        <label>备注<textarea maxLength={4000} rows={3} value={draft.notes} onChange={(e) => update("notes", e.target.value)} placeholder="补充上下文（可选）"/></label>
        <footer className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={saving}>{saving ? "保存中…" : "保存事项"}</button></footer>
      </form>
    </section>
  </div>;
}
