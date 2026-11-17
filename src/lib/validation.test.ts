import { describe, expect, it } from "vitest";
import { validateDraft } from "./validation";
import type { ItemDraft } from "../types";

const valid: ItemDraft = { type: "task", title: "准备评审", notes: "", date: "2026-08-20", startTime: "09:30", endTime: "10:00", location: "", meetingUrl: "", reminderMinutes: 15, taskReminderAt: "", taskScheduleMode: "single", repeatWeekdays: [], subtasks: [] };

describe("validateDraft", () => {
  it("拒绝空标题", () => expect(validateDraft({ ...valid, title: "  " }).title).toBeTruthy());
  it("会议必须有开始时间", () => expect(validateDraft({ ...valid, type: "meeting", startTime: "" }).startAt).toBeTruthy());
  it("拒绝结束时间早于开始时间", () => expect(validateDraft({ ...valid, type: "meeting", endTime: "09:00" }).endAt).toBeTruthy());
  it("拒绝非 HTTP 会议链接", () => expect(validateDraft({ ...valid, type: "meeting", meetingUrl: "javascript:alert(1)" }).meetingUrl).toBeTruthy());
  it("拒绝无效任务提醒时间", () => expect(validateDraft({ ...valid, taskReminderAt: "not-a-date" }).reminderAt).toBeTruthy());
  it("任务必须选择日期", () => expect(validateDraft({ ...valid, date: "" }).date).toBeTruthy());
  it("每周任务必须至少选择一天", () => expect(validateDraft({ ...valid, taskScheduleMode: "weekly" }).repeatWeekdays).toBeTruthy());
  it("拒绝晚于父任务的子任务", () => expect(validateDraft({ ...valid, subtasks: [{ title: "晚了", dueAt: "2026-08-21T09:00" }] }).subtasks).toBeTruthy());
  it("接受有效任务", () => expect(validateDraft(valid)).toEqual({}));
  it("接受带合法 HTTP(S) 链接且不填结束时间的会议", () => {
    expect(validateDraft({ ...valid, type: "meeting", meetingUrl: "https://meet.example.com/1", endTime: "" })).toEqual({});
    expect(validateDraft({ ...valid, type: "meeting", meetingUrl: "http://meet.example.com/1" })).toEqual({});
  });
  it("拒绝格式不正确的会议链接与缺少日期的会议", () => {
    expect(validateDraft({ ...valid, type: "meeting", meetingUrl: "not a url" }).meetingUrl).toBeTruthy();
    expect(validateDraft({ ...valid, type: "meeting", date: "" }).startAt).toBeTruthy();
    expect(validateDraft({ ...valid, type: "meeting", endTime: "09:30" }).endAt).toBeTruthy();
  });
  it("校验标题与备注长度上限", () => {
    expect(validateDraft({ ...valid, title: "标".repeat(160) })).toEqual({});
    expect(validateDraft({ ...valid, title: "标".repeat(161) }).title).toBeTruthy();
    expect(validateDraft({ ...valid, notes: "注".repeat(4000) })).toEqual({});
    expect(validateDraft({ ...valid, notes: "注".repeat(4001) }).notes).toBeTruthy();
  });
  it("每周任务选择重复日期后通过校验", () => {
    expect(validateDraft({ ...valid, taskScheduleMode: "weekly", repeatWeekdays: [1, 3] })).toEqual({});
  });
  it("拒绝空子任务标题并允许等于父任务截止时间", () => {
    expect(validateDraft({ ...valid, subtasks: [{ title: "  ", dueAt: "" }] }).subtasks).toBeTruthy();
    expect(validateDraft({ ...valid, subtasks: [{ title: "刚好", dueAt: "2026-08-20T23:59:59" }] })).toEqual({});
    expect(validateDraft({ ...valid, subtasks: [{ title: "超时", dueAt: "2026-08-21T00:00:00" }] }).subtasks).toBeTruthy();
  });
  it("同时返回多个字段错误", () => {
    const errors = validateDraft({ ...valid, title: "", notes: "注".repeat(4001), taskReminderAt: "bad", taskScheduleMode: "weekly" });
    expect(Object.keys(errors).sort()).toEqual(["notes", "reminderAt", "repeatWeekdays", "title"]);
  });
});
