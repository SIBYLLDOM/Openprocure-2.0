import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface PageHeader {
  title: string;
  description?: string;
}

interface PageHeaderContextValue {
  header: PageHeader | null;
  setHeader: (header: PageHeader | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue | undefined>(undefined);

// Lets every dashboard page hand its title/description up to DashboardShell's
// header instead of rendering its own <h1> — one consistent header spot
// across every page rather than each page free-styling its own.
export const PageHeaderProvider = ({ children }: { children: ReactNode }) => {
  const [header, setHeader] = useState<PageHeader | null>(null);
  const value = useMemo(() => ({ header, setHeader }), [header]);
  return <PageHeaderContext.Provider value={value}>{children}</PageHeaderContext.Provider>;
};

export const usePageHeaderContext = () => {
  const ctx = useContext(PageHeaderContext);
  if (!ctx) throw new Error('usePageHeaderContext must be used within a PageHeaderProvider');
  return ctx;
};

// Called by a page to publish its title/description into the shell header.
// Clears on unmount so navigating away doesn't leave a stale title behind
// for the split-second before the next page's own effect fires.
export const usePageHeader = (title: string, description?: string) => {
  const { setHeader } = usePageHeaderContext();
  useEffect(() => {
    setHeader({ title, description });
    return () => setHeader(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description]);
};
