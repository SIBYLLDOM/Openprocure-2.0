const BASE_URL = `http://${window.location.hostname}:5000/api`;

export async function fetchSellers() {
    // OLD: /contracts/sellers
    // NEW: /competitors/list
    const res = await fetch(`${BASE_URL}/competitors/list`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    });
    const json = await res.json();
    return json.data ?? [];
}
