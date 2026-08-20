import { describe, expect, it } from "vitest";
import { validateDraft } from "./validation";
import type { ItemDraft } from "../types";

const valid: ItemDraft = { type: "task", title: "准备评审", notes: "", date: "2026-08-20", startTime: "09:30", endTime: "10:00", location: "", meetingUrl: "", reminderMinutes: 15, taskReminderAt: "", subtasks: [] };

describe("validateDraft", () => {
  it("拒绝空标题", () => expect(validateDraft({ ...valid, title: "  " }).title).toBeTruthy());
  it("会议必须有开始时间", () => expect(validateDraft({ ...valid, type: "meeting", startTime: "" }).startAt).toBeTruthy());
  it("拒绝结束时间早于开始时间", () => expect(validateDraft({ ...valid, type: "meeting", endTime: "09:00" }).endAt).toBeTruthy());
  it("拒绝非 HTTP 会议链接", () => expect(validateDraft({ ...valid, type: "meeting", meetingUrl: "javascript:alert(1)" }).meetingUrl).toBeTruthy());
  it("拒绝无效任务提醒时间", () => expect(validateDraft({ ...valid, taskReminderAt: "not-a-date" }).reminderAt).toBeTruthy());
  it("拒绝晚于父任务的子任务", () => expect(validateDraft({ ...valid, subtasks: [{ title: "晚了", dueAt: "2026-08-21T09:00" }] }).subtasks).toBeTruthy());
  it("接受有效任务", () => expect(validateDraft(valid)).toEqual({}));
});
