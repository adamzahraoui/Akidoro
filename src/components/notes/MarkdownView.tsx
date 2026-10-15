import React from 'react';

function escapeText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderInline(text: string): React.ReactNode[] {
  const pieces: React.ReactNode[] = [];
  let remaining = text;
  // Bold/italic. Process bold (**text**) and italic (*text*).
  const token = /(\*\*[^.*]+?\*\*|\*[^.*]+?\*)/;
  while (remaining) {
    const m = remaining.match(token);
    if (!m || m.index === undefined || m.index < 0) {
      pieces.push(<span key={pieces.length}>{remaining}</span>);
      break;
    }
    const before = remaining.slice(0, m.index);
    if (before) pieces.push(<span key={pieces.length}>{before}</span>);
    const raw = m[0];
    const inner = raw.replace(/^\*\*|\*\*$|^\*|\*$/g, '');
    if (raw.startsWith('**')) pieces.push(<strong key={pieces.length}>{inner}</strong>);
    else pieces.push(<em key={pieces.length}>{inner}</em>);
    remaining = remaining.slice(m.index + raw.length);
  }
  return pieces;
}

export function MarkdownView({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let listBuffer: { type: 'ul' | 'ol' | 'task'; items: string[] } | null = null;
  let codeBuffer: string[] | null = null;

  const flushList = () => {
    if (!listBuffer) return;
    const { type, items } = listBuffer;
    const node =
      type === 'task' ? (
        <ul className="my-2 list-none pl-1" key={elements.length}>
          {items.map((item, i) => (
            <li key={i} className="text-sm">
              <input type="checkbox" className="mr-2" readOnly checked={item.startsWith('[x]')} />
              {renderInline(item.replace(/^\[[ x]\] ?/i, ''))}
            </li>
          ))}
        </ul>
      ) : type === 'ul' ? (
        <ul className="my-2 list-disc pl-5 text-sm" key={elements.length}>
          {items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ul>
      ) : (
        <ol className="my-2 list-decimal pl-5 text-sm" key={elements.length}>
          {items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ol>
      );
    elements.push(node);
    listBuffer = null;
  };

  const flushCode = () => {
    if (!codeBuffer) return;
    elements.push(
      <pre key={elements.length} className="my-3 overflow-x-auto rounded-xl border subtle-border bg-surface-light p-3 text-xs dark:bg-surface-dark">
        <code>{escapeText(codeBuffer.join('\n'))}</code>
      </pre>,
    );
    codeBuffer = null;
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      flushList();
      if (codeBuffer) {
        flushCode();
      } else {
        codeBuffer = [];
      }
      continue;
    }
    if (codeBuffer) {
      codeBuffer.push(line);
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const cls = level === 1 ? 'text-xl font-semibold' : level === 2 ? 'text-lg font-semibold' : 'text-base font-semibold';
      elements.push(<h3 key={elements.length} className={`${cls} mt-3`}>{renderInline(heading[2])}</h3>);
      continue;
    }
    const taskMatch = line.match(/^[-*]\s+\[( |x)\]\s*(.*)$/i);
    if (taskMatch) {
      if (listBuffer?.type !== 'task') {
        flushList();
        listBuffer = { type: 'task', items: [] };
      }
      const checked = taskMatch[1].toLowerCase() === 'x' ? '[x]' : '[ ]';
      listBuffer.items.push(`${checked} ${taskMatch[2]}`.trim());
      continue;
    }
    const ulMatch = line.match(/^[-*]\s+(.*)$/);
    if (ulMatch) {
      if (listBuffer?.type !== 'ul') {
        flushList();
        listBuffer = { type: 'ul', items: [] };
      }
      listBuffer.items.push(ulMatch[1]);
      continue;
    }
    const olMatch = line.match(/^\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listBuffer?.type !== 'ol') {
        flushList();
        listBuffer = { type: 'ol', items: [] };
      }
      listBuffer.items.push(olMatch[1]);
      continue;
    }
    if (line.trim() === '') {
      flushList();
      continue;
    }
    flushList();
    elements.push(<p key={elements.length} className="my-2 text-sm leading-relaxed">{renderInline(line)}</p>);
  }
  flushList();
  flushCode();
  return <div>{elements}</div>;
}
