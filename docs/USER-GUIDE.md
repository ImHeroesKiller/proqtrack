# ProQTrack User Guide

Field team monitoring for retail execution: visits, attendance, stock, prices, competitor intel, photos, product sales, and project management.

The product is **ProQTrack**. Demo passwords and the tenant name use **Proqpay**. Menu labels in the app are **English**.

---

## 1. What ProQTrack is for

| You need to… | Use |
|---|---|
| See who checked in last | Last Location |
| Record a store visit | Visits / My Visits |
| Count product sold vs target | Product Sales |
| Open a new store | New Outlet + Outlet Approvals |
| Lock a sales phone to one account | Device pairing + Reset IMEI |
| Compare supervisors on a project | Supervisor Compare |
| Build a spreadsheet from any table | Reports → Custom |

Data in the browser demo lives in `localStorage` (`proqtrack_db_v6`). Cloudflare Worker + D1 + R2 handle file sessions when the API is enabled.

---

## 2. Sign in

Open the app (static server, for example `http://127.0.0.1:8765`).

Enter email and password. Demo password for every seeded account: **`Proqpay2026`**.

| Role | Email | Scope after login |
|---|---|---|
| Superadmin | `superadmin@proqtrack.id` | All organizations |
| Head | `head@proqtrack.id` or `manager@proqtrack.id` | One organization |
| Manager | `pm@proqtrack.id` | One project (`PRJ001`) |
| Supervisor | `rizki.pratama@proqtrack.id` | Assigned project(s) + team |
| Field Sales | `budi.santoso@proqtrack.id` | Assigned project + own activity |

If the account is set to **must change password**, you stay on Settings until the password is changed.

---

## 3. Roles

```
Superadmin
    └── Head          (one organization, full read/write)
            └── Manager      (one project, full read/write)
                    ├── Supervisor   (one or more projects, team)
                    └── Field Sales  (one project, own work)
```

### Superadmin
- Switch and create organizations.
- Create Head, Manager, Supervisor, and Sales accounts.
- Full read/write on the active organization.
- This Mac can be registered as a **superadmin test device** (see §11).

### Head (organization)
Replaces the old “manager = one org” job.
- Clients, projects, assignments for the whole org.
- Employees, outlets, products, sales, stock, attendance, leave, reports.
- Organization logo, outlet catalog, attendance policy.
- Creates **Manager** accounts and **must pick one project** for each.

### Manager (project)
New meaning: full control of **one** project.
- Project Home, visits, employees on that project, outlets, approvals, products, sales, stock, attendance, leave, reports.
- No Organizations menu and no org-wide Accounts menu.
- New employees they create are assigned to their project automatically.

### Supervisor
- Team Home, My Day, Team Last Location, Team Visits.
- My Projects, My Team, Supervisor Compare.
- Team stock / prices / intel / photos / attendance / leave.
- Approves New Outlet together with Head/Manager.

### Field Sales
- My Day, Last Location, My Visits, My Projects.
- New Outlet (if the project catalog allows it).
- Outlet Stock, Product Sales, Price & Discount, Competitor Intel, Field Photos, Attendance, Leave.
- Mobile-first layout with a bottom dock.

---

## 4. Everyday field work (Sales)

### My Day
Greeting, attendance card, today’s visits, and **monthly product-sales progress** (not visit targets).

### Last Location
Last **check-in** at an outlet or workplace — not live GPS.

### Visits
1. Open My Visits (or Visits as supervisor).
2. Check in at the outlet (time + location).
3. Add stock, prices, intel, and photos while on site.
4. Check out when leaving.

### Product Sales
1. Open **Product Sales**.
2. Choose product, qty, unit price (filled from catalog), optional outlet, date.
3. Save. Amount = qty × unit price.
4. Progress is compared to the employee’s **monthly sales target** (set on the employee record).

### Outlet Stock / Price & Discount / Competitor Intel
Use the product catalog. Outlets in pickers show **outlet number + name**. New outlets appear after they are submitted (pending) so stock menus stay in sync.

### Field Photos
Types: location, product, shelf, competitor, and others. Images are compressed in the browser. Filter by date, outlet, and type.

### New Outlet
1. Head/Superadmin enables New Outlet per project in **Settings → Outlet catalog**.
2. Sales tap **New Outlet**, capture GPS (one button: GPS + auto address + maps).
3. Fill name, Segment, Ownership, Type (lists come from the project catalog).
4. Notes are **either free text or a dropdown** — the mode and dropdown lines are set in Settings, not on the form.
5. Submit. Status waits for **Supervisor and Head/Manager** approval.

Head/Manager **New Outlet** (Outlets → add) uses the same fields, plus a map pin and address search.

### Attendance
Policy is set by Head in **Settings → Attendance**:
- **Office** — check in at office coordinates + radius.
- **Outlet** — check in at an outlet.
- **Specific point** — check in at the point assigned on the **employee** record.

Named points are created in Settings; each employee is assigned a point on Employees → Edit.

### Leave
Sales submit leave. Supervisor / Head / Manager approve or reject.

---

## 5. Head and Superadmin

### Home
Organization summary: visits today, attendance, low stock, pending leave.

### Clients / Projects / Assignments
- Client master and PIC.
- Project: code, SoW, dates, contract value, modules (visits, stock, prices, intel, photos, attendance, leave, new outlet, product sales).
- Assignment: employee ↔ project, role on project, reporting supervisor.

### Employees
Photo (one local compressed image), contact, area, role (Field Sales / Supervisor), **monthly sales target**, **attendance point**, status.

### Outlets
Number + name, map, segment / ownership / type from catalog, notes, visit frequency.

### Products
SKU, brand, category, unit, price, cost, margin.

### Reports
Tabs: summary, attendance, employees, clients & projects, field activity, stock, prices, competitors, supervisors, **custom**.

**Custom:** pick a table → add columns from a second dropdown → filter by client, project, employee, outlet, dates, status, text. Visit-count targets are not used for field planning.

### Accounts
Create and edit logins. When role = **Manager**, select **one project**. Reset IMEI for a sales phone from the account row.

### Organizations (Superadmin only)
Separate tenants. Head is locked to their organization.

---

## 6. Supervisor

- **Team Last Location** only (no personal Last Location in the sidebar).
- Team stock, prices, intel, and attendance follow the team’s activity.
- Visit detail shows stock, prices, intel, and photos for that call.
- Outlet Approvals: approve or reject sales submissions (Head/Manager still need to approve).

---

## 7. Settings

Tabs depend on role.

| Tab | Who | What |
|---|---|---|
| Profile | All | Name, email, phone, area |
| Security | All | Change password |
| Display | All | Compact tables, timezone, leave/stock notifications |
| Organization | Head, Superadmin | Company name and logo (used in the sidebar) |
| Outlet catalog | Head, Superadmin, Manager (own project) | Allow New Outlet; Segment / Type / Ownership lists; **Notes = free text or dropdown** + option lines |
| Attendance | Head, Superadmin | Mode, geofence radius, office lat/lng, named points |
| Device | Sales | Paired IMEI / device label |
| Session | All | Local data size; Superadmin sees **test device** status |

---

## 8. Device lock (sales)

1. First successful login on a phone **pairs** that device to the sales account.
2. The same phone cannot log in as another sales user.
3. That sales user cannot log in on a second phone until Head/Manager **Reset IMEI**.
4. Superadmin/Head test machines can bypass this without changing the phone pairing (see §11).

---

## 9. Standard terms

Use these names in the product (English UI):

| Meaning | Term |
|---|---|
| Store / toko | **Outlet** |
| Add a store (sales or desk) | **New Outlet** |
| Approval queue | **Outlet Approvals** |
| Product sold vs target | **Product Sales** |
| Organization admin | **Head** |
| Project admin | **Manager** |

Visit counts are activity history only. They are **not** planned as daily targets in the app.

---

## 10. Keyboard / layout

- Sidebar collapse on desktop; logo comes from organization settings.
- Field roles: mobile-first glass UI and a 4-item dock (Today, Visits, Sales / Team).
- Maps: OpenStreetMap + Nominatim search (manager outlet form).

---

## 11. Superadmin test device (this Mac)

For UAT on a development Mac:

1. Sign in once as `superadmin@proqtrack.id` on that Mac.
2. Settings → Session should show **Registered host — bypass on**.
3. You can then sign in as any **already paired** sales user.
4. The sales phone IMEI is **not** overwritten.

Other phones still obey one-device-one-sales.

---

## 12. Reports and files (API)

When the Worker is deployed:

- `POST /api/auth/session` issues a file token. Roles: `superadmin`, `head`, `manager`, `supervisor`, `employee`.
- Head (org) may use usage/state admin routes. Project Manager is limited to their `projectId`.
- Uploads go to R2 via `/api/files`. Missing API (static 404/400) is ignored so the demo still runs.

---

## 13. Reset demo data

In the browser console:

```js
FT.resetDB();
location.reload();
```

Then sign in again. Local pairing and the superadmin host flag survive unless you also clear `localStorage`.

---

## 14. Run locally

```bash
cd proqtrack
python3 -m http.server 8765 --bind 127.0.0.1
# open http://127.0.0.1:8765
```

The app uses ES modules, so a static server is required.
