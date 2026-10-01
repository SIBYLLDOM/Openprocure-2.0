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
  onExportDocx,
  onExportPdf,
  onSaveDraft,
  isSaving    = false,
  isExporting = false,
}, ref) {
  // wrapRef is the React-managed div. Univer gets its own imperatively-created child div
  // so Univer's React root is never part of React's reconciliation tree — this avoids
  // the "synchronously unmount a root while rendering" error from Univer's dispose().
  const wrapRef  = useRef(null);
  const univerRef = useRef(null);
  const docRef    = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Give Univer its own isolated div so React never tries to reconcile inside it
    const container = document.createElement('div');
    container.style.cssText = 'width:100%;height:100%;';
    wrap.innerHTML = ''; // clear any leftover (handles React Strict Mode double-invoke)
    wrap.appendChild(container);

    const univer = new Univer({
      theme:   defaultTheme,
      locale:  LocaleType.EN_US,
      locales: { [LocaleType.EN_US]: enUS },
    });

    univer.registerPlugin(UniverRenderEnginePlugin);
    univer.registerPlugin(UniverUIPlugin, { container });
    univer.registerPlugin(UniverDocsPlugin);
    univer.registerPlugin(UniverDocsUIPlugin);

    const docData = htmlToDocData(content);
    const doc     = univer.createUnit(UniverInstanceType.UNIVER_DOC, docData);

    univerRef.current = univer;
    docRef.current    = doc;

    return () => {
      // Defer disposal so Univer's internal React root unmount never runs
      // synchronously during React's own render cycle (avoids the race-condition warning).
      const u = univer;
      const c = container;
      setTimeout(() => {
        try { u.dispose(); } catch { /* ignore */ }
        try { c.remove(); }  catch { /* ignore */ }
      }, 0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-only; content is captured synchronously at mount

  const getHtml = useCallback(() => {
    const doc = docRef.current;
    if (!doc) return '';
    try { return docDataToHtml(doc.getSnapshot()); } catch { return ''; }
  }, []);

  // Expose getHtml to parent via ref
  useImperativeHandle(ref, () => ({ getHtml }), [getHtml]);

  const handleSave = () => {
    const html = getHtml();
    onChange?.(html);
    onSaveDraft?.();
  };

  const handleExportDocx = () => {
    const html = getHtml();
    onChange?.(html);
    onExportDocx?.(html);
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
        <button onClick={handleExportDocx}   disabled={isExporting} style={BTN('#059669')}>{isExporting ? 'Exporting…' : 'Export DOCX'  }</button>
        <button onClick={handleExportPdf}    disabled={isExporting} style={BTN('#7c3aed')}>Download PDF</button>
        <button onClick={handleCopyText}                            style={BTN('#374151')}>Copy Text</button>
      </div>
    </div>
  );
});

export default UniverDocumentEditor;
