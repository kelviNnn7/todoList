import { describe, expect, it } from "vitest";
import { parseIcs } from "./ics";

describe("parseIcs", () => {
  it("导入标准会议并处理折行", () => {
    const result = parseIcs("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:weekly-1\r\nSUMMARY:部门\\, 周会\r\nDESCRIPTION:第一行\\n\r\n 第二行\r\nDTSTART:20260820T093000\r\nDTEND:20260820T103000\r\nLOCATION:会议室 A\r\nURL:https://meet.example.com/1\r\nEND:VEVENT\r\nEND:VCALENDAR");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("部门, 周会");
    expect(result[0].source).toBe("ics");
    expect(result[0].meetingUrl).toMatch(/^https:/);
  });
  it("忽略缺少开始时间的事件", () => expect(parseIcs("BEGIN:VEVENT\nSUMMARY:无时间\nEND:VEVENT")).toEqual([]));
  it("过滤不安全链接", () => expect(parseIcs("BEGIN:VEVENT\nSUMMARY:会\nDTSTART:20260820T093000\nURL:javascript:alert(1)\nEND:VEVENT")[0].meetingUrl).toBe(""));
});
