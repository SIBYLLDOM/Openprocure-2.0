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
  'TR','TD','TH','DT','DD','FIGURE','FIGCAPTION','DETAILS','SUMMARY',
]);

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
  const textRuns  = [];
  const paragraphs = [];

  const root = document.createElement('div');
  root.innerHTML = html || ' ';

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
    body:          { dataStream, textRuns, paragraphs },
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

  const result    = [];
  let   paraStart = 0;

  for (let i = 0; i <= dataStream.length; i++) {
    const ch = dataStream[i];
    if (ch === '\r' || ch === '\n' || i === dataStream.length) {
      const text  = dataStream.slice(paraStart, i);
      const style = paraStyleAt.get(i);
      const tag   = HEADING_TAG[style?.namedStyleType] || 'p';

      // Build alignment attribute if non-default
      const cssAlign = ALIGN_TO_CSS[style?.horizontalAlign];
      const alignAttr = cssAlign ? ` style="text-align:${cssAlign}"` : '';

      // Group consecutive chars with same formatting into runs
      let inner = '';
      let j = 0;
      while (j < text.length) {
        const fmt = fmtAt.get(paraStart + j) || {};
        let end   = j + 1;
        while (end < text.length) {
          const nfmt = fmtAt.get(paraStart + end) || {};
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

      if (inner.trim()) result.push(`<${tag}${alignAttr}>${inner}</${tag}>`);
      paraStart = i + 1;
    }
  }

  return result.join('\n') || '<p></p>';
}
