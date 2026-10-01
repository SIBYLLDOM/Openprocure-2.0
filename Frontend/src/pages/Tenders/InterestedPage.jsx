// src/pages/Tenders/InterestedPage.jsx
//
// Real "Interested" listing — previously this page was 100% mock/dummy data
// with no backend connection at all. Rebuilt to reuse the exact same
// TenderRow/TenderStatusModal/TenderSkeleton components as the main Tenders
// page (imported straight from there), so a row here looks and behaves
// identically to a row on the Tenders page — same actions, same status
// modal, same heart toggle.
//
// The heart (interested) flag lives on the tender itself (gem_tenders /
// open_tender_details), not per-user — so once ANYONE marks a tender
// interested, it shows up here for every other user. The backend additionally
// relaxes the usual GEM/Open source scoping for this view specifically (pass
// interested=true): a Tender Admin assigned only Endo-GEM still sees an
// Endo-Open tender someone else marked interested, matching "the whole Endo
// team should see it, not just the half of it I'm personally assigned to".
// Division scoping (Endo vs Diagno) still applies as normal.

import React, { useState, useEffect, useRef } from 'react';
import '../../assets/css/TendersPage.css';
import { TenderRow, TenderStatusModal, TenderSkeleton } from './TendersPage';

export default function InterestedPage() {
  const [tenderType, setTenderType] = useState(
    () => sessionStorage.getItem('interested_tenderType') || 'GEM'
  );
  const [searchKeyword, setSearchKeyword] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortOrder, setSortOrder] = useState('endDateLatest');
  const [tenders, setTenders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedTender, setSelectedTender] = useState(null);

  const requestIdRef = useRef(0);

  useEffect(() => {
    sessionStorage.setItem('interested_tenderType', tenderType);
  }, [tenderType]);

  // Debounce search input.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchKeyword), 300);
    return () => clearTimeout(timer);
  }, [searchKeyword]);

  useEffect(() => {
    let cancelled = false;
    const requestId = ++requestIdRef.current;

    const fetchInterested = async () => {
      setLoading(true);
      try {
        const token = localStorage.getItem('token');
        const params = new URLSearchParams({
          page: 1,
          limit: 10000,
          sort: sortOrder,
          archived: 'false',
          search: debouncedSearch,
          tenderType,
          interested: 'true',
        });

        const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/tenders?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (cancelled || requestId !== requestIdRef.current) return;

        const mapped = (data.data || []).map(t => ({
          T_ID: t.T_ID,
          refNo: t.ref_no || null,
          organisationChain: t.organisation_chain || null,
          organisationName: t.organisationName || null,
          officeName: t.officeName || null,
          title: t.title,
          department: t.department,
          startDate: t.startDate || t.start_date,
          endDate: t.end_date,
          qty: Number(t.qty) || 0,
          value: Number(t.value) || 0,
          interested: !!t.interested,
          interestedByName: t.interestedByName || null,
          detail_url: t.detail_url,
          location: '—',
          state: '—',
          emd: Number(t.emd) || 0,
          estimatedBidValue: Number(t.estimatedBidValue) || 0,
          status: 'Closed',
          Representation_json: t.Representation_json,
          Corrigendum_json: t.Corrigendum_json,
          isScheduleBased: false,
          keyword: t.keyword || null,
          isOpenTender: tenderType === 'Open',
        }));

        setTenders(mapped);
        setTotalCount(typeof data.total === 'number' ? data.total : mapped.length);
      } catch (err) {
        if (!cancelled) console.error('Failed to fetch interested tenders', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchInterested();
    return () => { cancelled = true; };
  }, [tenderType, debouncedSearch, sortOrder]);

  const sortedTenders = React.useMemo(() => {
    return [...tenders].sort((a, b) => (sortOrder === 'asc' ? a.value - b.value : b.value - a.value));
  }, [tenders, sortOrder]);

  const navigateToDetail = (url) => {
    try { window.location.assign(new URL(url).pathname); } catch { window.location.assign(url); }
  };

  const handleAction = (action, tender) => {
    if (action === 'download') {
      if (tender.detail_url) navigateToDetail(tender.detail_url);
      else alert('Detail URL not available');
      return;
    }
    if (action === 'status') {
      setSelectedTender(tender);
      setShowStatusModal(true);
    }
  };

  // Unlike the main Tenders page (which just flips the flag in place), this
  // page's whole point is "tenders I/we marked interested" — so un-hearting
  // one here removes it from the list immediately, not just visually toggles it.
  const handleToggleInterest = async (tid) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/tenders/${tid.replace(/\//g, '_')}/interest`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        if (data.data.is_interested === 1) {
          setTenders(prev => prev.map(t => (t.T_ID === tid ? { ...t, interested: true } : t)));
        } else {
          setTenders(prev => prev.filter(t => t.T_ID !== tid));
          setTotalCount(c => Math.max(0, c - 1));
        }
      } else {
        alert(data.message || 'Failed to update interest status');
      }
    } catch (err) {
      console.error('Failed to toggle interest', err);
      alert('Failed to update interest status. Please try again.');
    }
  };

  const handleMarkNotRelevant = (tid) => {
    setTenders(prev => prev.filter(t => t.T_ID !== tid));
  };

  return (
    <div className="archive-page">
      <header className="archive-page-header">
        <h1>Interested Tenders</h1>
      </header>

      <div className="archive-search-filter-section">
        <div className="archive-search-bar-container">
          <div className="tender-type-pills" style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            <button
              className={`tender-type-pill ${tenderType === 'GEM' ? 'active gem' : ''}`}
              onClick={() => { setTenderType('GEM'); setTenders([]); setLoading(true); }}
            >
              GEM
            </button>
            <button
              className={`tender-type-pill ${tenderType === 'Open' ? 'active open' : ''}`}
              onClick={() => { setTenderType('Open'); setTenders([]); setLoading(true); }}
            >
              Open
            </button>
          </div>

          <div className="archive-search-input-wrapper">
            <svg className="archive-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder={tenderType === 'Open' ? 'Search interested open tenders…' : 'Search interested GEM tenders…'}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              className="archive-main-search-input"
            />
          </div>
        </div>
      </div>

      <div className="archive-sort-section">
        <div className="archive-results-count">
          {totalCount} interested {tenderType} tender{totalCount === 1 ? '' : 's'} found
        </div>
        <div className="archive-sort-controls">
          <label htmlFor="interested-sort-select">Sort By:</label>
          <select id="interested-sort-select" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} className="archive-sort-select">
            <option value="endDateLatest">Bid End Date - Latest First</option>
            <option value="endDateOldest">Bid End Date - Oldest First</option>
            <option value="startDateLatest">Bid Start Date - Latest First</option>
            <option value="startDateOldest">Bid Start Date - Oldest First</option>
          </select>
        </div>
      </div>

      <div className="tenders-list-compact">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <TenderSkeleton key={i} />)
          : sortedTenders.map((tender, index) => (
              <TenderRow
                key={tender.T_ID}
                tender={tender}
                serialNumber={index + 1}
                onAction={handleAction}
                onToggleInterest={handleToggleInterest}
                onMarkNotRelevant={handleMarkNotRelevant}
              />
            ))}
      </div>

      {sortedTenders.length === 0 && !loading && (
        <div className="archive-no-results">
          No interested {tenderType} tenders yet — click the heart on any tender to add it here.
        </div>
      )}

      {showStatusModal && selectedTender && (
        <TenderStatusModal
          tender={selectedTender}
          onClose={() => { setShowStatusModal(false); setSelectedTender(null); }}
        />
      )}
    </div>
  );
}
