import { describe, expect, it } from "vitest";
import { isDesktopRuntime } from "./desktop";

describe("desktop runtime detection", () => {
  it("keeps the browser preview separate from the desktop runtime", () => {
    expect(isDesktopRuntime()).toBe(false);
  });
});
