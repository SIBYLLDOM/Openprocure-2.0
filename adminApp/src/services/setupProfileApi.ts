import api from './api';

// Thin wrapper around every OEM/Reseller Setup Profile endpoint (see
// backend/controllers/partnerProfileController.js and
// productMasterController.js) — keeps the wizard's step components free of
// repeated axios boilerplate and gives every call one place to change if the
// API shape moves.

export type JsonSection = 'companyInfo' | 'registeredAddress' | 'corporateAddress' | 'bankDetails' | 'businessDetails' | 'additionalInfo';
export type ScalarSection = 'sameAsRegistered' | 'currentStep' | 'confirmedAccurate';

export const getProfile = () => api.get('/partner-profile').then((r) => r.data);

export const saveSection = (section: JsonSection | ScalarSection, data: unknown) =>
  api.patch('/partner-profile', { section, data }).then((r) => r.data);

export const uploadLogo = (file: File) => {
  const fd = new FormData();
  fd.append('logo', file);
  return api.post('/partner-profile/logo', fd).then((r) => r.data);
};

const crud = (resource: string) => ({
  create: (data: Record<string, unknown>) => api.post(`/partner-profile/${resource}`, data).then((r) => r.data),
  update: (id: number, data: Record<string, unknown>) => api.patch(`/partner-profile/${resource}/${id}`, data).then((r) => r.data),
  remove: (id: number) => api.delete(`/partner-profile/${resource}/${id}`).then((r) => r.data),
});

const crudWithFile = (resource: string, fileField: string) => ({
  create: (data: Record<string, unknown>, file?: File | null) => {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') fd.append(k, String(v)); });
    if (file) fd.append(fileField, file);
    return api.post(`/partner-profile/${resource}`, fd).then((r) => r.data);
  },
  update: (id: number, data: Record<string, unknown>, file?: File | null) => {
    const fd = new FormData();
    Object.entries(data).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') fd.append(k, String(v)); });
    if (file) fd.append(fileField, file);
    return api.patch(`/partner-profile/${resource}/${id}`, fd).then((r) => r.data);
  },
  remove: (id: number) => api.delete(`/partner-profile/${resource}/${id}`).then((r) => r.data),
});

export const contactsApi = crud('contacts');
export const locationsApi = crud('locations');
export const taxRegistrationsApi = crudWithFile('tax-registrations', 'document');
export const certificatesApi = crudWithFile('certificates', 'document');

export const setProducts = (selections: Array<{ categoryId?: number; subCategoryId?: number; productId?: number }>, customProducts: Array<{ categoryId?: number; subCategoryId?: number; name: string }>) =>
  api.put('/partner-profile/products', { selections, customProducts }).then((r) => r.data);

export const submitProfile = (confirmedAccurate: boolean) =>
  api.post('/partner-profile/submit', { confirmedAccurate }).then((r) => r.data);

export const getMyCategories = () => api.get('/product-master/categories').then((r) => r.data);

// Canonical list of every business category the partner could pick from
// (same list used at registration) — for the add/remove UI on Company
// Information. Updating it changes what Step 4 (Products & Categories)
// offers, since that step reads User.companyTypes fresh every time.
export const getCompanyTypes = () => api.get('/auth/company-types').then((r) => r.data as string[]);
export const updateCompanyTypes = (companyTypes: string[]) =>
  api.patch('/auth/company-types', { companyTypes }).then((r) => r.data as { companyTypes: string[] });

export const getProducts = (params: { subCategoryId?: number; search?: string; page?: number; pageSize?: number }) =>
  api.get('/product-master/products', { params }).then((r) => r.data);
