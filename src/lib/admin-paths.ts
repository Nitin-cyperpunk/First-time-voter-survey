/** Admin UI lives under /admin-ftv. APIs stay at /api/admin. */
export const ADMIN_BASE_PATH = "/admin-ftv";
export const ADMIN_LOGIN_PATH = `${ADMIN_BASE_PATH}/login`;
export const ADMIN_INDEX_PATH = ADMIN_BASE_PATH;
export const ADMIN_DEFAULT_HOME = `${ADMIN_BASE_PATH}/metrics`;

export function adminPath(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${ADMIN_BASE_PATH}${suffix}`;
}
