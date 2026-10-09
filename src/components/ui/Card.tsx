import type { ReactNode } from 'react';
import { cx } from '../../lib/classNames';

export function Card({
  children,
  className,
  as: Tag = 'section',
}: {
  children: ReactNode;
  className?: string;
  as?: 'section' | 'div' | 'article';
}) {
  return <Tag className={cx('card p-5 sm:p-6', className)}>{children}</Tag>;
}

export function CardTitle({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
        {children}
      </h2>
      {hint ? <span className="text-xs muted">{hint}</span> : null}
    </div>
  );
}
