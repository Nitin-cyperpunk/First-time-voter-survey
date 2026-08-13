import { adminPath } from "@/lib/admin-paths";

export const ROLE_SUPER_ADMIN = "SUPER_ADMIN" as const;
export const ROLE_ADMIN = "ADMIN" as const;

export const STATUS_ACTIVE = "ACTIVE" as const;
export const STATUS_INACTIVE = "INACTIVE" as const;

export type AdminRole = typeof ROLE_SUPER_ADMIN | typeof ROLE_ADMIN;
export type AdminStatus = typeof STATUS_ACTIVE | typeof STATUS_INACTIVE;

export type AdminCapability =
  | "dashboard"
  | "respondents"
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
    href: adminPath("/metrics"),
    description: "Overview of study activity and referral metrics",
  },
  {
    capability: "respondents",
    title: "Respondents",
    href: adminPath("/respondents"),
    description: "Registered participants and leads",
  },
  {
    capability: "screener",
    title: "Terminations",
    href: adminPath("/terminations"),
    description: "Form rule terminations and matched response details",
  },
  {
    capability: "referrals",
    title: "Referrals",
    href: adminPath("/referrals"),
    description: "Referral attribution and reward status",
  },
  {
    capability: "screener",
    title: "Forms",
    href: adminPath("/forms"),
    description: "FTV-v1 screener form versions",
  },
  {
    capability: "referrals",
    title: "Message Templates",
    href: adminPath("/message-templates"),
    description: "WhatsApp and Instagram referral share templates",
  },
  {
    capability: "export",
    title: "Payouts",
    href: adminPath("/payouts"),
    description: "Referral and survey earnings with payment status",
  },
  {
    capability: "settings",
    title: "Config",
    href: adminPath("/settings"),
    description: "Form open/close, city capacity, and study configuration",
  },
  {
    capability: "admin_management",
    title: "Admin Management",
    href: adminPath("/users"),
    description: "Create and manage admin accounts",
  },
];

const PERMISSION_MATRIX: Record<AdminRole, Record<AdminCapability, boolean>> = {
  [ROLE_SUPER_ADMIN]: {
    dashboard: true,
    respondents: true,
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
