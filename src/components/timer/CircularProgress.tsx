import type { ReactNode } from 'react';

const VIEW = 300;

export function CircularProgress({
  remainingFraction,
  stroke = 12,
  children,
}: {
  remainingFraction: number;
  stroke?: number;
  children: ReactNode;
}) {
  const radius = (VIEW - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(1, Math.max(0, remainingFraction));
  const offset = circumference * (1 - fraction);

  return (
    <div className="relative aspect-square w-full max-w-[300px]">
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-stone-200 dark:stroke-stone-700"
        />
        <circle
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-accent-600 transition-[stroke-dashoffset] duration-500 ease-linear"
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center px-6">{children}</div>
    </div>
  );
}
