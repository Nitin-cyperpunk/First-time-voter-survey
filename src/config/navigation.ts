import { navFor, ROLE_SUPER_ADMIN, type AdminRole } from "@/lib/roles";

export type NavItem = {
  title: string;
  href: string;
  description: string;
};

export function navItemsForRole(role: AdminRole): NavItem[] {
  return navFor(role).map((item) => ({
    title: item.title,
    href: item.href,
    description: item.description,
  }));
}

/** Full super-admin nav — used for header lookups across all registered routes. */
export const allNavItems = navItemsForRole(ROLE_SUPER_ADMIN);

export function getNavItemByHref(
  href: string,
  items: NavItem[] = allNavItems,
): NavItem | undefined {
  const exact = items.find((item) => item.href === href);
  if (exact) return exact;
  return items.find((item) => href.startsWith(`${item.href}/`));
}
