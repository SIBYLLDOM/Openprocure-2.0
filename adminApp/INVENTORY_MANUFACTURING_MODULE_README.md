# Inventory & Manufacturing Module — Implementation Blueprint

## Enterprise ERP System — Module README

**Version:** 1.0
**Module Owner:** Inventory & Manufacturing
**Consumer:** Frontend build agent (Antigravity)
**Stack:** React.js, React Router, CSS Modules / plain CSS files
**Status:** Blueprint for implementation — no backend, dummy data only
**Sibling Modules:** Sales Module and Finance & Accounting Module (already implemented — this module must integrate with both)

---

## 1. Purpose & Scope

The Inventory & Manufacturing Module is the operational core of the ERP system — it tracks physical stock across warehouses, traces batches/lots for quality and compliance, defines how finished products are built (Bill of Materials), plans and schedules production (Work Orders), manages warehouse capacity and internal transfers, and layers two AI-driven capabilities (Demand-Driven Stock Optimization and a Live OEE Dashboard) plus a real-time Visual Shop-Floor Map on top.

This module must be built to the exact same architectural standard, visual quality, folder structure, naming conventions, and documentation depth as the Sales Module and the Finance & Accounting Module. It is a standalone frontend build using React state and dummy data — no backend, no API calls, no database. All "future backend integration" notes describe how this frontend will later connect to real services.

Inventory is the physical fulfillment layer that Sales depends on and Finance values — it is not a silo. Stock reservations, dispatches, and returns flow to/from Sales; inventory valuation, stock adjustments, and manufacturing costs flow to/from Finance. See **Section 12 — Module Integration** for the full contract, and it is architected so Procurement, HR, and User & Access Management can plug in later without rework.

---

## 2. Design Philosophy

Build this to the same premium enterprise standard established by the Sales and Finance modules — a senior product designer at SAP S/4HANA, Oracle NetSuite, Microsoft Dynamics 365, Zoho ERP, or Odoo Manufacturing/Inventory would recognize this immediately as belonging to the same product family.

- **Same visual language as Sales and Finance** — identical color palette (deep navy/indigo primary, slate neutrals, single accent color, semantic green/amber/red status colors), identical typography scale, identical card/table/modal treatment. A user switching from the Finance Dashboard to the Inventory Dashboard should feel zero visual discontinuity.
- **Operational, real-time feel** — unlike Finance's calm ledger tone, Inventory & Manufacturing pages (especially the Shop-Floor Map and OEE Dashboard) should communicate live, moving operations: pulsing status indicators, animated progress bars, color-coded zone/machine states, subtle "live" badges.
- **Glassmorphism used sparingly** — frosted-glass top navbar, modal backdrops, and KPI cards, consistent with prior modules.
- **Rounded, elevated cards** — 12–16px radius, soft multi-layer shadows, 1px hairline borders, consistent with Sales/Finance.
- **Professional typography** — same system font stack/type scale as prior modules (page titles 24–28px bold, section headers 18–20px semibold, body 14px, table text 13–14px, uppercase letter-spaced eyebrow labels).
- **Consistent motion** — 150–250ms ease-in-out transitions; the Shop-Floor Map and OEE gauges may use slightly longer (300–400ms) eased transitions for gauge needles/progress arcs to feel mechanical rather than snappy.
- **Desktop-first, fully responsive** — 1440px+ primary target, gracefully degrading to 1024px tablet and 375–428px mobile, matching the breakpoint behavior defined in the Sales and Finance READMEs.

---

## 3. Tech Stack & Constraints

- **React.js** (functional components + Hooks only: `useState`, `useEffect`, `useMemo`, `useReducer`, `useContext`)
- **React Router v6** for routing between Inventory pages
- **Separate CSS files per page/component** — one dedicated `.css` file per page, imported directly. No CSS-in-JS.
- **No Bootstrap. No Tailwind.** All styling hand-authored.
- **No backend, no real API calls.** All data is local dummy data seeded into React state.
- **Charting library:** same lightweight React charting library used in Finance (e.g., Recharts) for line/bar/area/radial charts, including the OEE gauge-style radial charts. If no chart library is permitted in the target environment, build charts as SVG-based custom components — treated as black boxes with defined props, consistent with the Finance README's approach.
- **Icons:** same consistent icon set used across Sales/Finance (e.g., Lucide React) — no mixing families.
- **State management:** local component state + a shared `InventoryDataContext` (React Context) holding all Inventory dummy datasets, mirroring the pattern of `SalesDataContext` and `FinanceDataContext` — this is what allows Sales ↔ Inventory ↔ Finance integration to be simulated on the frontend (see Section 12).

---

## 4. Complete Folder Structure

```
src/
├── pages/
│   └── Inventory/
│       ├── Dashboard.jsx
│       ├── StockManagement.jsx
│       ├── BatchLotTracking.jsx
│       ├── BillOfMaterials.jsx
│       ├── ProductionPlanning.jsx
│       ├── WarehouseManagement.jsx
│       ├── StockTransfer.jsx
│       ├── DemandDrivenStockOptimization.jsx
│       ├── LiveOEEDashboard.jsx
│       └── VisualShopFloorMap.jsx
│
├── components/
│   └── Inventory/
│       ├── InventorySidebar.jsx
│       ├── InventoryTopbar.jsx
│       ├── InventoryCards.jsx
│       ├── KpiCard.jsx
│       ├── InventoryTable.jsx
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
│       ├── StockModal.jsx
│       ├── WarehouseModal.jsx
│       ├── BatchModal.jsx
│       ├── TransferModal.jsx
│       ├── BOMModal.jsx
│       ├── WorkOrderModal.jsx
│       ├── ProductionCalendar.jsx
│       ├── TraceabilityTimeline.jsx
│       ├── WarehouseCapacityBar.jsx
│       │
│       └── Charts/
│           ├── InventoryTrendChart.jsx
│           ├── StockLevelChart.jsx
│           ├── ProductionChart.jsx
│           ├── OEEChart.jsx
│           ├── DemandForecastChart.jsx
│           ├── InventoryTurnoverChart.jsx
│           ├── WarehouseDistributionChart.jsx
│           └── LossAnalysisChart.jsx
│
├── context/
│   └── InventoryDataContext.jsx   (seeds & exposes all Inventory dummy data + shared Sales↔Inventory↔Finance bridge state)
│
├── data/
│   └── Inventory/
│       ├── stockData.js
│       ├── batchData.js
│       ├── bomData.js
│       ├── workOrderData.js
│       ├── warehouseData.js
│       ├── stockTransferData.js
│       ├── demandForecastData.js
│       ├── oeeData.js
│       └── shopFloorData.js
│
├── utils/
│   ├── formatCurrency.js   (INR formatting, shared convention with Finance module)
│   ├── formatDate.js
│   ├── exportToCSV.js
│   ├── exportToPDF.js
│   ├── validators.js
│   └── inventoryHelpers.js  (reorder point calc, stock value calc, OEE formula, days-of-cover calc)
│
├── css/
│   └── Inventory/
│       ├── InventoryLayout.css   (sidebar, topbar, shared page shell)
│       ├── Dashboard.css
│       ├── StockManagement.css
│       ├── BatchLotTracking.css
│       ├── BillOfMaterials.css
│       ├── ProductionPlanning.css
│       ├── WarehouseManagement.css
│       ├── StockTransfer.css
│       ├── DemandDrivenStockOptimization.css
│       ├── LiveOEEDashboard.css
│       ├── VisualShopFloorMap.css
│       └── components/
│           ├── InventoryCards.css
│           ├── InventoryTable.css
│           ├── SearchBar.css
│           ├── FilterBar.css
│           ├── StatusBadge.css
│           ├── Pagination.css
│           ├── Modal.css
│           ├── Toast.css
│           ├── SkeletonLoader.css
│           ├── EmptyErrorState.css
│           └── ShopFloorMap.css   (zone/machine tile styling shared between Shop-Floor Map and OEE gauges)
│
└── routes/
    └── InventoryRoutes.jsx
```

**Rule:** every page component imports exactly one page-level CSS file named identically to itself (e.g., `ProductionPlanning.jsx` → `ProductionPlanning.css`). Shared components import their own CSS file from `css/Inventory/components/`. No inline styles except computed dynamic values that cannot be expressed in static CSS (e.g., a gauge needle rotation angle, a heatmap tile's computed fill color, a capacity bar's computed width).

---

## 5. Routing

Mount all Inventory pages under `/inventory/*` using React Router, nested inside the ERP shell layout (already established by Sales and Finance):

| Path | Component |
|---|---|
| `/inventory` or `/inventory/dashboard` | `Dashboard.jsx` |
| `/inventory/stock-management` | `StockManagement.jsx` |
| `/inventory/batch-lot-tracking` | `BatchLotTracking.jsx` |
| `/inventory/bill-of-materials` | `BillOfMaterials.jsx` |
| `/inventory/production-planning` | `ProductionPlanning.jsx` |
| `/inventory/warehouse-management` | `WarehouseManagement.jsx` |
| `/inventory/stock-transfer` | `StockTransfer.jsx` |
| `/inventory/demand-optimization` | `DemandDrivenStockOptimization.jsx` |
| `/inventory/oee-dashboard` | `LiveOEEDashboard.jsx` |
| `/inventory/shop-floor-map` | `VisualShopFloorMap.jsx` |

`InventoryRoutes.jsx` exports a `<Routes>` block mounted inside the ERP's main `AppRoutes`, alongside `SalesRoutes` and `FinanceRoutes`.

---

## 6. Inventory Sidebar

A dedicated `InventorySidebar.jsx`, visually identical in structure to `FinanceSidebar.jsx`/the Sales sidebar (same width, collapse behavior, active-link highlight style), listing:

1. Dashboard — icon: layout/grid
2. Stock Management — icon: boxes/package
3. Batch / Lot Tracking — icon: tag/fingerprint
4. Bill of Materials (BOM) — icon: list-tree/layers
5. Production Planning & Work Orders — icon: calendar/clipboard-list
6. Warehouse / Location Management — icon: warehouse/building
7. Stock Transfer & Adjustments — icon: arrow-left-right
8. Demand-Driven Stock Optimization (AI) — icon: trending-up + sparkle (denotes "AI")
9. Live OEE Dashboard — icon: gauge/activity (with a small pulsing "live" dot)
10. Visual Shop-Floor Map — icon: map/factory

Behavior:
- Active route highlighted with accent-colored left border + tinted background + bold label, identical mechanism to Sales/Finance sidebars.
- Collapses to icon-only rail on tablet, off-canvas drawer on mobile (triggered from `InventoryTopbar.jsx`).
- Badge counters next to "Stock Management" (low-stock item count) and "Production Planning & Work Orders" (active work order count), pulled from `InventoryDataContext`, updating live as state changes.
- The shared "Module Switcher" element (already defined by Sales/Finance) lets the user jump between Sales, Finance, Inventory, and (future, disabled/greyed) Procurement, HR, Marketing, User Management.

---

## 7. Shared Component Contracts

Reuses the exact same component contracts established in the Finance README (same prop shapes, same visual treatment) so the three modules feel like one product. Summarized here for completeness:

**`InventoryCards.jsx` / `KpiCard.jsx`** — props: `title`, `value`, `subtext`, `icon`, `trend` (`{direction, percent}`), `variant` (`'default'|'success'|'warning'|'danger'`), `loading`. Identical visual spec to Finance's `KpiCard`.

**`InventoryTable.jsx`** — generic data table: `columns`, `rows`, `onSort`, `sortConfig`, `emptyMessage`, `loading`. Sticky header, sortable columns, row hover highlight, right-aligned numeric columns, responsive collapse to stacked cards under 768px, row click opens detail modal.

**`SearchBar.jsx`** — controlled, debounced (300ms), clear button, page-specific placeholder (e.g., "Search products, SKU, batch ID…").

**`FilterBar.jsx`** — horizontal dropdown filter row (page-specific fields), instant-filter behavior, "Reset Filters" link, collapses to accordion on mobile.

**`DateRangeFilter.jsx`** — from/to pickers + presets (Today, Last 7 Days, This Month, Last Quarter, Custom).

**`StatusBadge.jsx`** — pill badge, shared status→color map extended with Inventory-specific statuses:
- In Stock / Approved / Completed / Matched / Passed (QC) → green
- Low Stock / Pending / In Progress / Partial / Under Review → amber
- Out of Stock / Rejected / Overdue / Delayed / Blocked / Failed (QC) → red
- Reserved / Draft / Scheduled → blue/grey
- Discontinued / Retired → dark grey

**`Pagination.jsx`** — page-size selector (10/25/50), prev/next, numbered buttons, "Showing X–Y of Z records." Default 10 rows per page.

**`ExportMenu.jsx`** — "Export ▾" dropdown: CSV, PDF, and Excel where specified. Client-side CSV Blob download / print-styled PDF view, success toast.

**`ImportModal.jsx`** — simulated bulk import (e.g., bulk stock count upload, bulk BOM import): fake file upload, fake parsing progress bar, injects pre-baked dummy rows into state, success toast.

**`ConfirmDialog.jsx`** — Yes/No confirmation before destructive/state-changing actions (e.g., "Approve Stock Transfer?", "Mark Batch as Quarantined?", "Delete Work Order?"). Props: `title`, `message`, `confirmLabel`, `danger`, `onConfirm`, `onCancel`.

**`Toast.jsx` / `ToastContainer.jsx`** — bottom-right stacked toasts, success/error/info/warning, auto-dismiss 3.5s, triggered on every meaningful action.

**`SkeletonLoader.jsx`** — shimmer placeholders on mount and filter/search changes (~600–900ms simulated latency).

**`EmptyState.jsx`** / **`ErrorState.jsx`** — identical contract to Finance's versions.

**`StockModal.jsx`** — product stock detail/edit: tabs for Details, Stock History (movement ledger), Reorder Settings.

**`WarehouseModal.jsx`** — warehouse detail: capacity utilization bar, stock distribution by category, assigned manager, active transfer requests.

**`BatchModal.jsx`** — batch/lot detail: full traceability timeline (`TraceabilityTimeline.jsx`), quality status history, linked work order/supplier.

**`TransferModal.jsx`** — create/edit a stock transfer or adjustment: source/destination warehouse, product, quantity, reason, adjustment type.

**`BOMModal.jsx`** — BOM detail/create: parent product, component list (add/remove rows), cost roll-up calculation, version history, approval status.

**`WorkOrderModal.jsx`** — work order detail/create: product, factory, line, dates, priority, assigned team, linked BOM, progress bar.

**`ProductionCalendar.jsx`** — calendar-view component for Production Planning (month/week toggle), work orders rendered as colored blocks by status/priority.

**`TraceabilityTimeline.jsx`** — vertical timeline component (reused by Batch/Lot Tracking) showing a batch's lifecycle: Raw Material Received → QC Passed → Production Consumed → Finished Goods Created → Dispatched.

**`WarehouseCapacityBar.jsx`** — horizontal capacity utilization bar (used in Warehouse Management and Warehouse cards on Dashboard), color-coded green/amber/red by utilization %.

**Charts (`Charts/` folder)** — each chart takes `data` and `height` props, responsive width, legend, tooltips, axis labels, and uses the shared Inventory/Finance color palette. `OEEChart.jsx` additionally supports a radial/gauge rendering mode for the three OEE sub-metrics (Availability, Performance, Quality) plus the composite score.

---

## 8. Global Cross-Cutting Functionality (applies to every page)

- **Search** — client-side, debounced, case-insensitive, across relevant text fields.
- **Filters** — client-side `Array.filter`, multiple filters combine with AND logic.
- **Sorting** — click-to-sort, tri-state (asc → desc → none).
- **Pagination** — client-side slicing of filtered/sorted array, 10 per page default.
- **CRUD** — Create/Edit forms in modals; Delete requires `ConfirmDialog`; all mutations go through `InventoryDataContext` reducer actions; every operation shows a toast.
- **Status changes** — status dropdown/action button changes state instantly (e.g., approving a Stock Transfer flips status Pending→Approved, decrements source warehouse stock, increments destination warehouse stock, all visible immediately across Stock Management, Warehouse Management, and the Dashboard).
- **Validation** — required fields, numeric fields (quantity > 0, cost ≥ 0), date logic (expiry date > manufacturing date, work order end date ≥ start date), inline red helper text, disabled submit until valid.
- **Loading states** — skeleton loaders on initial mount and on filter/search changes (~600ms simulated latency).
- **Responsive behavior** — identical breakpoint scheme to Sales/Finance: `≥1440px` full multi-column; `1024–1439px` condensed grid; `768–1023px` icon-rail sidebar, horizontally scrolling tables; `<768px` drawer sidebar, stacked-card tables, accordion filters, single-column KPI cards. The Shop-Floor Map additionally switches from a full interactive layout at desktop to a scrollable zone-list view below 1024px (the spatial map is not usable at small sizes, so it degrades to a structured list with the same status information).

---

## 9. Page-by-Page Specification

### 9.1 Dashboard (`Dashboard.jsx` / `Dashboard.css`)

**Purpose:** Single-glance operational command center for inventory and production health.

**Layout (top to bottom):**

1. **Page header** — "Inventory & Manufacturing Dashboard", subtitle "Real-Time Operational Overview", date/time indicator (live clock optional), "Quick Actions" button cluster.
2. **KPI Card Row (6–8 cards):** Current Stock (total units/SKUs), Low Stock Alerts (count), Reserved Stock (units), Active Work Orders (count), Inventory Value (₹), Inventory Turnover Ratio — each a `KpiCard` with trend arrow vs. previous period.
3. **Production Status panel** — summary cards/mini-widget: work orders by status (Scheduled / In Progress / Completed / Delayed), with a small `ProductionChart` bar visualizing the split.
4. **Warehouse Summary** — grid of compact warehouse cards (one per warehouse), each showing name, `WarehouseCapacityBar`, current stock units, status badge (Healthy/Near Capacity/Over Capacity).
5. **Stock Movement Trend** — `InventoryTrendChart` (line/area, inbound vs outbound units over last 6 months).
6. **Two-column split:**
   - Left — **Top Moving Products** (ranked list: product, units moved this month, small horizontal bar per row).
   - Right — **Production Timeline** (compact Gantt-style strip of the next 5 work orders with progress bars).
7. **Inventory Turnover** widget — `InventoryTurnoverChart` (bar/line, turnover ratio trend over 6 months) plus a callout figure and benchmark comparison text.
8. **Notifications panel** — feed (e.g., "Low stock: Cotton Yarn 40s — 3 days of cover remaining", "Work Order WO-2026-0041 delayed by 2 days", "Batch BLK-0912 nearing expiry"), dismissible, severity icon.
9. **Quick Actions panel** — buttons: "Create Stock Transfer", "Create Work Order", "Add New Batch", "Record Stock Adjustment", "View Shop-Floor Map" — each opens the relevant modal or navigates.
10. **Recent Activities** — timeline list (e.g., "Rohit Verma approved Stock Transfer TR-2026-0031 — 1 hour ago", "Production line PL-02 completed Work Order WO-2026-0038 — Yesterday"), visual pattern reused from Sales/Finance activity feeds.

**Dummy Data:** 6 months of stock movement trend, 4–5 warehouses, 8–10 work orders (mixed statuses), 6 notifications, 8 activity feed entries, all using realistic Indian warehouse/factory/product names (see Section 11).

**Future Backend Integration:** all KPIs/charts computed client-side today; production becomes `GET /api/inventory/dashboard/summary` and related aggregation endpoints, refreshed via interval polling or websocket push for true real-time behavior (especially warehouse capacity and work-order status).

---

### 9.2 Stock Management (`StockManagement.jsx` / `StockManagement.css`)

**Purpose:** Master view of every product's stock position across warehouses — the system of record for "what do we have and where."

**Columns:** Product, SKU, Category, Warehouse, Available Quantity, Reserved Quantity, Reorder Level, Maximum Level, Current Value, Status.

**Status values:** In Stock, Low Stock, Out of Stock, Reserved, Discontinued — via `StatusBadge`, auto-derived from Available Quantity vs. Reorder Level/zero.

**UI Layout:**
- KPI strip: Total SKUs, Total Stock Value, Low Stock Items, Out of Stock Items.
- `SearchBar` (Product, SKU) + `FilterBar` (Warehouse Filter, Category Filter, Status Filter).
- `FinanceTable`-pattern `InventoryTable` — sortable (Available Quantity, Current Value), sticky header, row click opens `StockModal`.
- `StockModal` tabs: **Details** (all columns + supplier, unit of measure, description), **Stock History** (mini-table: date, movement type [Inbound/Outbound/Transfer/Adjustment], quantity change, reference, resulting balance), **Reorder Settings** (Reorder Level, Maximum Level, Preferred Supplier — editable form).
- Row actions: "Adjust Stock" (opens `TransferModal` in Adjustment mode), "Transfer" (opens `TransferModal` in Transfer mode), "View History".
- `ExportMenu` (CSV/PDF) + "Import Stock Count" button opening `ImportModal`.
- "+ Add Product" button → form (Product Name, SKU, Category, Warehouse, Opening Quantity, Reorder Level, Maximum Level, Unit Cost).
- `Pagination` — 10 per page.

**Dummy Data:** 10 realistic products across categories (Raw Material, Finished Goods, WIP, Packaging) — e.g., "Cotton Yarn 40s Count" (Raw Material, Chennai Warehouse), "Steel Rod 12mm" (Raw Material, Pune Warehouse), "Assembled Motor Unit MX-200" (Finished Goods, Mumbai Warehouse), "Corrugated Packaging Box – Large" (Packaging, Delhi Warehouse), with a spread of statuses including at least 2 Low Stock and 1 Out of Stock.

**Future Backend Integration:** `GET/POST/PUT /api/inventory/stock`, stock levels updated transactionally by Sales dispatch events, Production consumption events, and Stock Transfer approvals (see Section 12).

---

### 9.3 Batch / Lot Tracking (`BatchLotTracking.jsx` / `BatchLotTracking.css`)

**Purpose:** Full traceability of manufactured/received batches for quality control, recalls, and expiry management.

**Columns:** Batch ID, Product, Manufacturing Date, Expiry Date, Supplier, Quantity, Warehouse, Quality Status.

**Quality Status values:** Passed, Pending Inspection, Failed, Quarantined — via `StatusBadge`.

**UI Layout:**
- KPI strip: Total Active Batches, Batches Nearing Expiry (≤30 days), Quarantined Batches, Passed QC Rate %.
- `SearchBar` (Batch ID, Product) + `FilterBar` (Product Filter, Warehouse Filter, Quality Status Filter, Expiry Date range).
- `InventoryTable`, expiry column shown with a color-coded countdown chip (green >90 days, amber 30–90 days, red <30 days/expired), sortable by Manufacturing/Expiry Date.
- Row click opens `BatchModal`: **Details** tab (all columns + linked work order, unit cost), **Traceability Timeline** tab (`TraceabilityTimeline.jsx`: Raw Material Received → QC Inspection → Production Consumed / Stored → Dispatched, each step timestamped with responsible user), **Batch History** tab (any quantity/location changes to this batch).
- Row actions: "Mark QC Passed/Failed" (via `ConfirmDialog`), "Quarantine Batch", "View Full Traceability".
- `ExportMenu` (CSV/PDF batch register).
- "+ New Batch" button → form (Product, Manufacturing Date, Expiry Date, Supplier, Quantity, Warehouse).

**Dummy Data:** 8 batches — e.g., "BLK-0912" (Cotton Yarn 40s, Chennai, Passed), "BLK-0947" (Steel Rod 12mm, Pune, Pending Inspection), including at least 1 Quarantined and 2 nearing expiry, from realistic Indian suppliers (Shree Balaji Steel Traders, Ganga Textiles Mills).

**Future Backend Integration:** `GET/POST /api/inventory/batches`, QC status changes integrate with a future Quality Management sub-module, expiry alerts feed the Notifications panel and a scheduled reminder job.

---

### 9.4 Bill of Materials (`BillOfMaterials.jsx` / `BillOfMaterials.css`)

**Purpose:** Defines the recipe/structure of every manufactured product — which components and raw materials, in what quantities, go into a finished good.

**Fields/Columns:** Parent Product, Components (list), Raw Materials (list), Quantity Required (per component), Unit, Version, Approval Status, Cost Breakdown, Manufacturing Notes.

**Approval Status values:** Draft, Pending Approval, Approved, Revised — via `StatusBadge`.

**UI Layout:**
- KPI strip: Total Active BOMs, Pending Approval Count, Average Components per BOM, Total BOM-Costed Value (sum of standard cost across active BOMs).
- `SearchBar` (Parent Product) + `FilterBar` (Approval Status, Version, Category).
- `InventoryTable` — Parent Product, Version, Component Count, Total Cost, Approval Status, Last Updated — row click opens `BOMModal`.
- `BOMModal`: **Structure** tab — parent product header, a nested component table (Component/Raw Material, SKU, Quantity Required, Unit, Unit Cost, Line Cost), with add/remove-row controls in edit mode; **Cost Breakdown** tab — donut chart of cost contribution by component + total rolled-up cost; **Version History** tab — prior versions listed with diff summary ("v2: Increased Steel Rod quantity from 2 to 2.5 units"); **Manufacturing Notes** tab — free-text instructions/notes field.
- Actions: "Submit for Approval" (Draft→Pending Approval), "Approve"/"Reject" (via `ConfirmDialog`, Finance-Manager-style gated action represented purely in UI), "Create New Version" (clones current BOM as an editable draft, increments version number).
- `ExportMenu` (CSV/PDF BOM sheet).
- "+ New BOM" button → form (Parent Product, initial component rows, Manufacturing Notes).

**Dummy Data:** 10 BOMs — e.g., "Assembled Motor Unit MX-200" (v3, Approved, 5 components: Steel Rod 12mm, Copper Winding Wire, Motor Casing, Bearing Set, Insulation Tape), "Industrial Fan Blade Assembly" (v1, Pending Approval), spanning mixed approval statuses and realistic component quantities/units (kg, meters, pieces, liters).

**Future Backend Integration:** `GET/POST/PUT /api/inventory/bom`, BOM approval workflow integrates with the User & Access Management approval matrix (mirroring Finance's approval pattern), BOM cost roll-up recalculates automatically when linked raw-material unit costs change in Stock Management.

---

### 9.5 Production Planning & Work Orders (`ProductionPlanning.jsx` / `ProductionPlanning.css`)

**Purpose:** Schedule, track, and manage manufacturing work orders from creation to completion.

**Columns:** Work Order Number, Product, Factory, Production Line, Start Date, End Date, Priority, Assigned Team, Status.

**Status values:** Scheduled, In Progress, Completed, Delayed, On Hold, Cancelled — via `StatusBadge`. **Priority values:** Low, Medium, High, Urgent (color-coded chip).

**UI Layout:**
- KPI strip: Active Work Orders, Completed This Month, On-Time Completion Rate %, Delayed Work Orders.
- View toggle: **Table View** / **Timeline (Gantt) View** / **Calendar View** (`ProductionCalendar.jsx`).
  - Table View: `InventoryTable` with all columns + a **Progress** column (inline progress bar, %), sortable.
  - Timeline View: horizontal Gantt-style bars per work order across a date axis, color-coded by status, grouped by Production Line.
  - Calendar View: month/week grid via `ProductionCalendar.jsx`, work orders rendered as colored blocks on their scheduled dates, click opens `WorkOrderModal`.
- `SearchBar` (Work Order Number, Product) + `FilterBar` (Factory, Production Line, Status, Priority, Date range).
- Row/block click opens `WorkOrderModal`: **Details** tab (all fields + linked BOM reference, quantity to produce, quantity completed), **Progress** tab (stage-by-stage checklist: Materials Reserved → Production Started → QC → Completed, each with timestamp), **Team** tab (assigned team members, shift).
- Actions: "Start Production" (Scheduled→In Progress, reserves BOM raw materials from Stock Management via shared context), "Mark Complete" (In Progress→Completed, increments finished-goods stock and decrements consumed raw materials — via `ConfirmDialog`), "Put On Hold", "Cancel Work Order".
- `ExportMenu` (CSV/PDF work order schedule).
- "+ New Work Order" button → form (Product, linked BOM selector, Factory, Production Line, Quantity, Start/End Date, Priority, Assigned Team).

**Dummy Data:** 10 work orders across 2–3 factories (Chennai Manufacturing Unit, Pune Assembly Plant) and multiple production lines (PL-01, PL-02, PL-03), mixed statuses including at least 2 Delayed and 1 On Hold, realistic date ranges spanning the current month.

**Future Backend Integration:** `GET/POST/PUT /api/inventory/work-orders`, starting/completing a work order triggers real stock-consumption and finished-goods-creation transactions server-side, feeds Finance's manufacturing cost postings (see Section 12), and updates the Live OEE Dashboard's production-line activity data.

---

### 9.6 Warehouse / Location Management (`WarehouseManagement.jsx` / `WarehouseManagement.css`)

**Purpose:** Manage warehouse master data, capacity, and internal stock distribution.

**Columns/Fields:** Warehouse, Location, Capacity, Current Stock, Available Space, Manager, Status.

**Status values:** Active, Near Capacity, Over Capacity, Inactive — via `StatusBadge`, auto-derived from Current Stock vs. Capacity percentage.

**UI Layout:**
- KPI strip: Total Warehouses, Total Capacity (units), Overall Utilization %, Warehouses Near/Over Capacity (count).
- **Warehouse Cards grid** (primary view) — one card per warehouse: name, location, `WarehouseCapacityBar`, current stock, available space, manager name/contact, status badge, "View Details" action.
- `SearchBar` (Warehouse name, Location) + `FilterBar` (Status, Location/Region).
- **Interactive Warehouse View** — clicking a card opens `WarehouseModal` with tabs: **Overview** (capacity bar, key stats), **Stock Distribution** (`WarehouseDistributionChart` — donut of stock value by category within this warehouse, plus a mini table of top products stored), **Transfer Requests** (in/out transfer requests involving this warehouse, with status badges), **Zones** (list of sub-locations/bins within the warehouse, if modeled — e.g., "Zone A – Raw Materials", "Zone B – Finished Goods", each with a mini utilization bar).
- Secondary **table view toggle** — same data as cards in `InventoryTable` form for power users who prefer dense tabular scanning.
- Actions: "Edit Warehouse", "Reassign Manager", "Deactivate Warehouse" (via `ConfirmDialog`).
- `ExportMenu` (CSV/PDF).
- "+ Add Warehouse" button → form (Name, Location, Capacity, Manager, Initial Status).

**Dummy Data:** 4–5 warehouses — e.g., "Chennai Central Warehouse" (Manager: Arun Kumar), "Pune Distribution Hub" (Manager: Sneha Patil), "Mumbai Finished Goods Store", "Delhi Regional Warehouse" — with varied utilization including at least one Near Capacity.

**Future Backend Integration:** `GET/POST/PUT /api/inventory/warehouses`, capacity/utilization recalculated live from Stock Management data server-side, zone-level tracking extensible to full bin/location-level WMS granularity.

---

### 9.7 Stock Transfer & Adjustments (`StockTransfer.jsx` / `StockTransfer.css`)

**Purpose:** Move stock between warehouses and record non-transfer stock changes (damage, loss, expiry write-offs).

**Columns:** Transfer Number, Source Warehouse, Destination Warehouse, Product, Quantity, Reason, Status, Approval.

**Adjustment Type values (for adjustment records, distinct from transfers):** Damaged, Lost, Expired, Recount Correction. **Status values:** Pending, In Transit, Completed, Rejected — via `StatusBadge`.

**UI Layout:**
- KPI strip: Pending Transfers, In-Transit Transfers, Completed This Month, Total Adjustment Value (loss) This Month.
- Tab toggle: **Transfers** / **Adjustments** (two distinct filtered table views sharing the same page shell).
- `SearchBar` (Transfer Number, Product) + `FilterBar` (Source/Destination Warehouse, Status, Reason/Adjustment Type, Date range).
- `InventoryTable`, row click opens detail (reuses `TransferModal` in read/detail mode) showing a **Transfer Timeline** (Requested → Approved → In Transit → Received/Completed, each step timestamped).
- Row actions (Transfers): "Approve" (Pending→In Transit — decrements source warehouse available stock immediately, marks as reserved-in-transit), "Mark Received" (In Transit→Completed — increments destination warehouse stock), "Reject" (via `ConfirmDialog`, requires reason).
- Row actions (Adjustments): "Approve Write-off" (via `ConfirmDialog` — decrements stock and, per Section 12, would post a Finance expense entry).
- `ExportMenu` (CSV/PDF).
- "+ New Transfer" button → `TransferModal` in create/Transfer mode (Source Warehouse, Destination Warehouse, Product, Quantity, Reason). "+ New Adjustment" button → `TransferModal` in create/Adjustment mode (Warehouse, Product, Quantity, Adjustment Type, Reason/Notes).

**Dummy Data:** 6 transfers + 4 adjustments — e.g., "TR-2026-0031" (Chennai → Pune, Cotton Yarn 40s, 500 units, In Transit), "ADJ-2026-0012" (Mumbai, Assembled Motor Unit MX-200, 3 units, Damaged), covering all status/type combinations.

**Future Backend Integration:** `GET/POST /api/inventory/transfers` and `/api/inventory/adjustments`, transfer approval/receipt posts real stock-ledger transactions server-side, adjustment approval triggers a Finance journal entry per the integration contract (see Section 12).

---

### 9.8 Demand-Driven Stock Optimization — AI (`DemandDrivenStockOptimization.jsx` / `DemandDrivenStockOptimization.css`)

**Purpose:** AI-styled predictive dashboard recommending what to reorder, how much, and when, based on demand patterns.

**UI Layout:**
- Hero KPI row: Products Needing Reorder (count), Total Recommended Reorder Value (₹), Average Lead Time (days), Forecast Accuracy (%, illustrative).
- `DemandForecastChart` — line/area chart per selected product: historical demand (solid) transitioning into predicted demand (dashed), with a shaded confidence band, and a seasonal-trend overlay toggle.
- **Product Selector** — dropdown/search to switch the forecast chart and recommendation panel between products.
- **Recommendation Cards grid** — one card per at-risk product: Product name, Current Stock, Predicted Demand (next 30/60/90 days), Recommended Reorder Quantity, Lead Time, Supplier, a color-coded urgency badge (Green: healthy, Yellow: reorder soon, Red: reorder now/stockout risk), and a "Create Purchase Suggestion" action button (opens a confirmation showing what would be sent to a future Procurement module).
- **Seasonal Trend panel** — small multi-line chart comparing this year's demand curve to last year's for a selected product category.
- **Supplier Lead Time table** — Supplier, Product(s) Supplied, Average Lead Time (days), Reliability Score (%).
- **AI Insights panel** — narrative recommendation cards similar in style to Finance's Cash Flow Forecast recommendations (e.g., "Cotton Yarn 40s demand is trending 18% above seasonal average — consider increasing reorder quantity by 200 units", "Steel Rod 12mm lead time has increased from 7 to 12 days — reorder 5 days earlier than usual").
- `SearchBar` + `FilterBar` (Category, Urgency, Warehouse).

**Dummy Data:** demand forecasts for 6–8 products, generated via a deterministic dummy algorithm consistent with Stock Management's current quantities and Sales' historical order patterns (reinforcing cross-module consistency), 4–5 suppliers with realistic Indian supplier names and lead times.

**Future Backend Integration:** real ML forecasting service (time-series model on historical sales/consumption data), `GET /api/inventory/forecast/demand?productId=&horizon=`, "Create Purchase Suggestion" becomes a real draft Purchase Order once Procurement exists.

---

### 9.9 Live OEE Dashboard (`LiveOEEDashboard.jsx` / `LiveOEEDashboard.css`)

**Purpose:** Real-time-styled Overall Equipment Effectiveness monitoring per production line — the classic manufacturing KPI (Availability × Performance × Quality = OEE).

**UI Layout:**
- **Production Line selector** — tabs or dropdown to switch the whole dashboard's focus between lines (PL-01, PL-02, PL-03).
- Hero **OEE gauge cluster** — four radial/gauge charts (`OEEChart.jsx` in gauge mode): Availability %, Performance %, Quality %, and the composite Overall OEE % in the center/largest position, each color-coded (green ≥85%, amber 60–84%, red <60% — configurable thresholds stated inline).
- **Downtime panel** — table/list of downtime events for the selected line today (Reason, Start Time, Duration, Status: Ongoing/Resolved), plus a small donut chart of downtime reasons (Changeover, Breakdown, Maintenance, Material Shortage).
- **Machine Utilization** — horizontal bar list, one bar per machine on the line, showing utilization % for the current shift.
- **Loss Analysis** (`LossAnalysisChart.jsx`) — stacked bar chart breaking down the gap between theoretical max output and actual output into the six classic OEE loss categories (breakdowns, setup/adjustment, idling/minor stops, reduced speed, defects, startup rejects).
- **Shift Performance** — comparison table/mini-chart across shifts (Morning/Afternoon/Night) showing OEE per shift for the current day.
- **Trend Graphs** — `OEEChart.jsx` in line-chart mode: OEE trend over the last 7/30 days for the selected line.
- **Alerts panel** — real-time-styled alert cards ("⚠ PL-02 Availability dropped below 70% — Machine M-204 stopped for maintenance"), color-coded, dismissible.
- A pulsing "Live" badge near the page header, and a "Last updated: X seconds ago" indicator (can be a simulated ticking value updated via `setInterval` against dummy data, without needing a real live feed).

**Dummy Data:** 3 production lines, each with current-shift OEE figures (Availability/Performance/Quality individually, composite calculated as their product), 4–6 downtime events, 4–5 machines per line with utilization %, 7-day trend series.

**Future Backend Integration:** real-time data from shop-floor IoT/SCADA/MES systems via websocket or short-poll `GET /api/inventory/oee/live?lineId=`, downtime events sourced from machine sensor integration, OEE formula computed server-side per shift and rolled up historically.

---

### 9.10 Visual Shop-Floor Map (`VisualShopFloorMap.jsx` / `VisualShopFloorMap.css`)

**Purpose:** Interactive, spatial, real-time-styled visualization of the physical factory/warehouse floor.

**UI Layout:**
- **Factory selector** — switch between factory/warehouse layouts if multiple sites are modeled.
- **Interactive floor layout** — an SVG or CSS-grid-based schematic representing zones as rectangular/rounded tiles arranged to resemble a factory floor: Warehouse Zones (e.g., "Raw Material Storage", "Finished Goods Storage"), Production Lines (PL-01, PL-02, PL-03 as distinct zones), staging/dispatch areas.
- **Status color coding on every tile:** green (Normal/Running), amber (Warning — e.g., near-capacity or minor delay), red (Critical — e.g., blocked, machine down, out-of-stock zone), grey (Idle/Inactive), blue-hatched (Blocked/Restricted Area).
- **Machine status indicators** — small icons/dots within Production Line tiles representing individual machines, each with its own status color and a hover tooltip (Machine ID, current status, current work order if running).
- **Active Work Orders overlay** — Production Line tiles display a small badge with the count/ID of the work order currently running there, clicking navigates to that Work Order's detail in Production Planning.
- **Low Stock Zones overlay** — Warehouse Zone tiles pulse or show a warning icon if any product stored there is Low/Out of Stock (cross-referenced from Stock Management data).
- **Inventory Heatmap toggle** — switches tile coloring from status-mode to a heatmap mode where warehouse zone tiles are shaded by stock density/value (light to dark intensity scale with a legend).
- **Blocked Areas** — explicitly styled tiles (diagonal hatch pattern, red-tinted) representing zones under maintenance or safety lockdown, non-interactive except for a tooltip explaining why.
- **Side panel** — clicking any tile opens a detail side-panel (not a full modal, to preserve spatial context) showing that zone/line's key stats: for a warehouse zone — capacity, current stock value, top products; for a production line — current work order, OEE snapshot (linking to the full OEE Dashboard), assigned team.
- **Legend** — persistent legend explaining every color/icon used on the map.
- **Real-Time Status Indicators** — the same pulsing "Live" badge and "Last updated" ticker pattern as the OEE Dashboard, reinforcing a consistent "live operations" visual language across both pages.

**Responsive behavior (special case):** below 1024px, the spatial map is not practical to interact with via touch/small screens — the page must degrade to a **structured zone list view** (each zone/line as a stacked card with the same status color, icons, and tap-to-expand detail panel), never a shrunk-down unusable miniature map.

**Dummy Data:** one factory layout with 4–6 warehouse zones and 3 production lines, each zone/line pre-assigned a status color and 2–4 sample stats, 3–4 machines per production line with individual statuses, at least one Blocked Area and one Low Stock zone to demonstrate every visual state.

**Future Backend Integration:** zone/machine status sourced from real-time IoT sensors and the same MES/SCADA integration referenced in the OEE Dashboard section; heatmap intensity computed server-side from live Stock Management valuations; layout/zone geometry configurable via an admin layout-editor in a future iteration.

---

## 10. UX Requirements (applies globally)

- **Same premium enterprise look as Sales and Finance:** identical color system, card radius (12–16px), shadow treatment, and typography scale — this module must be visually indistinguishable in quality/polish from its siblings.
- **Glassmorphism:** applied to the top navbar, modal backdrops, and Dashboard KPI cards, consistent with the established pattern.
- **Sticky table headers** on every `InventoryTable` instance.
- **Hover effects:** table rows tint on hover with pointer cursor if clickable; buttons lift slightly on hover; interactive cards (warehouse cards, shop-floor tiles, recommendation cards) get a stronger shadow/border-glow on hover.
- **Skeleton loaders** on every page's initial load and on filter/search changes.
- **Empty states** for every table/list when filters yield zero results (e.g., "No batches match your filters" + "Reset Filters" button).
- **Error states** with retry, demonstrable via simulated occasional dummy-fetch failures or a dev-only trigger, consistent with Finance's approach.
- **Toast notifications** for every create/update/delete/export/import/status-change/approval action.
- **Confirmation dialogs** before irreversible or high-impact actions (delete work order, approve transfer, mark batch quarantined, complete reconciliation-equivalent actions like "Complete Production").
- **Responsive layout** per the breakpoints in Section 8, with the Shop-Floor Map's special-case degradation noted in Section 9.10.
- **Professional, consistent charts** — same color palette and interaction pattern (legend, tooltip, axis labels) as Finance's charts; OEE/gauge visuals use smooth animated needle/arc transitions.
- **"Live" visual language** — pulsing dot badges and "Last updated: Xs ago" tickers on the OEE Dashboard and Shop-Floor Map specifically, to differentiate their real-time character from the more static reporting pages, while still sharing the same base design system.

---

## 11. Dummy Data Standards

All dummy data across every Inventory & Manufacturing page must:

- Use **realistic Indian companies, suppliers, warehouses, and factories** — reuse supplier/customer names already established in the Sales and Finance modules where a cross-module link is being demonstrated (e.g., a supplier appearing in both Batch/Lot Tracking and a future Procurement context), plus Inventory-specific realistic names: warehouses such as Chennai Central Warehouse, Pune Distribution Hub, Mumbai Finished Goods Store, Delhi Regional Warehouse; factories such as Chennai Manufacturing Unit, Pune Assembly Plant; production lines named PL-01/PL-02/PL-03; suppliers such as Shree Balaji Steel Traders, Ganga Textiles Mills, Om Sai Logistics (reused from Finance's AP vendor list where it represents the same real-world entity acting as a goods supplier).
- Use **realistic product/SKU naming** reflecting a plausible manufacturing business (textiles/light industrial/assembly — e.g., Cotton Yarn 40s Count, Steel Rod 12mm, Assembled Motor Unit MX-200, Industrial Fan Blade Assembly, Corrugated Packaging Box – Large), with SKU codes like `SKU-RM-1042`, `SKU-FG-2031`.
- Use **INR currency formatting** throughout (₹ symbol, Indian digit grouping), consistent with the Finance module's `formatCurrency.js` convention.
- Use realistic **document/reference numbers**: Batch IDs (`BLK-0912`), Work Order Numbers (`WO-2026-0041`), Transfer Numbers (`TR-2026-0031`), Adjustment Numbers (`ADJ-2026-0012`), BOM versions (`v1`, `v2`, `v3`).
- Every page/table ships with **5–10 records minimum** as specified per page above, covering a realistic spread of statuses (not all "healthy" — include Low Stock, Delayed, Quarantined, Over Capacity, Rejected examples across the module).
- Dates should be plausible relative to the current date context (recent months, work orders scheduled across the current month, batches with a mix of fresh and near-expiry dates).

---

## 12. Module Integration (Critical Section)

The ERP is one connected system. This section is the binding contract between Inventory & Manufacturing and Sales/Finance, and the forward-looking contract for Procurement, HR, and User Management. Even though this build has no real backend, the **frontend must simulate this connectivity today** (via shared Context state read/written across `SalesDataContext`, `FinanceDataContext`, and `InventoryDataContext`, or an equivalent shared dummy dataset) so the eventual backend swap is a drop-in replacement.

### 12.1 Sales → Inventory

- **Sales Order Confirmed** → reserves stock: the ordered quantity moves from a product's "Available Quantity" into "Reserved Quantity" in `StockManagement.jsx`, visible immediately (this is the frontend realization of the "reserved for future Inventory integration" note left as a placeholder in the Finance README's Sales↔Finance section — Inventory is where that reservation actually lands).
- **Dispatch (Delivery Confirmed in Sales)** → reduces inventory: reserved quantity is released and Available/Total stock decrements; a Stock History entry is appended ("Outbound — Sales Order SO-2026-0118").
- **Sales Return Approved** → increases stock: returned quantity is added back to Available Quantity (assuming the item passes a simple returned-goods condition check, represented as a UI toggle "Restock" vs "Write Off"), and a Stock History entry is appended ("Inbound — Return SO-2026-0118-R1").
- **Stock availability visible during quotation** — the Sales Module's quotation/order-creation screens read live Available Quantity from `InventoryDataContext` to display real-time stock next to each line item.
- **Delivery status linked to inventory** — a Sales Order's delivery status (Pending/Dispatched/Delivered) is derived in part from whether its reserved stock has been converted to a dispatch transaction in Inventory.

### 12.2 Inventory → Sales

- **Available stock displayed during order creation** — same shared-context read described above, surfaced directly in the Sales order form's product line items.
- **Low stock warnings during quotation** — if a requested quantity exceeds Available Quantity (or would push it below Reorder Level), the Sales quotation screen shows an inline warning badge ("Only 40 units available — 60 units will be backordered").
- **Warehouse suggestions** — when multiple warehouses stock the same product, the Sales order form suggests the nearest/highest-stock warehouse to fulfill from, using `WarehouseManagement.jsx` data.
- **Backorder suggestions** — if stock is insufficient, the Sales order form offers a "Create Backorder" option that, on the Inventory side, becomes a visible flag on the relevant `StockManagement` record ("120 units backordered, expected via WO-2026-0044").

### 12.3 Finance ↔ Inventory

- **Inventory valuation updates financial statements** — the total value shown on the Finance Dashboard's balance-sheet-adjacent figures (and conceptually the Fixed-Assets-adjacent "current asset" reporting) is sourced from the sum of `(Available Quantity × Unit Cost)` across `StockManagement.jsx`, read directly from `InventoryDataContext` by the Finance Dashboard.
- **Stock adjustments create journal entries** — approving a "Damaged"/"Lost"/"Expired" adjustment in `StockTransfer.jsx` (Adjustments tab) appends a corresponding entry to Finance's `GeneralLedger.jsx` dummy dataset (Debit: Inventory Write-off Expense, Credit: Inventory Asset), visible immediately on the Finance side — demonstrating the same cross-context write pattern already used for Sales↔Finance.
- **Manufacturing cost updates financial reports** — completing a Work Order in `ProductionPlanning.jsx` computes a rolled-up production cost (from the linked BOM's Cost Breakdown) and posts it as a Manufacturing Expense entry visible in Finance's General Ledger and Budgeting (against the Manufacturing department/cost center).
- **Finished goods update inventory value** — completing a Work Order also increases Stock Management's Finished Goods quantity/value, which flows back into the Finance valuation figure described above — the same event drives both changes atomically in the shared context.
- **Inventory write-offs become expenses** — same mechanism as "stock adjustments create journal entries" above; explicitly called out because write-offs (as opposed to routine transfers) always post to Finance regardless of amount.

### 12.4 Data Flow Diagrams

```
Sales Order Confirmed
        ↓
Stock Reservation (Inventory)
        ↓
Work Order Created / Production (if make-to-order)
        ↓
Dispatch
        ↓
Inventory Reduced
        ↓
Finance Updated (Revenue + Inventory Valuation)
```

```
Work Order Completed (Inventory)
        ↓
Raw Materials Consumed (Stock Reduced)
        ↓
Manufacturing Cost Calculated (from BOM)
        ↓
Finished Goods Stock Increased
        ↓
Finance: Manufacturing Expense Posted + Inventory Valuation Updated
```

```
Stock Adjustment Approved (Damaged / Lost / Expired)
        ↓
Inventory Reduced
        ↓
Finance: Write-off Expense Journal Entry Created
        ↓
Finance Dashboard & Inventory Dashboard Both Updated
```

```
Sales Return Approved
        ↓
Inventory Increased (Restock) or Written Off
        ↓
Finance: Credit Note Adjusts Customer Outstanding
        ↓
Inventory Valuation Recalculated
```

### 12.5 Future Module Integrations

**Inventory ↔ Procurement**
- Low-stock/reorder recommendations from Demand-Driven Stock Optimization become draft Purchase Orders in a future Procurement module.
- Goods Receipt against a Purchase Order automatically creates a new Batch/Lot in `BatchLotTracking.jsx` and increments Stock Management quantities.
- Vendor/supplier lead-time data shown in the Demand-Driven Stock Optimization page will be sourced from Procurement's vendor performance history once that module exists, rather than static dummy figures.

**Inventory ↔ HR**
- Production team assignments in Work Orders (`ProductionPlanning.jsx`) will resolve against a real HR employee master (currently a dummy "Assigned Team" text/dropdown) once HR exists.
- Shift Performance data in the Live OEE Dashboard will link to HR-managed shift schedules and machine-operator attendance.

**Inventory ↔ Manufacturing (deepening within this module)**
- This module already contains core manufacturing capability (BOM, Work Orders, OEE, Shop-Floor Map); future depth includes machine maintenance scheduling, quality management sub-workflows beyond the current Batch QC status, and multi-level BOMs (sub-assemblies referencing other BOMs) — the `BOMModal.jsx` component list structure is designed to be extensible to nested components without a rework.

**Inventory ↔ User & Access Management**
- Role-based permissions will govern who can approve BOM versions, approve Stock Transfers above a value threshold, complete Work Orders, or reclassify a batch's Quality Status — mirroring the Finance module's role/approval pattern (Finance Executive/Manager/CFO-equivalent tiers translated to Inventory-appropriate roles such as Warehouse Executive, Production Manager, Plant Head).
- Every create/edit/delete/status-change/approval action in Inventory will write to the same ERP-wide, module-agnostic audit log used by Finance, not a separate Inventory-only log.

### 12.6 ERP Design Principle

Every module remains independently deployable and independently useful, while sharing data through well-defined interfaces rather than duplicated copies. Product master data, warehouse/stock levels, and work order status are owned exclusively by Inventory & Manufacturing; Sales reads stock availability rather than maintaining its own inventory count, and Finance reads inventory valuation and manufacturing cost rather than maintaining a separate asset ledger disconnected from physical stock reality. This mirrors how SAP S/4HANA's integrated MM/PP modules, Oracle NetSuite's unified inventory-and-financials data model, Microsoft Dynamics 365's Dataverse, Zoho's cross-app inventory sharing, and Odoo's shared Inventory/Manufacturing/Accounting apps keep enterprise operations and financial reporting in permanent agreement.

---

## 13. Build Checklist (for the implementing AI)

1. Scaffold the folder structure exactly as specified in Section 4.
2. Build `InventoryDataContext.jsx` first, seeding all dummy datasets from `data/Inventory/*.js`, and establishing the cross-context read/write bridges into `SalesDataContext` and `FinanceDataContext` described in Section 12.
3. Build shared components (Section 7) before pages, reusing the exact visual/prop contracts already established by the Finance module's shared components.
4. Build `InventorySidebar.jsx`, `InventoryTopbar.jsx`, and `InventoryRoutes.jsx` to establish the shell.
5. Implement pages in this order: Dashboard → Stock Management → Batch/Lot Tracking → Bill of Materials → Production Planning & Work Orders → Warehouse/Location Management → Stock Transfer & Adjustments → Demand-Driven Stock Optimization → Live OEE Dashboard → Visual Shop-Floor Map.
6. Wire the Sales↔Inventory↔Finance simulated integration: confirming a Sales Order should visibly reserve stock; dispatching should reduce it and update Finance revenue/valuation; completing a Work Order should consume raw materials, produce finished goods, and post a manufacturing expense in Finance; approving a write-off adjustment should post a Finance journal entry.
7. Build the two AI-styled pages (Demand-Driven Stock Optimization, Live OEE Dashboard) and the Visual Shop-Floor Map last, since they draw on Stock Management, Production Planning, and Warehouse Management data being fully seeded first.
8. Apply UX polish pass (Section 10): skeletons, empty/error states, toasts, confirm dialogs, responsive breakpoints (including the Shop-Floor Map's list-view degradation), hover states, and the "live" pulsing indicators on the OEE Dashboard and Shop-Floor Map.
9. QA pass: verify every button performs a real state change, every table sorts/filters/paginates, every form validates, every modal opens/closes cleanly, the Sales→Inventory→Finance chain works end-to-end against the seeded dummy data, and the app is fully usable at 1440px, 1024px, and 375px widths.

**End of Inventory & Manufacturing Module README.**
