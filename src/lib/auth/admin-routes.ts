import { ADMIN_NAV_ITEMS } from "@/lib/roles";

const ADMIN_INDEX_PATH = "/admin";
const ADMIN_LOGIN_PATH = "/admin/login";
const ADMIN_API_PREFIX = "/api/admin";
const ADMIN_LOGIN_API = "/api/admin/login";

/** Public registration/survey assets under /public/forms — not the admin UI. */
const PUBLIC_FORM_ASSET_PATTERN = /^\/forms\/.+\.(js|html)$/i;

export function isPublicFormAssetPath(pathname: string): boolean {
  return PUBLIC_FORM_ASSET_PATTERN.test(pathname);
}

export function isAdminPanelPath(pathname: string): boolean {
  if (pathname === ADMIN_LOGIN_PATH) return false;
  if (isPublicFormAssetPath(pathname)) return false;

  if (pathname === ADMIN_INDEX_PATH) return true;

  return ADMIN_NAV_ITEMS.some((item) => {
    if (pathname === item.href) return true;
    // Admin "Forms" page is exactly /forms; do not treat /forms/*.js|html as admin.
    if (item.href === "/forms") return false;
    return pathname.startsWith(`${item.href}/`);
  });
}

export function isProtectedAdminApiPath(pathname: string): boolean {
  if (pathname === ADMIN_LOGIN_API) return false;
  return pathname.startsWith(ADMIN_API_PREFIX);
}

export function isCoarseAdminProtectedPath(pathname: string): boolean {
  return isAdminPanelPath(pathname) || isProtectedAdminApiPath(pathname);
}
