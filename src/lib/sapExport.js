/* SAP Business One uploaders for approved expense statements.

   Two files:
     Header — one row per statement (all people together)
     Lines  — one file per person; one row per account code + cost centre

   All the fixed masters from Accounts live here, so a change in a code means
   editing one line in this file. */

/* ---------- masters ---------- */

/* depot -> document series */
export const SERIES = {
  ahmedabad: 766, ho: 761, hubballi: 778, ranchi: 773, dehradun: 769, zirakpur: 768,
  bhiwandi: 762, nagpur: 764, pune: 763, umargam: 765, indore: 779, delhi: 767,
  raipur: 775, lucknow: 776, kolkata: 771, patna: 772, jaipur: 777, bhubaneshwar: 774,
  guwahati: 770,
};

/* depot -> SAP location code */
export const LOCATION = {
  ahmedabad: 12, ho: 17, hubballi: 8, ranchi: 11, dehradun: 14, zirakpur: 13,
  bhiwandi: 10, nagpur: 10, pune: 10, umargam: 12, indore: 7, delhi: 1, raipur: 6,
  lucknow: 16, kolkata: 4, patna: 2, jaipur: 15, bhubaneshwar: 5, guwahati: 3,
};

/* the Customer ref number each depot starts from (editable in the Uploaders tab) */
export const NUMATCARD_START = {
  bhiwandi: 92, delhi: 55, ahmedabad: 40, raipur: 19, patna: 20, pune: 35, nagpur: 5,
  kolkata: 14, indore: 19, jaipur: 30, umargam: 25, hubballi: 43, bhubaneshwar: 8,
  zirakpur: 28, lucknow: 41, guwahati: 15, ho: 36, ranchi: 13, dehradun: 12,
};

/* app category -> SAP account */
export const ACCOUNTS = {
  "bike maintenance": ["ERA - BIKE EXPENSES", 570101006],
  "business promotion": ["ERA - BUSINESS PROMOTION EXPENSES", 570101009],
  "local transportation / taxi": ["ERA - CONVEYANCE", 570101001],
  "car rental": ["ERA - CONVEYANCE", 570101001],
  "damage & customer claim": ["ERA - DAMAGE & CUSTOMER CLAIM", 570101011],
  "hotel": ["ERA - HOTEL STAY EXPENSES", 570101008],
  "house rent": ["ERA - HOUSE RENT", 570101010],
  "car maintenance": ["ERA - MOTOR CAR EXPENSES", 570101007],
  "courier": ["ERA - POSTAGE & COURIER CHARGES", 570101005],
  "stationery": ["ERA - PRINTING & STATIONERY", 570101004],
  "food & meals": ["ERA - STAFF WELFARE EXPENSES", 570101003],
  "phone recharge": ["ERA - TELEPHONE EXPENSES", 570101012],
  "toll charges": ["ERA - TRAVELLING EXPENSES", 570101002],
  "fuel / petrol / diesel": ["ERA - TRAVELLING EXPENSES", 570101002],
  "relative stay": ["ERA - HOTEL STAY EXPENSES", 570101008],
  "miscellaneous": ["ERA - STAFF WELFARE EXPENSES", 570101003],
  "parking": ["ERA - TRAVELLING EXPENSES", 570101002],
  "flight": ["ERA - TRAVELLING EXPENSES", 570101002],
  "xerox / photocopy": ["ERA - PRINTING & STATIONERY", 570101004],
  "train": ["ERA - TRAVELLING EXPENSES", 570101002],
  "bus": ["ERA - TRAVELLING EXPENSES", 570101002],
};

/* travel cost centre by state; a few cities have their own */
export const OCR_BY_STATE = {
  "assam": "TRV-ASS", "bihar": "TRV-BR", "chhattisgarh": "TRV-CG", "chandigarh": "TRV-CH",
  "delhi": "TRV-DL", "gujarat": "TRV-Guj", "haryana": "TRV-HR1",
  "jammu and kashmir": "TRV-J&K", "jammu & kashmir": "TRV-J&K", "jharkhand": "TRV-JH",
  "west bengal": "TRV-WB", "kerala": "TRV-KR", "madhya pradesh": "TRV-MP",
  "maharashtra": "TRV-ROMG", "goa": "TRV-ROMG", "odisha": "TRV-OR", "orissa": "TRV-OR",
  "punjab": "TRV-PB", "karnataka": "TRV-ROK", "rajasthan": "TRV-Raj",
  "telangana": "TRV-T&AP", "andhra pradesh": "TRV-T&AP", "tamil nadu": "TRV-TN",
  "uttarakhand": "TRV-UK", "uttar pradesh": "TRV-WU",
};
export const OCR_BY_CITY = {
  "mumbai": "TRV-Mum", "thane": "TRV-Mum", "navi mumbai": "TRV-Mum", "bhiwandi": "TRV-Mum",
  "bengaluru": "TRV-BNG", "bangalore": "TRV-BNG",
  "noida": "TRV-Noi", "greater noida": "TRV-Noi",
  "kolkata": "TRV-KL1", "howrah": "TRV-KL1",
  "nagpur": "TRV-Vidh", "amravati": "TRV-Vidh", "akola": "TRV-Vidh", "wardha": "TRV-Vidh",
  "chandrapur": "TRV-Vidh", "yavatmal": "TRV-Vidh",
  "lucknow": "TRV-EU", "varanasi": "TRV-EU", "prayagraj": "TRV-EU", "gorakhpur": "TRV-EU", "kanpur": "TRV-EU",
};

/* fixed values */
export const FIXED = {
  gstType: "--", docType: "S", bplId: 6, currency: "INR", rate: 1,
  controlAccount: 220311001, taxCode: "NIL", wtLiable: "N",
};

/* ---------- helpers ---------- */

export const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
/* depot spellings seen in the data */
export const depoKey = (d) => {
  const k = norm(d);
  if (k === "umbergaon" || k === "umbargaon") return "umargam";
  if (k === "head office") return "ho";
  if (k === "bhubaneswar") return "bhubaneshwar";
  if (k === "hubli") return "hubballi";
  return k;
};
const catKey = (c) => {
  const k = norm(c);
  if (k === "local transporatation / taxi") return "local transportation / taxi";
  if (k === "toll chargers") return "toll charges";
  return k;
};
export const accountFor = (category) => ACCOUNTS[catKey(category)] || ["ERA - STAFF WELFARE EXPENSES", 570101003];

export const ymd = (d) => {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return "";
  return `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
};
const monthLabel = (iso) => {
  const x = new Date(iso);
  if (isNaN(x.getTime())) return "";
  return x.toLocaleDateString("en-GB", { month: "short" }) + "-" + String(x.getFullYear()).slice(2);
};

/* cost centre for one expense line: area from "Origin to Destination" -> state */
export function costingCode(item, areaState, fallbackState) {
  const area = String(item.desc || "").replace(/\s*\([ABC]\)\s*$/i, "").trim();
  const city = norm(area);
  if (OCR_BY_CITY[city]) return OCR_BY_CITY[city];
  const st = norm(areaState[city] || fallbackState || "");
  return OCR_BY_STATE[st] || "TRV-HO";
}

/* lines of one statement: approved amounts grouped by account + cost centre */
export function statementLines(r, areaState, userState) {
  const map = new Map();
  (r.items || []).forEach((it) => {
    if (it.rejected) return;
    const amt = Number(it.approvedAmount ?? it.amount) || 0;
    if (amt <= 0) return;
    const [accName, accCode] = accountFor(it.category);
    const ocr = costingCode(it, areaState, userState);
    const key = accCode + "|" + ocr;
    const cur = map.get(key) || { accName, accCode, ocr, total: 0 };
    cur.total += amt;
    map.set(key, cur);
  });
  return [...map.values()];
}

/* header row values for one statement */
export function headerRow(r, user, today, refNo) {
  const dk = depoKey(r.depo || user?.depo);
  const name = r.user || r.createdBy || user?.name || "";
  const period = r.periodTo || r.periodFrom || today;
  return [
    "",                                                     // DocNum — Accounts fill this
    SERIES[dk] ?? "",
    FIXED.gstType,
    FIXED.docType,
    FIXED.bplId,
    ymd(today),                                             // DocDate
    ymd(today),                                             // DocDueDate
    r.sentToAccountsAt ? ymd(r.sentToAccountsAt) : ymd(today), // TaxDate
    r.empCode || user?.code || "",
    refNo ?? r.sapRefNo ?? "",
    FIXED.currency,
    FIXED.rate,
    `Being Travel Expense booked of Mr ${name} for the month of ${monthLabel(period)}`,
    FIXED.controlAccount,
  ];
}

export const HEADER_COLS = [
  ["DocNum", "Series", "GSTTransactionType", "DocType", "BPL_IDAssignedToInvoice", "DocDate", "DocDueDate", "TaxDate", "CardCode", "NumAtCard", "DocCurrency", "DocRate", "Comments", "ControlAccount"],
  ["DocNum", "Series", "GSTTranTyp", "DocType", "BPLId", "DocDate", "DocDueDate", "TaxDate", "CustomerCode", "Customer ref number", "DocCur", "DocRate", "Comments", "CtlAccount"],
];
export const LINE_COLS = [
  ["ParentKey", "LineNum", "ItemDescription", "AccountCode", "LineTotal", "TaxCode", "LocationCode", "WTLiable", "Currency", "CostingCode"],
  ["DocNum", "LineNum", "Dscription", "AcctCode", "LineTotal", "TaxCode", "LocCode", "WtLiable", "Currency", "OcrCode"],
];

export function lineRows(r, areaState, userState) {
  const loc = LOCATION[depoKey(r.depo)] ?? "";
  return statementLines(r, areaState, userState).map((l, i) => [
    "",                     // ParentKey — Accounts fill the DocNum
    i,
    l.accName,
    l.accCode,
    Math.round(l.total * 100) / 100,
    FIXED.taxCode,
    loc,
    FIXED.wtLiable,
    FIXED.currency,
    l.ocr,
  ]);
}

/* write an .xlsx with SAP's two header rows */
export async function downloadSheet(filename, cols, rows) {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([cols[0], cols[1], ...rows]);
  ws["!cols"] = cols[0].map((h) => ({ wch: Math.max(10, String(h).length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, filename);
}
