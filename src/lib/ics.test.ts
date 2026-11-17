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
  it("拒绝超过 5MB 的日历内容", () => {
    expect(() => parseIcs("A".repeat(5_000_001))).toThrow("ICS 文件不能超过 5MB");
  });
  it("解析 UTC、仅日期与带参数键，并忽略无效日期", () => {
    const utc = parseIcs("BEGIN:VEVENT\nSUMMARY:跨时区\nDTSTART:20260820T093000Z\nDTEND:20260820T103000Z\nEND:VEVENT")[0];
    expect(utc.startAt).toBe("2026-08-20T09:30:00.000Z");
    expect(utc.endAt).toBe("2026-08-20T10:30:00.000Z");

    const dateOnly = parseIcs("BEGIN:VEVENT\nSUMMARY:全天\nDTSTART;VALUE=DATE:20260820\nEND:VEVENT")[0];
    expect(dateOnly.startAt).toBe(new Date(2026, 7, 20).toISOString());
    expect(dateOnly.endAt).toBeNull();

    expect(parseIcs("BEGIN:VEVENT\nSUMMARY:坏日期\nDTSTART:2026-08-20\nEND:VEVENT")).toEqual([]);
    expect(parseIcs("BEGIN:VEVENT\nSUMMARY:坏结束\nDTSTART:20260820T093000\nDTEND:not-a-date\nEND:VEVENT")[0].endAt).toBeNull();
  });
  it("忽略空标题、空事件、无冒号行和孤立结束标记", () => {
    expect(parseIcs("BEGIN:VEVENT\nSUMMARY:   \nDTSTART:20260820T093000\nEND:VEVENT")).toEqual([]);
    expect(parseIcs("BEGIN:VEVENT\nDTSTART:20260820T093000\nEND:VEVENT")).toEqual([]);
    expect(parseIcs("BEGIN:VEVENT\nnot-a-property\nSUMMARY:有效\nDTSTART:20260820T093000\nEND:VEVENT")).toHaveLength(1);
    expect(parseIcs("END:VEVENT\nBEGIN:VEVENT\nSUMMARY:有效\nDTSTART:20260820T093000\nEND:VEVENT")).toHaveLength(1);
  });
  it("解转义文本并限制字段长度", () => {
    const longTitle = "标".repeat(200);
    const longNotes = "注".repeat(5_000);
    const longLocation = "地".repeat(300);
    const result = parseIcs(`BEGIN:VEVENT\nUID:abc\\,1\nSUMMARY:${longTitle}\nDESCRIPTION:${longNotes}\nLOCATION:${longLocation}\nDTSTART:20260820T093000\nEND:VEVENT`)[0];
    expect(result.title).toHaveLength(160);
    expect(result.notes).toHaveLength(4000);
    expect(result.location).toHaveLength(200);
    expect(result.id).toBe("ics:abc,1");
  });
  it("为缺少 UID 的事件生成稳定标识并接受 http 链接", () => {
    const result = parseIcs("BEGIN:VEVENT\nSUMMARY:评审\nDTSTART:20260820T093000\nURL:http://meet.example.com/1\nEND:VEVENT")[0];
    expect(result.id).toBe(`ics:${new Date(2026, 7, 20, 9, 30).toISOString()}:0`);
    expect(result.meetingUrl).toBe("http://meet.example.com/1");
    expect(result.reminderMinutes).toBe(15);
    expect(result.source).toBe("ics");
  });
  it("处理制表符折行和多个事件", () => {
    const result = parseIcs("BEGIN:VEVENT\nSUMMARY:第一\n 部分\nDTSTART:20260820T093000\nEND:VEVENT\nBEGIN:VEVENT\nSUMMARY:第二\nDTSTART:20260821T093000\nEND:VEVENT");
    expect(result.map((event) => event.title)).toEqual(["第一部分", "第二"]);
  });
});
