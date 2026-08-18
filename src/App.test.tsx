import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  beforeEach(() => localStorage.clear());
  it("显示两周日历和空状态", async () => {
    const { container } = render(<App/>);
    expect(await screen.findByText("这一天很清爽")).toBeInTheDocument();
    expect(container.querySelectorAll(".calendar-grid button")).toHaveLength(14);
  });
  it("可以打开新增会议表单并校验", async () => {
    const user = userEvent.setup(); render(<App/>);
    await user.click(screen.getByRole("button", { name: /会议/ }));
    await user.click(screen.getByRole("button", { name: "新增事项" }));
    expect(screen.getByRole("dialog", { name: "安排你的下一步" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "保存事项" }));
    expect(screen.getByText("请输入事项标题")).toBeInTheDocument();
  });
});
