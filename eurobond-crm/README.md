# Eurobond CRM — Full Clone (Admin Panel + Field App)

Eurobond SFA CRM — complete frontend by GK - IT — **Admin backend website + Mobile field app**, ఒకే project లో.

## ⭐ Maps & KM tracking (FREE)

| Item | Solution | Cost |
|---|---|---|
| Map tiles | **OpenStreetMap** via **Leaflet** | ₹0, no API key |
| Live location | Browser **Geolocation API** (`watchPosition`) | ₹0 |
| Kilometres | **Haversine formula** + GPS-noise filter | ₹0 |

Noise filter rules (km accurate గా రావడానికి):
- Accuracy 35 m కంటే worse ఉన్న GPS points → skip
- 8 m కంటే చిన్న movements (standing-still jitter) → skip
- 500 m కంటే పెద్ద impossible jumps → skip

**Important:** GPS పని చేయాలంటే **HTTPS** కావాలి. Vercel deploy చేస్తే automatic HTTPS వస్తుంది. Phone లో open చేసి **location permission Allow** చేయాలి.

## 🖥️ Local run

```bash
npm install
npm run dev
```

Open http://localhost:5173

- `/` → Portal (Admin Panel / Field App choose చేయండి)
- `/admin/login` → Admin backend (any username/password works — demo)
- `/app` → Mobile field app (any mobile + any OTP works — demo)

## 🚀 Deploy to Vercel

```bash
git init
git add .
git commit -m "Eurobond CRM clone"
git remote add origin <mee-github-repo-url>
git push -u origin main
```

Vercel లో: **Add New Project → Import repo → Framework: Vite → Deploy**. అంతే — `vercel.json` already SPA routing handle చేస్తుంది.

## 📦 What's inside

**Admin panel** (`/admin`): Expense Dashboard, User Report Card, Enquiry Dashboard, Task, Distributor/Dealer/Influencer, Attendance, Check-in (map view), Expense, Leave, Event Plan, Beat Travel, Outstation Travel, Pop Gift, Enquiry, Follow Up, Quotation, Site-Project, Roles & Permission, Users, Discount, Content Master, Leave Policy, Location, Holidays, Expense Policy, Products, Announcement, Support, Notification.

**Field app** (`/app`): OTP login, Home (slide-to-start attendance, metric cards, FAB quick actions), **Attendance with live GPS tracking** (map + route line + km + duration), Expense (tabs + add), Leave (apply), Follow Up (add), Site-Project (add), Target, Profile, hamburger menu.

## ⚠️ Notes

- ఇది **frontend demo with mock data** — refresh చేస్తే added data పోతుంది. Real usage కి backend (Supabase/Node) తర్వాత attach చేద్దాం.
- Add/Edit forms local state లో save అవుతాయి — flow test చేయడానికి perfect.
