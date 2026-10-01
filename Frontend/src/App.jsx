// src/App.jsx
import React, { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

// Layout
import Navbar from "./components/layout/Navbar";

import Assistant from "./components/chat/Assistant";
// Auth
const Login = lazy(() => import("./pages/Login"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const Register = lazy(() => import("./pages/Register"));

// Tenders
const TendersPage = lazy(() => import("./pages/Tenders/TendersPage"));
const TenderTracker = lazy(() => import("./pages/Tenders/TenderTracker"));
const InterestedPage = lazy(() => import("./pages/Tenders/InterestedPage"));
const ArchivePage = lazy(() => import("./pages/Tenders/ArchivePage"));
const CreateTenderPage = lazy(() => import("./pages/Tenders/CreateTender"));
const DocumentTender = lazy(() => import("./pages/Tenders/DocumentTender"));
const TenderDetails = lazy(() => import("./pages/Tenders/TenderDetails"));
const DeviationPage = lazy(() => import("./pages/Tenders/DeviationPage"));
const DeviationRepresentationEditor = lazy(() => import("./pages/Tenders/DeviationRepresentationEditor"));
const FLSPAttendance = lazy(() => import("./pages/Tenders/FLSPAttendance"));
const PreBidSummaries = lazy(() => import("./pages/Tenders/PreBidSummaries"));

// Workdesk
const ActiveWorkspaces = lazy(() => import("./pages/Workdesk/ActiveWorkspaces"));
const Workspaces = lazy(() => import("./pages/Workdesk/Workspaces"));
const Workdesk = lazy(() => import("./pages/Workdesk/Workdesk"));
const DocumentEditor = lazy(() => import("./pages/Workdesk/DocumentEditor"));
const RepresentationDocumentEditor = lazy(() => import("./pages/Workdesk/RepresentationDocumentEditor"));
const TenderDocumentAnalyzer = lazy(() => import("./pages/Workdesk/TenderDocumentAnalyzer"));
const TenderDocumentEditor = lazy(() => import("./pages/Workdesk/TenderDocumentEditor"));
const Library = lazy(() => import("./pages/Workdesk/Library"));
const LetterGenerate = lazy(() => import("./pages/Workdesk/LetterGenerate"));

// Orders
const GEMContracts = lazy(() => import("./pages/Orders/GEMContracts"));
const CartingDashboard = lazy(() => import("./pages/Orders/CartingDashboard"));
const WorkOrders = lazy(() => import("./pages/Orders/WorkOrders"));
const POTracking = lazy(() => import("./pages/Orders/POTracking"));
const BillingInvoices = lazy(() => import("./pages/Orders/BillingInvoices"));

// Insights
const WinningProbability = lazy(() => import("./pages/Insights/WinningProbability"));
const CompetitorAnalysis = lazy(() => import("./pages/Insights/CompetitorAnalysis"));
const CompetitorProfile = lazy(() => import("./pages/Insights/CompetitorProfile"));
const ProductSuggestions = lazy(() => import("./pages/Insights/ProductSuggestions"));
const PricingEvaluation = lazy(() => import("./pages/Insights/PricingEvaluation"));
const CompareBidders = lazy(() => import('./pages/Insights/CompareBidders'));
const CompareProducts = lazy(() => import('./pages/Insights/CompareProducts'));
const IncidentDashboard = lazy(() => import('./pages/Insights/Incident'));
// import HistoricalComparison from './pages/Insights/HistoricalComparison';
const CompanyProfile = lazy(() => import("./pages/Insights/CompanyProfile"));

// Dealers
const Distributors = lazy(() => import("./pages/Dealers/Distributors"));
const DealerAuthorizationLetter = lazy(() => import("./pages/Dealers/DealerAuthorizationLetter"));
const DealerAuthSignatures = lazy(() => import("./pages/Dealers/DealerAuthSignatures"));
const Oems = lazy(() => import("./pages/Dealers/Oems"));
const DealerPerformance = lazy(() => import("./pages/Dealers/Dealer-Performance"));

// Admin
const AdminHome = lazy(() => import("./pages/Admin/Home"));
const OpenTendersDashboard = lazy(() => import("./pages/Admin/OpenTendersDashboard"));
const MonitorDashboard = lazy(() => import("./pages/Admin/MonitorDashboard"));
const UserManagement = lazy(() => import("./pages/Admin/UserManagement"));
const SupportTickets = lazy(() => import("./pages/Admin/SupportTickets"));
const Tutorial = lazy(() => import("./pages/Tutorial/Tutorial"));
const ProductCategories = lazy(() => import("./pages/Admin/ProductCategories"));
const AutomationDashboard = lazy(() => import("./pages/Admin/AutomationDashboard"));
const ScrapersDashboard = lazy(() => import("./pages/Admin/ScrapersDashboard"));
const FieldTeamManagement = lazy(() => import("./pages/Admin/FieldTeamManagement"));
const Approvals = lazy(() => import("./pages/Admin/Approvals"));
const Pricing = lazy(() => import("./pages/Admin/Pricing"));
const SheetPage = lazy(() => import("./pages/Admin/SheetPage"));

// Docs
const DocsEditor = lazy(() => import("./pages/Docs/DocsEditor"));
const MergedPdfEditor = lazy(() => import("./pages/Docs/MergedPdfEditor"));

// Support
const ProductSuggestionTool = lazy(() => import("./pages/Support/ProductSuggestionTool"));
const MyTickets = lazy(() => import("./pages/Support/MyTickets"));
const AIDrive = lazy(() => import("./pages/Support/AIDrive"));
const BudgetTargetingSystem = lazy(() => import("./pages/Support/BudgetTargetingSystem"));

// Profile
const Profile = lazy(() => import("./pages/Profile"));

import { useActivityTracker } from "./hooks/useActivityTracker";

const Sample = lazy(() => import("./pages/Tenders/sample.jsx"));

/* -------------------------
   AUTH + ROLE GUARD
------------------------- */
const isTokenExpired = (token) => {
  try {
    // JWT is base64: header.payload.signature
    const payload = JSON.parse(atob(token.split('.')[1]));
    // 'exp' is in seconds, Date.now() is in ms
    return payload.exp * 1000 < Date.now();
  } catch {
    return true; // treat malformed token as expired
  }
};

const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem("token");
  const user = JSON.parse(localStorage.getItem("user"));

  if (!token || isTokenExpired(token)) {
    // Clear stale session data
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
};

/* -------------------------
   APP LAYOUT
------------------------- */
const AppLayout = () => {
  useActivityTracker();
  const location = useLocation();
  const hideNavbar =
    location.pathname === "/login" ||
    location.pathname === "/reset-password" ||
    location.pathname === "/register" ||
    location.pathname === "/support/product-suggestion" ||
    location.pathname.startsWith("/Docs") ||
    // Full-page sheet opens in its own tab purely to read a wide table —
    // the navbar only steals vertical space and overlaps the sticky header.
    location.pathname.startsWith("/Admin/sheet/");

  // Workspaces.jsx (Tender Hub) builds its own full-bleed sidebar+content
  // shell internally — the outer 1.5rem page padding was clipping it on all
  // sides instead of letting it use the full viewport. Keep the top Navbar
  // here (unlike hideNavbar's routes), just drop the surrounding padding.
  const noPadding = hideNavbar || location.pathname.startsWith("/workspace");

  return (
    <>
      {!hideNavbar && <Navbar />}
      {!hideNavbar && <Assistant />}

      <main
        style={{
          padding: noPadding ? "0" : "1.5rem",
          background: "#f3f6fb",
          minHeight: hideNavbar ? "100vh" : "calc(100vh - 64px)",
          height: location.pathname.startsWith("/Docs") ? "100vh" : undefined,
          overflow: location.pathname.startsWith("/Docs") ? "hidden" : undefined,
        }}
      >
        <Suspense fallback={
          <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
            Loading…
          </div>
        }>
        <Routes>
          {/* -------- AUTH -------- */}
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/register" element={<Register />} />

          {/* -------- SUPPORT (public) -------- */}
          <Route
            path="/support/product-suggestion"
            element={<ProductSuggestionTool />}
          />

          {/* -------- DEFAULT REDIRECT -------- */}
          <Route
            path="/"
            element={<Navigate to="/login" replace />}
          />


          {/* ================= ADMIN ROUTES ================= */}
          <Route
            path="/Admin/"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <AdminHome />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/open-dashboard"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <OpenTendersDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/home"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <AdminHome />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/tenders"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <TendersPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/document-tender"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <DocumentTender />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/tenderdetails/:id"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <TenderDetails />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/tenderdetails/:tenderId/deviations"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <DeviationPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/tenderdetails/:tenderId/deviation-representation"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <DeviationRepresentationEditor />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/tender-tracker"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <TenderTracker />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/interested"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <InterestedPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/archive"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <ArchivePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/prebid-meetings"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <PreBidSummaries />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/create"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <CreateTenderPage />
              </ProtectedRoute>
            }
          />

          {/* Admin Workdesk */}
          <Route
            path="/Admin/workdesk/active-workspaces"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <ActiveWorkspaces />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Admin/workdesk"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <Workdesk />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Admin/workdesk/library"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <Library />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Admin/workdesk/letter-generate"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <LetterGenerate />
              </ProtectedRoute>
            }
          />

          {/* ================= USER ROUTES ================= */}
          <Route
            path="/User/tenders"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <TendersPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/User/document-tender"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <DocumentTender />
              </ProtectedRoute>
            }
          />

          <Route
            path="/User/tender-tracker"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <TenderTracker />
              </ProtectedRoute>
            }
          />

          <Route
            path="/User/tenderdetails/:id"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <TenderDetails />
              </ProtectedRoute>
            }
          />

          <Route
            path="/User/prebid-meetings"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <PreBidSummaries />
              </ProtectedRoute>
            }
          />

          {/* ================= SHARED ROUTES ================= */}
          <Route
            path="/tenders/tenderdetails/:tenderId"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <TenderDetails />
              </ProtectedRoute>
            }
          />

          <Route
            path="/flsp-attendance/:tokenId"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <FLSPAttendance />
              </ProtectedRoute>
            }
          />

          <Route
            path="/workspace/*"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <Workspaces />
              </ProtectedRoute>
            }
          />


          <Route
            path="/workspace/:tenderId/doc-editor/:taskId"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <DocumentEditor />
              </ProtectedRoute>
            }
          />

          <Route
            path="/workspace/:tenderId/rep-editor"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <RepresentationDocumentEditor />
              </ProtectedRoute>
            }
          />

          <Route
            path="/workspace/:tenderId/doc-analyzer"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <TenderDocumentAnalyzer />
              </ProtectedRoute>
            }
          />

          <Route
            path="/workspace/:tenderId/doc-analyzer/edit/:templateIndex"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <TenderDocumentEditor />
              </ProtectedRoute>
            }
          />

          {/* Orders */}
          <Route
            path="/orders/gem-contracts"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <GEMContracts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/orders/carting-dashboard"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <CartingDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/orders/work-orders"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <WorkOrders />
              </ProtectedRoute>
            }
          />

          <Route
            path="/orders/po-tracking"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <POTracking />
              </ProtectedRoute>
            }
          />

          <Route
            path="/orders/billing-invoices"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <BillingInvoices />
              </ProtectedRoute>
            }
          />

          {/* Insights */}
          <Route
            path="/insights/participated-tender"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <WinningProbability />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/competitor-analysis"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <CompetitorAnalysis />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/CompetitorProfile"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <CompetitorProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/product-suggestions"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <ProductSuggestions />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/pricing-evaluation"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <PricingEvaluation />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/Incident"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <IncidentDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/compare-products"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <CompareProducts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/Company-Profile"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <CompanyProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/Compare-Bidders"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <CompareBidders />
              </ProtectedRoute>
            }
          />

          {/* Dealers */}
          <Route
            path="/dealers/distributors"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <Distributors />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dealers/authorization-letter"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <DealerAuthorizationLetter />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dealers/signatures"
            element={
              <ProtectedRoute allowedRoles={["Legal", "Admin", "Tender Admin", "Office Administrator"]}>
                <DealerAuthSignatures />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dealers/oems"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <Oems />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dealers/Dealer-Performance"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <DealerPerformance />
              </ProtectedRoute>
            }
          />

          {/* -------- MONITOR / ADMIN -------- */}
          {/* Executives see their own requests here (read-only); Tender Admins
              see and decide requests from their own department. */}
          {/* Full-page Process Decode sheet — opened in a new tab from the
              approvals viewer, so all 17 columns fit on screen. */}
          <Route
            path="/Admin/sheet/:requestId"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <SheetPage />
              </ProtectedRoute>
            }
          />

          {/* Finance pricing — Finance Team enter and submit; Admin can view. */}
          <Route
            path="/Admin/pricing"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Finance Team"]}>
                <Pricing />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/approvals"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Tender Executive", "Zonal Head", "Sales", "Finance Team", "Legal", "Documentation"]}>
                <Approvals />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/monitor"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator"]}>
                <MonitorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Admin/users"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator", "Zonal Head"]}>
                <UserManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Admin/support-tickets"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator"]}>
                <SupportTickets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Admin/product-categories"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator"]}>
                <ProductCategories />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Admin/automation"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator"]}>
                <AutomationDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Admin/scrapers"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator"]}>
                <ScrapersDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Admin/field-team"
            element={
              <ProtectedRoute allowedRoles={["Admin", "Tender Admin", "Office Administrator"]}>
                <FieldTeamManagement />
              </ProtectedRoute>
            }
          />

          {/* -------- SHARED USER ROUTES -------- */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/support"
            element={
              <ProtectedRoute>
                <MyTickets />
              </ProtectedRoute>
            }
          />
          <Route
            path="/support/ai-drive"
            element={
              <ProtectedRoute>
                <AIDrive />
              </ProtectedRoute>
            }
          />
          <Route
            path="/support/budget-targeting"
            element={
              <ProtectedRoute allowedRoles={["Office Administrator"]}>
                <BudgetTargetingSystem />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tutorial"
            element={
              <ProtectedRoute>
                <Tutorial />
              </ProtectedRoute>
            }
          />

          {/* -------- DOCS EDITOR -------- */}
          <Route
            path="/Docs/new"
            element={
              <ProtectedRoute>
                <DocsEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Docs/:docId"
            element={
              <ProtectedRoute>
                <DocsEditor />
              </ProtectedRoute>
            }
          />
          <Route
            path="/MergedPdf/:docId"
            element={
              <ProtectedRoute>
                <MergedPdfEditor />
              </ProtectedRoute>
            }
          />

          {/* -------- UNAUTHORIZED -------- */}
          <Route
            path="/unauthorized"
            element={
              <div style={{ padding: "2rem" }}>
                <h2>403 — Unauthorized</h2>
                <p>You do not have permission to access this page.</p>
              </div>
            }
          />

          {/* -------- 404 -------- */}
          <Route
            path="*"
            element={
              <div style={{ padding: "2rem" }}>
                <h2>404 — Page Not Found</h2>
                <p>The page you requested does not exist.</p>
              </div>
            }
          />
        </Routes>
        </Suspense>
      </main>
    </>
  );
};

function App() {
  return (
    <BrowserRouter>
      <AppLayout />
    </BrowserRouter>
  );
}

export default App;
