import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TodoItem } from "../types";
import { ItemForm } from "./ItemForm";

const task: TodoItem = {
  id: "task-edit", type: "task", title: "整理上线清单", notes: "保留原有进度", startAt: null, endAt: null,
  dueAt: "2026-08-28T15:59:59.000Z", location: "", meetingUrl: "", reminderMinutes: null,
  reminderSentAt: null, reminderAt: "2026-08-28T02:00:00.000Z", reminderStatus: "snoozed", snoozeCount: 2,
  lastReminderAt: "2026-08-27T02:00:00.000Z", completed: false, source: "local",
  subtasks: [{ id: "sub-edit", title: "回归测试", completed: true, dueAt: "2026-08-28T03:00:00.000Z" }],
  createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-21T00:00:00.000Z",
};

const meeting: TodoItem = {
  id: "meeting-edit", type: "meeting", title: "产品周会", notes: "同步迭代进度",
  startAt: "2026-08-29T01:30:00.000Z", endAt: "2026-08-29T02:30:00.000Z", dueAt: null,
  location: "3A 会议室", meetingUrl: "https://example.com/meeting", reminderMinutes: 30,
  reminderSentAt: "2026-08-29T01:00:00.000Z", reminderAt: null, reminderStatus: "none", snoozeCount: 0,
  lastReminderAt: null, completed: false, source: "local", subtasks: [],
  createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-21T00:00:00.000Z",
};

describe("ItemForm editing", () => {
  it("新增任务时可选择每周并多选星期", async () => {
    const user = userEvent.setup(); const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ItemForm date={new Date(2026, 7, 27)} initialType="task" onClose={vi.fn()} onSave={onSave}/>);

    await user.type(screen.getByLabelText("标题"), "每周复盘");
    await user.click(screen.getByRole("button", { name: "每周" }));
    await user.click(screen.getByRole("button", { name: "星期一" }));
    await user.click(screen.getByRole("button", { name: "星期三" }));
    await user.click(screen.getByRole("button", { name: "星期四" }));
    await user.click(screen.getByRole("button", { name: "保存事项" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      title: "每周复盘",
      taskSchedule: { mode: "weekly", startsOn: "2026-08-27", weekdays: [1, 3] },
      completedDates: [],
      reminderAt: null,
    }));
  });

  it("回填并更新任务，同时保留事项、子任务和提醒状态", async () => {
    const user = userEvent.setup(); const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ItemForm date={new Date()} initialType="task" initialItem={task} onClose={vi.fn()} onSave={onSave}/>);

    expect(screen.getByRole("dialog", { name: "继续编辑任务" })).toBeInTheDocument();
    expect(screen.getByLabelText("标题")).toHaveValue(task.title);
    expect(screen.getByLabelText("子任务 1")).toHaveValue("回归测试");
    await user.clear(screen.getByLabelText("标题"));
    await user.type(screen.getByLabelText("标题"), "整理最终上线清单");
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: task.id, title: "整理最终上线清单", createdAt: task.createdAt,
      reminderStatus: "snoozed", snoozeCount: 2,
      subtasks: [expect.objectContaining({ id: "sub-edit", completed: true })],
    }));
  });

  it("回填并更新会议，保留原记录且不重复新增", async () => {
    const user = userEvent.setup(); const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ItemForm date={new Date()} initialType="meeting" initialItem={meeting} onClose={vi.fn()} onSave={onSave}/>);

    expect(screen.getByRole("dialog", { name: "继续编辑会议" })).toBeInTheDocument();
    expect(screen.getByLabelText("地点")).toHaveValue("3A 会议室");
    expect(screen.getByLabelText("会议链接")).toHaveValue(meeting.meetingUrl);
    expect(screen.getByLabelText("提前提醒")).toHaveValue("30");
    await user.clear(screen.getByLabelText("地点"));
    await user.type(screen.getByLabelText("地点"), "5B 会议室");
    await user.click(screen.getByRole("button", { name: "保存修改" }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: meeting.id, title: meeting.title, location: "5B 会议室", createdAt: meeting.createdAt,
      reminderSentAt: meeting.reminderSentAt,
    }));
  });
});
