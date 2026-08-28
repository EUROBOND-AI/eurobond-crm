// ---------------- Eurobond CRM mock data ----------------
export const CURRENT_ADMIN = { name: "Eurobond Sfa Admin", role: "System Admin" };
export const CURRENT_FIELD_USER = {
  name: "Santosh Mane", code: "EMP01", role: "SALES-EXECUTIVE",
  phone: "8657493391", email: "santosh.mane@eurobondacp.com",
  city: "Faridabad, Haryana - 121001", manager: "Piyush", weeklyOff: "Sunday", beat: "beat1",
};

export const USERS = [
  { zone: "West", name: "Arvind Kumar Prajapati", mobile: "8828238393", email: "arvind@eurobondacp.com", code: "2256", designation: "SALES-EXECUTIVE", manager: "Girish Virendra Varma (2054)", city: "Pune Moffusil", status: true },
  { zone: "North", name: "Santosh Maane", mobile: "8657493391", email: "--", code: "EURO124", designation: "Sr. Regional Sales Manager", manager: "Ajay Singh (EMP-01)", city: "Faridabad", status: true },
  { zone: "West", name: "Pakshal Jain", mobile: "8655354435", email: "pakshal.jain@eurobondacp.com", code: "2591", designation: "SALES-EXECUTIVE", manager: "Santosh mane (EMP01)", city: "Mumbai City North West", status: true },
  { zone: "North", name: "Prashant", mobile: "8744050925", email: "mitesh@eurobondacp.com", code: "EMP0001", designation: "SALES-EXECUTIVE", manager: "piyush (EMP287)", city: "Faridabad", status: true },
  { zone: "North", name: "Mohini", mobile: "8655693716", email: "mohini@eurobondacp.com", code: "2613", designation: "Brand Specification Executive", manager: "Ajay Singh (EMP-01)", city: "Delhi", status: true },
  { zone: "North", name: "Komal Badaliya", mobile: "8657493387", email: "komal.badaliya@eurobondacp.com", code: "2556", designation: "Brand Specification Executive", manager: "Ajay Singh (EMP-01)", city: "Delhi", status: true },
  { zone: "South", name: "Jananam Sai Pradeep", mobile: "8657553288", email: "saipradeep@eurobondacp.com", code: "2438", designation: "Brand Specification Manager", manager: "Ajay Singh (EMP-01)", city: "Hyderabad", status: true },
  { zone: "South", name: "Mohan Raju S", mobile: "8655972128", email: "mohan.raju@eurobondacp.com", code: "2584", designation: "Brand Specification Manager", manager: "Ajay Singh (EMP-01)", city: "Bengaluru", status: true },
  { zone: "South", name: "Yedu Krishna", mobile: "9987944580", email: "yedukrishna@eurobondacp.com", code: "2413", designation: "Brand Specification Manager", manager: "Ajay Singh (EMP-01)", city: "Kochi", status: true },
  { zone: "East", name: "Saurav Gupta", mobile: "9876543210", email: "saurav@eurobondacp.com", code: "2048", designation: "Sr. Area Sales Manager", manager: "Ajay Singh (EMP-01)", city: "Kolkata", status: true },
];

export const ATTENDANCE_MONTH = [
  { state: "Gujarat", manager: "Ajay Singh", name: "Mayursinh Vaghela", code: "2004", total: 30, present: 0, absent: 26, weeklyOff: 4 },
  { state: "Gujarat", manager: "Ajay Singh", name: "Kalpesh Mehta", code: "2009", total: 30, present: 0, absent: 26, weeklyOff: 4 },
  { state: "Rajasthan", manager: "Ajay Singh", name: "Ashish Kumar Tripathi", code: "2013", total: 30, present: 0, absent: 26, weeklyOff: 4 },
  { state: "Madhya Pradesh", manager: "Ajay Singh", name: "Rahul Kumar Tiwari", code: "2023", total: 30, present: 0, absent: 26, weeklyOff: 4 },
  { state: "Telangana & AP", manager: "Ajay Singh", name: "K.Kamlakkar Prasad", code: "2024", total: 30, present: 0, absent: 26, weeklyOff: 4 },
  { state: "Telangana & AP", manager: "Ajay Singh", name: "Mahipal Bale", code: "2030", total: 30, present: 0, absent: 26, weeklyOff: 4 },
  { state: "Vidharbha", manager: "Ajay Singh", name: "Saurav Gupta", code: "2048", total: 30, present: 0, absent: 26, weeklyOff: 4 },
  { state: "Mumbai", manager: "Ajay Singh", name: "Jitendra Parulekar", code: "2051", total: 30, present: 0, absent: 26, weeklyOff: 4 },
  { state: "Kerala", manager: "Ajay Singh", name: "Ranjith P M", code: "2060", total: 30, present: 0, absent: 26, weeklyOff: 4 },
];

export const DISTRIBUTORS = [
  { createdAt: "23 Dec 2025", company: "KINGS DECOR", customer: "RAJAT WALIYA", mobile: "6357300007", account: "CHL-102", country: "India", state: "Gujarat" },
  { createdAt: "23 Dec 2025", company: "FOREMAN REPARING WORKS", customer: "SUDESH DHIMAN", mobile: "9992016660", account: "CHL-101", country: "India", state: "Haryana" },
  { createdAt: "23 Dec 2025", company: "STAR STEEL INDUSTRIES", customer: "AMIT SAINI", mobile: "9813131018", account: "CHL-100", country: "India", state: "Haryana" },
  { createdAt: "23 Dec 2025", company: "SUNRISE METAL CO", customer: "Rahul Singh", mobile: "9991100887", account: "CHL-99", country: "India", state: "Punjab" },
  { createdAt: "23 Dec 2025", company: "CREATIVE FABRICATION SOLUTIONS", customer: "RAVINDER SINGH", mobile: "9206884000", account: "CHL-98", country: "India", state: "Delhi" },
  { createdAt: "23 Dec 2025", company: "UNIVERSAL ALUMINIUM EMPORIUM", customer: "VEERAT GARG", mobile: "9811133325", account: "CHL-97", country: "India", state: "Delhi" },
  { createdAt: "23 Dec 2025", company: "LAXMI TRADERS", customer: "MR. BIRENDRA VERMA JI", mobile: "8979463291", account: "CHL-96", country: "India", state: "UP" },
  { createdAt: "23 Dec 2025", company: "SHRI SAI ENTERPRISES", customer: "Mr. Gaurav Gupta", mobile: "9890887395", account: "CHL-95", country: "India", state: "Maharashtra" },
  { createdAt: "23 Dec 2025", company: "NEW DUTTA HARDWARE SALES CORP", customer: "MR. INDERJIT DUTTA", mobile: "9233371592", account: "CHL-94", country: "India", state: "West Bengal" },
];

export const DEALERS = [
  { createdAt: "12 Jan 2026", company: "SHREE BALAJI PLY & BOARDS", customer: "Manoj Agarwal", mobile: "9822011223", account: "DLR-58", state: "Maharashtra" },
  { createdAt: "10 Jan 2026", company: "OM SAI HARDWARE", customer: "Kiran Patil", mobile: "9899456712", account: "DLR-57", state: "Maharashtra" },
  { createdAt: "8 Jan 2026", company: "MODERN INTERIORS", customer: "Bubul Kalita", mobile: "9127299521", account: "DLR-56", state: "Assam" },
  { createdAt: "5 Jan 2026", company: "GAUR TRADERS", customer: "Ayush Bansal", mobile: "9999426658", account: "DLR-55", state: "Delhi" },
  { createdAt: "2 Jan 2026", company: "BPTP BUILDWELL", customer: "Prashant", mobile: "8569487348", account: "DLR-54", state: "Haryana" },
];

export const INFLUENCERS = [
  { contact: "9227897855", createdAt: "4 Apr 2026", name: "Sandeep Sinha", category: "End User", selfCompany: "Waaree Energies Limited", company: "Self", createdBy: "Yatinkumar Rameshchandra Lad" },
  { contact: "9558813033", createdAt: "3 Apr 2026", name: "Yagnesh Prajapati", category: "Febricator", selfCompany: "Smart Elevation & Fabrication", company: "Self", createdBy: "Yatinkumar Rameshchandra Lad" },
  { contact: "9510050112", createdAt: "31 Mar 2026", name: "Mukesh", category: "Contractor", selfCompany: "Silvassa Smart Panchayat Market", company: "Self", createdBy: "Yatinkumar Rameshchandra Lad" },
  { contact: "9999426658", createdAt: "10 Mar 2026", name: "Ayush Bansal", category: "Contractor", selfCompany: "Saraswati Wood & Ply Co.", company: "GAUR", createdBy: "Mitesh Sharma" },
  { contact: "913956437", createdAt: "10 Mar 2026", name: "Shaurya Agarwal", category: "Builder", selfCompany: "Mangalam Developers", company: "Self", createdBy: "Santosh mane" },
  { contact: "8569487348", createdAt: "9 Mar 2026", name: "Prashant", category: "Architect", selfCompany: "", company: "BPTP", createdBy: "Mitesh Sharma" },
];

export const TASKS = [
  { id: "TASK-6", createdBy: "Eurobond SFA Admin", due: "28 Mar 2026", assignee: "Mitesh Sharma", title: "payment collection", desc: "please complete this as soon as possible", priority: "medium", source: "web", status: "Pending" },
  { id: "TASK-7", createdBy: "Eurobond SFA Admin", due: "28 Mar 2026", assignee: "Mitesh Sharma", title: "payment collection", desc: "please complete this as soon as possible", priority: "medium", source: "web", status: "Pending" },
  { id: "TASK-5", createdBy: "Eurobond SFA Admin", due: "28 Mar 2026", assignee: "Ajay Singh", title: "payment collection", desc: "please complete this as soon as possible", priority: "medium", source: "web", status: "Pending" },
  { id: "TASK-1", createdBy: "Eurobond SFA Admin", due: "20 Mar 2026", assignee: "Ajay Singh", title: "payment collection", desc: "testing", priority: "high", source: "web", status: "Pending" },
  { id: "TASK-2", createdBy: "Eurobond SFA Admin", due: "20 Mar 2026", assignee: "Mitesh Sharma", title: "payment collection", desc: "testing", priority: "high", source: "web", status: "Pending" },
  { id: "TASK-4", createdBy: "Eurobond SFA Admin", due: "20 Mar 2026", assignee: "Santosh Maane", title: "payment collection", desc: "testing", priority: "high", source: "web", status: "Pending" },
  { id: "TASK-3", createdBy: "Eurobond SFA Admin", due: "18 Mar 2026", assignee: "Prashant", title: "site visit report", desc: "closed after verification", priority: "low", source: "web", status: "Close" },
];

export const ENQUIRIES = [
  { createdAt: "14 Mar 2026, 12:29 PM", createdBy: "Test User", id: "ENQ-44", type: "Lead", company: "Rotash Enterprises", contact: "Mukesh", mobile: "6825545164", state: "Haryana", source: "web", status: "Inprocess" },
  { createdAt: "25 Feb 2026, 03:11 PM", createdBy: "Mitesh Sharma", id: "ENQ-43", type: "--", company: "BPTP", contact: "Test", mobile: "98978667888", state: "California", source: "--", status: "Inprocess" },
  { createdAt: "23 Feb 2026, 06:04 PM", createdBy: "piyush", id: "ENQ-42", type: "--", company: "L&T", contact: "Mitesh", mobile: "96382285269", state: "Haryana", source: "--", status: "Inprocess" },
  { createdAt: "23 Feb 2026, 05:44 PM", createdBy: "piyush", id: "ENQ-41", type: "--", company: "GK Enterprises", contact: "--", mobile: "9669852123", state: "Haryana", source: "--", status: "Inprocess" },
  { createdAt: "23 Feb 2026, 05:20 PM", createdBy: "piyush", id: "ENQ-40", type: "--", company: "L&T", contact: "Piyush", mobile: "6589638521", state: "Haryana", source: "--", status: "Inprocess" },
  { createdAt: "23 Feb 2026, 05:00 PM", createdBy: "Mitesh Sharma", id: "ENQ-39", type: "--", company: "L&T", contact: "Mitesh", mobile: "8528523696", state: "Haryana", source: "--", status: "Inprocess" },
];

export const FOLLOWUPS = [
  { createdAt: "27 Mar 2026, 11:15 AM", createdBy: "Prashant", category: "Customer", party: "L&T / Test Ajay Contractor", mobile: "9565656653", type: "Meeting", date: "31 Mar 2026 12:15 AM", status: "Pending", assignTo: "Prashant" },
  { createdAt: "23 Feb 2026, 06:06 PM", createdBy: "piyush", category: "Enquiry", party: "Mitesh", mobile: "96382285269", type: "Call", date: "23 Feb 2026 6:05 PM", status: "Pending", assignTo: "piyush" },
  { createdAt: "18 Feb 2026, 03:15 PM", createdBy: "piyush", category: "Enquiry", party: "Test Contact", mobile: "7887755454", type: "Meeting", date: "18 Feb 2026 5:00 PM", status: "Pending", assignTo: "Mitesh Sharma" },
  { createdAt: "17 Feb 2026, 12:53 PM", createdBy: "Pakshal Jain", category: "Enquiry", party: "//", mobile: "--", type: "Call", date: "18 Feb 2026 4:12 PM", status: "Pending", assignTo: "Pakshal Jain" },
  { createdAt: "9 Feb 2026, 04:43 PM", createdBy: "Mitesh Sharma", category: "Enquiry", party: "//", mobile: "--", type: "Meeting", date: "11 Feb 2026 4:00 PM", status: "Pending", assignTo: "Mitesh Sharma" },
  { createdAt: "9 Feb 2026, 02:45 PM", createdBy: "Mitesh Sharma", category: "Enquiry", party: "//", mobile: "--", type: "Meeting", date: "10 Feb 2026 3:00 PM", status: "Pending", assignTo: "Mitesh Sharma" },
];

export const QUOTATIONS = [
  { createdAt: "3 Apr 2026, 01:45 PM", createdBy: "Yatinkumar Rameshchandra Lad", quoteId: "---", type: "Customer", custType: "Project Influencer", detail: "Self / Yagnesh Prajapati / 9558813033", qty: 2, items: 2, amount: "₹237.18", status: "Pending" },
  { createdAt: "27 Mar 2026, 11:51 AM", createdBy: "Eurobond SFA Admin", quoteId: "EP/03/1/25-26", type: "Site", custType: "---", detail: "PRJ-5 / Surya mall", qty: 1, items: 1, amount: "₹11.8", status: "Pending" },
  { createdAt: "27 Mar 2026, 11:47 AM", createdBy: "Prashant", quoteId: "---", type: "Site", custType: "---", detail: "PRJ-2 / World street", qty: 2, items: 2, amount: "₹48.38", status: "Pending" },
  { createdAt: "24 Mar 2026, 11:17 AM", createdBy: "Eurobond SFA Admin", quoteId: "QUOT-20", type: "Customer", custType: "Distributor", detail: "KINGS DECOR / RAJAT WALIYA", qty: 1, items: 1, amount: "₹23.6", status: "Pending" },
  { createdAt: "23 Mar 2026, 04:26 PM", createdBy: "Santosh mane", quoteId: "QUOT-19", type: "Customer", custType: "Dealer", detail: "Self / Bubul Kalita / 9127299521", qty: 2, items: 2, amount: "₹500.32", status: "Win" },
  { createdAt: "17 Mar 2026, 03:52 PM", createdBy: "Eurobond SFA Admin", quoteId: "QUOT-18", type: "Site", custType: "---", detail: "PRJ-5 / Surya mall", qty: 2, items: 2, amount: "₹145.14", status: "Pending" },
];

export const PROJECTS = [
  { createdAt: "3 Apr 2026, 01:48 PM", createdBy: "Yatinkumar Rameshchandra Lad", id: "PRJ-8", type: "Healthcare", year: "2026", priority: "high", firm: "Self", name: "AMN Life Science Pvt Ltd", pincode: "396191", stage: "Initiation", status: "Inprocess" },
  { createdAt: "28 Mar 2026, 01:51 PM", createdBy: "Arvind Kumar Prajapati", id: "PRJ-7", type: "Industrial", year: "2026", priority: "low", firm: "L&T", name: "Euro bond", pincode: "411002", stage: "Planning", status: "Inprocess" },
  { createdAt: "27 Mar 2026, 11:33 AM", createdBy: "Prashant", id: "PRJ-6", type: "Infrastructure", year: "2026", priority: "high", firm: "BPTP", name: "Ashatha hospital", pincode: "121001", stage: "Monitoring", status: "Inprocess" },
  { createdAt: "10 Mar 2026, 03:19 PM", createdBy: "Mitesh Sharma", id: "PRJ-4", type: "Hospitality", year: "2026", priority: "high", firm: "BPTP", name: "Testing project", pincode: "121004", stage: "Execution", status: "Hold" },
  { createdAt: "10 Mar 2026, 02:32 PM", createdBy: "Santosh mane", id: "PRJ-3", type: "Hospitality", year: "2026", priority: "high", firm: "Self", name: "Vrindavan Hospital", pincode: "400092", stage: "Execution", status: "Win" },
  { createdAt: "23 Feb 2026, 06:09 PM", createdBy: "piyush", id: "SITE-9", type: "--", year: "--", priority: "medium", firm: "L&T", name: "--", pincode: "121001", stage: "Initiation", status: "Inprocess" },
];

export const OUTSTATION = [
  { createdAt: "1 Apr 2026, 07:55 AM", id: "TRV-10", mode: "Bus", purpose: "Customer Visit", status: "Pending", start: "1 Apr 2026", end: "2 Apr 2026", to: "Ahilya Nagar", budget: "5000", days: "2 Days", remark: "" },
  { createdAt: "27 Mar 2026, 12:12 PM", id: "TRV-9", mode: "Bus", purpose: "Sales Meet", status: "Pending", start: "28 Mar 2026", end: "31 Mar 2026", to: "Mumbai", budget: "0", days: "4 Days", remark: "Testing" },
  { createdAt: "24 Mar 2026, 10:56 AM", id: "TRV-8", mode: "Car", purpose: "Customer Visit", status: "Approved", start: "22 Mar 2026", end: "23 Mar 2026", to: "Reshu", budget: "--", days: "2 Days", remark: "" },
  { createdAt: "19 Feb 2026, 01:35 PM", id: "TRV-5", mode: "Car", purpose: "Project/Site Visit", status: "Pending", start: "26 Feb 2026", end: "28 Feb 2026", to: "--", budget: "5000", days: "3 Days", remark: "Project Visit" },
  { createdAt: "19 Feb 2026, 01:36 PM", id: "TRV-6", mode: "Bus", purpose: "Customer Visit", status: "Approved", start: "1 Feb 2026", end: "2 Feb 2026", to: "--", budget: "--", days: "2 Days", remark: "Test" },
  { createdAt: "18 Feb 2026, 01:42 PM", id: "TRV-3", mode: "Car", purpose: "Customer Visit", status: "Reject", start: "14 Feb 2026", end: "15 Feb 2026", to: "--", budget: "--", days: "2 Days", remark: "Late Travel" },
];

export const POP_GIFTS = [
  { createdAt: "23 Mar 2026, 05:03 PM", createdBy: "Eurobond SFA Admin", type: "Event Gift", item: "Laptop Bag B grade", code: "PROD-2", stock: "--", mrp: "--", desc: "ok" },
  { createdAt: "23 Mar 2026, 05:01 PM", createdBy: "Eurobond SFA Admin", type: "Event Gift", item: "Laptop Bag Black", code: "PROD-1", stock: "--", mrp: "--", desc: "OK" },
];

export const PRODUCTS = [
  { createdAt: "6 Feb 2026", brand: "EUROBOND", grade: '3MM DIAMOND MIDAS TOUCH SERIES FR CLASS "O"', name: '3MM DIAMOND MIDAS TOUCH SERIES FR CLASS "O"', code: 'ER 1056' },
  { createdAt: "6 Feb 2026", brand: "EUROBOND", grade: '6MM DIAMOND AHPL MIDAS TOUCH SERIES FR CLASS "O"', name: '6MM DIAMOND AHPL MIDAS TOUCH SERIES', code: "ER 1056" },
  { createdAt: "6 Feb 2026", brand: "EUROBOND", grade: '4MM DIAMOND MIDAS TOUCH SERIES FR CLASS "O"', name: '4MM DIAMOND MIDAS TOUCH SERIES FR CLASS "O"', code: "ER 1056" },
  { createdAt: "6 Feb 2026", brand: "EUROBOND", grade: "3MM DIAMOND MIDAS TOUCH SERIES FRA2", name: "3MM DIAMOND MIDAS TOUCH SERIES FRA2", code: "ER 1056" },
  { createdAt: "6 Feb 2026", brand: "EUROBOND", grade: "6MM DIAMOND MIDAS TOUCH SERIES FRA2", name: "6MM DIAMOND MIDAS TOUCH SERIES FRA2", code: "ER 1056" },
  { createdAt: "6 Feb 2026", brand: "EUROBOND", grade: "3MM PLATINIUM PLUS ZINC SERIES FR CLASS 'O'", name: "3MM PLATINIUM PLUS ZINC SERIES", code: "ZINC SERIES" },
  { createdAt: "6 Feb 2026", brand: "ARCHER", grade: "4MM ARCHER PREMIUM", name: "4MM ARCHER PREMIUM PANEL", code: "AR 2044" },
  { createdAt: "6 Feb 2026", brand: "EURAMAX", grade: "3MM EURAMAX GLOSS", name: "3MM EURAMAX GLOSS SERIES", code: "EX 3021" },
];

export const PINCODES = [
  { country: "India", state: "Telangana", district: "Rangareddy", city: "Secunderabad", pincode: "501501" },
  { country: "India", state: "Gujarat", district: "Junagadh", city: "Veraval Udyognagar", pincode: "362269" },
  { country: "India", state: "Gujarat", district: "Mahesana", city: "KADI", pincode: "382715" },
  { country: "India", state: "Telangana", district: "Mahabubabad", city: "Tellapur", pincode: "502034" },
  { country: "India", state: "Tamil Nadu", district: "Chennai", city: "Chennai", pincode: "600112" },
  { country: "India", state: "Jharkhand", district: "East Singhbum", city: "Jamshedpur", pincode: "831018" },
  { country: "India", state: "Andhra Pradesh", district: "Chittoor", city: "Tiruchanoor", pincode: "517503" },
  { country: "India", state: "Maharashtra", district: "Pune", city: "Aundh", pincode: "411070" },
  { country: "India", state: "Maharashtra", district: "Mumbai Suburban", city: "Borivali East", pincode: "400066" },
];

export const HOLIDAYS = [
  { date: "29 Jan 2026", day: "Thursday", type: "National", name: "sada", month: "January", year: "2026", region: "All States" },
  { date: "26 Jan 2026", day: "Monday", type: "National", name: "Republic Day", month: "January", year: "2026", region: "All States" },
  { date: "14 Mar 2026", day: "Saturday", type: "Festival", name: "Holi", month: "March", year: "2026", region: "All States" },
];

export const LEAVE_POLICIES = [
  { createdAt: "31 Jan 2026", createdBy: "Eurobond SFA Admin", user: "piyush", start: "1 Jan 2026", end: "28 Feb 2026", earned: 4, sick: 4 },
];

export const EXPENSE_POLICY = [
  { user: "Arvind Kumar Prajapati", carKm: 0, bikeKm: 0, exStation: 0, catA: 0, catB: 0, catC: 0, enabled: false },
  { user: "Santosh Maane", carKm: 0, bikeKm: 0, exStation: 0, catA: 0, catB: 0, catC: 0, enabled: false },
  { user: "Pakshal Jain", carKm: 0, bikeKm: 0, exStation: 0, catA: 0, catB: 0, catC: 0, enabled: false },
  { user: "Prashant", carKm: 10, bikeKm: 5, exStation: 1000, catA: 5000, catB: 6000, catC: 3500, enabled: true },
  { user: "Mohini", carKm: 0, bikeKm: 0, exStation: 0, catA: 0, catB: 0, catC: 0, enabled: false },
  { user: "Komal Badaliya", carKm: 0, bikeKm: 0, exStation: 0, catA: 0, catB: 0, catC: 0, enabled: false },
];

export const DISCOUNT_CATEGORIES = [
  { name: "EUROBOND", discount: 0 }, { name: "ARCHER", discount: 0 }, { name: "EURAMAX", discount: 0 },
  { name: "TechPro", discount: 0 }, { name: "EliteHome", discount: 0 }, { name: "PowerMax", discount: 0 }, { name: "UrbanFit", discount: 0 },
];

export const EXPENSES = [
  { createdAt: "27 Mar 2026", user: "Prashant", type: "Local", category: "Travel", amount: 450, status: "Pending", desc: "Client visit - Sector 21" },
  { createdAt: "24 Mar 2026", user: "Prashant", type: "Outstation", category: "Food", amount: 780, status: "Approved", desc: "Mumbai dealer meet" },
  { createdAt: "19 Feb 2026", user: "Santosh Maane", type: "Local", category: "Fuel", amount: 620, status: "Paid", desc: "Beat travel" },
  { createdAt: "12 Feb 2026", user: "Pakshal Jain", type: "Outstation", category: "Stay", amount: 2400, status: "Pending", desc: "Pune project visit" },
  { createdAt: "8 Feb 2026", user: "Mitesh Sharma", type: "Local", category: "Travel", amount: 343, status: "Rejected", desc: "Duplicate claim" },
];

export const EVENT_PLANS = [];

export const ANNOUNCEMENTS = [];

export const SUPPORT_TICKETS = [
  { createdAt: "12 Mar 2026", taskId: "SUP-4", createdBy: "Eurobond SFA Admin", priority: "High", type: "Bug", interface: "Web", detail: "Export not working in enquiry", status: "Complete" },
  { createdAt: "2 Mar 2026", taskId: "SUP-3", createdBy: "piyush", priority: "Medium", type: "Change Request", interface: "App", detail: "Need remark field in checkin", status: "Reject" },
];

export const NOTIFICATIONS = [
  { module: "Site-Project", text: "@Ajay Singh need quotation document", time: "3/17/26, 3:43 PM", tag: "Tagged Others", read: false },
  { module: "Site-Project", text: "@Piyush pls approve this", time: "3/10/26, 5:45 PM", tag: "Tagged Others", read: false },
];

export const YOY_ROWS = [
  { m: "APR", prev: "--", cur: "--", g: "--", gp: "--" }, { m: "MAY", prev: "--", cur: "--", g: "--", gp: "--" },
  { m: "JUN", prev: "--", cur: "--", g: "--", gp: "--" }, { m: "JUL", prev: "--", cur: "--", g: "--", gp: "--" },
  { m: "AUG", prev: "--", cur: "--", g: "--", gp: "--" }, { m: "SEP", prev: "--", cur: "--", g: "--", gp: "--" },
  { m: "OCT", prev: "--", cur: "--", g: "--", gp: "--" }, { m: "NOV", prev: "--", cur: "--", g: "--", gp: "--" },
  { m: "DEC", prev: "2,400", cur: "--", g: "-2,400", gp: "↓100.0%" }, { m: "JAN", prev: "--", cur: "0", g: "0", gp: "↑0.0%" },
  { m: "FEB", prev: "--", cur: "4,900", g: "+4,900", gp: "↑100.0%" }, { m: "MAR", prev: "--", cur: "0", g: "0", gp: "↑0.0%" },
];

export const EXPENSE_TREND = [
  { m: "APR", v: 0 }, { m: "MAY", v: 0 }, { m: "JUN", v: 0 }, { m: "JUL", v: 0 }, { m: "AUG", v: 0 },
  { m: "SEP", v: 0 }, { m: "OCT", v: 0 }, { m: "NOV", v: 0 }, { m: "DEC", v: 2400 }, { m: "JAN", v: 300 },
  { m: "FEB", v: 4900 }, { m: "MAR", v: 200 },
];
