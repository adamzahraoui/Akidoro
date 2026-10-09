import { uid } from '../../lib/id';
import { Button } from '../ui/Button';

export function MusicUrlField({
  label,
  placeholder,
  example,
  value,
  onChange,
  onSubmit,
  error,
  externalHref,
  externalLabel,
}: {
  label: string;
  placeholder: string;
  example?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  error?: string | null;
  externalHref?: string;
  externalLabel?: string;
}) {
  const id = uid('music-url');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor={id} className="block text-xs font-medium uppercase tracking-wide muted">
        {label}
      </label>
      <div className="mt-1.5 flex gap-2">
        <input
          id={id}
          type="url"
          inputMode="url"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-message` : undefined}
          className="focus-ring min-w-0 flex-1 rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
        />
        <Button type="submit" size="sm">
          Load
        </Button>
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-3">
        {error ? (
          <p id={`${id}-message`} className="min-w-0 text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : example ? (
          <p className="min-w-0 truncate text-xs muted" title={`Example: ${example}`}>
            Example: <span className="font-mono">{example}</span>
          </p>
        ) : (
          <span />
        )}
        {externalHref ? (
          <a
            href={externalHref}
            target="_blank"
            rel="noreferrer"
            className="focus-ring shrink-0 rounded text-xs text-accent-700 underline-offset-2 hover:underline dark:text-accent-300"
          >
            {externalLabel ?? 'Open externally'}
          </a>
        ) : null}
      </div>
    </form>
  );
}
