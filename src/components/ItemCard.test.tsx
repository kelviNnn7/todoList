import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ItemCard } from "./ItemCard";
import type { TodoItem } from "../types";

const task: TodoItem = {
  id: "task-1", type: "task", title: "发布桌面应用", notes: "上线前复核", startAt: null, endAt: null,
  dueAt: new Date(2026, 7, 20, 23, 59).toISOString(), location: "", meetingUrl: "", reminderMinutes: null,
  reminderSentAt: null, reminderAt: null, reminderStatus: "none", snoozeCount: 0, lastReminderAt: null,
  completed: false, source: "local", subtasks: [{ id: "sub-1", title: "完成测试", completed: false, dueAt: null }],
  createdAt: "2026-08-18T00:00:00.000Z", updatedAt: "2026-08-18T00:00:00.000Z",
};

describe("ItemCard", () => {
  it("完成父任务时同步完成子任务", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined); const user = userEvent.setup();
    render(<ItemCard item={task} onChange={onChange} onDelete={vi.fn()} onEdit={vi.fn()}/>);
    await user.click(screen.getByRole("button", { name: "标记为完成" }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ completed: true, subtasks: [expect.objectContaining({ completed: true })] }));
  });
  it("展开后可独立完成子任务", async () => {
    const onChange = vi.fn().mockResolvedValue(undefined); const user = userEvent.setup();
    render(<ItemCard item={task} onChange={onChange} onDelete={vi.fn()} onEdit={vi.fn()}/>);
    await user.click(screen.getByRole("button", { name: "展开子任务" }));
    await user.click(screen.getByRole("checkbox", { name: /完成测试/ }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ completed: true }));
  });
  it("展开后可以继续编辑事项", async () => {
    const onEdit = vi.fn(); const user = userEvent.setup();
    render(<ItemCard item={task} onChange={vi.fn()} onDelete={vi.fn()} onEdit={onEdit}/>);
    await user.click(screen.getByRole("button", { name: "展开子任务" }));
    await user.click(screen.getByRole("button", { name: `编辑任务：${task.title}` }));
    expect(onEdit).toHaveBeenCalledWith(task);
  });
});
