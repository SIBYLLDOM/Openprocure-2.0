// Lightweight geo/dial-code reference data for the Setup Profile wizard.
// No external package — this project has no geo/phone library installed,
// and pulling one in for a handful of dropdowns wasn't worth the
// dependency. Deliberately scoped to what the form actually needs:
// worldwide country + dial-code list (every partner picks a country and
// wants the right prefix), but state/city dropdowns only for India, since
// that's this ERP's primary market (GSTIN/PAN/CIN are India-specific) —
// everywhere else falls back to free-text state/city inputs.

export interface Country {
  code: string; // ISO 3166-1 alpha-2
  name: string;
  dialCode: string;
}

// ISO alpha-2 -> flag emoji, computed from the two regional-indicator
// Unicode code points rather than hardcoding 190 emoji literals.
export const flagEmoji = (iso2: string) =>
  String.fromCodePoint(...iso2.toUpperCase().split('').map((c) => 127397 + c.charCodeAt(0)));

export const COUNTRIES: Country[] = [
  { code: 'IN', name: 'India', dialCode: '+91' },
  { code: 'US', name: 'United States', dialCode: '+1' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971' },
  { code: 'SG', name: 'Singapore', dialCode: '+65' },
  { code: 'AU', name: 'Australia', dialCode: '+61' },
  { code: 'CA', name: 'Canada', dialCode: '+1' },
  { code: 'DE', name: 'Germany', dialCode: '+49' },
  { code: 'FR', name: 'France', dialCode: '+33' },
  { code: 'IT', name: 'Italy', dialCode: '+39' },
  { code: 'ES', name: 'Spain', dialCode: '+34' },
  { code: 'NL', name: 'Netherlands', dialCode: '+31' },
  { code: 'CH', name: 'Switzerland', dialCode: '+41' },
  { code: 'SE', name: 'Sweden', dialCode: '+46' },
  { code: 'JP', name: 'Japan', dialCode: '+81' },
  { code: 'CN', name: 'China', dialCode: '+86' },
  { code: 'KR', name: 'South Korea', dialCode: '+82' },
  { code: 'HK', name: 'Hong Kong', dialCode: '+852' },
  { code: 'MY', name: 'Malaysia', dialCode: '+60' },
  { code: 'TH', name: 'Thailand', dialCode: '+66' },
  { code: 'ID', name: 'Indonesia', dialCode: '+62' },
  { code: 'PH', name: 'Philippines', dialCode: '+63' },
  { code: 'VN', name: 'Vietnam', dialCode: '+84' },
  { code: 'BD', name: 'Bangladesh', dialCode: '+880' },
  { code: 'PK', name: 'Pakistan', dialCode: '+92' },
  { code: 'LK', name: 'Sri Lanka', dialCode: '+94' },
  { code: 'NP', name: 'Nepal', dialCode: '+977' },
  { code: 'SA', name: 'Saudi Arabia', dialCode: '+966' },
  { code: 'QA', name: 'Qatar', dialCode: '+974' },
  { code: 'KW', name: 'Kuwait', dialCode: '+965' },
  { code: 'OM', name: 'Oman', dialCode: '+968' },
  { code: 'BH', name: 'Bahrain', dialCode: '+973' },
  { code: 'IL', name: 'Israel', dialCode: '+972' },
  { code: 'TR', name: 'Turkey', dialCode: '+90' },
  { code: 'EG', name: 'Egypt', dialCode: '+20' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234' },
  { code: 'KE', name: 'Kenya', dialCode: '+254' },
  { code: 'BR', name: 'Brazil', dialCode: '+55' },
  { code: 'MX', name: 'Mexico', dialCode: '+52' },
  { code: 'AR', name: 'Argentina', dialCode: '+54' },
  { code: 'RU', name: 'Russia', dialCode: '+7' },
  { code: 'PL', name: 'Poland', dialCode: '+48' },
  { code: 'BE', name: 'Belgium', dialCode: '+32' },
  { code: 'AT', name: 'Austria', dialCode: '+43' },
  { code: 'DK', name: 'Denmark', dialCode: '+45' },
  { code: 'NO', name: 'Norway', dialCode: '+47' },
  { code: 'FI', name: 'Finland', dialCode: '+358' },
  { code: 'IE', name: 'Ireland', dialCode: '+353' },
  { code: 'PT', name: 'Portugal', dialCode: '+351' },
  { code: 'GR', name: 'Greece', dialCode: '+30' },
  { code: 'NZ', name: 'New Zealand', dialCode: '+64' },
];

export const countryOptions = COUNTRIES.map((c) => ({ value: c.name, label: `${flagEmoji(c.code)}  ${c.name}` }));
export const findCountry = (name: string) => COUNTRIES.find((c) => c.name === name);

export const INDIA_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Andaman and Nicobar Islands', 'Chandigarh', 'Dadra and Nagar Haveli and Daman and Diu', 'Delhi',
  'Jammu and Kashmir', 'Ladakh', 'Lakshadweep', 'Puducherry',
];

// Major cities per state — not exhaustive, just enough to make the dropdown
// useful; the field still degrades to free text for anywhere not covered.
export const INDIA_CITIES: Record<string, string[]> = {
  'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Nashik', 'Aurangabad', 'Thane', 'Navi Mumbai'],
  'Delhi': ['New Delhi', 'Dwarka', 'Rohini', 'Saket'],
  'Karnataka': ['Bengaluru', 'Mysuru', 'Mangaluru', 'Hubballi'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem'],
  'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad'],
  'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot'],
  'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Siliguri'],
  'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Noida', 'Ghaziabad', 'Agra', 'Varanasi'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota'],
  'Punjab': ['Chandigarh', 'Ludhiana', 'Amritsar', 'Jalandhar'],
  'Haryana': ['Gurugram', 'Faridabad', 'Panipat'],
  'Kerala': ['Kochi', 'Thiruvananthapuram', 'Kozhikode'],
  'Madhya Pradesh': ['Bhopal', 'Indore', 'Gwalior', 'Jabalpur'],
  'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur'],
  'Bihar': ['Patna', 'Gaya'],
  'Odisha': ['Bhubaneswar', 'Cuttack'],
  'Chhattisgarh': ['Raipur', 'Bhilai'],
  'Jharkhand': ['Ranchi', 'Jamshedpur'],
  'Assam': ['Guwahati'],
  'Chandigarh': ['Chandigarh'],
  'Puducherry': ['Puducherry'],
};
