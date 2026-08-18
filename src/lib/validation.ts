import type { ItemDraft } from "../types";

export interface ValidationErrors { [field: string]: string }

export function validateDraft(draft: ItemDraft): ValidationErrors {
  const errors: ValidationErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = "请输入事项标题";
  if (title.length > 160) errors.title = "标题不能超过 160 个字符";
  if (draft.notes.length > 4000) errors.notes = "备注不能超过 4000 个字符";

  if (draft.type === "meeting") {
    if (!draft.date || !draft.startTime) errors.startAt = "会议必须设置开始时间";
    if (draft.endTime && draft.startTime && draft.endTime <= draft.startTime) errors.endAt = "结束时间必须晚于开始时间";
    if (draft.meetingUrl) {
      try {
        const url = new URL(draft.meetingUrl);
        if (!["https:", "http:"].includes(url.protocol)) errors.meetingUrl = "仅支持 http/https 会议链接";
      } catch { errors.meetingUrl = "会议链接格式不正确"; }
    }
  }

  if (draft.subtasks.some((subtask) => !subtask.title.trim())) errors.subtasks = "子任务标题不能为空";
  const parentDue = draft.date ? new Date(`${draft.date}T23:59:59`).getTime() : null;
  if (parentDue && draft.subtasks.some((subtask) => subtask.dueAt && new Date(subtask.dueAt).getTime() > parentDue)) {
    errors.subtasks = "子任务计划时间不能晚于主任务截止日";
  }
  return errors;
}
