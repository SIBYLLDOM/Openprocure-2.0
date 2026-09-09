import type { ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { getDefaultRoute } from './utils/defaultRoute';

import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import PartnerRegisterPage from './pages/public/PartnerRegisterPage';
import SetupProfilePage from './pages/SetupProfilePage';
import DashboardShell from './components/DashboardShell';
import DashboardPage from './pages/dashboard/DashboardPage';
import TendersListPage from './pages/dashboard/TendersListPage';
import TenderDetailsPage from './pages/dashboard/TenderDetailsPage';
import ParticipatedTendersPage from './pages/dashboard/ParticipatedTendersPage';
import CompanyProfilePage from './pages/dashboard/CompanyProfilePage';
import CompareBiddersPage from './pages/dashboard/CompareBiddersPage';
import GemContractsPage from './pages/dashboard/GemContractsPage';
import CartingDashboardPage from './pages/dashboard/CartingDashboardPage';
import ActiveWorkspacesPage from './pages/dashboard/ActiveWorkspacesPage';
import LibraryPage from './pages/dashboard/LibraryPage';
import TenderHubPage from './pages/dashboard/TenderHubPage';
import DistributorsPage from './pages/dashboard/DistributorsPage';
import DealerAuthLetterPage from './pages/dashboard/DealerAuthLetterPage';
import OurProductsPage from './pages/dashboard/OurProductsPage';
import OurClientsPage from './pages/dashboard/OurClientsPage';
import QuotationsPage from './pages/dashboard/QuotationsPage';
import InvoicesPage from './pages/dashboard/InvoicesPage';
import ProformaInvoicePage from './pages/dashboard/ProformaInvoicePage';
import PaymentReceiptsPage from './pages/dashboard/PaymentReceiptsPage';
import SalesOrderPage from './pages/dashboard/SalesOrderPage';
import DeliveryChallanPage from './pages/dashboard/DeliveryChallanPage';
import CreditNotePage from './pages/dashboard/CreditNotePage';
import OurVendorsPage from './pages/dashboard/OurVendorsPage';
import PurchasesHubPage from './pages/dashboard/PurchasesHubPage';
import TenderTrackerPage from './pages/dashboard/TenderTrackerPage';
import DocumentTenderPage from './pages/dashboard/DocumentTenderPage';

// Root/unknown-path fallback — sends a logged-in partner to their own
// OEM/Reseller portal, everyone else to the landing page.
const DefaultRedirect = () => {
  const { isAuthenticated, user } = useAuth();
  if (!isAuthenticated) return <Navigate to="/" replace />;
  return <Navigate to={getDefaultRoute(user)} replace />;
};

// Any authenticated partner can reach the Setup Profile wizard — it's not
// gated to only first-time users (the "View My Profile" button on its own
// completion screen re-opens it), so this only checks isAuthenticated.
const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<PartnerRegisterPage />} />
            <Route path="/setup-profile" element={<RequireAuth><SetupProfilePage /></RequireAuth>} />

            <Route path="/oem/:name/:id" element={<DashboardShell expectedType="oem" />}>
              <Route index element={<DashboardPage />} />
              <Route path="tenders" element={<TendersListPage />} />
              <Route path="tenders/tender-tracker" element={<TenderTrackerPage />} />
              <Route path="tenders/document-tender" element={<DocumentTenderPage />} />
              <Route path="tenders/participated-tender" element={<ParticipatedTendersPage />} />
              <Route path="tenders/workdesk/active-workspaces" element={<ActiveWorkspacesPage />} />
              <Route path="tenders/workdesk/library" element={<LibraryPage />} />
              <Route path="tenders/workspace/:bidNumber" element={<TenderHubPage />} />
              <Route path="tenders/:bidNumber" element={<TenderDetailsPage />} />
              <Route path="analytics/company-profile" element={<CompanyProfilePage />} />
              <Route path="analytics/compare-bidders" element={<CompareBiddersPage />} />
              <Route path="orders/gem-contracts" element={<GemContractsPage />} />
              <Route path="orders/carting-dashboard" element={<CartingDashboardPage />} />
              <Route path="sales/our-clients" element={<OurClientsPage />} />
              <Route path="sales/quotations" element={<QuotationsPage />} />
              <Route path="sales/invoices" element={<InvoicesPage />} />
              <Route path="sales/proforma-invoice" element={<ProformaInvoicePage />} />
              <Route path="sales/payment-receipts" element={<PaymentReceiptsPage />} />
              <Route path="sales/sales-order" element={<SalesOrderPage />} />
              <Route path="sales/delivery-challan" element={<DeliveryChallanPage />} />
              <Route path="sales/credit-note" element={<CreditNotePage />} />
              <Route path="purchases/our-vendors" element={<OurVendorsPage />} />
              <Route path="purchases/purchases-hub" element={<PurchasesHubPage />} />
              <Route path="dealers/distributors" element={<DistributorsPage />} />
              <Route path="dealers/our-products" element={<OurProductsPage />} />
              <Route path="dealers/authorization-letter" element={<DealerAuthLetterPage />} />
            </Route>
            <Route path="/reseller/:name/:id" element={<DashboardShell expectedType="reseller" />}>
              <Route index element={<DashboardPage />} />
              <Route path="tenders" element={<TendersListPage />} />
              <Route path="tenders/tender-tracker" element={<TenderTrackerPage />} />
              <Route path="tenders/document-tender" element={<DocumentTenderPage />} />
              <Route path="tenders/participated-tender" element={<ParticipatedTendersPage />} />
              <Route path="tenders/workdesk/active-workspaces" element={<ActiveWorkspacesPage />} />
              <Route path="tenders/workdesk/library" element={<LibraryPage />} />
              <Route path="tenders/workspace/:bidNumber" element={<TenderHubPage />} />
              <Route path="tenders/:bidNumber" element={<TenderDetailsPage />} />
              <Route path="analytics/company-profile" element={<CompanyProfilePage />} />
              <Route path="analytics/compare-bidders" element={<CompareBiddersPage />} />
              <Route path="orders/gem-contracts" element={<GemContractsPage />} />
              <Route path="orders/carting-dashboard" element={<CartingDashboardPage />} />
              <Route path="sales/our-clients" element={<OurClientsPage />} />
              <Route path="sales/quotations" element={<QuotationsPage />} />
              <Route path="sales/invoices" element={<InvoicesPage />} />
              <Route path="sales/proforma-invoice" element={<ProformaInvoicePage />} />
              <Route path="sales/payment-receipts" element={<PaymentReceiptsPage />} />
              <Route path="sales/sales-order" element={<SalesOrderPage />} />
              <Route path="sales/delivery-challan" element={<DeliveryChallanPage />} />
              <Route path="sales/credit-note" element={<CreditNotePage />} />
              <Route path="purchases/our-vendors" element={<OurVendorsPage />} />
              <Route path="purchases/purchases-hub" element={<PurchasesHubPage />} />
              <Route path="dealers/distributors" element={<DistributorsPage />} />
              <Route path="dealers/our-products" element={<OurProductsPage />} />
              <Route path="dealers/authorization-letter" element={<DealerAuthLetterPage />} />
            </Route>
            <Route path="*" element={<DefaultRedirect />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
