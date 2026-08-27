export type ItemType = "task" | "meeting";
export type FilterType = "all" | ItemType;
export type CalendarViewMode = "week" | "month";
export type ReminderStatus = "none" | "pending" | "fired" | "snoozed";
export type TaskScheduleMode = "single" | "weekly";

export interface WeeklyTaskSchedule {
  mode: "weekly";
  startsOn: string;
  weekdays: number[];
}

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
  taskSchedule?: WeeklyTaskSchedule | null;
  completedDates?: string[];
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
  taskScheduleMode: TaskScheduleMode;
  repeatWeekdays: number[];
  subtasks: Array<{ id?: string; title: string; completed?: boolean; dueAt: string }>;
}
