import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { dateKey, weekDays } from "./lib/calendar";

const cells = (container: HTMLElement) => [...container.querySelectorAll<HTMLElement>(".day-cell")];

describe("日期格指针光束", () => {
  beforeEach(() => localStorage.clear());

  it("鼠标进入只点亮指针下的一格，移动到另一日立即转移", async () => {
    const { container } = render(<App/>);
    await screen.findByText("这一天很清爽");
    const [first, second] = cells(container);
    expect(first.querySelector(".day-beam")).toBeNull();

    fireEvent.pointerOver(first, { pointerType: "mouse", buttons: 0 });
    expect(first).toHaveClass("beam-active");
    expect(first.querySelectorAll(".day-beam rect")).toHaveLength(2);
    expect(second.querySelector(".day-beam")).toBeNull();

    fireEvent.pointerOut(first, { pointerType: "mouse" });
    fireEvent.pointerOver(second, { pointerType: "mouse", buttons: 0 });
    expect(first).not.toHaveClass("beam-active");
    expect(first.querySelector(".day-beam")).toBeNull();
    expect(second).toHaveClass("beam-active");
    expect(container.querySelectorAll(".day-beam")).toHaveLength(1);
  });

  it("离开、滚动、失焦和切视图都会清除光束", async () => {
    const { container } = render(<App/>);
    await screen.findByText("这一天很清爽");
    const cell = cells(container)[2];

    fireEvent.pointerOver(cell, { pointerType: "mouse", buttons: 0 });
    expect(cell).toHaveClass("beam-active");
    fireEvent.pointerOut(cell, { pointerType: "mouse" });
    expect(cell).not.toHaveClass("beam-active");

    fireEvent.pointerOver(cell, { pointerType: "mouse", buttons: 0 });
    fireEvent.scroll(window);
    expect(cell).not.toHaveClass("beam-active");

    fireEvent.pointerOver(cell, { pointerType: "mouse", buttons: 0 });
    fireEvent.blur(window);
    expect(cell).not.toHaveClass("beam-active");

    fireEvent.pointerOver(cell, { pointerType: "mouse", buttons: 0 });
    fireEvent.click(screen.getByRole("button", { name: "月" }));
    expect(container.querySelector(".beam-active")).toBeNull();
  });

  it("触摸不显示粘滞光束，键盘焦点也不运行光束", async () => {
    const { container } = render(<App/>);
    await screen.findByText("这一天很清爽");
    const cell = cells(container)[0];

    fireEvent.pointerOver(cell, { pointerType: "touch", buttons: 0 });
    expect(cell).not.toHaveClass("beam-active");

    fireEvent.focus(cell);
    expect(cell).not.toHaveClass("beam-active");
    expect(cell.querySelector(".day-beam")).toBeNull();
    expect(cell).toHaveClass("day-cell");
  });

  it("键盘焦点可与指针光束同时显示，同页移动不熄灭光束", async () => {
    const { container } = render(<App/>);
    await screen.findByText("这一天很清爽");
    const cell = cells(container)[1];

    act(() => cell.focus());
    fireEvent.pointerOver(cell, { pointerType: "mouse", buttons: 0 });
    expect(document.activeElement).toBe(cell);
    expect(cell).toHaveClass("beam-active");
    expect(cell.querySelector(".day-beam")).not.toBeNull();

    fireEvent.keyDown(cell, { key: "ArrowRight" });
    expect(cell).toHaveClass("beam-active");
  });

  it("只有跨页键盘导航才清除指针光束", async () => {
    const { container } = render(<App/>);
    await screen.findByText("这一天很清爽");
    const cell = cells(container)[2];

    act(() => cell.focus());
    fireEvent.pointerOver(cell, { pointerType: "mouse", buttons: 0 });
    expect(cell).toHaveClass("beam-active");
    fireEvent.keyDown(cell, { key: "ArrowUp" });
    expect(container.querySelector(".beam-active")).toBeNull();
  });

  it("悬停不改变选中、今天下划线或周/月角标结构", async () => {
    const { container } = render(<App/>);
    await screen.findByText("这一天很清爽");
    const today = dateKey(new Date());
    const todayCell = container.querySelector<HTMLElement>(`.day-cell[data-date="${today}"]`);
    if (!todayCell) throw new Error("today missing");
    const week = weekDays(new Date());
    expect(container.querySelectorAll(".day-cell")).toHaveLength(week.length);

    fireEvent.pointerOver(todayCell, { pointerType: "mouse", buttons: 0 });
    expect(todayCell).toHaveClass("beam-active");
    expect(todayCell).toHaveAttribute("aria-pressed", "true");
    expect(todayCell.querySelector(".day-number")).toBeInTheDocument();
    expect(todayCell.querySelector(".day-number")).toHaveTextContent(String(new Date().getDate()));
  });
});
