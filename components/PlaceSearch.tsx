'use client';

import { useId, useMemo, useState } from 'react';
import { latLonOf, searchPlaces, type Result } from '@/lib/search';
import { districtAt } from '@/lib/uk-districts';

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Offline place search (towns, cities, counties, council areas, postcode districts) as an ARIA combobox: type, arrow keys, Enter; Escape closes. */
export default function PlaceSearch({ onChoose }: { onChoose: (r: Result) => void }) {
  const id = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => searchPlaces(q).map((r) => ({ ...r, where: r.detail ?? (r.kind === 'county' ? undefined : districtAt(latLonOf(r).lat, latLonOf(r).lon)?.name) })), [q]);
  const shown = open && results.length > 0;
  const listId = `${id}-list`, opt = (i: number) => `${id}-opt-${i}`;

  function choose(r: Result) {
    setQ(r.name);
    setOpen(false);
    onChoose(r);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : results.length - 1)) % results.length);
    } else if (e.key === 'Enter' && shown) {
      e.preventDefault();
      choose(results[active]);
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); setOpen(false); }
      else setQ('');
    }
  }

  return (
    <div className="relative flex flex-col gap-1">
      <label htmlFor={`${id}-q`} className="font-bold">Find a place <span className="font-normal text-muted">(town, city, county or postcode district)</span></label>
      <input id={`${id}-q`} role="combobox" aria-expanded={shown} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={shown ? opt(active) : undefined}
        type="text" value={q} autoComplete="off" spellCheck={false} enterKeyHint="search" placeholder="Kendal" className="field w-full"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onKeyDown={onKeyDown} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} />
      <ul id={listId} role="listbox" aria-label="Matching places" hidden={!shown}
        className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-auto rounded-control bg-surface shadow-md ring-1 ring-edge">
        {shown && results.map((r, i) => (
          <li key={r.id} id={opt(i)} role="option" aria-selected={i === active}
            className="group flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1 aria-selected:bg-fg aria-selected:text-bg"
            onMouseDown={(e) => e.preventDefault()} onClick={() => choose(r)} onMouseMove={() => setActive(i)}>
            <span className="font-bold">{r.name}</span>
            <span className="text-sm text-muted group-aria-selected:text-bg">{cap(r.kind)}{r.where ? `, ${r.where}` : ''}</span>
          </li>
        ))}
      </ul>
      <p role="status" className="sr-only">{open && q.trim().length >= 2 ? (results.length ? `${results.length} places found. Use the arrow keys, then Enter.` : 'No places found.') : ''}</p>
      {open && q.trim().length >= 2 && !results.length && <p className="text-sm text-muted">No place found. Try a nearby town or a postcode district like SE1.</p>}
    </div>
  );
}
