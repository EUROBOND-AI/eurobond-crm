import { Pill } from "../components/ui.jsx";

const pill = (v) => <Pill status={v} />;
const link = (v) => <span className="link">{v}</span>;
const money = (v) => (v != null && v !== "" ? "₹" + Number(v).toLocaleString("en-IN") : "—");
const attach = (v) => v
  ? (String(v).match(/\.pdf$/i)
      ? <a href={v} target="_blank" rel="noreferrer" className="link">📄 PDF</a>
      : <a href={v} target="_blank" rel="noreferrer"><img src={v} alt="doc" style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 6, border: "1px solid #dfe4f0" }} /></a>)
  : "—";

/* Every module here is read by BOTH the admin panel (ModulePage) and, where appFields exist,
   by the field app. idPrefix auto-generates ids like ENQ-0001 on create. */

export const MODULES = {
  /* ===================== APP + BACKEND ===================== */

  enquiry: {
    path: "sfa/enquiry", title: "Enquiry List", crumb: "Enquiry", addLabel: "Add Enquiry",
    idPrefix: "ENQ", app: true, appLabel: "Enquiry",
    filters: ["createdBy", "leadSource", "city", "assignedTo"],
    tabs: [
      { key: "Review Pending", label: "Review Pending" }, { key: "Inprocess", label: "Inprocess" },
      { key: "Win", label: "Win" }, { key: "Close", label: "Close" },
    ],
    tabField: "status",
    columns: [
      { key: "id", label: "Enquiry Id", render: link }, { key: "createdAt", label: "Created At" },
      { key: "createdBy", label: "Created By" }, { key: "customer", label: "Customer / Party" },
      { key: "enquiryType", label: "Type" }, { key: "leadSource", label: "Lead Source" },
      { key: "assignedTo", label: "Assigned To", render: link }, { key: "product", label: "Product / Requirement" },
      { key: "firm", label: "Firm Name" }, { key: "city", label: "City" },
      { key: "pincode", label: "Pincode" }, { key: "priority", label: "Priority", render: pill },
      { key: "status", label: "Status", render: pill },
    ],
    form: [
      { name: "customer", label: "Customer / Party Name", required: true },
      { name: "enquiryType", label: "Enquiry Type", type: "select", options: ["Product", "Price", "Dealership", "Project", "Other"], required: true },
      { name: "leadSource", label: "Lead Source", type: "select", options: ["Direct Call", "IndiaMART", "Biltrax", "LinkedIn", "Website", "Reference", "Other"] },
      { name: "assignedTo", label: "Assign To (Sales Person)", type: "select", optionsSource: "users" },
      { name: "product", label: "Product / Requirement" },
      { name: "firm", label: "Firm Name" },
      { name: "city", label: "City" }, { name: "pincode", label: "Pincode" },
      { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"] },
      { name: "notes", label: "Notes", type: "textarea", full: true },
    ],
  },

  quotation: {
    path: "sfa/quotation", title: "Quotation List", crumb: "Quotation", addLabel: "Add Quotation",
    idPrefix: "QUOT", app: true, appLabel: "Quotation",
    tabs: [{ key: "Pending", label: "Pending" }, { key: "Win", label: "Win" }, { key: "Lost", label: "Lost" }],
    tabField: "status",
    columns: [
      { key: "id", label: "Quotation Id", render: link }, { key: "createdAt", label: "Created At" },
      { key: "createdBy", label: "Created By" }, { key: "customer", label: "Customer / Party" },
      { key: "product", label: "Product" }, { key: "quantity", label: "Qty" },
      { key: "rate", label: "Rate", render: money }, { key: "amount", label: "Total", render: money },
      { key: "validTill", label: "Valid Till" }, { key: "status", label: "Status", render: pill },
    ],
    form: [
      { name: "customer", label: "Customer / Party Name", required: true },
      { name: "product", label: "Product" },
      { name: "quantity", label: "Quantity", type: "number" },
      { name: "rate", label: "Rate (₹)", type: "number" },
      { name: "amount", label: "Total Amount (₹)", type: "number", required: true },
      { name: "validTill", label: "Valid Till", type: "date" },
      { name: "notes", label: "Notes", type: "textarea", full: true },
    ],
  },

  projectProjection: {
    path: "sfa/project-projection", title: "Project Projection", crumb: "Project Projection", addLabel: "Add Project",
    idPrefix: "PPJ", app: true, appLabel: "Project Projection",
    filters: ["createdBy", "city"],
    tabs: [
      { key: "Running", label: "Running" }, { key: "Hold", label: "Hold" },
      { key: "Win", label: "Win" }, { key: "Loss", label: "Loss" },
    ],
    tabField: "status",
    columns: [
      { key: "id", label: "Project Id", render: link }, { key: "createdAt", label: "Created At" },
      { key: "createdBy", label: "Sales Person" },
      { key: "name", label: "Project Name" }, { key: "firm", label: "Firm / Builder" },
      { key: "projectType", label: "Type" }, { key: "city", label: "City" },
      { key: "value", label: "Value", render: money },
      { key: "lastUpdate", label: "Last Monthly Update" },
      { key: "source", label: "Source", render: pill },
      { key: "status", label: "Status", render: pill },
    ],
    form: [
      { name: "name", label: "Project Name", required: true },
      { name: "firm", label: "Firm / Builder Name" },
      { name: "projectType", label: "Project Type", type: "select", options: ["Residential", "Commercial", "Institutional", "Industrial", "Other"] },
      { name: "city", label: "City" },
      { name: "value", label: "Approx Value (₹)", type: "number" },
      { name: "details", label: "Project Details", type: "textarea", full: true },
      { name: "specPerson", label: "Specification Help — tag spec person (optional)", type: "select", optionsSource: "specUsers" },
      { name: "specHelp", label: "What specification help is needed?", type: "textarea", full: true },
    ],
  },

  leave: {
    path: "sfa/leave", title: "Leave List", crumb: "Leave", addLabel: "Apply Leave",
    idPrefix: "LV", app: true, appLabel: "Leave", approveFlow: ["Approved", "Rejected"],
    tabs: [{ key: "Pending", label: "Pending" }, { key: "Approved", label: "Approved" }, { key: "Rejected", label: "Rejected" }],
    tabField: "status",
    columns: [
      { key: "createdBy", label: "Applied By" }, { key: "type", label: "Leave Type" },
      { key: "mode", label: "Mode" }, { key: "from", label: "From" }, { key: "to", label: "To" },
      { key: "reason", label: "Reason" }, { key: "photo", label: "Attachment", render: attach },
      { key: "approvedBy", label: "Approved By" }, { key: "status", label: "Status", render: pill },
    ],
    form: [
      { name: "type", label: "Leave Type", type: "select", options: ["Casual Leave", "Sick Leave", "Privilege Leave"], required: true },
      { name: "mode", label: "Mode", type: "select", options: ["Full Day", "Half Day"], required: true },
      { name: "from", label: "From Date", type: "date", required: true },
      { name: "to", label: "To Date", type: "date", required: true },
      { name: "reason", label: "Reason", type: "textarea", full: true },
    ],
  },

  expense: {
    path: "sfa/expense", title: "Expense List", crumb: "Expense", addLabel: "Add Expense",
    idPrefix: "EXP", app: true, appLabel: "Expense", approveFlow: ["Approved", "Reject", "Paid"],
    tabs: [
      { key: "Submitted", label: "Submitted" },
      { key: "Approved", label: "Approved" }, { key: "Reject", label: "Reject" }, { key: "Paid", label: "Paid" },
    ],
    tabField: "status",
    columns: [
      { key: "createdAt", label: "Created At" },
      { key: "createdBy", label: "Created By" }, { key: "type", label: "Type" },
      { key: "category", label: "Category" }, { key: "amount", label: "Amount", render: money },
      { key: "date", label: "Date" }, { key: "desc", label: "Description" },
      { key: "photo", label: "Attachment", render: attach },
      { key: "status", label: "Status", render: pill },
    ],
    form: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "type", label: "Expense Type", type: "select", options: ["Local", "Outstation", "ExStation", "Tour"], required: true },
      { name: "category", label: "Category", type: "select", options: ["Travel", "Food", "Fuel", "Stay", "Other"], required: true },
      { name: "amount", label: "Amount (₹)", type: "number", required: true },
      { name: "desc", label: "Description", type: "textarea", full: true },
    ],
  },

  task: {
    path: "sfa/task", title: "Task List", crumb: "Task", addLabel: "Add Task",
    idPrefix: "TSK", app: true, appLabel: "Task",
    tabs: [
      { key: "Pending", label: "Pending" }, { key: "In Progress", label: "In Progress" },
      { key: "Completed", label: "Completed" }, { key: "Close", label: "Close" }, { key: "Rejected", label: "Rejected" },
    ],
    tabField: "status",
    columns: [
      { key: "id", label: "Task Id", render: link }, { key: "createdAt", label: "Created At" },
      { key: "createdBy", label: "Created By" }, { key: "title", label: "Task Title" },
      { key: "assignee", label: "Assigned To", render: link }, { key: "due", label: "Due Date" },
      { key: "priority", label: "Priority", render: pill }, { key: "status", label: "Status", render: pill },
    ],
    form: [
      { name: "title", label: "Task Title", required: true },
      { name: "assignee", label: "Assign To", type: "select", optionsSource: "users", required: true },
      { name: "due", label: "Due Date", type: "date", required: true },
      { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"], required: true },
      { name: "desc", label: "Description", type: "textarea", full: true },
    ],
  },

  salesToSpec: {
    path: "sfa/sales-to-spec", title: "Sales to Spec", crumb: "Sales to Spec", addLabel: "Send to Spec",
    idPrefix: "S2S", app: true, appLabel: "Sales to Spec", isSpecThread: true,
    tabs: [{ key: "Pending", label: "Pending" }, { key: "Process", label: "Process" }, { key: "Work Done", label: "Work Done" }, { key: "Approved", label: "Approved" }, { key: "Rejected", label: "Rejected" }],
    tabField: "status", approveFlow: ["Approved", "Rejected"],
    columns: [
      { key: "id", label: "Id", render: link }, { key: "createdAt", label: "Created At" },
      { key: "createdBy", label: "Sales Person", render: link }, { key: "project", label: "Project / Site" },
      { key: "specPerson", label: "Tagged Spec Person", render: link },
      { key: "colourApproved", label: "Colour Approved" }, { key: "sqmApproved", label: "Sq Meter Approved" },
      { key: "help", label: "Help Needed" }, { key: "status", label: "Status", render: pill },
    ],
    form: [
      { name: "project", label: "Project / Site Name", required: true },
      { name: "specPerson", label: "Specification Person", type: "select", optionsSource: "users", required: true },
      { name: "colourApproved", label: "Colour Approved" },
      { name: "sqmApproved", label: "Sq Meter Approved" },
      { name: "help", label: "What specification help is needed?", type: "textarea", full: true, required: true },
    ],
  },

  specToSales: {
    path: "sfa/spec-to-sales", title: "Spec to Sales", crumb: "Spec to Sales", addLabel: "Send to Sales",
    idPrefix: "SP2S", app: true, appLabel: "Spec to Sales", isSpecThread: true,
    tabs: [{ key: "Pending", label: "Pending" }, { key: "Process", label: "Process" }, { key: "Work Done", label: "Work Done" }, { key: "Approved", label: "Approved" }, { key: "Rejected", label: "Rejected" }],
    tabField: "status", approveFlow: ["Approved", "Rejected"],
    columns: [
      { key: "id", label: "Id", render: link }, { key: "createdAt", label: "Created At" },
      { key: "createdBy", label: "Spec Person", render: link }, { key: "project", label: "Project / Site" },
      { key: "salesPerson", label: "Share To Sales Person", render: link },
      { key: "colourApproved", label: "Colour Approved" }, { key: "sqmApproved", label: "Sq Meter Approved" },
      { key: "help", label: "What sales person to do?" }, { key: "status", label: "Status", render: pill },
    ],
    form: [
      { name: "project", label: "Project / Site Name", required: true },
      { name: "salesPerson", label: "Share To Sales Person", type: "select", optionsSource: "users", required: true },
      { name: "colourApproved", label: "Colour Approved" },
      { name: "sqmApproved", label: "Sq Meter Approved" },
      { name: "help", label: "What sales person to do?", type: "textarea", full: true, required: true },
    ],
  },

  target: {
    path: "sfa/target", title: "Targets", crumb: "Target", addLabel: "Assign Target",
    app: false,
    tabs: [{ key: "Sales", label: "Sales Target" }, { key: "Specs", label: "Specs Target" }],
    tabField: "targetType",
    columns: [
      { key: "user", label: "Team Member", render: link }, { key: "targetType", label: "Type", render: pill },
      { key: "period", label: "Period" },
      { key: "target", label: "Target" }, { key: "achieved", label: "Achieved" },
      { key: "status", label: "Status", render: pill }, { key: "createdAt", label: "Created" },
    ],
    form: [
      { name: "user", label: "Team Member", type: "select", optionsSource: "users", required: true },
      { name: "targetType", label: "Target Type", type: "select", options: ["Sales", "Specs"], required: true },
      { name: "period", label: "Financial Year (e.g. 2026-27)", required: true },
      { name: "targetSqft", label: "Target Sq.Feet", type: "number", required: true },
      { name: "targetAmount", label: "Target Amount (₹) — Sales only", type: "number" },
      { name: "note", label: "Note", type: "textarea", full: true },
    ],
  },

  salesEntry: {
    path: "sfa/sales-entries", title: "Sales / Approval Entries", crumb: "Sales Entries", addLabel: "Add Entry",
    idPrefix: "SLE", app: false,
    filters: ["createdBy", "entryType"],
    tabs: [{ key: "Sales", label: "Sales Entries" }, { key: "Specs", label: "Approval Entries" }],
    tabField: "entryType",
    columns: [
      { key: "id", label: "Entry Id", render: link }, { key: "date", label: "Date" },
      { key: "createdBy", label: "Person" }, { key: "entryType", label: "Type", render: pill },
      { key: "project", label: "Project / Customer" },
      { key: "sqft", label: "Sq.Feet" }, { key: "amount", label: "Amount (₹)", render: money },
      { key: "invoice", label: "Invoice / Doc", render: (v) => v ? <a href={v} target="_blank" rel="noreferrer" className="link">View</a> : "—" },
      { key: "createdAt", label: "Added At" },
    ],
    form: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "project", label: "Project / Customer Name", required: true },
      { name: "sqft", label: "Sq.Feet", type: "number", required: true },
      { name: "amount", label: "Amount (₹)", type: "number" },
    ],
  },

  /* ===================== BACKEND ONLY ===================== */

  holidays: {
    path: "master/holidays", title: "Holiday List", crumb: "Holiday", addLabel: "Add Holiday",
    columns: [{ key: "date", label: "Date" }, { key: "name", label: "Holiday Name" }, { key: "type", label: "Type" }],
    filters: ["audienceType"],
    form: [
      { name: "date", label: "Date", type: "date", required: true },
      { name: "name", label: "Holiday Name", required: true },
      { name: "type", label: "Type", type: "select", options: ["National", "Regional", "Company"] },
      { name: "audienceType", label: "Send To (All / Zone / City / Users)", type: "select", options: ["All", "Zone", "City", "Users"], required: true },
      { name: "audienceValue", label: "Zone/City name or User names (comma separated)", placeholder: "e.g. North  |  Mumbai  |  Ramesh, Suresh" },
    ],
    notifyOnCreate: (d) => ({ title: "🎉 Holiday: " + d.name, message: `${d.date} — ${d.name} (${d.type || "Holiday"})`, link: "/app" }),
  },

  products: {
    path: "master/products", title: "Products List", crumb: "Products", addLabel: "Add Product",
    columns: [
      { key: "code", label: "Product Code" }, { key: "name", label: "Product Name" },
      { key: "series", label: "Series" }, { key: "category", label: "Category" },
      { key: "mrp", label: "MRP", render: money }, { key: "unit", label: "Unit" },
    ],
    form: [
      { name: "code", label: "Product Code" }, { name: "name", label: "Product Name", required: true },
      { name: "series", label: "Series" }, { name: "category", label: "Category" },
      { name: "mrp", label: "MRP (₹)", type: "number" }, { name: "unit", label: "Unit", type: "select", options: ["Sheet", "SqFt", "Nos", "Kg"] },
    ],
  },

  announcement: {
    path: "support/announcement", title: "Announcement List", crumb: "Announcement", addLabel: "Add Announcement",
    tabs: [{ key: "Published", label: "Published" }, { key: "Unpublished", label: "Unpublished" }],
    tabField: "status",
    columns: [
      { key: "title", label: "Title" }, { key: "desc", label: "Description" },
      { key: "createdAt", label: "Date" }, { key: "status", label: "Status", render: pill },
    ],
    form: [
      { name: "title", label: "Title", required: true },
      { name: "desc", label: "Description", type: "textarea", full: true, required: true },
      { name: "audienceType", label: "Send To (All / Zone / City / Users)", type: "select", options: ["All", "Zone", "City", "Users"], required: true },
      { name: "audienceValue", label: "Zone/City name or User names (comma separated)", placeholder: "e.g. North  |  Mumbai  |  Ramesh, Suresh" },
    ],
    notifyOnCreate: (d) => ({ title: "📢 " + d.title, message: d.desc || "", link: "/app/notifications" }),
  },

  tickets: {
    path: "support/tickets", title: "GK-IT Support", crumb: "GK-IT Support", addLabel: "Add Support Request",
    idPrefix: "TKT",
    tabs: [
      { key: "Pending", label: "Pending" }, { key: "Assigned", label: "Assigned" },
      { key: "Complete", label: "Complete" }, { key: "Close", label: "Close" },
    ],
    tabField: "status",
    columns: [
      { key: "id", label: "Ticket Id", render: link }, { key: "createdAt", label: "Created At" },
      { key: "createdBy", label: "Raised By" }, { key: "subject", label: "Subject" },
      { key: "priority", label: "Priority", render: pill }, { key: "status", label: "Status", render: pill },
    ],
    form: [
      { name: "subject", label: "Subject", required: true },
      { name: "priority", label: "Priority", type: "select", options: ["Low", "Medium", "High"] },
      { name: "desc", label: "Description", type: "textarea", full: true },
    ],
  },

  notification: {
    path: "support/notification", title: "Notifications", crumb: "Notification", addLabel: null, actions: false,
    columns: [
      { key: "createdAt", label: "Date" }, { key: "title", label: "Title" }, { key: "desc", label: "Message" },
    ],
    form: null,
  },
};
