// src/components/common/SearchableSelect.jsx
// A dropdown with an inline search box for filtering long option lists.
// Renders its option list downward, below the trigger, and closes on outside click / Escape.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../../assets/css/SearchableSelect.css';

const SearchableSelect = ({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyLabel = 'No results',
  label,
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleOutside = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, query]);

  const handleSelect = (opt) => {
    onChange(opt);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div className="searchable-select" ref={rootRef}>
      <button
        type="button"
        className={`searchable-select-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span className={`searchable-select-value ${!value ? 'placeholder' : ''}`}>
          {value || placeholder}
        </span>
        <span className={`searchable-select-chevron ${open ? 'open' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="searchable-select-panel" role="listbox">
          <div className="searchable-select-search-wrap">
            <input
              ref={searchRef}
              type="text"
              className="searchable-select-search"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="searchable-select-options">
            {filtered.length === 0 && (
              <div className="searchable-select-empty">{emptyLabel}</div>
            )}
            {filtered.map((opt) => (
              <div
                key={opt}
                role="option"
                aria-selected={opt === value}
                className={`searchable-select-option ${opt === value ? 'selected' : ''}`}
                onClick={() => handleSelect(opt)}
              >
                {opt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
