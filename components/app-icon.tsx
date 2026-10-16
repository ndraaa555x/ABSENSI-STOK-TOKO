"use client";

import type { ComponentType, SVGProps } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowLeftRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Database,
  FileText,
  Filter,
  LogOut,
  PackageSearch,
  Printer,
  Search,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Tags,
  UserRound,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import {
  IconBarcode,
  IconBuildingStore,
  IconCalendarEvent,
  IconCategory,
  IconChartBar,
  IconDashboard,
  IconFileInvoice,
  IconPackage,
  IconReceiptRefund,
  IconTruckDelivery,
} from "@tabler/icons-react";

export const appIconNames = [
  "dashboard", "profile", "employees", "attendance", "orders", "refunds",
  "finance-reports", "customers", "leave", "inventory", "notifications",
  "products", "categories", "barcode", "finance", "settings", "transactions",
  "store", "pos", "logout", "search", "requests", "database", "activity", "back",
  "check", "close", "next", "security", "filter", "print", "credit-card",
  "truck", "reports"
] as const;

export type AppIconName = (typeof appIconNames)[number];

const iconMap: Record<AppIconName, ComponentType<SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number }>> = {
  dashboard: IconDashboard,
  profile: UserRound,
  employees: UsersRound,
  attendance: IconCalendarEvent,
  orders: ShoppingCart,
  refunds: IconReceiptRefund,
  "finance-reports": FileText,
  customers: IconBuildingStore,
  leave: CalendarDays,
  inventory: IconPackage,
  notifications: Bell,
  products: PackageSearch,
  categories: IconCategory,
  barcode: IconBarcode,
  finance: Wallet,
  settings: Settings,
  transactions: ArrowLeftRight,
  store: IconBuildingStore,
  pos: IconFileInvoice,
  logout: LogOut,
  search: Search,
  requests: ClipboardList,
  database: Database,
  activity: Activity,
  back: ArrowLeft,
  check: CheckCircle2,
  close: X,
  next: ChevronRight,
  security: ShieldCheck,
  filter: Filter,
  print: Printer,
  "credit-card": CreditCard,
  truck: IconTruckDelivery,
  reports: IconChartBar,
};

type AppIconProps = {
  name: AppIconName;
  size?: number;
  strokeWidth?: number;
  className?: string;
  title?: string;
};

export default function AppIcon({ name, size = 18, strokeWidth = 1.8, className, title }: AppIconProps) {
  const Icon = iconMap[name];
  return <Icon size={size} strokeWidth={strokeWidth} className={className} aria-hidden={title ? undefined : true} role={title ? "img" : undefined} aria-label={title} />;
}
