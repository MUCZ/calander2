import { forwardRef, useEffect, useState } from 'react';
import type { CalendarCategory, Occurrence } from '../lib/types';
import { formatShortDate, formatWeekdayShort } from '../lib/time';
import { occurrenceTimeText } from './eventLabel';
import { Close, Search } from './Icons';

interface SearchBoxProps {
  query: string;
  results: Occurrence[];
  calendars: Map<string, CalendarCategory>;
  onQuery: (q: string) => void;
  onPick: (occ: Occurrence) => void;
  compact: boolean;
  onCollapse?: () => void;
}

export const SearchBox = forwardRef<HTMLInputElement, SearchBoxProps>(function SearchBox(
  { query, results, calendars, onQuery, onPick, compact, onCollapse },
  ref,
) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [query]);
  const showList = open && query.trim().length > 0;

  const pick = (occ: Occurrence) => {
    onPick(occ);
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      if (results[active]) {
        e.preventDefault();
        pick(results[active]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (query) onQuery('');
      else {
        (e.target as HTMLInputElement).blur();
        onCollapse?.();
      }
      setOpen(false);
    }
  };

  return (
    <div className={`search ${compact ? 'is-compact' : ''}`}>
      <Search className="search-icon" width={16} height={16} />
      <input
        ref={ref}
        type="search"
        role="combobox"
        aria-label="Search events"
        aria-expanded={showList}
        aria-controls="search-results"
        aria-autocomplete="list"
        aria-activedescendant={showList && results[active] ? `sr-${active}` : undefined}
        placeholder="Search events"
        value={query}
        onChange={(e) => {
          onQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
      />
      {query && (
        <button type="button" className="search-clear" onClick={() => onQuery('')} aria-label="Clear search">
          <Close width={14} height={14} />
        </button>
      )}
      {showList && (
        <div className="search-pop">
          <div className="search-pop-head">
            {results.length ? `${results.length}${results.length >= 40 ? '+' : ''} matching occurrence${results.length === 1 ? '' : 's'}` : 'No matching events'}
          </div>
          <ul id="search-results" role="listbox" aria-label="Search results">
            {results.map((occ, i) => {
              const cal = calendars.get(occ.event.calendarId);
              return (
                <li
                  key={occ.key}
                  id={`sr-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`search-item ${i === active ? 'is-active' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(occ)}
                  style={{ ['--c' as string]: cal?.color }}
                >
                  <span className="search-date">
                    <span>{formatWeekdayShort(occ.start)}</span>
                    <strong>{formatShortDate(occ.start)}</strong>
                  </span>
                  <span className="dot" aria-hidden="true" />
                  <span className="search-main">
                    <span className="search-title">{occ.event.title}</span>
                    <span className="search-meta">
                      {occurrenceTimeText(occ)}
                      {occ.event.location ? ` · ${occ.event.location}` : ''}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
});
