/**
 * Service functions for Contracts and Competitor endpoints
 */

export const fetchSellers = async () => {
    const token = localStorage.getItem('token');
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/competitors/list`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const data = await response.json();
    if (data.success) {
        return data.data; // Expected to be an array of strings (seller names)
    } else {
        throw new Error(data.error || 'Failed to fetch sellers');
    }
};

export const fetchContracts = async (params) => {
    const token = localStorage.getItem('token');
    const queryParams = new URLSearchParams();

    if (params.seller_name) queryParams.append('seller_name', params.seller_name);

    // We use the same contracts endpoint as GEMContracts.jsx, but filter by seller.
    // Note: GeMContracts currently uses the main /contracts endpoint, we filter seller_name.
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/contracts?${queryParams.toString()}&limit=1000`, {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    const data = await response.json();
    if (data.success) {
        return data.data; // Array of contract objects
    } else {
        throw new Error(data.message || 'Failed to fetch contracts');
    }
};
