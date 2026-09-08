# Finance & Accounting Module — Implementation Blueprint

## Enterprise ERP System — Module README

**Version:** 1.0
**Module Owner:** Finance & Accounting
**Consumer:** Frontend build agent (Antigravity)
**Stack:** React.js, React Router, CSS Modules / plain CSS files
**Status:** Blueprint for implementation — no backend, dummy data only
**Sibling Module:** Sales Module (already implemented — this module must integrate with it)

---

## 1. Purpose & Scope

The Finance & Accounting Module is the financial nerve center of the ERP system. It is responsible for General Ledger accounting, Accounts Payable, Accounts Receivable, Bank Reconciliation, Budgeting, Fixed Asset management, Taxation/GST, AI-driven Cash Flow Forecasting, Anomaly & Fraud Detection, and One-Click Compliance reporting.

This module must be built to the same architectural standard, visual quality, and documentation depth as the Sales Module. It is a standalone frontend build using React state and dummy data — no backend, no API calls, no database. All "future backend integration" notes describe how this frontend will later connect to real services, but nothing here should assume backend availability today.

The Finance Module is not an island. It shares customers, invoices, payments, and credit data with the Sales Module today, and is architected so Procurement, Inventory, Manufacturing, HR, Marketing, and User & Access Management modules can plug in later without rework. See **Section 12 — Module Integration** for the full data-flow contract.

---

## 2. Design Philosophy

Build this like a senior product designer at SAP S/4HANA, Oracle NetSuite, Microsoft Dynamics 365, Zoho Books/ERP, or Odoo Accounting would. Concretely, that means:

- **Corporate, premium, trustworthy** — finance software must feel precise and calm, not playful. Favor a restrained palette (deep navy/indigo primary, slate neutrals, a single accent color for calls-to-action, and semantic colors for status: green/amber/red).
- **Data density done well** — finance users work with tables and numbers all day. Tables must be information-dense but never cramped: generous row height, right-aligned numeric columns, tabular-number fonts, sticky headers, zebra striping optional but hover-row highlighting mandatory.
- **Glassmorphism used sparingly** — subtle frosted-glass panels on modals, KPI cards, and the top navigation bar (backdrop-filter blur + translucent background + soft border), never overused to the point of hurting readability.
- **Rounded, elevated cards** — 12–16px border radius, soft multi-layer shadows, 1px hairline borders in light neutral tones.
- **Professional typography** — a system font stack or a single clean sans-serif (e.g., Inter, "Segoe UI", system-ui) with a clear type scale (page titles 24–28px bold, section headers 18–20px semibold, body 14px, table text 13–14px, captions/labels 12px uppercase letter-spaced for eyebrow text).
- **Consistent motion** — 150–250ms ease-in-out transitions on hover, modal open/close, and toast entry/exit. No jarring animation.
- **Desktop-first, fully responsive** — designed first for 1440px+ desktop, then gracefully degraded to tablet (1024px) and mobile (375–428px) using CSS breakpoints, with sidebar collapsing to a hamburger drawer and tables converting to stacked cards below 768px.

---

## 3. Tech Stack & Constraints

- **React.js** (functional components + Hooks only: `useState`, `useEffect`, `useMemo`, `useReducer`, `useContext`)
- **React Router v6** for routing between Finance pages
- **CSS Modules or plain per-page CSS files** — one dedicated `.css` file per page/component, imported directly. No CSS-in-JS.
- **No Bootstrap. No Tailwind.** All styling is hand-authored CSS.
- **No backend, no real API calls.** All data is local dummy data seeded into React state (arrays of objects), manipulated purely client-side.
- **Charting library:** use a lightweight React charting library (e.g., Recharts) for line/bar/area/pie/donut charts. If no chart library is permitted in the target environment, build charts as SVG-based custom components — the README treats chart components as black boxes with defined props (see Section 8).
- **Icons:** use a consistent icon set (e.g., Lucide React or React Icons) throughout — no mixing icon families.
- **State management:** local component state + React Context for cross-page shared data (e.g., a `FinanceDataContext` that seeds and holds all Finance dummy datasets, similar in spirit to how the Sales Module holds its shared `SalesDataContext`). This is what allows Sales ↔ Finance integration to be simulated on the frontend (see Section 12).

---

## 4. Complete Folder Structure

```
src/
├── pages/
│   └── Finance/
│       ├── Dashboard.jsx
│       ├── GeneralLedger.jsx
│       ├── AccountsPayable.jsx
│       ├── AccountsReceivable.jsx
│       ├── BankReconciliation.jsx
│       ├── Budgeting.jsx
│       ├── FixedAssets.jsx
│       ├── TaxationGST.jsx
│       ├── CashFlowForecast.jsx
│       ├── FraudDetection.jsx
│       └── CompliancePack.jsx
│
├── components/
│   └── Finance/
│       ├── FinanceSidebar.jsx
│       ├── FinanceTopbar.jsx
│       ├── FinanceCards.jsx
│       ├── KpiCard.jsx
│       ├── FinanceTable.jsx
│       ├── SearchBar.jsx
│       ├── FilterBar.jsx
│       ├── DateRangeFilter.jsx
│       ├── StatusBadge.jsx
│       ├── Pagination.jsx
│       ├── ExportMenu.jsx
│       ├── ImportModal.jsx
│       ├── ConfirmDialog.jsx
│       ├── Toast.jsx
│       ├── ToastContainer.jsx
│       ├── SkeletonLoader.jsx
│       ├── EmptyState.jsx
│       ├── ErrorState.jsx
│       ├── LedgerModal.jsx
│       ├── InvoiceModal.jsx (Accounts Payable invoice detail/create)
│       ├── ReceivableModal.jsx (Accounts Receivable invoice detail)
│       ├── BudgetModal.jsx
│       ├── AssetModal.jsx
│       ├── ReconciliationMatchModal.jsx
│       ├── GSTReportModal.jsx
│       ├── AlertInvestigationModal.jsx
│       ├── CompliancePreviewModal.jsx
│       │
│       └── Charts/
│           ├── CashFlowChart.jsx
│           ├── ProfitLossChart.jsx
│           ├── BudgetChart.jsx
│           ├── RevenueExpenseTrendChart.jsx
│           ├── ForecastChart.jsx
│           ├── RiskScoreChart.jsx
│           ├── DepartmentBudgetChart.jsx
│           └── GstBreakdownChart.jsx
│
├── context/
│   └── FinanceDataContext.jsx   (seeds & exposes all Finance dummy data + shared Sales↔Finance bridge state)
│
├── data/
│   └── Finance/
│       ├── ledgerData.js
│       ├── payablesData.js
│       ├── receivablesData.js
│       ├── bankReconciliationData.js
│       ├── budgetData.js
│       ├── fixedAssetsData.js
│       ├── gstData.js
│       ├── cashFlowForecastData.js
│       ├── fraudAlertsData.js
│       └── complianceData.js
│
├── utils/
│   ├── formatCurrency.js   (INR formatting, ₹ symbol, Indian numbering: lakh/crore grouping)
│   ├── formatDate.js
│   ├── exportToCSV.js
│   ├── exportToPDF.js
│   ├── validators.js
│   └── financeHelpers.js  (variance %, utilization %, aging bucket calc, risk score calc)
│
├── css/
│   └── Finance/
│       ├── FinanceLayout.css   (sidebar, topbar, shared page shell)
│       ├── Dashboard.css
│       ├── GeneralLedger.css
│       ├── AccountsPayable.css
│       ├── AccountsReceivable.css
│       ├── BankReconciliation.css
│       ├── Budgeting.css
│       ├── FixedAssets.css
│       ├── TaxationGST.css
│       ├── CashFlowForecast.css
│       ├── FraudDetection.css
│       ├── CompliancePack.css
│       └── components/
│           ├── FinanceCards.css
│           ├── FinanceTable.css
│           ├── SearchBar.css
│           ├── FilterBar.css
│           ├── StatusBadge.css
│           ├── Pagination.css
│           ├── Modal.css
│           ├── Toast.css
│           ├── SkeletonLoader.css
│           └── EmptyErrorState.css
│
└── routes/
    └── FinanceRoutes.jsx
```

**Rule:** every page component imports exactly one page-level CSS file named identically to itself (e.g., `Dashboard.jsx` → `Dashboard.css`). Shared components import their own CSS file from `css/Finance/components/`. No inline styles except dynamic values that cannot be expressed in CSS (e.g., a computed progress-bar width or a chart color derived from data).

---

## 5. Routing

Mount all Finance pages under `/finance/*` using React Router, nested inside the ERP shell layout (which already exists from the Sales Module):

| Path | Component |
|---|---|
| `/finance` or `/finance/dashboard` | `Dashboard.jsx` |
| `/finance/general-ledger` | `GeneralLedger.jsx` |
| `/finance/accounts-payable` | `AccountsPayable.jsx` |
| `/finance/accounts-receivable` | `AccountsReceivable.jsx` |
| `/finance/bank-reconciliation` | `BankReconciliation.jsx` |
| `/finance/budgeting` | `Budgeting.jsx` |
| `/finance/fixed-assets` | `FixedAssets.jsx` |
| `/finance/taxation-gst` | `TaxationGST.jsx` |
| `/finance/cash-flow-forecast` | `CashFlowForecast.jsx` |
| `/finance/fraud-detection` | `FraudDetection.jsx` |
| `/finance/compliance-pack` | `CompliancePack.jsx` |

`FinanceRoutes.jsx` exports a `<Routes>` block to be mounted inside the ERP's main `AppRoutes`, next to the existing `SalesRoutes`.

---

## 6. Finance Sidebar

A dedicated `FinanceSidebar.jsx`, visually consistent with the Sales Module sidebar (same width, same collapse behavior, same active-link highlight style), listing:

1. Dashboard — icon: layout/grid
2. General Ledger — icon: book/ledger
3. Accounts Payable — icon: arrow-up-from-wallet / outgoing payment
4. Accounts Receivable — icon: arrow-down-to-wallet / incoming payment
5. Bank Reconciliation — icon: bank/landmark
6. Budgeting — icon: pie-chart
7. Fixed Assets — icon: building/box
8. Taxation / GST — icon: receipt/percent
9. AI Cash Flow Forecast — icon: trending-up + sparkle (denotes "AI")
10. Anomaly & Fraud Detection — icon: shield-alert
11. One-Click Compliance Pack — icon: file-check

Behavior:
- Active route is highlighted with accent-colored left border + tinted background + bold label.
- Sidebar collapses to icon-only rail on tablet, and to an off-canvas drawer (triggered by hamburger in `FinanceTopbar.jsx`) on mobile.
- Badge counters may appear next to "Accounts Payable" (overdue count), "Accounts Receivable" (overdue count), and "Anomaly & Fraud Detection" (open high-risk alert count), pulled from `FinanceDataContext`, updating live as dummy state changes (e.g., marking an invoice paid decrements the badge).
- A "Module Switcher" element at the top of the sidebar (shared shell component, already defined by the Sales Module) lets the user jump between Sales, Finance, and (future, disabled/greyed) Procurement, Inventory, HR, Manufacturing, Marketing modules.

---

## 7. Shared Component Contracts

Define these once, reuse everywhere, so every Finance page behaves consistently.

**`FinanceCards.jsx` / `KpiCard.jsx`** — props: `title`, `value`, `subtext`, `icon`, `trend` (`{direction: 'up'|'down'|'flat', percent: number}`), `variant` (`'default'|'success'|'warning'|'danger'`), `loading` (renders skeleton). Rounded glass-tinted card, large bold value, small trend chip (green up-arrow / red down-arrow), colored left accent bar per variant.

**`FinanceTable.jsx`** — generic data table taking `columns` (array of `{key, label, align, sortable, render?}`), `rows`, `onSort`, `sortConfig`, `emptyMessage`, `loading`. Features: sticky header (stays fixed on vertical scroll within the table container), sortable columns (click header toggles asc/desc/none with an arrow indicator), row hover highlight, right-aligned numeric/currency columns, zebra-optional striping, row click handler for opening detail modals, responsive collapse to stacked "card list" under 768px where each row becomes a mini card with label:value pairs.

**`SearchBar.jsx`** — controlled text input with a search icon, debounced `onChange` (300ms), clear (×) button when non-empty, placeholder customized per page (e.g., "Search invoices, vendors, invoice number…").

**`FilterBar.jsx`** — horizontal row of dropdown filters (status, category, department, date range, account, etc., page-specific), an "Apply"/instant-filter behavior, and a "Reset Filters" link. Collapses into an expandable "Filters" accordion panel on mobile.

**`DateRangeFilter.jsx`** — from/to date pickers plus quick presets (Today, Last 7 Days, This Month, Last Quarter, This Financial Year, Custom).

**`StatusBadge.jsx`** — pill-shaped badge, color-coded by status string via a shared status→color map:
- Paid / Matched / Reconciled / Compliant / Filed → green
- Pending / Partial / In Review / Unmatched → amber/yellow
- Overdue / Failed / High Risk / Non-Compliant → red
- Draft / Not Started → grey

**`Pagination.jsx`** — page-size selector (10/25/50), prev/next, numbered page buttons with ellipsis for long ranges, "Showing X–Y of Z records" label. All tables default to **10 rows per page**.

**`ExportMenu.jsx`** — dropdown button "Export ▾" with options "Export as CSV" and "Export as PDF" (and "Export as Excel" where specified per page, e.g., GST). Since there's no backend, export actually generates a client-side CSV Blob download and/or triggers a print-styled PDF view (`window.print()` on a formatted view), and shows a success toast.

**`ImportModal.jsx`** — used on pages that support import (e.g., bulk bank statement upload in Bank Reconciliation). Simulated: user "uploads" a file (accepts any file via `<input type="file">`), the modal shows a fake parsing progress bar, then injects a pre-baked set of dummy parsed rows into state and shows a success toast ("14 transactions imported").

**`ConfirmDialog.jsx`** — generic Yes/No confirmation modal used before destructive or state-changing actions (e.g., "Mark Invoice as Paid?", "Delete Asset?", "Reject Match?"). Props: `title`, `message`, `confirmLabel`, `danger` (boolean, renders red confirm button), `onConfirm`, `onCancel`.

**`Toast.jsx` / `ToastContainer.jsx`** — bottom-right stacked toast notifications for success (green), error (red), info (blue), warning (amber), auto-dismiss after 3.5s, manual dismiss ×. Triggered on every meaningful state change (save, delete, status change, export, import, match, error).

**`SkeletonLoader.jsx`** — shimmering placeholder blocks shown for ~600–900ms (simulated loading delay via `setTimeout`) whenever a page mounts or a filter/search is applied, before real content renders. Applies to KPI cards, tables, and charts.

**`EmptyState.jsx`** — centered icon + message + optional CTA button, shown when filtered/search results return zero rows (e.g., "No invoices match your filters" + "Reset Filters" button).

**`ErrorState.jsx`** — centered icon + message + "Retry" button, used to demonstrate error handling (can be manually triggered in dummy mode via a hidden dev toggle, or shown if a simulated async dummy fetch is made to "fail" ~2% of the time for realism, then recovers on retry).

**Charts (`Charts/` folder)** — each chart component takes a `data` prop (array of `{label, value}` or similar shaped objects per chart type) and `height`. Charts must have: legend, tooltips on hover, axis labels, responsive width (fill parent container), and use the shared Finance color palette (primary blue/indigo for actuals, teal/green for positive, amber for caution, red for negative/risk, grey for budget/planned lines).

---

## 8. Global Cross-Cutting Functionality (applies to every page)

- **Search** — client-side filter across relevant text fields, case-insensitive, debounced.
- **Filters** — client-side filter via `Array.prototype.filter` against React state; multiple filters combine with AND logic.
- **Sorting** — click-to-sort on sortable table columns, tri-state (asc → desc → none).
- **Pagination** — client-side slicing of the filtered/sorted array.
- **CRUD** — Create/Edit forms open in modals; Delete requires `ConfirmDialog`; all operations mutate local React state (via Context reducer actions) and show a toast.
- **Status changes** — status dropdown or action button changes a record's status in state (e.g., AP invoice "Mark as Paid" flips status Pending→Paid, updates linked KPI cards and sidebar badge counts instantly).
- **Validation** — all forms validate required fields, numeric fields (amount > 0), date logic (due date ≥ invoice date), and GSTIN format (15-character alphanumeric pattern) inline, with red helper text under invalid fields and a disabled submit button until valid.
- **Loading states** — every page shows skeleton loaders on initial mount and on filter/search changes (simulated latency).
- **Responsive behavior** — defined per breakpoint globally: `≥1440px` full multi-column layout; `1024–1439px` condensed grid (KPI cards wrap from 4-across to 2-across); `768–1023px` sidebar collapses to icon rail, tables scroll horizontally; `<768px` sidebar becomes drawer, tables convert to stacked card rows, filter bar becomes an accordion, KPI cards stack single-column.

---

## 9. Page-by-Page Specification

### 9.1 Dashboard (`Dashboard.jsx` / `Dashboard.css`)

**Purpose:** Single-glance financial command center — the CFO/finance manager's home screen.

**Layout (top to bottom):**

1. **Page header** — "Finance Dashboard", subtitle "Financial Year 2026–27", a date-range selector (top right), and a "Quick Actions" button cluster.
2. **KPI Card Row (top strip, 4–6 cards):** Cash Balance, Outstanding Receivables, Outstanding Payables, Monthly Profit, Total Revenue (MTD), Total Expense (MTD) — each a `KpiCard` with trend arrow vs. previous month.
3. **Cash Flow Snapshot panel** — `CashFlowChart` (area/line chart, inflow vs outflow over last 6 months) plus a mini summary (Net Cash Flow this month, Opening Balance, Closing Balance).
4. **Revenue Trend & Expense Trend** — side-by-side dual charts (`RevenueExpenseTrendChart`), 12-month trailing view, toggle between Monthly/Quarterly.
5. **Profit & Loss Summary card** — condensed P&L: Revenue, COGS, Gross Profit, Operating Expenses, Net Profit, Net Margin %, rendered as a compact statement list plus a small `ProfitLossChart` (bar: Revenue vs Expense vs Profit per month).
6. **Budget vs Actual widget** — `BudgetChart` (grouped bar per top 5 departments: Budget vs Actual), with a "View Full Budgeting" link.
7. **Two-column split:**
   - Left — **Top Expenses** (ranked list/table: category, amount, % of total, small horizontal bar per row).
   - Right — **Pending Payments** (top 5 AP items nearing due date) and **Pending Collections** (top 5 AR items overdue/nearing due), each a mini-table with "View All →" linking to AP/AR pages.
8. **Recent Transactions** — mini `FinanceTable` (last 8 GL transactions: date, description, account, amount, status), "View General Ledger →" link.
9. **Notifications panel** — feed of system notices (e.g., "Invoice INV-2031 is overdue by 5 days", "Budget for Marketing dept at 92% utilization", "3 new fraud alerts flagged"), each dismissible, with severity icon.
10. **Quick Actions panel** — buttons: "Create Manual Journal Entry", "Record Vendor Payment", "Record Customer Payment", "Generate GST Report", "Run Compliance Pack" — each opens the relevant modal or navigates to the relevant page.
11. **Recent Activities / Audit Feed** — timeline list of latest user actions across Finance (e.g., "Priya Sharma marked INV-2031 as Paid — 2 hours ago", "Rohit Verma reconciled HDFC Bank statement — Yesterday"), reused pattern from Sales Module's activity feed for visual consistency.

**Dummy Data:** seed 6 months of revenue/expense trend numbers, 10 recent GL transactions, 5 pending payments, 5 pending collections, 6 notifications, 8 activity feed entries — all using realistic INR values and Indian company/vendor/customer names (see Section 11).

**Future Backend Integration:** all KPI values, charts, and feeds are computed client-side from dummy arrays today; in production these become GraphQL/REST aggregation endpoints (e.g., `GET /api/finance/dashboard/summary`) refreshed on an interval or via websocket push, and the Notifications panel becomes a real event stream shared with the ERP-wide notification center.

---

### 9.2 General Ledger (`GeneralLedger.jsx` / `GeneralLedger.css`)

**Purpose:** System of record for every debit/credit journal entry across the company — the foundation all other Finance reports roll up from.

**Columns:** Transaction ID, Date, Account, Debit, Credit, Reference, Description, Voucher Number, Created By, Status (Posted / Draft / Reversed).

**UI Layout:**
- KPI strip: Total Debits (period), Total Credits (period), Net Balance, Number of Entries.
- `SearchBar` — search by Transaction ID, Account, Reference, Description.
- `FilterBar` — Date Filter (range + presets), Account Filter (dropdown of GL accounts: Cash, Bank, Sales Revenue, Purchase Expense, GST Payable, etc.), Voucher Filter (Journal/Payment/Receipt/Contra), Status Filter.
- `ExportMenu` — Export CSV, Print (opens print-formatted ledger view).
- "+ New Journal Entry" button opens `LedgerModal` — form fields: Date, Account (dropdown), Debit amount, Credit amount (mutually exclusive with inline validation that Debits = Credits across a multi-line entry), Reference, Description, Voucher Number (auto-generated, editable), attachment placeholder. On submit, entry is appended to state as "Draft" or "Posted" depending on a toggle, with a confirmation toast.
- `FinanceTable` — sortable by Date, Amount; sticky header; row click opens a read-only `LedgerModal` detail view showing full entry + linked source (e.g., "Auto-generated from Invoice INV-2031" when applicable — this is the visible hook into Sales↔Finance integration, see Section 12).
- `Pagination` — 10 per page.

**Dummy Data:** 10 realistic entries mixing manual journal entries and auto-posted entries from Sales invoices/payments (e.g., "Auto-posted: Sales Invoice INV-2031 – Bharat Textiles Pvt Ltd"), using Indian company names, INR amounts, voucher numbers like `JV-2026-0041`, `PV-2026-0117`, `RV-2026-0089`.

**Future Backend Integration:** `POST /api/finance/ledger/entries`, double-entry validation server-side, immutable posted-entry audit trail, auto-posting triggered by Sales/Procurement/Payroll events via message queue (see Section 12).

---

### 9.3 Accounts Payable (`AccountsPayable.jsx` / `AccountsPayable.css`)

**Purpose:** Track and manage everything the company owes vendors.

**Columns:** Vendor, Invoice Number, Purchase Order, Invoice Date, Due Date, Amount, Payment Terms, Payment Status.

**Payment Status values:** Pending, Paid, Overdue, Partial — via `StatusBadge`.

**UI Layout:**
- KPI strip: Total Payable, Overdue Amount, Due This Week, Vendors with Open Balance.
- `SearchBar` (vendor, invoice number, PO number) + `FilterBar` (Payment Status, Payment Terms, Due Date range, Vendor dropdown).
- `FinanceTable`, sortable, row click opens `InvoiceModal` with tabs: **Details** (all columns + notes), **Vendor Details** (vendor name, GSTIN, contact, address, bank details — dummy), **Payment History** (mini-table of past partial/full payments against this invoice: date, amount, mode, reference).
- Row actions: "Record Payment" (opens payment form: amount, date, mode [NEFT/RTGS/UPI/Cheque], reference — supports partial payment, auto-recalculates remaining balance and flips status to Partial or Paid), "Mark Overdue" auto-computed (not manual) based on due date vs. today, "View PO".
- `ExportMenu` (CSV/PDF).
- "+ New Bill" button → form to add a new AP invoice (Vendor dropdown, Invoice #, PO # optional, dates, amount, terms).

**Dummy Data:** 8 vendor invoices from Indian vendors (e.g., Shree Balaji Steel Traders, Om Sai Logistics, Reliable Office Supplies Pvt Ltd), realistic GSTINs, mixed statuses including at least 2 Overdue and 1 Partial.

**Future Backend Integration:** `GET/POST /api/finance/payables`, vendor master synced from a future Procurement module's Vendor Master (single source of truth), payment execution eventually integrates with banking APIs.

---

### 9.4 Accounts Receivable (`AccountsReceivable.jsx` / `AccountsReceivable.css`)

**Purpose:** Track everything customers owe the company — the direct mirror/integration point with the Sales Module.

**Columns:** Customer, Invoice Number, Invoice Date, Due Date, Outstanding Amount, Payment Status, Collection Status.

**Payment Status:** Pending, Paid, Overdue, Partial. **Collection Status:** Not Started, Reminder Sent, Follow-up Scheduled, Escalated, Legal.

**UI Layout:**
- KPI strip: Total Receivable, Overdue Amount, Collected This Month, Average Days Sales Outstanding (DSO).
- `SearchBar` + `FilterBar` (Payment Status, Collection Status, Due Date range, Customer dropdown, Aging Bucket: 0–30 / 31–60 / 61–90 / 90+ days).
- `FinanceTable` with an **Aging** column badge (color-coded by bucket) computed from due date vs. today.
- Row click opens `ReceivableModal` with tabs: **Details**, **Reminder History** (timeline: "Reminder #1 sent 12 Jul 2026 via Email", "Reminder #2 sent 18 Jul 2026 via SMS"), **Payment History**.
- Row actions: "Record Payment" (same partial/full logic as AP, flips status, recalculates outstanding), "Send Reminder" (adds a new entry to Reminder History + toast "Reminder sent to Bharat Textiles Pvt Ltd"), "Convert to Credit Note" (for disputed/returned amounts — see Section 12 Sales Return workflow).
- `ExportMenu` (CSV/PDF).

**Dummy Data:** 8–10 customer invoices, explicitly using **the same customers that exist in the Sales Module dummy data** (e.g., Bharat Textiles Pvt Ltd, Nexus Retail Solutions, Ganga Enterprises) to visually demonstrate module integration — outstanding balances here should match what Sales Dashboard shows for those customers.

**Future Backend Integration:** `GET/POST /api/finance/receivables`, this endpoint is the direct consumer of Sales Module's `invoice.created` event (see Section 12); DSO and aging calculations move server-side.

---

### 9.5 Bank Reconciliation (`BankReconciliation.jsx` / `BankReconciliation.css`)

**Purpose:** Match the company's book (GL) cash records against actual bank statement lines to detect discrepancies.

**Columns/Fields:** Bank Account, Statement Date, Book Balance, Bank Balance, Difference, Reconciliation Status (Matched / Unmatched / In Progress).

**UI Layout:**
- Bank account selector tabs/dropdown (e.g., HDFC Bank – Current A/c ****4521, ICICI Bank – CC A/c ****7789).
- KPI strip: Book Balance, Bank Balance, Difference, Unmatched Transaction Count.
- Two-panel layout: **Book Transactions** (left) vs **Bank Statement Transactions** (right), each a scrollable mini-table with checkboxes.
- "Auto Match" button — simulated algorithm that matches rows with identical amount + close date (±2 days) automatically, animates matched rows to a green "Matched" state, shows toast "9 of 12 transactions auto-matched".
- "Manual Match" — user selects one row from each panel and clicks "Match Selected", which pairs them (validated: amounts should be equal, else warning toast); matched pairs move to a combined **Matched Transactions** table below.
- **Unmatched Transactions** table remains at bottom with an "Investigate" action (opens a note field).
- Import: "Import Bank Statement" button opens `ImportModal` (simulated CSV upload → injects dummy parsed statement lines).
- `SearchBar` + `FilterBar` (Date range, Status).
- `ExportMenu` (CSV/PDF reconciliation summary).

**Dummy Data:** 2 bank accounts, ~12 book transactions and ~12 bank statement lines per account, with 8–9 designed to auto-match and 3–4 intentionally mismatched/unmatched to demonstrate the workflow.

**Future Backend Integration:** real bank feed via Account Aggregator / bank API integration, `POST /api/finance/reconciliation/auto-match` running a real fuzzy-matching algorithm server-side.

---

### 9.6 Budgeting (`Budgeting.jsx` / `Budgeting.css`)

**Purpose:** Plan and track departmental budgets against actual spend.

**Columns:** Department, Budget, Actual Expense, Variance, Remaining Budget, Budget Utilization %.

**UI Layout:**
- KPI strip: Total Budget (FY), Total Actual Spend, Overall Variance, Departments Over Budget (count).
- `DepartmentBudgetChart` — grouped/stacked bar chart, Budget vs Actual per department, plus a donut chart of budget allocation share per department.
- `FinanceTable` with a **Utilization %** column rendered as an inline progress bar (green <80%, amber 80–100%, red >100% — i.e., over budget), sortable.
- **Budget Alerts panel** — cards/list flagging departments ≥90% utilization ("⚠ Marketing has used 92% of its Q2 budget") with a "Request Budget Increase" action button (opens a simple form, purely UI, appends a "Pending Approval" chip).
- `FilterBar` (Department, Quarter/FY period, Status: On Track / At Risk / Over Budget).
- "+ New Budget" button → `BudgetModal` form (Department dropdown, Period, Budget Amount, Notes) — creates a new department budget line in state.
- Row click opens `BudgetModal` in edit/detail mode showing month-by-month breakdown for that department (mini bar chart).
- `ExportMenu` (CSV/PDF).

**Dummy Data:** 6–8 departments (Sales, Marketing, Finance, HR, IT, Operations, Manufacturing, Procurement) with realistic INR budget figures and varied utilization (include at least one over-budget department to show the red state).

**Future Backend Integration:** `GET/POST /api/finance/budgets`, approval workflow integrates with User & Access Management (see Section 12) for multi-level budget approval.

---

### 9.7 Fixed Assets (`FixedAssets.jsx` / `FixedAssets.css`)

**Purpose:** Register and track company assets, their depreciation, and assignment.

**Columns:** Asset ID, Asset Name, Category, Purchase Date, Purchase Cost, Current Value, Depreciation (amount + %), Location, Assigned Employee, Warranty (status/expiry), Status (In Use / Under Maintenance / Retired / Disposed).

**UI Layout:**
- KPI strip: Total Asset Value (original), Total Current Value, Accumulated Depreciation, Assets Under Maintenance.
- `SearchBar` + `FilterBar` (Category: IT Equipment / Furniture / Vehicles / Machinery / Real Estate; Status; Location; Warranty status).
- `FinanceTable`, current value shown with a small depreciation trend sparkline per row (optional nice-to-have), row click opens **Asset Details Modal** (`AssetModal`): full details, a straight-line depreciation schedule table (Year, Opening Value, Depreciation, Closing Value) computed client-side from purchase cost, useful life, and salvage value, plus an "Asset History" tab (assignment changes, maintenance log — dummy entries).
- Actions: "Reassign Employee" (dropdown of dummy employees, updates Assigned Employee + logs to Asset History), "Mark Under Maintenance", "Retire Asset" (via `ConfirmDialog`).
- "+ Add Asset" button → form (Asset Name, Category, Purchase Date, Cost, Location, Assigned Employee, Useful Life (years), Salvage Value).
- `ExportMenu` (CSV/PDF asset register).

**Dummy Data:** 8 assets — e.g., "Dell Latitude 5440 Laptop" (IT Equipment), "Maruti Suzuki Eeco Delivery Van" (Vehicle), "HP LaserJet Pro Printer", "Office Workstation Desk Set", "CNC Milling Machine" (Manufacturing), each with realistic INR purchase cost and computed depreciated current value.

**Future Backend Integration:** `GET/POST /api/finance/assets`, depreciation schedules computed and stored server-side per accounting standard (straight-line/WDV), asset assignment synced with future HR employee master.

---

### 9.8 Taxation / GST (`TaxationGST.jsx` / `TaxationGST.css`)

**Purpose:** Central hub for GST liability tracking, filing status, and tax reporting.

**UI Layout:**
- KPI/Summary cards: **CGST**, **SGST**, **IGST**, **Total Tax Liability**, **Invoice Count** (period), **Input Tax Credit (ITC) Available**.
- **Filing Status panel** — table/list of GST return periods (e.g., GSTR-1 Jul 2026, GSTR-3B Jun 2026) each with Filing Status badge (Filed / Pending / Overdue) and a due-date countdown chip.
- **Pending Returns** callout list with "File Now" button (simulated — flips status to "Filed", shows toast, stamps a filing date).
- `GstBreakdownChart` — donut/bar showing CGST vs SGST vs IGST split, plus a monthly tax liability trend line.
- `FinanceTable` of GST transactions/invoices: Invoice Number, Customer/Vendor, Taxable Value, CGST, SGST, IGST, Total Tax, GSTIN, Invoice Date.
- `SearchBar` + `FilterBar` (Period, Tax Type, Filing Status, GSTIN).
- Actions: "Generate GST Report" (opens `GSTReportModal` — a formatted preview resembling a GSTR summary), "Download PDF", "Export Excel" (CSV formatted for Excel).
- `Pagination`.

**Dummy Data:** 10 GST-relevant invoice records with valid-format Indian GSTINs (format: `22AAAAA0000A1Z5` pattern — 2-digit state code + 10-char PAN + entity code + Z + checksum), mixing intra-state (CGST+SGST) and inter-state (IGST) transactions, plus 4–5 filing periods with mixed statuses.

**Future Backend Integration:** integration with GSTN (Government GST Network) e-filing APIs, auto-reconciliation with GSTR-2A/2B for ITC matching.

---

### 9.9 AI Cash Flow Forecast (`CashFlowForecast.jsx` / `CashFlowForecast.css`)

**Purpose:** AI-styled predictive dashboard projecting future cash position and flagging liquidity risk.

**UI Layout:**
- Hero KPI row: **Current Cash**, **30-Day Forecast**, **60-Day Forecast**, **90-Day Forecast** — each a large `KpiCard` with a confidence badge ("High confidence", "Medium confidence") and color coding: green (healthy, forecast balance stays comfortably positive), yellow (caution, balance dips close to a defined minimum threshold), red (risk, forecast balance goes negative at some point in the window).
- `ForecastChart` — line/area chart plotting actual cash balance (solid line, past 30 days) transitioning into a projected/dashed line (next 90 days), with a shaded confidence band, and a horizontal threshold line for "Minimum Safe Balance."
- **Upcoming Payments panel** — table of scheduled outflows (AP due invoices, payroll est., recurring expenses) pulled conceptually from Accounts Payable data, with date and amount.
- **Expected Receipts panel** — table of scheduled inflows (AR due invoices) pulled conceptually from Accounts Receivable data.
- **Risk Alerts panel** — cards like "⚠ Projected cash shortfall of ₹4.2L expected around 14 Aug 2026 unless receivables are collected on time," each color-coded red/yellow.
- **Recommended Actions panel** — AI-styled suggestion cards ("Follow up on 3 overdue invoices totaling ₹6.8L to avoid shortfall", "Consider delaying non-critical vendor payment of ₹1.5L by 5 days"), each with a "Take Action" button that deep-links to AR/AP pages.
- `CashFlowChart` secondary view toggle: Daily / Weekly / Monthly granularity.

**Dummy Data:** current cash balance seeded, then a deterministic dummy projection algorithm (simple formula combining known AR due dates minus known AP due dates day-by-day) generates the 90-day series so numbers are internally consistent with the AP/AR dummy data rather than random — reinforcing "everything is connected."

**Future Backend Integration:** real ML forecasting service (time-series model trained on historical cash movements), `GET /api/finance/forecast/cashflow?horizon=90`.

---

### 9.10 Anomaly & Fraud Detection (`FraudDetection.jsx` / `FraudDetection.css`)

**Purpose:** Surface suspicious financial activity for investigation.

**UI Layout:**
- KPI strip: Open Alerts, High Risk Transactions, Investigations In Progress, Resolved This Month.
- **Risk category cards** (clickable filters): Duplicate Invoice Detection, Suspicious Payments, Abnormal Vendor Transactions, Duplicate Payment Alerts — each showing a count and mini trend.
- `RiskScoreChart` — scatter or bar chart plotting transactions by Risk Score (0–100), color-graded green→amber→red, with a threshold line marking "High Risk" (e.g., ≥75).
- **Fraud Timeline** — vertical timeline of flagged events in chronological order, each with severity icon, short description, and timestamp.
- `FinanceTable` — Alert ID, Type, Related Transaction/Invoice, Vendor/Customer, Amount, Risk Score, Status (New / Investigating / Resolved / False Positive), Flagged Date.
- Row click opens `AlertInvestigationModal`: full alert detail, the two (or more) conflicting/suspicious transactions side-by-side for comparison, a Notes/Investigation Log (append-only comment thread, dummy), and action buttons "Mark as Resolved", "Mark as False Positive", "Escalate".
- **Recommendation Cards** — e.g., "Vendor 'Om Sai Logistics' received 2 payments of identical amount ₹48,500 within 24 hours — review for duplicate payment," with "Investigate" CTA.
- `SearchBar` + `FilterBar` (Status, Risk Level, Type, Date range).
- `ExportMenu` (alert log CSV/PDF).

**Dummy Data:** 6–8 alerts covering each category (at least one duplicate invoice pair, one suspicious payment, one abnormal vendor transaction), with realistic risk scores (e.g., 42, 68, 81, 93) and at least one already "Resolved" to show full lifecycle.

**Future Backend Integration:** real anomaly-detection ML pipeline scanning GL/AP/AR streams continuously, `GET /api/finance/fraud/alerts`, integrates with User & Access Management audit logs for investigator attribution.

---

### 9.11 One-Click Compliance Pack (`CompliancePack.jsx` / `CompliancePack.css`)

**Purpose:** One-stop generation and download of all statutory compliance reports.

**UI Layout:**
- KPI/status strip: Overall Compliance Status (badge: Compliant / Action Needed), Filings Due This Month, Filings Completed This FY.
- **Report Generator grid** — cards for each report type: GST Reports, TDS Reports, Sales Register, Purchase Register, Tax Summary — each card shows last generated date, a "Generate" button, and "Download PDF" / "Export Excel" buttons once generated (simulated: clicking Generate shows a progress state for ~1s, then flips card to "Ready", enables downloads, and shows a toast).
- **"Generate Full Compliance Report" primary CTA** — big prominent button at top that simulates bundling all reports into a single downloadable pack (progress modal with a checklist animating through each report type being "generated," then a success state with a "Download Compliance Pack (PDF)" button).
- **Compliance Status table** — per filing type: Filing Type, Period, Due Date, Status (Filed/Pending/Overdue), Filed Date, Filed By.
- **Filing Calendar** — simple month-view or upcoming-list widget showing upcoming statutory due dates (GSTR-1, GSTR-3B, TDS return, PF/ESI due dates as placeholders for future HR integration) with days-remaining countdown chips, color-coded as it approaches (green → amber ≤7 days → red overdue).
- `FilterBar` (Report Type, Period, Status).

**Dummy Data:** 5 report types with dummy last-generated dates, 6 filing calendar entries across GST/TDS with a mix of upcoming/overdue.

**Future Backend Integration:** server-side report generation service pulling live GL/AP/AR/GST data, PDF generation via a templating service, e-filing submission APIs for GSTN/TRACES.

---

## 10. UX Requirements (applies globally)

- **Premium enterprise look:** deep indigo/navy primary (#1E2A5E–style range), neutral slate greys, white/near-white surface, single vivid accent for primary buttons, semantic green/amber/red for status — used consistently across every page.
- **Rounded cards:** 12–16px radius, soft shadow (`0 4px 20px rgba(0,0,0,0.06)` style), 1px hairline border.
- **Glassmorphism:** applied to top navbar, modals' backdrop, and optionally KPI cards on the Dashboard — `backdrop-filter: blur(12px)` with translucent white/navy background.
- **Sticky table headers** on every `FinanceTable` instance within its scroll container.
- **Hover effects:** table rows lighten/tint on hover with cursor pointer if clickable; buttons lift slightly (subtle `translateY(-1px)` + shadow increase) on hover; cards get a slightly stronger shadow on hover if interactive.
- **Skeleton loaders** on every page's initial load and whenever filters/search change (simulate ~600ms latency via `setTimeout`).
- **Empty states** for every table/list when filters yield zero results.
- **Error states** with retry, demonstrable via a small percentage of simulated dummy "fetch" failures or a dev-only trigger.
- **Toast notifications** for every create/update/delete/export/import/status-change action.
- **Confirmation dialogs** before irreversible actions (delete, retire asset, reject match, file GST return).
- **Responsive layout** per breakpoints defined in Section 8.
- **Professional charts** — consistent color palette, legends, tooltips, no default library styling left unstyled (must match the app's design language, not the chart library's default theme).

---

## 11. Dummy Data Standards

All dummy data across every Finance page must:

- Use **realistic Indian companies** as customers/vendors — reuse the exact same customer names already established in the Sales Module (e.g., Bharat Textiles Pvt Ltd, Nexus Retail Solutions, Ganga Enterprises, Shree Balaji Steel Traders, Om Sai Logistics) so cross-module data appears consistent, plus a small set of Finance-specific vendors (e.g., Reliable Office Supplies Pvt Ltd, Maruti Fleet Services, Kaveri Power Solutions).
- Use **valid-format Indian GST numbers** (`##AAAAA0000A#Z#` — 15 characters: 2-digit state code, 10-character PAN-style block, entity code digit, literal "Z", checksum character).
- Use **INR currency formatting** throughout (₹ symbol, Indian digit grouping — e.g., ₹12,45,000 not ₹1,245,000).
- Use realistic **invoice numbers** (`INV-2026-0041`), **voucher numbers** (`JV-2026-0041`, `PV-2026-0117`, `RV-2026-0089`), **PO numbers** (`PO-2026-0212`), and **asset IDs** (`AST-1042`).
- Every page/table ships with **5–10 records minimum**, as specified per page above, covering a realistic spread of statuses (not all "Paid" — include Pending, Overdue, Partial examples everywhere status applies).
- Dates should be plausible relative to the current date context (financial year 2026–27, entries dated across recent months).

---

## 12. Module Integration (Critical Section)

The ERP is one connected system, not independent silos. This section is the binding contract between Finance and the rest of the ERP. Even though this build has no real backend, the **frontend must be architected to simulate this connectivity today** (via a shared `FinanceDataContext`/`SalesDataContext` bridge or equivalent shared dummy dataset) so that the eventual backend swap is a drop-in replacement, not a rewrite.

### 12.1 Sales ↔ Finance Integration — Business Workflow & Data Flow

**Shared source-of-truth entities** (must not be duplicated between modules — Finance reads/writes the same conceptual `Customer`, `Invoice`, and `Payment` records the Sales Module owns/created):

| Entity | Owner Module | Consumed By |
|---|---|---|
| Customer Master | Sales | Finance (AR, Dashboard, Credit checks) |
| Sales Invoice | Sales (created) → Finance (financially processed) | Both |
| Customer Payment | Finance (recorded) | Sales (invoice status display) |
| Credit Note | Finance (issued from Sales Return) | Sales (customer balance) |
| Customer Credit Limit | Finance (governs) | Sales (enforced at quotation/order time) |

**Event-by-event integration rules:**

- **Customer Created (in Sales)** → Customer immediately becomes available in Finance's Accounts Receivable customer dropdown and Customer Details views. No separate customer creation in Finance — single source of truth is the Sales Customer Master.
- **Customer Credit Limit Updated (in Finance)** → Automatically reflected in Sales at quotation/order creation time (Sales blocks or warns if a new order would exceed the updated limit).
- **Quotation Approved (in Sales)** → No Finance entry is created. Quotations are pre-financial documents; Finance remains untouched at this stage.
- **Sales Order Confirmed (in Sales)** → No Finance entry yet; this event is reserved for future Inventory integration (stock reservation), not a Finance trigger.
- **Invoice Generated (in Sales)** → Triggers, automatically and simultaneously:
  1. A new **Accounts Receivable** record is created (status: Pending), visible immediately in `AccountsReceivable.jsx`.
  2. Corresponding **General Ledger entries** are auto-posted (Debit: Accounts Receivable, Credit: Sales Revenue, Credit: GST Payable) — visible in `GeneralLedger.jsx` tagged "Auto-posted from Sales Invoice."
  3. **GST is automatically calculated** (CGST/SGST for intra-state, IGST for inter-state, based on customer's state) and reflected in `TaxationGST.jsx`.
  4. **Revenue figures** on the Finance Dashboard (and Sales Dashboard) update immediately.
- **Customer Payment Received (recorded in Finance via Accounts Receivable)** → Automatically updates the Invoice Payment Status back inside the Sales Module's invoice/order view (Pending → Paid, or → Partial).
- **Partial Payment** → Remaining outstanding balance is recalculated and kept in sync in both Accounts Receivable and the corresponding Sales invoice view — single stored balance, read in both places.
- **Sales Return Approved (in Sales)** → Automatically creates a **Credit Note** in Finance.
- **Credit Note Approved (in Finance)** → Automatically adjusts the Customer's Outstanding Balance (reduces AR), visible in both modules.
- **Outstanding Receivables** — the exact same number is displayed on both the Sales Dashboard ("Outstanding from Customers") and the Finance Dashboard ("Outstanding Receivables") — computed from one shared dataset, never two separately-maintained numbers.
- **Customer Payment History** — shared between Sales (customer profile "Payment History" tab) and Finance (`ReceivableModal` Payment History tab) — same data, two views.
- **Top Customers by Revenue** (shown on Sales Dashboard) — sourced using Finance's actual payment/invoice data, not just order value, so it reflects realized revenue.
- **Customer Credit Limit** — a single field on the Customer record, editable from Finance, enforced by Sales — shared, not duplicated.

**Validation & business rules across modules:**
- Sales cannot confirm an order that would push a customer beyond their Finance-set credit limit (soft warning in this frontend simulation; hard block configurable).
- An invoice cannot be edited in Sales once Finance has posted GL entries against it — it can only be adjusted via a Credit Note/Debit Note flow.
- GST calculation logic lives in one shared utility (`financeHelpers.js`) consumed by both the Sales invoice-creation flow and the Finance GST module, so tax logic is never duplicated or inconsistent.

**Dashboards consuming shared data:** Finance Dashboard (Outstanding Receivables, Revenue Trend, Top Customers), Sales Dashboard (Outstanding from Customers, Payment Status per Order, Customer Credit Standing).

**Future APIs required (for real backend):**
- `POST /api/finance/receivables` (triggered internally by `POST /api/sales/invoices`)
- `POST /api/finance/ledger/entries` (auto-invoked on invoice creation and payment events)
- `PATCH /api/sales/invoices/:id/payment-status` (invoked by Finance when a payment is recorded)
- `GET /api/finance/customers/:id/credit-limit` and `PATCH` counterpart, consumed by Sales at order-confirmation time
- `POST /api/finance/credit-notes` (triggered by `PATCH /api/sales/returns/:id/approve`)
- Shared event bus / webhook system (e.g., `invoice.created`, `payment.recorded`, `return.approved`, `credit_note.issued`) so modules stay decoupled while data stays synchronized.

**Linked database tables (future):** `customers` (owned by Sales, referenced by Finance via `customer_id`), `sales_invoices` ↔ `finance_receivables` (1:1 via `invoice_id`), `payments` (owned by Finance, referenced by Sales via `invoice_id`), `credit_notes` (owned by Finance, referenced by Sales via `return_id`), `general_ledger_entries` (owned by Finance, `source_type`/`source_id` polymorphic reference back to originating Sales/Procurement/HR record).

### 12.2 Data Flow Diagrams

```
Sales Invoice Generated
        ↓
Accounts Receivable Record Created (Finance)
        ↓
General Ledger Entries Posted
        ↓
GST Register Updated
        ↓
Cash Flow Forecast Recalculated
        ↓
Financial Dashboard Updated (and Sales Dashboard Updated)
```

```
Customer Payment Recorded (Finance)
        ↓
Accounts Receivable Balance Updated
        ↓
Invoice Marked Paid / Partial
        ↓
Outstanding Balance Updated (shared record)
        ↓
Sales Dashboard Updated (Payment Status reflects instantly)
```

```
Sales Return Approved (Sales)
        ↓
Credit Note Created (Finance)
        ↓
Customer Outstanding Balance Adjusted
        ↓
AR Aging & Finance Dashboard Updated
        ↓
Sales Customer Profile Updated
```

### 12.3 Future Module Integrations

**Finance ↔ Procurement**
- Purchase Invoice (from Procurement) automatically creates an Accounts Payable record in Finance.
- Vendor Payments recorded in Finance automatically update Procurement's vendor payment status view.
- Open Purchase Orders factor into the AI Cash Flow Forecast's Upcoming Payments projection.

**Finance ↔ Inventory**
- Inventory valuation (stock on hand × cost) feeds Balance Sheet inventory asset value.
- Stock adjustments (write-ups/write-downs) automatically create corresponding GL accounting entries.
- Inventory write-offs post directly as an expense in the Finance P&L.

**Finance ↔ Manufacturing**
- Production/job costs (material + labor + overhead) roll up into Manufacturing Expense in Finance.
- Finished goods completion updates Inventory valuation, which flows into Finance's asset/COGS calculations.
- Machine/operating costs feed Finance's costing and profitability reports.

**Finance ↔ HR**
- Payroll runs automatically create salary expense GL entries.
- Statutory payroll postings (PF, ESI, TDS on salary) auto-post to the relevant Finance liability accounts and feed the Taxation/GST & Compliance Pack modules.
- Employee reimbursements and expense claims submitted in HR create corresponding Accounts Payable-style entries in Finance for approval and payout.

**Finance ↔ Marketing**
- Marketing campaign spend posts as an expense line in Finance, categorized under a Marketing budget department (visible in `Budgeting.jsx`).
- Campaign ROI calculations in Marketing pull actual revenue/cost figures from Finance rather than maintaining a separate financial estimate.
- Customer acquisition cost (CAC) is computed using Finance's actual spend data joined with Sales' new-customer counts.
- Marketing budgets are tracked as a department line within the same Budgeting module used company-wide — no separate marketing-only budget system.

**Finance ↔ User & Access Management**
- Role-based permissions govern who can view/edit sensitive Finance data (e.g., only Finance Manager+ roles can approve journal entries above a threshold, or file GST returns).
- Multi-level approval hierarchy (e.g., Budget increase requests, large vendor payments) is enforced through the shared User & Access Management approval-chain engine, not a Finance-only mechanism.
- Every create/edit/delete/status-change action in Finance writes to a shared, module-agnostic audit log (who, what, when, before/after values) — the same audit infrastructure other modules use.
- Financial access control (e.g., restricting Bank Reconciliation or Fraud Detection visibility to specific roles) is configured centrally, not hardcoded per page.

### 12.4 ERP Design Principle

Every module remains independently deployable and independently useful, while sharing data through well-defined APIs and normalized database relationships rather than duplicated copies. Each shared business object — Customer, Invoice, Payment, Credit Note, Vendor, Employee, Budget — has exactly **one owning module and one source of truth**; every other module references it by ID and consumes it through an API/event contract, never by maintaining its own parallel copy. This keeps the system consistent (no conflicting numbers across dashboards), auditable (one place to trace where a value came from), and cheap to extend (a future Procurement, Inventory, Manufacturing, HR, or Marketing module integrates by subscribing to existing events and referencing existing IDs, not by renegotiating Finance's data model). This mirrors how SAP S/4HANA's universal journal, Oracle NetSuite's unified data model, Microsoft Dynamics 365's Dataverse, Zoho's cross-app data sharing, and Odoo's shared ORM models keep enterprise modules coherent at scale.

---

## 13. Build Checklist (for the implementing AI)

1. Scaffold the folder structure exactly as specified in Section 4.
2. Build `FinanceDataContext.jsx` first, seeding all dummy datasets from `data/Finance/*.js`, including the shared customer records that mirror the Sales Module's customers.
3. Build shared components (Section 7) before pages — every page depends on them.
4. Build `FinanceSidebar.jsx`, `FinanceTopbar.jsx`, and `FinanceRoutes.jsx` to establish the shell.
5. Implement pages in this order: Dashboard → General Ledger → Accounts Payable → Accounts Receivable → Bank Reconciliation → Budgeting → Fixed Assets → Taxation/GST → Cash Flow Forecast → Fraud Detection → Compliance Pack.
6. Wire the Sales↔Finance simulated integration: creating/paying an AR invoice should visibly ripple into GL, GST, Dashboard KPIs, and (conceptually) the Sales Module's shared customer/invoice data.
7. Apply UX polish pass (Section 10): skeletons, empty/error states, toasts, confirm dialogs, responsive breakpoints, hover states.
8. QA pass: verify every button performs a real state change, every table sorts/filters/paginates, every form validates, every modal opens/closes cleanly, and the app is fully usable at 1440px, 1024px, and 375px widths.

**End of Finance & Accounting Module README.**
