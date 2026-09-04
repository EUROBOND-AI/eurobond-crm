import logoImg from "../assets/logo.jpg";

/* category -> Excel statement column */
export const CAT_COL = {
  "Flight": "tickets", "Train": "tickets", "Bus": "tickets",
  "Hotel": "hotel", "Relative Stay": "hotel",
  "Food & Meals": "fooding",
  "Local Transportation / Taxi": "local", "Car Rental": "local", "Fuel / Petrol / Diesel": "local", "Car Maintenance": "local", "Parking": "local", "Toll Charges": "local",
  "Stationery": "phone", "Xerox / Photocopy": "phone", "Phone Recharge": "phone",
  "Miscellaneous": "miscl",
};

async function urlToDataUrl(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve) => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.onerror = () => resolve(null); r.readAsDataURL(blob); });
  } catch { return null; }
}

/* Build the expense statement PDF — compact company format + Eurobond logo + bill pages */
export async function buildExpensePdf(fmt, formatOnly = false) {
  const { jsPDF } = await import("jspdf");
  const items = fmt.items || [];
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210, pageH = 297;
  const mL = 12, mR = 198;

  try { const logo = await urlToDataUrl(logoImg); if (logo) pdf.addImage(logo, "JPEG", mL, 8, 32, 12); } catch {}

  pdf.setFontSize(14); pdf.setFont(undefined, "bold");
  pdf.text("EURO PANEL PRODUCTS LIMITED", pageW / 2, 13, { align: "center" });
  pdf.setFontSize(10.5); pdf.text("EXPENSE STATEMENT", pageW / 2, 19, { align: "center" });

  pdf.setFontSize(8.5); pdf.setFont(undefined, "normal");
  let y = 28;
  pdf.text(`NAME : ${fmt.user || ""}`, mL, y);
  pdf.text(`DATE : ${fmt.createdAt || ""}`, 140, y);
  y += 5;
  pdf.text(`PERIOD : ${fmt.periodFrom || ""} TO ${fmt.periodTo || ""}`, mL, y);
  pdf.text(`GRADE : ${fmt.grade || "-"}`, 140, y);
  y += 5;
  pdf.text(`DESIGNATION : ${fmt.designation || "-"}`, mL, y);
  pdf.text(`LOCATION : ${fmt.location || "-"}`, 140, y);
  y += 5;

  /* compact columns */
  const cols = [
    { k: "sr", t: "SI No", w: 12, align: "center" },
    { k: "date", t: "Date", w: 22, align: "center" },
    { k: "station", t: "Ex/Out-station", w: 26, align: "center" },
    { k: "orig", t: "Origin to Destination", w: 44, align: "left" },
    { k: "category", t: "Category", w: 38, align: "left" },
    { k: "amount", t: "Amount", w: 22, align: "right" },
    { k: "total", t: "Total", w: 22, align: "right" },
  ];
  const rowH = 7, headH = 9;
  const totalW = cols.reduce((s, c) => s + c.w, 0);
  const startX = (pageW - totalW) / 2;   // center the table on the page
  const drawRow = (yy, hh) => { let x = startX; pdf.rect(x, yy, totalW, hh); cols.forEach((c) => { pdf.line(x, yy, x, yy + hh); x += c.w; }); pdf.line(x, yy, x, yy + hh); };
  const drawHeader = () => {
    pdf.setFont(undefined, "bold"); pdf.setFontSize(7.5);
    drawRow(y, headH);
    let x = startX;
    cols.forEach((c) => { pdf.text(pdf.splitTextToSize(c.t, c.w - 2), x + c.w / 2, y + 5.5, { align: "center" }); x += c.w; });
    y += headH;
  };
  drawHeader();

  pdf.setFont(undefined, "normal"); pdf.setFontSize(8);
  const grand = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  items.forEach((it, i) => {
    if (y > pageH - 40) { pdf.addPage(); y = 16; drawHeader(); pdf.setFont(undefined, "normal"); pdf.setFontSize(8); }
    const amt = Number(it.amount) || 0;
    const cell = { sr: String(i + 1), date: it.date || "", station: it.station || "", orig: it.desc || "", category: it.category || "", amount: amt.toLocaleString("en-IN"), total: amt.toLocaleString("en-IN") };
    drawRow(y, rowH);
    let cx = startX;
    cols.forEach((c) => {
      const val = String(cell[c.k] || "");
      const lines = pdf.splitTextToSize(val, c.w - 3);
      const tx = c.align === "right" ? cx + c.w - 1.5 : c.align === "center" ? cx + c.w / 2 : cx + 1.5;
      pdf.text(lines, tx, y + 4.8, { align: c.align });
      cx += c.w;
    });
    y += rowH;
  });

  /* TOTAL row (clearly visible, aligned to table) */
  pdf.setFont(undefined, "bold"); pdf.setFontSize(9);
  drawRow(y, rowH + 1);
  pdf.text("TOTAL", startX + 2, y + 5);
  pdf.text("Rs. " + grand.toLocaleString("en-IN"), startX + totalW - 1.5, y + 5, { align: "right" });
  y += rowH + 1 + 12;

  pdf.setFont(undefined, "normal"); pdf.setFontSize(8.5);
  pdf.text("Checked By", mL, y);
  pdf.text("Traveller Signature : " + (fmt.user || ""), 78, y);
  pdf.text("Approved By", 165, y);

  /* bill pages (skipped when formatOnly = true) */
  for (const it of (formatOnly ? [] : items)) {
    if (it.photo && !String(it.photo).match(/\.pdf$/i)) {
      try {
        pdf.addPage();
        pdf.setFontSize(10); pdf.setFont(undefined, "bold");
        pdf.text(`Bill: ${it.category} — Rs. ${(Number(it.amount) || 0).toLocaleString("en-IN")} (${it.date})`, 14, 14);
        const imgData = await urlToDataUrl(it.photo);
        if (imgData) pdf.addImage(imgData, "JPEG", 14, 20, 180, 0);
      } catch {}
    }
  }
  pdf.save(`Expense-${(fmt.user || "statement").replace(/\s+/g, "-")}-${fmt.periodTo || ""}.pdf`);
}
