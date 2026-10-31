export const auth = { user: { name: "Ravi Kumar", role: "Sales", id: 2 } };
const db = { enquiry: { 1: { status: "Assigned", company: "ABC Builders", remarks: [{ remark: "old" }], chat: [1] } } };
window.__calls = [];
let step = 0;
export const api = {
  aiChat: async (messages) => {
    window.__calls.push(["aiChat", messages.length]);
    step++;
    if (step === 1) return { reply: "**Ready**:\n* Enquiry ABC Builders\n* Next Visit 2026-11-04", action: { type: "update", module: "enquiry", id: 1, title: "Enquiry remark",
      set: { lastRemark: "called", nextFollowDate: "2026-11-04", __statusUnless: { value: "Processing", keep: ["win", "spam"] } }, push: { remarks: { remark: "called" } },
      reminder: { title: "ABC Builders", date: "2026-11-04", time: "11:00", note: "called", kind: "Visit" }, preview: [["Enquiry", "ABC Builders (#1)"], ["Remark", "called"], ["Next Visit", "2026-11-04 11:00"], ["Empty", ""]] } };
    return { reply: "Task ready", action: { type: "create", module: "task", title: "New task", fields: { title: "Visit" }, notify: [{ to: "Suresh Rao", title: "New task assigned" }], preview: [["Task", "Visit"]] } };
  },
  get: async (m, id) => ({ record: { data: JSON.parse(JSON.stringify(db[m][id])) } }),
  update: async (m, id, data) => { window.__calls.push(["update", m, id, data]); db[m][id] = data; return { success: true }; },
  create: async (m, data) => { window.__calls.push(["create", m, data]); return { id: 555 }; },
  notify: async (d) => { window.__calls.push(["notify", d]); },
};
window.ebScheduleReminder = (...a) => window.__calls.push(["reminder", ...a]);
