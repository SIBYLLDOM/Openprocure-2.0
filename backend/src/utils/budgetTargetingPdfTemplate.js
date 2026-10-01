'use strict';
// Ported from targeting-system/server/src/pdfTemplate.js (ESM -> CommonJS,
// otherwise unchanged) — builds the raw HTML for a sales-target letter plus
// one business-breakdown table page per division the person belongs to.

const MONTH_LABELS = ['Apr-26', 'May-26', 'Jun-26', 'Jul-26', 'Aug-26', 'Sep-26', 'Oct-26', 'Nov-26', 'Dec-26', 'Jan-27', 'Feb-27', 'Mar-27'];
const QUARTERS = [
  { label: 'Q1', range: [0, 1, 2] },
  { label: 'Q2', range: [3, 4, 5] },
  { label: 'Q3', range: [6, 7, 8] },
  { label: 'Q4', range: [9, 10, 11] },
];

function fmt(n) {
  if (!n) return '-';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function rowValues(cellMonths) {
  const q = [0, 0, 0, 0];
  for (let i = 0; i < 12; i++) q[Math.floor(i / 3)] += cellMonths[i];
  const h1 = q[0] + q[1];
  const h2 = q[2] + q[3];
  return { months: cellMonths, q, h1, h2, total: h1 + h2 };
}

function renderTable(groupOrder, groups, categoryOrder) {
  let bodyRows = '';
  let grand = { months: new Array(12).fill(0) };

  for (const groupName of groupOrder) {
    const group = groups[groupName];
    if (!group) continue;
    // Respect the source workbook's own pivot row order when given (see
    // budgetTargetingExcelParser.js) — only categories present in this group
    // are kept, in their relative order from that global list. Falls back to
    // alphabetical for a workbook the order-parser couldn't read.
    const catNames = categoryOrder
      ? categoryOrder.filter((c) => group.categories[c])
      : Object.keys(group.categories).sort();
    let groupTotal = new Array(12).fill(0);
    catNames.forEach((cat, i) => {
      const cell = group.categories[cat];
      const rv = rowValues(cell.months);
      // A real rowspan merge (like Excel's own merged pivot cells) rather than
      // writing the label only into the first row and leaving the rest blank —
      // that left it pinned to the top of the block instead of centered in it.
      const businessCell = i === 0
        ? `<td class="rowlabel businesscell" rowspan="${catNames.length}">${groupName}</td>`
        : '';
      bodyRows += `<tr>${businessCell}<td class="rowlabel">${cat}</td>${renderRowCells(rv)}</tr>`;
      for (let m = 0; m < 12; m++) {
        groupTotal[m] += cell.months[m];
        grand.months[m] += cell.months[m];
      }
    });
    const gv = rowValues(groupTotal);
    bodyRows += `<tr class="total-row"><td class="rowlabel" colspan="2">${groupName} Total</td>${renderRowCells(gv)}</tr>`;
  }

  const grandTotal = rowValues(grand.months);
  bodyRows += `<tr class="grand-row"><td class="rowlabel" colspan="2">Total</td>${renderRowCells(grandTotal)}</tr>`;

  return { bodyRows, grandTotalValue: grandTotal.total };
}

function renderRowCells(rv) {
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += `<td class="num">${fmt(rv.months[i])}</td>`;
    if (i % 3 === 2) {
      out += `<td class="num subtotal">${fmt(rv.q[Math.floor(i / 3)])}</td>`;
      if (i === 5) out += `<td class="num subtotal">${fmt(rv.h1)}</td>`;
      if (i === 11) out += `<td class="num subtotal">${fmt(rv.h2)}</td>`;
    }
  }
  out += `<td class="num annual-col">${fmt(rv.total)}</td>`;
  return out;
}

const monthHeaderRow = () => {
  let out = '';
  for (let q = 0; q < 4; q++) {
    for (const mi of QUARTERS[q].range) out += `<th>${MONTH_LABELS[mi]}</th>`;
    out += `<th class="subtotal">${QUARTERS[q].label}</th>`;
    if (q === 1) out += `<th class="subtotal">H1</th>`;
    if (q === 3) out += `<th class="subtotal">H2</th>`;
  }
  out += `<th class="annual-col">Ann (Rs. L)</th>`;
  return out;
};

function renderLetterHtml(person, meta) {
  const fy = meta.fyLabel;
  // The subject line spells out the full 4-digit year ("F.Y. 2026-27"); every
  // other mention in the body uses the short form ("FY 26-27") — matches the
  // client's reference letter exactly, inconsistency and all.
  const fyBody = meta.fyShort || fy;
  const dateStr = meta.dateStr;

  return `
  <section class="page letter-page">
    <img class="letter-logo" src="${meta.logoDataUri}" alt="Meril" />
    <div class="letter-body">
      <p class="date">Date: - ${dateStr}</p>
      <p class="subject"><u>Subject: Sales Target F.Y. ${fy}</u></p>
      <p>Dear ${person.displayName},</p>
      <p>As we embark on a new fiscal year, Meril is happy to share company's strategic vision and goals for FY ${fyBody}. This year, we embrace the theme "विस्तार", symbolizing growth, innovation, and the relentless pursuit of excellence.</p>
      <p>Meril's theme, "विस्तार", reflects commitment to expanding horizons-whether it is entering new markets, reaching more customers, or enhancing our service offerings. This year, we aim to set benchmarks that not only challenge our capabilities but also redefine what we can achieve as a team.</p>
      <p>Your target for FY ${fyBody} has been carefully designed to align with our collective goals and vision of expansion. The details are as follows:</p>
      <p class="bullet-head">Key Focus Areas:</p>
      <ol class="focus-list">
        <li>Maintain existing accounts and increase existing share to 75% from those accounts ("विस्तार" - existing account business share)</li>
        <li>Converting Non-User Accounts into Active Customers ensuring 100% coverage. ("विस्तार" - new account market share)</li>
        <li>Faster supplies and prompt services through District Master Distributor. ("विस्तार" - enhanced distribution network)</li>
        <li>Give direction, guide and monitor your team ("विस्तार" - reach through Manpower)</li>
      </ol>
      <p>Your contribution will be pivotal in making "विस्तार" a reality. Together, let us work towards not only achieving but surpassing our targets. We are confident that with your dedication and our collective efforts, we will make FY ${fyBody} a landmark year in our journey.</p>
      <p>If you have any questions or require assistance in planning your strategy, please feel free to reach out. Looking forward to a year of remarkable achievements!</p>
    </div>
    <div class="signatures">
      <div class="sig"><img class="sign-img" src="${meta.anjulSignUri}" alt="" /><div class="sig-line"></div>Anjul Jain<br><span class="sig-title">(Business Head)</span></div>
      <div class="sig"><div class="sign-img"></div><div class="sig-line"></div>&nbsp;<br><span class="sig-title">(Zonal Head)</span></div>
      <div class="sig"><img class="sign-img" src="${meta.shailSignUri}" alt="" /><div class="sig-line"></div>Shail Singh Solanki<br><span class="sig-title">(Sr. General Manager FP&amp;A)</span></div>
      <div class="sig"><img class="sign-img" src="${meta.anandSignUri}" alt="" /><div class="sig-line"></div>Anand Gaur<br><span class="sig-title">(HR - Vice President Business)</span></div>
    </div>
  </section>`;
}

function renderBusinessTableHtml({ id, title, divisionLabel, nameLabel, personName, target, rsm, zonalHead, groupOrder, groups, categoryOrder, footerRoles, businessLabel, categoryLabel, logoDataUri, businessHeadSignUri }) {
  const { bodyRows } = renderTable(groupOrder, groups, categoryOrder);
  return `
  <section class="page table-page" id="${id}">
    <div class="frame">
      <div class="badge"><img class="badge-logo" src="${logoDataUri}" alt="Meril" /><div class="badge-division">${divisionLabel}</div></div>
      <div class="table-title">${title}</div>
      <table class="meta-table">
        <tr><td class="meta-label">${nameLabel}</td><td class="meta-value">${personName}</td></tr>
        <tr><td class="meta-label">Target :</td><td class="meta-value">₹ ${fmt(target)} L</td></tr>
        <tr><td class="meta-label">RSM :</td><td class="meta-value">${rsm || '-'}</td></tr>
        <tr><td class="meta-label">Zonal Head :</td><td class="meta-value">${zonalHead || '-'}</td></tr>
      </table>
      <table class="data-table">
        <thead>
          <tr>
            <th class="grouphead" rowspan="2">${businessLabel}</th>
            <th class="grouphead" rowspan="2">${categoryLabel}</th>
            ${monthHeaderRow()}
          </tr>
        </thead>
        <tbody>
          ${bodyRows}
        </tbody>
      </table>
      <div class="signatures small">
        ${footerRoles.map((r) =>
          r === 'Business Head'
            ? `<div class="sig"><div class="sign-slot"><img class="sign-img-small" src="${businessHeadSignUri}" alt="" /></div><div class="sig-line"></div>${r}</div>`
            : `<div class="sig"><div class="sign-slot"></div><div class="sig-line"></div>${r}</div>`
        ).join('')}
      </div>
    </div>
  </section>`;
}

function wrapDocument(bodyHtml) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: A4 landscape; margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: "Calibri", Arial, sans-serif; font-size: 11px; color: #111; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }

  .letter-page { font-size: 12.5px; line-height: 1.5; }
  .letter-logo { height: 60px; margin-bottom: 16px; }
  .letter-body p { margin: 10px 0; text-align: justify; font-weight: bold; }
  .letter-body li { font-weight: bold; }
  .date { font-weight: bold; }
  .letter-body p.subject { text-align: center; font-weight: bold; }
  .bullet-head { font-weight: bold; margin-left: 20px; }
  .focus-list { margin: 4px 0 4px 50px; }
  .focus-list li { margin: 4px 0; }
  .signatures { display: flex; justify-content: space-between; margin-top: 30px; }
  .signatures.small { margin-top: 30px; font-size: 10px; }
  .sig { width: 24%; text-align: center; }
  .sign-img { display: block; height: 40px; margin: 0 auto; object-fit: contain; }
  .sig-line { border-top: 1px solid #333; margin-top: 4px; margin-bottom: 4px; }
  .sig-title { font-size: 10px; }

  .table-page { --tfs: 8px; font-size: var(--tfs); position: relative; padding: 6px; }
  /* The client's reference letter frames the whole table page in a single
     border box, with the Meril logo + division wordmark as a small badge
     in its top-right corner — replicate that exactly. */
  .frame { position: relative; border: 1.5px solid #000; padding: 10px 14px 14px; }
  .badge { position: absolute; top: 8px; right: 10px; width: 90px; border: 1px solid #9fb3d1; background: #eef3fb; text-align: center; padding: 3px 4px 4px; }
  .badge-logo { display: block; height: 18px; margin: 0 auto 2px; object-fit: contain; }
  .badge-division { font-size: 7px; color: #45577a; letter-spacing: 0.3px; }
  .table-title { text-align: center; font-size: 19px; font-weight: bold; font-family: Georgia, "Times New Roman", serif; color: #1b3a63; margin: 2px 0 10px; }
  .sign-slot { height: 30px; display: flex; align-items: flex-end; justify-content: center; }
  .sign-img-small { display: block; max-height: 30px; max-width: 100%; margin: 0 auto; object-fit: contain; }
  .meta-table { margin-bottom: 8px; border-collapse: collapse; }
  .meta-label { font-weight: bold; width: 95px; padding: 1px 4px; text-align: left; }
  .meta-value { padding: 1px 4px; font-weight: bold; text-align: left; }

  table.data-table { width: 100%; border-collapse: collapse; }
  table.data-table th, table.data-table td { border: 1px solid #666; padding: calc(var(--tfs) * 0.28) calc(var(--tfs) * 0.4); text-align: center; white-space: nowrap; }
  /* White header with black text for the month/quarter columns, matching the
     reference; only the two grouping-label columns get its yellow highlight. */
  table.data-table thead th { background: #1b3a63; color: #fff; font-size: var(--tfs); font-weight: bold; }
  td.rowlabel { text-align: left; }
  td.businesscell { vertical-align: middle; text-align: center; font-weight: bold; }
  tr.total-row td { background: #dce6f1; font-weight: bold; color: #111; }
  tr.grand-row td { background: #c3d4ea; font-weight: bold; color: #111; border-top: 2px solid #333; }
  td.num { text-align: right; }
  /* Every column keeps its own colour uniformly top to bottom — lavender for
     plain month cells, green for the Q/H subtotal columns, yellow for the
     Ann/Total column — with NO exceptions for Total/Grand Total rows or "-"
     (zero) values. !important because tr.total-row/tr.grand-row set their
     own row-wide background with higher specificity and would otherwise
     punch a hole in whichever of these columns crosses that row. */
  td.num:not(.subtotal):not(.annual-col) { background: #eeecf9 !important; }
  // Scoped to td (data rows) only, not th — the header row stays solid blue
  // with white text across every column, subtotal/annual ones included.
  td.subtotal { background: #e6f2e1 !important; }
  td.annual-col { background: #ffe699 !important; color: #111 !important; font-weight: bold; }
  th.annual-col { font-weight: bold; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

module.exports = { renderLetterHtml, renderBusinessTableHtml, wrapDocument };
