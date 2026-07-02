# Panda Gaming Zone — Setup

## 1. Create the Google Sheet
1. New Google Sheet. Name it e.g. "Panda Gaming Zone".
2. Create these tabs (case-sensitive): `PCs`, `Tiers`, `Bookings`, `Settings`, `Payments`, `Customers`, `MemberTopups`, `Expenses`.
   You can leave them blank — `runOnce` will add headers and seed defaults.

## 2. Add the Apps Script backend
1. In the sheet: **Extensions → Apps Script**.
2. Delete the placeholder, then paste the full contents of `apps-script/Code.gs`.
3. Save (disk icon), then in the function dropdown pick **runOnce** and click **Run**.
   Grant permissions when prompted (Advanced → Go to project → Allow).

## 3. Deploy as Web App
1. Click **Deploy → New deployment**.
2. Gear icon → **Web app**.
3. Description: `Panda Gaming API v3`
4. **Execute as**: Me
5. **Who has access**: **Anyone**
6. Click **Deploy**, copy the **Web app URL** (ends in `/exec`).

> When you EDIT `Code.gs` later, use **Deploy → Manage deployments → Edit → New version**
> so the same URL keeps working.

## 4. Wire it into the app
1. Open the app → `/unlock` and enter the admin password.
2. Go to **Settings**, paste the `/exec` URL, click **Save URL**.
3. Reload — the dashboard now reads live data.

## 5. Seed a few things
- Add tiers first (Standard / Premium / VIP with prices per hour).
- Then add PCs (PC-01 … PC-10) and assign each to a tier.
- Then use **Add Booking** or **Availability** to test.

## New payment and revenue flow
- When you click **complete** on a booking, the site opens a payment popup.
- Choose `Standard` or `Member`. Member gives Rs 50 off per hour per PC by default.
- Enter cash collected, online amount, and the online method (`JazzCash`, `Easypaisa`, or `Bank`).
- The booking is marked `Completed` and a compact payment record is saved in the `Payments` sheet.
- Dashboard revenue uses the `Payments` sheet, so old completed bookings can be removed without losing revenue history.

## Auto-cleanup
- Completed bookings are automatically removed from the `Bookings` sheet after 24 hours unless you tick **Keep booking permanently** in the completion popup.
- This cleanup is throttled and runs at most once per hour when the website calls Apps Script.
- Manual delete now removes the booking row from the `Bookings` sheet. Payment history remains in the `Payments` sheet.
- You can change the cleanup window from **Settings → Auto-delete completed bookings after (hours)**.

## Admin and cashier passwords
- Stored in the website code at `src/lib/site-config.server.ts`.
- Change `ADMIN_PASSWORD` to update the admin login.
- Change `CASHIER_PASSWORD` to update the cashier login.
- Default admin password: `panda123`.
- Default cashier password: `cashier123`.
- Cashier users can manage bookings, but the earnings dashboard cards, Member Topup tab, and Expenses tab are hidden from cashier accounts.

## Member topups, expenses, and customers
- Member topups are saved in the `MemberTopups` sheet and counted as earnings.
- Expenses are saved in the `Expenses` sheet with categories: `Miscellaneous`, `Fixed`, and `Repairs`.
- Customer names and phone numbers are saved in the `Customers` sheet automatically when you create/edit bookings or save member topups.
- Add Booking has a search box so you can search by customer name or phone number and fill the form quickly.

## Notes
- Overlap rule: `existing.start < requested.end AND existing.end > requested.start`.
- Only `Pending` and `Confirmed` bookings block availability.
- `Cancelled` and `Completed` bookings do not block future slots.
- Total price = `price_per_hour × (duration_minutes / 60) × pcs_required`.
