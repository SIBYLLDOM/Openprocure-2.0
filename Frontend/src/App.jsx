// src/App.jsx
import React from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

// Layout
import Navbar from "./components/layout/Navbar";

// Auth
import Login from "./pages/Login";
import Register from "./pages/Register";

// Tenders
import TendersPage from "./pages/Tenders/TendersPage";
import InterestedPage from "./pages/Tenders/InterestedPage";
import ArchivePage from "./pages/Tenders/ArchivePage";
import CreateTenderPage from "./pages/Tenders/CreateTender";
import TenderDetails from "./pages/Tenders/TenderDetails";
import DeviationPage from "./pages/Tenders/DeviationPage";
import DeviationRepresentationEditor from "./pages/Tenders/DeviationRepresentationEditor";
import FLSPAttendance from "./pages/Tenders/FLSPAttendance";
import PreBidSummaries from "./pages/Tenders/PreBidSummaries";

// Workdesk
import ActiveWorkspaces from "./pages/Workdesk/ActiveWorkspaces";
import Workspaces from "./pages/Workdesk/Workspaces";
import Workdesk from "./pages/Workdesk/Workdesk";
import DocumentEditor from "./pages/Workdesk/DocumentEditor";
import RepresentationDocumentEditor from "./pages/Workdesk/RepresentationDocumentEditor";

// Orders
import GEMContracts from "./pages/Orders/GEMContracts";
import CartingDashboard from "./pages/Orders/CartingDashboard";
import WorkOrders from "./pages/Orders/WorkOrders";
import POTracking from "./pages/Orders/POTracking";
import BillingInvoices from "./pages/Orders/BillingInvoices";

// Insights
import WinningProbability from "./pages/Insights/WinningProbability";
import CompetitorAnalysis from "./pages/Insights/CompetitorAnalysis";
import CompetitorProfile from "./pages/Insights/CompetitorProfile";
import ProductSuggestions from "./pages/Insights/ProductSuggestions";
import PricingEvaluation from "./pages/Insights/PricingEvaluation";
import CompareBidders from './pages/Insights/CompareBidders';
import CompareProducts from './pages/Insights/CompareProducts';
import IncidentDashboard from './pages/Insights/Incident';
// import HistoricalComparison from './pages/Insights/HistoricalComparison';
import CompanyProfile from "./pages/Insights/CompanyProfile";

// Dealers
import Distributors from "./pages/Dealers/Distributors";
import Oems from "./pages/Dealers/Oems";
import DealerPerformance from "./pages/Dealers/Dealer-Performance";

// Admin
import AdminHome from "./pages/Admin/Home";
import OpenTendersDashboard from "./pages/Admin/OpenTendersDashboard";

// Support
import ProductSuggestionTool from "./pages/Support/ProductSuggestionTool";

import Sample from "./pages/Tenders/sample.jsx";

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
  const location = useLocation();
  const hideNavbar =
    location.pathname === "/login" ||
    location.pathname === "/register" ||
    location.pathname === "/support/product-suggestion";

  return (
    <>
      {!hideNavbar && <Navbar />}

      <main
        style={{
          padding: hideNavbar ? "0" : "1.5rem",
          background: "#f3f6fb",
          minHeight: hideNavbar
            ? "100vh"
            : "calc(100vh - 64px)",
        }}
      >
        <Routes>
          {/* -------- AUTH -------- */}
          <Route path="/login" element={<Login />} />
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
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <AdminHome />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/open-dashboard"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <OpenTendersDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/home"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <AdminHome />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/tenders"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <TendersPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/tenderdetails/:id"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <TenderDetails />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/tenderdetails/:tenderId/deviations"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <DeviationPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/tenderdetails/:tenderId/deviation-representation"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <DeviationRepresentationEditor />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/interested"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <InterestedPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/archive"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <ArchivePage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/prebid-meetings"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <PreBidSummaries />
              </ProtectedRoute>
            }
          />

          <Route
            path="/Admin/create"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <CreateTenderPage />
              </ProtectedRoute>
            }
          />

          {/* Admin Workdesk */}
          <Route
            path="/Admin/workdesk/active-workspaces"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <ActiveWorkspaces />
              </ProtectedRoute>
            }
          />
          <Route
            path="/Admin/workdesk"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <Workdesk />
              </ProtectedRoute>
            }
          />

          {/* ================= USER ROUTES ================= */}
          <Route
            path="/User/tenders"
            element={
              <ProtectedRoute allowedRoles={["User"]}>
                <TendersPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/User/tenderdetails/:id"
            element={
              <ProtectedRoute allowedRoles={["User"]}>
                <TenderDetails />
              </ProtectedRoute>
            }
          />

          <Route
            path="/User/prebid-meetings"
            element={
              <ProtectedRoute allowedRoles={["User"]}>
                <PreBidSummaries />
              </ProtectedRoute>
            }
          />

          {/* ================= SHARED ROUTES ================= */}
          <Route
            path="/tenders/tenderdetails/:tenderId"
            element={
              <ProtectedRoute allowedRoles={["Admin", "User", "pre-tender"]}>
                <TenderDetails />
              </ProtectedRoute>
            }
          />

          <Route
            path="/flsp-attendance/:tokenId"
            element={
              <ProtectedRoute allowedRoles={["Admin", "User", "pre-tender"]}>
                <FLSPAttendance />
              </ProtectedRoute>
            }
          />

          <Route
            path="/workspace/*"
            element={
              <ProtectedRoute allowedRoles={["Admin", "User", "pre-tender"]}>
                <Workspaces />
              </ProtectedRoute>
            }
          />


          <Route
            path="/workspace/:tenderId/doc-editor/:taskId"
            element={
              <ProtectedRoute allowedRoles={["Admin", "User", "pre-tender"]}>
                <DocumentEditor />
              </ProtectedRoute>
            }
          />

          <Route
            path="/workspace/:tenderId/rep-editor"
            element={
              <ProtectedRoute allowedRoles={["Admin", "User", "pre-tender"]}>
                <RepresentationDocumentEditor />
              </ProtectedRoute>
            }
          />

          {/* Orders */}
          <Route
            path="/orders/gem-contracts"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <GEMContracts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/orders/carting-dashboard"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <CartingDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/orders/work-orders"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <WorkOrders />
              </ProtectedRoute>
            }
          />

          <Route
            path="/orders/po-tracking"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <POTracking />
              </ProtectedRoute>
            }
          />

          <Route
            path="/orders/billing-invoices"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <BillingInvoices />
              </ProtectedRoute>
            }
          />

          {/* Insights */}
          <Route
            path="/insights/participated-tender"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <WinningProbability />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/competitor-analysis"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <CompetitorAnalysis />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/CompetitorProfile"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <CompetitorProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/product-suggestions"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <ProductSuggestions />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/pricing-evaluation"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <PricingEvaluation />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/Incident"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <IncidentDashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/compare-products"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <CompareProducts />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/Company-Profile"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <CompanyProfile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/insights/Compare-Bidders"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <CompareBidders />
              </ProtectedRoute>
            }
          />

          {/* Dealers */}
          <Route
            path="/dealers/distributors"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <Distributors />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dealers/oems"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <Oems />
              </ProtectedRoute>
            }
          />

          <Route
            path="/dealers/Dealer-Performance"
            element={
              <ProtectedRoute allowedRoles={["Admin", "pre-tender"]}>
                <DealerPerformance />
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
