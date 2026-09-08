import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Search, Plus } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  label?: string;
  className?: string;
  // When true, typing a value with no exact match offers a "+ Add …" row
  // that selects it directly — for freeform fields (e.g. Work Location)
  // backed only by whatever values already exist on other records, not a
  // fixed master list, so the dropdown must still let a brand-new one in.
  allowCreate?: boolean;
}

// A native <select> can't have a search box, and its open direction is
// entirely up to the browser — inside a scrolling modal it'll happily pop
// upward and cover the header once there isn't room below. This renders its
// own list (always anchored below the trigger) with a filter box, so a long
// catalog (e.g. 38+ products) stays typeable instead of scroll-hunted.
export function SearchableSelect({ options, value, onChange, placeholder = 'Select…', searchPlaceholder = 'Search…', label, className = '', allowCreate = false }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (open) searchInputRef.current?.focus();
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const filtered = search.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  const select = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch('');
  };

  const trimmedSearch = search.trim();
  const showCreateRow = allowCreate && trimmedSearch.length > 0 &&
    !options.some((o) => o.label.toLowerCase() === trimmedSearch.toLowerCase());

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && <label className="label">{label}</label>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="input flex items-center justify-between text-left w-full"
      >
        <span className={`truncate ${selected || value ? 'text-gray-700' : 'text-gray-400'}`}>{selected ? selected.label : value || placeholder}</span>
        <ChevronDown size={15} className="text-gray-400 flex-shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg flex flex-col max-h-72">
          <div className="p-2 border-b border-gray-100 flex-shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="overflow-y-auto">
            {filtered.length === 0 && !showCreateRow && (
              <p className="px-3 py-4 text-sm text-gray-400 text-center">No matches</p>
            )}
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => select(o.value)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${o.value === value ? 'bg-primary-50 text-primary-700 font-medium' : 'text-gray-700'}`}
              >
                {o.label}
              </button>
            ))}
            {showCreateRow && (
              <button
                type="button"
                onClick={() => select(trimmedSearch)}
                className="w-full text-left px-3 py-2 text-sm text-primary-600 hover:bg-primary-50 flex items-center gap-1.5 border-t border-gray-100"
              >
                <Plus size={13} /> Add “{trimmedSearch}”
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
