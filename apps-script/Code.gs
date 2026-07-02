/**
 * Panda Gaming Zone — Google Apps Script backend.
 *
 * SETUP:
 * 1. Create a Google Sheet with tabs: PCs, Tiers, Bookings, Settings, Payments,
 *    Customers, MemberTopups, Expenses (runOnce() can create them automatically).
 * 2. Extensions → Apps Script. Paste this file. Save.
 * 3. Run `runOnce` once (grant permissions).
 * 4. Deploy → New deployment → Type: Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 *    Copy the /exec URL, paste it into the app's Settings page.
 * 5. Every time you EDIT this script you must "Manage deployments" and
 *    push a new version, OR redeploy — the URL stays the same.
 */

const SHEETS = {
  PCS: 'PCs',
  TIERS: 'Tiers',
  BOOKINGS: 'Bookings',
  SETTINGS: 'Settings',
  PAYMENTS: 'Payments',
  CUSTOMERS: 'Customers',
  MEMBER_TOPUPS: 'MemberTopups',
  EXPENSES: 'Expenses',
  CASHIERS: 'Cashiers',
  SHIFTS: 'CashierShifts',
};

const HEADERS = {
  PCs: ['pc_id','pc_name','tier_id','status','created_at','updated_at'],
  Tiers: ['tier_id','tier_name','price_per_hour','description','created_at','updated_at'],
  Bookings: [
    'booking_id','customer_name','phone_number','tier_id','booking_date','start_time','end_time',
    'duration_minutes','pcs_required','assigned_pc_ids','status','notes','total_price','created_at','updated_at',
    'booking_type','discount_amount','amount_due','cash_collected','online_method','online_collected',
    'total_collected','payment_status','completed_at','keep_permanent','cashier_id','cashier_name','shift_id'
  ],
  Settings: ['setting_name','setting_value'],
  Payments: [
    'payment_id','booking_id','customer_name','phone_number','tier_id','booking_date','payment_date','completed_at',
    'booking_type','gross_total','discount_amount','amount_due','cash_collected','online_method','online_collected',
    'total_collected','payment_status','notes','created_at','updated_at',
    'assigned_pc_ids','pc_names','tier_name','duration_minutes','pcs_required','cashier_id','cashier_name','shift_id'
  ],
  Customers: ['customer_id','customer_name','phone_number','total_bookings','last_booking_at','created_at','updated_at'],
  MemberTopups: ['topup_id','member_name','phone_number','amount','topup_date','payment_method','notes','created_at','updated_at','cashier_id','cashier_name','shift_id'],
  Expenses: ['expense_id','expense_date','category','amount','notes','created_at','updated_at','payment_method','cashier_id','cashier_name','shift_id'],
  Cashiers: ['cashier_id','cashier_name','username','password','status','created_at','updated_at'],
  CashierShifts: ['shift_id','cashier_id','cashier_name','clock_in_at','clock_out_at','status','created_at','updated_at'],
};

const DEFAULT_SETTINGS = [
  ['business_name','Panda Gaming Zone'],
  ['opening_time','00:00'],
  ['closing_time','23:59'],
  ['booking_slot_interval','30'],
  ['currency','PKR'],
  ['default_booking_status','Pending'],
  ['member_discount_per_hour','50'],
  ['member_discount','50'], // old setting kept as fallback for existing sheets
  ['auto_delete_completed_hours','24'],
];

// Small cache layer: Apps Script + Sheets can be slow if every page load reads every tab.
// These keys are removed after writes, so normal edits still show up quickly.
const CACHE_KEYS = {
  PCS: 'pgz_pcs_v6',
  TIERS: 'pgz_tiers_v6',
  SETTINGS: 'pgz_settings_v6',
  DASHBOARD: 'pgz_dashboard_v6',
  PAYMENTS: 'pgz_payments_v6',
  CUSTOMERS: 'pgz_customers_v6',
  TOPUPS: 'pgz_topups_v6',
  EXPENSES: 'pgz_expenses_v6',
  REVENUE_ANALYTICS: 'pgz_revenue_analytics_v1',
  BOOKINGS: 'pgz_bookings_v7',
  BOOTSTRAP: 'pgz_bootstrap_v7',
  CLEANUP: 'pgz_cleanup_v6',
  CASHIERS: 'pgz_cashiers_v1',
  SHIFTS: 'pgz_shifts_v1',
};
function cacheGet(key) {
  try {
    const raw = CacheService.getScriptCache().get(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}
function cachePut(key, value, seconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), seconds);
  } catch (e) {}
}
function clearAppCache() {
  try {
    const keys = Object.values(CACHE_KEYS).filter(k => k !== CACHE_KEYS.BOOTSTRAP);
    CacheService.getScriptCache().removeAll(keys);
  } catch (e) {}
}

function runOnce() {
  ensureAllSheets();
  const settings = sheet(SHEETS.SETTINGS);
  const existing = readAll(SHEETS.SETTINGS).reduce((acc, r) => {
    acc[String(r.setting_name)] = true;
    return acc;
  }, {});
  DEFAULT_SETTINGS.forEach(r => {
    if (!existing[r[0]]) settings.appendRow(r);
  });

  // Create a starter cashier account once so the old cashier password still works
  // after you move cashier management into Google Sheets. You can change/delete
  // this from the Admin → Cashiers page later.
  const cashiers = readAll(SHEETS.CASHIERS);
  const hasDefaultCashier = cashiers.some(c => String(c.username || '').toLowerCase() === 'cashier');
  if (!hasDefaultCashier) {
    sheet(SHEETS.CASHIERS).appendRow(['CAS-01', 'Cashier', 'cashier', 'cashier123', 'Active', nowIso(), nowIso()]);
  }
  clearAppCache();
}

// ---------- HTTP entry points ----------
function doPost(e) {
  try {
    maybeEnsureAllSheets();
    maybeCleanupOldBookings();
    const body = JSON.parse(e.postData.contents);
    const fn = ACTIONS[body.action];
    if (!fn) return json({ success: false, error: 'Unknown action: ' + body.action });
    return json(fn(body.payload || {}));
  } catch (err) {
    return json({ success: false, error: String(err && err.message || err) });
  }
}
function doGet() {
  ensureAllSheets();
  return json({ success: true, message: 'Panda Gaming Zone API' });
}
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- Helpers ----------
function ensureAllSheets() { Object.values(SHEETS).forEach(name => ensureSheetAndHeaders(name)); }
function maybeEnsureAllSheets() {
  // Checking/creating every tab on every request makes Apps Script feel slow.
  // Do the full bootstrap only occasionally; individual read/write helpers still
  // ensure the specific sheet they touch.
  if (cacheGet(CACHE_KEYS.BOOTSTRAP)) return;
  ensureAllSheets();
  cachePut(CACHE_KEYS.BOOTSTRAP, { ok: true, at: nowIso() }, 600);
}
function sheet(name) { return SpreadsheetApp.getActive().getSheetByName(name); }
function ensureSheetAndHeaders(name) {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(name);
  if (!s) s = ss.insertSheet(name);
  const expected = HEADERS[name] || [];
  if (s.getLastRow() === 0) {
    s.appendRow(expected);
    return s;
  }
  const lastCol = Math.max(s.getLastColumn(), expected.length, 1);
  const current = s.getRange(1, 1, 1, lastCol).getValues()[0].filter(String).map(String);
  const missing = expected.filter(h => current.indexOf(h) === -1);
  if (missing.length) {
    s.getRange(1, current.length + 1, 1, missing.length).setValues([missing]);
  }
  return s;
}

function readAll(name) {
  ensureSheetAndHeaders(name);
  const s = sheet(name);
  const values = s.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0].map(String);
  return values.slice(1).filter(row => row.some(v => v !== '')).map(row => {
    const o = {};
    headers.forEach((h, i) => { if (h) o[h] = formatCell(h, row[i]); });
    return o;
  });
}

function formatCell(header, value) {
  if (value === '' || value === null || value === undefined) return '';
  if (value instanceof Date) {
    if (header === 'booking_date' || header === 'payment_date' || header === 'topup_date' || header === 'expense_date') {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    }
    if (header === 'start_time' || header === 'end_time' || header === 'opening_time' || header === 'closing_time') {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
    }
    if (header.endsWith('_at') || header === 'completed_at' || header === 'last_booking_at') {
      return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    }
  }
  return value;
}

function cachedReadAll(name, cacheKey, seconds) {
  const cached = cacheGet(cacheKey);
  if (cached) return cached;
  const rows = readAll(name);
  cachePut(cacheKey, rows, seconds || 30);
  return rows;
}
function findRow(name, key, value) {
  ensureSheetAndHeaders(name);
  const s = sheet(name);
  const values = s.getDataRange().getValues();
  if (values.length === 0) return null;
  const headers = values[0].map(String);
  const idx = headers.indexOf(key);
  if (idx === -1) return null;
  for (let i = 1; i < values.length; i++) if (String(values[i][idx]) === String(value)) return { row: i + 1, headers, values: values[i] };
  return null;
}
function findRowByPhone(name, phone) {
  const cleaned = normalizePhone(phone);
  if (!cleaned) return null;
  ensureSheetAndHeaders(name);
  const s = sheet(name);
  const values = s.getDataRange().getValues();
  if (values.length === 0) return null;
  const headers = values[0].map(String);
  const idx = headers.indexOf('phone_number');
  if (idx === -1) return null;
  for (let i = 1; i < values.length; i++) if (normalizePhone(values[i][idx]) === cleaned) return { row: i + 1, headers, values: values[i] };
  return null;
}
function rowObject(headers, values) {
  const o = {};
  headers.forEach((h, i) => { if (h) o[h] = formatCell(h, values[i]); });
  return o;
}
function nowDate() { return new Date(); }
function nowIso() { return Utilities.formatDate(nowDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
function todayIso() { return Utilities.formatDate(nowDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function nextId(name, prefix) {
  const rows = readAll(name);
  let max = 0;
  const idHeader = HEADERS[name][0];
  rows.forEach(r => {
    const id = r[idHeader];
    const n = parseInt(String(id).replace(/\D/g,''), 10) || 0;
    if (n > max) max = n;
  });
  return prefix + '-' + String(max + 1).padStart(2, '0');
}
function toMinutes(hhmm) {
  if (hhmm instanceof Date) hhmm = Utilities.formatDate(hhmm, Session.getScriptTimeZone(), 'HH:mm');
  const parts = String(hhmm || '00:00').split(':').map(Number);
  const h = Number(parts[0]) || 0;
  const m = Number(parts[1]) || 0;
  return h * 60 + m;
}
function fromMinutes(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60), m = mins % 60;
  return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
}
function normalizeEnd(startMin, endMin) { return endMin <= startMin ? endMin + 1440 : endMin; }
function fmtDate(d) { if (d instanceof Date) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); return String(d || ''); }
function parseDateTime(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const s = String(value).replace(' ', 'T');
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function boolYes(value) { const s = String(value || '').toLowerCase(); return s === 'yes' || s === 'true' || s === '1'; }
function normalizePhone(phone) { return String(phone || '').replace(/\D/g, ''); }
function actorFromPayload(p) {
  const s = (p && p.__session) || {};
  return {
    cashier_id: String(s.cashier_id || ''),
    cashier_name: String(s.cashier_name || s.username || ''),
    shift_id: String(s.shift_id || ''),
  };
}
function rowDateTimeInRange(value, start, end) {
  const d = parseDateTime(value);
  if (!d || !start) return false;
  const ms = d.getTime();
  return ms >= start.getTime() && (!end || ms <= end.getTime());
}
function getSettingsMap() {
  const map = {};
  cachedReadAll(SHEETS.SETTINGS, CACHE_KEYS.SETTINGS, 60).forEach(r => { map[r.setting_name] = r.setting_value; });
  return map;
}
function getMemberDiscountPerHour(settings) {
  return Number(settings.member_discount_per_hour || settings.member_discount || 50) || 50;
}
function calcMemberDiscount(settings, durationMinutes, pcsRequired) {
  return Math.max(0, getMemberDiscountPerHour(settings) * (Number(durationMinutes || 0) / 60) * (Number(pcsRequired || 1) || 1));
}


// ---------- Cashiers + shifts ----------
function getCashiers() {
  const rows = cachedReadAll(SHEETS.CASHIERS, CACHE_KEYS.CASHIERS, 60)
    .sort((a, b) => String(a.cashier_name || '').localeCompare(String(b.cashier_name || '')));
  return { success: true, data: rows };
}
function addCashier(p) {
  const name = String(p.cashier_name || '').trim();
  const username = String(p.username || '').trim().toLowerCase();
  const password = String(p.password || '').trim();
  if (!name || !username || !password) return { success: false, error: 'Cashier name, username and password are required.' };
  const exists = readAll(SHEETS.CASHIERS).some(c => String(c.username || '').toLowerCase() === username);
  if (exists) return { success: false, error: 'This username already exists.' };
  const id = nextId(SHEETS.CASHIERS, 'CAS');
  sheet(SHEETS.CASHIERS).appendRow([id, name, username, password, p.status || 'Active', nowIso(), nowIso()]);
  clearAppCache();
  return { success: true, data: { cashier_id: id } };
}
function updateCashier(p) {
  const found = findRow(SHEETS.CASHIERS, 'cashier_id', p.cashier_id);
  if (!found) return { success: false, error: 'Cashier not found' };
  const cur = rowObject(found.headers, found.values);
  const username = String(p.username || cur.username || '').trim().toLowerCase();
  const duplicate = readAll(SHEETS.CASHIERS).some(c => String(c.cashier_id) !== String(p.cashier_id) && String(c.username || '').toLowerCase() === username);
  if (duplicate) return { success: false, error: 'This username already exists.' };
  const values = [
    cur.cashier_id,
    String(p.cashier_name ?? cur.cashier_name ?? '').trim(),
    username,
    String(p.password ?? cur.password ?? '').trim(),
    p.status || cur.status || 'Active',
    cur.created_at || nowIso(),
    nowIso(),
  ];
  sheet(SHEETS.CASHIERS).getRange(found.row, 1, 1, values.length).setValues([values]);
  clearAppCache();
  return { success: true };
}
function deleteCashier(p) {
  const found = findRow(SHEETS.CASHIERS, 'cashier_id', p.cashier_id);
  if (!found) return { success: false, error: 'Cashier not found' };
  sheet(SHEETS.CASHIERS).deleteRow(found.row);
  clearAppCache();
  return { success: true };
}
function loginCashier(p) {
  const username = String(p.username || '').trim().toLowerCase();
  const password = String(p.password || '').trim();
  if (!username || !password) return { success: false, error: 'Username and password are required.' };
  const cashier = readAll(SHEETS.CASHIERS).find(c =>
    String(c.username || '').toLowerCase() === username &&
    String(c.password || '') === password &&
    String(c.status || 'Active') === 'Active'
  );
  if (!cashier) return { success: false, error: 'Invalid cashier username or password.' };
  const shift = getOrCreateActiveShift(cashier);
  return {
    success: true,
    data: {
      role: 'cashier',
      username: String(cashier.username || ''),
      cashier_id: String(cashier.cashier_id || ''),
      cashier_name: String(cashier.cashier_name || cashier.username || ''),
      shift_id: shift.shift_id,
      shift_started_at: shift.clock_in_at,
    },
  };
}
function getOrCreateActiveShift(cashier) {
  const active = readAll(SHEETS.SHIFTS).find(s =>
    String(s.cashier_id || '') === String(cashier.cashier_id || '') &&
    String(s.status || '') === 'Active' &&
    !String(s.clock_out_at || '')
  );
  if (active) return active;
  const id = nextId(SHEETS.SHIFTS, 'SHIFT');
  const row = [id, cashier.cashier_id, cashier.cashier_name || cashier.username || '', nowIso(), '', 'Active', nowIso(), nowIso()];
  sheet(SHEETS.SHIFTS).appendRow(row);
  clearAppCache();
  return { shift_id: id, cashier_id: cashier.cashier_id, cashier_name: cashier.cashier_name, clock_in_at: row[3], status: 'Active' };
}
function logoutCashier(p) {
  const shiftId = String(p.shift_id || '').trim();
  if (!shiftId) return { success: true };
  return closeShift({ shift_id: shiftId });
}
function closeShift(p) {
  const found = findRow(SHEETS.SHIFTS, 'shift_id', p.shift_id);
  if (!found) return { success: false, error: 'Shift not found' };
  const cur = rowObject(found.headers, found.values);
  const values = [
    cur.shift_id,
    cur.cashier_id,
    cur.cashier_name,
    cur.clock_in_at,
    cur.clock_out_at || nowIso(),
    'Closed',
    cur.created_at || cur.clock_in_at || nowIso(),
    nowIso(),
  ];
  sheet(SHEETS.SHIFTS).getRange(found.row, 1, 1, values.length).setValues([values]);
  clearAppCache();
  return { success: true };
}
function summarizeShift(shift) {
  const shiftId = String(shift.shift_id || '');
  const cashierId = String(shift.cashier_id || '');
  const start = parseDateTime(shift.clock_in_at || shift.created_at || '');
  const end = parseDateTime(shift.clock_out_at || '') || (String(shift.status) === 'Active' ? nowDate() : null);
  const bookings = getBookingsRaw().filter(b => {
    if (String(b.shift_id || '') === shiftId) return true;
    return !String(b.shift_id || '') && String(b.cashier_id || '') === cashierId && rowDateTimeInRange(b.created_at, start, end);
  });
  const payments = cachedReadAll(SHEETS.PAYMENTS, CACHE_KEYS.PAYMENTS, 30).filter(p => {
    if (String(p.shift_id || '') === shiftId) return true;
    return !String(p.shift_id || '') && String(p.cashier_id || '') === cashierId && rowDateTimeInRange(p.created_at || p.completed_at, start, end);
  });
  const topups = cachedReadAll(SHEETS.MEMBER_TOPUPS, CACHE_KEYS.TOPUPS, 30).filter(t => {
    if (String(t.shift_id || '') === shiftId) return true;
    return !String(t.shift_id || '') && String(t.cashier_id || '') === cashierId && rowDateTimeInRange(t.created_at, start, end);
  });
  const expenses = cachedReadAll(SHEETS.EXPENSES, CACHE_KEYS.EXPENSES, 30).filter(e => {
    if (String(e.shift_id || '') === shiftId) return true;
    return !String(e.shift_id || '') && String(e.cashier_id || '') === cashierId && rowDateTimeInRange(e.created_at, start, end);
  });
  const bookingRevenue = payments.reduce((sum, p) => sum + (Number(p.total_collected) || 0), 0);
  const bookingCash = payments.reduce((sum, p) => sum + (Number(p.cash_collected) || 0), 0);
  const bookingOnline = payments.reduce((sum, p) => sum + (Number(p.online_collected) || 0), 0);
  const topupTotal = topups.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const topupCash = topups.filter(t => String(t.payment_method || 'Cash') === 'Cash').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const topupOnline = topups.filter(t => String(t.payment_method || 'Cash') !== 'Cash').reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
  const expenseTotal = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const expenseCash = expenses.filter(e => String(e.payment_method || 'Cash') === 'Cash').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalRevenue = bookingRevenue + topupTotal;
  return {
    shift_id: shiftId,
    cashier_id: cashierId,
    cashier_name: String(shift.cashier_name || ''),
    clock_in_at: shift.clock_in_at || '',
    clock_out_at: shift.clock_out_at || '',
    status: shift.status || 'Active',
    bookings_created: bookings.length,
    completed_bookings: payments.length,
    booking_revenue: Math.round(bookingRevenue),
    topups_total: Math.round(topupTotal),
    expenses_total: Math.round(expenseTotal),
    total_revenue: Math.round(totalRevenue),
    net_revenue: Math.round(totalRevenue - expenseTotal),
    cash_collected: Math.round(bookingCash + topupCash),
    online_collected: Math.round(bookingOnline + topupOnline),
    cash_expenses: Math.round(expenseCash),
    expected_cash: Math.round(bookingCash + topupCash - expenseCash),
  };
}
function getMyShiftSummary(p) {
  const shiftId = String(p.shift_id || (p.__session && p.__session.shift_id) || '').trim();
  if (!shiftId) return { success: true, data: null };
  const shift = readAll(SHEETS.SHIFTS).find(s => String(s.shift_id || '') === shiftId);
  if (!shift) return { success: true, data: null };
  return { success: true, data: summarizeShift(shift) };
}
function getShiftReports(p) {
  const rows = readAll(SHEETS.SHIFTS)
    .map(summarizeShift)
    .sort((a, b) => String(b.clock_in_at || '').localeCompare(String(a.clock_in_at || '')));
  const limit = Number(p.limit || 100) || 100;
  return { success: true, data: rows.slice(0, limit) };
}

// ---------- Automatic booking cleanup ----------
function maybeCleanupOldBookings() {
  if (cacheGet(CACHE_KEYS.CLEANUP)) return;
  cachePut(CACHE_KEYS.CLEANUP, { ran: nowIso() }, 3600); // run at most once per hour
  cleanupOldBookings();
}

function cleanupOldBookings() {
  const settings = getSettingsMap();
  const hours = Number(settings.auto_delete_completed_hours) || 24;
  const cutoffMs = nowDate().getTime() - hours * 60 * 60 * 1000;
  const s = sheet(SHEETS.BOOKINGS);
  const values = s.getDataRange().getValues();
  if (values.length < 2) return { success: true, deleted: 0 };
  const headers = values[0].map(String);
  const statusIdx = headers.indexOf('status');
  const completedIdx = headers.indexOf('completed_at');
  const keepIdx = headers.indexOf('keep_permanent');
  let deleted = 0;
  for (let i = values.length - 1; i >= 1; i--) {
    const status = String(values[i][statusIdx] || '');
    const completedAt = completedIdx >= 0 ? parseDateTime(values[i][completedIdx]) : null;
    const keep = keepIdx >= 0 ? boolYes(values[i][keepIdx]) : false;
    if (status === 'Completed' && completedAt && !keep && completedAt.getTime() < cutoffMs) {
      s.deleteRow(i + 1);
      deleted++;
    }
  }
  if (deleted) clearAppCache();
  return { success: true, deleted };
}

// ---------- PCs ----------
function getPCs() { return { success: true, data: cachedReadAll(SHEETS.PCS, CACHE_KEYS.PCS, 30) }; }
function addPC(p) {
  const id = nextId(SHEETS.PCS, 'PC');
  sheet(SHEETS.PCS).appendRow([id, p.pc_name, p.tier_id, p.status || 'Active', nowIso(), nowIso()]);
  clearAppCache();
  return { success: true, data: { pc_id: id } };
}
function updatePC(p) {
  const found = findRow(SHEETS.PCS, 'pc_id', p.pc_id);
  if (!found) return { success: false, error: 'PC not found' };
  const s = sheet(SHEETS.PCS);
  s.getRange(found.row, 2).setValue(p.pc_name);
  s.getRange(found.row, 3).setValue(p.tier_id);
  s.getRange(found.row, 4).setValue(p.status);
  s.getRange(found.row, 6).setValue(nowIso());
  clearAppCache();
  return { success: true };
}
function deletePC(p) {
  const found = findRow(SHEETS.PCS, 'pc_id', p.pc_id);
  if (!found) return { success: false, error: 'PC not found' };
  sheet(SHEETS.PCS).deleteRow(found.row);
  clearAppCache();
  return { success: true };
}

// ---------- Tiers ----------
function getTiers() { return { success: true, data: cachedReadAll(SHEETS.TIERS, CACHE_KEYS.TIERS, 60) }; }
function addTier(p) {
  const id = nextId(SHEETS.TIERS, 'TIER');
  sheet(SHEETS.TIERS).appendRow([id, p.tier_name, Number(p.price_per_hour)||0, p.description||'', nowIso(), nowIso()]);
  clearAppCache();
  return { success: true, data: { tier_id: id } };
}
function updateTier(p) {
  const found = findRow(SHEETS.TIERS, 'tier_id', p.tier_id);
  if (!found) return { success: false, error: 'Tier not found' };
  const s = sheet(SHEETS.TIERS);
  s.getRange(found.row, 2).setValue(p.tier_name);
  s.getRange(found.row, 3).setValue(Number(p.price_per_hour)||0);
  s.getRange(found.row, 4).setValue(p.description||'');
  s.getRange(found.row, 6).setValue(nowIso());
  clearAppCache();
  return { success: true };
}
function deleteTier(p) {
  const found = findRow(SHEETS.TIERS, 'tier_id', p.tier_id);
  if (!found) return { success: false, error: 'Tier not found' };
  sheet(SHEETS.TIERS).deleteRow(found.row);
  clearAppCache();
  return { success: true };
}

// ---------- Customers ----------
function getCustomers() {
  const rows = cachedReadAll(SHEETS.CUSTOMERS, CACHE_KEYS.CUSTOMERS, 60)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return { success: true, data: rows };
}
function upsertCustomer(customerName, phoneNumber, incrementBookingCount) {
  const name = String(customerName || '').trim();
  const phone = String(phoneNumber || '').trim();
  if (!name && !phone) return null;

  // Be extra defensive here because customer saving should work even if the
  // Customers tab was missing before the latest backend update.
  const s = ensureSheetAndHeaders(SHEETS.CUSTOMERS);
  const found = phone ? findRowByPhone(SHEETS.CUSTOMERS, phone) : null;
  const shouldIncrement = !!incrementBookingCount;

  if (found) {
    const cur = rowObject(found.headers, found.values);
    const total = Math.max(0, Number(cur.total_bookings || 0)) + (shouldIncrement ? 1 : 0);
    const values = [
      cur.customer_id || nextId(SHEETS.CUSTOMERS, 'CUS'),
      name || cur.customer_name || '',
      phone || cur.phone_number || '',
      total,
      shouldIncrement ? nowIso() : (cur.last_booking_at || ''),
      cur.created_at || nowIso(),
      nowIso(),
    ];
    s.getRange(found.row, 1, 1, values.length).setValues([values]);
    return values[0];
  }

  const id = nextId(SHEETS.CUSTOMERS, 'CUS');
  s.appendRow([id, name, phone, shouldIncrement ? 1 : 0, shouldIncrement ? nowIso() : '', nowIso(), nowIso()]);
  return id;
}


// ---------- Availability core ----------
function overlaps(aStart, aEnd, bStart, bEnd) { return aStart < bEnd && aEnd > bStart; }
function getBookingsRaw() { return cachedReadAll(SHEETS.BOOKINGS, CACHE_KEYS.BOOKINGS, 5); }

function bookingOverlapsRequest(b, dateStr, startMin, endMin) {
  if (String(fmtDate(b.booking_date)) !== dateStr) return false;
  if (b.status !== 'Pending' && b.status !== 'Confirmed') return false;
  const bs = toMinutes(b.start_time);
  const be = normalizeEnd(bs, toMinutes(b.end_time));
  return overlaps(startMin, endMin, bs, be);
}

function computeAvailabilityFromData(dateStr, startMin, endMin, tierId, pcsRequired, pcsRows, bookingRows) {
  const pcs = pcsRows.filter(p => p.status === 'Active' && (!tierId || p.tier_id === tierId));
  const bookings = bookingRows.filter(b => bookingOverlapsRequest(b, dateStr, startMin, endMin));
  const booked = new Set();
  bookings.forEach(b => String(b.assigned_pc_ids || '').split(',').map(x => x.trim()).filter(Boolean).forEach(x => booked.add(x)));
  const availablePCs = pcs.filter(p => !booked.has(p.pc_id));
  const bookedPCs = pcs.filter(p => booked.has(p.pc_id));
  return {
    availablePCs: availablePCs.map(p => p.pc_name),
    availablePCIds: availablePCs.map(p => p.pc_id),
    bookedPCs: bookedPCs.map(p => p.pc_name),
    availableCount: availablePCs.length,
    totalCount: pcs.length,
  };
}

function computeAvailability(dateStr, startMin, endMin, tierId, pcsRequired) {
  return computeAvailabilityFromData(
    dateStr,
    startMin,
    endMin,
    tierId,
    pcsRequired,
    cachedReadAll(SHEETS.PCS, CACHE_KEYS.PCS, 30),
    getBookingsRaw()
  );
}

function checkAvailability(p) {
  const dateStr = String(p.date);
  const startMin = toMinutes(p.start_time);
  const duration = Number(p.duration_minutes);
  const endMin = startMin + duration;
  const pcsRequired = Number(p.pcs_required) || 1;
  const settings = getSettingsMap();
  const tiers = cachedReadAll(SHEETS.TIERS, CACHE_KEYS.TIERS, 60);
  const tier = tiers.find(t => t.tier_id === p.tier_id);

  // Read the heavy tabs once, then reuse the in-memory arrays for the whole request.
  const pcsRows = cachedReadAll(SHEETS.PCS, CACHE_KEYS.PCS, 30);
  const bookingRows = getBookingsRaw();
  const a = computeAvailabilityFromData(dateStr, startMin, endMin, p.tier_id, pcsRequired, pcsRows, bookingRows);
  const canBook = a.availableCount >= pcsRequired;

  const result = {
    success: true,
    requested: {
      tier: tier ? tier.tier_name : p.tier_id || '',
      date: dateStr,
      start_time: fromMinutes(startMin),
      end_time: fromMinutes(endMin),
      pcs_required: pcsRequired,
    },
    available_count: a.availableCount,
    available_pcs: a.availablePCs,
    booked_pcs: a.bookedPCs,
    can_book: canBook,
    suggestions: [],
  };

  if (!canBook) {
    result.message = 'Only ' + a.availableCount + (tier ? ' ' + tier.tier_name : '')
      + ' PC' + (a.availableCount === 1 ? '' : 's')
      + ' available from ' + fromMinutes(startMin) + ' to ' + fromMinutes(endMin)
      + '. You requested ' + pcsRequired + '.';
    result.suggestions = findAvailableSlotsForDay(dateStr, startMin, duration, p.tier_id, pcsRequired, settings, pcsRows, bookingRows);
    if (!result.suggestions.length) {
      result.message += ' No other slots are available for this day.';
    }
  }
  return result;
}

function getBusinessWindow(settings) {
  const open = toMinutes(settings.opening_time || '00:00');
  let close = toMinutes(settings.closing_time || '23:59');
  if (close <= open) close += 1440; // handles closing past midnight
  return { open, close };
}

function findAvailableSlotsForDay(dateStr, requestedStartMin, duration, tierId, pcsRequired, settings, pcsRows, bookingRows) {
  const interval = Number(settings.booking_slot_interval) || 30;
  const window = getBusinessWindow(settings);
  const before = [];
  const after = [];
  let cursor = Math.ceil(window.open / interval) * interval;
  let iters = 0;
  while (cursor + duration <= window.close && iters < 200) {
    if (cursor !== requestedStartMin) {
      const a = computeAvailabilityFromData(dateStr, cursor, cursor + duration, tierId, pcsRequired, pcsRows, bookingRows);
      if (a.availableCount >= pcsRequired) {
        const slot = {
          start_time: fromMinutes(cursor),
          end_time: fromMinutes(cursor + duration),
          available_count: a.availableCount,
          relation: cursor < requestedStartMin ? 'before' : 'after',
        };
        if (cursor < requestedStartMin) before.push(slot);
        else after.push(slot);
      }
    }
    cursor += interval;
    iters++;
  }
  // Before slots are shown closest to the checked time first, then after slots in time order.
  before.sort((a, b) => toMinutes(b.start_time) - toMinutes(a.start_time));
  return before.concat(after);
}

// ---------- Bookings ----------
function getBookings() { return { success: true, data: getBookingsRaw() }; }

function addBooking(p) {
  const startMin = toMinutes(p.start_time);
  const duration = Number(p.duration_minutes);
  const endMin = startMin + duration;
  const dateStr = String(p.booking_date);
  const pcsRequired = Number(p.pcs_required) || 1;

  const a = computeAvailability(dateStr, startMin, endMin, p.tier_id, pcsRequired);
  if (a.availableCount < pcsRequired) {
    return { success: false, error: 'Not enough PCs available for this slot.' };
  }
  const assigned = a.availablePCIds.slice(0, pcsRequired);
  const tier = cachedReadAll(SHEETS.TIERS, CACHE_KEYS.TIERS, 60).find(t => t.tier_id === p.tier_id);
  const pricePerHour = tier ? Number(tier.price_per_hour) : 0;
  const totalPrice = (pricePerHour * duration / 60) * pcsRequired;
  const id = nextId(SHEETS.BOOKINGS, 'BK');
  const actor = actorFromPayload(p);

  sheet(SHEETS.BOOKINGS).appendRow([
    id, p.customer_name, p.phone_number, p.tier_id, dateStr,
    fromMinutes(startMin), fromMinutes(endMin), duration, pcsRequired,
    assigned.join(','), p.status || 'Pending', p.notes || '', totalPrice, nowIso(), nowIso(),
    '', 0, totalPrice, 0, '', 0, 0, '', '', 'No',
    actor.cashier_id, actor.cashier_name, actor.shift_id,
  ]);
  upsertCustomer(p.customer_name, p.phone_number, true);
  clearAppCache();
  return { success: true, data: { booking_id: id, assigned_pc_ids: assigned } };
}

function updateBooking(p) {
  const found = findRow(SHEETS.BOOKINGS, 'booking_id', p.booking_id);
  if (!found) return { success: false, error: 'Booking not found' };
  const headers = found.headers;
  const row = found.row;
  const cur = rowObject(headers, found.values);

  const merged = Object.assign({}, cur, p);
  const changedTiming = ['booking_date','start_time','duration_minutes','tier_id','pcs_required']
    .some(k => p[k] !== undefined && String(p[k]) !== String(cur[k]));

  const dateStr = fmtDate(merged.booking_date);
  const startMin = toMinutes(merged.start_time);
  const duration = Number(merged.duration_minutes);
  const endMin = startMin + duration;
  const pcsRequired = Number(merged.pcs_required) || 1;

  let assigned = String(cur.assigned_pc_ids || '').split(',').map(s => s.trim()).filter(Boolean);

  if (changedTiming && (merged.status === 'Pending' || merged.status === 'Confirmed')) {
    // Re-check availability excluding THIS booking's PCs.
    const currentIds = new Set(assigned);
    const pcs = cachedReadAll(SHEETS.PCS, CACHE_KEYS.PCS, 30).filter(pc => pc.status === 'Active' && pc.tier_id === merged.tier_id);
    const conflicts = new Set();
    getBookingsRaw().forEach(b => {
      if (b.booking_id === p.booking_id) return;
      if (fmtDate(b.booking_date) !== dateStr) return;
      if (b.status !== 'Pending' && b.status !== 'Confirmed') return;
      const bs = toMinutes(b.start_time);
      const be = normalizeEnd(bs, toMinutes(b.end_time));
      if (!overlaps(startMin, endMin, bs, be)) return;
      String(b.assigned_pc_ids || '').split(',').map(s => s.trim()).filter(Boolean).forEach(x => conflicts.add(x));
    });
    const available = pcs.filter(pc => !conflicts.has(pc.pc_id));
    if (available.length < pcsRequired) {
      return { success: false, error: 'Not enough PCs available for the new slot (' + available.length + '/' + pcsRequired + ').' };
    }
    // Prefer to keep currently-assigned PCs if they still qualify.
    const keep = available.filter(pc => currentIds.has(pc.pc_id)).map(pc => pc.pc_id);
    const fresh = available.filter(pc => !currentIds.has(pc.pc_id)).map(pc => pc.pc_id);
    assigned = keep.concat(fresh).slice(0, pcsRequired);
  }

  const tier = cachedReadAll(SHEETS.TIERS, CACHE_KEYS.TIERS, 60).find(t => t.tier_id === merged.tier_id);
  const pricePerHour = tier ? Number(tier.price_per_hour) : 0;
  const totalPrice = (pricePerHour * duration / 60) * pcsRequired;
  const amountDue = Number(merged.amount_due) || Math.max(0, totalPrice - (Number(merged.discount_amount) || 0));

  const values = [
    merged.booking_id, merged.customer_name, merged.phone_number, merged.tier_id,
    dateStr, fromMinutes(startMin), fromMinutes(endMin), duration, pcsRequired,
    assigned.join(','), merged.status, merged.notes || '', totalPrice, cur.created_at || nowIso(), nowIso(),
    merged.booking_type || '', Number(merged.discount_amount) || 0, amountDue,
    Number(merged.cash_collected) || 0, merged.online_method || '', Number(merged.online_collected) || 0,
    Number(merged.total_collected) || 0, merged.payment_status || '', merged.completed_at || '', merged.keep_permanent || 'No',
    merged.cashier_id || cur.cashier_id || '', merged.cashier_name || cur.cashier_name || '', merged.shift_id || cur.shift_id || '',
  ];
  sheet(SHEETS.BOOKINGS).getRange(row, 1, 1, values.length).setValues([values]);
  upsertCustomer(merged.customer_name, merged.phone_number, false);
  clearAppCache();
  return { success: true };
}

function cancelBooking(p) { return updateBooking({ booking_id: p.booking_id, status: 'Cancelled' }); }
function deleteBooking(p) {
  const found = findRow(SHEETS.BOOKINGS, 'booking_id', p.booking_id);
  if (!found) return { success: false, error: 'Booking not found' };
  sheet(SHEETS.BOOKINGS).deleteRow(found.row);
  clearAppCache();
  return { success: true };
}

function completeBooking(p) {
  const found = findRow(SHEETS.BOOKINGS, 'booking_id', p.booking_id);
  if (!found) return { success: false, error: 'Booking not found' };
  const cur = rowObject(found.headers, found.values);
  const settings = getSettingsMap();
  const gross = Number(cur.total_price) || 0;
  const bookingType = p.booking_type || 'Standard';
  const discount = bookingType === 'Member' ? calcMemberDiscount(settings, cur.duration_minutes, cur.pcs_required) : 0;
  const amountDue = Math.max(0, gross - discount);
  const cash = Number(p.cash_collected) || 0;
  const online = Number(p.online_collected) || 0;
  const totalCollected = cash + online;
  const paymentStatus = totalCollected >= amountDue ? (totalCollected > amountDue ? 'Overpaid' : 'Paid') : 'Partial';
  const completedAt = nowIso();
  const paymentDate = todayIso();
  const keepPermanent = p.keep_permanent ? 'Yes' : 'No';
  const actor = actorFromPayload(p);

  updateBooking({
    booking_id: p.booking_id,
    status: 'Completed',
    booking_type: bookingType,
    discount_amount: discount,
    amount_due: amountDue,
    cash_collected: cash,
    online_method: p.online_method || '',
    online_collected: online,
    total_collected: totalCollected,
    payment_status: paymentStatus,
    completed_at: completedAt,
    keep_permanent: keepPermanent,
    cashier_id: actor.cashier_id || cur.cashier_id || '',
    cashier_name: actor.cashier_name || cur.cashier_name || '',
    shift_id: actor.shift_id || cur.shift_id || '',
  });

  upsertPayment({
    booking_id: p.booking_id,
    customer_name: cur.customer_name,
    phone_number: cur.phone_number,
    tier_id: cur.tier_id,
    booking_date: fmtDate(cur.booking_date),
    payment_date: paymentDate,
    completed_at: completedAt,
    booking_type: bookingType,
    gross_total: gross,
    discount_amount: discount,
    amount_due: amountDue,
    cash_collected: cash,
    online_method: p.online_method || '',
    online_collected: online,
    total_collected: totalCollected,
    payment_status: paymentStatus,
    notes: cur.notes || '',
    assigned_pc_ids: cur.assigned_pc_ids || '',
    pc_names: pcNamesForIds(cur.assigned_pc_ids || ''),
    tier_name: tierNameById(cur.tier_id),
    duration_minutes: Number(cur.duration_minutes) || 0,
    pcs_required: Number(cur.pcs_required) || 1,
    cashier_id: actor.cashier_id || cur.cashier_id || '',
    cashier_name: actor.cashier_name || cur.cashier_name || '',
    shift_id: actor.shift_id || cur.shift_id || '',
  });

  clearAppCache();
  return { success: true, data: { amount_due: amountDue, total_collected: totalCollected, payment_status: paymentStatus, discount_amount: discount } };
}

function upsertPayment(p) {
  const found = findRow(SHEETS.PAYMENTS, 'booking_id', p.booking_id);
  const paymentId = found ? rowObject(found.headers, found.values).payment_id : nextId(SHEETS.PAYMENTS, 'PAY');
  const createdAt = found ? rowObject(found.headers, found.values).created_at || nowIso() : nowIso();
  const values = [
    paymentId, p.booking_id, p.customer_name, p.phone_number, p.tier_id, p.booking_date, p.payment_date, p.completed_at,
    p.booking_type, p.gross_total, p.discount_amount, p.amount_due, p.cash_collected, p.online_method, p.online_collected,
    p.total_collected, p.payment_status, p.notes || '', createdAt, nowIso(),
    p.assigned_pc_ids || '', p.pc_names || '', p.tier_name || tierNameById(p.tier_id),
    Number(p.duration_minutes) || 0, Number(p.pcs_required) || 1,
    p.cashier_id || '', p.cashier_name || '', p.shift_id || '',
  ];
  if (found) sheet(SHEETS.PAYMENTS).getRange(found.row, 1, 1, values.length).setValues([values]);
  else sheet(SHEETS.PAYMENTS).appendRow(values);
}

// ---------- Member topups ----------
function getMemberTopups() { return { success: true, data: cachedReadAll(SHEETS.MEMBER_TOPUPS, CACHE_KEYS.TOPUPS, 30) }; }
function addMemberTopup(p) {
  const amount = Number(p.amount) || 0;
  if (amount <= 0) return { success: false, error: 'Topup amount must be greater than 0.' };
  const id = nextId(SHEETS.MEMBER_TOPUPS, 'TOP');
  const date = p.topup_date || todayIso();
  const actor = actorFromPayload(p);
  sheet(SHEETS.MEMBER_TOPUPS).appendRow([
    id,
    p.member_name || '',
    p.phone_number || '',
    amount,
    date,
    p.payment_method || 'Cash',
    p.notes || '',
    nowIso(),
    nowIso(),
    actor.cashier_id,
    actor.cashier_name,
    actor.shift_id,
  ]);
  upsertCustomer(p.member_name, p.phone_number, false);
  clearAppCache();
  return { success: true, data: { topup_id: id } };
}
function deleteMemberTopup(p) {
  const found = findRow(SHEETS.MEMBER_TOPUPS, 'topup_id', p.topup_id);
  if (!found) return { success: false, error: 'Topup not found' };
  sheet(SHEETS.MEMBER_TOPUPS).deleteRow(found.row);
  clearAppCache();
  return { success: true };
}

// ---------- Expenses ----------
function getExpenses() { return { success: true, data: cachedReadAll(SHEETS.EXPENSES, CACHE_KEYS.EXPENSES, 30) }; }
function addExpense(p) {
  const amount = Number(p.amount) || 0;
  if (amount <= 0) return { success: false, error: 'Expense amount must be greater than 0.' };
  const id = nextId(SHEETS.EXPENSES, 'EXP');
  const actor = actorFromPayload(p);
  sheet(SHEETS.EXPENSES).appendRow([
    id,
    p.expense_date || todayIso(),
    p.category || 'Miscellaneous',
    amount,
    p.notes || '',
    nowIso(),
    nowIso(),
    p.payment_method || 'Cash',
    actor.cashier_id,
    actor.cashier_name,
    actor.shift_id,
  ]);
  clearAppCache();
  return { success: true, data: { expense_id: id } };
}
function deleteExpense(p) {
  const found = findRow(SHEETS.EXPENSES, 'expense_id', p.expense_id);
  if (!found) return { success: false, error: 'Expense not found' };
  sheet(SHEETS.EXPENSES).deleteRow(found.row);
  clearAppCache();
  return { success: true };
}

function tierNameById(tierId) {
  const tier = cachedReadAll(SHEETS.TIERS, CACHE_KEYS.TIERS, 60).find(t => String(t.tier_id) === String(tierId));
  return tier ? String(tier.tier_name || tier.tier_id) : String(tierId || 'Unknown');
}
function pcMaps() {
  const pcs = cachedReadAll(SHEETS.PCS, CACHE_KEYS.PCS, 30);
  const map = {};
  pcs.forEach(p => { map[String(p.pc_id)] = p; });
  return map;
}
function pcNamesForIds(ids) {
  const map = pcMaps();
  return String(ids || '').split(',').map(s => s.trim()).filter(Boolean).map(id => map[id] ? map[id].pc_name : id).join(',');
}
function monthKey(value) {
  const d = fmtDate(value || '');
  return d ? d.slice(0, 7) : '';
}
function yearKey(value) {
  const d = fmtDate(value || '');
  return d ? d.slice(0, 4) : '';
}
function addToMap(map, key, base, amount, hours, bookingId) {
  if (!map[key]) map[key] = Object.assign({ revenue: 0, bookings: 0, hours: 0, _bookingIds: {} }, base);
  map[key].revenue += amount;
  map[key].hours += hours || 0;
  if (bookingId && !map[key]._bookingIds[bookingId]) {
    map[key]._bookingIds[bookingId] = true;
    map[key].bookings += 1;
  } else if (!bookingId) {
    map[key].bookings += 1;
  }
}
function cleanBreakdownRow(row) {
  return {
    month: row.month,
    booking_revenue: Math.round(row.booking_revenue),
    topups: Math.round(row.topups),
    expenses: Math.round(row.expenses),
    total_revenue: Math.round(row.total_revenue),
    net: Math.round(row.net),
  };
}

// ---------- Dashboard + Revenue ----------
function getPayments() { return { success: true, data: cachedReadAll(SHEETS.PAYMENTS, CACHE_KEYS.PAYMENTS, 30) }; }

function getRevenueSummary() {
  const payments = cachedReadAll(SHEETS.PAYMENTS, CACHE_KEYS.PAYMENTS, 30);
  const topups = cachedReadAll(SHEETS.MEMBER_TOPUPS, CACHE_KEYS.TOPUPS, 30);
  const expenses = cachedReadAll(SHEETS.EXPENSES, CACHE_KEYS.EXPENSES, 30);
  const settings = getSettingsMap();
  const today = todayIso();
  const month = today.slice(0, 7);
  const data = {
    currency: settings.currency || 'PKR',
    todays_booking_revenue: 0,
    monthly_booking_revenue: 0,
    todays_revenue: 0,
    todays_cash: 0,
    todays_online: 0,
    monthly_revenue: 0,
    monthly_cash: 0,
    monthly_online: 0,
    todays_topups: 0,
    monthly_topups: 0,
    todays_expenses: 0,
    monthly_expenses: 0,
    todays_net: 0,
    monthly_net: 0,
    todays_payments: 0,
    monthly_payments: 0,
  };
  payments.forEach(p => {
    if (p.payment_status === 'Void') return;
    const payDate = fmtDate(p.payment_date || (p.completed_at ? String(p.completed_at).slice(0, 10) : ''));
    const total = Number(p.total_collected) || 0;
    const cash = Number(p.cash_collected) || 0;
    const online = Number(p.online_collected) || 0;
    if (payDate === today) {
      data.todays_booking_revenue += total;
      data.todays_revenue += total;
      data.todays_cash += cash;
      data.todays_online += online;
      data.todays_payments++;
    }
    if (payDate.slice(0, 7) === month) {
      data.monthly_booking_revenue += total;
      data.monthly_revenue += total;
      data.monthly_cash += cash;
      data.monthly_online += online;
      data.monthly_payments++;
    }
  });
  topups.forEach(t => {
    const date = fmtDate(t.topup_date || '');
    const amount = Number(t.amount) || 0;
    if (date === today) {
      data.todays_topups += amount;
      data.todays_revenue += amount;
    }
    if (date.slice(0, 7) === month) {
      data.monthly_topups += amount;
      data.monthly_revenue += amount;
    }
  });
  expenses.forEach(e => {
    const date = fmtDate(e.expense_date || '');
    const amount = Number(e.amount) || 0;
    if (date === today) data.todays_expenses += amount;
    if (date.slice(0, 7) === month) data.monthly_expenses += amount;
  });
  data.todays_net = data.todays_revenue - data.todays_expenses;
  data.monthly_net = data.monthly_revenue - data.monthly_expenses;
  return { success: true, data };
}

function getRevenueAnalytics(p) {
  const settings = getSettingsMap();
  const selectedMonth = String(p.month || todayIso().slice(0, 7));
  const selectedYear = String(p.year || selectedMonth.slice(0, 4) || todayIso().slice(0, 4));
  const payments = cachedReadAll(SHEETS.PAYMENTS, CACHE_KEYS.PAYMENTS, 30).filter(p => p.payment_status !== 'Void');
  const topups = cachedReadAll(SHEETS.MEMBER_TOPUPS, CACHE_KEYS.TOPUPS, 30);
  const expenses = cachedReadAll(SHEETS.EXPENSES, CACHE_KEYS.EXPENSES, 30);
  const tiers = cachedReadAll(SHEETS.TIERS, CACHE_KEYS.TIERS, 60);
  const pcsById = pcMaps();
  const bookingRows = getBookingsRaw();
  const bookingsById = {};
  bookingRows.forEach(b => { bookingsById[String(b.booking_id)] = b; });

  const tierNames = {};
  tiers.forEach(t => { tierNames[String(t.tier_id)] = String(t.tier_name || t.tier_id); });

  const totals = {
    month_booking_revenue: 0, month_topups: 0, month_expenses: 0, month_total_revenue: 0, month_net: 0,
    year_booking_revenue: 0, year_topups: 0, year_expenses: 0, year_total_revenue: 0, year_net: 0,
  };
  const tierMap = {};
  const pcMap = {};
  const monthly = {};
  for (let m = 1; m <= 12; m++) {
    const key = selectedYear + '-' + String(m).padStart(2, '0');
    monthly[key] = { month: key, booking_revenue: 0, topups: 0, expenses: 0, total_revenue: 0, net: 0 };
  }

  payments.forEach(pay => {
    const payDate = fmtDate(pay.payment_date || (pay.completed_at ? String(pay.completed_at).slice(0,10) : ''));
    const mKey = payDate.slice(0, 7);
    const yKey = payDate.slice(0, 4);
    const amount = Number(pay.total_collected) || 0;
    const booking = bookingsById[String(pay.booking_id)] || {};
    const tierId = String(pay.tier_id || booking.tier_id || 'Unknown');
    const tierName = String(pay.tier_name || tierNames[tierId] || tierId || 'Unknown');
    const duration = Number(pay.duration_minutes || booking.duration_minutes || 0);
    const pcsRequired = Number(pay.pcs_required || booking.pcs_required || 1) || 1;
    const hoursTotal = (duration / 60) * pcsRequired;
    const bookingId = String(pay.booking_id || '');

    if (mKey === selectedMonth) {
      totals.month_booking_revenue += amount;
      addToMap(tierMap, tierId, { tier_id: tierId, tier_name: tierName }, amount, hoursTotal, bookingId);

      const assignedIds = String(pay.assigned_pc_ids || booking.assigned_pc_ids || '').split(',').map(s => s.trim()).filter(Boolean);
      const splitAmount = assignedIds.length ? amount / assignedIds.length : 0;
      const splitHours = assignedIds.length ? (duration / 60) : 0;
      assignedIds.forEach(pcId => {
        const pc = pcsById[pcId] || {};
        const pcTierId = String(pc.tier_id || tierId);
        const pcTierName = String(tierNames[pcTierId] || tierName);
        addToMap(pcMap, pcId, { pc_id: pcId, pc_name: pc.pc_name || pcId, tier_id: pcTierId, tier_name: pcTierName }, splitAmount, splitHours, bookingId);
      });
    }
    if (yKey === selectedYear) {
      totals.year_booking_revenue += amount;
      if (!monthly[mKey]) monthly[mKey] = { month: mKey, booking_revenue: 0, topups: 0, expenses: 0, total_revenue: 0, net: 0 };
      monthly[mKey].booking_revenue += amount;
    }
  });

  topups.forEach(t => {
    const d = fmtDate(t.topup_date || '');
    const amount = Number(t.amount) || 0;
    const mKey = d.slice(0, 7);
    const yKey = d.slice(0, 4);
    if (mKey === selectedMonth) totals.month_topups += amount;
    if (yKey === selectedYear) {
      totals.year_topups += amount;
      if (!monthly[mKey]) monthly[mKey] = { month: mKey, booking_revenue: 0, topups: 0, expenses: 0, total_revenue: 0, net: 0 };
      monthly[mKey].topups += amount;
    }
  });

  expenses.forEach(e => {
    const d = fmtDate(e.expense_date || '');
    const amount = Number(e.amount) || 0;
    const mKey = d.slice(0, 7);
    const yKey = d.slice(0, 4);
    if (mKey === selectedMonth) totals.month_expenses += amount;
    if (yKey === selectedYear) {
      totals.year_expenses += amount;
      if (!monthly[mKey]) monthly[mKey] = { month: mKey, booking_revenue: 0, topups: 0, expenses: 0, total_revenue: 0, net: 0 };
      monthly[mKey].expenses += amount;
    }
  });

  totals.month_total_revenue = totals.month_booking_revenue + totals.month_topups;
  totals.month_net = totals.month_total_revenue - totals.month_expenses;
  totals.year_total_revenue = totals.year_booking_revenue + totals.year_topups;
  totals.year_net = totals.year_total_revenue - totals.year_expenses;

  const monthlyBreakdown = Object.keys(monthly).sort().map(k => {
    monthly[k].total_revenue = monthly[k].booking_revenue + monthly[k].topups;
    monthly[k].net = monthly[k].total_revenue - monthly[k].expenses;
    return cleanBreakdownRow(monthly[k]);
  });

  function finishRows(map) {
    return Object.keys(map).map(k => {
      const row = map[k];
      delete row._bookingIds;
      row.revenue = Math.round(row.revenue);
      row.hours = Math.round(row.hours * 100) / 100;
      return row;
    }).sort((a, b) => b.revenue - a.revenue);
  }

  Object.keys(totals).forEach(k => { totals[k] = Math.round(totals[k]); });
  const data = {
    currency: settings.currency || 'PKR',
    selected_month: selectedMonth,
    selected_year: selectedYear,
    totals,
    tier_revenue: finishRows(tierMap),
    pc_revenue: finishRows(pcMap),
    monthly_breakdown: monthlyBreakdown,
  };
  return { success: true, data };
}

function getDashboardSummary() {
  const cached = cacheGet(CACHE_KEYS.DASHBOARD);
  if (cached) return { success: true, data: cached };

  const pcs = cachedReadAll(SHEETS.PCS, CACHE_KEYS.PCS, 30);
  const bookings = getBookingsRaw();
  const settings = getSettingsMap();
  const today = todayIso();
  const nowMin = toMinutes(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'HH:mm'));

  const bookedNowIds = new Set();
  let todaysBookings = 0, pending = 0;
  bookings.forEach(b => {
    const dateStr = fmtDate(b.booking_date);
    if (dateStr === today) {
      todaysBookings++;
      if (b.status === 'Pending') pending++;
      if ((b.status === 'Pending' || b.status === 'Confirmed')) {
        const bs = toMinutes(b.start_time);
        const be = normalizeEnd(bs, toMinutes(b.end_time));
        if (bs <= nowMin && be > nowMin) {
          String(b.assigned_pc_ids || '').split(',').map(s => s.trim()).filter(Boolean).forEach(x => bookedNowIds.add(x));
        }
      }
    }
  });
  const activePcs = pcs.filter(p => p.status === 'Active');
  const revenue = getRevenueSummary().data;
  const data = {
    total_pcs: pcs.length,
    available_now: activePcs.filter(p => !bookedNowIds.has(p.pc_id)).length,
    booked_now: bookedNowIds.size,
    todays_bookings: todaysBookings,
    pending_bookings: pending,
    todays_revenue: revenue.todays_revenue,
    todays_cash: revenue.todays_cash,
    todays_online: revenue.todays_online,
    monthly_revenue: revenue.monthly_revenue,
    monthly_cash: revenue.monthly_cash,
    monthly_online: revenue.monthly_online,
    todays_topups: revenue.todays_topups,
    monthly_topups: revenue.monthly_topups,
    todays_expenses: revenue.todays_expenses,
    monthly_expenses: revenue.monthly_expenses,
    todays_net: revenue.todays_net,
    monthly_net: revenue.monthly_net,
    currency: settings.currency || revenue.currency || 'PKR',
  };
  cachePut(CACHE_KEYS.DASHBOARD, data, 10);
  return { success: true, data };
}

function getDashboardData() {
  return {
    success: true,
    data: {
      summary: getDashboardSummary().data,
      tiers: getTiers().data,
    },
  };
}

function getBookingsPageData() {
  return {
    success: true,
    data: {
      bookings: getBookings().data,
      tiers: getTiers().data,
      pcs: getPCs().data,
    },
  };
}

// ---------- Settings ----------
function getSettings() { return { success: true, data: cachedReadAll(SHEETS.SETTINGS, CACHE_KEYS.SETTINGS, 60) }; }
function updateSettings(p) {
  const s = sheet(SHEETS.SETTINGS);
  const values = s.getDataRange().getValues();
  const map = {};
  for (let i = 1; i < values.length; i++) map[values[i][0]] = i + 1;
  (p.settings || []).forEach(kv => {
    if (map[kv.setting_name]) s.getRange(map[kv.setting_name], 2).setValue(kv.setting_value);
    else s.appendRow([kv.setting_name, kv.setting_value]);
  });
  clearAppCache();
  return { success: true };
}

// ---------- Action registry ----------
const ACTIONS = {
  getPCs, addPC, updatePC, deletePC,
  getTiers, addTier, updateTier, deleteTier,
  getCustomers,
  getCashiers, addCashier, updateCashier, deleteCashier, loginCashier, logoutCashier, closeShift, getMyShiftSummary, getShiftReports,
  getBookings, addBooking, updateBooking, cancelBooking, deleteBooking, completeBooking,
  checkAvailability,
  getDashboardSummary, getDashboardData, getBookingsPageData,
  getPayments, getRevenueSummary, getRevenueAnalytics,
  getMemberTopups, addMemberTopup, deleteMemberTopup,
  getExpenses, addExpense, deleteExpense,
  getSettings, updateSettings,
  cleanupOldBookings,
};
