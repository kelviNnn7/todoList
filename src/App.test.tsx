import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, format, getISODay } from "date-fns";
import App from "./App";
import { scopedStorageKey } from "./lib/scopedStorage";
import { dateKey, weekDays } from "./lib/calendar";
import type { TodoItem } from "./types";

const baseItem = (overrides: Partial<TodoItem> = {}): TodoItem => {
  const now = new Date();
  return {
    id: "item-1", type: "task", title: "整理评审要点", notes: "", startAt: null, endAt: null,
    dueAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString(),
    location: "", meetingUrl: "", reminderMinutes: null, reminderSentAt: null, reminderAt: null,
    reminderStatus: "none", snoozeCount: 0, lastReminderAt: null, completed: false, source: "local",
    subtasks: [], createdAt: now.toISOString(), updatedAt: now.toISOString(), ...overrides,
  };
};

const storedItems = () => JSON.parse(localStorage.getItem(scopedStorageKey("items.v1")) ?? "[]") as TodoItem[];
const dayCell = (container: HTMLElement, date: Date) => container.querySelector<HTMLElement>(`.day-cell[data-date="${dateKey(date)}"]`);

describe("App", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  it("挂件默认显示周视图和空状态", async () => {
    const { container } = render(<App/>);
    expect(await screen.findByText("这一天很清爽")).toBeInTheDocument();
    expect(screen.getByText("BluNote")).toBeInTheDocument();
    expect(container.querySelectorAll(".calendar-grid button")).toHaveLength(7);
    expect(container.querySelector(".app-glyph")).toHaveAttribute("src", expect.stringContaining("app-icon"));
    expect(container.querySelectorAll(".window-resize-handle")).toHaveLength(8);
    expect(container.querySelectorAll('.day-cell[tabindex="0"]')).toHaveLength(1);
  });

  it("可以切换为完整月视图并分别保存偏好", async () => {
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole("button", { name: "月" }));
    expect(container.querySelectorAll(".calendar-grid button").length).toBeGreaterThanOrEqual(35);
    expect(localStorage.getItem(scopedStorageKey("calendarView.widget"))).toBe("month");
  });

  it("跨过周日午夜后自动展示新一周和当天待办", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 30, 23, 59, 50));
    render(<App/>);
    expect(screen.getByText("8月24日 — 8月30日")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "8月30日待办列表" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(30_000));

    expect(screen.getByText("8月31日 — 9月6日")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "8月31日待办列表" })).toBeInTheDocument();
  });

  it("跨过月末午夜后自动展示新月份和当天待办", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 30, 23, 59, 50));
    localStorage.setItem(scopedStorageKey("calendarView.widget"), "month");
    render(<App/>);
    expect(screen.getByText("2026年 9月")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "9月30日待办列表" })).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(30_000));

    expect(screen.getByText("2026年 10月")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "10月1日待办列表" })).toBeInTheDocument();
  });

  it("切换周月视图时保留选中日期并定位到对应周期", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 7, 10, 0));
    const { container } = render(<App/>);
    fireEvent.click(screen.getByRole("button", { name: "上一周" }));
    const first = container.querySelectorAll<HTMLElement>(".day-cell")[0];
    fireEvent.click(first);
    expect(screen.getByRole("region", { name: "8月31日待办列表" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "月" }));

    expect(screen.getByText("2026年 8月")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "8月31日待办列表" })).toBeInTheDocument();
    expect(dayCell(container, new Date(2026, 7, 31))).toHaveAttribute("aria-pressed", "true");
  });

  it("可以打开新增会议表单并校验", async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole("button", { name: /会议/ }));
    await user.click(screen.getByRole("button", { name: "新增事项" }));
    expect(screen.getByRole("dialog", { name: "新建事项" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存会议" }));
    expect(screen.getByText("请输入事项标题")).toBeInTheDocument();
  });

  it("可以设置桌面小组件和外观透明度", async () => {
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole("button", { name: "设置" }));
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
    await user.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.queryByText("1 档 · 100%")).not.toBeInTheDocument();
    const slider = screen.getByRole("slider", { name: "字体大小" });
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "4");
    expect(slider).toHaveAttribute("step", "1");
    fireEvent.change(slider, { target: { value: "4" } });
    expect(container.querySelector("main")).toHaveAttribute("style", expect.stringContaining("--font-scale: 1.45"));
    expect(slider).toHaveAttribute("aria-valuetext", "4 档，145%");
    expect(localStorage.getItem(scopedStorageKey("appearanceFontSize"))).toBe("4");
  });

  it("月视图用琥珀点标记逾期且提供非颜色语义", async () => {
    const now = new Date();
    const yesterday = addDays(now, -1);
    localStorage.setItem(scopedStorageKey("calendarView.widget"), "month");
    localStorage.setItem(scopedStorageKey("items.v1"), JSON.stringify([baseItem({ id: "overdue", type: "task", title: "逾期任务", dueAt: new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 23, 59, 59).toISOString() })]));
    const { container } = render(<App/>);

    await waitFor(() => expect(container.querySelector(".day-cell.has-overdue")).toBeInTheDocument());
    const cell = container.querySelector<HTMLElement>(".day-cell.has-overdue");
    expect(cell).toHaveAttribute("aria-label", expect.stringContaining("有逾期事项"));
    expect(cell).toHaveAttribute("aria-label", expect.stringContaining("1 项待处理"));
    expect(cell?.querySelector(".dot.overdue")).toBeInTheDocument();
  });

  it("点击设置栏外部时自动收起设置栏", async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getByRole("dialog", { name: "更多设置" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新增事项" }));
    expect(screen.queryByRole("dialog", { name: "更多设置" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "新建事项" })).toBeInTheDocument();
  });

  it("每周任务按日期独立保存完成状态", async () => {
    const today = new Date(); const key = format(today, "yyyy-MM-dd");
    const recurring = baseItem({
      id: "weekly-task", title: "每周整理", taskSchedule: { mode: "weekly", startsOn: key, weekdays: [getISODay(today)] }, completedDates: [],
    });
    localStorage.setItem(scopedStorageKey("items.v1"), JSON.stringify([recurring]));
    const user = userEvent.setup(); render(<App/>);
    expect(await screen.findByText("每周整理")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "标记为完成" }));
    await waitFor(() => expect(storedItems()[0].completedDates).toContain(key));
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

  it("方向键只移动日期焦点，Enter 才更新清单", async () => {
    const today = new Date();
    const tomorrow = addDays(today, 1);
    const { container } = render(<App/>);
    await screen.findByText("这一天很清爽");
    const todayCell = dayCell(container, today);
    if (!todayCell) throw new Error("today cell missing");
    fireEvent.focus(todayCell);
    fireEvent.keyDown(todayCell, { key: "ArrowRight" });

    await waitFor(() => expect(document.activeElement).toHaveAttribute("data-date", dateKey(tomorrow)));
    expect(dayCell(container, today)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("region", { name: `${format(today, "M月d日")}待办列表` })).toBeInTheDocument();

    fireEvent.keyDown(document.activeElement as HTMLElement, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("region", { name: `${format(tomorrow, "M月d日")}待办列表` })).toBeInTheDocument());
    expect(container.querySelectorAll('.day-cell[tabindex="0"]')).toHaveLength(1);
  });

  it("在周边界继续浏览焦点但不自动改选日期", async () => {
    const today = new Date();
    const monday = weekDays(today)[0];
    const previousWeek = weekDays(addDays(monday, -1));
    const { container } = render(<App/>);
    await screen.findByText("这一天很清爽");
    const mondayCell = dayCell(container, monday);
    if (!mondayCell) throw new Error("monday cell missing");
    fireEvent.focus(mondayCell);
    fireEvent.keyDown(mondayCell, { key: "ArrowLeft" });

    await waitFor(() => expect(document.activeElement).toHaveAttribute("data-date", dateKey(previousWeek[6])));
    expect(screen.getByText(`${format(previousWeek[0], "M月d日")} — ${format(previousWeek[6], "M月d日")}`)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: `${format(today, "M月d日")}待办列表` })).toBeInTheDocument();
  });

  it("展开窗口按全天与有时间分组共用表面", async () => {
    const now = new Date();
    const meeting: TodoItem = baseItem({
      id: "meeting-1", type: "meeting", title: "设计系统周会", dueAt: null,
      startAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 30).toISOString(),
      endAt: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 15, 15).toISOString(),
      location: "会议室 A", reminderMinutes: 15,
    });
    localStorage.setItem(scopedStorageKey("items.v1"), JSON.stringify([baseItem({ id: "task-1", title: "整理评审要点" }), meeting]));
    const user = userEvent.setup(); render(<App/>);
    expect(await screen.findByText("整理评审要点")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "展开窗口" }));

    const allDay = screen.getByRole("region", { name: "全天" });
    const timed = screen.getByRole("region", { name: "有时间" });
    expect(within(allDay).getByText("整理评审要点")).toBeInTheDocument();
    expect(within(timed).getByText("设计系统周会")).toBeInTheDocument();
  });

  it("切换窗口大小保留选中日期、筛选、视图与已展开任务", async () => {
    const now = new Date();
    const task = baseItem({ id: "notes-task", title: "保留展开状态", notes: "详情不应收起" });
    localStorage.setItem(scopedStorageKey("items.v1"), JSON.stringify([task]));
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await screen.findByText("保留展开状态");
    await user.click(screen.getByRole("button", { name: "月" }));
    fireEvent.click(screen.getByRole("button", { name: /^工作清单/ }));
    await user.click(screen.getByRole("button", { name: "展开详情" }));
    expect(screen.getByText("详情不应收起")).toBeInTheDocument();
    const titleBefore = container.querySelector(".calendar-title")?.textContent;
    const regionBefore = screen.getByRole("region", { name: `${format(now, "M月d日")}待办列表` });

    await user.click(screen.getByRole("button", { name: "展开窗口" }));

    expect(screen.getByRole("region", { name: `${format(now, "M月d日")}待办列表` })).toBe(regionBefore);
    expect(screen.getByRole("button", { name: /^工作清单/ })).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".calendar-title")).toHaveTextContent(titleBefore ?? "");
    expect(screen.getByText("详情不应收起")).toBeInTheDocument();
  });

  it("完成事项后原位保留、计数更新并可撤销子任务联动", async () => {
    const task = baseItem({
      id: "undo-task", title: "整理评审要点",
      subtasks: [
        { id: "sub-1", title: "汇总清单", completed: false, dueAt: null },
        { id: "sub-2", title: "确认议程", completed: false, dueAt: null },
      ],
    });
    localStorage.setItem(scopedStorageKey("items.v1"), JSON.stringify([task]));
    const user = userEvent.setup(); render(<App/>);
    expect(await screen.findByText("1 项待处理")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "标记为完成" }));

    expect(await screen.findByText("0 项待处理")).toBeInTheDocument();
    expect(screen.getByText("已标记完成")).toBeInTheDocument();
    expect(storedItems()[0].completed).toBe(true);
    expect(storedItems()[0].subtasks.every((subtask) => subtask.completed)).toBe(true);
    expect(screen.getByText("整理评审要点")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "展开详情" }));
    expect(screen.getByRole("checkbox", { name: /汇总清单/ })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "撤销" }));

    expect(await screen.findByText("1 项待处理")).toBeInTheDocument();
    expect(storedItems()[0].completed).toBe(false);
    expect(storedItems()[0].subtasks.every((subtask) => !subtask.completed)).toBe(true);
  });

  it("切日期后撤销每周任务仍指向完成的目标日期", async () => {
    const today = new Date();
    const tomorow = addDays(today, 1);
    const key = dateKey(today);
    localStorage.setItem(scopedStorageKey("items.v1"), JSON.stringify([baseItem({
      id: "weekly-undo", title: "每周同步", dueAt: new Date(`${key}T23:59:59`).toISOString(),
      taskSchedule: { mode: "weekly", startsOn: key, weekdays: [getISODay(today)] }, completedDates: [],
    })]));
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await screen.findByText("每周同步");
    await user.click(screen.getByRole("button", { name: "标记为完成" }));
    await waitFor(() => expect(storedItems()[0].completedDates).toContain(key));

    await user.click(screen.getByRole("button", { name: "月" }));
    const target = dayCell(container, tomorow);
    if (!target) throw new Error("next date cell missing");
    fireEvent.click(target);
    await screen.findByRole("region", { name: `${format(tomorow, "M月d日")}待办列表` });

    await user.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(() => expect(storedItems()[0].completedDates).not.toContain(key));
  });

  it("只填标题即可新增并把焦点归还触发按钮", async () => {
    const user = userEvent.setup(); render(<App/>);
    const newButton = screen.getByRole("button", { name: "新增事项" });
    await user.click(newButton);

    const title = screen.getByLabelText("标题");
    expect(title).toHaveFocus();
    expect(screen.getByLabelText("日期")).toHaveValue(format(new Date(), "yyyy-MM-dd"));
    await user.type(title, "汇总评审反馈");
    await user.click(screen.getByRole("button", { name: "保存任务" }));

    expect(await screen.findByText("汇总评审反馈")).toBeInTheDocument();
    await waitFor(() => expect(newButton).toHaveFocus());
    expect(screen.queryByRole("dialog", { name: "新建事项" })).not.toBeInTheDocument();
    expect(screen.getByText("1 项待处理")).toBeInTheDocument();
  });
});

describe("App overlay focus", () => {
  beforeEach(() => localStorage.clear());

  it("Esc 关闭快速新增并把焦点归还触发按钮", async () => {
    const user = userEvent.setup(); render(<App/>);
    const newButton = screen.getByRole("button", { name: "新增事项" });
    await user.click(newButton);
    expect(screen.getByLabelText("标题")).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "新建事项" })).not.toBeInTheDocument());
    await waitFor(() => expect(newButton).toHaveFocus());
  });

  it("设置打开时不会与新建浮层重叠", async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole("button", { name: "设置" }));
    expect(screen.getByRole("dialog", { name: "更多设置" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "新增事项" }));
    expect(screen.queryByRole("dialog", { name: "更多设置" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "新建事项" })).toBeInTheDocument();
    expect(screen.getByLabelText("标题")).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "新建事项" })).not.toBeInTheDocument());
  });
});

describe("App completion safety", () => {
  beforeEach(() => localStorage.clear());

  it("完成保存失败时不假报成功且保留待处理状态", async () => {
    localStorage.setItem(scopedStorageKey("items.v1"), JSON.stringify([baseItem({ id: "fail-task", title: "失败任务" })]));
    const user = userEvent.setup(); render(<App/>);
    await screen.findByText("失败任务");
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    try {
      await user.click(screen.getByRole("button", { name: "标记为完成" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
      expect(screen.getByRole("button", { name: "标记为完成" })).toHaveAttribute("aria-pressed", "false");
      expect(screen.queryByRole("button", { name: "撤销" })).not.toBeInTheDocument();
      expect(storedItems()[0].completed).toBe(false);
    } finally {
      setItem.mockRestore();
    }
  });

  it("撤销不会覆盖完成后的无关编辑", async () => {
    localStorage.setItem(scopedStorageKey("items.v1"), JSON.stringify([baseItem({
      id: "edit-undo", title: "原始标题",
      subtasks: [{ id: "edit-sub", title: "子任务", completed: false, dueAt: null }],
    })]));
    const user = userEvent.setup(); render(<App/>);
    await screen.findByText("原始标题");
    await user.click(screen.getByRole("button", { name: "标记为完成" }));
    await screen.findByText("已标记完成");
    await user.click(screen.getByRole("button", { name: "展开详情" }));
    await user.click(screen.getByRole("button", { name: /编辑任务：原始标题/ }));
    const title = screen.getByLabelText("标题");
    await user.clear(title);
    await user.type(title, "更新后的标题");
    await user.click(screen.getByRole("button", { name: "保存修改" }));
    await screen.findByText("更新后的标题");
    await user.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() => expect(storedItems()[0].completed).toBe(false));
    expect(storedItems()[0].title).toBe("更新后的标题");
    expect(storedItems()[0].subtasks[0].completed).toBe(false);
    expect(screen.getByText("更新后的标题")).toBeInTheDocument();
  });

  it("空态新增入口消失后焦点回到顶栏新建", async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(await screen.findByRole("button", { name: "添加事项" }));
    await user.type(screen.getByLabelText("标题"), "空态新增");
    await user.click(screen.getByRole("button", { name: "保存任务" }));
    await screen.findByText("空态新增");
    await waitFor(() => expect(screen.getByRole("button", { name: "新增事项" })).toHaveFocus());
  });
});
