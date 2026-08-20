import type { TodoItem } from "../types";

function unescapeText(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

function parseIcsDate(value: string): Date | null {
  const clean = value.trim();
  const match = clean.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?(Z)?$/);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00", utc] = match;
  const args = [Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)] as const;
  const date = utc ? new Date(Date.UTC(...args)) : new Date(...args);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseIcs(content: string): TodoItem[] {
  if (content.length > 5_000_000) throw new Error("ICS 文件不能超过 5MB");
  const lines = content.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const events: Array<Record<string, string>> = [];
  let current: Record<string, string> | null = null;
  for (const line of lines) {
    if (line.trim() === "BEGIN:VEVENT") { current = {}; continue; }
    if (line.trim() === "END:VEVENT") { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const separator = line.indexOf(":"); if (separator < 1) continue;
    const key = line.slice(0, separator).split(";")[0].toUpperCase();
    if (["UID", "SUMMARY", "DESCRIPTION", "DTSTART", "DTEND", "LOCATION", "URL"].includes(key)) current[key] = line.slice(separator + 1);
  }
  const now = new Date().toISOString();
  return events.flatMap((event, index) => {
    const start = event.DTSTART ? parseIcsDate(event.DTSTART) : null;
    const title = unescapeText(event.SUMMARY || "");
    if (!start || !title) return [];
    return [{
      id: `ics:${unescapeText(event.UID || `${start.toISOString()}:${index}`)}`,
      type: "meeting" as const, title: title.slice(0, 160), notes: unescapeText(event.DESCRIPTION || "").slice(0, 4000),
      startAt: start.toISOString(), endAt: event.DTEND ? parseIcsDate(event.DTEND)?.toISOString() ?? null : null, dueAt: null,
      location: unescapeText(event.LOCATION || "").slice(0, 200), meetingUrl: /^https?:\/\//i.test(event.URL || "") ? event.URL : "",
      reminderMinutes: 15, reminderSentAt: null, reminderAt: null, reminderStatus: "none" as const,
      snoozeCount: 0, lastReminderAt: null, completed: false, source: "ics" as const, subtasks: [], createdAt: now, updatedAt: now,
    }];
  });
}
