import { useState } from "react";
import { Bell, ChevronDown, ChevronRight, Clock3, MapPin, Trash2, Video } from "lucide-react";
import { format, parseISO } from "date-fns";
import type { TodoItem } from "../types";
import { isOverdue } from "../lib/calendar";

interface Props { item: TodoItem; onChange: (item: TodoItem) => Promise<void>; onDelete: (id: string) => Promise<void> }

export function ItemCard({ item, onChange, onDelete }: Props) {
  const [expanded, setExpanded] = useState(false);
  const done = item.subtasks.filter((subtask) => subtask.completed).length;
  const progress = item.subtasks.length ? Math.round(done / item.subtasks.length * 100) : item.completed ? 100 : 0;
  const overdue = isOverdue(item);
  const toggleItem = () => onChange({ ...item, completed: !item.completed, subtasks: !item.completed ? item.subtasks.map((s) => ({ ...s, completed: true })) : item.subtasks, updatedAt: new Date().toISOString() });
  const toggleSubtask = (id: string) => {
    const subtasks = item.subtasks.map((subtask) => subtask.id === id ? { ...subtask, completed: !subtask.completed } : subtask);
    return onChange({ ...item, subtasks, completed: subtasks.length > 0 && subtasks.every((subtask) => subtask.completed), updatedAt: new Date().toISOString() });
  };
  const when = item.type === "meeting" && item.startAt ? format(parseISO(item.startAt), "HH:mm") : item.dueAt ? format(parseISO(item.dueAt), "M月d日") : "";

  return <article className={`item-card ${item.type} ${item.completed ? "completed" : ""} ${overdue ? "overdue" : ""}`}>
    <div className="item-main">
      <button className="check" onClick={toggleItem} aria-label={item.completed ? "标记为未完成" : "标记为完成"}>{item.completed && "✓"}</button>
      <button className="item-content" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded}>
        <span className="item-title-row"><strong>{item.title}</strong>{item.source !== "local" && <span className="source-badge">已导入</span>}</span>
        <span className="item-meta"><Clock3 size={13}/>{when}{item.type === "meeting" && item.reminderMinutes != null && <><Bell size={13}/>{item.reminderMinutes} 分钟前</>}{overdue && <em>已逾期</em>}</span>
      </button>
      {item.subtasks.length > 0 && <button className="icon-button expand" onClick={() => setExpanded((value) => !value)} aria-label="展开子任务">{expanded ? <ChevronDown size={17}/> : <ChevronRight size={17}/>}</button>}
    </div>
    {item.subtasks.length > 0 && <div className="progress" aria-label={`进度 ${done}/${item.subtasks.length}`}><span style={{ width: `${progress}%` }}/></div>}
    {expanded && <div className="item-details">
      {item.notes && <p>{item.notes}</p>}
      {item.location && <span><MapPin size={14}/>{item.location}</span>}
      {item.meetingUrl && <a href={item.meetingUrl} target="_blank" rel="noreferrer"><Video size={14}/>加入会议</a>}
      {item.subtasks.map((subtask) => <label className="subtask" key={subtask.id}><input type="checkbox" checked={subtask.completed} onChange={() => toggleSubtask(subtask.id)}/><span>{subtask.title}</span>{subtask.dueAt && <time>{format(parseISO(subtask.dueAt), "M/d HH:mm")}</time>}</label>)}
      <button className="danger-link" onClick={() => onDelete(item.id)}><Trash2 size={14}/>删除事项</button>
    </div>}
  </article>;
}
