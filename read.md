# Tender Automation System & Collaborative Workdesk
**A Complete Enterprise Blueprint**

The Tender Automation System is a highly complex, full-stack enterprise application designed to streamline the lifecycle of applying for, reviewing, and managing government and corporate tenders (such as GeM Tenders and Open Tenders). The platform serves as a unified command center: automating document ingestion, running product relevancy matching via AI/ML heuristics, predicting bid success, and facilitating cross-departmental collaboration (Logistics, Finance, Legal) through secure, role-based "Workspaces".

---

## 🏗️ Architecture & Technology Stack

The project relies on a modern, decoupled architecture featuring a Fast React Application for the presentation layer and a high-performance Node.js service for raw data computation and automation scripts.

### Backend Services (`/backend` — Express + Node.js)
*   **Database Engine**: MySQL Relational Data Management utilizing `mysql2` Promise wrappers for transactional speed.
*   **Security & Guardrails**: **Bcrypt** hashing algorithms intercept raw passwords. Authentication tokens are minted as stateless **JSON Web Tokens (JWTs)**.
*   **Data Parsers**: **Multer** intercepting multipart/form-data. PDF and Excel (CSV/XLSX) buffers processed via `pdf-parse`, `exceljs`, and `Papaparse`.
*   **Mail Infrastructure**: Integrated **Nodemailer** workflows configured with Gmail SMTP for external notifications.

### Frontend Application (`/Frontend` — Vite + React 18)
*   **Routing**: Protected React Router DOM layouts with role-based clearance checks.
*   **Data Visualization**: **Recharts** (BarCharts, LineCharts, PieCharts) and **React-Simple-Maps** mapping tender geography against India's state boundaries.
*   **Iconography**: `lucide-react` icon library used throughout the UI for action icons.

---

## 💻 Frontend Application Layout (`/Frontend/src`)

The source code separates responsibilities into distinct modular concerns:

| Directory | Purpose |
|---|---|
| `/components` | Reusable pure UI components – Modals, Dropdowns, Sidebars, Navbars |
| `/pages/Admin` | Global KPI dashboards, Win/Loss Ratio metrics, India State Map |
| `/pages/Tenders` | The main tender browsing index with filters and search |
| `/pages/Workdesk` | All workspace views: Task Boards, Overview Analytics, Settings, Files |
| `/pages/Insights` | Business Intelligence charts and comparison panels |
| `/pages/Orders` | Order status tracker and delivery management |
| `/pages/Login.jsx` | JWT-secured authentication portal |
| `/routes` | React Router HOC wrappers guarding access levels |
| `/services` | Centralized Axios API client connecting to the Express backend |

---

## 🚀 Feature Modules: Deep Dive

### 1. Unified Authentication & Identity Access
*   **RBAC (Role-Based Access Control)**: Every API call is verified via JWT at the middleware layer (`auth.middleware.js`).
*   **Workspace Role Resolution** (`GET /api/workspaces/my-role/:tenderId`): A specialized endpoint checks both the *global* user role (`Admin`) and the *local* workspace role (`admin`, `member`, `viewer`) to determine Settings panel visibility.

---

### 2. Tender Tracking & Master Dashboard
*   **Tender Duality**: Integrates pipelines for both **GeM Tenders** (`gem_tenders` table) and standard **Open Tenders** (`open_tender_details` table).
*   **Filtering Engine**: Responses are sliced by State, Category (`perfect_cat`), Sub-Category, Closing Date ranges, Pre-Bid Dates, and text-search.
*   **Geographic Maps**: The interactive India state map highlights regions by tender activity volume using `react-simple-maps` + `topojson-client`.

---

### 3. Product Relevancy Matching
*   **Product Index Caching**: Dynamically reads all company ERP `.csv` product files at runtime.
*   **Relevancy Scoring**: Runs fuzzy matching of Tender Item Specs against the company product catalog, scoring each hit from `0–100%`.
*   **Deviation Matrix Builder**: Users can build a specification gap matrix and auto-generate a `.docx` Representation Letter for government submission.

---

### 4. Collaborative Workdesk Engine (`/pages/Workdesk`)

When a tender is marked `Proceed`, a **Workspace** is automatically created, ready for multi-department collaboration.

#### A. Workspace Role & Department Settings (`WorkspaceSettings.jsx`)
*   Admins can create, edit, and delete departments under the workspace.
*   Only users with `admin` role locally (or globally `Admin`) can access Settings.

#### B. Active Overview Analytics Dashboard (`WorkspaceOverview.jsx`)
A live business intelligence panel loaded from `GET /api/workspaces/:tenderId/overview`:

| Metric | Source |
|---|---|
| Tender Title, Status, Deadline, Budget | `gem_tenders` / `open_tender_details` / `tender_status_history` |
| Total Departments | Count of `workspace_employees.department_id` |
| Total Tasks | Count of `workspace_tasks` rows |
| Total Files | Count of `workdesk_documents` for this `bid_no` |
| Daily Task Trend | `workspace_tasks` grouped by `DATE_FORMAT(created_at)` per day |
| File Distribution | `workdesk_documents` grouped by `workspace_dept` |
| Task Completion Rate | `(done_tasks / total_tasks) * 100` |

---

#### C. All Tasks Overview (`WorkspaceTasks.jsx` + `Workspaces.jsx`)

This is the primary mission-critical workflow dashboard. It gives every team member (and admin) a bird's eye view of all registered tasks across every department.

**Frontend: `WorkspaceTasks.jsx`**

The component intelligently handles two incoming data formats — Array (from the real backend API) and Object keyed by department (legacy/local state) — normalizing both into a single unified task list before rendering.

Key rendered UI elements:
*   **3 Summary Cards**:
    *   🔵 **Total Tasks** – total count of all workspace tasks
    *   🔴 **Pending** – count of tasks where `status !== 'done'`
    *   🟢 **Completed** – count of tasks where `status === 'done'`
*   **Filter Bar** (all client-side, instant):
    *   🔍 **Live Search** – filters task list down by `title` as the user types
    *   🏢 **Department Filter** – dropdown populated dynamically from the `departments` prop
    *   ✅ **Status Filter** – dropdown to slice between `All`, `Pending`, `Done`
*   **Task Card List**: Each card renders:
    *   Task Title (styled with line-through and green tint if `done`)
    *   Creation date (auto-formatted from backend `created_at` timestamp)
    *   Categorical **Tag Pills** (e.g., `Step`, `Doc`, `Request`)
    *   **Department Badge** with its specific team colour
    *   **✓ Done** status pill for completed tasks
    *   Right-side status toggle icon (CheckCircle if done, hollow Circle if pending)
*   **Generate Tasks Button**: Top-right purple action button triggering the automated task generation flow via `onGenerateClick` callback prop.

**Backend: Task API Endpoints (`workspace.controller.js`)**

All task routes are registered under `/api/workspaces/` using regex-based Express routing to safely handle Tender IDs that contain `/` slashes.

| Method | Route Pattern | Action |
|---|---|---|
| `GET` | `/api/workspaces/:tenderId/tasks` | Fetch all tasks for workspace, joined with department name and colour |
| `POST` | `/api/workspaces/:tenderId/tasks` | Create a new task (title, department_id, tags, description, deadline, assigned_users) |
| `PUT` | `/api/workspaces/:tenderId/tasks/:taskId` | Dynamically update any subset of task fields (dynamic field builder prevents empty updates) |
| `DELETE` | `/api/workspaces/:tenderId/tasks/:taskId` | Hard delete a task scoped to that workspace |

**Task Data Schema (`workspace_tasks` table)**:

| Field | Type | Description |
|---|---|---|
| `id` | INT (PK) | Auto-increment primary key |
| `workspace_id` | INT (FK) | Links to the parent workspace |
| `department_id` | INT (FK) | The owning department |
| `title` | VARCHAR | Task title |
| `description` | TEXT | Full description/instructions |
| `deadline` | DATE | Due date enforced by admin |
| `assigned_users` | JSON | Array of employee IDs assigned to this task |
| `tags` | JSON | Label tags (e.g., `["Urgent", "Doc"]`) |
| `status` | ENUM | `not-done` by default, flips to `done` on completion |
| `remarks` | TEXT | Completion note typed by the user before marking done |
| `created_at` | TIMESTAMP | Auto-populated on insert |

**Task Completion Flow (Enforced Verification)**:

To prevent accidental completion, the system enforces a strict 2-step process:
1.  User clicks the **✓ Complete icon** on a task card in `Workspaces.jsx`, opening the **Complete Task Modal**.
2.  Inside the modal, the user must:
    *   Type their reasoning/outcome in the **Remarks** text field *(required — button stays disabled until filled)*.
    *   Check the **"I confirm this task is genuinely completed"** verification checkbox.
3.  Only after both conditions are satisfied does the **Confirm Completion** button activate.
4.  On confirm, a `PATCH/PUT` request hits the backend updating `status = 'done'` and `remarks = <user input>`.

---

#### D. Document Data Vault (`workdesk_documents`)
*   **Upload**: `POST /api/workdesk/upload` — Multer streams file to disk; metadata (bid_no, workspace_dept, description, uploaded_by) persisted to DB.
*   **Download**: `GET /api/workdesk/download/:id` — Serves the file back as an attachment streaming directly from the file path.
*   **Delete**: `DELETE /api/workdesk/:id` — Removes both the physical file and the database record.
*   **Audit**: Every document row stores `uploaded_by` (User ID → resolved to name on frontend) for full accountability.

---

## 🗄️ Workspace API Route Reference

| Route | Method | Auth | Description |
|---|---|---|---|
| `/api/workspaces/eligible-users` | GET | no | List users eligible for workspace assignment |
| `/api/workspaces/my-role/:tenderId` | GET | ✅ JWT | Resolve current user's workspace role + settings access |
| `/api/workspaces/:tenderId/overview` | GET | no | Aggregate analytics for Overview dashboard |
| `/api/workspaces/:tenderId/departments` | GET / POST | no | List or create departments |
| `/api/workspaces/:tenderId/departments/:id` | PUT / DELETE | no | Update or delete a department |
| `/api/workspaces/:tenderId/departments/:id/users` | GET | no | Get all users in a department |
| `/api/workspaces/:tenderId/employees` | GET / POST | no | List or add workspace employees |
| `/api/workspaces/:tenderId/employees/:id` | PUT / DELETE | no | Update or remove an employee |
| `/api/workspaces/:tenderId/deadlines` | GET / POST | no | List or create deadline milestones |
| `/api/workspaces/:tenderId/deadlines/:id` | PUT / DELETE | no | Update or delete a deadline |
| `/api/workspaces/:tenderId/tasks` | GET / POST | no | List all tasks or create a new one |
| `/api/workspaces/:tenderId/tasks/:taskId` | PUT / DELETE | no | Update or delete a task |

---

## 🏃 Initialization Guide

1.  **Backend** (`/backend`):
    *   Copy `.env.example` → `.env`. Set `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `JWT_SECRET`, `PORT`.
    *   Run `npm install` then `npm run dev`.
    *   Backend starts on `http://localhost:5000`.

2.  **Frontend** (`/Frontend`):
    *   Set `VITE_API_BASE_URL=http://localhost:5000/api` in `.env`.
    *   Run `npm install` then `npm run dev`.
    *   Opens at `http://localhost:5173`.