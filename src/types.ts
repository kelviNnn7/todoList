export type ItemType = "task" | "meeting";
export type FilterType = "all" | ItemType;
export type CalendarViewMode = "week" | "month";
export type ReminderStatus = "none" | "pending" | "fired" | "snoozed";

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  dueAt: string | null;
}

export interface TodoItem {
  id: string;
  type: ItemType;
  title: string;
  notes: string;
  startAt: string | null;
  endAt: string | null;
  dueAt: string | null;
  location: string;
  meetingUrl: string;
  reminderMinutes: number | null;
  reminderSentAt: string | null;
  reminderAt: string | null;
  reminderStatus: ReminderStatus;
  snoozeCount: number;
  lastReminderAt: string | null;
  completed: boolean;
  source: "local" | "calendar" | "ics";
  subtasks: Subtask[];
  createdAt: string;
  updatedAt: string;
}

export interface ItemDraft {
  type: ItemType;
  title: string;
  notes: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  meetingUrl: string;
  reminderMinutes: number;
  taskReminderAt: string;
  subtasks: Array<{ title: string; dueAt: string }>;
}
