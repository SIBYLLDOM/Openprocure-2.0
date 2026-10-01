import { useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Univer, UniverInstanceType, LocaleType } from '@univerjs/core';
import { defaultTheme } from '@univerjs/themes';
import { UniverRenderEnginePlugin } from '@univerjs/engine-render';
import { UniverUIPlugin } from '@univerjs/ui';
import { UniverDocsPlugin } from '@univerjs/docs';
import { UniverDocsUIPlugin } from '@univerjs/docs-ui';
import enUS from '@univerjs/docs-ui/locale/en-US';
import { htmlToDocData, docDataToHtml } from '../../utils/univerConverter';

import '@univerjs/design/lib/index.css';
import '@univerjs/ui/lib/index.css';
import '@univerjs/docs-ui/lib/index.css';

const BTN = (bg) => ({
  padding: '6px 16px', background: bg, color: '#fff', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500, lineHeight: '1.4',
});

const UniverDocumentEditor = forwardRef(function UniverDocumentEditor({
  content,
  onChange,
  onExportPdf,
  onSaveDraft,
  isSaving    = false,
  isExporting = false,
}, ref) {
  // wrapRef is the React-managed div. Univer gets its own imperatively-created child div
  // so Univer's React root is never part of React's reconciliation tree — this avoids
  // the "synchronously unmount a root while rendering" error from Univer's dispose().
  const wrapRef      = useRef(null);
  const containerRef = useRef(null);
  const univerRef    = useRef(null);
  const docRef       = useRef(null);

  const getHtml = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return '';
    try { return docDataToHtml(doc.getSnapshot()); } catch { return ''; }
  }, []);

  // Builds a fresh Univer doc unit from HTML and swaps it in for whatever is
  // currently mounted — used both at initial mount and by the table-paste
  // handler below. Univer's low-level API here has no supported "splice a
  // fragment into the live document at the cursor" command, so a paste is
  // applied by rebuilding the WHOLE document's HTML (current content + the
  // pasted table appended at the end) through the same htmlToDocData used on
  // load — the same converter already proven to round-trip real tables
  // correctly via Save Draft / regenerate.
  const mountFromHtml = useCallback((html) => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    if (univerRef.current) {
      try { univerRef.current.dispose(); } catch { /* ignore */ }
      univerRef.current = null;
    }
    if (containerRef.current) {
      try { containerRef.current.remove(); } catch { /* ignore */ }
    }

    const container = document.createElement('div');
    container.style.cssText = 'width:100%;height:100%;';
    wrap.innerHTML = ''; // clear any leftover (handles React Strict Mode double-invoke)
    wrap.appendChild(container);
    containerRef.current = container;

    const univer = new Univer({
      theme:   defaultTheme,
      locale:  LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: enUS },
    });

    univer.registerPlugin(UniverRenderEnginePlugin);
    univer.registerPlugin(UniverUIPlugin, { container });
    univer.registerPlugin(UniverDocsPlugin);
    univer.registerPlugin(UniverDocsUIPlugin);

    const docData = htmlToDocData(html);
    const doc     = univer.createUnit(UniverInstanceType.UNIVER_DOC, docData);

    univerRef.current = univer;
    docRef.current     = doc;
  }, []);

  // Copying a table out of Word/Excel/a browser puts a real <table> on the
  // clipboard as text/html; a PDF viewer almost never does (a PDF has no
  // semantic table structure — copying it out yields plain text with tabs or
  // aligned spaces marking the columns). Either way Univer's own paste
  // handling doesn't reconstruct real rows/columns, so it lands as flattened
  // text. This intercepts the paste and, when a table can be recovered from
  // either source, rebuilds the document (current content + the recovered
  // table appended at the end) through htmlToDocData so it comes in as a
  // real table — matching what a freshly generated annexure's own tables
  // already look like. Nothing recoverable -> untouched, normal paste.
  //
  // IMPORTANT: this effect is declared BEFORE the mount effect below on
  // purpose — React runs effects in declaration order, and Univer's own
  // paste handling gets wired up as a side effect of mountFromHtml (which
  // registers its plugins). Registering our document-level capture listener
  // first, before that happens, wins the capture-phase race regardless of
  // which DOM node Univer itself listens on internally.
  useEffect(() => {
    /** Parses a tab- or aligned-space-delimited plain-text block into a grid, or null if it doesn't look tabular. */
    function gridFromPlainText(text) {
      const lines = text.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
      if (lines.length < 2) return null;
      const hasTabs = lines.some(l => l.includes('\t'));
      const rows = lines.map(l => (hasTabs ? l.split('\t') : l.split(/ {2,}/)).map(c => c.trim()));
      const colCount = Math.max(...rows.map(r => r.length));
      // Only treat as a table if it's genuinely multi-column and consistent —
      // a single stray double-space in normal prose shouldn't become a table.
      if (colCount < 2) return null;
      const consistentRows = rows.filter(r => r.length > 1).length;
      if (consistentRows < lines.length * 0.6) return null;
      return rows;
    }

    function gridToTableHtml(rows) {
      const colCount = Math.max(...rows.map(r => r.length));
      const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      let html = '<table>';
      for (const row of rows) {
        html += '<tr>';
        for (let c = 0; c < colCount; c++) html += `<td>${esc(row[c] || '')}</td>`;
        html += '</tr>';
      }
      html += '</table>';
      return html;
    }

    const onPaste = (e) => {
      const wrap = wrapRef.current;
      if (!wrap || !wrap.contains(e.target)) return; // not this editor instance

      let tableHtml = null;

      const html = e.clipboardData?.getData('text/html');
      if (html && /<table[\s>]/i.test(html)) {
        const parsed = document.createElement('div');
        parsed.innerHTML = html;
        const table = parsed.querySelector('table');
        if (table) tableHtml = table.outerHTML;
      }

      if (!tableHtml) {
        const text = e.clipboardData?.getData('text/plain') || '';
        const grid = gridFromPlainText(text);
        if (grid) tableHtml = gridToTableHtml(grid);
      }

      if (!tableHtml) return; // nothing tabular found — let Univer handle the paste normally

      e.preventDefault();
      e.stopImmediatePropagation();

      const currentHtml = getHtml();
      mountFromHtml(`${currentHtml}\n${tableHtml}`);
    };

    // Registered on `document` (not the editor's own div) in the CAPTURE
    // phase, and as early as possible on mount — Univer's own paste handling
    // is wired up when its plugins register (inside mountFromHtml, which
    // runs in a separate effect), so attaching here first, before that runs,
    // wins the capture-phase race regardless of which DOM node Univer itself
    // listens on internally.
    document.addEventListener('paste', onPaste, true);
    return () => document.removeEventListener('paste', onPaste, true);
  }, [getHtml, mountFromHtml]);

  useEffect(() => {
    mountFromHtml(content);
    return () => {
      // Defer disposal so Univer's internal React root unmount never runs
      // synchronously during React's own render cycle (avoids the race-condition warning).
      const u = univerRef.current;
      const c = containerRef.current;
      setTimeout(() => {
        try { u?.dispose(); } catch { /* ignore */ }
        try { c?.remove(); }  catch { /* ignore */ }
      }, 0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only; content is captured synchronously at mount

  // Expose getHtml to parent via ref
  useImperativeHandle(ref, () => ({ getHtml }), [getHtml]);

  const handleSave = () => {
    const html = getHtml();
    onChange?.(html);
    onSaveDraft?.();
  };

  const handleExportPdf = () => {
    const html = getHtml();
    onChange?.(html);
    onExportPdf?.(html);
  };

  const handleCopyText = () => {
    const text = wrapRef.current?.innerText || '';
    navigator.clipboard.writeText(text).catch(() => {});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 600 }}>
      {/* Univer renders its full UI (toolbar + canvas) into the imperatively-created child div */}
      <div
        ref={wrapRef}
        style={{ flex: 1, minHeight: 520, position: 'relative', overflow: 'hidden' }}
      />

      <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderTop: '1px solid #e5e7eb', background: '#f9fafb', flexWrap: 'wrap', alignItems: 'center' }}>
        <button onClick={handleSave}         disabled={isSaving}    style={BTN('#1d4ed8')}>{isSaving    ? 'Saving…'    : 'Save Draft'  }</button>
        <button onClick={handleExportPdf}    disabled={isExporting} style={BTN('#7c3aed')}>Download PDF</button>
        <button onClick={handleCopyText}                            style={BTN('#374151')}>Copy Text</button>
      </div>
    </div>
  );
});

export default UniverDocumentEditor;
