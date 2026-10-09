import { useEffect, useState } from 'react';
import { uid } from '../../lib/id';

export function NumberField({
  label,
  value,
  onChange,
  min = 1,
  max = 600,
  suffix,
  description,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  description?: string;
}) {
  const id = uid('num');
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = (raw: string) => {
    setDraft(raw);
    if (raw.trim() === '') {
      setError('Required');
      return;
    }
    const num = Number(raw);
    if (!Number.isFinite(num) || !Number.isInteger(num)) {
      setError('Whole numbers only');
      return;
    }
    if (num < min || num > max) {
      setError(`Enter ${min}–${max}`);
      return;
    }
    setError(null);
    onChange(num);
  };

  return (
    <div className="py-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {description ? <p className="mt-0.5 text-xs muted">{description}</p> : null}
      <div className="mt-1.5 flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          value={draft}
          onChange={(e) => commit(e.target.value)}
          aria-invalid={error ? true : undefined}
          className={`focus-ring w-24 rounded-lg border bg-surface-light px-3 py-2 text-sm tabular-nums dark:bg-surface-dark ${
            error ? 'border-red-400 dark:border-red-700' : 'subtle-border'
          }`}
        />
        {suffix ? <span className="text-sm muted">{suffix}</span> : null}
      </div>
      {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : null}
    </div>
  );
}
