// Maps an Indian 6-digit PIN code to its state/UT, for tenders whose
// scraper only captured a delivery pincode (e.g. from a consignee address)
// and never a clean state name — see gem_tenders.pincode / open_tender_details.pincode.
//
// Ranges are the first-3-digit PIN "sorting district" prefixes, expressed as
// full 6-digit [min, max] bounds, sourced from India Post's postal circle
// allocation (en.wikipedia.org/wiki/Postal_Index_Number) with the
// UP/Uttarakhand, Bihar/Jharkhand and Andhra Pradesh/Telangana splits refined
// against ClearTax's e-invoicing pincode-state mapping reference. Carved so
// no two ranges overlap — the more specific state (e.g. Uttarakhand inside
// UP's block) is listed as its own separate range rather than a sub-range of
// the bigger one.
//
// NOTE: Jammu & Kashmir and Ladakh share the same 180000-194999 block with no
// further public sub-district split available, so PIN-derived rows in that
// block are attributed to "Jammu and Kashmir" only.
const PINCODE_STATE_RANGES = [
  { min: 110000, max: 119999, state: 'Delhi' },
  { min: 120000, max: 136999, state: 'Haryana' },
  { min: 140000, max: 159999, state: 'Punjab' },
  { min: 160000, max: 169999, state: 'Chandigarh' },
  { min: 170000, max: 179999, state: 'Himachal Pradesh' },
  { min: 180000, max: 194999, state: 'Jammu and Kashmir' },

  { min: 201000, max: 243999, state: 'Uttar Pradesh' },
  { min: 244000, max: 263999, state: 'Uttarakhand' },
  { min: 264000, max: 285999, state: 'Uttar Pradesh' },

  { min: 301000, max: 345999, state: 'Rajasthan' },

  { min: 360000, max: 395999, state: 'Gujarat' },
  { min: 396000, max: 396999, state: 'Dadra and Nagar Haveli and Daman and Diu' },

  { min: 400000, max: 402999, state: 'Maharashtra' },
  { min: 403000, max: 403999, state: 'Goa' },
  { min: 404000, max: 445999, state: 'Maharashtra' },

  { min: 450000, max: 488999, state: 'Madhya Pradesh' },
  { min: 490000, max: 497999, state: 'Chhattisgarh' },

  { min: 500000, max: 509999, state: 'Telangana' },
  { min: 510000, max: 535999, state: 'Andhra Pradesh' },

  { min: 560000, max: 591999, state: 'Karnataka' },

  { min: 600000, max: 604999, state: 'Tamil Nadu' },
  { min: 605000, max: 605999, state: 'Puducherry' },
  { min: 606000, max: 643999, state: 'Tamil Nadu' },

  { min: 670000, max: 681999, state: 'Kerala' },
  { min: 682000, max: 682999, state: 'Lakshadweep' },
  { min: 683000, max: 695999, state: 'Kerala' },

  { min: 700000, max: 736999, state: 'West Bengal' },
  { min: 737000, max: 737999, state: 'Sikkim' },
  { min: 738000, max: 743999, state: 'West Bengal' },
  { min: 744000, max: 744999, state: 'Andaman and Nicobar Islands' },

  { min: 750000, max: 770999, state: 'Odisha' },

  { min: 780000, max: 789999, state: 'Assam' },
  { min: 790000, max: 792999, state: 'Arunachal Pradesh' },
  { min: 793000, max: 794999, state: 'Meghalaya' },
  { min: 795000, max: 795999, state: 'Manipur' },
  { min: 796000, max: 796999, state: 'Mizoram' },
  { min: 797000, max: 798999, state: 'Nagaland' },
  { min: 799000, max: 799999, state: 'Tripura' },

  { min: 800000, max: 812999, state: 'Bihar' },
  { min: 813000, max: 835999, state: 'Jharkhand' },
  { min: 836000, max: 855999, state: 'Bihar' },
];

/** Returns the state name for a 6-digit pincode, or null if unmapped/invalid. */
function resolveStateFromPincode(pincode) {
  if (!pincode) return null;
  const n = parseInt(String(pincode).trim(), 10);
  if (!Number.isFinite(n) || n < 100000 || n > 999999) return null;
  const hit = PINCODE_STATE_RANGES.find(r => n >= r.min && n <= r.max);
  return hit ? hit.state : null;
}

/** Returns every [min, max] 6-digit range mapped to the given state name. */
function pincodeRangesForState(stateName) {
  if (!stateName) return [];
  return PINCODE_STATE_RANGES
    .filter(r => r.state.toLowerCase() === stateName.toLowerCase())
    .map(r => [r.min, r.max]);
}

module.exports = { PINCODE_STATE_RANGES, resolveStateFromPincode, pincodeRangesForState };
