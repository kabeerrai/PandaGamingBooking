// Server-only configuration for the admin/cashier gate.
// Change these passwords here whenever you want to update site login.
// Because this file is imported only by server functions, it is not meant to be bundled into browser code.
export const ADMIN_PASSWORD = "panda123";
export const CASHIER_PASSWORD = "cashier123";

// Kept for backward compatibility with older code/imports.
export const SITE_PASSWORD = ADMIN_PASSWORD;

// Used to sign the admin session cookie. Keep this long and random.
export const SESSION_SECRET = "panda-gaming-zone-change-this-session-secret-2026";
