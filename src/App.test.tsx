import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { format, getISODay } from "date-fns";
import App from "./App";
import { scopedStorageKey } from "./lib/scopedStorage";
import type { TodoItem } from "./types";

describe("App", () => {
  beforeEach(() => localStorage.clear());
  it("挂件默认显示周视图和空状态", async () => {
    const { container } = render(<App/>);
    expect(await screen.findByText("这一天很清爽")).toBeInTheDocument();
    expect(screen.getByText("BluNote")).toBeInTheDocument();
    expect(container.querySelectorAll(".calendar-grid button")).toHaveLength(7);
    expect(container.querySelector(".app-glyph")).toHaveAttribute("src", expect.stringContaining("app-icon"));
    expect(container.querySelectorAll(".window-resize-handle")).toHaveLength(8);
  });
  it("可以切换为完整月视图并分别保存偏好", async () => {
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole("button", { name: "月" }));
    expect(container.querySelectorAll(".calendar-grid button").length).toBeGreaterThanOrEqual(35);
    expect(localStorage.getItem(scopedStorageKey("calendarView.widget"))).toBe("month");
  });
  it("可以打开新增会议表单并校验", async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole("button", { name: /会议/ }));
    await user.click(screen.getByRole("button", { name: "新增事项" }));
    expect(screen.getByRole("dialog", { name: "安排你的下一步" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存事项" }));
    expect(screen.getByText("请输入事项标题")).toBeInTheDocument();
  });
  it("可以设置桌面小组件和外观透明度", async () => {
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole("button", { name: "更多选项" }));
    await user.click(screen.getByRole("checkbox", { name: /桌面小组件/ }));
    fireEvent.change(screen.getByRole("slider", { name: "外观透明度" }), { target: { value: "75" } });
    expect(container.querySelector("main")).toHaveClass("desktop-widget");
    expect(container.querySelector("main")).toHaveAttribute("style", expect.stringContaining("--widget-opacity: 0.75"));
    expect(localStorage.getItem(scopedStorageKey("desktopWidget"))).toBe("true");
    expect(localStorage.getItem(scopedStorageKey("appearanceOpacity"))).toBe("75");
  });
  it("可以通过四档滑杆调节并持久化字体大小", async () => {
    const user = userEvent.setup();
    const { container } = render(<App/>);
    expect(container.querySelector("main")).toHaveAttribute("style", expect.stringContaining("--font-scale: 1"));
    await user.click(screen.getByRole("button", { name: "更多选项" }));
    expect(screen.getByText("1 档 · 100%")).toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: "字体大小" });
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "4");
    expect(slider).toHaveAttribute("step", "1");
    fireEvent.change(slider, { target: { value: "4" } });
    expect(container.querySelector("main")).toHaveAttribute("style", expect.stringContaining("--font-scale: 1.45"));
    expect(screen.getByText("4 档 · 145%")).toBeInTheDocument();
    expect(localStorage.getItem(scopedStorageKey("appearanceFontSize"))).toBe("4");
  });
  it("点击设置栏外部时自动收起设置栏", async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole("button", { name: "更多选项" }));
    expect(screen.getByRole("dialog", { name: "更多设置" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新增事项" }));
    expect(screen.queryByRole("dialog", { name: "更多设置" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "安排你的下一步" })).toBeInTheDocument();
  });
  it("每周任务按日期独立保存完成状态", async () => {
    const today = new Date(); const key = format(today, "yyyy-MM-dd");
    const recurring: TodoItem = {
      id: "weekly-task", type: "task", title: "每周整理", notes: "", startAt: null, endAt: null,
      dueAt: new Date(`${key}T23:59:59`).toISOString(), location: "", meetingUrl: "", reminderMinutes: null,
      reminderSentAt: null, reminderAt: null, reminderStatus: "none", snoozeCount: 0, lastReminderAt: null,
      completed: false, source: "local", subtasks: [], taskSchedule: { mode: "weekly", startsOn: key, weekdays: [getISODay(today)] }, completedDates: [],
      createdAt: today.toISOString(), updatedAt: today.toISOString(),
    };
    localStorage.setItem(scopedStorageKey("items.v1"), JSON.stringify([recurring]));
    const user = userEvent.setup(); render(<App/>);
    expect(await screen.findByText("每周整理")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "标记为完成" }));
    await waitFor(() => expect(JSON.parse(localStorage.getItem(scopedStorageKey("items.v1")) ?? "[]")[0].completedDates).toContain(key));
  });
  it("展开窗口后待办与日历固定为等宽双栏", async () => {
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole("button", { name: "展开窗口" }));
    expect(container.querySelector("main")).toHaveClass("expanded");
    expect(screen.queryByRole("separator", { name: "调整侧栏宽度" })).not.toBeInTheDocument();
    expect(localStorage.getItem(scopedStorageKey("sidebarWidth"))).toBeNull();
  });
  it("展开窗口后待办列表保持为可滚动且可键盘访问的主区域", async () => {
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole("button", { name: "展开窗口" }));
    expect(container.querySelector("main")).toHaveClass("expanded");
    expect(screen.getByRole("region", { name: /待办列表/ })).toHaveAttribute("tabindex", "0");
    expect(container.querySelector(".agenda")).toBeInTheDocument();
    expect(container.querySelector(".calendar-panel")).toBeInTheDocument();
  });
});
