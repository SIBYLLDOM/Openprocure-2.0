# Finance & Accounting Module — Backend Implementation Blueprint

## Enterprise ERP System — Backend README

**Version:** 1.0
**Module Owner:** Finance & Accounting
**Consumer:** Backend build agent (Antigravity)
**Stack:** Node.js, Express.js, MySQL, Sequelize ORM, JWT, Express Validator, Nodemailer, PDFKit
**Architecture:** MVC
**Companion Document:** Finance & Accounting Frontend README (already generated — this backend must satisfy every data need described there)
**Status:** Blueprint only — no code, no SQL, no Sequelize models, no Express routes are produced here

---

## 1. Purpose & Scope

This document is the complete backend engineering blueprint for the Finance & Accounting Module. It defines the database schema, entity relationships, business rules, REST API contract, validation rules, security model, role-based access control, approval workflows, notification and reporting subsystems, and the backend logic for the three AI features (Cash Flow Forecast, Anomaly & Fraud Detection, One-Click Compliance Pack).

It is written so that another AI agent can implement the entire backend — database, models, controllers, routes, services, validators, middlewares — without needing to ask a single clarifying question. Every table, every field, every endpoint, every rule is specified explicitly.

This backend must satisfy every screen, table, filter, KPI, chart, modal, and action defined in the Finance & Accounting Frontend README, and must implement the Sales ↔ Finance integration contract defined there as real, working backend logic (not a simulation).

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (LTS) |
| Web Framework | Express.js |
| Database | MySQL 8.x |
| ORM | Sequelize |
| Authentication | JWT (access token + refresh token pattern) |
| Validation | express-validator |
| Email | Nodemailer (SMTP transport, templated HTML emails) |
| PDF Generation | PDFKit |
| Architecture Pattern | MVC (Model – View(JSON API) – Controller), layered with a Service layer between Controllers and Models |
| Logging | Winston (application/error logs to file + console) + Morgan (HTTP request logging, piped into Winston stream) |
| Scheduled Jobs | node-cron (for forecast regeneration, overdue-status recalculation, reminder emails, depreciation runs) |
| Environment Config | dotenv-based `config/` module, environment-specific config (development/staging/production) |

**Layered architecture (per request):**

```
Route → Middleware (auth, rbac, validation) → Controller → Service → Model (Sequelize) → MySQL
                                                    ↓
                                          Response formatter → JSON response
```

Controllers stay thin: they parse the request, call a Service method, and shape the HTTP response. All business logic (calculations, cross-table orchestration, business-rule enforcement, integration events) lives in the Service layer, never in the Controller or the Model. This keeps business rules testable and reusable (e.g., the same "post invoice to GL" service function is called both by the Accounts Receivable controller and by the internal Sales-integration event handler).

---

## 3. Complete Backend Folder Structure

```
backend/
├── config/
│   ├── database.js            (Sequelize connection config per environment)
│   ├── env.js                 (centralized env var loader/validator)
│   ├── logger.js              (Winston setup)
│   ├── constants.js           (enums, status lists, thresholds default values)
│   └── mailer.js              (Nodemailer transporter config)
│
├── controllers/
│   ├── financeDashboard.controller.js
│   ├── generalLedger.controller.js
│   ├── accountsPayable.controller.js
│   ├── accountsReceivable.controller.js
│   ├── bankReconciliation.controller.js
│   ├── budget.controller.js
│   ├── fixedAssets.controller.js
│   ├── gst.controller.js
│   ├── cashFlowForecast.controller.js
│   ├── fraudDetection.controller.js
│   ├── compliance.controller.js
│   ├── vendor.controller.js
│   ├── chartOfAccounts.controller.js
│   ├── costCenter.controller.js
│   ├── financialYear.controller.js
│   ├── approval.controller.js
│   └── auditLog.controller.js
│
├── models/
│   ├── financialYear.model.js
│   ├── chartOfAccount.model.js
│   ├── costCenter.model.js
│   ├── journalEntry.model.js
│   ├── journalEntryLine.model.js
│   ├── generalLedger.model.js
│   ├── accountsReceivable.model.js
│   ├── customerPayment.model.js
│   ├── creditNote.model.js
│   ├── vendor.model.js
│   ├── accountsPayable.model.js
│   ├── payment.model.js
│   ├── bankAccount.model.js
│   ├── bankTransaction.model.js
│   ├── bankReconciliation.model.js
│   ├── bankReconciliationMatch.model.js
│   ├── budgetDepartment.model.js
│   ├── budget.model.js
│   ├── budgetAllocation.model.js
│   ├── budgetHistory.model.js
│   ├── assetCategory.model.js
│   ├── fixedAsset.model.js
│   ├── assetDepreciation.model.js
│   ├── assetDisposal.model.js
│   ├── gstRecord.model.js
│   ├── gstReturn.model.js
│   ├── tdsRecord.model.js
│   ├── cashFlowForecast.model.js
│   ├── fraudRule.model.js
│   ├── fraudAlert.model.js
│   ├── complianceReport.model.js
│   ├── approvalMatrix.model.js
│   ├── approvalHistory.model.js
│   ├── auditLog.model.js
│   ├── notificationLog.model.js
│   └── index.js                (Sequelize init + associations registry)
│
├── routes/
│   ├── financeDashboard.routes.js
│   ├── generalLedger.routes.js
│   ├── accountsPayable.routes.js
│   ├── accountsReceivable.routes.js
│   ├── bankReconciliation.routes.js
│   ├── budget.routes.js
│   ├── fixedAssets.routes.js
│   ├── gst.routes.js
│   ├── cashFlowForecast.routes.js
│   ├── fraudDetection.routes.js
│   ├── compliance.routes.js
│   ├── vendor.routes.js
│   ├── approval.routes.js
│   ├── auditLog.routes.js
│   └── index.js                (mounts all Finance routes under /api/finance)
│
├── middlewares/
│   ├── authenticate.middleware.js     (JWT verification)
│   ├── authorize.middleware.js        (RBAC — role/permission check)
│   ├── validate.middleware.js         (express-validator error collector)
│   ├── financialYearGuard.middleware.js (blocks posting to closed years)
│   ├── errorHandler.middleware.js     (centralized error formatter)
│   ├── rateLimiter.middleware.js
│   ├── auditLogger.middleware.js      (auto-logs mutating requests)
│   └── requestLogger.middleware.js    (Morgan → Winston bridge)
│
├── validators/
│   ├── generalLedger.validator.js
│   ├── accountsPayable.validator.js
│   ├── accountsReceivable.validator.js
│   ├── bankReconciliation.validator.js
│   ├── budget.validator.js
│   ├── fixedAssets.validator.js
│   ├── gst.validator.js
│   ├── vendor.validator.js
│   ├── payment.validator.js
│   └── common.validator.js     (shared rules: dates, currency amounts, pagination params)
│
├── services/
│   ├── generalLedger.service.js
│   ├── accountsPayable.service.js
│   ├── accountsReceivable.service.js
│   ├── bankReconciliation.service.js
│   ├── budget.service.js
│   ├── fixedAssets.service.js
│   ├── depreciation.service.js
│   ├── gst.service.js
│   ├── cashFlowForecast.service.js
│   ├── fraudDetection.service.js
│   ├── compliance.service.js
│   ├── approval.service.js
│   ├── auditLog.service.js
│   ├── notification.service.js         (orchestrates email triggers)
│   ├── pdf.service.js                  (PDFKit report generation)
│   ├── salesIntegration.service.js     (handles inbound Sales module events)
│   └── financialYear.service.js
│
├── jobs/                                (node-cron scheduled tasks)
│   ├── depreciationRun.job.js           (monthly asset depreciation posting)
│   ├── overdueStatusRefresh.job.js      (daily AR/AP overdue recalculation)
│   ├── cashFlowForecastRefresh.job.js   (daily/hourly forecast regeneration)
│   ├── fraudScan.job.js                 (periodic anomaly scan)
│   ├── reminderEmails.job.js            (AR reminders, GST return due reminders)
│   └── index.js                         (registers all cron jobs on server start)
│
├── events/
│   ├── eventBus.js                      (in-process event emitter used for cross-module + cross-service decoupling)
│   └── financeEventHandlers.js          (listens for sales.invoice.created, sales.return.approved, etc.)
│
├── utils/
│   ├── apiResponse.js          (standard success/error response builders)
│   ├── asyncHandler.js         (try/catch wrapper for async controllers)
│   ├── currency.js             (INR formatting, rounding rules)
│   ├── gstCalculator.js        (CGST/SGST/IGST calculation logic)
│   ├── depreciationCalculator.js (straight-line / WDV formulas)
│   ├── riskScoreCalculator.js  (fraud risk scoring formula)
│   ├── forecastEngine.js       (cash flow projection algorithm)
│   ├── pagination.js
│   ├── qrCodeGenerator.js      (for PDF QR codes)
│   └── voucherNumberGenerator.js
│
├── database/
│   ├── migrations/              (one migration file per table, timestamped)
│   └── seeders/                 (dummy/reference data seeders: chart of accounts, fraud rules, approval matrix)
│
├── app.js                       (Express app setup, middleware mounting)
└── server.js                    (HTTP server bootstrap, DB connection, cron job registration)
```

Every controller has exactly one matching route file, one matching (or shared) service file, and validators live separately from controllers so validation chains can be unit-tested independently.

---

## 4. Database Design Principles

- **Engine:** InnoDB for every table (transactional integrity, foreign key support).
- **Charset/Collation:** `utf8mb4` / `utf8mb4_unicode_ci` on every table (supports ₹ symbol and any regional-language text safely).
- **Primary keys:** every table uses `id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY` unless otherwise noted.
- **Timestamps:** every table includes `created_at DATETIME` and `updated_at DATETIME` (Sequelize-managed). Tables representing mutable master/transactional records also include a nullable `deleted_at DATETIME` for soft deletes (Sequelize `paranoid: true`); pure log/history tables (audit_logs, notification_logs, budget_history, approval_history) are append-only and do not support deletion at all.
- **Monetary columns:** `DECIMAL(15,2)` — never FLOAT/DOUBLE, to avoid rounding errors in financial calculations.
- **Percentage/rate columns:** `DECIMAL(5,2)`.
- **Foreign keys:** named `<referenced_entity>_id`, always indexed, `ON DELETE RESTRICT ON UPDATE CASCADE` by default unless a table-specific rule overrides this (see Section 6).
- **Enums:** implemented as MySQL `ENUM(...)` columns for fixed, rarely-changing value sets (statuses, types) for storage efficiency and DB-level integrity.
- **Naming convention:** `snake_case` for all tables and columns; table names plural (e.g., `accounts_receivable` is treated as a singular mass-noun exception, consistent with standard accounting terminology).
- **Normalization:** schema is normalized to Third Normal Form (3NF) for all transactional tables. The one intentional denormalization is the `general_ledger` table, which mirrors posted `journal_entry_lines` data for fast, index-friendly read access on the General Ledger page — this is a standard data-warehousing-style read model, populated transactionally in the same DB transaction as the posting operation, never eventually-consistent.
- **Multi-year support:** every transactional table carries a `financial_year_id` foreign key so reporting, closing, and locking operate per financial year without needing date-range guessing.
- **Cross-module references:** tables owned by other modules (Sales' `customers`, `sales_invoices`, `sales_returns`; the future User & Access Management module's `users`, `roles`; the future HR module's `employees`) are referenced by foreign key ID only. Finance does not duplicate their data — see Section 5.5.

---

## 5. Database Tables

### 5.1 Core Ledger & Chart of Accounts

#### `financial_years`
**Purpose:** Defines accounting periods; governs whether transactions can be posted.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| year_code | VARCHAR(20) | e.g. `FY2026-27` |
| start_date | DATE | |
| end_date | DATE | |
| status | ENUM('Open','Closed','Locked') | default `Open` |
| closed_by | BIGINT UNSIGNED FK → users.id | nullable |
| closed_at | DATETIME | nullable |
| created_at, updated_at | DATETIME | |

**Unique:** `year_code`. **Indexes:** `status`. **Business Rules:** exactly one year may be `Open` at a time; no transactional table may insert/update a row referencing a `Closed` or `Locked` year (enforced by `financialYearGuard` middleware + service-layer check). Closing requires CFO approval (see Section 10). **Expected records:** ~5–10 (multi-year history).

#### `chart_of_accounts`
**Purpose:** Master list of GL accounts (Asset/Liability/Equity/Revenue/Expense hierarchy).

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| account_code | VARCHAR(20) | e.g. `1001` |
| account_name | VARCHAR(150) | e.g. "Accounts Receivable" |
| account_type | ENUM('Asset','Liability','Equity','Revenue','Expense') | |
| account_subtype | VARCHAR(50) | e.g. "Current Asset", "Fixed Asset" |
| parent_account_id | BIGINT UNSIGNED FK → chart_of_accounts.id | nullable, self-referencing for hierarchy |
| normal_balance | ENUM('Debit','Credit') | |
| opening_balance | DECIMAL(15,2) | default 0 |
| is_active | BOOLEAN | default true |
| is_postable | BOOLEAN | true only for leaf accounts |
| created_at, updated_at | DATETIME | |

**Unique:** `account_code`. **Indexes:** `account_type`, `parent_account_id`. **Business Rules:** only accounts with `is_postable = true` (leaf nodes with no children) may appear in `journal_entry_lines`; an account with existing ledger activity cannot be deleted, only deactivated (`is_active = false`). **Expected records:** 60–150 (standard chart of accounts for a mid-size company).

#### `cost_centers`
**Purpose:** Departmental/organizational cost segmentation, links Budgeting to GL.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| code | VARCHAR(20) UNIQUE | |
| name | VARCHAR(100) | e.g. "Marketing", "Manufacturing" |
| parent_cost_center_id | BIGINT UNSIGNED FK → cost_centers.id | nullable |
| is_active | BOOLEAN | default true |
| created_at, updated_at | DATETIME | |

**Expected records:** 6–10 (one per department, matching frontend Budgeting dummy departments).

#### `journal_entries`
**Purpose:** Header record for every accounting transaction (manual or auto-posted).

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| voucher_number | VARCHAR(30) UNIQUE | e.g. `JV-2026-0041` |
| voucher_type | ENUM('Journal','Payment','Receipt','Contra','Sales','Purchase') | |
| entry_date | DATE | |
| financial_year_id | BIGINT UNSIGNED FK → financial_years.id | RESTRICT |
| reference | VARCHAR(100) | nullable |
| description | VARCHAR(255) | |
| source_type | ENUM('Manual','SalesInvoice','VendorBill','CustomerPayment','VendorPayment','Payroll','AssetDepreciation','CreditNote','AssetDisposal') | |
| source_id | BIGINT UNSIGNED | nullable, polymorphic reference to originating record |
| status | ENUM('Draft','Posted','Reversed') | default `Draft` |
| total_debit | DECIMAL(15,2) | |
| total_credit | DECIMAL(15,2) | |
| created_by | BIGINT UNSIGNED FK → users.id | |
| posted_by | BIGINT UNSIGNED FK → users.id | nullable |
| posted_at | DATETIME | nullable |
| reversed_by | BIGINT UNSIGNED FK → users.id | nullable |
| reversed_at | DATETIME | nullable |
| reversal_of_entry_id | BIGINT UNSIGNED FK → journal_entries.id | nullable, self-referencing |
| created_at, updated_at, deleted_at | DATETIME | |

**Indexes:** `entry_date`, `(source_type, source_id)`, `status`, `financial_year_id`. **Business Rules:** `total_debit` must equal `total_credit` before status can transition to `Posted` (service-layer check inside a DB transaction); once `Posted`, an entry is immutable — corrections happen via a new reversing entry (`reversal_of_entry_id`), never an update or delete; reversal requires Finance Manager approval. **Expected records:** hundreds to thousands over a financial year; seed 10+ for demo/testing parity with frontend.

#### `journal_entry_lines`
**Purpose:** Line-level debit/credit detail for each journal entry (double-entry bookkeeping).

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| journal_entry_id | BIGINT UNSIGNED FK → journal_entries.id | CASCADE (only while parent is Draft) |
| line_number | SMALLINT UNSIGNED | |
| account_id | BIGINT UNSIGNED FK → chart_of_accounts.id | RESTRICT |
| debit_amount | DECIMAL(15,2) | default 0 |
| credit_amount | DECIMAL(15,2) | default 0 |
| cost_center_id | BIGINT UNSIGNED FK → cost_centers.id | nullable, RESTRICT |
| description | VARCHAR(255) | nullable |
| created_at, updated_at | DATETIME | |

**Indexes:** `journal_entry_id`, `account_id`. **Business Rules:** exactly one of `debit_amount`/`credit_amount` must be non-zero per line (mutually exclusive), enforced at the service/validator layer and via a MySQL `CHECK` constraint. **Expected records:** 2+ lines per journal entry (minimum for double-entry).

#### `general_ledger`
**Purpose:** Denormalized, query-optimized read model of all **posted** ledger activity — powers the General Ledger page's fast search/sort/filter/pagination without heavy joins.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| journal_entry_id | BIGINT UNSIGNED FK → journal_entries.id | RESTRICT |
| journal_entry_line_id | BIGINT UNSIGNED FK → journal_entry_lines.id | RESTRICT, UNIQUE (1:1 mirror) |
| transaction_date | DATE | |
| account_id | BIGINT UNSIGNED FK → chart_of_accounts.id | RESTRICT |
| account_name | VARCHAR(150) | denormalized snapshot |
| debit_amount | DECIMAL(15,2) | |
| credit_amount | DECIMAL(15,2) | |
| running_balance | DECIMAL(15,2) | computed at insert time per account |
| reference | VARCHAR(100) | |
| description | VARCHAR(255) | |
| voucher_number | VARCHAR(30) | denormalized |
| voucher_type | VARCHAR(20) | denormalized |
| status | ENUM('Posted','Reversed') | |
| created_by | BIGINT UNSIGNED FK → users.id | |
| financial_year_id | BIGINT UNSIGNED FK → financial_years.id | |
| created_at | DATETIME | |

**Indexes:** `transaction_date`, `account_id`, `voucher_number`, `financial_year_id`, composite `(account_id, transaction_date)` for balance queries. **Business Rules:** rows are inserted only by the `generalLedger.service.js` `postJournalEntry()` function, inside the same DB transaction that flips a `journal_entries` row to `Posted` — guarantees the GL is never out of sync with the journal. Rows are never updated in place; a reversal inserts new offsetting rows. **Expected records:** mirrors posted `journal_entry_lines` 1:1.

### 5.2 Accounts Receivable

#### `accounts_receivable`
**Purpose:** Tracks every customer invoice's outstanding balance and status; created automatically from Sales invoices.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| invoice_number | VARCHAR(30) UNIQUE | mirrors Sales invoice number |
| customer_id | BIGINT UNSIGNED FK → customers.id (Sales-owned) | RESTRICT |
| sales_invoice_id | BIGINT UNSIGNED UNIQUE | reference to Sales module's invoice record (cross-schema/cross-service reference — see Section 5.5) |
| invoice_date | DATE | |
| due_date | DATE | |
| invoice_amount | DECIMAL(15,2) | |
| tax_amount | DECIMAL(15,2) | |
| outstanding_amount | DECIMAL(15,2) | recalculated on every payment |
| payment_status | ENUM('Pending','Partial','Paid','Overdue') | |
| collection_status | ENUM('NotStarted','ReminderSent','FollowUpScheduled','Escalated','Legal') | default `NotStarted` |
| financial_year_id | BIGINT UNSIGNED FK → financial_years.id | RESTRICT |
| cost_center_id | BIGINT UNSIGNED FK → cost_centers.id | nullable |
| created_at, updated_at, deleted_at | DATETIME | |

**Indexes:** `customer_id`, `due_date`, `payment_status`, `collection_status`. **Business Rules:** created only by `salesIntegration.service.js` in response to a `sales.invoice.created` event — never created manually via the API (no public POST endpoint for raw creation, only system-internal); `outstanding_amount` = `invoice_amount` − Σ(`customer_payments.amount`) − Σ(applied `credit_notes.amount`); `payment_status` auto-derived (`Paid` when outstanding = 0, `Partial` when 0 < outstanding < invoice_amount and at least one payment exists, `Overdue` when outstanding > 0 and `due_date` < today, else `Pending`); overdue recalculation runs nightly via `overdueStatusRefresh.job.js`. **Expected records:** 8–10 seeded to match frontend AR page, growing continuously in production.

#### `customer_payments`
**Purpose:** Records payments received against AR invoices (supports partial payments).

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| payment_number | VARCHAR(30) UNIQUE | e.g. `RV-2026-0089` |
| accounts_receivable_id | BIGINT UNSIGNED FK → accounts_receivable.id | RESTRICT |
| customer_id | BIGINT UNSIGNED FK → customers.id | RESTRICT |
| payment_date | DATE | |
| amount | DECIMAL(15,2) | |
| payment_mode | ENUM('NEFT','RTGS','UPI','Cheque','Cash','Card') | |
| reference_number | VARCHAR(50) | nullable |
| bank_account_id | BIGINT UNSIGNED FK → bank_accounts.id | nullable |
| remarks | VARCHAR(255) | nullable |
| recorded_by | BIGINT UNSIGNED FK → users.id | |
| created_at, updated_at | DATETIME | |

**Indexes:** `accounts_receivable_id`, `customer_id`, `payment_date`. **Business Rules:** the sum of all `customer_payments.amount` for a given `accounts_receivable_id` may never exceed that invoice's `invoice_amount` — validated at the service layer before insert, request rejected with `409 Conflict` if it would overshoot; each successful insert triggers, in one transaction: (1) recalculation of `accounts_receivable.outstanding_amount`/`payment_status`, (2) a `journal_entries`+`journal_entry_lines` posting (Debit: Bank/Cash, Credit: Accounts Receivable), (3) emission of a `finance.payment.recorded` event consumed by `salesIntegration.service.js` to update the Sales invoice view, (4) a `customer_payment_confirmation` email. **Expected records:** grows with every payment; seed 6–8.

#### `credit_notes`
**Purpose:** Formal reduction of a customer's outstanding balance, issued for sales returns or billing corrections.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| credit_note_number | VARCHAR(30) UNIQUE | |
| customer_id | BIGINT UNSIGNED FK → customers.id | RESTRICT |
| accounts_receivable_id | BIGINT UNSIGNED FK → accounts_receivable.id | nullable, RESTRICT |
| sales_return_id | BIGINT UNSIGNED | nullable, cross-module reference to Sales return record |
| amount | DECIMAL(15,2) | |
| reason | VARCHAR(255) | |
| status | ENUM('Draft','Approved','Applied') | default `Draft` |
| approved_by | BIGINT UNSIGNED FK → users.id | nullable |
| approved_at | DATETIME | nullable |
| created_at, updated_at | DATETIME | |

**Business Rules:** a `Draft` credit note auto-created when Sales emits `sales.return.approved`; requires Finance Manager approval (`Approved` status) before it can be `Applied`; on `Applied`, `accounts_receivable.outstanding_amount` is reduced and a GL entry posted (Debit: Sales Returns/Revenue, Credit: Accounts Receivable); amount cannot exceed the linked invoice's remaining outstanding balance. **Expected records:** 2–4 seeded.

### 5.3 Accounts Payable

#### `vendors`
**Purpose:** Vendor master (Finance-owned today; will become the shared source of truth once Procurement exists — see Section 12).

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| vendor_code | VARCHAR(20) UNIQUE | |
| vendor_name | VARCHAR(150) | |
| gstin | CHAR(15) | nullable |
| pan | CHAR(10) | nullable |
| contact_person | VARCHAR(100) | nullable |
| phone | VARCHAR(15) | nullable |
| email | VARCHAR(150) | nullable |
| address | VARCHAR(255) | nullable |
| state | VARCHAR(50) | used for GST intra/inter-state determination |
| bank_account_number | VARCHAR(30) | nullable, encrypted at rest (see Section 20) |
| bank_ifsc | CHAR(11) | nullable |
| payment_terms_days | SMALLINT UNSIGNED | default 30 |
| is_active | BOOLEAN | default true |
| created_at, updated_at, deleted_at | DATETIME | |

**Indexes:** `gstin`. **Expected records:** 8–10.

#### `accounts_payable`
**Purpose:** Tracks every vendor bill's outstanding balance and status.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| bill_number | VARCHAR(30) | vendor's invoice number |
| purchase_order_reference | VARCHAR(30) | nullable |
| vendor_id | BIGINT UNSIGNED FK → vendors.id | RESTRICT |
| invoice_date | DATE | |
| due_date | DATE | |
| invoice_amount | DECIMAL(15,2) | |
| tax_amount | DECIMAL(15,2) | |
| outstanding_amount | DECIMAL(15,2) | |
| payment_terms | VARCHAR(50) | e.g. "Net 30" |
| payment_status | ENUM('Pending','Partial','Paid','Overdue') | |
| financial_year_id | BIGINT UNSIGNED FK → financial_years.id | RESTRICT |
| cost_center_id | BIGINT UNSIGNED FK → cost_centers.id | nullable |
| created_at, updated_at, deleted_at | DATETIME | |

**Unique:** composite `(vendor_id, bill_number)` — the primary mechanism preventing the same vendor invoice from being entered twice (also feeds the Duplicate Invoice Detection fraud rule). **Indexes:** `vendor_id`, `due_date`, `payment_status`. **Business Rules:** same status-derivation logic as `accounts_receivable`; creating an AP bill posts a GL entry (Debit: Purchase Expense, Credit: Accounts Payable) and calculates GST via `gstCalculator.js`. **Expected records:** 8 seeded.

#### `payments` (vendor payments)
**Purpose:** Records payments made to vendors against AP bills.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| payment_number | VARCHAR(30) UNIQUE | e.g. `PV-2026-0117` |
| accounts_payable_id | BIGINT UNSIGNED FK → accounts_payable.id | RESTRICT |
| vendor_id | BIGINT UNSIGNED FK → vendors.id | RESTRICT |
| payment_date | DATE | |
| amount | DECIMAL(15,2) | |
| payment_mode | ENUM('NEFT','RTGS','UPI','Cheque','Cash') | |
| reference_number | VARCHAR(50) | nullable |
| bank_account_id | BIGINT UNSIGNED FK → bank_accounts.id | nullable |
| approval_status | ENUM('NotRequired','Pending','Approved','Rejected') | default `NotRequired` |
| approved_by | BIGINT UNSIGNED FK → users.id | nullable |
| recorded_by | BIGINT UNSIGNED FK → users.id | |
| created_at, updated_at | DATETIME | |

**Business Rules:** sum of payments against one AP bill cannot exceed `invoice_amount` (`409 Conflict` otherwise); payments above the vendor-payment approval threshold (see Section 10) are created with `approval_status = Pending` and are **not executed/posted to GL** until approved; once approved, posts GL entry (Debit: Accounts Payable, Credit: Bank) and sends `vendor_payment_notification` email. **Expected records:** 6–8 seeded.

### 5.4 Banking

#### `bank_accounts`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| account_name | VARCHAR(100) | e.g. "HDFC Bank – Current A/c" |
| account_number | VARCHAR(30) UNIQUE | encrypted at rest |
| ifsc_code | CHAR(11) | |
| bank_name | VARCHAR(100) | |
| branch | VARCHAR(100) | nullable |
| account_type | ENUM('Current','Savings','CC','OD') | |
| opening_balance | DECIMAL(15,2) | |
| current_balance | DECIMAL(15,2) | recalculated on every transaction |
| is_active | BOOLEAN | default true |
| created_at, updated_at | DATETIME | |

**Expected records:** 2 (matching frontend dummy: HDFC, ICICI).

#### `bank_transactions`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| bank_account_id | BIGINT UNSIGNED FK → bank_accounts.id | RESTRICT |
| transaction_date | DATE | |
| description | VARCHAR(255) | |
| amount | DECIMAL(15,2) | |
| transaction_type | ENUM('Credit','Debit') | |
| source | ENUM('BankStatementImport','Manual','System') | |
| reference | VARCHAR(100) | nullable |
| is_matched | BOOLEAN | default false |
| created_at, updated_at | DATETIME | |

**Indexes:** `bank_account_id`, `transaction_date`, `is_matched`. **Expected records:** ~12 per account per statement period.

#### `bank_reconciliation`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| bank_account_id | BIGINT UNSIGNED FK → bank_accounts.id | RESTRICT |
| statement_date | DATE | |
| book_balance | DECIMAL(15,2) | |
| bank_balance | DECIMAL(15,2) | |
| difference | DECIMAL(15,2) GENERATED ALWAYS AS (book_balance - bank_balance) STORED | |
| status | ENUM('InProgress','Matched','Unmatched','Completed') | default `InProgress` |
| reconciled_by | BIGINT UNSIGNED FK → users.id | nullable |
| reconciled_at | DATETIME | nullable |
| created_at, updated_at | DATETIME | |

**Business Rules:** status can only transition to `Completed` when zero `bank_transactions` for the covered period remain with `is_matched = false` — enforced at service layer (blocks the "Complete Reconciliation" action otherwise, returns `422` listing remaining unmatched count).

#### `bank_reconciliation_matches`
**Purpose:** Join table pairing a bank statement line to its corresponding book-side ledger line.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| bank_reconciliation_id | BIGINT UNSIGNED FK → bank_reconciliation.id | CASCADE |
| bank_transaction_id | BIGINT UNSIGNED FK → bank_transactions.id | UNIQUE (a bank line matches at most once), RESTRICT |
| general_ledger_id | BIGINT UNSIGNED FK → general_ledger.id | RESTRICT |
| match_type | ENUM('Auto','Manual') | |
| matched_by | BIGINT UNSIGNED FK → users.id | nullable (null for Auto) |
| matched_at | DATETIME | |
| created_at | DATETIME | |

### 5.5 Budgeting

#### `budget_departments`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| department_name | VARCHAR(100) UNIQUE | |
| cost_center_id | BIGINT UNSIGNED FK → cost_centers.id | RESTRICT |
| is_active | BOOLEAN | default true |
| created_at, updated_at | DATETIME | |

**Expected records:** 6–8 matching frontend departments.

#### `budgets`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| financial_year_id | BIGINT UNSIGNED FK → financial_years.id | RESTRICT |
| budget_department_id | BIGINT UNSIGNED FK → budget_departments.id | RESTRICT |
| period_type | ENUM('Monthly','Quarterly','Annual') | |
| period_label | VARCHAR(20) | e.g. "Q2 FY2026-27" |
| budget_amount | DECIMAL(15,2) | |
| status | ENUM('Draft','Approved','Active','Closed') | default `Draft` |
| created_by | BIGINT UNSIGNED FK → users.id | |
| approved_by | BIGINT UNSIGNED FK → users.id | nullable |
| created_at, updated_at | DATETIME | |

**Unique:** composite `(financial_year_id, budget_department_id, period_label)`.

#### `budget_allocations`
**Purpose:** Month-by-month breakdown of a budget, feeds the per-department drill-down chart.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| budget_id | BIGINT UNSIGNED FK → budgets.id | CASCADE |
| month | TINYINT UNSIGNED | 1–12 |
| allocated_amount | DECIMAL(15,2) | |
| actual_expense | DECIMAL(15,2) | recalculated from GL cost-center actuals |
| created_at, updated_at | DATETIME | |

**Unique:** `(budget_id, month)`.

#### `budget_history`
**Purpose:** Append-only audit of every revision to a budget (increase/decrease requests and their approval linkage).

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| budget_id | BIGINT UNSIGNED FK → budgets.id | RESTRICT |
| changed_field | VARCHAR(50) | |
| old_value | VARCHAR(100) | |
| new_value | VARCHAR(100) | |
| changed_by | BIGINT UNSIGNED FK → users.id | |
| change_reason | VARCHAR(255) | nullable |
| approval_history_id | BIGINT UNSIGNED FK → approval_history.id | nullable |
| created_at | DATETIME | |

**Business Rules:** any budget increase is written here as `Pending` via `approval_history` before `budgets.budget_amount` is actually updated; the field only changes once approved (see Section 10).

### 5.6 Fixed Assets

#### `asset_categories`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| category_name | VARCHAR(100) UNIQUE | e.g. "IT Equipment", "Vehicles" |
| default_useful_life_years | TINYINT UNSIGNED | |
| default_depreciation_method | ENUM('StraightLine','WDV') | |
| created_at, updated_at | DATETIME | |

#### `fixed_assets`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| asset_code | VARCHAR(20) UNIQUE | e.g. `AST-1042` |
| asset_name | VARCHAR(150) | |
| asset_category_id | BIGINT UNSIGNED FK → asset_categories.id | RESTRICT |
| purchase_date | DATE | |
| purchase_cost | DECIMAL(15,2) | |
| salvage_value | DECIMAL(15,2) | default 0 |
| useful_life_years | TINYINT UNSIGNED | |
| depreciation_method | ENUM('StraightLine','WDV') | |
| location | VARCHAR(150) | nullable |
| assigned_employee_id | BIGINT UNSIGNED | nullable, cross-module reference (future HR `employees` table) |
| warranty_expiry_date | DATE | nullable |
| status | ENUM('InUse','UnderMaintenance','Retired','Disposed') | default `InUse` |
| current_value | DECIMAL(15,2) | recalculated by depreciation job |
| created_at, updated_at, deleted_at | DATETIME | |

**Indexes:** `asset_category_id`, `status`. **Business Rules:** once linked `asset_disposal` row exists, `status = Disposed` and the record becomes read-only — any `PUT/PATCH` other than a privileged Admin reactivation override is rejected with `403`. **Expected records:** 8 seeded.

#### `asset_depreciation`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| fixed_asset_id | BIGINT UNSIGNED FK → fixed_assets.id | RESTRICT |
| financial_year_id | BIGINT UNSIGNED FK → financial_years.id | RESTRICT |
| period_label | VARCHAR(20) | e.g. "Apr-2026" |
| opening_value | DECIMAL(15,2) | |
| depreciation_amount | DECIMAL(15,2) | |
| closing_value | DECIMAL(15,2) | |
| journal_entry_id | BIGINT UNSIGNED FK → journal_entries.id | nullable, RESTRICT |
| created_at | DATETIME | |

**Unique:** `(fixed_asset_id, period_label)`. **Business Rules:** rows are generated exclusively by `depreciationRun.job.js` (monthly cron) calling `depreciationCalculator.js`, which also posts a GL entry (Debit: Depreciation Expense, Credit: Accumulated Depreciation).

#### `asset_disposal`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| fixed_asset_id | BIGINT UNSIGNED FK → fixed_assets.id | UNIQUE, RESTRICT |
| disposal_date | DATE | |
| disposal_amount | DECIMAL(15,2) | sale/scrap proceeds |
| gain_loss_amount | DECIMAL(15,2) | disposal_amount − current_value at disposal |
| reason | VARCHAR(255) | |
| approved_by | BIGINT UNSIGNED FK → users.id | |
| journal_entry_id | BIGINT UNSIGNED FK → journal_entries.id | nullable |
| created_at | DATETIME | |

### 5.7 Taxation / GST / TDS

#### `gst_records`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| source_type | ENUM('SalesInvoice','PurchaseBill') | |
| source_id | BIGINT UNSIGNED | polymorphic reference to `accounts_receivable.id` or `accounts_payable.id` |
| gstin | CHAR(15) | |
| invoice_number | VARCHAR(30) | |
| invoice_date | DATE | |
| taxable_value | DECIMAL(15,2) | |
| cgst_rate | DECIMAL(5,2) | |
| cgst_amount | DECIMAL(15,2) | |
| sgst_rate | DECIMAL(5,2) | |
| sgst_amount | DECIMAL(15,2) | |
| igst_rate | DECIMAL(5,2) | |
| igst_amount | DECIMAL(15,2) | |
| total_tax | DECIMAL(15,2) | |
| place_of_supply_state | VARCHAR(50) | |
| created_at, updated_at | DATETIME | |

**Indexes:** `invoice_date`, `gstin`, `(source_type, source_id)`. **Business Rules:** row auto-created by `gst.service.js` whenever an AR or AP record is created, using `gstCalculator.js` — intra-state (company state = counterparty state) splits tax into CGST+SGST equally; inter-state applies IGST in full.

#### `gst_returns`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| return_type | ENUM('GSTR1','GSTR3B','GSTR2A','GSTR2B') | |
| period_month | TINYINT UNSIGNED | |
| period_year | SMALLINT UNSIGNED | |
| due_date | DATE | |
| filing_status | ENUM('Pending','Filed','Overdue') | |
| filed_date | DATE | nullable |
| filed_by | BIGINT UNSIGNED FK → users.id | nullable |
| total_tax_liability | DECIMAL(15,2) | |
| itc_claimed | DECIMAL(15,2) | default 0 |
| acknowledgement_number | VARCHAR(50) | nullable |
| created_at, updated_at | DATETIME | |

**Unique:** `(return_type, period_month, period_year)`.

#### `tds_records`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| deductee_type | ENUM('Vendor','Employee') | |
| deductee_id | BIGINT UNSIGNED | polymorphic reference |
| section_code | VARCHAR(10) | e.g. "194C", "194J" |
| payment_amount | DECIMAL(15,2) | |
| tds_rate | DECIMAL(5,2) | |
| tds_amount | DECIMAL(15,2) | |
| certificate_number | VARCHAR(30) | nullable |
| financial_year_id | BIGINT UNSIGNED FK → financial_years.id | RESTRICT |
| created_at, updated_at | DATETIME | |

### 5.8 AI Feature Support Tables

#### `cash_flow_forecast`
**Purpose:** Stores cached, generated forecast snapshots consumed by the frontend (never computed live per-request).

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| forecast_date | DATE | date forecast was generated for |
| horizon_days | ENUM('30','60','90') | |
| opening_cash | DECIMAL(15,2) | |
| projected_inflow | DECIMAL(15,2) | |
| projected_outflow | DECIMAL(15,2) | |
| projected_closing_cash | DECIMAL(15,2) | |
| risk_level | ENUM('Green','Yellow','Red') | |
| confidence_score | DECIMAL(5,2) | 0–100 |
| model_version | VARCHAR(20) | |
| generated_at | DATETIME | |
| created_at | DATETIME | |

**Indexes:** `(forecast_date, horizon_days)`. **Expected records:** one row per horizon per generation run (regenerated daily → retained 90 days rolling for trend charting).

#### `fraud_rules`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| rule_code | VARCHAR(30) UNIQUE | |
| rule_name | VARCHAR(150) | |
| rule_type | ENUM('DuplicateInvoice','DuplicatePayment','SuspiciousVendor','UnusualExpense','LargeTransaction') | |
| threshold_value | DECIMAL(15,2) | nullable, meaning depends on rule_type |
| weight | DECIMAL(5,2) | contribution to composite risk score |
| is_active | BOOLEAN | default true |
| created_at, updated_at | DATETIME | |

**Expected records:** 5–8 (one config row per detection heuristic — see Section 15).

#### `fraud_alerts`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| fraud_rule_id | BIGINT UNSIGNED FK → fraud_rules.id | RESTRICT |
| related_transaction_type | ENUM('Invoice','Payment','JournalEntry') | |
| related_transaction_id | BIGINT UNSIGNED | polymorphic |
| risk_score | DECIMAL(5,2) | 0–100 |
| status | ENUM('New','Investigating','Resolved','FalsePositive') | default `New` |
| assigned_to | BIGINT UNSIGNED FK → users.id | nullable |
| resolution_notes | TEXT | nullable |
| flagged_at | DATETIME | |
| resolved_at | DATETIME | nullable |
| created_at, updated_at | DATETIME | |

**Indexes:** `status`, `risk_score`, `(related_transaction_type, related_transaction_id)`.

#### `compliance_reports`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| report_type | ENUM('GST','TDS','SalesRegister','PurchaseRegister','TaxSummary','FullCompliancePack') | |
| period_label | VARCHAR(20) | |
| generated_by | BIGINT UNSIGNED FK → users.id | |
| generated_at | DATETIME | |
| file_path | VARCHAR(255) | server-stored path/object key |
| file_format | ENUM('PDF','Excel') | |
| version | SMALLINT UNSIGNED | default 1, increments on regeneration |
| status | ENUM('Generating','Ready','Failed') | |
| created_at | DATETIME | |

### 5.9 Cross-Cutting / Governance Tables

#### `approval_matrix`
**Purpose:** Configurable rule table driving all approval-threshold decisions — never hardcoded in application logic.

| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| action_type | ENUM('BudgetIncrease','VendorPayment','JournalReversal','FinancialYearClose','CreditNoteApproval') | |
| min_threshold_amount | DECIMAL(15,2) | nullable (null = applies regardless of amount, e.g. FinancialYearClose) |
| max_threshold_amount | DECIMAL(15,2) | nullable |
| required_role | ENUM('FinanceManager','CFO') | |
| escalation_role | ENUM('CFO') | nullable |
| is_active | BOOLEAN | default true |
| created_at, updated_at | DATETIME | |

**Seed data (see Section 10):** Budget increase ₹5L–₹20L → Finance Manager; >₹20L → CFO; Vendor payment >₹10L → CFO; Journal reversal (any amount) → Finance Manager; Financial year close (any) → CFO.

#### `approval_history`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| action_type | VARCHAR(30) | mirrors `approval_matrix.action_type` |
| reference_table | VARCHAR(50) | e.g. "budgets", "payments" |
| reference_id | BIGINT UNSIGNED | |
| requested_by | BIGINT UNSIGNED FK → users.id | |
| requested_at | DATETIME | |
| amount | DECIMAL(15,2) | nullable |
| current_approver_role | ENUM('FinanceManager','CFO') | |
| status | ENUM('Pending','Approved','Rejected','Escalated') | default `Pending` |
| decided_by | BIGINT UNSIGNED FK → users.id | nullable |
| decided_at | DATETIME | nullable |
| comments | VARCHAR(255) | nullable |
| created_at, updated_at | DATETIME | |

**Indexes:** `(reference_table, reference_id)`, `status`, `current_approver_role`.

#### `audit_logs`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| user_id | BIGINT UNSIGNED FK → users.id | RESTRICT |
| action | ENUM('Create','Update','Delete','StatusChange','Approve','Reject','Login','Export') | |
| entity_type | VARCHAR(50) | e.g. "JournalEntry" |
| entity_id | BIGINT UNSIGNED | |
| previous_value | JSON | nullable |
| new_value | JSON | nullable |
| ip_address | VARCHAR(45) | |
| user_agent | VARCHAR(255) | nullable |
| created_at | DATETIME | |

**Indexes:** `(entity_type, entity_id)`, `user_id`, `created_at`. **Business Rules:** append-only, no update/delete endpoint exists for this table under any role, including Admin.

#### `notification_logs`
| Column | Type | Notes |
|---|---|---|
| id | BIGINT UNSIGNED PK | |
| notification_type | ENUM('Email','SMS','InApp') | |
| recipient | VARCHAR(150) | |
| subject | VARCHAR(255) | |
| template_code | VARCHAR(50) | |
| related_entity_type | VARCHAR(50) | nullable |
| related_entity_id | BIGINT UNSIGNED | nullable |
| status | ENUM('Queued','Sent','Failed') | |
| sent_at | DATETIME | nullable |
| error_message | VARCHAR(255) | nullable |
| created_at | DATETIME | |

### 5.10 Shared / Cross-Module Reference Tables (NOT owned by Finance)

These tables are owned by other modules but are referenced by Finance foreign keys. Finance must never create a duplicate local copy of these entities — this is the single-source-of-truth rule from Section 12.

| Table | Owning Module | Referenced By |
|---|---|---|
| `customers` | Sales | `accounts_receivable`, `customer_payments`, `credit_notes` |
| `sales_invoices` | Sales | `accounts_receivable.sales_invoice_id` |
| `sales_returns` | Sales | `credit_notes.sales_return_id` |
| `users` | User & Access Management | virtually every `*_by`/`*_to` column across Finance tables |
| `roles` / `permissions` | User & Access Management | drives the RBAC layer in Section 9 |
| `employees` | HR (future) | `fixed_assets.assigned_employee_id`, future payroll/expense-claim postings |

If Sales and Finance are deployed as separate services rather than a single monolith sharing one MySQL schema, these foreign keys become logical references validated via an internal service call (e.g., `GET /api/sales/customers/:id`) rather than a physical MySQL foreign key constraint — the Service layer (`salesIntegration.service.js`) must abstract this so the rest of the Finance codebase treats it identically either way.

---

## 6. Entity Relationships

### 6.1 Primary Ledger Flow

```
chart_of_accounts (1) ────────< (M) journal_entry_lines
financial_years    (1) ────────< (M) journal_entries
journal_entries     (1) ───────< (M) journal_entry_lines
journal_entry_lines (1) ───────  (1) general_ledger   [mirrored on posting]
```

### 6.2 Receivables Chain

```
customers (Sales)  (1) ──< (M) accounts_receivable
accounts_receivable (1) ──< (M) customer_payments
accounts_receivable (1) ──< (M) credit_notes
customer_payments   (1) ──  (1) journal_entries   [one GL posting per payment]
accounts_receivable (1) ──  (1) gst_records        [one GST record per invoice]
```

### 6.3 Payables Chain

```
vendors            (1) ──< (M) accounts_payable
accounts_payable   (1) ──< (M) payments
payments           (1) ──  (1) journal_entries    [posted only after approval, if required]
accounts_payable   (1) ──  (1) gst_records
```

### 6.4 Banking Chain

```
bank_accounts       (1) ──< (M) bank_transactions
bank_accounts       (1) ──< (M) bank_reconciliation
bank_reconciliation (1) ──< (M) bank_reconciliation_matches
bank_transactions   (1) ──  (1) bank_reconciliation_matches  [a bank line matches at most once]
general_ledger      (1) ──< (M) bank_reconciliation_matches  [a GL line could theoretically match one bank line]
```

### 6.5 Budgeting Chain

```
budget_departments (1) ──< (M) budgets
budgets            (1) ──< (M) budget_allocations
budgets            (1) ──< (M) budget_history
cost_centers       (1) ──< (M) budget_departments
```

### 6.6 Fixed Assets Chain

```
asset_categories (1) ──< (M) fixed_assets
fixed_assets     (1) ──< (M) asset_depreciation
fixed_assets     (1) ──  (1) asset_disposal   [0 or 1 — enforced via unique FK]
asset_depreciation (M) ──  (1) journal_entries [each depreciation run posts one GL entry per asset per period]
```

### 6.7 Full End-to-End Data Flow

```
General Ledger
      ↑ (mirrors)
Journal Entries → Journal Entry Lines
      ↑ (source_type = SalesInvoice)
Accounts Receivable
      ↓ (payment recorded)
Payments (customer_payments)
      ↓ (posted to bank account)
Bank Transactions
      ↓ (matched during reconciliation)
Bank Reconciliation
      ↓ (feeds)
Financial Reports / Dashboard / Cash Flow Forecast
```

### 6.8 Cascade / Delete / Update Rule Summary

| Rule | Applies To | Behavior |
|---|---|---|
| `ON UPDATE CASCADE` | all foreign keys | if a parent PK ever changes (rare, PKs are auto-increment and immutable in practice), children follow |
| `ON DELETE RESTRICT` (default) | most foreign keys (`account_id`, `vendor_id`, `customer_id`, `bank_account_id`, `fixed_asset_id`, etc.) | prevents deleting a master record that has transactional history — the correct action is to deactivate (`is_active = false`) or soft-delete (`deleted_at`), never hard-delete |
| `ON DELETE CASCADE` | `journal_entry_lines.journal_entry_id`, `budget_allocations.budget_id`, `bank_reconciliation_matches.bank_reconciliation_id` | only permitted because the parent itself can only be deleted while still in a `Draft`/`InProgress` state (service layer blocks deleting a `Posted`/`Completed` parent, making cascading deletes safe) |
| No delete endpoint at all | `general_ledger`, `audit_logs`, `notification_logs`, `budget_history`, `approval_history`, `asset_depreciation`, `gst_records` | financial/audit integrity requires these to be permanent; corrections happen via new offsetting/reversing records, never deletion |
| Soft delete only | `vendors`, `fixed_assets`, `accounts_receivable`, `accounts_payable`, `chart_of_accounts` | `deleted_at` set, record excluded from default queries (Sequelize `paranoid: true`) but retained for historical reporting and audit |

---

## 7. Business Rules & Workflows

1. **Invoice → Accounts Receivable:** every Sales invoice creation event automatically creates exactly one `accounts_receivable` row, one `gst_records` row, and one posted `journal_entries`/`journal_entry_lines` pair (Debit: Accounts Receivable, Credit: Sales Revenue + GST Payable). This happens synchronously within the same transaction that handles the inbound Sales event — never as a "best effort" async job that could silently fail and leave Finance out of sync.
2. **Customer payment cannot exceed outstanding balance:** validated against `accounts_receivable.outstanding_amount` (not the original `invoice_amount`) at the moment of insert, inside a row-locked transaction (`SELECT ... FOR UPDATE`) to prevent race conditions from two simultaneous partial payments overshooting the balance.
3. **Duplicate journal entries are not allowed:** a composite uniqueness check on `(voucher_type, reference, entry_date, total_debit)` combined with the `(vendor_id, bill_number)` unique constraint on `accounts_payable` catches the two most common real-world duplication patterns (re-submitted vendor bill, double-clicked "Save" on a manual journal entry); the service layer additionally checks for an existing `Posted` entry with an identical `source_type`+`source_id` before creating a new one.
4. **Vendor payment cannot exceed payable amount:** identical row-locked validation pattern as rule 2, against `accounts_payable.outstanding_amount`.
5. **GST automatically calculated based on invoice:** `gstCalculator.js` determines intra-state vs inter-state by comparing the company's registered state to the customer's/vendor's `state` field, splits CGST+SGST (intra-state) or applies IGST (inter-state) using the tax rate associated with the relevant product/service category (rate table maintained in `config/constants.js`, extensible to a full `tax_rates` table if product-level rates are needed later).
6. **Bank reconciliation cannot be completed until all transactions are matched:** enforced in `bankReconciliation.service.js` — the "Complete" action queries for any `bank_transactions` with `is_matched = false` for the period and rejects with `422` and a list of remaining unmatched IDs if any exist.
7. **Budget cannot exceed department allocation without approval:** any `PATCH` to `budgets.budget_amount` that would increase the amount is intercepted by `approval.service.js`, which checks `approval_matrix` for the `BudgetIncrease` action type and creates a `Pending` `approval_history` row instead of applying the change immediately; the change is only committed to `budgets`/`budget_history` on approval.
8. **Fixed assets automatically generate depreciation:** `depreciationRun.job.js` runs monthly (cron `0 2 1 * *` — 2 AM on the 1st of each month), iterates all `fixed_assets` with `status = InUse`, computes the period's depreciation via `depreciationCalculator.js` (straight-line: `(purchase_cost − salvage_value) / useful_life_years / 12`; WDV: `opening_value × rate`), inserts an `asset_depreciation` row, updates `fixed_assets.current_value`, and posts the corresponding GL entry — all inside one transaction per asset.
9. **Disposed assets become read-only:** any mutating request to a `fixed_assets` row whose `status = Disposed` is rejected with `403 FORBIDDEN` and an explanatory error code (`ASSET_DISPOSED_READONLY`), except the dedicated Admin reactivation endpoint, which itself writes an `audit_logs` entry.
10. **Credit notes automatically reduce receivables:** on `credit_notes.status` transitioning to `Applied`, `accounts_receivable.outstanding_amount` is decremented and `payment_status` recalculated within the same transaction; a GL entry is posted simultaneously.
11. **Financial year must be open before posting transactions:** the `financialYearGuard` middleware runs before every mutating Finance endpoint that references a `financial_year_id`-bearing table, resolving the applicable financial year from the transaction date and rejecting with `409 FINANCIAL_YEAR_CLOSED` if that year's `status` is not `Open`.
12. **Overdue status is system-computed, never user-set:** `payment_status = Overdue` is only ever set by `overdueStatusRefresh.job.js` (daily cron) or computed on read; no API accepts `Overdue` as a directly settable value in a request body (validators reject it).
13. **Vendor invoice duplication defense:** the `(vendor_id, bill_number)` unique constraint on `accounts_payable`, combined with the `DuplicateInvoice` fraud rule, gives both a hard database-level block and a soft fraud-alert signal for near-duplicates (same vendor, same amount, different bill number, within a short time window).
14. **Approval requests can be escalated:** if a Finance Manager does not act on a `Pending` approval within a configurable SLA window (default 48 hours, checked by a scheduled job), the request's `current_approver_role` is updated to `CFO` and `status` set to `Escalated`, with a notification sent to the CFO.
15. **Every status-changing action is journaled:** any transition of `payment_status`, `filing_status`, `status` (asset/reconciliation/alert/report) writes an `audit_logs` row with previous and new value, in addition to any domain-specific history table (`budget_history`, `approval_history`).

---

## 8. REST API Design

**Base path:** `/api/finance`

**Standard headers (all endpoints unless noted):**
```
Authorization: Bearer <JWT>
Content-Type: application/json
```

**Standard success envelope:**
```json
{
  "success": true,
  "message": "Accounts Receivable record fetched successfully",
  "data": { },
  "meta": { "page": 1, "pageSize": 10, "totalRecords": 42, "totalPages": 5 }
}
```
`meta` is present only on list/paginated endpoints.

**Standard error envelope:**
```json
{
  "success": false,
  "message": "Validation failed",
  "code": "VALIDATION_ERROR",
  "errors": [
    { "field": "amount", "message": "Amount must be greater than 0" }
  ]
}
```

**Status code conventions:** `200` successful GET/PUT/PATCH, `201` successful POST (resource created), `400` malformed request, `401` missing/invalid JWT, `403` authenticated but not authorized (role/permission or business-rule-readonly block), `404` resource not found, `409` conflict / business-rule violation (duplicate, overshoot, closed year), `422` semantically invalid (e.g., reconciliation completion blocked by unmatched transactions), `500` unhandled server error.

**Pagination query params (all list endpoints):** `?page=1&pageSize=10&sortBy=<field>&sortOrder=asc|desc&search=<text>` plus module-specific filter params documented per endpoint below.

### 8.1 Finance Dashboard

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/dashboard/summary` | KPI cards: cash balance, outstanding receivables/payables, monthly profit, revenue/expense MTD | All Finance roles + Sales Manager (read-only) |
| GET | `/dashboard/cash-flow-snapshot` | 6-month inflow/outflow series | All Finance roles |
| GET | `/dashboard/revenue-expense-trend?range=12m` | Trend chart data | All Finance roles |
| GET | `/dashboard/profit-loss-summary` | Condensed P&L | All Finance roles |
| GET | `/dashboard/budget-vs-actual` | Top-5-department budget comparison | All Finance roles |
| GET | `/dashboard/top-expenses` | Ranked expense categories | All Finance roles |
| GET | `/dashboard/pending-payments` | Top 5 AP nearing due | All Finance roles |
| GET | `/dashboard/pending-collections` | Top 5 AR overdue/nearing due | All Finance roles |
| GET | `/dashboard/recent-transactions` | Last 8 GL entries | All Finance roles |
| GET | `/dashboard/notifications` | Notification feed | All Finance roles |
| GET | `/dashboard/recent-activities` | Audit-derived activity feed | All Finance roles |

**Worked example — `GET /api/finance/dashboard/summary`:**

Request: no body, `Authorization` header only.

Response `200`:
```json
{
  "success": true,
  "message": "Dashboard summary fetched successfully",
  "data": {
    "cashBalance": 4820000.00,
    "outstandingReceivables": 1265000.00,
    "outstandingPayables": 742000.00,
    "monthlyProfit": 318500.00,
    "revenueMTD": 2140000.00,
    "expenseMTD": 1821500.00,
    "trendVsPreviousMonth": {
      "cashBalance": { "direction": "up", "percent": 6.2 },
      "monthlyProfit": { "direction": "down", "percent": 3.1 }
    }
  }
}
```

### 8.2 General Ledger

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/ledger` | List/search/filter GL entries (query: `accountId`, `voucherType`, `dateFrom`, `dateTo`, `status`) | All Finance roles |
| GET | `/ledger/:id` | Single GL/journal entry detail | All Finance roles |
| POST | `/ledger` | Create manual journal entry (Draft) | Finance Executive, Finance Manager, Admin |
| PUT | `/ledger/:id` | Edit a **Draft** journal entry only | Finance Executive, Finance Manager, Admin |
| POST | `/ledger/:id/post` | Post a Draft entry (validates debit=credit, financial year open) | Finance Executive, Finance Manager, Admin |
| POST | `/ledger/:id/reverse` | Create reversing entry (requires approval) | Finance Manager, CFO, Admin |
| DELETE | `/ledger/:id` | Delete a **Draft** entry only (never a Posted one) | Finance Manager, Admin |
| GET | `/ledger/export` | CSV export of filtered result set | All Finance roles |

**Worked example — `POST /api/finance/ledger`:**

Request body:
```json
{
  "entryDate": "2026-07-20",
  "voucherType": "Journal",
  "reference": "Office rent accrual - July",
  "description": "Monthly rent accrual entry",
  "lines": [
    { "accountId": 4021, "debitAmount": 85000.00, "creditAmount": 0, "costCenterId": 3 },
    { "accountId": 2010, "debitAmount": 0, "creditAmount": 85000.00, "costCenterId": null }
  ]
}
```

Validation: `entryDate` required, valid date, within an `Open` financial year; `lines` array minimum 2 entries; sum of `debitAmount` across lines must equal sum of `creditAmount`; each line exactly one of debit/credit > 0; every `accountId` must reference an active, postable `chart_of_accounts` row.

Response `201`:
```json
{
  "success": true,
  "message": "Journal entry created as Draft",
  "data": {
    "id": 5521,
    "voucherNumber": "JV-2026-0142",
    "status": "Draft",
    "totalDebit": 85000.00,
    "totalCredit": 85000.00
  }
}
```

Failure `409` (unbalanced entry attempted at post-time):
```json
{
  "success": false,
  "message": "Journal entry cannot be posted: total debit does not equal total credit",
  "code": "UNBALANCED_ENTRY",
  "errors": []
}
```

### 8.3 Accounts Payable

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/payables` | List/search/filter (query: `vendorId`, `paymentStatus`, `dueDateFrom/To`) | All Finance roles |
| GET | `/payables/:id` | Bill detail + vendor details + payment history | All Finance roles |
| POST | `/payables` | Create a new vendor bill | Finance Executive, Finance Manager, Admin |
| PUT | `/payables/:id` | Edit bill (only while `Pending`, no payments yet) | Finance Executive, Finance Manager, Admin |
| POST | `/payables/:id/payments` | Record a vendor payment (full/partial) | Finance Executive, Finance Manager, Admin |
| GET | `/payables/:id/payment-history` | Payment history for one bill | All Finance roles |
| GET | `/payables/export` | CSV/PDF export | All Finance roles |
| POST | `/vendors` | Create vendor | Finance Manager, Admin |
| GET | `/vendors` / `/vendors/:id` | List/detail vendors | All Finance roles |
| PUT | `/vendors/:id` | Edit vendor | Finance Manager, Admin |

**Worked example — `POST /api/finance/payables/:id/payments`:**

Request:
```json
{
  "amount": 48500.00,
  "paymentDate": "2026-07-22",
  "paymentMode": "NEFT",
  "referenceNumber": "NEFT2026072200981",
  "bankAccountId": 1
}
```

Validation: `amount` > 0 and ≤ current `outstanding_amount` of the bill (else `409 AMOUNT_EXCEEDS_OUTSTANDING`); `paymentDate` cannot be before `invoice_date`; if `amount` exceeds the vendor-payment approval threshold, response indicates `approvalStatus: "Pending"` instead of immediate execution.

Response `201`:
```json
{
  "success": true,
  "message": "Payment recorded and pending approval (exceeds ₹10,00,000 threshold)",
  "data": {
    "id": 881,
    "paymentNumber": "PV-2026-0118",
    "amount": 48500.00,
    "approvalStatus": "NotRequired",
    "newOutstandingAmount": 0.00,
    "newPaymentStatus": "Paid"
  }
}
```

### 8.4 Accounts Receivable

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/receivables` | List/search/filter (query: `customerId`, `paymentStatus`, `collectionStatus`, `agingBucket`) | All Finance roles + Sales Manager (read-only) |
| GET | `/receivables/:id` | Detail + reminder history + payment history | All Finance roles + Sales Manager (read-only) |
| POST | `/receivables/:id/payments` | Record a customer payment | Finance Executive, Finance Manager, Admin |
| POST | `/receivables/:id/reminders` | Log a reminder sent (also triggers email) | Finance Executive, Finance Manager, Admin |
| POST | `/receivables/:id/credit-notes` | Issue a credit note against this invoice | Finance Manager, Admin |
| GET | `/receivables/export` | CSV/PDF export | All Finance roles |

*(Note: `accounts_receivable` records themselves have no direct public `POST /receivables` — they are only created internally via the Sales integration event handler, per Business Rule 1.)*

**Worked example — `POST /api/finance/receivables/:id/payments`:** same contract shape as the AP example above, additionally emits `finance.payment.recorded` (see Section 12) so the linked Sales invoice view updates.

### 8.5 Bank Reconciliation

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/bank-reconciliation` | List reconciliation sessions (query: `bankAccountId`, `status`) | All Finance roles |
| GET | `/bank-reconciliation/:id` | Detail with matched/unmatched transaction lists | All Finance roles |
| POST | `/bank-reconciliation` | Start a new reconciliation session for a statement period | Finance Executive, Finance Manager, Admin |
| POST | `/bank-reconciliation/import` | Import bank statement transactions (multipart file upload) | Finance Executive, Finance Manager, Admin |
| POST | `/bank-reconciliation/:id/auto-match` | Run auto-match algorithm | Finance Executive, Finance Manager, Admin |
| POST | `/bank-reconciliation/:id/manual-match` | Manually pair one bank txn to one GL line | Finance Executive, Finance Manager, Admin |
| POST | `/bank-reconciliation/:id/complete` | Mark session Completed (blocked if unmatched remain) | Finance Manager, Admin |
| GET | `/bank-reconciliation/export` | CSV/PDF export | All Finance roles |

### 8.6 Budgeting

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/budgets` | List/filter (query: `departmentId`, `periodLabel`, `status`) | All Finance roles |
| GET | `/budgets/:id` | Detail + monthly allocation breakdown | All Finance roles |
| POST | `/budgets` | Create a new department budget | Finance Manager, Admin |
| PATCH | `/budgets/:id` | Request a change (increase routes to approval per Business Rule 7) | Finance Executive, Finance Manager, Admin |
| GET | `/budgets/:id/history` | Revision history | All Finance roles |
| GET | `/budgets/export` | CSV/PDF export | All Finance roles |

### 8.7 Fixed Assets

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/assets` | List/filter (query: `categoryId`, `status`, `location`) | All Finance roles |
| GET | `/assets/:id` | Detail + depreciation schedule + history | All Finance roles |
| POST | `/assets` | Register new asset | Finance Manager, Admin |
| PATCH | `/assets/:id/reassign` | Reassign employee | Finance Executive, Finance Manager, Admin |
| PATCH | `/assets/:id/status` | Change status (e.g., Under Maintenance) | Finance Manager, Admin |
| POST | `/assets/:id/dispose` | Dispose asset (locks record) | CFO, Admin |
| GET | `/assets/export` | CSV/PDF asset register | All Finance roles |

### 8.8 Taxation / GST

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/gst/summary` | CGST/SGST/IGST totals, invoice count (query: `periodMonth`, `periodYear`) | All Finance roles |
| GET | `/gst/records` | List GST-tagged transactions | All Finance roles |
| GET | `/gst/returns` | List filing periods and statuses | All Finance roles |
| POST | `/gst/returns/:id/file` | Mark a return Filed (records acknowledgement number) | Finance Manager, CFO, Admin |
| POST | `/gst/reports/generate` | Generate a formatted GST report (PDF/Excel) | Finance Manager, CFO, Admin |
| GET | `/gst/reports/:id/download` | Download generated report | All Finance roles |

### 8.9 AI Cash Flow Forecast

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/forecast/cash-flow?horizon=30\|60\|90` | Latest cached forecast for the requested horizon | All Finance roles + CFO |
| GET | `/forecast/upcoming-payments` | AP items feeding the forecast | All Finance roles |
| GET | `/forecast/expected-receipts` | AR items feeding the forecast | All Finance roles |
| GET | `/forecast/risk-alerts` | Active liquidity risk alerts | All Finance roles |
| POST | `/forecast/regenerate` | Force an on-demand forecast recalculation (bypasses cache) | Finance Manager, CFO, Admin |

### 8.10 Anomaly & Fraud Detection

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/fraud/alerts` | List/filter (query: `status`, `riskLevel`, `type`) | Finance Manager, CFO, Admin |
| GET | `/fraud/alerts/:id` | Alert detail with related transaction comparison | Finance Manager, CFO, Admin |
| PATCH | `/fraud/alerts/:id/status` | Update status (Investigating/Resolved/False Positive) | Finance Manager, CFO, Admin |
| POST | `/fraud/alerts/:id/notes` | Append investigation note | Finance Manager, CFO, Admin |
| GET | `/fraud/rules` | List detection rule configuration | CFO, Admin |
| PUT | `/fraud/rules/:id` | Update a rule's threshold/weight/active flag | CFO, Admin |
| GET | `/fraud/export` | Export alert log | Finance Manager, CFO, Admin |

### 8.11 One-Click Compliance Pack

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/compliance/status` | Overall compliance status + filing calendar | All Finance roles |
| POST | `/compliance/reports/generate` | Generate a single report type | Finance Manager, CFO, Admin |
| POST | `/compliance/reports/generate-full-pack` | Generate the bundled full compliance pack | Finance Manager, CFO, Admin |
| GET | `/compliance/reports` | List generated reports with version history | All Finance roles |
| GET | `/compliance/reports/:id/download` | Download a specific report | All Finance roles |

### 8.12 Approvals & Audit

| Method | Endpoint | Purpose | Roles |
|---|---|---|---|
| GET | `/approvals` | List pending/all approval requests (query: `status`, `actionType`) | Finance Manager, CFO, Admin |
| GET | `/approvals/:id` | Approval detail | Finance Manager, CFO, Admin |
| POST | `/approvals/:id/approve` | Approve a request | Finance Manager or CFO (per matrix) |
| POST | `/approvals/:id/reject` | Reject a request | Finance Manager or CFO (per matrix) |
| GET | `/audit-logs` | Query audit trail (query: `entityType`, `entityId`, `userId`, `dateFrom/To`) | CFO, Admin |

---

## 9. Validation Rules

| Field | Rule |
|---|---|
| Transaction / Entry Date | required, valid ISO date, not in the future beyond today, must fall within an `Open` financial year |
| Amount (any monetary field) | required, numeric, > 0, max 2 decimal places, max value 999999999999.99 (fits `DECIMAL(15,2)`) |
| GST % (rate fields) | numeric, one of the configured valid rates (0, 5, 12, 18, 28), matched against `config/constants.js` rate table |
| GSTIN | exactly 15 characters, pattern `^\d{2}[A-Z]{5}\d{4}[A-Z]{1}\d[Z]{1}[A-Z\d]{1}$`, first 2 digits must be a valid Indian state code |
| PAN | exactly 10 characters, pattern `^[A-Z]{5}\d{4}[A-Z]{1}$` |
| Invoice / Bill Number | required, max 30 chars, unique per (vendor/customer) as applicable |
| Voucher Number | system-generated (`voucherNumberGenerator.js`), never accepted from client input |
| Budget Amount | required, numeric, > 0; a decrease requires a `changeReason`; an increase is routed through `approval_matrix` |
| Vendor Details (name) | required, max 150 chars; `phone` matches `^[6-9]\d{9}$` (Indian mobile) if provided; `email` valid email format if provided |
| Asset Cost (purchase_cost) | required, numeric, > 0 |
| Useful Life | required, integer, between 1 and 50 years |
| Depreciation Method | required, one of `StraightLine`/`WDV` |
| Bank Account Number | required, numeric string, 9–18 digits |
| IFSC | exactly 11 characters, pattern `^[A-Z]{4}0[A-Z0-9]{6}$` |
| Payment Amount | required, numeric, > 0, ≤ current outstanding balance of the target AR/AP record (business-rule validation, not just field-level) |
| Payment Mode | required, one of the defined ENUM values |
| Due Date | required, must be ≥ Invoice Date |
| Email (any notification recipient) | valid email format, required where the notification type is Email |
| Pagination params | `page` ≥ 1 integer, `pageSize` between 1 and 100 (default 10), `sortOrder` one of `asc`/`desc` |
| File Upload (bank statement import) | required, MIME type restricted to CSV/XLSX, max 5MB |

All validators are implemented as `express-validator` chains in the `validators/` folder and run via the `validate.middleware.js` collector immediately after route-level middleware, before the controller executes — a request that fails validation never reaches the Service/Model layer.

---

## 10. Role-Based Access Control

Five roles: **Finance Executive**, **Finance Manager**, **Chief Financial Officer (CFO)**, **Sales Manager**, **Admin**. Roles are managed by the User & Access Management module; Finance consumes a `role` claim embedded in the JWT plus a live permission check against that module's `roles`/`permissions` tables (or a cached local copy refreshed periodically) for defense in depth.

| Capability | Finance Executive | Finance Manager | CFO | Sales Manager | Admin |
|---|---|---|---|---|---|
| View Finance Dashboard | ✅ | ✅ | ✅ | ✅ (read-only, Sales-relevant KPIs only) | ✅ |
| Create/Edit Draft Journal Entries | ✅ | ✅ | ❌ (view only, approves reversals instead) | ❌ | ✅ |
| Post Journal Entries | ✅ | ✅ | ❌ | ❌ | ✅ |
| Reverse Posted Journal Entries | ❌ (request only) | ✅ (approves) | ✅ (approves escalations) | ❌ | ✅ |
| Create AP Bills / Record Vendor Payments (below threshold) | ✅ | ✅ | ❌ | ❌ | ✅ |
| Approve Vendor Payments (above threshold) | ❌ | ✅ (up to ₹10L) | ✅ (above ₹10L) | ❌ | ✅ |
| Record Customer Payments | ✅ | ✅ | ❌ | ❌ | ✅ |
| View Accounts Receivable | ✅ | ✅ | ✅ | ✅ (read-only) | ✅ |
| Issue Credit Notes | ❌ (request only) | ✅ | ✅ | ❌ | ✅ |
| Bank Reconciliation (match) | ✅ | ✅ | ❌ | ❌ | ✅ |
| Complete Bank Reconciliation | ❌ | ✅ | ❌ | ❌ | ✅ |
| Create/Request Budgets | ✅ (request only) | ✅ | ✅ | ❌ | ✅ |
| Approve Budget Increase ₹5L–₹20L | ❌ | ✅ | ✅ | ❌ | ✅ |
| Approve Budget Increase >₹20L | ❌ | ❌ | ✅ | ❌ | ✅ |
| Manage Fixed Assets (register/reassign) | ✅ | ✅ | ❌ | ❌ | ✅ |
| Dispose Fixed Assets | ❌ | ❌ | ✅ | ❌ | ✅ |
| File GST / TDS Returns | ❌ | ✅ | ✅ | ❌ | ✅ |
| Generate Compliance Reports | ✅ | ✅ | ✅ | ❌ | ✅ |
| View Cash Flow Forecast | ✅ | ✅ | ✅ | ❌ | ✅ |
| View & Manage Fraud Alerts | ❌ | ✅ | ✅ | ❌ | ✅ |
| Configure Fraud Detection Rules | ❌ | ❌ | ✅ | ❌ | ✅ |
| Close Financial Year | ❌ | ❌ | ✅ | ❌ | ✅ |
| View Audit Logs | ❌ | ❌ | ✅ | ❌ | ✅ |
| Full System Access | ❌ | ❌ | ❌ | ❌ | ✅ |

The `authorize.middleware.js` reads a per-route required-permission list (declared in each route file, e.g., `authorize(['FinanceManager', 'CFO', 'Admin'])`) and rejects with `403` if the requester's role is not in the list — the table above is the exhaustive source for populating every route's list.

---

## 11. Approval Workflow

Driven entirely by the `approval_matrix` table (Section 5.9) — no threshold is ever hardcoded in a controller or service.

**Seeded matrix rules:**

| Action | Threshold | Required Approver | Escalates To |
|---|---|---|---|
| Budget Increase | ₹5,00,000 – ₹20,00,000 | Finance Manager | CFO (after 48h SLA) |
| Budget Increase | > ₹20,00,000 | CFO | — |
| Vendor Payment | > ₹10,00,000 | CFO | — |
| Journal Entry Reversal | any amount | Finance Manager | CFO (after 48h SLA) |
| Financial Year Closing | any (event-based, not amount-based) | CFO | — |
| Credit Note Approval | > ₹1,00,000 | Finance Manager | CFO (above ₹5,00,000) |

**Lifecycle states:** `Pending` → `Approved` or `Rejected`, or `Pending` → `Escalated` → `Approved`/`Rejected`. Every transition is written to `approval_history` (append-only) with `decided_by`, `decided_at`, and `comments`. The originating record (e.g., `budgets.budget_amount`, `payments.approval_status`) only changes state once the linked `approval_history` row reaches `Approved` — rejection leaves the originating record unchanged and notifies the requester by email.

**Escalation job:** a scheduled task (`jobs/` — reuse `reminderEmails.job.js` pattern or a dedicated `approvalEscalation.job.js`) runs hourly, finds `Pending` rows older than the SLA window, flips `status` to `Escalated`, updates `current_approver_role` to the matrix's `escalation_role`, and emails the CFO.

---

## 12. Email Automation

All emails are sent via `notification.service.js` using Nodemailer with HTML templates, and every send attempt (success or failure) is recorded in `notification_logs`.

| Trigger | Template | Recipient | Data Included |
|---|---|---|---|
| Customer payment recorded | Payment Confirmation | Customer (and internal Finance team CC) | invoice number, amount received, new outstanding balance |
| AR invoice approaching due date (T-3 days) | Payment Reminder | Customer | invoice number, due date, amount due |
| AR invoice overdue | Overdue Receivable Reminder | Customer, Finance Executive | invoice number, days overdue, amount due |
| Vendor payment executed | Vendor Payment Notification | Vendor | payment number, amount, mode, reference |
| Budget approval decision | Budget Approval / Rejection | Requesting user | department, requested amount, decision, comments |
| Compliance report generation complete | Compliance Report Ready | Requesting user, Finance Manager | report type, period, download link |
| GST return due date approaching (T-5 days) | GST Return Reminder | Finance Manager, CFO | return type, period, due date, filing status |
| Vendor/customer payment pending approval | Approval Requested | Approver role's users | reference, amount, requestor |
| Fraud alert raised at High risk score (≥75) | Fraud Alert Notification | Finance Manager, CFO | alert type, risk score, related transaction |

Reminder-type emails (`Payment Reminder`, `Overdue Receivable Reminder`, `GST Return Reminder`) are triggered by `reminderEmails.job.js` on a daily schedule; transactional emails (confirmation, notification, approval decision) are triggered synchronously by the relevant service method immediately after the underlying database transaction commits — never before, to avoid notifying about a state change that then fails to save.

---

## 13. PDF Generation

Implemented via `pdf.service.js` using PDFKit. Report types:

- **Financial Statements** (P&L, Balance Sheet summary)
- **GST Reports** (GSTR-1/3B-style summary)
- **Ledger Reports** (filtered General Ledger extract)
- **Vendor Statements** (all AP activity for one vendor)
- **Customer Statements** (all AR activity for one customer)
- **Budget Reports** (department budget vs actual)
- **Asset Register** (full fixed asset listing with depreciation)

**Layout requirements (applies to every generated PDF):**
- Company letterhead header: company logo placeholder, company name/address/GSTIN, report title, generated-on timestamp, generated-by user.
- Consistent typography matching the frontend's professional tone (bold section headers, tabular data in ruled tables, right-aligned monetary columns).
- Footer on every page: page number (`Page X of Y`), confidentiality notice, and a **QR code** (via `qrCodeGenerator.js`) encoding a verification URL/report ID so a printed statement can be traced back to its generating `compliance_reports`/report record.
- Multi-page tables repeat the header row on each new page.
- Currency values formatted via `utils/currency.js` (₹, Indian digit grouping).
- Generated files are saved to disk/object storage with the path recorded in `compliance_reports.file_path` (or an equivalent record for ledger/statement exports), and served through an authenticated download endpoint — never a public static file URL.

---

## 14. AI Feature 1 — Cash Flow Forecast (Backend Logic)

**Prediction inputs, pulled at generation time:**
- Open `accounts_receivable` rows (expected inflow, weighted by historical on-time-payment rate per customer)
- Open `accounts_payable` rows (scheduled outflow, by due date)
- Recurring expenses (a configurable list — rent, subscriptions — represented as recurring `journal_entries` templates or a lightweight `recurring_expenses` reference held in `config/constants.js` seed data, extensible to its own table if recurrence rules grow complex)
- Payroll estimate (placeholder input today; becomes a live figure once Finance ↔ HR payroll integration exists — see Section 17)
- Historical `general_ledger` cash-account movement (trailing 6–12 months) for trend/seasonality baseline
- Seasonality adjustment factor (simple month-of-year multiplier derived from historical variance, stored alongside the model version)

**Forecast engine (`utils/forecastEngine.js`):**
1. Start from current `bank_accounts` aggregate `current_balance` (opening cash).
2. Walk forward day-by-day across the horizon (30/60/90 days).
3. Each day, add expected AR collections due that day (probability-weighted), subtract AP payments due that day, subtract recurring expense allocations, subtract payroll allocation on payroll dates.
4. Apply the seasonality adjustment factor to smooth known cyclical variance.
5. Track the running projected balance; the **minimum projected balance** across the horizon determines `risk_level`: `Green` if it never drops below a configurable "Minimum Safe Balance" threshold, `Yellow` if it dips within 20% of the threshold, `Red` if it goes below the threshold at any point.
6. `confidence_score` is computed from data completeness (how much of the projection relies on confirmed due dates vs. estimated recurring items) — higher confirmed-data ratio yields a higher score.
7. Persist the result as a new `cash_flow_forecast` row per horizon.

**Recommended actions:** generated as human-readable strings by comparing the top contributors to a projected shortfall (largest overdue/near-due AR items, largest discretionary AP items) and suggesting the highest-impact action first (e.g., "Follow up on the 3 largest overdue invoices" before "Consider delaying a specific non-critical vendor payment").

**Cron jobs:** `cashFlowForecastRefresh.job.js` runs daily (e.g., `0 3 * * *`) to regenerate all three horizons; `POST /forecast/regenerate` allows an authorized on-demand refresh outside the schedule (e.g., after a large unexpected AP bill is entered).

**Caching:** the frontend never triggers a live computation on page load — it always reads the latest `cash_flow_forecast` rows (cache-first). The regenerate endpoint is rate-limited (see Section 19) to prevent recomputation abuse.

**Tables used:** `cash_flow_forecast` (output/cache), reads from `accounts_receivable`, `accounts_payable`, `general_ledger`, `bank_accounts`.

---

## 15. AI Feature 2 — Anomaly & Fraud Detection (Backend Logic)

**Detection heuristics, each backed by a row in `fraud_rules`:**

- **Duplicate Invoice Detection:** flags an `accounts_payable` insert where another bill exists for the same `vendor_id` with the same `invoice_amount` and an `invoice_date` within a configurable window (default 7 days) of an existing bill, even if `bill_number` differs (the DB unique constraint only catches identical bill numbers — this heuristic catches near-duplicates).
- **Duplicate Payment Detection:** flags a `payments`/`customer_payments` insert matching another payment to the same vendor/customer with the same `amount` within a short time window (default 24–48 hours).
- **Suspicious Vendor Payments:** flags a vendor payment that deviates significantly (configurable standard-deviation multiple) from that vendor's historical average payment amount.
- **Unusual Expense Pattern:** flags a journal entry posting to an expense account with an amount that is a configurable multiple above that account's trailing 3-month average for the same cost center.
- **Large Transactions:** flags any single transaction (AP payment, AR payment, manual journal entry) above a configurable absolute-amount threshold, regardless of pattern.

**Risk score calculation (`utils/riskScoreCalculator.js`):** each triggered rule contributes `rule.weight × severity_factor` (severity_factor scaled by how far the transaction exceeds the rule's threshold); contributions sum and are clamped to a 0–100 scale; a transaction triggering multiple rules accumulates a compounded score, reflected transparently in the alert detail (each contributing rule listed).

**Alert generation:** any transaction crossing a minimum composite score (configurable, default 40) creates a `fraud_alerts` row with `status = New`; scores ≥75 additionally trigger the `Fraud Alert Notification` email (Section 12) to Finance Manager/CFO immediately.

**Investigation workflow:** `New` → `Investigating` (assigned via `assigned_to`) → `Resolved` or `FalsePositive`; every transition and appended note writes to `audit_logs` in addition to updating the alert row; `FalsePositive` resolutions are tracked so rule weights can eventually be tuned (manual admin review, not auto-tuning in this scope).

**Alert history:** the full lifecycle of every alert is queryable via `GET /fraud/alerts/:id`, combining the `fraud_alerts` row, its linked `fraud_rules` definition, and its `audit_logs` trail.

**Execution model:** `fraudScan.job.js` runs both as (a) a real-time hook — the relevant service (`accountsPayable.service.js`, `accountsReceivable.service.js`, `generalLedger.service.js`) calls `fraudDetection.service.js.evaluate()` synchronously right after a transaction is persisted, and (b) a periodic sweep (e.g., every 6 hours) that re-scans recent transactions for patterns only detectable in aggregate (like the "suspicious vendor payment" deviation, which needs the vendor's updated historical average).

**Tables used:** `fraud_rules` (config), `fraud_alerts` (output), reads from `accounts_payable`, `payments`, `customer_payments`, `journal_entries`.

---

## 16. AI Feature 3 — One-Click Compliance Pack (Backend Logic)

**GST Report Generation:** aggregates `gst_records` for the requested period, grouped by CGST/SGST/IGST, cross-checked against `gst_returns.total_tax_liability`; rendered via `pdf.service.js` into a GSTR-style layout.

**TDS Report Generation:** aggregates `tds_records` for the requested period/financial year, grouped by `section_code` and `deductee_type`.

**Purchase Register:** full listing of `accounts_payable` (+ linked `gst_records`) for the period, one row per vendor bill.

**Sales Register:** full listing of `accounts_receivable` (+ linked `gst_records`) for the period, one row per customer invoice.

**Compliance Calendar:** derived from `gst_returns.due_date` (and future TDS/PF/ESI due-date placeholders) — `GET /compliance/status` returns upcoming entries sorted by due date with a computed `daysRemaining` and a color-coding hint (`green` >7 days, `amber` ≤7 days, `red` overdue) matching the frontend's exact thresholds.

**Report Export:** every generated report is persisted as a `compliance_reports` row (`status: Generating` → `Ready`/`Failed`); `POST /compliance/reports/generate-full-pack` orchestrates sequential generation of GST, TDS, Sales Register, Purchase Register, and Tax Summary as one job, bundling the resulting files and creating one `report_type = FullCompliancePack` row referencing the bundle.

**Audit trail & version history:** every regeneration of the same `report_type` + `period_label` combination increments `compliance_reports.version` rather than overwriting — all historical versions remain downloadable, and `generated_by`/`generated_at` provide the audit trail per version.

---

## 17. Audit Logging

Every mutating Finance action writes to `audit_logs`, captured automatically by `auditLogger.middleware.js` wrapping all non-GET routes, plus explicit service-layer calls for actions that need before/after value capture (e.g., a budget amount change).

**Logged examples:** Journal Entry Created, Journal Entry Posted, Journal Entry Reversed, Invoice Posted (AR/AP), Payment Recorded, Payment Approved/Rejected, Budget Modified, Budget Approved/Rejected, GST Return Filed, Asset Registered, Asset Reassigned, Asset Disposed, Fraud Alert Status Changed, Compliance Report Generated, Financial Year Closed, User Login (Finance module access).

**Captured fields:** `user_id` (from JWT), `action`, `entity_type`, `entity_id`, `previous_value` (JSON snapshot before change, null for Create), `new_value` (JSON snapshot after change), `ip_address` (from request), `user_agent`, `created_at`. Audit log writes happen in the same database transaction as the underlying change where feasible, so an audit entry is never orphaned from a change that didn't actually commit.

---

## 18. Error Handling

Centralized in `errorHandler.middleware.js`, mounted last in the Express middleware chain. All thrown errors are custom `AppError` instances (`{ statusCode, code, message, errors[] }`) caught by `asyncHandler.js` wrapping every controller.

| Category | Status Code | Example |
|---|---|---|
| Validation Errors | 400 | missing required field, wrong data type |
| Authentication Errors | 401 | missing/expired/invalid JWT |
| Authorization Errors | 403 | valid user, insufficient role/permission; also used for business-rule read-only locks (disposed asset, closed financial year edits) |
| Not Found | 404 | requested `:id` does not exist (or is soft-deleted) |
| Business Rule Violations / Conflicts | 409 | duplicate invoice, payment exceeds outstanding, financial year closed |
| Semantic/Unprocessable | 422 | reconciliation completion blocked by unmatched transactions, unbalanced journal entry at post time |
| Rate Limited | 429 | too many requests from one client (see Section 19) |
| Server Errors | 500 | unexpected DB/connection failure, unhandled exception — logged via Winston with full stack trace, response body never leaks stack trace to the client |

Every error response uses the standard error envelope from Section 8. Sequelize validation errors and unique-constraint violations are caught and translated into the same envelope shape (never a raw Sequelize/MySQL error surfaced to the client).

---

## 19. Security

- **JWT Authentication:** short-lived access tokens (e.g., 15–30 min) + longer-lived refresh tokens; `authenticate.middleware.js` verifies signature and expiry on every protected route; token payload carries `userId`, `role`, `issuedAt`.
- **Role-Based Access:** enforced per-route via `authorize.middleware.js` per the matrix in Section 10, in addition to record-level checks in the Service layer (e.g., a Finance Executive cannot approve their own payment request even if a route were misconfigured — enforced by comparing `requested_by` to the acting user).
- **Input Sanitization:** all inputs pass through `express-validator` sanitizers (`.trim()`, `.escape()` where free text is stored) before reaching the Service layer.
- **SQL Injection Protection:** exclusively parameterized queries via Sequelize's query builder/ORM methods — no raw string-concatenated SQL anywhere in the codebase; any unavoidable raw query uses Sequelize's bound-parameter raw query interface.
- **Rate Limiting:** `rateLimiter.middleware.js` (e.g., token-bucket, 100 requests/minute per authenticated user for standard endpoints, tighter limits — e.g., 5/minute — on expensive endpoints like `POST /forecast/regenerate` and `POST /compliance/reports/generate-full-pack`).
- **Audit Logging:** as detailed in Section 17 — a security control in its own right (tamper-evident trail of every financial mutation).
- **Encrypted Sensitive Data:** `vendors.bank_account_number`, `bank_accounts.account_number`, and any stored bank credentials are encrypted at rest (application-level AES-256 encryption before persisting, decrypted only when explicitly needed, never returned in full in list endpoints — masked as e.g. `****4521`).
- **CORS:** restricted to known frontend origin(s), configured in `app.js`.
- **HTTPS enforced** at the infrastructure/reverse-proxy layer (documented expectation, not implemented in application code).
- **Password/credential handling:** out of scope for Finance (owned by User & Access Management), but Finance never logs or stores raw credentials of any kind.

---

## 20. Performance

- **Indexes:** every foreign key indexed; composite indexes on the most common filter/sort combinations (`(account_id, transaction_date)` on `general_ledger`; `(payment_status, due_date)` implied via separate indexes on `accounts_receivable`/`accounts_payable`; `(entity_type, entity_id)` on `audit_logs`).
- **Pagination:** every list endpoint paginates server-side (default page size 10, max 100) — never returns an unbounded result set.
- **Optimized Queries:** Service layer uses Sequelize `include` with explicit `attributes` selection (never `SELECT *` equivalents) to avoid over-fetching; N+1 query patterns avoided via eager loading with scoped includes.
- **Caching:** `cash_flow_forecast` results are cache-first as described in Section 14; dashboard summary endpoints may use a short-TTL in-memory or Redis cache (e.g., 60 seconds) to absorb repeated polling without recomputing aggregates on every request — regenerate-on-write invalidation preferred over blind TTL where feasible.
- **Bulk Inserts/Updates:** batch operations (e.g., bank statement import inserting dozens of `bank_transactions`, depreciation run inserting one row per asset) use Sequelize `bulkCreate`/`bulkUpdate` inside a single transaction rather than looped single-row operations.
- **Lazy Loading:** related data (e.g., a receivable's full payment history) is fetched only on detail-view requests (`GET /receivables/:id`), never eagerly joined into list endpoints.
- **Database Optimization:** connection pooling configured in `config/database.js` (min/max pool size tuned to expected concurrency); slow-query logging enabled in non-production environments to catch regressions before they reach production.

---

## 21. Module Integration (Critical Section)

This section is the binding backend contract with the Sales Module and the forward-looking contract for future modules. The frontend's simulated integration (described in the Finance & Accounting Frontend README) must become real, working backend behavior here.

### 21.1 Integration Mechanism

Finance and Sales communicate via an **internal event bus** (`events/eventBus.js`, a Node `EventEmitter`-based bus if deployed as one monolithic service, or a message queue — e.g., RabbitMQ/Kafka-compatible interface — if deployed as separate services; `financeEventHandlers.js` and `salesIntegration.service.js` are written against an abstracted publish/subscribe interface so the underlying transport can change without touching business logic). Direct synchronous REST calls between modules are used only where an immediate response is required within the same user-facing request (e.g., validating a customer's credit limit at Sales order-confirmation time).

### 21.2 Sales ↔ Finance — Event Contract

| Event | Published By | Consumed By | Finance Backend Action |
|---|---|---|---|
| `sales.customer.created` | Sales | Finance | no local copy created; Finance simply gains a valid FK target — nothing to do beyond confirming the reference resolves |
| `sales.invoice.created` | Sales | Finance (`salesIntegration.service.js`) | creates `accounts_receivable` row, creates `gst_records` row, posts `journal_entries`+`journal_entry_lines` (Debit AR, Credit Revenue + GST Payable), recalculates dashboard aggregates |
| `sales.order.confirmed` | Sales | — | explicitly **no Finance action** — reserved for future Inventory stock-reservation integration only |
| `sales.quotation.approved` | Sales | — | explicitly **no Finance action** — pre-financial document |
| `sales.return.approved` | Sales | Finance | creates `credit_notes` row (`status: Draft`), routes to Finance Manager approval per Section 11 |
| `finance.payment.recorded` | Finance (`accountsReceivable.service.js`) | Sales | Sales updates its own invoice/order payment-status display; Finance is the source of truth, Sales subscribes read-only |
| `finance.credit_note.applied` | Finance | Sales | Sales' customer profile "Outstanding Balance" view refreshes from the same underlying number Finance just updated |
| `finance.credit_limit.updated` | Finance | Sales | Sales enforces the updated limit on the next quotation/order-confirmation credit check |

**Synchronous request (not event-based):** `GET /api/finance/customers/:id/credit-limit` — called directly by the Sales order-confirmation flow at the moment an order is confirmed, so the credit check is real-time rather than eventually-consistent; Finance exposes this as a lightweight read endpoint specifically for that purpose.

### 21.3 Business Rules & Validation Enforced Across Modules

- An order cannot be confirmed in Sales if it would push the customer's outstanding balance (current AR total, sourced from Finance) past their `credit_limit` — Sales calls the synchronous endpoint above and blocks/warns accordingly; the credit limit value itself lives in one place only (proposed home: a `customer_credit_limits` field/table — whichever module owns the `customers` table, i.e., Sales, but editable exclusively through a Finance-authorized endpoint that Sales' UI calls, so Finance retains governance over the number even though Sales stores it).
- Once `journal_entries` are posted against a Sales invoice (i.e., `accounts_receivable` exists and has GL activity), that invoice becomes immutable from the Sales side — any correction must flow through a Credit Note/Debit Note, never a direct edit, enforced by Finance rejecting any attempt to alter GST/amount fields on an AR record with posted GL activity (`409 INVOICE_LOCKED_POSTED`).
- GST calculation logic exists in exactly one place (`utils/gstCalculator.js` within Finance) — Sales does not independently calculate tax; it calls Finance's calculation (synchronously, at invoice-creation time, as part of the same request that ultimately emits `sales.invoice.created`) so the number that lands in `gst_records` is the same number shown on the Sales invoice.

### 21.4 Data Ownership Table

| Data | Owning Table | Owning Module | Finance's Relationship |
|---|---|---|---|
| Customer identity | `customers` | Sales | FK reference only |
| Customer credit limit | field on `customers` (or linked table) | Sales stores it, Finance-authorized writes only | Finance is the only writer; Sales reads |
| Sales Invoice | `sales_invoices` | Sales | FK reference (`accounts_receivable.sales_invoice_id`); Finance never edits Sales' invoice line-item detail |
| Accounts Receivable / Outstanding Balance | `accounts_receivable` | **Finance** | single source of truth; Sales reads via API, never stores its own copy of the outstanding figure |
| Payment records | `customer_payments` | **Finance** | single source of truth; Sales reads via API |
| Credit Notes | `credit_notes` | **Finance** | single source of truth |

### 21.5 Future Module Integrations (Backend Contracts)

**Finance ↔ Procurement**
- `procurement.bill.created` event → Finance creates `accounts_payable` row (mirrors the `sales.invoice.created` pattern exactly).
- `finance.vendor_payment.recorded` event → Procurement updates its vendor payment status view.
- Open `accounts_payable` due dates feed directly into the Cash Flow Forecast's `projected_outflow` input (already architected for this — Section 14 reads `accounts_payable` regardless of whether bills originated from Finance-direct entry or a future Procurement event).
- The `vendors` table (currently Finance-owned) is expected to migrate to Procurement ownership once that module exists, with Finance switching to FK-reference-only, mirroring the Sales `customers` pattern — flagged here so the migration path is anticipated rather than a rewrite.

**Finance ↔ Inventory**
- `inventory.valuation.updated` event → Finance posts a GL entry adjusting the Inventory asset account.
- `inventory.stock_adjustment.created` event → Finance posts a corresponding accounting entry (write-up/write-down).
- `inventory.write_off.approved` event → Finance posts an expense entry.

**Finance ↔ Manufacturing**
- `manufacturing.production_cost.recorded` event → Finance posts to a Manufacturing Expense account, tagged with the relevant `cost_center_id`.
- `manufacturing.finished_goods.completed` event → Finance updates Inventory valuation (coordinated with the Inventory contract above) and feeds Cost of Goods Manufactured reporting.
- Machine/operating cost data feeds Finance's future costing reports module.

**Finance ↔ HR**
- `hr.payroll.processed` event → Finance posts salary expense GL entries and creates `tds_records`/PF/ESI liability postings.
- `hr.expense_claim.approved` event → Finance creates an Accounts-Payable-style reimbursement record and routes it through the standard payment workflow.
- Payroll data becomes a live input to the Cash Flow Forecast's payroll-outflow projection (currently a placeholder per Section 14).

**Finance ↔ Marketing**
- `marketing.campaign_expense.recorded` event → Finance posts the expense against the Marketing `budget_departments` row, so it's visible in the existing Budgeting module without a separate Marketing-only ledger.
- Campaign ROI calculations (owned by Marketing) call Finance's read endpoints for actual spend/revenue figures rather than maintaining an independent financial estimate.

**Finance ↔ User & Access Management**
- Role/permission definitions (Section 10's matrix) are ultimately sourced from this module; Finance's `authorize.middleware.js` is built to consume whatever role/permission shape that module exposes, with the matrix in this document as the required mapping it must support.
- The approval hierarchy (Section 11) integrates with that module's org-hierarchy data once available (e.g., dynamically resolving "who is the CFO" rather than a hardcoded role check), but functions correctly today against static role checks as a valid interim implementation.
- `audit_logs` is designed to be queryable by that module's future ERP-wide audit dashboard (consistent shape: user/action/entity/timestamp/before/after) rather than a Finance-only format.

### 21.6 Data Flow Diagrams

```
Sales Invoice Generated
        ↓
Accounts Receivable Created (Finance)
        ↓
Journal Entry Posted (General Ledger)
        ↓
GST Record Created (GST Register)
        ↓
Cash Flow Forecast Recalculated (next scheduled run)
        ↓
Financial Dashboard Updated
```

```
Customer Payment Recorded (Finance)
        ↓
Accounts Receivable Outstanding Balance Updated
        ↓
Invoice Payment Status Recalculated
        ↓
finance.payment.recorded Event Emitted
        ↓
Sales Module Invoice/Order View Updated
```

```
Sales Return Approved (Sales)
        ↓
Credit Note Created — Draft (Finance)
        ↓
Finance Manager Approval (Approval Workflow)
        ↓
Credit Note Applied
        ↓
Accounts Receivable Outstanding Reduced + GL Posted
        ↓
Sales Customer Profile Balance Updated
```

```
Vendor Bill Created (Finance or future Procurement event)
        ↓
Accounts Payable Created
        ↓
GST Record Created
        ↓
Vendor Payment Requested
        ↓
Approval Check (approval_matrix — threshold ₹10L)
        ↓
Payment Executed → Journal Entry Posted
        ↓
Vendor Payment Notification Email Sent
```

### 21.7 ERP Backend Design Principle

Every Finance table that represents a business object also owned conceptually by another module (customers, vendors-once-Procurement-exists, employees) is a foreign-key reference, never a duplicated copy. Every business object Finance itself owns (Accounts Receivable, Accounts Payable, General Ledger, Payments, Credit Notes, Budgets, Assets, GST records) is exposed to other modules exclusively through versioned REST endpoints and/or published events — never through direct cross-module database access. This event-driven, single-ownership approach is what lets Procurement, Inventory, Manufacturing, HR, and Marketing integrate later by subscribing to existing events and calling existing endpoints, without requiring a redesign of the Finance schema — mirroring how SAP S/4HANA's universal journal, Oracle NetSuite's unified data model, Microsoft Dynamics 365's Dataverse, Zoho's inter-app data sharing, and Odoo's shared ORM keep large ERP systems coherent as they grow.

---

## 22. Build Checklist (for the implementing AI)

1. Scaffold the folder structure exactly as specified in Section 3.
2. Implement `config/` (database, env, logger, constants, mailer) first — every other layer depends on it.
3. Write migrations for every table in Section 5, in dependency order (`financial_years`, `chart_of_accounts`, `cost_centers` first; junction/dependent tables last).
4. Write Sequelize models with full association definitions matching Section 6, then seeders for reference data (`chart_of_accounts`, `asset_categories`, `fraud_rules`, `approval_matrix`, `budget_departments`, and one seeded `Open` `financial_years` row).
5. Build the Service layer before Controllers — business rules (Section 7) live here and must be unit-testable independently of HTTP.
6. Build validators (Section 9) and wire `validate.middleware.js`.
7. Build `authenticate.middleware.js` and `authorize.middleware.js` against the RBAC matrix (Section 10).
8. Build Controllers + Routes per the API design in Section 8, module by module, in the same order as the frontend build checklist: Dashboard → General Ledger → Accounts Payable → Accounts Receivable → Bank Reconciliation → Budgeting → Fixed Assets → GST → Cash Flow Forecast → Fraud Detection → Compliance Pack.
9. Build `events/eventBus.js` and `financeEventHandlers.js`, then implement `salesIntegration.service.js` against the event contract in Section 21.2 — this is the module's most critical integration surface and should be validated with integration tests simulating each Sales event.
10. Build the approval workflow (`approval.service.js`) against `approval_matrix`/`approval_history`, then wire it into Budgeting and Vendor Payment flows.
11. Build `notification.service.js` (email templates per Section 12) and `pdf.service.js` (report layouts per Section 13).
12. Build the three AI feature services (`cashFlowForecast.service.js`/`forecastEngine.js`, `fraudDetection.service.js`/`riskScoreCalculator.js`, `compliance.service.js`) and their cron jobs.
13. Wire `auditLogger.middleware.js` globally and verify every mutating endpoint produces the expected `audit_logs` row.
14. Apply cross-cutting hardening: rate limiting, input sanitization, encrypted sensitive fields, centralized error handling.
15. QA pass: verify every business rule in Section 7 has an automated test, every endpoint in Section 8 returns the documented success/error envelope and status codes, and the Sales → Finance event chain (invoice → AR → GL → GST → dashboard) works end-to-end against a seeded Sales dummy dataset.

**End of Finance & Accounting Module Backend README.**
