export const ROLE_SUPER_ADMIN = "SUPER_ADMIN" as const;
export const ROLE_ADMIN = "ADMIN" as const;

export const STATUS_ACTIVE = "ACTIVE" as const;
export const STATUS_INACTIVE = "INACTIVE" as const;

export type AdminRole = typeof ROLE_SUPER_ADMIN | typeof ROLE_ADMIN;
export type AdminStatus = typeof STATUS_ACTIVE | typeof STATUS_INACTIVE;

export type AdminCapability =
  | "dashboard"
  | "respondents"
  | "dm"
  | "verify"
  | "screener"
  | "referrals"
  | "analytics"
  | "export"
  | "settings"
  | "admin_management"
  | "manage_roles";

export type AdminNavItem = {
  capability: AdminCapability;
  title: string;
  href: string;
  description: string;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    capability: "dashboard",
    title: "Metrics",
    href: "/metrics",
    description: "Overview of panel activity and referral metrics",
  },
  {
    capability: "respondents",
    title: "Respondents",
    href: "/respondents",
    description: "Registered participants and leads",
  },
  {
    capability: "dm",
    title: "DM & Verify",
    href: "/dm-verify",
    description: "Instagram DM verification workflow",
  },
  {
    capability: "screener",
    title: "Terminations",
    href: "/terminations",
    description: "Form rule terminations and matched response details",
  },
  {
    capability: "referrals",
    title: "Referrals",
    href: "/referrals",
    description: "Referral attribution and reward status",
  },
  {
    capability: "screener",
    title: "Forms",
    href: "/forms",
    description: "Registration / screener form versions",
  },
  {
    capability: "dm",
    title: "Message Templates",
    href: "/message-templates",
    description: "WhatsApp and Instagram message templates with placeholders",
  },
  {
    capability: "export",
    title: "Payouts",
    href: "/payouts",
    description: "Referral earnings with payment status",
  },
  {
    capability: "settings",
    title: "Settings",
    href: "/settings",
    description: "Study configuration and operational settings",
  },
  {
    capability: "admin_management",
    title: "Admin Management",
    href: "/admin/users",
    description: "Create and manage admin accounts",
  },
];

const PERMISSION_MATRIX: Record<AdminRole, Record<AdminCapability, boolean>> = {
  [ROLE_SUPER_ADMIN]: {
    dashboard: true,
    respondents: true,
    dm: true,
    verify: true,
    screener: true,
    referrals: true,
    analytics: true,
    export: true,
    settings: true,
    admin_management: true,
    manage_roles: true,
  },
  [ROLE_ADMIN]: {
    dashboard: true,
    respondents: true,
    dm: true,
    verify: true,
    screener: true,
    referrals: true,
    analytics: true,
    export: true,
    settings: false,
    admin_management: false,
    manage_roles: false,
  },
};

export function canAccess(role: AdminRole, capability: AdminCapability): boolean {
  return PERMISSION_MATRIX[role][capability] ?? false;
}

export function navFor(role: AdminRole): AdminNavItem[] {
  return ADMIN_NAV_ITEMS.filter((item) => canAccess(role, item.capability));
}

export function isSuperAdmin(role: AdminRole): boolean {
  return role === ROLE_SUPER_ADMIN;
}

export function rolesInclude(role: AdminRole, allowed: AdminRole | AdminRole[]): boolean {
  const list = Array.isArray(allowed) ? allowed : [allowed];
  return list.includes(role);
}
