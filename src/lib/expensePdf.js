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
  pdf.text(`NAME : ${fmt.user || ""}   |   EMP CODE : ${fmt.empCode || fmt.code || "-"}`, mL, y);
  pdf.text(`DATE : ${fmt.createdAt || ""}`, 140, y);
  y += 5;
  pdf.text(`PERIOD : ${fmt.periodFrom || ""} TO ${fmt.periodTo || ""}`, mL, y);
  pdf.text(`GRADE : ${fmt.grade || "-"}`, 140, y);
  y += 5;
  pdf.text(`DESIGNATION : ${fmt.designation || "-"}`, mL, y);
  pdf.text(`DEPO : ${fmt.depo || "-"}`, 140, y);
  y += 5;

  /* compact columns */
  const cols = [
    { k: "sr", t: "SI No", w: 12, align: "center" },
    { k: "date", t: "Date", w: 22, align: "center" },
    { k: "station", t: "Ex/Out-station", w: 26, align: "center" },
    { k: "orig", t: "Origin to Destination", w: 32, align: "left" },
    { k: "descr", t: "Description", w: 28, align: "left" },
    { k: "km", t: "KM", w: 12, align: "center" },
    { k: "category", t: "Category", w: 26, align: "left" },
    { k: "amount", t: "Amount", w: 20, align: "right" },
    { k: "appr", t: "Approved Amount", w: 24, align: "right" },
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
  /* the figure that matters after approval is the approved total */
  const grandApproved = items.reduce((s, it) => s + Number(
    it.approvedAmount !== undefined && it.approvedAmount !== null && it.approvedAmount !== "" ? it.approvedAmount : (it.amount || 0)
  ), 0);
  items.forEach((it, i) => {
    if (y > pageH - 40) { pdf.addPage(); y = 16; drawHeader(); pdf.setFont(undefined, "normal"); pdf.setFontSize(8); }
    const amt = Number(it.amount) || 0;
    const cell = { sr: String(i + 1), date: it.date || "", station: it.station || "", orig: it.desc || "", km: it.km || it.kilometers || it.distance || "", descr: it.description || "", category: it.category || "", amount: amt.toLocaleString("en-IN"),
      appr: (it.approvedAmount !== undefined && it.approvedAmount !== null && it.approvedAmount !== ""
        ? Number(it.approvedAmount) : amt).toLocaleString("en-IN") };
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
  /* claimed total sits above the Amount column, approved total under its own column */
  const apprW = (cols.find((c) => c.k === "appr") || { w: 0 }).w;
  pdf.text("Rs. " + grand.toLocaleString("en-IN"), startX + totalW - apprW - 1.5, y + 5, { align: "right" });
  pdf.text("Rs. " + grandApproved.toLocaleString("en-IN"), startX + totalW - 1.5, y + 5, { align: "right" });
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
  const fileName = `Expense-${(fmt.user || "statement").replace(/\s+/g, "-")}-${fmt.periodTo || ""}.pdf`;

  /* On the phone pdf.save() does nothing (the Android WebView has no download
     manager), so write the file and hand it to the system so it can be opened
     or saved from the share sheet. On the web the normal download is used. */
  const Cap = typeof window !== "undefined" ? window.Capacitor : null;
  const isNative = Cap && typeof Cap.isNativePlatform === "function" && Cap.isNativePlatform();
  if (isNative) {
    try {
      const base64 = pdf.output("datauristring").split(",")[1];
      const P = Cap.Plugins || {};
      if (P.Filesystem && P.Filesystem.writeFile) {
        const res = await P.Filesystem.writeFile({
          path: fileName, data: base64, directory: "CACHE", recursive: true,
        });
        const uri = (res && res.uri) || "";
        if (uri && P.Share && P.Share.share) {
          await P.Share.share({ title: fileName, url: uri, dialogTitle: "Open or save the PDF" });
          return;
        }
      }
      /* last resort — open the data URI in the system browser */
      if (P.Browser && P.Browser.open) { await P.Browser.open({ url: pdf.output("datauristring") }); return; }
      window.open(pdf.output("bloburl"), "_blank");
      return;
    } catch (e) {
      alert("Could not open the PDF: " + (e && e.message ? e.message : e));
      return;
    }
  }
  pdf.save(fileName);
}
