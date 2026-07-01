/**
 * ISO-3166-1 alpha-2 → short country name. gold_surges stores only the code, so the
 * dashboard maps it here; unknown codes fall back to the raw code via countryName().
 */
export const COUNTRY_NAMES: Record<string, string> = {
  AD: "Andorra", AE: "UAE", AF: "Afghanistan", AG: "Antigua & Barbuda",
  AL: "Albania", AM: "Armenia", AO: "Angola", AR: "Argentina",
  AT: "Austria", AU: "Australia", AZ: "Azerbaijan", BA: "Bosnia & Herzegovina",
  BB: "Barbados", BD: "Bangladesh", BE: "Belgium", BF: "Burkina Faso",
  BG: "Bulgaria", BH: "Bahrain", BI: "Burundi", BJ: "Benin",
  BN: "Brunei", BO: "Bolivia", BR: "Brazil", BS: "Bahamas",
  BT: "Bhutan", BW: "Botswana", BY: "Belarus", BZ: "Belize",
  CA: "Canada", CD: "DR Congo", CF: "Central African Rep.", CG: "Congo",
  CH: "Switzerland", CI: "Côte d'Ivoire", CL: "Chile", CM: "Cameroon",
  CN: "China", CO: "Colombia", CR: "Costa Rica", CU: "Cuba",
  CV: "Cabo Verde", CY: "Cyprus", CZ: "Czechia", DE: "Germany",
  DJ: "Djibouti", DK: "Denmark", DO: "Dominican Rep.", DZ: "Algeria",
  EC: "Ecuador", EE: "Estonia", EG: "Egypt", ER: "Eritrea",
  ES: "Spain", ET: "Ethiopia", FI: "Finland", FJ: "Fiji",
  FR: "France", GA: "Gabon", GB: "United Kingdom", GE: "Georgia",
  GH: "Ghana", GM: "Gambia", GN: "Guinea", GQ: "Equatorial Guinea",
  GR: "Greece", GT: "Guatemala", GW: "Guinea-Bissau", GY: "Guyana",
  HN: "Honduras", HR: "Croatia", HT: "Haiti", HU: "Hungary",
  ID: "Indonesia", IE: "Ireland", IL: "Israel", IN: "India",
  IQ: "Iraq", IR: "Iran", IS: "Iceland", IT: "Italy",
  JM: "Jamaica", JO: "Jordan", JP: "Japan", KE: "Kenya",
  KG: "Kyrgyzstan", KH: "Cambodia", KP: "North Korea", KR: "South Korea",
  KW: "Kuwait", KZ: "Kazakhstan", LA: "Laos", LB: "Lebanon",
  LK: "Sri Lanka", LR: "Liberia", LS: "Lesotho", LT: "Lithuania",
  LU: "Luxembourg", LV: "Latvia", LY: "Libya", MA: "Morocco",
  MD: "Moldova", ME: "Montenegro", MG: "Madagascar", MK: "North Macedonia",
  ML: "Mali", MM: "Myanmar", MN: "Mongolia", MR: "Mauritania",
  MT: "Malta", MU: "Mauritius", MW: "Malawi", MX: "Mexico",
  MY: "Malaysia", MZ: "Mozambique", NA: "Namibia", NE: "Niger",
  NG: "Nigeria", NI: "Nicaragua", NL: "Netherlands", NO: "Norway",
  NP: "Nepal", NZ: "New Zealand", OM: "Oman", PA: "Panama",
  PE: "Peru", PG: "Papua New Guinea", PH: "Philippines", PK: "Pakistan",
  PL: "Poland", PT: "Portugal", PY: "Paraguay", QA: "Qatar",
  RO: "Romania", RS: "Serbia", RU: "Russia", RW: "Rwanda",
  SA: "Saudi Arabia", SD: "Sudan", SE: "Sweden", SG: "Singapore",
  SI: "Slovenia", SK: "Slovakia", SL: "Sierra Leone", SN: "Senegal",
  SO: "Somalia", SR: "Suriname", SS: "South Sudan", SV: "El Salvador",
  SY: "Syria", SZ: "Eswatini", TD: "Chad", TG: "Togo",
  TH: "Thailand", TJ: "Tajikistan", TM: "Turkmenistan", TN: "Tunisia",
  TR: "Türkiye", TT: "Trinidad & Tobago", TW: "Taiwan", TZ: "Tanzania",
  UA: "Ukraine", UG: "Uganda", US: "United States", UY: "Uruguay",
  UZ: "Uzbekistan", VE: "Venezuela", VN: "Vietnam", YE: "Yemen",
  ZA: "South Africa", ZM: "Zambia", ZW: "Zimbabwe",
};

/** Friendly country name for an ISO alpha-2 code; raw code if unknown, "" if blank. */
export function countryName(cc: string | null | undefined): string {
  if (!cc) return "";
  return COUNTRY_NAMES[cc.toUpperCase()] ?? cc;
}
