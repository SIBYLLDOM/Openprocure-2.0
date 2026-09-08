import api from './api';

// Thin wrapper around /api/analytics — clones of the automation site's
// "Competitor Portfolio Tracking" (Company-Profile) and "Compare
// Competitors" (Compare-Bidders) pages, both derived from the migrated
// `contracts` table (see backend/controllers/analyticsController.js).

export const getSellers = () =>
  api.get('/analytics/sellers').then((r) => r.data as { success: boolean; data: string[] });

export interface CompanyProfileData {
  kpis: {
    totalContracts: number;
    totalRevenue: number;
    avgContractValue: number;
    statesCovered: number;
    brandsSupplied: number;
    directSupplyPct: number;
  };
  stateWise: { state: string; contracts: number; revenue: number }[];
  brandWise: { brand: string; contracts: number; revenue: number }[];
  products: { product: string; brand: string; qtySold: number; revenue: number; avgUnitPrice: number }[];
}

export const getCompanyProfile = (seller: string) =>
  api.get('/analytics/company-profile', { params: { seller } }).then((r) => r.data as { success: boolean; data: CompanyProfileData });

export interface CompareBiddersData {
  seller1: { sellerName: string; totalContracts: number; totalRevenue: number; avgValue: number; directSupplyPct: number };
  seller2: { sellerName: string; totalContracts: number; totalRevenue: number; avgValue: number; directSupplyPct: number };
  priceComparison: { product: string; brand: string; seller1AvgPrice: number; seller2AvgPrice: number }[];
  stateComparison: { state: string; seller1Revenue: number; seller2Revenue: number }[];
  recentContracts: { contractNo: string | null; sellerName: string; state: string | null; brand: string | null; totalValue: string | null; contractDate: string | null }[];
}

export const compareBidders = (seller1: string, seller2: string) =>
  api.get('/analytics/compare-bidders', { params: { seller1, seller2 } }).then((r) => r.data as { success: boolean; data: CompareBiddersData; message?: string });
