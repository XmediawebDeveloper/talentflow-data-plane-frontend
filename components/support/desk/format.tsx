/* Support desk — the light formatting the reply toolbar
   inserts (**bold**, _italic_, [text](https://…), "- " bullets, "1. "
   numbered lines), rendered as React nodes. Same rules as the old Support
   Center: no HTML is injected; only http(s) links
   become anchors. */

import type { ReactNode } from 'react';

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|(?<![A-Za-z0-9])_[^_\s][^_]*_(?![A-Za-z0-9])|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith('**')) {
      nodes.push(<strong key={key} className="font-semibold">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('_')) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(token);
      nodes.push(link
        ? <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">{link[1]}</a>
        : token);
    }
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function FormattedMessage({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*-\s+/, ''));
      blocks.push(<ul key={`b${i}`} className="ml-5 list-disc space-y-0.5">{items.map((it, j) => <li key={j}>{renderInline(it, `u${i}-${j}`)}</li>)}</ul>);
    } else if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      blocks.push(<ol key={`b${i}`} className="ml-5 list-decimal space-y-0.5">{items.map((it, j) => <li key={j}>{renderInline(it, `o${i}-${j}`)}</li>)}</ol>);
    } else {
      blocks.push(line.trim() === ''
        ? <div key={`b${i}`} className="h-2" />
        : <p key={`b${i}`} className="whitespace-pre-wrap break-words">{renderInline(line, `p${i}`)}</p>);
      i++;
    }
  }
  return <div className="space-y-1">{blocks}</div>;
}
