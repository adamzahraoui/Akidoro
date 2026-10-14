export type Mode = 'focus' | 'short' | 'long';

export type TimerStatus = 'idle' | 'running' | 'paused';

/** A contiguous interval of wall-clock time during which the timer was actively running. */
export interface TimeSegment {
  start: number; // epoch ms
  end: number; // epoch ms
}

/**
 * The serialisable timer state. Remaining time is always derived from timestamps,
 * never from a decrementing counter, so background tabs and refreshes cannot drift.
 */
export interface TimerState {
  mode: Mode;
  status: TimerStatus;
  /** Planned length of this session in seconds. Captured so settings changes don't disturb it mid-session. */
  plannedSec: number;
  /** Completed active segments for this session (paused time is excluded). */
  segments: TimeSegment[];
  /** Epoch ms at which the current active segment started, or null when not running. */
  activeStart: number | null;
  /** Unique id for the current session, used to prevent duplicate records. */
  sessionId: string;
  /** Optional user label, e.g. "Learning React". */
  label: string;
  /** Number of focus sessions completed in the current long-break cycle. */
  focusCount: number;
}

export interface Session {
  id: string;
  mode: Mode;
  label: string;
  /** Task associated when the focus session began; optional for older data. */
  taskId?: string | null;
  /** First moment the session started (epoch ms). */
  startedAt: number;
  /** Last moment of activity (epoch ms). */
  endedAt: number;
  /** Actual active seconds (paused time excluded, capped at the planned end). */
  durationSec: number;
  /** All active segments, used for accurate date/week splitting. */
  segments: TimeSegment[];
  /** True when the session reached its planned end. */
  completed: boolean;
}

/**
 * A plain-text note. `updatedAt` is the client's edit time (used for
 * last-write-wins), `deletedAt` is a soft-delete tombstone so deletions
 * propagate safely without a stale edit resurrecting a deleted note.
 */
export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
  deletedAt: number | null; // epoch ms tombstone, null = active
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface SavedMusicLink {
  id: string;
  provider: MusicProvider;
  name: string;
  input: string;
  normalizedId: string | null;
  createdAt: number;
}

export type ThemePreference = 'light' | 'dark' | 'system';

export interface Settings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  sessionsBeforeLong: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  theme: ThemePreference;
  notifications: boolean;
  soundEnabled: boolean;
  volume: number; // 0..1
  dailyGoalMin: number;
}

export const DEFAULT_SETTINGS: Settings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  sessionsBeforeLong: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
  theme: 'system',
  notifications: false,
  soundEnabled: true,
  volume: 0.5,
  dailyGoalMin: 120,
};

export type MusicProvider = 'youtube' | 'spotify';
