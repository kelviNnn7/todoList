export type ItemType = "task" | "meeting";
export type FilterType = "all" | ItemType;

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
  subtasks: Array<{ title: string; dueAt: string }>;
}
