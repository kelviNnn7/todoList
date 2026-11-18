import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const rect = (x: number, y: number, width: number, height: number) => ({
  x, y, width, height, top: y, left: x, right: x + width, bottom: y + height, toJSON: () => ({}),
}) as DOMRect;

describe("浮层正文遮蔽", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("只让与浮层相交的正文暂时透明，布局与标题不受影响", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.classList.contains("item-form")) return rect(10, 10, 300, 300);
      if (this.classList.contains("calendar-title")) return rect(20, 20, 100, 20);
      if (this.classList.contains("agenda-heading")) return rect(20, 400, 300, 40);
      return rect(0, 0, 0, 0);
    });
    const { container } = render(<App/>);
    await screen.findByText("这一天很清爽");
    const title = container.querySelector<HTMLElement>(".agenda-heading h2");
    if (!title) throw new Error("agenda title missing");

    fireEvent.click(screen.getByRole("button", { name: /^新增事项$/ }));
    await screen.findByRole("dialog", { name: "新建事项" });
    await waitFor(() => expect(container.querySelector(".calendar-title")).toHaveClass("overlay-occluded"));
    expect(container.querySelector(".calendar-title")).toHaveClass("overlay-occluded");
    expect(title).not.toHaveClass("overlay-occluded");
    expect(title.textContent).toContain("今天");
    expect(screen.getByLabelText("标题")).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "新建事项" })).not.toBeInTheDocument());
    await waitFor(() => expect(container.querySelector(".calendar-title")).not.toHaveClass("overlay-occluded"));
  });
});
