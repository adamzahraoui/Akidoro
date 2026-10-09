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
};

export type MusicProvider = 'youtube' | 'spotify';
