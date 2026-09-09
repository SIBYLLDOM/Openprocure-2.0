import { ChevronLeft, ChevronRight } from 'lucide-react';

export const PAGE_SIZE = 10;

export const paginate = <T,>(data: T[], page: number, pageSize: number = PAGE_SIZE): T[] => {
  const start = (page - 1) * pageSize;
  return data.slice(start, start + pageSize);
};

interface PaginationProps {
  page: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalItems, pageSize = PAGE_SIZE, onPageChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0 || pageCount <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(totalItems, page * pageSize);

  const goTo = (p: number) => onPageChange(Math.min(pageCount, Math.max(1, p)));

  // Compact window of page numbers around the current page.
  const windowSize = 5;
  let windowStart = Math.max(1, page - Math.floor(windowSize / 2));
  const windowEnd = Math.min(pageCount, windowStart + windowSize - 1);
  windowStart = Math.max(1, windowEnd - windowSize + 1);
  const pageNumbers = Array.from({ length: windowEnd - windowStart + 1 }, (_, i) => windowStart + i);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm">
      <span className="text-gray-500">
        Showing <span className="font-semibold text-gray-700">{start}–{end}</span> of{' '}
        <span className="font-semibold text-gray-700">{totalItems}</span>
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => goTo(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {windowStart > 1 && <span className="px-1 text-gray-300">…</span>}
        {pageNumbers.map((p) => (
          <button
            key={p}
            onClick={() => goTo(p)}
            className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-semibold transition-colors ${
              p === page ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {p}
          </button>
        ))}
        {windowEnd < pageCount && <span className="px-1 text-gray-300">…</span>}
        <button
          onClick={() => goTo(page + 1)}
          disabled={page === pageCount}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40 disabled:pointer-events-none"
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
