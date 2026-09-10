import { useEffect, useRef } from 'react';

interface Props {
  value: string[];
  onChange: (bullets: string[]) => void;
  placeholder?: string;
}

// A lightweight bulleted-list editor: press Enter to start a new bullet,
// Backspace at the start of an (empty) bullet merges back into the
// previous one, and a long paragraph typed into one bullet just wraps
// normally — since the bullet marker sits in its own fixed-width column
// and the textarea fills the rest, wrapped lines land flush under the
// first line of text rather than under the bullet glyph itself.
export function BulletListEditor({ value, onChange, placeholder }: Props) {
  const bullets = value.length ? value : [''];
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusIndex = useRef<number | null>(null);

  const resize = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    refs.current.forEach(resize);
    if (focusIndex.current != null) {
      const el = refs.current[focusIndex.current];
      if (el) { el.focus(); el.setSelectionRange(0, 0); }
      focusIndex.current = null;
    }
  }, [bullets.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const setBullet = (idx: number, text: string) => {
    const next = [...bullets];
    next[idx] = text;
    onChange(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    const el = e.currentTarget;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const before = el.value.slice(0, el.selectionStart);
      const after = el.value.slice(el.selectionStart);
      const next = [...bullets];
      next[idx] = before;
      next.splice(idx + 1, 0, after);
      focusIndex.current = idx + 1;
      onChange(next);
    } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0 && idx > 0) {
      e.preventDefault();
      const next = [...bullets];
      const merged = next[idx - 1] + next[idx];
      next.splice(idx - 1, 2, merged);
      focusIndex.current = idx - 1;
      onChange(next);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-2.5 space-y-1">
      {bullets.map((b, idx) => (
        <div key={idx} className="flex items-start gap-2">
          <span className="text-gray-400 text-sm leading-6 select-none w-3 flex-shrink-0 text-center">•</span>
          <textarea
            ref={(el) => { refs.current[idx] = el; resize(el); }}
            value={b}
            onChange={(e) => { setBullet(idx, e.target.value); resize(e.target); }}
            onKeyDown={(e) => onKeyDown(e, idx)}
            placeholder={idx === 0 ? placeholder : ''}
            rows={1}
            className="flex-1 resize-none overflow-hidden text-sm leading-6 outline-none bg-transparent"
          />
        </div>
      ))}
    </div>
  );
}
