# Human Resource Module — Complete Implementation Blueprint

## Enterprise ERP System — Frontend + Backend README

**Version:** 1.0
**Module Owner:** Human Resource (HR)
**Consumer:** Frontend and Backend build agent (Antigravity)
**Frontend Stack:** React.js, React Router, separate CSS files, reusable components, no Bootstrap/Tailwind, desktop-first responsive
**Backend Stack:** Node.js, Express.js, MySQL, Sequelize ORM, JWT, Express Validator, Multer, Nodemailer, PDFKit, MVC architecture, Winston/Morgan logging
**Sibling Modules:** Sales Module, Finance & Accounting Module, Inventory & Manufacturing Module (already implemented — this module must integrate with all three)
**Status:** Blueprint only — no code, no SQL, no Sequelize models, no Express routes, no React components are produced here

---

## 0. How This Document Is Organized

This single README contains the complete implementation blueprint for the Human Resource Module, covering both the frontend and the backend, so that another AI (Antigravity) can build the entire module — UI, state, database, APIs, validations, workflows, and cross-module integrations — without asking any further questions.

- **PART A — Frontend Blueprint** (Sections 1–13): design philosophy, folder structure, routing, sidebar, shared components, page-by-page specification, UX requirements, dummy data standards, and frontend-level module integration.
- **PART B — Backend Blueprint** (Sections 14–35): tech stack, folder structure, complete MySQL database design, entity relationships, business rules, REST API design, validation rules, RBAC, approval workflows, email automation, PDF generation, the two AI features' backend logic, audit logging, error handling, security, performance, and backend-level module integration with data flow diagrams.

This module follows the exact same architecture, visual language, folder-naming conventions, and documentation depth already established by the Sales, Finance & Accounting, and Inventory & Manufacturing modules. A user or developer moving between any of these four modules should experience zero discontinuity in design quality or structure.

---

# PART A — FRONTEND BLUEPRINT

## 1. Purpose & Scope

The Human Resource Module is the people-operations core of the ERP system. It manages the full employee lifecycle — from candidate sourcing and AI-assisted resume screening, through interviews, offers, and onboarding, to daily attendance and leave, payroll processing, performance reviews, statutory compliance, and department-level performance analytics.

HR is not a silo. It is the source of truth for employee identity, and every other module depends on it: Finance needs payroll to post salary expense and statutory liability entries; Sales needs employee records to represent salespeople and compute team performance; Inventory & Manufacturing needs employee records to represent production workers, shift assignments, and machine operators; and the future User & Access Management module depends on HR's onboarding/exit events to create and revoke ERP logins. See **Section 12 — Module Integration** for the full frontend-level contract, and Part B, Section 32, for the backend-level contract.

This is a standalone frontend build using React state and dummy data — no backend, no real API calls, no database, until Part B is implemented. Every page must behave like a fully working ERP screen against dummy data; nothing is static.

---

## 2. Design Philosophy

Identical design DNA to the Sales, Finance, and Inventory modules — this must read as the same product, built by the same team.

- **Same visual language** — deep navy/indigo primary, slate neutrals, single accent color for primary actions, semantic green/amber/red status colors, identical card radius (12–16px), identical shadow and typography scale.
- **Human, warm-but-professional tone** — HR pages carry slightly more human warmth than Finance's calm ledger tone or Inventory's operational tone (employee photos, avatars, a friendly Recruitment Kanban board, birthday/anniversary notification chips), while remaining unmistakably enterprise-grade and never playful or consumer-app-like.
- **Glassmorphism used sparingly** — frosted-glass top navbar, modal backdrops, and Dashboard KPI cards, consistent with prior modules.
- **Rounded, elevated cards** — 12–16px radius, soft multi-layer shadows, 1px hairline borders, matching Sales/Finance/Inventory exactly.
- **Professional typography** — same system font stack/type scale as prior modules (page titles 24–28px bold, section headers 18–20px semibold, body 14px, table text 13–14px, uppercase letter-spaced eyebrow labels).
- **Consistent motion** — 150–250ms ease-in-out transitions on hover, modal open/close, toast entry/exit, Kanban card drag.
- **Desktop-first, fully responsive** — 1440px+ primary target, gracefully degrading to 1024px tablet and 375–428px mobile, using the same breakpoint scheme as prior modules.

---

## 3. Tech Stack & Constraints

- **React.js** (functional components + Hooks only: `useState`, `useEffect`, `useMemo`, `useReducer`, `useContext`)
- **React Router v6** for routing between HR pages
- **Separate CSS files per page/component** — one dedicated `.css` file per page, imported directly. No CSS-in-JS.
- **No Bootstrap. No Tailwind.** All styling hand-authored.
- **No backend, no real API calls in the frontend build.** All data is local dummy data seeded into React state.
- **Charting library:** same lightweight React charting library used in Finance/Inventory (e.g., Recharts) for line/bar/area/donut/radar charts (a radar/spider chart is useful for the Department Performance Scorecard's multi-dimension comparison). If unavailable, build charts as SVG-based custom components, treated as black boxes with defined props.
- **Icons:** same consistent icon set used across all prior modules (e.g., Lucide React).
- **File handling (frontend simulation):** resume upload and document upload inputs accept a real file via `<input type="file">` but do not upload anywhere — the filename and a simulated parsed result are stored in React state, consistent with how the Finance module's `ImportModal` simulates file import.
- **State management:** local component state + a shared `HRDataContext` (React Context) holding all HR dummy datasets, mirroring `SalesDataContext`, `FinanceDataContext`, and `InventoryDataContext` — this is what allows HR ↔ Sales ↔ Finance ↔ Inventory integration to be simulated on the frontend (see Section 12).

---

## 4. Complete Folder Structure

```
src/
├── pages/
│   └── HumanResources/
│       ├── Dashboard.jsx
│       ├── EmployeeDirectory.jsx
│       ├── AttendanceLeave.jsx
│       ├── PayrollProcessing.jsx
│       ├── RecruitmentOnboarding.jsx
│       ├── PerformanceManagement.jsx
│       ├── StatutoryCompliance.jsx
│       ├── DepartmentPerformanceScorecard.jsx
│       └── AIResumeScreening.jsx
│
├── components/
│   └── HumanResources/
│       ├── HRSidebar.jsx
│       ├── HRTopbar.jsx
│       ├── HRDashboardCards.jsx
│       ├── KpiCard.jsx
│       ├── EmployeeTable.jsx
│       ├── EmployeeModal.jsx
│       ├── EmployeeDrawer.jsx
│       ├── AttendanceTable.jsx
│       ├── AttendanceCalendar.jsx
│       ├── LeaveApplicationModal.jsx
│       ├── LeaveApprovalModal.jsx
│       ├── PayrollTable.jsx
│       ├── PayslipModal.jsx
│       ├── SalaryStructureModal.jsx
│       ├── RecruitmentBoard.jsx
│       ├── CandidateModal.jsx
│       ├── InterviewModal.jsx
│       ├── OfferLetterModal.jsx
│       ├── OnboardingChecklist.jsx
│       ├── GoalModal.jsx
│       ├── ReviewModal.jsx
│       ├── PerformanceChart.jsx
│       ├── ComplianceReportModal.jsx
│       ├── DepartmentScoreCard.jsx
│       ├── ResumeUploadModal.jsx
│       ├── ResumeRankingCard.jsx
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
│       │
│       └── Charts/
│           ├── AttendanceChart.jsx
│           ├── PayrollChart.jsx
│           ├── DepartmentChart.jsx
│           ├── RecruitmentChart.jsx
│           ├── PerformanceTrendChart.jsx
│           ├── EmployeeGrowthChart.jsx
│           ├── ComplianceChart.jsx
│           ├── ScorecardHeatmap.jsx
│           └── ResumeMatchChart.jsx
│
├── context/
│   └── HRDataContext.jsx   (seeds & exposes all HR dummy data + shared HR↔Sales↔Finance↔Inventory bridge state)
│
├── data/
│   └── HumanResources/
│       ├── employeeData.js
│       ├── attendanceData.js
│       ├── leaveData.js
│       ├── payrollData.js
│       ├── recruitmentData.js
│       ├── performanceData.js
│       ├── complianceData.js
│       ├── departmentScoreData.js
│       └── resumeScreeningData.js
│
├── utils/
│   ├── formatCurrency.js   (INR formatting, shared convention with Finance module)
│   ├── formatDate.js
│   ├── exportToCSV.js
│   ├── exportToPDF.js
│   ├── validators.js
│   └── hrHelpers.js  (leave balance calc, working hours calc, payroll net-salary calc, resume match score calc, department score calc)
│
├── css/
│   └── HumanResources/
│       ├── HRLayout.css   (sidebar, topbar, shared page shell)
│       ├── Dashboard.css
│       ├── EmployeeDirectory.css
│       ├── AttendanceLeave.css
│       ├── PayrollProcessing.css
│       ├── RecruitmentOnboarding.css
│       ├── PerformanceManagement.css
│       ├── StatutoryCompliance.css
│       ├── DepartmentPerformanceScorecard.css
│       ├── AIResumeScreening.css
│       └── components/
│           ├── HRDashboardCards.css
│           ├── EmployeeTable.css
│           ├── SearchBar.css
│           ├── FilterBar.css
│           ├── StatusBadge.css
│           ├── Pagination.css
│           ├── Modal.css
│           ├── Toast.css
│           ├── SkeletonLoader.css
│           ├── EmptyErrorState.css
│           └── RecruitmentBoard.css  (Kanban column/card styling)
│
└── routes/
    └── HRRoutes.jsx
```

**Rule:** every page component imports exactly one page-level CSS file named identically to itself (e.g., `PayrollProcessing.jsx` → `PayrollProcessing.css`). Shared components import their own CSS file from `css/HumanResources/components/`. No inline styles except computed dynamic values (e.g., a goal-completion progress-bar width, a heatmap cell's computed fill color, a Kanban card's drag-transform).

---

## 5. Routing

Mount all HR pages under `/hr/*` using React Router, nested inside the ERP shell layout (already established by Sales, Finance, and Inventory):

| Path | Component |
|---|---|
| `/hr` or `/hr/dashboard` | `Dashboard.jsx` |
| `/hr/employee-directory` | `EmployeeDirectory.jsx` |
| `/hr/attendance-leave` | `AttendanceLeave.jsx` |
| `/hr/payroll-processing` | `PayrollProcessing.jsx` |
| `/hr/recruitment-onboarding` | `RecruitmentOnboarding.jsx` |
| `/hr/performance-management` | `PerformanceManagement.jsx` |
| `/hr/statutory-compliance` | `StatutoryCompliance.jsx` |
| `/hr/department-scorecard` | `DepartmentPerformanceScorecard.jsx` |
| `/hr/ai-resume-screening` | `AIResumeScreening.jsx` |

`HRRoutes.jsx` exports a `<Routes>` block mounted inside the ERP's main `AppRoutes`, alongside `SalesRoutes`, `FinanceRoutes`, and `InventoryRoutes`.

---

## 6. HR Sidebar

A dedicated `HRSidebar.jsx`, visually identical in structure to the sidebars of the prior three modules (same width, collapse behavior, active-link highlight style), listing:

1. Dashboard — icon: layout/grid
2. Employee Directory — icon: users/id-card
3. Attendance & Leave — icon: calendar-check
4. Payroll Processing — icon: wallet/banknote
5. Recruitment & Onboarding — icon: user-plus/briefcase
6. Performance Management — icon: target/trending-up
7. Statutory Compliance — icon: shield-check
8. Department Performance Scorecard — icon: bar-chart-2 (with a small "AI" sparkle to match the visual convention used for Finance's AI Cash Flow Forecast and Inventory's Demand-Driven Stock Optimization)
9. AI Resume Screening — icon: scan-search/sparkles

Behavior:
- Active route highlighted with accent-colored left border + tinted background + bold label, identical mechanism to prior modules.
- Collapses to icon-only rail on tablet, off-canvas drawer on mobile (triggered from `HRTopbar.jsx`).
- Badge counters next to "Attendance & Leave" (pending leave-request count) and "Recruitment & Onboarding" (open job openings count), pulled from `HRDataContext`, updating live as state changes.
- The shared "Module Switcher" element (already defined by Sales/Finance/Inventory) lets the user jump between Sales, Finance, Inventory, HR, and (future, disabled/greyed) Procurement, Marketing, CRM, User Management.

---

## 7. Shared Component Contracts

Reuses the exact same base component contracts established across Sales, Finance, and Inventory (identical prop shapes and visual treatment), extended with HR-specific components.

**`HRDashboardCards.jsx` / `KpiCard.jsx`** — props: `title`, `value`, `subtext`, `icon`, `trend` (`{direction, percent}`), `variant` (`'default'|'success'|'warning'|'danger'`), `loading`. Identical visual spec to prior modules' `KpiCard`.

**`EmployeeTable.jsx`** (specific instance of the generic table pattern used across modules) — `columns`, `rows`, `onSort`, `sortConfig`, `emptyMessage`, `loading`. Sticky header, sortable columns, row hover highlight, avatar/photo thumbnail rendered in the leftmost data column, row click opens `EmployeeDrawer.jsx` (not a modal — see below), responsive collapse to stacked cards under 768px.

**`AttendanceTable.jsx`**, **`PayrollTable.jsx`** — same generic table contract, specialized column sets per page (detailed in Section 9).

**`SearchBar.jsx`** — controlled, debounced (300ms), clear button, page-specific placeholder (e.g., "Search employees, ID, email…").

**`FilterBar.jsx`** — horizontal dropdown filter row (page-specific fields), instant-filter behavior, "Reset Filters" link, collapses to accordion on mobile.

**`DateRangeFilter.jsx`** — from/to pickers + presets (Today, Last 7 Days, This Month, Last Quarter, Custom).

**`StatusBadge.jsx`** — pill badge, shared status→color map extended with HR-specific statuses:
- Active / Approved / Present / Completed / Verified / Selected / Filed / Cleared → green
- On Leave / Pending / Half Day / In Progress / Under Review / Screening / Interview Scheduled → amber
- Absent / Rejected / Overdue / Late / OfferDeclined / High Risk → red
- Inactive / On Notice / Draft / Not Started / Cancelled → grey
- Offer Extended / Onboarded / Selected → blue

**`Pagination.jsx`** — page-size selector (10/25/50), prev/next, numbered buttons, "Showing X–Y of Z records." Default 10 rows per page.

**`ExportMenu.jsx`** — "Export ▾" dropdown: CSV, PDF, and Excel where specified (e.g., Statutory Compliance). Client-side CSV Blob download / print-styled PDF view, success toast.

**`ImportModal.jsx`** — simulated bulk import (e.g., bulk employee import, bulk attendance upload): fake file upload, fake parsing progress bar, injects pre-baked dummy rows into state, success toast.

**`ConfirmDialog.jsx`** — Yes/No confirmation before destructive/state-changing actions (e.g., "Deactivate Employee?", "Approve Leave Request?", "Reject Candidate?", "Generate Payroll for July 2026?"). Props: `title`, `message`, `confirmLabel`, `danger`, `onConfirm`, `onCancel`.

**`Toast.jsx` / `ToastContainer.jsx`** — bottom-right stacked toasts, success/error/info/warning, auto-dismiss 3.5s, triggered on every meaningful action.

**`SkeletonLoader.jsx`** — shimmer placeholders on mount and filter/search changes (~600–900ms simulated latency).

**`EmptyState.jsx`** / **`ErrorState.jsx`** — identical contract to prior modules' versions, plus a dedicated "No Data" variant explicitly requested for HR (e.g., "No performance reviews recorded for this cycle yet") distinguished from the filtered-empty-state message.

**`EmployeeModal.jsx`** — create/edit employee form (full field set, see Section 9.2).

**`EmployeeDrawer.jsx`** — a right-side sliding drawer (distinct from a centered modal, to allow browsing the table behind it) showing full employee profile in tabs: **Overview** (photo, contact, department/designation/manager), **Employment** (joining date, employment type, work location, salary structure summary), **Attendance & Leave** (mini calendar + leave balance chips), **Documents** (uploaded document list with verification status), **Performance** (latest review summary), **Assets** (assigned assets, mirroring Inventory's `fixed_assets` — see Section 12).

**`AttendanceCalendar.jsx`** — month-grid calendar component, each day cell color-coded by attendance status (Present/Absent/Half Day/On Leave/Holiday/Week Off), used both in the Attendance & Leave page and inside `EmployeeDrawer.jsx`.

**`LeaveApplicationModal.jsx`** — employee-facing leave application form: Leave Type, Start Date, End Date, Reason, live-computed Number of Days and remaining balance preview, submit button disabled if requested days exceed balance.

**`LeaveApprovalModal.jsx`** — manager-facing approval view: request detail, requester's current leave balance, Approve/Reject buttons (Reject requires a reason field), routes through `ConfirmDialog`.

**`PayslipModal.jsx`** — read-only formatted payslip preview (mirrors the eventual PDF layout) with "Download PDF" and "Email Payslip" buttons (simulated: shows a toast confirming the action).

**`SalaryStructureModal.jsx`** — view/edit an employee's salary structure: component list (Basic, HRA, Conveyance, Special Allowance, etc.) with calculation type (Fixed / % of Basic) and computed CTC roll-up.

**`RecruitmentBoard.jsx`** — Kanban board component: columns per candidate stage (Applied → Screening → Interview Scheduled → Interviewed → Offer Extended → Offer Accepted → Onboarded, plus a Rejected column), drag-and-drop (or click-to-advance buttons as an accessible alternative) to move a candidate card between stages, each card showing candidate photo/initials, name, applied role, AI match score badge (from Resume Screening, if available).

**`CandidateModal.jsx`** — candidate detail: contact info, resume link, applied job opening, current stage, `InterviewModal` launcher, `OfferLetterModal` launcher, Documents tab, Background Verification status toggle.

**`InterviewModal.jsx`** — schedule/edit an interview: round, interviewer (dropdown of employees), date/time, mode, and post-interview feedback/rating/recommendation fields.

**`OfferLetterModal.jsx`** — generate/preview an offer letter: designation, offered CTC, joining date, status actions (Send, Mark Accepted, Mark Declined, Withdraw) — accepting an offer triggers the "Create Employee Automatically" workflow described in Section 9.5.

**`OnboardingChecklist.jsx`** — checklist component (Document Collection, IT Setup, Induction Session, Policy Acknowledgment, Asset Allocation), each item toggleable Pending→In Progress→Completed.

**`GoalModal.jsx`** — create/edit an employee goal (title, description, target metric, weight %, completion % slider).

**`ReviewModal.jsx`** — performance review workflow: Self-Assessment tab (employee-entered rating + comments), Manager Review tab (manager rating + comments), Final Rating tab (HR-finalized rating, promotion/training recommendation toggles), with a visible stage tracker (Self Review → Manager Review → HR Final Review → Completed).

**`ComplianceReportModal.jsx`** — preview a generated statutory report (PF/ESI/TDS/Professional Tax summary) before download, consistent visually with Finance's `GSTReportModal`.

**`ResumeUploadModal.jsx`** — simulated resume upload + job-description selector, triggers a simulated AI scoring result appended to the candidate/resume-score dataset.

**`ResumeRankingCard.jsx`** — compact ranked candidate card showing Overall AI Score (large %), sub-scores (Skill/Experience/Education/Certification Match as small horizontal bars), and Shortlist/Reject action buttons.

**`DepartmentScoreCard.jsx`** — department summary card: department name, overall score (large number, color-coded), Attendance %, Goal Achievement %, Avg. Performance Rating, Employee Count, small trend arrow, "View Details" action.

**Charts (`Charts/` folder)** — each chart takes `data` and `height` props, responsive width, legend, tooltips, axis labels, shared palette. `ScorecardHeatmap.jsx` renders a grid (departments × months or departments × metrics) with cell shading by score intensity. `ResumeMatchChart.jsx` renders a horizontal multi-bar or radar chart comparing a candidate's four match dimensions.

---

## 8. Global Cross-Cutting Functionality (applies to every page)

- **Search** — client-side, debounced, case-insensitive, across relevant text fields.
- **Filters** — client-side `Array.filter`, multiple filters combine with AND logic.
- **Sorting** — click-to-sort, tri-state (asc → desc → none).
- **Pagination** — client-side slicing of filtered/sorted array, 10 per page default.
- **CRUD** — Create/Edit forms in modals or drawers; Delete requires `ConfirmDialog`; all mutations go through `HRDataContext` reducer actions; every operation shows a toast.
- **Status changes** — status dropdown/action button changes state instantly and ripples across dependent widgets (e.g., approving a leave request instantly updates the requester's leave balance, the pending-count sidebar badge, and the Attendance Calendar).
- **Validation** — required fields, valid email/phone formats, date logic (joining date ≥ offer acceptance date, leave end date ≥ start date, interview date in the future when scheduling), numeric fields (salary ≥ 0, rating between 1–5), inline red helper text, disabled submit until valid.
- **Loading states** — skeleton loaders on initial mount and on filter/search changes (~600ms simulated latency).
- **Responsive behavior** — identical breakpoint scheme to prior modules: `≥1440px` full multi-column; `1024–1439px` condensed grid; `768–1023px` icon-rail sidebar, horizontally scrolling tables; `<768px` drawer sidebar, stacked-card tables, accordion filters, single-column KPI cards. The Recruitment Kanban board degrades to a single-column, stage-grouped accordion list below 1024px (drag-and-drop is impractical on touch at that width; stage-advance buttons remain available).

---

## 9. Page-by-Page Specification

### 9.1 Dashboard (`Dashboard.jsx` / `Dashboard.css`)

**Purpose:** Single-glance workforce command center for HR leadership and managers.

**Layout (top to bottom):**

1. **Page header** — "HR Dashboard", subtitle "Workforce Overview", date indicator, "Quick Actions" button cluster.
2. **KPI Card Row (8 cards):** Total Employees, Today's Attendance %, Present Employees, Absent Employees, On Leave, Pending Leave Requests, Upcoming Reviews, Open Job Positions — each a `KpiCard` with trend arrow vs. previous period.
3. **Secondary KPI strip:** New Joiners (this month), Payroll Status (this month's processing state as a badge + amount).
4. **Department Distribution** — donut chart (`DepartmentChart`) of employee headcount by department, with a legend table (Department, Headcount, % of Total).
5. **Recruitment Pipeline** — compact funnel visualization (Applied → Screening → Interview → Offer → Onboarded counts), `RecruitmentChart`, "View Full Pipeline →" link to Recruitment & Onboarding.
6. **Employee Growth Trend** — `EmployeeGrowthChart` (line/area, headcount over the last 12 months, joiners vs. exits overlay).
7. **Two-column split:**
   - Left — **Upcoming Reviews** (mini-table: employee, cycle, due date, "View" action).
   - Right — **Notifications** panel — feed (e.g., "3 leave requests pending your approval", "Priya Sharma's work anniversary is tomorrow", "PF filing due in 5 days"), dismissible, severity icon.
8. **Quick Actions panel** — buttons: "Add Employee", "Apply Leave", "Run Payroll", "Post Job Opening", "Schedule Interview" — each opens the relevant modal or navigates.
9. **Recent Activities** — timeline list (e.g., "Anjali Mehta approved Rohit Verma's leave request — 1 hour ago", "Payroll for June 2026 processed — Yesterday"), visual pattern reused from prior modules' activity feeds.

**Dummy Data:** 12 months of headcount trend, department distribution across 6–8 departments, 6 upcoming reviews, 6 notifications, 8 activity feed entries, all using realistic Indian employee/department names (see Section 11).

**Future Backend Integration:** all KPIs/charts computed client-side today; production becomes `GET /api/hr/dashboard/summary` and related aggregation endpoints (see Part B, Section 20.1).

---

### 9.2 Employee Directory (`EmployeeDirectory.jsx` / `EmployeeDirectory.css`)

**Purpose:** Master system of record for every employee — the HR equivalent of Finance's Chart of Accounts or Inventory's Stock Management, and the entity every other module's employee-linked feature points back to.

**Columns:** Employee ID, Employee Photo (avatar thumbnail), Employee Name, Department, Designation, Reporting Manager, Employment Type, Joining Date, Phone, Email, Work Location, Status.

**Status values:** Active, Inactive, On Notice, Exited — via `StatusBadge`.

**UI Layout:**
- KPI strip: Total Employees, Active Employees, New Joiners (30 days), Average Tenure (years).
- `SearchBar` (Name, Employee ID, Email) + `FilterBar` (Department, Designation, Status, Work Location).
- `EmployeeTable` — sortable, sticky header, avatar thumbnail in first column, row click opens `EmployeeDrawer`.
- `ExportMenu` (CSV/PDF) + "Import Employees" button opening `ImportModal`.
- "+ Add Employee" button → `EmployeeModal` full form: Personal (Name, DOB, Gender, Marital Status, Photo upload), Contact (Phone, Email, Address), Employment (Department, Designation, Reporting Manager dropdown, Employment Type, Joining Date, Work Location), Bank Details (Account Number, IFSC — masked display), Documents (upload placeholders).
- Row/drawer actions: "Edit Employee" (opens `EmployeeModal` pre-filled), "Deactivate Employee" (via `ConfirmDialog`, flips status to Inactive, does not delete), "Delete Employee" (via `ConfirmDialog` with an extra typed-confirmation safeguard, since this is destructive), "Initiate Exit" (opens a lightweight exit form: exit type, last working day — creates an `employee_exits`-equivalent dummy record and flips status to On Notice).
- `Pagination` — 10 per page.

**Dummy Data:** 10 realistic employees across departments (Sales, Finance, Manufacturing, HR, IT, Marketing, Procurement) — e.g., "Priya Sharma" (Finance, Senior Accountant, Mumbai), "Rohit Verma" (Manufacturing, Production Supervisor, Pune), "Anjali Mehta" (HR, HR Manager, Bengaluru), "Karan Malhotra" (Sales, Sales Executive, Delhi) — with realistic Indian phone/email formats and a spread of statuses including at least 1 On Notice.

**Future Backend Integration:** `GET/POST/PUT/DELETE /api/hr/employees`, employee creation triggers the future User & Access Management ERP-login-creation event, deactivation/exit triggers login revocation (see Section 12 and Part B, Section 32).

---

### 9.3 Attendance & Leave (`AttendanceLeave.jsx` / `AttendanceLeave.css`)

**Purpose:** Daily attendance tracking and leave application/approval in one unified page.

**Attendance fields/columns:** Employee, Date, Clock In, Clock Out, Working Hours, Break Time, Late Entry (flag), Status.
**Leave fields:** Employee, Leave Type, Start Date, End Date, Number of Days, Status, Approved By.
**Leave Types:** Casual Leave, Sick Leave, Earned Leave, Maternity Leave (and Paternity Leave, Loss of Pay included for completeness).

**UI Layout:**
- Tab toggle: **Attendance** / **Leave Management**.
- **Attendance tab:**
  - KPI strip: Present Today, Absent Today, On Leave Today, Late Entries Today.
  - View toggle: **Table View** (`AttendanceTable` — sortable, sticky header) / **Calendar View** (`AttendanceCalendar` — month grid per selected employee, color-coded days).
  - `SearchBar` (Employee) + `FilterBar` (Department, Status, Date range).
  - Row actions (Manager/Admin context): "Edit Attendance" (manual correction with a mandatory reason field, logged), "Mark Manual Clock-Out" (for missed punches).
  - `ExportMenu` (CSV/PDF attendance register) + "Bulk Upload Attendance" button opening `ImportModal`.
- **Leave Management tab:**
  - KPI strip: Pending Requests, Approved This Month, Leave Balance Summary (aggregate), Employees Currently on Leave.
  - `SearchBar` (Employee) + `FilterBar` (Leave Type, Status, Date range, Department).
  - Leave Balance panel — per-employee balance chips (Casual: 8/12, Sick: 4/10, Earned: 12/15) shown when an employee is selected/searched.
  - Table of leave requests, row click opens `LeaveApprovalModal` (manager/HR context) or shows read-only detail (employee context viewing their own request).
  - "+ Apply Leave" button → `LeaveApplicationModal` (employee self-service).
  - Row actions: "Approve" / "Reject" (via `LeaveApprovalModal` → `ConfirmDialog`), "Cancel Request" (employee-initiated, only while still Pending).
  - `ExportMenu` (CSV/PDF leave register).

**Dummy Data:** 10 attendance records for the current week across multiple employees (mixed Present/Absent/Half Day/Late Entry), 10 leave requests across leave types and statuses (including at least 3 Pending, 1 Rejected), leave balances seeded per employee consistent with their leave type quotas.

**Future Backend Integration:** `GET/POST/PUT /api/hr/attendance`, `GET/POST/PATCH /api/hr/leave-requests`, real biometric/web-punch clock-in integration, leave approval routes through the approval workflow (Part B, Section 22), attendance feeds Inventory's shift/production reports (Section 12).

---

### 9.4 Payroll Processing (`PayrollProcessing.jsx` / `PayrollProcessing.css`)

**Purpose:** Monthly salary computation, approval, and payslip distribution.

**Columns:** Employee, Basic Salary, Allowances, Overtime, Bonus, PF, ESI, Professional Tax, TDS, Other Deductions, Net Salary, Payroll Status.

**Payroll Status values:** Draft, Pending Approval, Approved, Processed, Paid, On Hold — via `StatusBadge`.

**UI Layout:**
- KPI strip: Total Payroll Cost (this month), Employees Processed, Pending Approvals, Average Net Salary.
- Month/Year selector (drives which payroll run is displayed).
- `SearchBar` (Employee) + `FilterBar` (Department, Payroll Status).
- `PayrollTable` — sortable, sticky header, Net Salary right-aligned and bold, row click opens `PayslipModal`.
- **Department Payroll Summary** panel — table/chart (`PayrollChart`) breaking down total payroll cost by department.
- **Salary Trend** panel — line chart of total payroll cost over the last 6 months.
- Row actions: "Generate Payslip" (Draft/Approved→ generates the `PayslipModal` preview), "Download Payslip" (simulated download + toast), "Email Payslip" (simulated send + toast, logs to a dummy notification list).
- Page-level actions: "Run Payroll for [Month]" (primary CTA — simulates bulk-generating Draft payroll rows for all active employees from their `SalaryStructureModal` data, shows a progress state then success toast), "Submit for Approval" (Draft→Pending Approval), "Approve Payroll" (Pending Approval→Approved, manager/Finance-Manager-gated action represented in UI), "Mark as Paid" (Approved→Paid).
- Row click on an employee's salary also allows "Edit Salary Structure" → `SalaryStructureModal`.
- `ExportMenu` (CSV/PDF payroll register).

**Dummy Data:** 10 payroll records for the current month across departments, with realistic Indian salary figures (₹25,000–₹1,50,000 basic range), correct PF (12% of Basic, capped), ESI (0.75% where applicable), Professional Tax (₹200 slab), and a plausible TDS figure for higher earners — statuses spread across Draft/Pending Approval/Approved/Paid.

**Future Backend Integration:** `GET/POST /api/hr/payroll`, `POST /api/hr/payroll/run`, `POST /api/hr/payroll/:id/approve`, payroll processing posts Finance journal entries and updates Bank Reconciliation (Part B, Section 32.1), payslip generation/email becomes real PDFKit + Nodemailer calls.

---

### 9.5 Recruitment & Onboarding (`RecruitmentOnboarding.jsx` / `RecruitmentOnboarding.css`)

**Purpose:** End-to-end hiring pipeline from job posting to a fully onboarded employee.

**UI Layout:**
- Tab toggle: **Job Openings** / **Candidate Pipeline (Kanban)** / **Onboarding**.
- **Job Openings tab:**
  - KPI strip: Open Positions, Total Applications, Average Time-to-Fill (days), Offers Extended.
  - `InventoryTable`-pattern table: Job Title, Department, Positions, Applications Count, Status, Posted Date, Closing Date.
  - "+ Post Job Opening" button → form (Job Title, Department, Designation, Number of Positions, Employment Type, Job Description, Closing Date).
  - Row actions: "View Applications" (jumps to Kanban filtered by this opening), "Close Opening" (via `ConfirmDialog`).
- **Candidate Pipeline tab:**
  - `RecruitmentBoard.jsx` Kanban: columns Applied → Screening → Interview Scheduled → Interviewed → Offer Extended → Offer Accepted → Onboarded, plus a separate Rejected column/filter.
  - `SearchBar` (Candidate name) + `FilterBar` (Job Opening, Source, Status).
  - Card click opens `CandidateModal`: **Profile** tab (contact, resume link, source), **Interviews** tab (list + "Schedule Interview" → `InterviewModal`), **Offer** tab (`OfferLetterModal` launcher, offer status), **Documents** tab (resume, ID proof placeholders), **Background Verification** tab (status toggle: Pending/In Progress/Cleared/Flagged).
  - Advancing a candidate to "Offer Accepted" and then completing onboarding triggers the **"Create Employee Automatically"** workflow: a confirmation dialog ("Create employee record for Karan Malhotra?") that, on confirm, appends a new row to the Employee Directory's dummy dataset pre-filled from the candidate/offer data, and moves the card to "Onboarded."
- **Onboarding tab:**
  - Table of employees currently in onboarding (converted from accepted offers), each row expandable to `OnboardingChecklist.jsx` (Document Collection, IT Setup, Induction Session, Policy Acknowledgment, Asset Allocation — each independently toggleable).
  - KPI strip: Employees in Onboarding, Checklist Completion % (average), Overdue Onboarding Tasks.

**Dummy Data:** 4 job openings (e.g., "Production Supervisor – Manufacturing", "Sales Executive – North Region", "Accounts Executive – Finance", "React Developer – IT"), 10 candidates spread realistically across pipeline stages with Indian names, at least 2 with Offer Extended/Accepted status and one fully Onboarded to demonstrate the full lifecycle, 2–3 onboarding checklists in varying completion states.

**Future Backend Integration:** `GET/POST/PATCH /api/hr/job-openings`, `/api/hr/candidates`, `/api/hr/interviews`, `/api/hr/offer-letters`, `/api/hr/onboarding-tasks`; the "Create Employee Automatically" action becomes a real backend workflow (Part B, Sections 22 and 32.4) that also creates the ERP login via User & Access Management.

---

### 9.6 Performance Management (`PerformanceManagement.jsx` / `PerformanceManagement.css`)

**Purpose:** Goal-setting, quarterly reviews, and rating consolidation across the self/manager/HR review chain.

**Columns:** Employee, Performance Cycle, Goal Completion %, Self Assessment Rating, Manager Rating, Final Rating, Promotion Recommendation, Training Recommendation, Review Status.

**Review Status values:** Self Review Pending, Manager Review Pending, HR Review Pending, Completed — via `StatusBadge`.

**UI Layout:**
- KPI strip: Active Cycle Name, Reviews Completed %, Average Final Rating, Promotion Recommendations (count).
- Performance Cycle selector (e.g., "Q2 FY2026-27").
- `SearchBar` (Employee) + `FilterBar` (Department, Review Status, Rating range).
- `InventoryTable`-pattern table, row click opens `ReviewModal` with the four-stage tracker (Self Review → Manager Review → HR Final Review → Completed), each stage's rating and comments visible/editable depending on the viewing role context simulated in the UI.
- **Employee Goals sub-section** (within `ReviewModal` or a dedicated tab): list of goals for the cycle, each with title, target metric, weight %, and a completion % slider (`GoalModal` for add/edit), overall Goal Completion % computed as the weighted average.
- `PerformanceChart` — bar/radar comparing Self vs. Manager vs. Final rating per employee for the selected cycle.
- **Performance Trend** panel — `PerformanceTrendChart` (line, an employee's or department's average rating over the last 4 cycles).
- **Review Timeline** — visual stepper showing cycle-wide progress (how many employees are at each review stage).
- Actions: "Start Self Review" (employee context), "Submit Manager Review", "Finalize Rating" (HR context, sets Promotion/Training recommendation toggles), all via `ReviewModal`, each transition confirmed and toasted.
- `ExportMenu` (CSV/PDF review summary).

**Dummy Data:** 10 performance reviews across the active cycle and employees, spanning all review-status stages, with realistic 1–5 rating scales, at least 2 marked Promotion Recommended and 2 Training Recommended, 3–4 goals per featured employee with varied completion percentages.

**Future Backend Integration:** `GET/POST/PATCH /api/hr/performance-reviews`, `/api/hr/employee-goals`, review-stage transitions enforce the Business Rule that an employee cannot review themselves as their own manager-reviewer (Part B, Section 21), finalized ratings feed the Department Performance Scorecard (Section 9.8).

---

### 9.7 Statutory Compliance (`StatutoryCompliance.jsx` / `StatutoryCompliance.css`)

**Purpose:** Central hub for PF, ESI, TDS, Professional Tax, and labour-law compliance tracking — the HR counterpart to Finance's Taxation/GST page.

**UI Layout:**
- KPI/Summary cards: **PF Summary** (total contribution this month, employee count), **ESI Summary**, **TDS Summary**, **Professional Tax Summary** — each a `KpiCard`.
- **Monthly Compliance Status panel** — table/list of compliance filing periods (PF – Jul 2026, ESI – Jul 2026, TDS – Jul 2026, Professional Tax – Jul 2026), each with a Filing Status badge (Filed / Pending / Overdue) and due-date countdown chip, matching the visual convention of Finance's GST filing status list.
- **Compliance Calendar** — upcoming due dates sorted chronologically, color-coded (green >7 days, amber ≤7 days, red overdue), same threshold convention as Finance's Compliance Pack.
- **Labour Compliance panel** — checklist-style cards for non-monetary statutory items (Minimum Wage Compliance, Working Hours Compliance, POSH Committee Status, Statutory Registers Updated), each with a status toggle and last-verified date.
- **Compliance Alerts** — dismissible alert cards (e.g., "⚠ ESI filing for July 2026 due in 3 days", "⚠ 2 employees missing PAN documents required for TDS filing").
- `SearchBar` + `FilterBar` (Compliance Type, Period, Filing Status).
- Actions: "Generate Report" (opens `ComplianceReportModal` preview), "Download PDF", "Export Excel".
- `ExportMenu`.

**Dummy Data:** 4 compliance types × 3 recent periods (12 records) with a realistic mix of Filed/Pending/Overdue, PF/ESI amounts computed consistently with Payroll Processing's dummy salary data (reinforcing cross-page consistency), 4 labour compliance checklist items.

**Future Backend Integration:** `GET /api/hr/compliance/records`, `POST /api/hr/compliance/:id/file`, `POST /api/hr/compliance/reports/generate`, PF/ESI/TDS figures auto-computed from Payroll and posted to Finance's statutory liability accounts (Part B, Section 32.1).

---

### 9.8 Department Performance Scorecard — AI (`DepartmentPerformanceScorecard.jsx` / `DepartmentPerformanceScorecard.css`)

**Purpose:** AI-styled cross-department analytics combining attendance, goal achievement, performance ratings, and productivity into one comparable score per department.

**UI Layout:**
- KPI strip: Top-Ranked Department, Company-Wide Average Score, Departments Improving (count, trend-up), Departments Declining (count, trend-down).
- **Department Cards grid** (primary view) — one `DepartmentScoreCard` per department: overall score (large, color-coded green ≥80, amber 60–79, red <60), Attendance %, Goal Achievement %, Average Performance Rating, Employee Count, Productivity Score, small trend arrow, "View Details" action.
- **Department Ranking** — sorted leaderboard table (Rank, Department, Overall Score, Trend), with Top Performer and Lowest Performer department explicitly called out in a highlighted mini-panel.
- **Heatmap** (`ScorecardHeatmap.jsx`) — grid of departments × months, cells shaded by overall score intensity, giving an at-a-glance historical comparison.
- **Charts** — `DepartmentChart` (grouped bar comparing all departments across the four sub-metrics simultaneously) and a radar/spider chart for a single selected department's shape across metrics vs. the company average.
- **Recommendation Cards** — AI-styled narrative suggestions (e.g., "Manufacturing department's Attendance % has dropped 6 points this quarter — review shift scheduling", "Sales department leads in Goal Achievement — consider replicating their review cadence company-wide").
- `SearchBar` (Department name) + `FilterBar` (Period: Monthly/Quarterly, Sort by metric).
- Clicking a department card/row opens a detail view (modal or expanded panel) showing Top Performer and Lowest Performer employees within that department (name, photo, individual score contribution).

**Dummy Data:** scorecards for 6–8 departments across the last 3–4 periods, computed via a deterministic dummy formula consistent with the Attendance, Performance, and Payroll dummy data already seeded elsewhere (reinforcing cross-page consistency rather than pure random numbers).

**Future Backend Integration:** `GET /api/hr/department-scorecards`, real weighted-scoring formula computed server-side on a schedule (Part B, Section 21 — AI Feature 2), consumed identically by this page.

---

### 9.9 AI Resume Screening (`AIResumeScreening.jsx` / `AIResumeScreening.css`)

**Purpose:** AI-assisted candidate ranking against a job description to accelerate shortlisting.

**UI Layout:**
- **Job Description selector** — dropdown of active job openings (shared data with Recruitment & Onboarding).
- KPI strip: Candidates Screened (for selected job), Average Match Score, Shortlisted Count, Rejected Count.
- **Resume Upload panel** — `ResumeUploadModal` launcher: simulated file upload + automatic (simulated) scoring against the selected job description, appends a new ranked candidate on "upload."
- **Candidate List / Resume Ranking** — sorted (descending by Overall AI Score) list of `ResumeRankingCard` components, each showing: candidate name/photo, Overall AI Score (large %, color-coded green ≥80, amber 50–79, red <50), sub-scores as small bars (Skill Match %, Experience Match %, Education Match %, Certification Match %), "Shortlist" / "Reject" action buttons (moves the candidate into the corresponding Recruitment Kanban column).
- **Top Recommendations panel** — the top 3 ranked candidates surfaced prominently at the top of the page with a "Recommended" ribbon.
- `ResumeMatchChart` — for a selected candidate, a radar/multi-bar chart visually comparing their four match dimensions.
- `SearchBar` (Candidate name) + `FilterBar` (Job Opening, Score range, Status: Shortlisted/Rejected/Unreviewed).
- Two-column split at the bottom: **Shortlisted Candidates** table and **Rejected Candidates** table, each with a "Move back to Review" action.

**Dummy Data:** 8 candidates scored against 1–2 selected job openings, with realistic skill/experience/education/certification sub-scores that plausibly combine into the overall score (e.g., a strong skill match but weak experience match yielding a mid-range overall score, to demonstrate nuance rather than uniformly high numbers).

**Future Backend Integration:** real resume-parsing + NLP matching service (Part B, Section 21 — AI Feature 1), `POST /api/hr/resume-screening/upload`, `GET /api/hr/resume-screening/ranking?jobOpeningId=`.

---

## 10. UX Requirements (applies globally)

- **Same premium enterprise look as Sales, Finance, and Inventory:** identical color system, card radius, shadow treatment, and typography scale — this module must be visually indistinguishable in quality/polish from its siblings.
- **Rounded cards, glassmorphism on navbar/modals/KPI cards**, consistent with the established pattern.
- **Sticky table headers** on every table instance.
- **Hover effects:** table rows tint on hover with pointer cursor if clickable; buttons lift slightly on hover; Kanban cards lift and show a drag-handle cursor on hover; department scorecards get a stronger shadow on hover.
- **Skeleton loading** on every page's initial load and on filter/search changes.
- **Empty states** for zero-filter-result tables, and a distinct **No Data state** for genuinely empty datasets (e.g., a brand-new performance cycle with no reviews yet) versus a filtered-to-zero result — both explicitly required per the project brief and visually differentiated (No Data uses a more neutral/welcoming illustration and copy; filtered-empty uses a "Reset Filters" CTA).
- **Error states** with retry, consistent with prior modules' approach.
- **Toast notifications** for every create/update/delete/export/import/status-change/approval action.
- **Confirmation dialogs** before irreversible or high-impact actions (delete employee, deactivate employee, reject candidate, approve/reject leave, run payroll, finalize performance rating).
- **Responsive layout** per the breakpoints in Section 8, with the Recruitment Kanban board's special-case accordion degradation.
- **Professional, consistent charts** — same color palette and interaction pattern (legend, tooltip, axis labels) as prior modules.

---

## 11. Dummy Data Standards

All dummy data across every HR page must:

- Use **realistic Indian employee names** — e.g., Priya Sharma, Rohit Verma, Anjali Mehta, Karan Malhotra, Sneha Patil, Arun Kumar, Deepa Nair, Vikram Singh — reusing names already established as managers/contacts in the Inventory module's warehouse data where a cross-module link is being demonstrated (e.g., a warehouse manager also appearing as an employee record here), and consistent with the customer/vendor-name realism standard set by Sales and Finance.
- Use **realistic Indian departments and designations** — Sales, Finance & Accounts, Manufacturing/Production, Warehouse & Logistics, HR, IT, Marketing, Procurement; designations spanning Executive, Senior Executive, Assistant Manager, Manager, Senior Manager, Head/Director per department.
- Use **realistic payroll values** in INR with correct statutory computation logic (PF 12% of Basic capped at the statutory wage ceiling, ESI 0.75% employee contribution where gross ≤ ₹21,000, Professional Tax per the standard ₹200/month slab, a plausible TDS estimate for higher salary bands) — consistent with the Finance module's `formatCurrency.js` INR-grouping convention.
- Use realistic **document/reference numbers**: Employee IDs (`EMP-1042`), Job Opening codes, Offer Letter references, Performance Cycle labels (`Q2 FY2026-27`).
- Every page/table ships with **5–10 records minimum** as specified per page above, covering a realistic spread of statuses (not all "green" — include Pending, Rejected, Overdue, Low-score, On Notice examples across the module).
- Dates should be plausible relative to the current date context (recent months, the active financial year 2026–27, a mix of fresh and upcoming due dates).

---

## 12. Module Integration (Frontend-Level — Critical Section)

The ERP is one connected system. This section describes how the HR frontend simulates its connections to Sales, Finance, Inventory & Manufacturing, and (in preview) the future User & Access Management and Procurement modules, via shared Context state (`HRDataContext` reading/writing against `SalesDataContext`, `FinanceDataContext`, and `InventoryDataContext`) so the eventual backend swap is a drop-in replacement. The full backend-level contract is in Part B, Section 32.

### 12.1 HR ↔ Finance

- **Payroll automatically creates Salary Expense entries** — running payroll in `PayrollProcessing.jsx` appends corresponding entries to Finance's `GeneralLedger.jsx` dummy dataset (Debit: Salary Expense, Credit: Salary Payable), visible immediately on the Finance side, mirroring the same cross-context write pattern already used for Sales↔Finance and Inventory↔Finance.
- **PF, ESI, TDS automatically generate Finance transactions** — the statutory deduction figures computed on each payroll row also append matching liability-account entries, visible in Finance's General Ledger and referenced from `StatutoryCompliance.jsx`.
- **Employee reimbursements create Finance journal entries** — an approved reimbursement claim (a lightweight form reachable from `EmployeeDrawer.jsx`) posts a Finance expense entry, mirroring Finance's Accounts Payable pattern.
- **Payroll status updates Finance Dashboard** — Finance's Dashboard "Top Expenses"/"Monthly Profit" figures read the same payroll-cost total that `PayrollProcessing.jsx` displays, from shared context.
- **Salary payments update Bank Reconciliation** — marking payroll "Paid" appends a corresponding outbound line to Finance's `BankReconciliation.jsx` dummy bank-transaction dataset.

### 12.2 HR ↔ User & Access Management (Preview)

- **New employee onboarding automatically creates ERP login** — the "Create Employee Automatically" action in Recruitment & Onboarding (Section 9.5) is annotated in-UI as also provisioning an ERP login (represented today as a simple "ERP Access: Provisioning…" status chip that flips to "Active" on the employee's record, since the real User & Access Management module doesn't exist yet).
- **Employee role automatically maps to ERP permissions** — the Designation field selected during employee creation is shown alongside a (currently static/preview) "Suggested ERP Role" label, foreshadowing the real mapping.
- **Employee deactivation disables ERP access** — deactivating or exiting an employee in `EmployeeDirectory.jsx` flips the same "ERP Access" chip to "Revoked."
- **Department Head assignment updates approval workflows** — assigning a `head_employee_id`-equivalent on a department (a small admin control on the Department filter/settings) is noted in-UI as the person who will receive Finance/HR approval-routing tasks for that department, foreshadowing Part B's approval matrix.

### 12.3 HR ↔ Sales

- **Sales Executives linked to sales orders** — the Sales Module's order forms reference `HRDataContext`'s employee list to populate the "Sales Executive" assignment field (rather than maintaining a separate salesperson list).
- **Salesperson performance used in Team Performance Dashboard** — a Sales-side "Team Performance" widget (already anticipated in the Sales README) reads each salesperson's order/revenue totals from `SalesDataContext` joined against their HR employee record for name/photo/department context.
- **Employee transfers reflected in Sales hierarchy** — changing an employee's department/reporting manager in `EmployeeDirectory.jsx` (if that employee is Sales-linked) is reflected the next time the Sales team hierarchy view renders, since it reads live from the shared employee record rather than a cached copy.

### 12.4 HR ↔ Inventory & Manufacturing

- **Production workers assigned to work orders** — Inventory's `WorkOrderModal.jsx` "Assigned Team" field (previously a placeholder per the Inventory README) resolves against real `HRDataContext` employee records once this module exists, filtered to Manufacturing-department employees.
- **Shift schedules linked with production planning** — HR's shift-assignment data (`AttendanceLeave.jsx`'s underlying employee-shift model) is read by Inventory's Production Planning page to display which shift a given work order's assigned team is working.
- **Machine operators assigned to manufacturing lines** — the Visual Shop-Floor Map's machine tooltip (Inventory Section 9.10) can now show a real assigned operator name/photo sourced from HR, instead of a placeholder.
- **Attendance integrated with production reports** — Inventory's Live OEE Dashboard's "Shift Performance" panel cross-references HR attendance data to distinguish genuine performance loss from simple understaffing (e.g., low OEE explained by 2 absent machine operators that day).

### 12.5 HR ↔ Procurement (Preview)

- **Purchase Approvers assigned through HR roles** — a Department Manager's designation/role in HR is what will determine their inclusion in a future Procurement approval chain (previewed today as informational text on the `EmployeeDrawer.jsx` Employment tab: "Eligible Approver: Purchase Requests up to ₹2,00,000").
- **Department managers participate in procurement approvals** — mirrors the same Department Head concept described in Section 12.2, reused for Procurement's future approval matrix.

### 12.6 Data Flow Diagrams

```
Candidate
    ↓
Interview
    ↓
Offer Letter
    ↓
Employee Created
    ↓
ERP Account Created
    ↓
Attendance Enabled
    ↓
Payroll Enabled
    ↓
Performance Tracking
```

```
Employee Attendance Marked
    ↓
Leave Balance Recalculated (if On Leave)
    ↓
Attendance Feeds Payroll (Working Days)
    ↓
Payroll Processed
    ↓
Finance: Salary Expense + Statutory Liability Posted
    ↓
Finance Dashboard & Bank Reconciliation Updated
```

```
Performance Review Completed
    ↓
Department Scorecard Recalculated
    ↓
Promotion / Training Recommendation Flagged
    ↓
HR Dashboard "Upcoming Reviews" / Notifications Updated
```

### 12.7 Future Module Integrations (Beyond Sales/Finance/Inventory)

**HR ↔ Marketing** — Marketing team headcount and campaign-execution performance will be tracked through the same HR employee/department model, feeding a future Marketing Team Performance view analogous to Sales' Team Performance Dashboard.

**HR ↔ CRM** — sales target-setting (a CRM-adjacent capability) will reference HR's employee/designation hierarchy for territory and quota assignment.

**HR ↔ Document Management** — the `EmployeeDocument`-equivalent uploads currently simulated in `EmployeeModal.jsx`/`EmployeeDrawer.jsx` and Recruitment's document tabs are designed to migrate to a centralized Document Management module's storage/versioning service without changing the HR data model, only the storage backend.

**HR ↔ Quality Management** — training records (already modeled per Part B's `training_records` table) will link to a future Quality Management module's compliance-training requirements (e.g., ISO certification training tracked as a training record type).

### 12.8 ERP Design Principle

Every module remains independently deployable and independently useful, while sharing data through well-defined interfaces rather than duplicated copies. Employee identity, department/designation structure, attendance, and payroll are owned exclusively by HR; Sales reads employee data to represent salespeople rather than maintaining its own staff list, Inventory reads employee data to represent production teams and machine operators rather than maintaining its own personnel list, and Finance reads payroll totals to post salary/statutory expense rather than maintaining an independent estimate. This mirrors how SAP S/4HANA's integrated HCM module, Oracle NetSuite's unified employee-and-financials data model, Microsoft Dynamics 365's Dataverse, Zoho People's cross-app data sharing, and Odoo's shared HR/Payroll/Accounting apps keep workforce data and financial/operational reporting in permanent agreement.

---

## 13. Frontend Build Checklist (for the implementing AI)

1. Scaffold the folder structure exactly as specified in Section 4.
2. Build `HRDataContext.jsx` first, seeding all dummy datasets from `data/HumanResources/*.js`, and establishing the cross-context read/write bridges into `SalesDataContext`, `FinanceDataContext`, and `InventoryDataContext` described in Section 12.
3. Build shared components (Section 7) before pages, reusing the exact visual/prop contracts already established by prior modules' shared components.
4. Build `HRSidebar.jsx`, `HRTopbar.jsx`, and `HRRoutes.jsx` to establish the shell.
5. Implement pages in this order: Dashboard → Employee Directory → Attendance & Leave → Payroll Processing → Recruitment & Onboarding → Performance Management → Statutory Compliance → Department Performance Scorecard → AI Resume Screening.
6. Wire the HR↔Sales↔Finance↔Inventory simulated integration: running payroll should visibly post Finance entries; approving a candidate's offer should create a real Employee Directory row; assigning an employee to a Work Order (Inventory) should resolve their name/photo from HR.
7. Build the two AI-styled pages (Department Performance Scorecard, AI Resume Screening) last, since they draw on Employee, Attendance, Performance, and Recruitment data being fully seeded first.
8. Apply UX polish pass (Section 10): skeletons, empty/no-data/error states, toasts, confirm dialogs, responsive breakpoints (including the Kanban board's accordion degradation), hover states.
9. QA pass: verify every button performs a real state change, every table sorts/filters/paginates, every form validates, every modal/drawer opens/closes cleanly, the Candidate→Employee→Payroll→Finance chain works end-to-end against seeded dummy data, and the app is fully usable at 1440px, 1024px, and 375px widths.

---

# PART B — BACKEND BLUEPRINT

## 14. Purpose & Scope

This part is the complete backend engineering blueprint for the Human Resource Module. It defines the database schema, entity relationships, business rules, REST API contract, validation rules, security model, role-based access control, approval workflows, notification and reporting subsystems, and the backend logic for the two AI features (AI Resume Screening and Department Performance Scorecard).

It is written so that another AI agent can implement the entire backend — database, models, controllers, routes, services, validators, middlewares — without needing to ask a single clarifying question. Every table, every field, every endpoint, every rule is specified explicitly.

This backend must satisfy every screen, table, filter, KPI, chart, modal, and action defined in Part A, and must implement the HR ↔ Finance, HR ↔ Sales, HR ↔ Inventory & Manufacturing, and HR ↔ User & Access Management integration contracts as real, working backend logic (not a simulation).

---

## 15. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (LTS) |
| Web Framework | Express.js |
| Database | MySQL 8.x |
| ORM | Sequelize |
| Authentication | JWT (access token + refresh token pattern) |
| Validation | express-validator |
| File Upload | Multer (resume uploads, employee documents, offer letters, profile photos) |
| Email | Nodemailer (SMTP transport, templated HTML emails) |
| PDF Generation | PDFKit |
| Architecture Pattern | MVC, layered with a Service layer between Controllers and Models — identical pattern to the Finance backend |
| Logging | Winston (application/error logs) + Morgan (HTTP request logging, piped into Winston) |
| Scheduled Jobs | node-cron (payroll reminders, leave-balance accrual, compliance due-date reminders, department scorecard recalculation, resume re-ranking) |
| Environment Config | dotenv-based `config/` module |

**Layered architecture (per request):**

```
Route → Middleware (auth, rbac, validation, file upload) → Controller → Service → Model (Sequelize) → MySQL
                                                                ↓
                                                     Response formatter → JSON response
```

Controllers stay thin. All business logic (payroll calculation, leave-balance arithmetic, resume scoring, department scoring, cross-module event emission) lives in the Service layer.

---

## 16. Complete Backend Folder Structure

```
backend/
├── config/
│   ├── database.js
│   ├── env.js
│   ├── logger.js
│   ├── constants.js          (enums, leave quotas, statutory rates, thresholds)
│   ├── mailer.js
│   └── upload.js             (Multer storage config, file-type/size limits)
│
├── controllers/
│   ├── hrDashboard.controller.js
│   ├── employee.controller.js
│   ├── department.controller.js
│   ├── designation.controller.js
│   ├── attendance.controller.js
│   ├── leave.controller.js
│   ├── payroll.controller.js
│   ├── salaryStructure.controller.js
│   ├── recruitment.controller.js
│   ├── interview.controller.js
│   ├── offerLetter.controller.js
│   ├── onboarding.controller.js
│   ├── performance.controller.js
│   ├── compliance.controller.js
│   ├── departmentScorecard.controller.js
│   ├── resumeScreening.controller.js
│   ├── employeeAsset.controller.js
│   ├── trainingRecord.controller.js
│   ├── employeeExit.controller.js
│   ├── approval.controller.js
│   └── auditLog.controller.js
│
├── models/
│   ├── employee.model.js
│   ├── employeeAddress.model.js
│   ├── employeeBankDetail.model.js
│   ├── employeeDocument.model.js
│   ├── department.model.js
│   ├── designation.model.js
│   ├── shift.model.js
│   ├── employeeShiftAssignment.model.js
│   ├── attendance.model.js
│   ├── attendanceLog.model.js
│   ├── leaveType.model.js
│   ├── leaveBalance.model.js
│   ├── leaveRequest.model.js
│   ├── holiday.model.js
│   ├── salaryStructure.model.js
│   ├── salaryComponent.model.js
│   ├── payroll.model.js
│   ├── payslip.model.js
│   ├── reimbursementClaim.model.js
│   ├── performanceCycle.model.js
│   ├── employeeGoal.model.js
│   ├── performanceReview.model.js
│   ├── jobOpening.model.js
│   ├── candidate.model.js
│   ├── candidateDocument.model.js
│   ├── interview.model.js
│   ├── offerLetter.model.js
│   ├── onboardingTask.model.js
│   ├── employeeAsset.model.js
│   ├── trainingRecord.model.js
│   ├── resumeScore.model.js
│   ├── departmentScorecard.model.js
│   ├── complianceRecord.model.js
│   ├── employeeExit.model.js
│   ├── approvalMatrix.model.js
│   ├── approvalHistory.model.js
│   ├── auditLog.model.js
│   ├── notificationLog.model.js
│   └── index.js
│
├── routes/
│   ├── hrDashboard.routes.js
│   ├── employee.routes.js
│   ├── department.routes.js
│   ├── attendance.routes.js
│   ├── leave.routes.js
│   ├── payroll.routes.js
│   ├── recruitment.routes.js
│   ├── performance.routes.js
│   ├── compliance.routes.js
│   ├── departmentScorecard.routes.js
│   ├── resumeScreening.routes.js
│   ├── employeeAsset.routes.js
│   ├── approval.routes.js
│   ├── auditLog.routes.js
│   └── index.js
│
├── middlewares/
│   ├── authenticate.middleware.js
│   ├── authorize.middleware.js
│   ├── validate.middleware.js
│   ├── uploadHandler.middleware.js    (Multer wiring + file-type/size validation)
│   ├── errorHandler.middleware.js
│   ├── rateLimiter.middleware.js
│   ├── auditLogger.middleware.js
│   └── requestLogger.middleware.js
│
├── validators/
│   ├── employee.validator.js
│   ├── attendance.validator.js
│   ├── leave.validator.js
│   ├── payroll.validator.js
│   ├── recruitment.validator.js
│   ├── performance.validator.js
│   ├── compliance.validator.js
│   └── common.validator.js
│
├── services/
│   ├── employee.service.js
│   ├── attendance.service.js
│   ├── leave.service.js
│   ├── payroll.service.js
│   ├── salaryStructure.service.js
│   ├── recruitment.service.js
│   ├── onboarding.service.js
│   ├── performance.service.js
│   ├── compliance.service.js
│   ├── departmentScorecard.service.js
│   ├── resumeAI.service.js
│   ├── document.service.js
│   ├── approval.service.js
│   ├── auditLog.service.js
│   ├── email.service.js
│   ├── pdf.service.js
│   ├── financeIntegration.service.js   (outbound events to Finance)
│   ├── salesIntegration.service.js     (employee lookups for Sales)
│   ├── inventoryIntegration.service.js (employee lookups for Inventory/Manufacturing)
│   └── accessManagementIntegration.service.js (outbound events to future User & Access Management)
│
├── jobs/
│   ├── leaveAccrual.job.js            (monthly leave balance accrual)
│   ├── attendanceAbsentMarker.job.js  (daily — marks Absent for employees with no clock-in and no approved leave)
│   ├── payrollReminder.job.js
│   ├── complianceReminder.job.js      (PF/ESI/TDS due-date reminders)
│   ├── departmentScorecardRefresh.job.js
│   ├── resumeRescore.job.js           (re-ranks candidates when a job description changes)
│   ├── birthdayAnniversaryNotifier.job.js
│   └── index.js
│
├── events/
│   ├── eventBus.js
│   └── hrEventHandlers.js             (listens for offer.accepted, employee.exited, etc.; emits payroll.processed, employee.created, etc.)
│
├── utils/
│   ├── apiResponse.js
│   ├── asyncHandler.js
│   ├── currency.js
│   ├── payrollCalculator.js           (PF/ESI/PT/TDS/net salary formulas)
│   ├── leaveBalanceCalculator.js
│   ├── resumeMatchScorer.js           (skill/experience/education/certification scoring)
│   ├── departmentScoreCalculator.js
│   ├── pagination.js
│   ├── qrCodeGenerator.js
│   └── employeeCodeGenerator.js
│
├── database/
│   ├── migrations/
│   └── seeders/                       (departments, designations, leave_types, holidays, approval_matrix, salary component templates)
│
├── app.js
└── server.js
```

Every controller has exactly one matching route file, one matching (or shared) service file, and validators live separately, mirroring the Finance backend's structure exactly.

---

## 17. Database Design Principles

Identical conventions to the Finance backend, for cross-module consistency:

- **Engine:** InnoDB for every table. **Charset/Collation:** `utf8mb4` / `utf8mb4_unicode_ci`.
- **Primary keys:** `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY` unless noted.
- **Timestamps:** every table has `created_at`, `updated_at`; mutable master/transactional tables also have nullable `deleted_at` (Sequelize `paranoid: true`); pure log/history tables (`audit_logs`, `notification_logs`, `approval_history`) are append-only.
- **Monetary columns:** `DECIMAL(15,2)`. **Percentage/rate columns:** `DECIMAL(5,2)`.
- **Foreign keys:** named `<referenced_entity>_id`, always indexed, `ON DELETE RESTRICT ON UPDATE CASCADE` by default unless overridden (Section 19).
- **Enums:** MySQL `ENUM(...)` for fixed value sets.
- **Naming convention:** `snake_case`, plural table names.
- **Normalization:** 3NF for all transactional tables. No denormalized read-model table is required in HR (unlike Finance's `general_ledger`), since HR's read patterns are lighter; if profiling later reveals a need, an `employee_summary` read model can be added without schema disruption.
- **Cross-module references:** tables owned by Sales (`customers`, referenced only indirectly), Finance (`journal_entries`, `financial_years`, `cost_centers`), Inventory (`fixed_assets`, `work_orders`), and the future User & Access Management module (`users`, `roles`) are referenced by foreign key ID only — HR does not duplicate their data (Section 19.7).

---

## 18. Database Tables

### 18.1 Organization Structure

#### `departments`
**Purpose:** Top-level organizational unit; drives Budgeting (Finance), Work Order team grouping (Inventory), and the Department Performance Scorecard.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| department_name | VARCHAR(100) UNIQUE | e.g. "Manufacturing" |
| department_code | VARCHAR(20) UNIQUE | e.g. "MFG" |
| head_employee_id | BIGINT UNSIGNED FK → employees.id | nullable (circular reference — created after `employees` exists; enforced via a deferred/nullable FK, not a hard NOT NULL) |
| cost_center_id | BIGINT UNSIGNED | nullable, cross-module reference to Finance `cost_centers.id` |
| is_active | BOOLEAN | default true |
| created_at, updated_at | DATETIME | |

**Business Rules:** `head_employee_id` must reference an employee whose `department_id` equals this department (validated at service layer). **Expected records:** 6–10.

#### `designations`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| title | VARCHAR(100) | e.g. "Senior Accountant" |
| department_id | BIGINT UNSIGNED FK → departments.id | RESTRICT |
| level | ENUM('Junior','Mid','Senior','Lead','Manager','Director') | |
| grade_code | VARCHAR(10) | nullable, for salary-band mapping |
| created_at, updated_at | DATETIME | |

**Expected records:** 25–40 (multiple designations per department).

### 18.2 Employee Master

#### `employees`
**Purpose:** Master employee record — single source of truth for identity, consumed by every other module.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_code | VARCHAR(20) UNIQUE | e.g. `EMP-1042` |
| first_name | VARCHAR(50) | |
| last_name | VARCHAR(50) | |
| email | VARCHAR(150) UNIQUE | |
| phone | VARCHAR(15) UNIQUE | |
| photo_url | VARCHAR(255) | nullable |
| department_id | BIGINT UNSIGNED FK → departments.id | RESTRICT |
| designation_id | BIGINT UNSIGNED FK → designations.id | RESTRICT |
| reporting_manager_id | BIGINT UNSIGNED FK → employees.id | nullable, self-referencing, RESTRICT |
| employment_type | ENUM('FullTime','PartTime','Contract','Intern') | |
| joining_date | DATE | |
| date_of_birth | DATE | nullable |
| gender | ENUM('Male','Female','Other','PreferNotToSay') | nullable |
| marital_status | ENUM('Single','Married','Other') | nullable |
| work_location | VARCHAR(100) | |
| status | ENUM('Active','Inactive','OnNotice','Exited') | default `Active` |
| user_id | BIGINT UNSIGNED | nullable, cross-module reference to future User & Access Management `users.id` |
| created_at, updated_at, deleted_at | DATETIME | |

**Indexes:** `department_id`, `designation_id`, `reporting_manager_id`, `status`. **Business Rules:** `employee_code` and `email` are globally unique (Business Rule 1–2, Section 20); an employee cannot be their own `reporting_manager_id`; `reporting_manager_id` must reference an `Active` employee. **Expected records:** 10 seeded, unbounded in production.

#### `employee_addresses`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | CASCADE |
| address_type | ENUM('Current','Permanent') | |
| address_line1 | VARCHAR(150) | |
| address_line2 | VARCHAR(150) | nullable |
| city | VARCHAR(50) | |
| state | VARCHAR(50) | |
| pincode | VARCHAR(10) | |
| country | VARCHAR(50) | default 'India' |
| created_at, updated_at | DATETIME | |

**Unique:** `(employee_id, address_type)`.

#### `employee_bank_details`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id UNIQUE | CASCADE |
| bank_name | VARCHAR(100) | |
| account_number | VARCHAR(30) | encrypted at rest |
| ifsc_code | CHAR(11) | |
| account_holder_name | VARCHAR(100) | |
| created_at, updated_at | DATETIME | |

#### `employee_documents`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | CASCADE |
| document_type | ENUM('Aadhaar','PAN','Resume','OfferLetter','AppointmentLetter','ExperienceLetter','RelievingLetter','EducationCertificate','Other') | |
| file_path | VARCHAR(255) | |
| file_name | VARCHAR(150) | |
| uploaded_by | BIGINT UNSIGNED FK → users.id | cross-module reference |
| uploaded_at | DATETIME | |
| verification_status | ENUM('Pending','Verified','Rejected') | default `Pending` |
| created_at, updated_at | DATETIME | |

**Indexes:** `employee_id`, `document_type`.

### 18.3 Attendance & Leave

#### `shifts`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| shift_name | VARCHAR(50) | e.g. "Morning Shift" |
| start_time | TIME | |
| end_time | TIME | |
| break_duration_minutes | SMALLINT UNSIGNED | default 60 |
| created_at, updated_at | DATETIME | |

#### `employee_shift_assignments`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| shift_id | BIGINT UNSIGNED FK → shifts.id | RESTRICT |
| effective_from | DATE | |
| effective_to | DATE | nullable |
| created_at, updated_at | DATETIME | |

**Purpose:** feeds Inventory's Production Planning shift display (Section 32.3).

#### `holidays`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| holiday_name | VARCHAR(100) | |
| holiday_date | DATE | |
| holiday_type | ENUM('Public','Optional') | |
| applicable_locations | VARCHAR(255) | nullable, comma-separated or 'All' |
| created_at, updated_at | DATETIME | |

**Unique:** `(holiday_date, holiday_name)`.

#### `attendance`
**Purpose:** Daily attendance summary per employee.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| attendance_date | DATE | |
| clock_in_time | DATETIME | nullable |
| clock_out_time | DATETIME | nullable |
| working_hours | DECIMAL(5,2) | computed on clock-out |
| break_time_minutes | SMALLINT UNSIGNED | default 0 |
| late_entry | BOOLEAN | computed vs. shift start_time |
| status | ENUM('Present','Absent','HalfDay','OnLeave','Holiday','WeekOff') | |
| created_at, updated_at | DATETIME | |

**Unique:** `(employee_id, attendance_date)`. **Indexes:** `attendance_date`, `status`. **Business Rules:** `clock_out_time` must be after `clock_in_time` (Business Rule 4, Section 20); `working_hours` recalculated automatically whenever `clock_out_time` is set.

#### `attendance_logs`
**Purpose:** Raw punch-level log supporting multiple punches/corrections; `attendance` is the derived daily summary.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| attendance_id | BIGINT UNSIGNED FK → attendance.id | CASCADE |
| log_type | ENUM('ClockIn','ClockOut','BreakStart','BreakEnd') | |
| log_time | DATETIME | |
| source | ENUM('WebApp','Biometric','Mobile','Manual') | |
| created_at | DATETIME | |

#### `leave_types`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| leave_type_name | VARCHAR(50) UNIQUE | Casual Leave, Sick Leave, Earned Leave, Maternity Leave, Paternity Leave, Loss of Pay |
| annual_quota | DECIMAL(5,1) | days |
| carry_forward_allowed | BOOLEAN | |
| is_paid | BOOLEAN | |
| created_at, updated_at | DATETIME | |

**Expected records:** 6.

#### `leave_balances`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| leave_type_id | BIGINT UNSIGNED FK → leave_types.id | RESTRICT |
| financial_year_id | BIGINT UNSIGNED | cross-module reference to Finance `financial_years.id` |
| allocated | DECIMAL(5,1) | |
| used | DECIMAL(5,1) | default 0 |
| balance | DECIMAL(5,1) GENERATED ALWAYS AS (allocated - used) STORED | |
| created_at, updated_at | DATETIME | |

**Unique:** `(employee_id, leave_type_id, financial_year_id)`.

#### `leave_requests`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| leave_type_id | BIGINT UNSIGNED FK → leave_types.id | RESTRICT |
| start_date | DATE | |
| end_date | DATE | |
| number_of_days | DECIMAL(5,1) | computed, excludes weekends/holidays |
| reason | VARCHAR(255) | |
| status | ENUM('Pending','Approved','Rejected','Cancelled') | default `Pending` |
| approved_by | BIGINT UNSIGNED FK → employees.id | nullable |
| approved_at | DATETIME | nullable |
| approval_history_id | BIGINT UNSIGNED FK → approval_history.id | nullable |
| created_at, updated_at | DATETIME | |

**Indexes:** `employee_id`, `status`, `(start_date, end_date)`. **Business Rules:** requested `number_of_days` cannot exceed the employee's current `leave_balances.balance` for that leave type (Business Rule 5); approving decrements `leave_balances.used` and flips relevant `attendance` rows to `OnLeave` within the same transaction.

### 18.4 Payroll

#### `salary_structures`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| ctc_annual | DECIMAL(15,2) | |
| effective_from | DATE | |
| effective_to | DATE | nullable |
| status | ENUM('Active','Superseded') | default `Active` |
| created_at, updated_at | DATETIME | |

**Business Rules:** an employee has at most one `Active` salary structure at a time; a salary revision creates a new row and flips the prior one to `Superseded` (never edits history in place).

#### `salary_components`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| salary_structure_id | BIGINT UNSIGNED FK → salary_structures.id | CASCADE |
| component_name | VARCHAR(50) | Basic, HRA, Conveyance Allowance, Special Allowance, etc. |
| component_type | ENUM('Earning','Deduction') | |
| calculation_type | ENUM('Fixed','PercentageOfBasic') | |
| value | DECIMAL(15,2) | amount or percentage depending on `calculation_type` |
| created_at, updated_at | DATETIME | |

#### `payroll`
**Purpose:** One row per employee per payroll month.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| payroll_month | TINYINT UNSIGNED | 1–12 |
| payroll_year | SMALLINT UNSIGNED | |
| basic_salary | DECIMAL(15,2) | |
| total_allowances | DECIMAL(15,2) | |
| overtime_amount | DECIMAL(15,2) | default 0 |
| bonus_amount | DECIMAL(15,2) | default 0 |
| pf_deduction | DECIMAL(15,2) | |
| esi_deduction | DECIMAL(15,2) | default 0 |
| professional_tax | DECIMAL(15,2) | |
| tds_deduction | DECIMAL(15,2) | default 0 |
| other_deductions | DECIMAL(15,2) | default 0 |
| gross_salary | DECIMAL(15,2) | |
| net_salary | DECIMAL(15,2) | |
| status | ENUM('Draft','PendingApproval','Approved','Processed','Paid','OnHold') | default `Draft` |
| generated_by | BIGINT UNSIGNED FK → users.id | |
| approved_by | BIGINT UNSIGNED FK → users.id | nullable |
| processed_at | DATETIME | nullable |
| journal_entry_id | BIGINT UNSIGNED | nullable, cross-module reference to Finance `journal_entries.id` |
| created_at, updated_at | DATETIME | |

**Unique:** `(employee_id, payroll_month, payroll_year)` — enforces Business Rule 6 (payroll cannot be generated twice for the same month). **Indexes:** `status`, `(payroll_year, payroll_month)`.

#### `payslips`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| payroll_id | BIGINT UNSIGNED FK → payroll.id UNIQUE | RESTRICT |
| file_path | VARCHAR(255) | |
| generated_at | DATETIME | |
| emailed_at | DATETIME | nullable |
| download_count | INT UNSIGNED | default 0 |
| created_at | DATETIME | |

**Business Rules:** a `payslips` row can only be created when the linked `payroll.status` is `Approved` or later (Business Rule 7 — payslip generated only after payroll approval).

#### `reimbursement_claims`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| claim_type | ENUM('Travel','Medical','Food','Other') | |
| amount | DECIMAL(15,2) | |
| claim_date | DATE | |
| receipt_document_id | BIGINT UNSIGNED FK → employee_documents.id | nullable |
| status | ENUM('Pending','Approved','Rejected','Reimbursed') | default `Pending` |
| approved_by | BIGINT UNSIGNED FK → users.id | nullable |
| journal_entry_id | BIGINT UNSIGNED | nullable, cross-module reference to Finance |
| created_at, updated_at | DATETIME | |

### 18.5 Performance Management

#### `performance_cycles`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| cycle_name | VARCHAR(30) UNIQUE | e.g. "Q2 FY2026-27" |
| start_date | DATE | |
| end_date | DATE | |
| status | ENUM('Upcoming','Active','Closed') | |
| created_at, updated_at | DATETIME | |

#### `employee_goals`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| performance_cycle_id | BIGINT UNSIGNED FK → performance_cycles.id | RESTRICT |
| goal_title | VARCHAR(150) | |
| description | VARCHAR(500) | nullable |
| target_metric | VARCHAR(150) | nullable |
| weight_percentage | DECIMAL(5,2) | |
| completion_percentage | DECIMAL(5,2) | default 0 |
| status | ENUM('NotStarted','InProgress','Completed','Deferred') | |
| created_at, updated_at | DATETIME | |

**Business Rules:** sum of `weight_percentage` across an employee's goals within one cycle should equal 100 (soft-validated with a warning, not hard-blocked, to allow interim goal-setting).

#### `performance_reviews`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| performance_cycle_id | BIGINT UNSIGNED FK → performance_cycles.id | RESTRICT |
| reviewer_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| self_assessment_rating | DECIMAL(3,1) | nullable, 1.0–5.0 |
| manager_rating | DECIMAL(3,1) | nullable |
| final_rating | DECIMAL(3,1) | nullable |
| promotion_recommended | BOOLEAN | default false |
| training_recommended | BOOLEAN | default false |
| review_status | ENUM('SelfReviewPending','ManagerReviewPending','HRReviewPending','Completed') | default `SelfReviewPending` |
| comments | TEXT | nullable |
| created_at, updated_at | DATETIME | |

**Unique:** `(employee_id, performance_cycle_id)`. **Business Rules:** `reviewer_id` cannot equal `employee_id` (Business Rule 8 — an employee cannot review themselves as their own manager-reviewer); `reviewer_id` must equal `employees.reporting_manager_id` for that employee, validated at service layer.

### 18.6 Recruitment & Onboarding

#### `job_openings`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| job_title | VARCHAR(150) | |
| department_id | BIGINT UNSIGNED FK → departments.id | RESTRICT |
| designation_id | BIGINT UNSIGNED FK → designations.id | RESTRICT |
| number_of_positions | SMALLINT UNSIGNED | |
| employment_type | ENUM('FullTime','PartTime','Contract','Intern') | |
| job_description | TEXT | |
| status | ENUM('Open','OnHold','Closed','Cancelled') | default `Open` |
| posted_by | BIGINT UNSIGNED FK → users.id | |
| posted_date | DATE | |
| closing_date | DATE | nullable |
| created_at, updated_at | DATETIME | |

#### `candidates`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| candidate_name | VARCHAR(100) | |
| email | VARCHAR(150) | |
| phone | VARCHAR(15) | |
| resume_document_path | VARCHAR(255) | |
| applied_job_opening_id | BIGINT UNSIGNED FK → job_openings.id | RESTRICT |
| source | ENUM('Referral','JobPortal','LinkedIn','CompanyWebsite','WalkIn') | |
| status | ENUM('Applied','Screening','InterviewScheduled','Interviewed','Selected','OfferExtended','OfferAccepted','Rejected','Onboarded') | default `Applied` |
| current_stage | VARCHAR(30) | denormalized Kanban column key, kept in sync with `status` |
| created_at, updated_at | DATETIME | |

**Indexes:** `applied_job_opening_id`, `status`, `email`.

#### `candidate_documents`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| candidate_id | BIGINT UNSIGNED FK → candidates.id | CASCADE |
| document_type | VARCHAR(50) | |
| file_path | VARCHAR(255) | |
| uploaded_at | DATETIME | |
| created_at | DATETIME | |

#### `interviews`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| candidate_id | BIGINT UNSIGNED FK → candidates.id | RESTRICT |
| interview_round | ENUM('Screening','Technical','HR','Final') | |
| interviewer_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| scheduled_at | DATETIME | |
| mode | ENUM('InPerson','Video','Phone') | |
| status | ENUM('Scheduled','Completed','Cancelled','Rescheduled') | default `Scheduled` |
| feedback | TEXT | nullable |
| rating | DECIMAL(3,1) | nullable |
| recommendation | ENUM('StrongHire','Hire','NoHire','StrongNoHire') | nullable |
| created_at, updated_at | DATETIME | |

**Business Rules:** `scheduled_at` must be in the future at creation time (Business Rule — interview date validation, Section 23).

#### `offer_letters`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| candidate_id | BIGINT UNSIGNED FK → candidates.id UNIQUE | RESTRICT |
| designation_id | BIGINT UNSIGNED FK → designations.id | RESTRICT |
| offered_ctc | DECIMAL(15,2) | |
| joining_date_offered | DATE | |
| status | ENUM('Draft','Sent','Accepted','Declined','Withdrawn') | default `Draft` |
| sent_at | DATETIME | nullable |
| responded_at | DATETIME | nullable |
| document_id | BIGINT UNSIGNED FK → employee_documents.id | nullable |
| created_at, updated_at | DATETIME | |

**Business Rules:** an employee's `joining_date` (once created) cannot be before this offer's `responded_at` date when status was set to `Accepted` (Business Rule 3 — joining date cannot be before offer acceptance).

#### `onboarding_tasks`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| candidate_id | BIGINT UNSIGNED FK → candidates.id | nullable, RESTRICT |
| employee_id | BIGINT UNSIGNED FK → employees.id | nullable, RESTRICT |
| task_name | VARCHAR(100) | Document Collection, IT Setup, Induction, Policy Acknowledgment, Asset Allocation |
| status | ENUM('Pending','InProgress','Completed') | default `Pending` |
| due_date | DATE | nullable |
| completed_at | DATETIME | nullable |
| assigned_to | BIGINT UNSIGNED FK → users.id | |
| created_at, updated_at | DATETIME | |

**Business Rules:** a `candidates` row transitions to `Onboarded` (and triggers employee creation, Business Rule 9) only once every associated `onboarding_tasks` row reaches `Completed`.

### 18.7 Assets & Training

#### `employee_assets`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| asset_reference | BIGINT UNSIGNED | cross-module reference to Inventory `fixed_assets.id` |
| asset_name | VARCHAR(150) | denormalized snapshot |
| assigned_date | DATE | |
| returned_date | DATE | nullable |
| condition_on_return | VARCHAR(100) | nullable |
| created_at, updated_at | DATETIME | |

#### `training_records`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id | RESTRICT |
| training_name | VARCHAR(150) | |
| training_type | ENUM('Onboarding','Skill','Compliance','Leadership') | |
| provider | VARCHAR(100) | nullable |
| start_date | DATE | |
| end_date | DATE | nullable |
| status | ENUM('Scheduled','InProgress','Completed','Cancelled') | |
| certificate_document_id | BIGINT UNSIGNED FK → employee_documents.id | nullable |
| created_at, updated_at | DATETIME | |

### 18.8 AI Feature Support Tables

#### `resume_scores`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| candidate_id | BIGINT UNSIGNED FK → candidates.id | RESTRICT |
| job_opening_id | BIGINT UNSIGNED FK → job_openings.id | RESTRICT |
| skill_match_percentage | DECIMAL(5,2) | |
| experience_match_percentage | DECIMAL(5,2) | |
| education_match_percentage | DECIMAL(5,2) | |
| certification_match_percentage | DECIMAL(5,2) | |
| overall_score | DECIMAL(5,2) | weighted composite |
| ranking_position | INT UNSIGNED | computed relative to other candidates for the same job opening |
| model_version | VARCHAR(20) | |
| generated_at | DATETIME | |
| created_at | DATETIME | |

**Unique:** `(candidate_id, job_opening_id)`.

#### `department_scorecards`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| department_id | BIGINT UNSIGNED FK → departments.id | RESTRICT |
| period_label | VARCHAR(20) | e.g. "Jul-2026" |
| attendance_score | DECIMAL(5,2) | |
| goal_achievement_score | DECIMAL(5,2) | |
| performance_rating_score | DECIMAL(5,2) | |
| productivity_score | DECIMAL(5,2) | |
| overall_score | DECIMAL(5,2) | weighted composite |
| rank_position | TINYINT UNSIGNED | |
| generated_at | DATETIME | |
| created_at | DATETIME | |

**Unique:** `(department_id, period_label)`.

### 18.9 Compliance

#### `compliance_records`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| compliance_type | ENUM('PF','ESI','TDS','ProfessionalTax','LabourWelfareFund') | |
| period_month | TINYINT UNSIGNED | |
| period_year | SMALLINT UNSIGNED | |
| total_amount | DECIMAL(15,2) | |
| employee_count | INT UNSIGNED | |
| filing_status | ENUM('Pending','Filed','Overdue') | |
| filed_date | DATE | nullable |
| filed_by | BIGINT UNSIGNED FK → users.id | nullable |
| acknowledgement_number | VARCHAR(50) | nullable |
| created_at, updated_at | DATETIME | |

**Unique:** `(compliance_type, period_month, period_year)`.

### 18.10 Exit Management

#### `employee_exits`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| employee_id | BIGINT UNSIGNED FK → employees.id UNIQUE | RESTRICT |
| exit_type | ENUM('Resignation','Termination','Retirement','EndOfContract') | |
| notice_date | DATE | |
| last_working_day | DATE | |
| exit_reason | VARCHAR(255) | nullable |
| exit_interview_notes | TEXT | nullable |
| clearance_status | ENUM('Pending','Cleared') | default `Pending` |
| relieving_letter_document_id | BIGINT UNSIGNED FK → employee_documents.id | nullable |
| created_at, updated_at | DATETIME | |

**Business Rules:** `employees.status` transitions to `Exited` only once `clearance_status = Cleared` and all `employee_assets` rows for that employee have a non-null `returned_date` (mirrors Inventory's asset-return requirement, Section 32.3).

### 18.11 Cross-Cutting / Governance Tables

#### `approval_matrix`
Identical pattern to the Finance backend's `approval_matrix`, HR-specific `action_type` values: `LeaveApproval`, `PayrollApproval`, `RecruitmentOfferApproval`, `PerformanceFinalReview`, `SalaryRevision`, `ReimbursementClaim`.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| action_type | ENUM('LeaveApproval','PayrollApproval','RecruitmentOfferApproval','PerformanceFinalReview','SalaryRevision','ReimbursementClaim') | |
| min_threshold_amount | DECIMAL(15,2) | nullable |
| max_threshold_amount | DECIMAL(15,2) | nullable |
| required_role | ENUM('DepartmentManager','HRManager','FinanceManager') | |
| escalation_role | ENUM('HRManager','FinanceManager') | nullable |
| is_active | BOOLEAN | default true |
| created_at, updated_at | DATETIME | |

#### `approval_history`
Identical structure/pattern to the Finance backend's `approval_history` table (`action_type`, `reference_table`, `reference_id`, `requested_by`, `requested_at`, `amount`, `current_approver_role`, `status` ENUM('Pending','Approved','Rejected','Escalated'), `decided_by`, `decided_at`, `comments`).

#### `audit_logs`
Identical structure to the Finance backend's `audit_logs` table (`user_id`, `action`, `entity_type`, `entity_id`, `previous_value` JSON, `new_value` JSON, `ip_address`, `user_agent`, `created_at`), append-only, no delete endpoint under any role.

#### `notification_logs`
Identical structure to the Finance backend's `notification_logs` table (`notification_type`, `recipient`, `subject`, `template_code`, `related_entity_type`, `related_entity_id`, `status`, `sent_at`, `error_message`).

### 18.12 Shared / Cross-Module Reference Tables (NOT owned by HR)

| Table | Owning Module | Referenced By |
|---|---|---|
| `users` / `roles` | User & Access Management (future) | `employees.user_id`, virtually every `*_by`/`assigned_to` column |
| `financial_years` / `cost_centers` / `journal_entries` | Finance | `leave_balances.financial_year_id`, `departments.cost_center_id`, `payroll.journal_entry_id`, `reimbursement_claims.journal_entry_id` |
| `fixed_assets` | Inventory & Manufacturing | `employee_assets.asset_reference` |
| `work_orders` | Inventory & Manufacturing | consumed by `inventoryIntegration.service.js` for team-assignment lookups (no direct FK stored in HR; HR is the data provider, not the consumer, in this relationship) |
| `sales_orders` | Sales | consumed by `salesIntegration.service.js` for salesperson-performance lookups (HR is the data provider) |

If modules are deployed as separate services, these references are validated via internal service calls rather than physical MySQL foreign keys, exactly as specified in the Finance backend README (Section 5.10 there).

---

## 19. Entity Relationships

### 19.1 Organizational Chain

```
departments (1) ──< (M) designations
departments (1) ──< (M) employees
designations (1) ──< (M) employees
employees   (1) ──< (M) employees   [self-referencing: reporting_manager_id]
```

### 19.2 Core HR Lifecycle Chain

```
Department
    ↓
Employees
    ↓
Attendance
    ↓
Payroll
    ↓
Performance Reviews
    ↓
Compliance
    ↓
Reports / Department Scorecard
```

Expressed relationally:

```
employees          (1) ──< (M) attendance
employees          (1) ──< (M) leave_requests
employees          (1) ──< (M) payroll
employees          (1) ──< (M) performance_reviews
employees          (1) ──  (1) salary_structures (Active)
attendance          (1) ──< (M) attendance_logs
payroll             (1) ──  (1) payslips
performance_reviews (M) ──  (1) performance_cycles
```

### 19.3 Recruitment-to-Employee Chain

```
Job Opening
    ↓
Candidate
    ↓
Interview
    ↓
Offer Letter
    ↓
Employee
```

Expressed relationally:

```
job_openings (1) ──< (M) candidates
candidates   (1) ──< (M) interviews
candidates   (1) ──  (1) offer_letters
candidates   (1) ──< (M) onboarding_tasks
candidates   (1) ──  (0..1) employees   [populated only once onboarding completes — see Business Rule 9]
```

### 19.4 Cascade / Delete / Update Rule Summary

| Rule | Applies To | Behavior |
|---|---|---|
| `ON UPDATE CASCADE` | all foreign keys | standard |
| `ON DELETE RESTRICT` (default) | `department_id`, `designation_id`, `reporting_manager_id`, most transactional FKs | prevents deleting a master record with dependent history — deactivate instead |
| `ON DELETE CASCADE` | `employee_addresses.employee_id`, `employee_shift_assignments.employee_id`, `attendance_logs.attendance_id`, `salary_components.salary_structure_id`, `candidate_documents.candidate_id`, `onboarding_tasks.candidate_id` | permitted because these are strictly dependent child records with no independent meaning once the parent is gone, and parents themselves are soft-deleted rather than hard-deleted in normal operation |
| No delete endpoint at all | `audit_logs`, `notification_logs`, `approval_history`, `performance_reviews` (post-Completion), `payroll` (post-Processed) | HR/financial audit integrity requires permanence; corrections happen via new records or explicit reversal workflows |
| Soft delete only | `employees`, `candidates`, `job_openings`, `salary_structures` | `deleted_at` set, excluded from default queries but retained for historical/compliance reporting |

---

## 20. Business Rules & Workflows

1. **Employee ID must be unique:** `employees.employee_code` has a database-level `UNIQUE` constraint; generated via `employeeCodeGenerator.js`, never client-supplied.
2. **Employee email must be unique:** `employees.email` `UNIQUE` constraint; also cross-checked against `candidates.email` at employee-creation time to avoid a duplicate identity being created from an unrelated candidate application.
3. **Joining date cannot be before offer acceptance:** validated at employee-creation time (whether manual or auto-created from onboarding) against the linked `offer_letters.responded_at` date.
4. **Employee cannot clock out before clock in:** `attendance.clock_out_time` must be chronologically after `clock_in_time`, enforced at the service layer before persisting; also enforced at the raw `attendance_logs` level (a `ClockOut` log cannot be inserted without a preceding same-day `ClockIn` log).
5. **Leave cannot exceed available balance:** `leave_requests.number_of_days` validated against `leave_balances.balance` for that employee/leave-type/financial-year combination inside a row-locked transaction (`SELECT ... FOR UPDATE`) to prevent race conditions from two simultaneous requests overshooting the balance.
6. **Payroll cannot be generated twice for the same month:** enforced by the `(employee_id, payroll_month, payroll_year)` unique constraint on `payroll`; the "Run Payroll" bulk action skips (does not error on) employees who already have a row for that period, reporting a summary of skipped vs. newly generated.
7. **Payslip generated only after payroll approval:** `payslips` rows can only be created by `payroll.service.js` when the linked `payroll.status` is `Approved`, `Processed`, or `Paid` — attempting to generate against a `Draft`/`PendingApproval` row returns `409 PAYROLL_NOT_APPROVED`.
8. **Employee cannot review themselves:** `performance_reviews.reviewer_id` must not equal `employee_id`, and must equal that employee's current `reporting_manager_id`, both validated at creation.
9. **Candidate becomes employee only after onboarding completion:** the "Create Employee Automatically" action (`recruitment.service.js` → `onboarding.service.js`) is only invocable once every `onboarding_tasks` row for that candidate is `Completed`; on success, it creates the `employees` row (copying name/contact/designation from the candidate/offer), flips `candidates.status` to `Onboarded`, and emits `hr.employee.created` (consumed by the future User & Access Management module per Section 32.4).
10. **Department score automatically updates after appraisal completion:** whenever a `performance_reviews` row transitions to `Completed`, `departmentScorecard.service.js` is invoked (synchronously or via the `departmentScorecardRefresh.job.js` on its next scheduled run, whichever is architecturally preferred — recommended: mark the department "dirty" synchronously and let the next scheduled run recompute, to avoid recomputing on every single review) to recalculate that department's current-period `department_scorecards` row.
11. **Attendance status is system-derived by default:** `attendanceAbsentMarker.job.js` runs daily after shift end times and marks `Absent` for any employee with no `attendance` row and no `Approved` leave covering that date; manual overrides require a `reason` and are logged.
12. **Salary structure changes are versioned, not edited in place:** any change to an employee's compensation creates a new `salary_structures` row (`Active`) and supersedes the prior one (`Superseded`) — never a destructive update, consistent with Finance's "corrections via new records" philosophy.
13. **Offer withdrawal/decline reopens the position count:** if an `offer_letters.status` becomes `Declined`/`Withdrawn`, the linked `job_openings.number_of_positions` remaining-count (computed, not stored) increments back, and the candidate's `status` reverts to `Rejected` unless manually kept active for a different opening.
14. **Reimbursement and salary-revision approvals route through the same `approval_matrix` mechanism as Finance's Section 11**, with HR-specific thresholds (Section 22).
15. **Every status-changing action is journaled:** any transition of `payroll.status`, `leave_requests.status`, `candidates.status`, `performance_reviews.review_status`, `compliance_records.filing_status`, or `employees.status` writes an `audit_logs` row with previous and new value.

---

## 21. REST API Design

**Base path:** `/api/hr`

Standard headers, success/error envelopes, pagination conventions, and HTTP status code usage are **identical to the Finance backend's Section 8** conventions (same JSON envelope shape, same status code meanings) for full cross-module consistency. Summarized:

**Success:** `{ "success": true, "message": "...", "data": {...}, "meta": {...pagination...} }`
**Error:** `{ "success": false, "message": "...", "code": "ERROR_CODE", "errors": [{ "field": "...", "message": "..." }] }`
**Status codes:** `200`/`201` success, `400` validation, `401` auth, `403` authorization/business-readonly, `404` not found, `409` conflict/business-rule violation, `422` semantic/unprocessable, `429` rate-limited, `500` server error.

### 21.1 HR Dashboard

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/dashboard/summary` | KPI cards: headcount, attendance %, leave counts, open positions | All HR roles + Department Manager (scoped to own department) |
| GET | `/dashboard/department-distribution` | Headcount by department | All HR roles |
| GET | `/dashboard/recruitment-pipeline` | Funnel counts | All HR roles |
| GET | `/dashboard/employee-growth-trend?range=12m` | Joiners vs exits trend | All HR roles |
| GET | `/dashboard/notifications` | Notification feed | All HR roles |
| GET | `/dashboard/recent-activities` | Audit-derived activity feed | All HR roles |

**Worked example — `GET /api/hr/dashboard/summary`:**

Response `200`:
```json
{
  "success": true,
  "message": "HR dashboard summary fetched successfully",
  "data": {
    "totalEmployees": 248,
    "todayAttendancePercent": 92.3,
    "presentEmployees": 229,
    "absentEmployees": 8,
    "onLeave": 11,
    "pendingLeaveRequests": 6,
    "upcomingReviews": 14,
    "openJobPositions": 5,
    "newJoinersThisMonth": 4
  }
}
```

### 21.2 Employee

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/employees` | List/search/filter (query: `departmentId`, `designationId`, `status`, `location`) | HR Executive, HR Manager, Department Manager (scoped), Admin |
| GET | `/employees/:id` | Employee detail | Owner Employee (self), Department Manager (own team), HR roles, Admin |
| POST | `/employees` | Create employee (manual) | HR Executive, HR Manager, Admin |
| PUT | `/employees/:id` | Edit employee | HR Executive, HR Manager, Admin; Employee (limited self-service fields only — see Section 24) |
| PATCH | `/employees/:id/deactivate` | Deactivate | HR Manager, Admin |
| DELETE | `/employees/:id` | Soft-delete (rare; typically superseded by exit workflow) | Admin only |
| POST | `/employees/:id/exit` | Initiate exit workflow | HR Manager, Admin |
| GET | `/employees/export` | CSV/PDF export | HR Executive, HR Manager, Admin |
| POST | `/employees/import` | Bulk import | HR Manager, Admin |

**Worked example — `POST /api/hr/employees`:**

Request body:
```json
{
  "firstName": "Karan",
  "lastName": "Malhotra",
  "email": "karan.malhotra@company.in",
  "phone": "9876543210",
  "departmentId": 3,
  "designationId": 18,
  "reportingManagerId": 12,
  "employmentType": "FullTime",
  "joiningDate": "2026-08-01",
  "workLocation": "Delhi"
}
```

Validation: `email` unique and valid format; `phone` unique, 10-digit Indian mobile pattern; `joiningDate` ≥ any linked `offer_letters.responded_at` if created via onboarding; `reportingManagerId` must reference an `Active` employee and not equal the new employee itself.

Response `201`:
```json
{
  "success": true,
  "message": "Employee created successfully",
  "data": { "id": 249, "employeeCode": "EMP-1249", "status": "Active" }
}
```

### 21.3 Attendance

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/attendance` | List/filter (query: `employeeId`, `departmentId`, `status`, `dateFrom/To`) | HR roles, Department Manager (own team), Employee (self) |
| POST | `/attendance/clock-in` | Record clock-in for the authenticated employee | Employee (self), HR Executive (on behalf) |
| POST | `/attendance/clock-out` | Record clock-out | Employee (self), HR Executive (on behalf) |
| PATCH | `/attendance/:id` | Manual correction (requires reason) | HR Manager, Admin |
| POST | `/attendance/bulk-upload` | Bulk import attendance | HR Manager, Admin |
| GET | `/attendance/export` | CSV/PDF export | HR roles |

### 21.4 Leave

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/leave-requests` | List/filter (query: `employeeId`, `leaveTypeId`, `status`, `departmentId`) | HR roles, Department Manager (own team), Employee (self) |
| GET | `/leave-balances?employeeId=` | Balance summary | Employee (self), HR roles, Department Manager (own team) |
| POST | `/leave-requests` | Apply for leave | Employee (self) |
| PATCH | `/leave-requests/:id/approve` | Approve | Department Manager, HR Manager |
| PATCH | `/leave-requests/:id/reject` | Reject (requires reason) | Department Manager, HR Manager |
| PATCH | `/leave-requests/:id/cancel` | Cancel own pending request | Employee (self, only while Pending) |
| GET | `/leave-requests/export` | CSV/PDF export | HR roles |

**Worked example — `POST /api/hr/leave-requests`:**

Request:
```json
{
  "leaveTypeId": 1,
  "startDate": "2026-08-10",
  "endDate": "2026-08-12",
  "reason": "Family function"
}
```

Failure `409` (exceeds balance):
```json
{
  "success": false,
  "message": "Requested leave (3 days) exceeds available Casual Leave balance (1.5 days)",
  "code": "LEAVE_BALANCE_EXCEEDED",
  "errors": []
}
```

### 21.5 Payroll

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/payroll` | List/filter (query: `month`, `year`, `departmentId`, `status`) | HR roles, Finance Manager (view), Admin |
| GET | `/payroll/:id` | Detail | HR roles, Finance Manager, Employee (own record only) |
| POST | `/payroll/run` | Bulk-generate Draft payroll for a month | HR Executive, HR Manager, Admin |
| PATCH | `/payroll/:id/submit` | Draft → Pending Approval | HR Executive, HR Manager |
| PATCH | `/payroll/:id/approve` | Pending Approval → Approved | HR Manager, Finance Manager |
| PATCH | `/payroll/:id/process` | Approved → Processed (posts Finance entries) | Finance Manager, Admin |
| PATCH | `/payroll/:id/mark-paid` | Processed → Paid (posts Bank Reconciliation entry) | Finance Manager, Admin |
| POST | `/payroll/:id/payslip` | Generate payslip PDF | HR roles |
| POST | `/payroll/:id/payslip/email` | Email payslip | HR roles |
| GET | `/payroll/export` | CSV/PDF payroll register | HR roles, Finance Manager |
| GET/PUT | `/salary-structures/:employeeId` | View/revise salary structure | HR Manager, Admin (view: also Employee self, masked) |

### 21.6 Recruitment & Onboarding

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET/POST/PATCH | `/job-openings`, `/job-openings/:id` | Manage postings | HR Executive, HR Manager, Admin |
| GET/POST | `/candidates`, `/candidates/:id` | Manage candidates | HR Executive, HR Manager, Admin |
| PATCH | `/candidates/:id/stage` | Move Kanban stage | HR Executive, HR Manager |
| GET/POST/PATCH | `/interviews`, `/interviews/:id` | Schedule/update interviews | HR Executive, HR Manager, Department Manager (as interviewer) |
| GET/POST/PATCH | `/offer-letters`, `/offer-letters/:id` | Manage offers | HR Manager, Admin |
| PATCH | `/offer-letters/:id/send` \| `/accept` \| `/decline` \| `/withdraw` | Offer lifecycle | HR Manager, Admin |
| GET/PATCH | `/onboarding-tasks` | Track checklist | HR Executive, HR Manager |
| POST | `/candidates/:id/create-employee` | Convert onboarded candidate to employee (Business Rule 9) | HR Manager, Admin |

### 21.7 Performance

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET/POST | `/performance-cycles` | Manage cycles | HR Manager, Admin |
| GET/POST | `/employee-goals` | Manage goals | Employee (self, own goals), Department Manager, HR roles |
| GET | `/performance-reviews` | List/filter | HR roles, Department Manager (own team), Employee (self) |
| PATCH | `/performance-reviews/:id/self-review` | Submit self-assessment | Employee (self) |
| PATCH | `/performance-reviews/:id/manager-review` | Submit manager rating | Department Manager (must be `reviewer_id`) |
| PATCH | `/performance-reviews/:id/finalize` | HR final rating + recommendations | HR Manager |
| GET | `/performance-reviews/export` | CSV/PDF | HR roles |

### 21.8 Statutory Compliance

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/compliance/summary` | PF/ESI/TDS/PT totals | HR roles, Finance Manager |
| GET | `/compliance/records` | List filing periods | HR roles, Finance Manager |
| POST | `/compliance/records/:id/file` | Mark Filed | HR Manager, Finance Manager |
| POST | `/compliance/reports/generate` | Generate PDF/Excel report | HR Manager, Finance Manager |
| GET | `/compliance/reports/:id/download` | Download | HR roles, Finance Manager |

### 21.9 Department Performance Scorecard

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/department-scorecards?period=` | List all department scores for a period | HR roles, Department Manager (own department), Admin |
| GET | `/department-scorecards/:departmentId/history` | Trend history | HR roles, Admin |
| POST | `/department-scorecards/recalculate` | Force on-demand recalculation | HR Manager, Admin |

### 21.10 AI Resume Screening

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| POST | `/resume-screening/upload` | Upload resume + trigger scoring (multipart, Multer) | HR Executive, HR Manager |
| GET | `/resume-screening/ranking?jobOpeningId=` | Ranked candidate list for a job | HR Executive, HR Manager, Admin |
| POST | `/resume-screening/:candidateId/shortlist` | Shortlist (advances candidate stage) | HR Executive, HR Manager |
| POST | `/resume-screening/:candidateId/reject` | Reject | HR Executive, HR Manager |

**Worked example — `POST /api/hr/resume-screening/upload`:**

Request: `multipart/form-data` — `resume` (file), `jobOpeningId`, `candidateName`, `email`, `phone`.

Validation: file type restricted to PDF/DOC/DOCX, max 5MB (Multer + `uploadHandler.middleware.js`); `jobOpeningId` must reference an `Open` job opening.

Response `201`:
```json
{
  "success": true,
  "message": "Resume uploaded and scored successfully",
  "data": {
    "candidateId": 118,
    "overallScore": 78.4,
    "skillMatchPercentage": 82.0,
    "experienceMatchPercentage": 70.0,
    "educationMatchPercentage": 90.0,
    "certificationMatchPercentage": 65.0,
    "rankingPosition": 3
  }
}
```

### 21.11 Approvals & Audit

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/approvals` | List pending/all approval requests | HR Manager, Finance Manager, Admin |
| POST | `/approvals/:id/approve` | Approve | per `approval_matrix` |
| POST | `/approvals/:id/reject` | Reject | per `approval_matrix` |
| GET | `/audit-logs` | Query audit trail | Admin |

---

## 22. Validation Rules

| Field | Rule |
|---|---|
| Employee Name (first/last) | required, 2–50 chars, letters/spaces/hyphens only |
| Email | required, valid email format, unique across `employees` and cross-checked against `candidates` |
| Phone | required, `^[6-9]\d{9}$` (Indian mobile), unique |
| Joining Date | required, valid date, ≥ linked offer's acceptance date if applicable |
| Salary (any component/CTC) | required, numeric, ≥ 0, max 2 decimal places |
| Attendance Time (clock in/out) | required valid datetime; clock-out must be after clock-in |
| Leave Date (start/end) | required, end ≥ start, cannot be a `holiday_date` marked non-workable unless leave type explicitly allows |
| Leave Balance (request days) | ≤ current `leave_balances.balance` for that type |
| Department / Designation | required, must reference an active, existing record |
| Performance Rating | numeric, between 1.0 and 5.0 inclusive, one decimal place |
| Candidate Resume (upload) | required for AI screening, MIME type PDF/DOC/DOCX, max 5MB |
| Interview Date | required, valid future datetime at scheduling time |
| Offer Date / Joining Date Offered | required, offered joining date ≥ today at offer-creation time |
| GSTIN / PAN (on compliance-adjacent forms) | reuses the identical pattern defined in the Finance backend README for consistency |
| IFSC (bank details) | exactly 11 characters, `^[A-Z]{4}0[A-Z0-9]{6}$` |
| Bank Account Number | numeric string, 9–18 digits |
| Pagination params | `page` ≥ 1, `pageSize` 1–100 (default 10), `sortOrder` `asc`/`desc` |
| File Upload (documents/resumes) | required MIME whitelist per field, max size enforced by `uploadHandler.middleware.js` (5MB resumes/documents, 2MB profile photos) |

All validators implemented as `express-validator` chains in `validators/`, run via `validate.middleware.js` before controllers execute.

---

## 23. Role-Based Access Control

Six roles: **HR Executive**, **HR Manager**, **Department Manager**, **Employee**, **Finance Manager**, **Admin**. Roles are ultimately managed by the future User & Access Management module; HR consumes a `role` claim in the JWT plus a live/cached permission check, identical pattern to the Finance backend's Section 10.

| Capability | HR Executive | HR Manager | Department Manager | Employee | Finance Manager | Admin |
|---|---|---|---|---|---|---|
| Create Employee | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Edit Employee (full) | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| View Own Profile / Update Limited Fields | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Manage Attendance (mark/correct) | ✅ | ✅ | ❌ (view own team only) | ❌ (self clock-in/out only) | ❌ | ✅ |
| Apply Leave | ✅ (self) | ✅ (self) | ✅ (self) | ✅ (self) | ❌ | ✅ |
| Approve Leave | ❌ | ✅ | ✅ (own team) | ❌ | ❌ | ✅ |
| Manage Recruitment (job openings, candidates, interviews) | ✅ | ✅ | ❌ (interviewer role only) | ❌ | ❌ | ✅ |
| Approve Recruitment Offer | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Generate Payroll | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Approve Payroll | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Process/Pay Payroll | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Download Own Payslip | ❌ | ❌ | ❌ | ✅ (self) | ❌ | ✅ |
| Review Performance (as reviewer) | ❌ | ✅ | ✅ (own team) | ✅ (self-assessment only) | ❌ | ✅ |
| Finalize Performance Rating | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| File Statutory Compliance | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| View Payroll (read-only) | ❌ | ✅ | ❌ | ❌ | ✅ | ✅ |
| Approve Salary Processing | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| View Department Scorecard (own department) | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ |
| View Department Scorecard (all departments) | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Use AI Resume Screening | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| View Audit Logs | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Full System Access | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

The `authorize.middleware.js` reads a per-route required-permission list declared in each route file — this table is the exhaustive source for populating every route's list.

---

## 24. Approval Workflow

Driven entirely by `approval_matrix` (Section 18.11), identical mechanism to the Finance backend's Section 11.

**Seeded workflows:**

**Leave Request**
```
Employee (Applies)
        ↓
Department Manager (Approves/Rejects)
        ↓
Approved / Rejected
```
Escalates to HR Manager if the Department Manager does not act within 48 hours.

**Payroll Processing**
```
HR Executive (Generates Draft)
        ↓
HR Manager (Approves)
        ↓
Finance Manager (Approves Salary Processing)
        ↓
Processed → Paid
```

**Recruitment**
```
Interview (Completed, Recommendation Recorded)
        ↓
HR Manager (Approves Offer)
        ↓
Offer Letter Sent
        ↓
Employee Creation (on acceptance + onboarding completion)
```

**Performance Review**
```
Employee (Self Review)
        ↓
Manager (Manager Review)
        ↓
HR Manager (Final Review — sets Promotion/Training recommendation)
        ↓
Completed
```

**Lifecycle states:** `Pending` → `Approved`/`Rejected`, or `Pending` → `Escalated` → `Approved`/`Rejected`. Every transition writes to `approval_history` (append-only) with `decided_by`, `decided_at`, `comments`. The originating record only changes state once `Approved` — rejection leaves it unchanged and notifies the requester by email.

**Escalation job:** `approvalEscalation`-equivalent scheduled task (extending `jobs/` following the Finance backend's pattern) runs hourly, escalates `Pending` requests older than the SLA window.

---

## 25. Email Automation

All emails sent via `email.service.js` (Nodemailer, HTML templates), every attempt logged to `notification_logs`.

| Trigger | Template | Recipient | Data Included |
|---|---|---|---|
| Interview scheduled | Interview Invitation | Candidate, Interviewer | round, date/time, mode, location/link |
| Offer letter sent | Offer Letter | Candidate | designation, CTC, joining date, PDF attachment |
| Offer accepted, joining approaching (T-3 days) | Joining Reminder | Candidate, HR | joining date, documents required |
| Leave approved | Leave Approval | Employee | leave type, dates, approver |
| Leave rejected | Leave Rejection | Employee | leave type, dates, reason |
| Payroll processed | Payroll Completed | Employee | month, net salary |
| Payslip generated | Payslip Email | Employee | PDF attachment |
| Performance review stage due | Performance Review Reminder | Employee/Manager | cycle, due date, current stage |
| Employee birthday (daily check) | Birthday Wishes | Employee (CC team/manager optional) | — |
| Employee work anniversary (daily check) | Work Anniversary Wishes | Employee (CC team/manager optional) | years of service |
| Compliance filing due (T-5 days) | GST/Statutory Return Reminder-equivalent | HR Manager, Finance Manager | compliance type, period, due date |
| Approval requested | Approval Requested | Approver role's users | reference, requestor, amount if applicable |

Reminder/celebratory emails (Joining Reminder, Performance Review Reminder, Birthday/Anniversary Wishes, Compliance Reminder) are triggered by scheduled jobs (`payrollReminder.job.js`, `complianceReminder.job.js`, `birthdayAnniversaryNotifier.job.js`); transactional emails (Offer, Leave decision, Payroll/Payslip) are triggered synchronously immediately after the underlying transaction commits.

---

## 26. PDF Generation

Implemented via `pdf.service.js` using PDFKit, identical layout conventions to the Finance backend's Section 13 (company letterhead header, ruled tables, right-aligned currency, footer with page number + QR code linking back to the source record).

Report/document types:

- **Payslip** — earnings/deductions breakdown, net pay in words, company branding, QR code linking to a verification endpoint.
- **Offer Letter** — designation, CTC breakdown, joining date, terms, signature block.
- **Appointment Letter** — issued post-joining, formal employment terms.
- **Experience Letter** — issued on exit, tenure and role summary.
- **Relieving Letter** — issued on exit, linked to `employee_exits.relieving_letter_document_id`.
- **Salary Certificate** — on-demand, current CTC/salary breakdown for external use (loan applications etc.).
- **Employee Profile** — full profile export (personal, employment, documents summary).
- **Leave Report** — leave register for a period/department.
- **Performance Report** — review summary with ratings and recommendations.

Every generated document is persisted with a file path record (an `employee_documents` row for employee-specific documents, or a dedicated report record analogous to Finance's `compliance_reports` for aggregate reports) and served through an authenticated download endpoint — never a public static URL.

---

## 27. AI Feature 1 — AI Resume Screening (Backend Logic)

**Resume Upload:** `POST /resume-screening/upload` (Multer-handled multipart) stores the file via `document.service.js`, creates/updates the `candidates` row, and immediately invokes `resumeAI.service.js`.

**Resume Parsing:** `resumeAI.service.js` extracts raw text from the uploaded PDF/DOC/DOCX (text-extraction library appropriate to the file type — implementation detail left to the build agent, but must support both PDF and Word formats) and structures it into sections: Skills, Experience (roles + durations), Education, Certifications.

**Skill Extraction:** keyword/phrase extraction against a configurable skills taxonomy (stored in `config/constants.js`, extensible to a `skills_taxonomy` table if the list grows large), producing a candidate skill list.

**Experience Matching:** compares total years of relevant experience (summed from parsed role durations, weighted by role-title similarity to the job opening's designation) against the job opening's required experience band.

**Education Matching:** compares parsed degree/qualification level against the job opening's minimum education requirement (configurable per job opening or designation).

**Certification Matching:** compares parsed certifications against a configurable list of certifications relevant to the job opening's category.

**Keyword Matching:** a secondary, simpler check — direct keyword overlap between the resume text and the job description text, contributing a minor weighting factor to the Skill Match sub-score (guards against the structured skill-taxonomy match missing domain-specific terms).

**Overall Match Score (`utils/resumeMatchScorer.js`):** a configurable weighted formula, e.g.:
```
overall_score = (skill_match × 0.40) + (experience_match × 0.30) + (education_match × 0.15) + (certification_match × 0.15)
```
Weights are stored in `config/constants.js` so they can be tuned without code changes. Result persisted to `resume_scores`.

**Candidate Ranking:** `ranking_position` computed by ordering all `resume_scores` rows for the same `job_opening_id` by `overall_score` descending, recalculated whenever a new resume is scored against that job opening or the job opening's description changes (via `resumeRescore.job.js`).

**Recommendation Engine:** the "Top Recommendations" surfaced on the frontend are simply the top-N (default 3) ranked candidates per job opening — no separate model, keeping this transparent and explainable rather than a black box.

**Database Tables:** `resume_scores` (output), `candidates`, `candidate_documents`, `job_openings` (input).

**Cron Jobs:** `resumeRescore.job.js` — triggered on-demand when a job opening's description/requirements change (event-driven) rather than a blind daily schedule, since re-scoring is only meaningful after an input changes.

**Caching:** ranking results are read directly from the persisted `resume_scores` table (already a cache in effect — scoring happens once at upload time, not recomputed on every page load); the `GET /resume-screening/ranking` endpoint is a simple indexed read.

---

## 28. AI Feature 2 — Department Performance Scorecard (Backend Logic)

**Attendance Weightage:** department-average attendance % for the period, computed from `attendance` rows for all employees in that department (Present + HalfDay-weighted-as-0.5 ÷ working days).

**Goal Achievement:** department-average `employee_goals.completion_percentage`, weighted by each goal's own `weight_percentage`, aggregated per employee then averaged across the department.

**Performance Rating:** department-average `performance_reviews.final_rating` for the active/most-recently-closed cycle, normalized to a 0–100 scale (rating × 20, since ratings are 1.0–5.0).

**Project Completion:** where applicable (departments with linked Work Orders via the Inventory integration, e.g., Manufacturing), incorporates on-time Work Order completion rate sourced via `inventoryIntegration.service.js`; for departments without production data, this factor is simply omitted from the weighted formula (formula re-normalizes across whichever factors have data for that department, documented per department in the API response so scores remain comparable and explainable).

**Department Productivity:** a configurable composite (default: revenue-or-output-per-headcount where available via Sales/Inventory integration, else defaults to the Goal Achievement figure as a proxy) — kept simple and documented rather than an opaque black-box metric.

**Overall Department Score (`utils/departmentScoreCalculator.js`):** configurable weighted formula, e.g.:
```
overall_score = (attendance_score × 0.20) + (goal_achievement_score × 0.35) + (performance_rating_score × 0.30) + (productivity_score × 0.15)
```
Weights stored in `config/constants.js`.

**Monthly Ranking / Quarterly Ranking:** `rank_position` computed by ordering all departments' `department_scorecards` rows for the same `period_label` by `overall_score` descending; both a monthly (`period_label = "Jul-2026"`) and quarterly (`period_label = "Q2-FY2026-27"`) row type are supported, distinguished by label format, both persisted so the frontend's Monthly/Quarterly toggle is a simple filter rather than a live recomputation.

**Dashboard APIs:** `GET /department-scorecards?period=`, `GET /department-scorecards/:departmentId/history`, `POST /department-scorecards/recalculate` (Section 21.9) — all read from the persisted table; recalculation is triggered by `departmentScorecardRefresh.job.js` (scheduled, e.g., nightly) plus the "dirty flag" mechanism described in Business Rule 10 (Section 20) for near-real-time updates after a review completes, without recomputing on every single request.

---

## 29. Audit Logging

Every mutating HR action writes to `audit_logs`, captured automatically by `auditLogger.middleware.js` wrapping all non-GET routes, plus explicit service-layer calls for before/after value capture.

**Logged examples:** Employee Created, Employee Updated, Employee Deactivated, Attendance Edited (Manual Correction), Leave Approved/Rejected, Payroll Generated, Payroll Approved/Processed/Paid, Candidate Selected, Offer Sent/Accepted/Declined, Employee Promoted (via `promotion_recommended` finalization), Performance Rating Updated, Compliance Filed, Salary Structure Revised, Employee Exit Initiated/Completed.

**Captured fields:** `user_id`, `action`, `entity_type`, `entity_id`, `previous_value` (JSON), `new_value` (JSON), `ip_address`, `user_agent`, `created_at`, written in the same database transaction as the underlying change where feasible.

---

## 30. Error Handling

Identical centralized pattern to the Finance backend's Section 18 (`errorHandler.middleware.js`, `AppError` instances, `asyncHandler.js` wrapping controllers).

| Category | Status Code | Example |
|---|---|---|
| Validation Errors | 400 | missing required field, invalid phone format |
| Authentication Errors | 401 | missing/expired/invalid JWT |
| Authorization Errors | 403 | insufficient role; also used for business-rule read-only blocks (editing a `Processed` payroll row, reviewing without being the assigned reviewer) |
| Not Found | 404 | requested `:id` does not exist or is soft-deleted |
| Business Rule Violations / Conflicts | 409 | duplicate employee email, leave balance exceeded, payroll already generated for the period |
| Semantic/Unprocessable | 422 | onboarding-to-employee conversion attempted with incomplete checklist |
| Rate Limited | 429 | excessive requests |
| Server Errors | 500 | unexpected failure, logged via Winston, never leaks stack trace to client |

Every error response uses the standard envelope from Section 21.

---

## 31. Security

- **JWT Authentication:** short-lived access token + refresh token, identical pattern to Finance backend Section 19.
- **Role-Based Access:** enforced per-route via `authorize.middleware.js` per Section 23's matrix, plus record-level checks (e.g., an Employee can only fetch their own `GET /employees/:id`, `GET /payroll/:id`, `GET /leave-balances`; a Department Manager can only approve leave/interviews for their own team, enforced by comparing the target employee's `reporting_manager_id`/`department_id` to the acting user's linked employee record).
- **Password Hashing:** employee/user credential storage is owned by the future User & Access Management module, not HR — HR never stores or logs raw credentials; where this module's own seed/demo auth is needed standalone, bcrypt with a minimum cost factor of 12 is required.
- **Input Sanitization:** `express-validator` sanitizers (`.trim()`, `.escape()`) on all free-text fields.
- **SQL Injection Protection:** parameterized queries via Sequelize exclusively, identical to Finance backend Section 19.
- **Rate Limiting:** `rateLimiter.middleware.js`, tighter limits on expensive endpoints (`POST /resume-screening/upload`, `POST /payroll/run`, `POST /department-scorecards/recalculate`).
- **Audit Logging:** Section 29 — a security control in its own right.
- **Document Security:** resumes, ID proofs (Aadhaar/PAN), offer letters, and payslips are stored in access-controlled storage, never a public static path; download endpoints re-verify the requester's authorization (self, HR role, or explicitly permitted manager) on every request, not just at upload time.
- **Encrypted Sensitive Data:** `employee_bank_details.account_number`, Aadhaar/PAN numbers captured in `employee_documents` metadata (if stored as structured fields rather than just files), are encrypted at rest (application-level AES-256), masked in list responses (e.g., `****4521`).
- **CORS / HTTPS:** identical expectations to the Finance backend (restricted origins, HTTPS enforced at infrastructure layer).

---

## 32. Performance

- **Indexes:** every foreign key indexed; composite indexes on common filter/sort combinations (`(employee_id, attendance_date)` on `attendance`; `(payroll_year, payroll_month, status)` implied via separate indexes on `payroll`; `(department_id, period_label)` on `department_scorecards`; `(entity_type, entity_id)` on `audit_logs`).
- **Pagination:** every list endpoint paginates server-side (default 10, max 100).
- **Caching:** `department_scorecards` and `resume_scores` are cache-first outputs (Sections 27–28) — never recomputed live per dashboard request; a short-TTL cache (e.g., 60s) may additionally sit in front of `GET /dashboard/summary` for repeated-polling scenarios.
- **Optimized Queries:** Sequelize `include` with explicit `attributes` selection, avoiding N+1 patterns via scoped eager loading.
- **Lazy Loading:** related data (e.g., an employee's full document list, full attendance history) fetched only on detail-view requests, never eagerly joined into list endpoints.
- **Bulk Attendance Upload:** `POST /attendance/bulk-upload` uses Sequelize `bulkCreate` inside one transaction, not looped single-row inserts.
- **Bulk Payroll Generation:** `POST /payroll/run` iterates all active employees' `Active` salary structures and uses `bulkCreate` for the resulting `payroll` rows within one transaction, reporting a generated/skipped summary (per Business Rule 6).
- **Background Jobs:** all cron-driven work (leave accrual, absent-marking, scorecard refresh, resume rescoring, reminders) runs via `node-cron` in `jobs/`, never inline within a user-facing request/response cycle.

---

## 33. Module Integration (Backend — Critical Section)

This section is the binding backend contract with Finance, Sales, Inventory & Manufacturing, and the future User & Access Management module. The frontend's simulated integration (Part A, Section 12) must become real, working backend behavior here, using the same internal event-bus mechanism established by the Finance and Inventory backends (`events/eventBus.js`, Node `EventEmitter`-based if monolithic, message-queue-compatible interface if deployed as separate services).

### 33.1 HR ↔ Finance

| Event | Published By | Consumed By | Action |
|---|---|---|---|
| `hr.payroll.processed` | HR (`payroll.service.js`, on `POST /payroll/:id/process`) | Finance | posts a Salary Expense journal entry (Debit: Salary Expense, Credit: Salary Payable) via Finance's internal posting service |
| `hr.payroll.pf_esi_tds_calculated` | HR (at payroll generation) | Finance | posts PF/ESI/TDS statutory liability entries to the corresponding Finance ledger accounts |
| `hr.reimbursement.approved` | HR (`reimbursement_claims` approval) | Finance | posts a reimbursement expense journal entry (mirrors Finance's Accounts Payable posting pattern) |
| `finance.payroll.paid_confirmation` | Finance (Bank Reconciliation module, once the salary bank transaction clears) | HR | updates `payroll.status` to `Paid` and the linked `payslips` become downloadable/emailable |

**Data flow:**

```
Payroll Generated
        ↓
Salary Expense Journal Entry (Finance)
        ↓
General Ledger
        ↓
Bank Payment
        ↓
Payslip Status Updated
```

```
PF Calculated (HR Payroll)
        ↓
Finance PF Ledger Entry
```

```
ESI Calculated (HR Payroll)
        ↓
Finance ESI Ledger Entry
```

```
TDS Calculated (HR Payroll)
        ↓
Finance TDS Ledger Entry
```

```
Expense Claim Approved (HR)
        ↓
Finance Reimbursement Entry
```

**Synchronous read (not event-based):** Finance's Budgeting module reads HR's `payroll` aggregate directly (via `GET /api/hr/payroll?departmentId=&month=&year=`) when computing department budget actuals for the "Salaries" line item, rather than waiting for the async GL posting, so budget-vs-actual figures reflect payroll commitments immediately.

### 33.2 HR ↔ Sales

| Event/Reference | Direction | Action |
|---|---|---|
| Employee lookup (synchronous) | Sales → HR | Sales' order-creation flow calls `GET /api/hr/employees?departmentId=<SalesDeptId>&status=Active` (via `salesIntegration.service.js`'s exposed read endpoint) to populate the Sales Executive assignment dropdown — Sales never stores its own employee copy |
| `hr.employee.transferred` | HR → Sales | when an employee's `department_id`/`reporting_manager_id` changes, Sales' team-hierarchy cache (if any) is invalidated/refreshed |
| Salesperson performance (synchronous) | Sales → HR | a future "Team Performance Dashboard" endpoint in Sales joins its own order/revenue data against `GET /api/hr/employees/:id` for name/photo/department display context |

**Data flow:**

```
Sales Executive Created (Employee Record in HR)
        ↓
Salesperson Mapping (Sales reads Employee via API)
        ↓
Sales Performance Tracked (in Sales module)
        ↓
Team Performance Dashboard (Sales, enriched with HR employee data)
```

```
Sales Commission Calculated (Sales)
        ↓
Payroll (HR — bonus_amount/component on the relevant payroll row)
        ↓
Finance (Salary Expense Journal Entry)
```

### 33.3 HR ↔ Inventory & Manufacturing

| Event/Reference | Direction | Action |
|---|---|---|
| Production worker lookup (synchronous) | Inventory → HR | Inventory's Work Order "Assigned Team" field calls `GET /api/hr/employees?departmentId=<ManufacturingDeptId>` |
| Shift schedule lookup (synchronous) | Inventory → HR | Inventory's Production Planning reads `GET /api/hr/shift-assignments?employeeId=` (a light read endpoint over `employee_shift_assignments`) to display which shift a work order's team is on |
| Machine operator lookup (synchronous) | Inventory → HR | the Shop-Floor Map's machine tooltip resolves operator identity the same way |
| `hr.attendance.marked` | HR → Inventory | Inventory's OEE Dashboard "Shift Performance" panel consumes daily attendance counts per department/shift to distinguish staffing-driven OEE loss from equipment-driven loss |
| `hr.employee_asset.assigned` / `hr.employee_asset.returned` | HR ↔ Inventory | assigning an asset to an employee in HR creates/updates the corresponding record referenced by `fixed_assets.assigned_employee_id` in Inventory (Inventory's Section 5.6); on employee exit, HR's `employee_exits` clearance requirement (Business Rule, Section 18.10) calls Inventory's asset-reassignment endpoint to flag the asset for return |

**Data flow:**

```
Production Worker (Employee, HR)
        ↓
Shift Assignment (HR)
        ↓
Attendance (HR)
        ↓
Work Order Assignment (Inventory, resolves team via HR API)
        ↓
Machine Allocation (Inventory)
        ↓
Production Reports (Inventory, enriched with HR attendance)
```

```
Employee Asset Assignment (HR)
        ↓
Inventory Asset Register (fixed_assets.assigned_employee_id updated)
        ↓
Employee Exit Initiated (HR)
        ↓
Return Asset Triggered (Inventory, asset status reverts to unassigned/InUse-unassigned)
        ↓
Exit Clearance Completed (HR)
```

### 33.4 HR ↔ User & Access Management

| Event | Published By | Consumed By | Action |
|---|---|---|---|
| `hr.employee.created` | HR (Business Rule 9 conversion, or manual creation) | User & Access Management | creates an ERP login (`users` row), generates a temporary credential, sends a welcome/activation email |
| `hr.employee.role_context` | HR | User & Access Management | supplies department/designation as input to that module's role-mapping logic (HR does not assign ERP roles directly — it supplies the organizational context the other module maps to a role) |
| `hr.employee.deactivated` / `hr.employee.exited` | HR | User & Access Management | disables/revokes the corresponding `users` row's login access immediately |
| `hr.department.head_assigned` | HR | User & Access Management | updates that department's entry in the ERP-wide approval-routing configuration (who receives Finance/Procurement/HR approval tasks for that department) |
| `accessmgmt.user.provisioned` | User & Access Management | HR | confirms back to HR that `employees.user_id` should be populated with the newly created `users.id`, completing the link |

**Data flow:**

```
Candidate Joined (Onboarding Completed, HR)
        ↓
Employee Created (HR)
        ↓
ERP Login Created (User & Access Management)
        ↓
Role Assigned (User & Access Management, using HR's department/designation context)
        ↓
Department Permissions Applied
        ↓
Approval Workflow Updated (this employee now appears correctly in relevant approval chains)
```

```
Employee Exit Initiated (HR)
        ↓
ERP Login Disabled (User & Access Management)
        ↓
Role Revoked
        ↓
Asset Return Triggered (Inventory, per Section 33.3)
        ↓
Exit Clearance Completed (HR)
```

### 33.5 Future Module Integrations (Backend Preview)

**HR ↔ Procurement** — `hr.department.head_assigned` (already defined above for User & Access Management) doubles as the input Procurement's future approval-matrix will consume for "Purchase Approver" mapping; no new HR-side event is needed, only a new consumer.

**HR ↔ Marketing** — Marketing team performance will read HR employee/department data identically to the Sales integration pattern (Section 33.2), requiring no new HR-side capability, only a new consuming service in Marketing.

**HR ↔ CRM** — sales target-setting will read HR's designation/hierarchy data the same way; again no new HR-side endpoint required beyond what's already exposed for Sales.

**HR ↔ Document Management** — `document.service.js`'s current direct-filesystem/object-storage implementation is architected behind a thin interface (`storeDocument()`, `retrieveDocument()`, `deleteDocument()`) specifically so a future Document Management module's centralized storage/versioning API can be swapped in as the implementation without changing any HR controller/service call sites.

**HR ↔ Quality Management** — `training_records.training_type = 'Compliance'` rows are the anchor point a future Quality Management module will read to verify staff certification compliance (e.g., ISO training currency) without HR needing to model quality-specific concepts itself.

### 33.6 ERP Backend Design Principle

Every HR table that represents a business object also owned conceptually by another module (bank/GL accounts referenced via `journal_entry_id`, assets referenced via `asset_reference`, ERP login referenced via `user_id`) is a foreign-key/event reference, never a duplicated copy. Every business object HR itself owns (Employees, Attendance, Leave, Payroll, Performance Reviews, Recruitment, Compliance) is exposed to other modules exclusively through versioned REST endpoints and/or published events — never through direct cross-module database access. This is the same event-driven, single-ownership approach already established by the Finance and Inventory backends, and is what lets Procurement, Marketing, CRM, Document Management, and Quality Management integrate later by subscribing to existing HR events and calling existing HR endpoints, without requiring a redesign of the HR schema — mirroring how SAP S/4HANA's integrated HCM module, Oracle NetSuite's unified employee-and-financials data model, Microsoft Dynamics 365's Dataverse, Zoho People's cross-app data sharing, and Odoo's shared HR/Payroll/Accounting apps keep workforce data coherent as the ERP grows.

---

## 34. Backend Build Checklist (for the implementing AI)

1. Scaffold the folder structure exactly as specified in Section 16.
2. Implement `config/` (database, env, logger, constants, mailer, upload) first.
3. Write migrations for every table in Section 18, in dependency order (`departments`, `designations` before `employees`; `employees` before everything that references it; junction/dependent tables last).
4. Write Sequelize models with full association definitions matching Section 19, then seeders for reference data (`departments`, `designations`, `leave_types`, `holidays`, `shifts`, `approval_matrix`, one seeded active `performance_cycles` row).
5. Build the Service layer before Controllers — business rules (Section 20) live here and must be unit-testable independently of HTTP.
6. Build validators (Section 22) and wire `validate.middleware.js`; build `uploadHandler.middleware.js` for resume/document endpoints.
7. Build `authenticate.middleware.js` and `authorize.middleware.js` against the RBAC matrix (Section 23).
8. Build Controllers + Routes per the API design in Section 21, module by module, in the same order as the frontend build checklist: Dashboard → Employee → Attendance → Leave → Payroll → Recruitment & Onboarding → Performance → Compliance → Department Scorecard → Resume Screening.
9. Build `events/eventBus.js` and `hrEventHandlers.js`, then implement `financeIntegration.service.js`, `salesIntegration.service.js`, `inventoryIntegration.service.js`, and `accessManagementIntegration.service.js` against the contracts in Section 33 — validate each with integration tests simulating the relevant cross-module event or read call.
10. Build the approval workflow (`approval.service.js`) against `approval_matrix`/`approval_history`, then wire it into Leave, Payroll, Recruitment Offer, and Performance Finalization flows.
11. Build `email.service.js` (templates per Section 25) and `pdf.service.js` (document layouts per Section 26).
12. Build the two AI feature services (`resumeAI.service.js`/`resumeMatchScorer.js`, `departmentScorecard.service.js`/`departmentScoreCalculator.js`) and their cron jobs.
13. Wire `auditLogger.middleware.js` globally and verify every mutating endpoint produces the expected `audit_logs` row.
14. Apply cross-cutting hardening: rate limiting, input sanitization, encrypted sensitive fields (bank details, Aadhaar/PAN), document-access re-verification, centralized error handling.
15. QA pass: verify every business rule in Section 20 has an automated test, every endpoint in Section 21 returns the documented success/error envelope and status codes, and the Candidate→Employee→Payroll→Finance and Employee→User-Login→Access-Revocation chains work end-to-end against seeded dummy/reference data.

**End of Human Resource Module README (Frontend + Backend).**
