import { useCallback, useState } from 'react';

export interface MusicLink<T> {
  input: string;
  target: T | null;
  urlError: string | null;
  setInput: (value: string) => void;
  load: () => void;
  loadUrl: (input: string) => void;
  clear: () => void;
}

interface Persisted<T> {
  input: string;
  target: T | null;
}

function readPersisted<T>(key: string): Persisted<T> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Persisted<T>;
      if (typeof parsed.input === 'string') {
        return { input: parsed.input, target: parsed.target ?? null };
      }
    }
  } catch {
    /* ignore malformed or unavailable storage */
  }
  return { input: '', target: null };
}

function persist<T>(key: string, value: Persisted<T>): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be full or disabled (private mode) */
  }
}

/**
 * Persist and validate a single pasted music link. The parsed target is a plain
 * data object (ids only) so callers can only ever build official embed URLs —
 * arbitrary user-supplied markup is never stored or rendered.
 */
export function useMusicLink<T>(
  key: string,
  parse: (input: string) => T | null,
  invalidMessage: string,
): MusicLink<T> {
  const [state, setState] = useState<Persisted<T>>(() => readPersisted<T>(key));
  const [urlError, setUrlError] = useState<string | null>(null);

  const setInput = useCallback((input: string) => {
    setState((s) => (s.input === input ? s : { ...s, input }));
    setUrlError(null);
  }, []);

  const load = useCallback(() => {
    const parsed = parse(state.input);
    if (!parsed) {
      setUrlError(invalidMessage);
      return;
    }
    setUrlError(null);
    const next = { input: state.input, target: parsed };
    setState(next);
    persist(key, next);
  }, [key, parse, invalidMessage, state.input]);

  const loadUrl = useCallback((input: string) => {
    const parsed = parse(input);
    if (!parsed) {
      setUrlError(invalidMessage);
      return;
    }
    setUrlError(null);
    const next = { input, target: parsed };
    setState(next);
    persist(key, next);
  }, [key, parse, invalidMessage]);

  const clear = useCallback(() => {
    setState({ input: '', target: null });
    setUrlError(null);
    persist(key, { input: '', target: null });
  }, [key]);

  return { input: state.input, target: state.target, urlError, setInput, load, loadUrl, clear };
}
