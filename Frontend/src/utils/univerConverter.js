/**
 * Bidirectional conversion between HTML strings and Univer IDocumentData format.
 *
 * Professional formatting applied automatically:
 *  - H1 → centered, 24pt bold black, 18pt space above / 10pt below
 *  - H2 → left, 16pt bold black, 14pt above / 6pt below
 *  - H3 → left, 14pt bold black, 10pt above / 4pt below
 *  - H4 → left, 13pt bold, 8pt above / 3pt below
 *  - P  → justified, 11pt, 6pt below
 *  - LI → left, 11pt, 20pt indent, 3pt below
 *  - BLOCKQUOTE → 30pt left indent, 8pt above/below
 *  - Inline text-align / align attribute on any element is respected
 */

// HorizontalAlign enum values (from @univerjs/core)
const ALIGN_LEFT    = 1;
const ALIGN_CENTER  = 2;
const ALIGN_RIGHT   = 3;
const ALIGN_JUSTIFY = 4;

const BLOCK_TAGS = new Set([
  'P','H1','H2','H3','H4','H5','H6',
  'LI','BLOCKQUOTE','PRE',
  'DIV','ARTICLE','SECTION','HEADER','FOOTER','MAIN','ASIDE','NAV',
  'TABLE','THEAD','TBODY','TFOOT','TR','TD','TH','DT','DD','FIGURE','FIGCAPTION','DETAILS','SUMMARY',
]);

// Univer's own document-body control characters (from @univerjs/core's
// DataStreamTreeTokenType) — a real table is a run of these markers
// embedded directly in the same dataStream as ordinary paragraphs, not a
// separate object tree. Values pulled from the compiled runtime, not the
// (differently-numbered) comment in Univer's own .d.ts source.
const TOK = {
  PARAGRAPH:        '\r',
  SECTION_BREAK:    '\n',
  TABLE_START:       '\x1A',
  TABLE_ROW_START:   '\x1B',
  TABLE_CELL_START:  '\x1C',
  TABLE_CELL_END:    '\x1D',
  TABLE_ROW_END:     '\x0E',
  TABLE_END:         '\x0F',
};

// A4 content width in the same units as documentStyle.pageSize below
// (793.7 wide, 90/72 side margins) — used to size table columns evenly.
const TABLE_CONTENT_WIDTH = 793.7 - 90 - 72;

// Per-heading: text-run overrides + paragraph spacing + alignment
const HEADING_CONFIG = {
  H1: { namedStyleType: 1, fs: 24, cl: '#1a1a1a', align: ALIGN_CENTER, spaceAbove: 18, spaceBelow: 10 },
  H2: { namedStyleType: 2, fs: 16, cl: '#1a1a1a', align: ALIGN_LEFT,   spaceAbove: 14, spaceBelow:  6 },
  H3: { namedStyleType: 3, fs: 14, cl: '#1a1a1a', align: ALIGN_LEFT,   spaceAbove: 10, spaceBelow:  4 },
  H4: { namedStyleType: 4, fs: 13, cl: '#2c2c2c', align: ALIGN_LEFT,   spaceAbove:  8, spaceBelow:  3 },
};

// Per-block paragraph style defaults (for non-heading blocks)
const BLOCK_PARA_STYLE = {
  P:          { horizontalAlign: ALIGN_JUSTIFY, spaceBelow: { v: 6  } },
  LI:         { horizontalAlign: ALIGN_LEFT,    spaceBelow: { v: 3  }, indentStart: { v: 28 } },
  BLOCKQUOTE: { horizontalAlign: ALIGN_LEFT,    spaceBelow: { v: 8  }, spaceAbove: { v: 8 }, indentStart: { v: 30 }, indentEnd: { v: 30 } },
  PRE:        { horizontalAlign: ALIGN_LEFT,    spaceBelow: { v: 6  } },
  TD:         { horizontalAlign: ALIGN_LEFT,    spaceBelow: { v: 3  } },
  TH:         { horizontalAlign: ALIGN_CENTER,  spaceBelow: { v: 3  } },
  DEFAULT:    { horizontalAlign: ALIGN_LEFT,    spaceBelow: { v: 4  } },
};

/** Read text-align from an element's inline style or align attribute. Returns null if not set. */
function getElementAlign(el) {
  const styleAlign = el.style?.textAlign?.toLowerCase?.() || '';
  const attrAlign  = (el.getAttribute?.('align') || '').toLowerCase();
  const val = styleAlign || attrAlign;
  if (val === 'center')  return ALIGN_CENTER;
  if (val === 'right')   return ALIGN_RIGHT;
  if (val === 'justify') return ALIGN_JUSTIFY;
  if (val === 'left')    return ALIGN_LEFT;
  return null;
}

// ─── htmlToDocData ──────────────────────────────────────────────────────────

export function htmlToDocData(html = '') {
  let dataStream = '';
  const textRuns     = [];
  const paragraphs   = [];
  const sectionBreaks = [];
  const tables        = [];
  const tableSource   = {};
  let tableCounter    = 0;

  const root = document.createElement('div');
  root.innerHTML = html || ' ';

  /** Depth-first TR collection through THEAD/TBODY/TFOOT (or bare TABLE > TR). */
  function collectTableRows(tableEl) {
    const rows = [];
    const visit = (el) => {
      for (const child of el.children) {
        if (child.tagName === 'TR') rows.push(child);
        else if (['THEAD', 'TBODY', 'TFOOT'].includes(child.tagName)) visit(child);
      }
    };
    visit(tableEl);
    return rows;
  }

  /**
   * Appends a real Univer table (not flattened text) — a table is a
   * TABLE_START…TABLE_END run of control characters in the SAME dataStream
   * as everything else, one TABLE_ROW_START/END per row and one
   * TABLE_CELL_START/END per cell; each cell's own text sits between its
   * start/end markers as an ordinary paragraph (its own \r + \n). The
   * `tableSource` entry alongside it only carries structural/style info
   * (row heights, column widths, margins) — the actual cell text lives in
   * this same stream, not in tableSource. This mirrors exactly what
   * Univer's own "insert table" command builds (genEmptyTable/genTableSource
   * in @univerjs/docs-ui), just filled with real content instead of blanks.
   */
  function appendTable(tableEl) {
    const trEls = collectTableRows(tableEl);
    if (!trEls.length) return;

    const rows = trEls.map(tr => Array.from(tr.children)
      .filter(c => c.tagName === 'TD' || c.tagName === 'TH')
      .map(c => {
        const segs = [];
        for (const child of c.childNodes) collectInline(child, false, false, false, segs);
        return {
          text:   segs.map(s => s.text).join('').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim(),
          header: c.tagName === 'TH',
        };
      }));
    const colCount = Math.max(0, ...rows.map(r => r.length));
    const rowCount = rows.length;
    if (!colCount || !rowCount) return;

    const tableId = `tbl${++tableCounter}-${Date.now().toString(36)}`;
    const tableStartIndex = dataStream.length;
    dataStream += TOK.TABLE_START;

    for (let r = 0; r < rowCount; r++) {
      dataStream += TOK.TABLE_ROW_START;
      for (let c = 0; c < colCount; c++) {
        const cell = rows[r][c] || { text: '', header: false };
        dataStream += TOK.TABLE_CELL_START;
        const textStart = dataStream.length;
        if (cell.text) dataStream += cell.text;
        const textEnd = dataStream.length;
        dataStream += TOK.PARAGRAPH;
        const paraIndex = dataStream.length - 1;
        dataStream += TOK.SECTION_BREAK;
        const sectionIndex = dataStream.length - 1;
        dataStream += TOK.TABLE_CELL_END;

        if (cell.text) {
          textRuns.push({
            st: textStart, ed: textEnd,
            ts: { ff: 'Times New Roman', fs: 11, bl: cell.header ? 1 : undefined },
          });
        }
        paragraphs.push({
          startIndex: paraIndex,
          paragraphStyle: {
            horizontalAlign: cell.header ? ALIGN_CENTER : ALIGN_LEFT,
            spaceAbove: { v: 3 }, spaceBelow: { v: 3 },
          },
        });
        sectionBreaks.push({ startIndex: sectionIndex });
      }
      dataStream += TOK.TABLE_ROW_END;
    }
    dataStream += TOK.TABLE_END;
    const tableEndIndex = dataStream.length;

    tables.push({ startIndex: tableStartIndex, endIndex: tableEndIndex, tableId });

    const colWidth = TABLE_CONTENT_WIDTH / colCount;
    tableSource[tableId] = {
      tableId,
      tableRows: rows.map(() => ({
        tableCells: new Array(colCount).fill(null).map(() => ({
          margin: { start: { v: 6 }, end: { v: 6 }, top: { v: 3 }, bottom: { v: 3 } },
        })),
        trHeight: { val: { v: 24 }, hRule: 0 },
      })),
      tableColumns: new Array(colCount).fill(null).map(() => ({
        size: { type: 1, width: { v: colWidth } },
      })),
      align: 0,
      indent: { v: 0 },
      textWrap: 0,
      position: {
        positionH: { relativeFrom: 0, posOffset: 0 },
        positionV: { relativeFrom: 0, posOffset: 0 },
      },
      dist: { distB: 0, distL: 0, distR: 0, distT: 0 },
      cellMargin: { start: { v: 6 }, end: { v: 6 }, top: { v: 3 }, bottom: { v: 3 } },
      size: { type: 0, width: { v: TABLE_CONTENT_WIDTH } },
    };
  }

  /** Collect inline segments (bold / italic / underline), skipping nested block elements. */
  function collectInline(node, b, i, u, out) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent;
      if (t) out.push({ text: t, b, i, u });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const tag = node.tagName.toUpperCase();
    if (tag === 'BR') { out.push({ text: ' ', b, i, u }); return; }
    if (BLOCK_TAGS.has(tag)) return;

    const fw = node.style?.fontWeight;
    const nb = b || tag === 'STRONG' || tag === 'B' || fw === 'bold' || fw === '700';
    const ni = i || tag === 'EM' || tag === 'I';
    const nu = u || tag === 'U';
    for (const child of node.childNodes) collectInline(child, nb, ni, nu, out);
  }

  /**
   * Flush one paragraph into dataStream / textRuns / paragraphs.
   * headingCfg  – HEADING_CONFIG entry or null
   * paraStyleOverride – explicit IParagraphStyle fields (alignment, indent, spacing)
   * elementAlign – text-align parsed from the HTML element itself
   */
  function flushParagraph(segments, headingCfg, paraStyleOverride, elementAlign) {
    let paraText = '';
    for (const seg of segments) paraText += seg.text.replace(/[\r\n]+/g, ' ');
    if (!paraText.trim()) return;

    const paraStart = dataStream.length;

    for (const seg of segments) {
      const t = seg.text.replace(/[\r\n]+/g, ' ');
      if (!t) continue;
      const st = dataStream.length;
      dataStream += t;
      const ed = dataStream.length;
      if (ed <= st) continue;

      const isBold   = seg.b || !!headingCfg;
      const isItalic = seg.i;
      const isUnder  = seg.u;
      const fs       = headingCfg?.fs;
      const cl       = headingCfg ? { rgb: headingCfg.cl } : undefined;

      textRuns.push({
        st, ed,
        ts: {
          ff: 'Times New Roman',
          bl: isBold   ? 1        : undefined,
          it: isItalic ? 1        : undefined,
          ul: isUnder  ? { s: 1 } : undefined,
          fs: fs       || undefined,
          cl: cl       || undefined,
        },
      });
    }

    // Trim trailing spaces
    while (dataStream.length > paraStart && dataStream[dataStream.length - 1] === ' ') {
      dataStream = dataStream.slice(0, -1);
    }
    if (dataStream.length === paraStart) return;

    dataStream += '\r';

    // Build paragraph style
    let pStyle = {};

    if (headingCfg) {
      pStyle.namedStyleType  = headingCfg.namedStyleType;
      pStyle.horizontalAlign = elementAlign ?? headingCfg.align;
      pStyle.spaceAbove      = { v: headingCfg.spaceAbove };
      pStyle.spaceBelow      = { v: headingCfg.spaceBelow };
    } else if (paraStyleOverride) {
      pStyle = {
        ...paraStyleOverride,
        horizontalAlign: elementAlign ?? paraStyleOverride.horizontalAlign,
      };
    } else {
      pStyle.horizontalAlign = elementAlign ?? ALIGN_LEFT;
      pStyle.spaceBelow      = { v: 4 };
    }

    // Strip undefined values
    pStyle = Object.fromEntries(Object.entries(pStyle).filter(([, v]) => v !== undefined && v !== null));

    paragraphs.push({
      startIndex:     dataStream.length - 1,
      paragraphStyle: Object.keys(pStyle).length ? pStyle : undefined,
    });
  }

  /** Walk the DOM, turning block elements into paragraphs. */
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent.trim();
      if (t) flushParagraph([{ text: t, b: false, i: false, u: false }], null, null, null);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName.toUpperCase();

    if (!BLOCK_TAGS.has(tag)) {
      // Inline-only element at root level
      const segs = [];
      collectInline(node, false, false, false, segs);
      flushParagraph(segs, null, null, getElementAlign(node));
      return;
    }

    // A real Univer table — see appendTable's own comment for how it's
    // represented. Handled wholesale here (not via the generic block-child
    // recursion below) since a table's rows/cells are consumed directly by
    // querying the DOM, not by walking each descendant individually.
    if (tag === 'TABLE') {
      appendTable(node);
      return;
    }

    const hasBlockChild = Array.from(node.childNodes).some(
      c => c.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(c.tagName.toUpperCase())
    );

    if (hasBlockChild) {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has(child.tagName.toUpperCase())) {
          walk(child);
        } else if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
          flushParagraph([{ text: child.textContent, b: false, i: false, u: false }], null, null, null);
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const segs = [];
          collectInline(child, false, false, false, segs);
          flushParagraph(segs, null, null, getElementAlign(child));
        }
      }
    } else {
      const headingCfg   = HEADING_CONFIG[tag] ?? null;
      const paraStyle    = headingCfg ? null : (BLOCK_PARA_STYLE[tag] ?? BLOCK_PARA_STYLE.DEFAULT);
      const elementAlign = getElementAlign(node);
      const segs = [];
      for (const child of node.childNodes) collectInline(child, false, false, false, segs);
      flushParagraph(segs, headingCfg, paraStyle, elementAlign);
    }
  }

  for (const child of root.childNodes) walk(child);

  if (paragraphs.length === 0) {
    dataStream = ' \r\n';
    paragraphs.push({ startIndex: 1 });
  } else if (!dataStream.endsWith('\n')) {
    dataStream += '\n';
  }

  return {
    id:            'doc-' + Date.now(),
    body:          { dataStream, textRuns, paragraphs, sectionBreaks, tables },
    tableSource,
    documentStyle: {
      pageSize:         { width: 793.7, height: 1122.5 },
      marginTop:        72,
      marginBottom:     72,
      marginLeft:       90,
      marginRight:      72,
      defaultTextStyle: { ff: 'Times New Roman', fs: 12 },
    },
  };
}

// ─── docDataToHtml ──────────────────────────────────────────────────────────

const ALIGN_TO_CSS = {
  [ALIGN_CENTER]:  'center',
  [ALIGN_RIGHT]:   'right',
  [ALIGN_JUSTIFY]: 'justify',
};

export function docDataToHtml(snapshot) {
  if (!snapshot?.body) return '';
  const { dataStream = '', textRuns = [], paragraphs = [] } = snapshot.body;
  const tables      = snapshot.body.tables || [];
  const tableSource = snapshot.tableSource || {};

  // Per-character formatting map
  const fmtAt = new Map();
  for (const run of textRuns) {
    for (let i = run.st; i < run.ed; i++) {
      fmtAt.set(i, {
        bold:      run.ts?.bl === 1,
        italic:    run.ts?.it === 1,
        underline: !!run.ts?.ul?.s,
      });
    }
  }

  const HEADING_TAG = { 1: 'h1', 2: 'h2', 3: 'h3', 4: 'h4' };
  const paraStyleAt = new Map(paragraphs.map(p => [p.startIndex, p.paragraphStyle]));

  /** Same per-character bold/italic/underline run-grouping used for ordinary paragraphs, reused for table-cell text. */
  function formatRun(text, baseOffset) {
    let inner = '';
    let j = 0;
    while (j < text.length) {
      const fmt = fmtAt.get(baseOffset + j) || {};
      let end   = j + 1;
      while (end < text.length) {
        const nfmt = fmtAt.get(baseOffset + end) || {};
        if (nfmt.bold !== fmt.bold || nfmt.italic !== fmt.italic || nfmt.underline !== fmt.underline) break;
        end++;
      }
      let chunk = text.slice(j, end)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (fmt.underline) chunk = `<u>${chunk}</u>`;
      if (fmt.italic)    chunk = `<em>${chunk}</em>`;
      if (fmt.bold)      chunk = `<strong>${chunk}</strong>`;
      inner += chunk;
      j = end;
    }
    return inner;
  }

  /** A table's cell text sits right after its nearest preceding TABLE_CELL_START (\x1C), up to the cell's own paragraph boundary (\r) — see appendTable in htmlToDocData for how these were laid down. */
  function cellHtml(paraStartIndex) {
    const cellStart = dataStream.lastIndexOf('\x1C', paraStartIndex);
    if (cellStart === -1) return '';
    return formatRun(dataStream.slice(cellStart + 1, paraStartIndex), cellStart + 1);
  }

  function tableToHtml(tableEntry) {
    const src = tableSource[tableEntry.tableId];
    const colCount = src?.tableColumns?.length || 0;
    const rowCount = src?.tableRows?.length || 0;
    if (!colCount || !rowCount) return '';
    const cellParas = paragraphs
      .filter(p => p.startIndex > tableEntry.startIndex && p.startIndex < tableEntry.endIndex)
      .sort((a, b) => a.startIndex - b.startIndex);

    let idx = 0;
    let html = '<table style="width:100%; border-collapse:collapse; border:1px solid #333;">';
    for (let r = 0; r < rowCount; r++) {
      html += '<tr>';
      for (let c = 0; c < colCount; c++) {
        const para = cellParas[idx++];
        const isHeader = para?.paragraphStyle?.horizontalAlign === ALIGN_CENTER
          && dataStream[dataStream.lastIndexOf('\x1C', para.startIndex) + 1] !== undefined
          && fmtAt.get(dataStream.lastIndexOf('\x1C', para.startIndex) + 1)?.bold;
        const tag  = isHeader ? 'th' : 'td';
        const text = para ? cellHtml(para.startIndex) : '';
        html += `<${tag} style="border:1px solid #333; padding:4px 6px;${isHeader ? ' text-align:center;' : ''}">${text || '&nbsp;'}</${tag}>`;
      }
      html += '</tr>';
    }
    html += '</table>';
    return html;
  }

  /** Ordinary (non-table) region of the dataStream, split on \r/\n paragraph boundaries — the original single-pass scan, now scoped to [from, to). */
  function scanParagraphs(from, to) {
    const out = [];
    let paraStart = from;
    for (let i = from; i <= to; i++) {
      const ch = dataStream[i];
      if (ch === '\r' || ch === '\n' || i === to) {
        const text  = dataStream.slice(paraStart, i);
        const style = paraStyleAt.get(i);
        const tag   = HEADING_TAG[style?.namedStyleType] || 'p';
        const cssAlign = ALIGN_TO_CSS[style?.horizontalAlign];
        const alignAttr = cssAlign ? ` style="text-align:${cssAlign}"` : '';
        const inner = formatRun(text, paraStart);
        if (inner.trim()) out.push(`<${tag}${alignAttr}>${inner}</${tag}>`);
        paraStart = i + 1;
      }
    }
    return out.join('\n');
  }

  const tablesSorted = [...tables].sort((a, b) => a.startIndex - b.startIndex);
  const result = [];
  let cursor = 0;
  for (const t of tablesSorted) {
    const seg = scanParagraphs(cursor, t.startIndex);
    if (seg) result.push(seg);
    const th = tableToHtml(t);
    if (th) result.push(th);
    cursor = t.endIndex;
  }
  const tail = scanParagraphs(cursor, dataStream.length);
  if (tail) result.push(tail);

  return result.join('\n') || '<p></p>';
}
