import { useRef, useState } from "react";
import { Bell, BellRing, Check, ChevronDown, ChevronRight, Clock3, MapPin, Pencil, Repeat2, Trash2, Video } from "lucide-react";
import { format, isSameDay, parseISO } from "date-fns";
import type { TodoItem } from "../types";
import { isMeetingPending, isOverdue } from "../lib/calendar";
import { canSnooze, quickSnoozeAt, snoozesToday, snoozeTask, type QuickSnooze } from "../lib/reminders";

interface Props {
  item: TodoItem;
  now?: Date;
  autoExpand?: boolean;
  expanded?: boolean;
  onToggleExpanded?: (expanded: boolean) => void;
  onChange: (item: TodoItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onEdit: (item: TodoItem, trigger?: HTMLElement) => void;
}

const reminderStatusLabel = { none: "未设置", pending: "等待提醒", fired: "已提醒", snoozed: "稍后提醒" } as const;

export function ItemCard({ item, now = new Date(), autoExpand = false, expanded, onToggleExpanded, onChange, onDelete, onEdit }: Props) {
  const [internalExpanded, setInternalExpanded] = useState(autoExpand);
  const [lastAutoExpand, setLastAutoExpand] = useState(autoExpand);
  const [customReminder, setCustomReminder] = useState("");
  const [busy, setBusy] = useState(false);
  const expandTrigger = useRef<HTMLButtonElement>(null);
  const details = useRef<HTMLDivElement>(null);
  if (autoExpand !== lastAutoExpand) {
    setLastAutoExpand(autoExpand);
    if (autoExpand) setInternalExpanded(true);
  }
  const isExpanded = expanded ?? internalExpanded;
  const done = item.subtasks.filter((subtask) => subtask.completed).length;
  const progress = item.subtasks.length ? Math.round(done / item.subtasks.length * 100) : item.completed ? 100 : 0;
  const overdue = isOverdue(item, now);
  const recurring = item.type === "task" && item.taskSchedule?.mode === "weekly";
  const meetingStarted = item.type === "meeting" && !item.completed && Boolean(item.startAt && !isMeetingPending(item, now));

  function setExpanded(next: boolean) {
    if (!next && details.current?.contains(document.activeElement)) {
      requestAnimationFrame(() => expandTrigger.current?.focus());
    }
    if (onToggleExpanded) onToggleExpanded(next);
    else setInternalExpanded(next);
  }

  async function run(next: TodoItem) {
    if (busy) return;
    setBusy(true);
    try {
      await onChange(next);
    } catch {
      // The parent surfaces the persistence error without pretending the row changed.
    } finally {
      setBusy(false);
    }
  }

  const toggleItem = () => {
    const completing = !item.completed;
    void run({
      ...item,
      completed: completing,
      subtasks: recurring ? item.subtasks : completing ? item.subtasks.map((subtask) => ({ ...subtask, completed: true })) : item.subtasks,
      updatedAt: new Date().toISOString(),
    });
  };
  const toggleSubtask = (id: string) => {
    const subtasks = item.subtasks.map((subtask) => subtask.id === id ? { ...subtask, completed: !subtask.completed } : subtask);
    void run({
      ...item,
      subtasks,
      completed: recurring ? item.completed : subtasks.length > 0 && subtasks.every((subtask) => subtask.completed),
      updatedAt: new Date().toISOString(),
    });
  };
  const snooze = (target: Date) => void run(snoozeTask(item, target));
  const quickSnooze = (kind: QuickSnooze) => snooze(quickSnoozeAt(kind));

  const when = item.type === "meeting" && item.startAt
    ? format(parseISO(item.startAt), "HH:mm")
    : item.dueAt
      ? isSameDay(parseISO(item.dueAt), now) ? "今天到期" : format(parseISO(item.dueAt), "M月d日到期")
      : "";
  const reminderLabel = item.reminderAt ? format(parseISO(item.reminderAt), isSameDay(parseISO(item.reminderAt), now) ? "HH:mm" : "M月d日 HH:mm") : "";
  const detailsId = `item-details-${item.id}`;

  return <article className={`item-row ${item.type} ${item.completed ? "completed" : ""} ${overdue ? "overdue" : ""}`} data-item-id={item.id}>
    <div className="item-main">
      <button
        className="check"
        onClick={toggleItem}
        aria-label={item.completed ? "标记为未完成" : "标记为完成"}
        aria-pressed={item.completed}
        aria-busy={busy}
        data-check-id={item.id}
      >{item.completed && <Check size={13} strokeWidth={3}/>}</button>
      <button className="item-content" onClick={() => setExpanded(!isExpanded)} aria-expanded={isExpanded} aria-controls={detailsId}>
        <span className="item-title-row">
          <strong title={item.title}>{item.title}</strong>
          {item.source !== "local" && <span className="source-badge">已导入</span>}
          {item.type === "meeting" && <span className="meeting-tag">会议</span>}
          {item.completed && <span className="done-badge">已完成</span>}
        </span>
        {(when || recurring || overdue || meetingStarted || (item.type === "meeting" && item.reminderMinutes != null) || (item.type === "task" && item.reminderAt)) && <span className="item-meta">
          {when && <><Clock3 size={12}/><span>{when}</span></>}
          {recurring && <><Repeat2 size={12}/><span>每周</span></>}
          {item.type === "meeting" && item.reminderMinutes != null && <><Bell size={12}/><span>提前 {item.reminderMinutes} 分钟提醒</span></>}
          {item.type === "task" && item.reminderAt && <><Bell size={12}/><span>{reminderLabel} 提醒</span></>}
          {item.reminderStatus === "fired" && <em>待处理提醒</em>}
          {meetingStarted && <em className="started">已开始</em>}
          {overdue && <em>已逾期</em>}
        </span>}
        {item.subtasks.length > 0 && <span className="progress-line">
          <span className="progress-track" role="progressbar" aria-label={`进度 ${done}/${item.subtasks.length}`} aria-valuemin={0} aria-valuemax={item.subtasks.length} aria-valuenow={done}><i style={{ width: `${progress}%` }}/></span>
          <span className="progress-label">{done}/{item.subtasks.length} 项子任务</span>
        </span>}
      </button>
      <button ref={expandTrigger} className="icon-button expand" onClick={() => setExpanded(!isExpanded)} aria-label={isExpanded ? "收起详情" : "展开详情"} aria-expanded={isExpanded} aria-controls={detailsId}>
        {isExpanded ? <ChevronDown size={16}/> : <ChevronRight size={16}/>}
      </button>
    </div>
    {isExpanded && <div className="item-details" id={detailsId} ref={details}>
      {item.notes && <p>{item.notes}</p>}
      {item.location && <span><MapPin size={14}/>{item.location}</span>}
      {item.meetingUrl && <a href={item.meetingUrl} target="_blank" rel="noreferrer"><Video size={14}/>加入会议</a>}
      {item.type === "task" && item.reminderAt && <div className="reminder-details">
        <span><BellRing size={14}/>提醒：{format(parseISO(item.reminderAt), "M月d日 HH:mm")}</span>
        <small>状态：{reminderStatusLabel[item.reminderStatus]} · 今日稍后 {snoozesToday(item)}/3</small>
        {item.reminderStatus === "fired" && <div className="snooze-actions">
          <button disabled={!canSnooze(item) || busy} onClick={() => quickSnooze("30m")}>30 分钟</button>
          <button disabled={!canSnooze(item) || busy} onClick={() => quickSnooze("1h")}>1 小时</button>
          <button disabled={!canSnooze(item) || busy} onClick={() => quickSnooze("tomorrow9")}>明天 9:00</button>
          <label><span>自定义</span><input aria-label="自定义稍后提醒时间" type="datetime-local" value={customReminder} onChange={(event) => setCustomReminder(event.target.value)}/></label>
          <button disabled={!canSnooze(item) || busy || !customReminder} onClick={() => snooze(new Date(customReminder))}>确认</button>
          {!canSnooze(item) && <em>今日已达到 3 次上限</em>}
        </div>}
      </div>}
      {item.subtasks.map((subtask) => <label className="subtask" key={subtask.id}>
        <input type="checkbox" checked={subtask.completed} disabled={busy} onChange={() => toggleSubtask(subtask.id)}/>
        <span>{subtask.title}</span>
        {subtask.dueAt && <time>{format(parseISO(subtask.dueAt), "M/d HH:mm")}</time>}
      </label>)}
      <div className="item-actions">
        <button className="edit-link" onClick={(event) => onEdit(item, event.currentTarget)} aria-label={`编辑${item.type === "meeting" ? "会议" : "任务"}：${item.title}`}><Pencil size={14}/>编辑事项</button>
        <button className="danger-link" onClick={() => void onDelete(item.id)} aria-label={`删除${item.type === "meeting" ? "会议" : "任务"}：${item.title}`}><Trash2 size={14}/>删除事项</button>
      </div>
    </div>}
  </article>;
}
