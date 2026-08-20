import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => localStorage.clear());
  it("挂件默认显示周视图和空状态", async () => {
    const { container } = render(<App/>);
    expect(await screen.findByText("这一天很清爽")).toBeInTheDocument();
    expect(container.querySelectorAll(".calendar-grid button")).toHaveLength(7);
  });
  it("可以切换为完整月视图并分别保存偏好", async () => {
    const user = userEvent.setup();
    const { container } = render(<App/>);
    await user.click(screen.getByRole("button", { name: "月" }));
    expect(container.querySelectorAll(".calendar-grid button").length).toBeGreaterThanOrEqual(35);
    expect(localStorage.getItem("pindo.calendarView.widget")).toBe("month");
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
    expect(localStorage.getItem("pindo.desktopWidget")).toBe("true");
    expect(localStorage.getItem("pindo.appearanceOpacity")).toBe("75");
  });
});
