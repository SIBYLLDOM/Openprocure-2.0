import React, { useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { TextAlign } from '@tiptap/extension-text-align';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableCell } from '@tiptap/extension-table-cell';

/* ── Toolbar button ─────────────────────────────────────────────────────── */
function TBtn({ active, disabled, onClick, title, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display:        'inline-flex',
        alignItems:     'center',
        justifyContent: 'center',
        width:          28,
        height:         28,
        border:         active ? '1.5px solid #2563eb' : '1px solid #d1d5db',
        borderRadius:   4,
        background:     active ? '#eff6ff' : '#fff',
        color:          active ? '#2563eb' : '#374151',
        cursor:         disabled ? 'not-allowed' : 'pointer',
        fontSize:       '0.8125rem',
        fontWeight:     600,
        opacity:        disabled ? 0.4 : 1,
        padding:        0,
      }}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span style={{ width: 1, height: 22, background: '#e5e7eb', display: 'inline-block', margin: '0 4px' }} />;
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function DocumentEditor({ content, onChange, onExportDocx, onExportPdf, onSaveDraft, isSaving, isExporting }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TextStyle,
      Color,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: content || '',
    onUpdate: ({ editor }) => onChange && onChange(editor.getHTML()),
  }, [content]);

  const insertTable = useCallback(() => {
    editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  if (!editor) return null;

  const e = editor;

  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden', background: '#fff' }}>

      {/* ── Toolbar ── */}
      <div style={{ borderBottom: '1px solid #e2e8f0', padding: '6px 10px', display: 'flex', flexWrap: 'wrap', gap: 4, background: '#f8fafc', alignItems: 'center' }}>

        {/* History */}
        <TBtn onClick={() => e.chain().focus().undo().run()} disabled={!e.can().undo()} title="Undo (Ctrl+Z)">↩</TBtn>
        <TBtn onClick={() => e.chain().focus().redo().run()} disabled={!e.can().redo()} title="Redo (Ctrl+Y)">↪</TBtn>
        <Sep />

        {/* Inline formatting */}
        <TBtn active={e.isActive('bold')}          onClick={() => e.chain().focus().toggleBold().run()}          title="Bold (Ctrl+B)"><b>B</b></TBtn>
        <TBtn active={e.isActive('italic')}        onClick={() => e.chain().focus().toggleItalic().run()}        title="Italic (Ctrl+I)"><i>I</i></TBtn>
        <TBtn active={e.isActive('underline')}     onClick={() => e.chain().focus().toggleUnderline().run()}     title="Underline (Ctrl+U)"><u>U</u></TBtn>
        <TBtn active={e.isActive('strike')}        onClick={() => e.chain().focus().toggleStrike().run()}        title="Strikethrough"><s>S</s></TBtn>
        <Sep />

        {/* Headings */}
        <TBtn active={e.isActive('heading', { level: 1 })} onClick={() => e.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">H1</TBtn>
        <TBtn active={e.isActive('heading', { level: 2 })} onClick={() => e.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">H2</TBtn>
        <TBtn active={e.isActive('heading', { level: 3 })} onClick={() => e.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">H3</TBtn>
        <TBtn active={e.isActive('paragraph')}             onClick={() => e.chain().focus().setParagraph().run()}               title="Normal text" style={{ fontSize: '0.75rem' }}>¶</TBtn>
        <Sep />

        {/* Alignment */}
        <TBtn active={e.isActive({ textAlign: 'left' })}    onClick={() => e.chain().focus().setTextAlign('left').run()}    title="Align Left">≡</TBtn>
        <TBtn active={e.isActive({ textAlign: 'center' })}  onClick={() => e.chain().focus().setTextAlign('center').run()}  title="Center">≡</TBtn>
        <TBtn active={e.isActive({ textAlign: 'right' })}   onClick={() => e.chain().focus().setTextAlign('right').run()}   title="Align Right">≡</TBtn>
        <TBtn active={e.isActive({ textAlign: 'justify' })} onClick={() => e.chain().focus().setTextAlign('justify').run()} title="Justify">≡</TBtn>
        <Sep />

        {/* Lists */}
        <TBtn active={e.isActive('bulletList')}  onClick={() => e.chain().focus().toggleBulletList().run()}  title="Bullet List">• ≡</TBtn>
        <TBtn active={e.isActive('orderedList')} onClick={() => e.chain().focus().toggleOrderedList().run()} title="Numbered List">1. ≡</TBtn>
        <Sep />

        {/* Blockquote & HR */}
        <TBtn active={e.isActive('blockquote')} onClick={() => e.chain().focus().toggleBlockquote().run()} title="Blockquote">"</TBtn>
        <TBtn onClick={() => e.chain().focus().setHorizontalRule().run()} title="Horizontal Rule">—</TBtn>
        <Sep />

        {/* Table */}
        <TBtn onClick={insertTable} title="Insert Table">⊞</TBtn>
        {e.isActive('table') && (
          <>
            <TBtn onClick={() => e.chain().focus().addColumnBefore().run()} title="Add column before">+←</TBtn>
            <TBtn onClick={() => e.chain().focus().addColumnAfter().run()}  title="Add column after">+→</TBtn>
            <TBtn onClick={() => e.chain().focus().addRowBefore().run()}    title="Add row before">+↑</TBtn>
            <TBtn onClick={() => e.chain().focus().addRowAfter().run()}     title="Add row after">+↓</TBtn>
            <TBtn onClick={() => e.chain().focus().deleteColumn().run()}    title="Delete column">✕col</TBtn>
            <TBtn onClick={() => e.chain().focus().deleteRow().run()}       title="Delete row">✕row</TBtn>
            <TBtn onClick={() => e.chain().focus().deleteTable().run()}     title="Delete table">✕tbl</TBtn>
          </>
        )}
        <Sep />

        {/* Text color */}
        <label title="Text Color" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer', fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>
          A
          <input
            type="color"
            defaultValue="#000000"
            onChange={ev => e.chain().focus().setColor(ev.target.value).run()}
            style={{ width: 18, height: 18, border: 'none', padding: 0, cursor: 'pointer', borderRadius: 3 }}
          />
        </label>
        <TBtn onClick={() => e.chain().focus().unsetColor().run()} title="Reset color">A↺</TBtn>
      </div>

      {/* ── Editor area ── */}
      <div style={{ padding: '1.25rem 1.5rem', minHeight: 500, background: '#fff' }}>
        <EditorContent editor={editor} />
      </div>

      {/* ── Footer actions ── */}
      <div style={{ borderTop: '1px solid #e2e8f0', padding: '0.75rem 1rem', background: '#f8fafc', display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {onSaveDraft && (
          <button
            onClick={onSaveDraft}
            disabled={isSaving}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 7, padding: '0.5rem 1rem', cursor: isSaving ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.875rem', opacity: isSaving ? 0.7 : 1 }}
          >
            {isSaving ? 'Saving…' : '💾 Save Draft'}
          </button>
        )}
        {onExportDocx && (
          <button
            onClick={() => onExportDocx(editor.getHTML())}
            disabled={isExporting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#166534', color: '#fff', border: 'none', borderRadius: 7, padding: '0.5rem 1rem', cursor: isExporting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.875rem', opacity: isExporting ? 0.7 : 1 }}
          >
            {isExporting ? 'Exporting…' : '📄 Export DOCX'}
          </button>
        )}
        {onExportPdf && (
          <button
            onClick={() => onExportPdf(editor.getHTML())}
            disabled={isExporting}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 7, padding: '0.5rem 1rem', cursor: isExporting ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.875rem', opacity: isExporting ? 0.7 : 1 }}
          >
            {isExporting ? 'Exporting…' : '🖨️ Download PDF'}
          </button>
        )}
        <button
          onClick={() => {
            const text = editor.getText();
            navigator.clipboard.writeText(text).then(() => alert('Copied to clipboard'));
          }}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: '#f1f5f9', color: '#374151', border: '1px solid #e2e8f0', borderRadius: 7, padding: '0.5rem 0.875rem', cursor: 'pointer', fontWeight: 500, fontSize: '0.875rem' }}
        >
          📋 Copy as Text
        </button>
        <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#94a3b8' }}>
          {editor.getText().trim().split(/\s+/).filter(Boolean).length} words
        </span>
      </div>

      {/* ── TipTap editor styles ── */}
      <style>{`
        .ProseMirror { outline: none; line-height: 1.8; color: #1f2937; font-size: 0.9375rem; }
        .ProseMirror h1 { font-size: 1.375rem; font-weight: 700; margin: 1rem 0 0.5rem; color: #111827; }
        .ProseMirror h2 { font-size: 1.125rem; font-weight: 700; margin: 0.875rem 0 0.4rem; color: #1f2937; }
        .ProseMirror h3 { font-size: 1rem;     font-weight: 600; margin: 0.75rem 0 0.35rem; color: #374151; }
        .ProseMirror p  { margin: 0 0 0.6rem; }
        .ProseMirror ul, .ProseMirror ol { padding-left: 1.5rem; margin: 0.5rem 0; }
        .ProseMirror li { margin-bottom: 0.25rem; }
        .ProseMirror blockquote { border-left: 3px solid #2563eb; margin: 0.75rem 0; padding: 0.5rem 1rem; color: #4b5563; background: #eff6ff; border-radius: 0 6px 6px 0; }
        .ProseMirror hr { border: none; border-top: 2px solid #e2e8f0; margin: 1rem 0; }
        .ProseMirror table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
        .ProseMirror th, .ProseMirror td { border: 1px solid #d1d5db; padding: 0.5rem 0.75rem; font-size: 0.875rem; }
        .ProseMirror th { background: #f1f5f9; font-weight: 600; text-align: left; }
        .ProseMirror td { background: #fff; }
        .ProseMirror .selectedCell:after { background: rgba(37,99,235,0.08); }
        .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: #9ca3af; pointer-events: none; }
      `}</style>
    </div>
  );
}
