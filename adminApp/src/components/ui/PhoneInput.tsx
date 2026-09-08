import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { COUNTRIES, flagEmoji } from '../../data/geo';

interface PhoneInputProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  wrapperClassName?: string;
}

const DEFAULT_DIAL = '+91';
const BY_DIAL_LENGTH_DESC = [...COUNTRIES].sort((a, b) => b.dialCode.length - a.dialCode.length);

// Splits a stored "+91 9876543210" value into { dialCode, number }. Falls
// back to +91 (India) for a blank/unrecognized value — this ERP's partner
// base is overwhelmingly India-based, so that's the sane default rather
// than a placeholder-less blank flag.
const parseValue = (value: string) => {
  const match = BY_DIAL_LENGTH_DESC.find((c) => value.startsWith(c.dialCode));
  return match ? { dialCode: match.dialCode, number: value.slice(match.dialCode.length).trim() } : { dialCode: DEFAULT_DIAL, number: value.trim() };
};

// A phone field with a country-code picker attached — selecting a country
// (e.g. India) fills in its dial code prefix (+91) automatically instead of
// making the partner type it, and switching country later rewrites just the
// prefix without touching the digits already entered.
export function PhoneInput({ label, value, onChange, onBlur, placeholder = 'XXXXX XXXXX', wrapperClassName = '' }: PhoneInputProps) {
  const { dialCode, number } = useMemo(() => parseValue(value || ''), [value]);
  const country = COUNTRIES.find((c) => c.dialCode === dialCode) || COUNTRIES[0];

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);

  const filtered = search.trim()
    ? COUNTRIES.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()) || c.dialCode.includes(search.trim()))
    : COUNTRIES;

  const selectCountry = (dial: string) => {
    onChange(`${dial}${number ? ` ${number}` : ''}`);
    setOpen(false);
    setSearch('');
  };

  const setNumber = (num: string) => onChange(`${dialCode}${num ? ` ${num}` : ''}`);

  return (
    <div className={wrapperClassName}>
      {label && <label className="label">{label}</label>}
      <div className="flex gap-1.5" ref={containerRef}>
        <div className="relative flex-shrink-0">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="input !w-[4.75rem] flex items-center justify-between gap-1 !px-2"
            title={country.name}
          >
            <span className="text-sm truncate">{flagEmoji(country.code)} {dialCode}</span>
            <ChevronDown size={12} className="text-gray-400 flex-shrink-0" />
          </button>

          {open && (
            <div className="absolute left-0 top-full mt-1 z-50 w-64 bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col max-h-72">
              <div className="p-2 border-b border-gray-100 flex-shrink-0">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search country or code…"
                    className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="overflow-y-auto">
                {filtered.length === 0 && <p className="px-3 py-4 text-sm text-gray-400 text-center">No matches</p>}
                {filtered.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => selectCountry(c.dialCode)}
                    className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-gray-50 ${c.dialCode === dialCode ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'}`}
                  >
                    <span className="truncate">{flagEmoji(c.code)} {c.name}</span>
                    <span className="text-gray-400 flex-shrink-0">{c.dialCode}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <input
          className="input flex-1"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
        />
      </div>
    </div>
  );
}
