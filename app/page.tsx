"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useState } from "react";
import { LayoutDashboard, UserRound, Users, CalendarCheck, ShoppingCart, RotateCcw, Banknote, Store, CalendarDays, Bell, Boxes, Settings, ArrowLeftRight, Hand, Inbox, Menu, X } from "lucide-react";
import { IconCategory, IconBarcode, IconCashRegister, IconPackage } from "@tabler/icons-react";
import Link from "next/link";
import { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Role = "owner" | "admin" | "hrd" | "employee";
type Profile = { id: string; email: string; full_name: string | null; role: Role; is_active: boolean };
type Counts = { employees: number; attendance: number; products: number; finances: number; orders:number; refunds:number; reports:number };
type AttendanceRow = { id: string; employee_id: string; work_date: string; check_in_at: string | null; check_out_at: string | null; status: string; check_in_method: string | null; check_out_method: string | null; notes?: string|null; recorded_by?: string|null; recorded_by_profile?: AuditProfile; evidence_path: string | null; employees: { full_name: string; employee_code: string } | null; evidence_url?: string | null };
type DailyAttendanceRow = { employee_id: string; check_out_at: string | null; employees: { full_name: string; employee_code: string } | null };
type AttendanceMode = "once_daily" | "multiple_sessions";
type ModuleKey = "dashboard" | "profile" | "employees" | "attendance" | "orders" | "transactions" | "refunds" | "finance-reports" | "customers" | "inventory" | "categories" | "products" | "cashier" | "finance" | "barcode" | "leave" | "notifications" | "settings";
type OrderProduct = { id:string; name:string; sku:string; unit:string; sale_price:number; current_stock:number; is_active:boolean };
type OrderItem = { id:string; quantity:number; unit_price:number; line_total:number; product_id:string; products:{name:string;sku:string;unit:string}|null };
type OrderCartLine = { product_id:string; quantity:string };
type OrderCreator = {full_name:string|null;email:string}|null;
type AuditProfile = {full_name:string|null;email:string}|null;
type OrderRow = { id:string; order_code:string; status:string; notes:string|null; created_at:string; ordered_by:string; reviewed_by?:string|null; reviewed_at?:string|null; customer_id:string|null; payment_method?:string|null; payment_evidence_path?:string|null; stock_reserved?:boolean; business_customers:{store_name:string;customer_code:string}|null; ordered_by_profile?:OrderCreator; reviewed_by_profile?:AuditProfile; product_order_items:OrderItem[] };
type CustomerRow = {id:string;customer_code:string;store_name:string;owner_name:string|null;phone:string|null;email:string|null;address:string|null;notes:string|null;created_by:string;is_active:boolean;created_at:string;order_count:number;last_order_at:string|null};
type RefundRow = { id:string; refund_code:string; order_id:string; order_item_id:string; requested_by:string; reviewed_by?:string|null; reviewed_at?:string|null; requested_by_profile?:AuditProfile; reviewed_by_profile?:AuditProfile; quantity:number; amount:number; reason:string; status:string; created_at:string; product_orders:{order_code:string;customer_id?:string|null;business_customers?:{store_name:string;customer_code:string}|null}|null };
type FinanceReportRow = { id:string; report_code:string; report_type:string; amount:number; description:string; payment_method:string|null; status:string; created_at:string; submitted_by:string; reviewed_by?:string|null; reviewed_at?:string|null; submitted_by_profile?:AuditProfile; reviewed_by_profile?:AuditProfile; related_order_id?:string|null; related_customer_id?:string|null; business_customers?:{store_name:string;customer_code:string}|null; product_orders?:{order_code:string;business_customers?:{store_name:string;customer_code:string}|null}|null };
type ProductRow = {id:string;sku:string;barcode_value:string;name:string;category_id:string|null;unit:string;description:string|null;sale_price:number;current_stock:number;minimum_stock:number;storage_location:string|null;is_active:boolean;product_categories:{name:string}|null;product_costs?:{cost_price:number}|null};
type ProductCategory = {id:string;name:string};
type StockMovementRow = {id:string;product_id:string;movement_type:string;quantity:number;unit_cost:number|null;reference_code:string|null;reason:string|null;movement_at:string;created_by?:string|null;created_by_profile?:AuditProfile;products:{name:string;sku:string}|null};
type FinancialCategory = {id:string;name:string;transaction_type:"income"|"expense"};
type FinancialTransactionRow = {id:string;transaction_code:string;transaction_type:"income"|"expense";amount:number;transaction_at:string;payment_method:string|null;description:string;reference_code:string|null;status:string;created_by?:string|null;created_by_profile?:AuditProfile;financial_categories:{name:string}|null};
type LeaveRow = {id:string;employee_id:string;leave_type:string;start_date:string;end_date:string;reason:string;status:string;created_at:string;reviewed_by?:string|null;reviewed_at?:string|null;reviewed_by_profile?:AuditProfile;employees:{full_name:string;employee_code:string;profile_id:string|null}|null};
type NotificationRow = {id:string;title:string;message:string;notification_type:string;read_at:string|null;created_at:string};

type EmployeeRow = { id:string; employee_code:string; full_name:string; email:string|null; phone:string|null; job_title:string|null; employment_status:"active"|"inactive"; joined_on:string|null; notes:string|null; profile_id?:string|null };
type AccountRow = { id:string; email:string; full_name:string|null; role:Role; is_active:boolean; employee?:{employee_code:string;employment_status:string;full_name:string}|null };
const roleModules: Record<Role, ModuleKey[]> = {
  owner: ["dashboard","profile","employees","attendance","orders","transactions","refunds","finance-reports","customers","inventory","categories","products","cashier","finance","barcode","leave","notifications","settings"],
  admin: ["dashboard","profile","employees","attendance","orders","transactions","refunds","finance-reports","customers","inventory","categories","products","cashier","barcode","leave","notifications","settings"],
  hrd: ["dashboard","profile","employees","attendance","leave","notifications"],
  employee: ["dashboard","profile","attendance","orders","transactions","refunds","finance-reports","customers","leave","notifications"]
};
const canAccessModule = (role: Role | undefined, key: ModuleKey) => Boolean(role && roleModules[role]?.includes(key));
const roleName = (role: Role | undefined) => role === "owner" ? "OWNER" : role === "admin" ? "ADMIN" : role === "hrd" ? "HRD / SDM" : "KARYAWAN";
const navItems: { key: ModuleKey; icon: ReactNode; label: string; group: string }[] = [
  { key: "dashboard", icon: <LayoutDashboard size={18}/>, label: "Dashboard", group: "UTAMA" },
  { key: "profile", icon: <UserRound size={18}/>, label: "Profil Saya", group: "AKUN" },
  { key: "employees", icon: <Users size={18}/>, label: "Karyawan", group: "OPERASIONAL" },
  { key: "attendance", icon: <CalendarCheck size={18}/>, label: "Absensi", group: "OPERASIONAL" },
  { key: "categories", icon: <IconCategory size={18}/>, label: "Kategori Produk", group: "INVENTARIS" },
  { key: "products", icon: <IconPackage size={18}/>, label: "Produk", group: "INVENTARIS" },
  { key: "barcode", icon: <IconBarcode size={18}/>, label: "Barcode", group: "INVENTARIS" },
  { key: "cashier", icon: <IconCashRegister size={18}/>, label: "Kasir / POS", group: "TRANSAKSI" },
  { key: "transactions", icon: <ArrowLeftRight size={18}/>, label: "TRX / Transaksi", group: "TRANSAKSI" },
  { key: "orders", icon: <ShoppingCart size={18}/>, label: "Order Produk", group: "TRANSAKSI" },
  { key: "refunds", icon: <RotateCcw size={18}/>, label: "Refund Produk", group: "TRANSAKSI" },
  { key: "finance-reports", icon: <Banknote size={18}/>, label: "Laporan Uang", group: "TRANSAKSI" },
  { key: "customers", icon: <Store size={18}/>, label: "Data Toko / Member", group: "TRANSAKSI" },
  { key: "leave", icon: <CalendarDays size={18}/>, label: "Izin / Cuti", group: "OPERASIONAL" },
  { key: "notifications", icon: <Bell size={18}/>, label: "Notifikasi", group: "UTAMA" },
  { key: "inventory", icon: <Boxes size={18}/>, label: "Inventaris & Stok", group: "INVENTARIS" },
  { key: "finance", icon: <Banknote size={18}/>, label: "Keuangan", group: "MANAJEMEN" },
  { key: "settings", icon: <Settings size={18}/>, label: "Pengaturan", group: "MANAJEMEN" }
];
const descriptions: Record<ModuleKey, string> = {
  dashboard: "Pantau ringkasan data bisnis Anda.",
  profile: "Kelola informasi akun dan lihat data pekerjaan Anda.",
  employees: "Kelola data dan akun karyawan sesuai kewenangan.",
  attendance: "Pantau kehadiran dan riwayat kerja sesuai hak akses.",
  orders: "Ajukan order produk untuk kebutuhan operasional kerja dan pantau status persetujuannya.",
  transactions: "Lihat alur transaksi bisnis dan riwayat order.",
  categories: "Kelola kategori produk dan klasifikasi katalog.",
  products: "Kelola produk, SKU, harga, stok, dan informasi barcode.",
  cashier: "Buka halaman kasir untuk transaksi penjualan toko offline.",
  refunds: "Ajukan pengembalian produk dari order yang sudah disetujui atau dipenuhi.",
  "finance-reports": "Catat uang masuk atau pengeluaran harian untuk diperiksa Admin/Owner.",
  customers: "Daftarkan toko/pembeli sebagai member dan pantau aktivitas order.",
  leave: "Ajukan izin/cuti dan pantau statusnya; Admin/Owner meninjau permohonan karyawan.",
  notifications: "Pusat notifikasi dan pembaruan aktivitas akun.",
  inventory: "Pantau produk dan ketersediaan stok untuk mendukung order kerja.",
  barcode: "Cari produk berdasarkan SKU atau barcode.",
  finance: "Lihat ringkasan transaksi keuangan yang dikelola Owner.",
  settings: "Kelola pengaturan bisnis dan kontrol akses sesuai role."
};

function jakartaDateInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [storePlacementActive, setStorePlacementActive] = useState(false);
  const [storePlacementInfo, setStorePlacementInfo] = useState<{store_id:string;store_code:string;name:string;store_role:string;job_title:string|null}|null>(null);
  const isStoreManager = storePlacementInfo?.store_role === "manager";
  const [myEmployeeProfile, setMyEmployeeProfile] = useState<EmployeeRow | null>(null);
  const [counts, setCounts] = useState<Counts>({ employees: 0, attendance: 0, products: 0, finances: 0, orders:0, refunds:0, reports:0 });
  const [pageLoading, setPageLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [setupPasswordMode, setSetupPasswordMode] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [profileNewPassword, setProfileNewPassword] = useState("");
  const [profileConfirmPassword, setProfileConfirmPassword] = useState("");
  const [profilePasswordNotice, setProfilePasswordNotice] = useState("");
  const [profilePasswordError, setProfilePasswordError] = useState("");
  const [activePage, setActivePage] = useState<ModuleKey>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [businessRefresh, setBusinessRefresh] = useState(0);
  const [orderProducts, setOrderProducts] = useState<OrderProduct[]>([]);
  const [customerRows, setCustomerRows] = useState<CustomerRow[]>([]);
  const [customerStoreName, setCustomerStoreName] = useState("");
  const [customerOwnerName, setCustomerOwnerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");
  const [customerSubmitting, setCustomerSubmitting] = useState(false);
  const [customerNotice, setCustomerNotice] = useState("");
  const [customerError, setCustomerError] = useState("");
  const [selectedOrderCustomerId, setSelectedOrderCustomerId] = useState("");
  const [orderRows, setOrderRows] = useState<OrderRow[]>([]);
  const [refundRows, setRefundRows] = useState<RefundRow[]>([]);
  const [financeReportRows, setFinanceReportRows] = useState<FinanceReportRow[]>([]);
  const [selectedOrderProductId, setSelectedOrderProductId] = useState("");
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [orderCart, setOrderCart] = useState<OrderCartLine[]>([]);
  const [orderHistorySearch, setOrderHistorySearch] = useState("");
  const [orderHistoryStatus, setOrderHistoryStatus] = useState("all");
  const [orderHistoryFrom,setOrderHistoryFrom]=useState("");
  const [orderHistoryTo,setOrderHistoryTo]=useState("");
  const [refundHistorySearch, setRefundHistorySearch] = useState("");
  const [refundHistoryStatus, setRefundHistoryStatus] = useState("all");
  const [refundHistoryFrom,setRefundHistoryFrom]=useState("");
  const [refundHistoryTo,setRefundHistoryTo]=useState("");
  const [moneyHistorySearch, setMoneyHistorySearch] = useState("");
  const [moneyHistoryStatus, setMoneyHistoryStatus] = useState("all");
  const [moneyHistoryFrom,setMoneyHistoryFrom]=useState("");
  const [moneyHistoryTo,setMoneyHistoryTo]=useState("");
  const [selectedCustomerProfileId, setSelectedCustomerProfileId] = useState<string|null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string|null>(null);
  const [grossProfit, setGrossProfit] = useState(0);
  const [grossProfitMissingCostCount,setGrossProfitMissingCostCount]=useState(0);
  const [orderNotes, setOrderNotes] = useState("");
  const [orderPaymentMethod, setOrderPaymentMethod] = useState("cash");
  const [orderEvidenceFile, setOrderEvidenceFile] = useState<File|null>(null);
  const [financeReportRelatedOrderId, setFinanceReportRelatedOrderId] = useState("");
  const [financeReportCustomerId, setFinanceReportCustomerId] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderNotice, setOrderNotice] = useState("");
  const [orderError, setOrderError] = useState("");
  const [refundCustomerId, setRefundCustomerId] = useState("");
  const [refundOrderId, setRefundOrderId] = useState("");
  const [refundItemId, setRefundItemId] = useState("");
  const [refundQuantity, setRefundQuantity] = useState("1");
  const [refundReason, setRefundReason] = useState("");
  const [refundSubmitting, setRefundSubmitting] = useState(false);
  const [refundNotice, setRefundNotice] = useState("");
  const [refundError, setRefundError] = useState("");
  const [financeReportType, setFinanceReportType] = useState<"income"|"expense">("income");
  const [financeReportAmount, setFinanceReportAmount] = useState("");
  const [financeReportDescription, setFinanceReportDescription] = useState("");
  const [financeReportPayment, setFinanceReportPayment] = useState("cash");
  const [financeReportReference, setFinanceReportReference] = useState("");
  const [financeReportSubmitting, setFinanceReportSubmitting] = useState(false);
  const [financeReportNotice, setFinanceReportNotice] = useState("");
  const [financeReportError, setFinanceReportError] = useState("");
  const [productRows,setProductRows]=useState<ProductRow[]>([]);
  const [productCategories,setProductCategories]=useState<ProductCategory[]>([]);
  const [stockMovementRows,setStockMovementRows]=useState<StockMovementRow[]>([]);
  const [inventorySearch,setInventorySearch]=useState("");
  const [showInactiveProducts,setShowInactiveProducts]=useState(false);
  const [inventoryNotice,setInventoryNotice]=useState("");
  const [inventoryError,setInventoryError]=useState("");
  const [inventorySaving,setInventorySaving]=useState(false);
  const [editingProductId,setEditingProductId]=useState<string|null>(null);
  const [newProductCategoryName,setNewProductCategoryName]=useState("");
  const [newFinancialCategoryName,setNewFinancialCategoryName]=useState("");
  const [newFinancialCategoryType,setNewFinancialCategoryType]=useState<"income"|"expense">("income");
  const [inventoryForm,setInventoryForm]=useState({sku:"",barcode_value:"",name:"",category_id:"",unit:"pcs",description:"",sale_price:"0",cost_price:"0",initial_stock:"0",minimum_stock:"0",storage_location:""});
  const [stockForm,setStockForm]=useState({product_id:"",movement_type:"purchase_in",quantity:"1",unit_cost:"",reference_code:"",reason:"",notes:""});
  const [stockSaving,setStockSaving]=useState(false);
  const [barcodeSearch,setBarcodeSearch]=useState("");
  const [financialRows,setFinancialRows]=useState<FinancialTransactionRow[]>([]);
  const [financialCategories,setFinancialCategories]=useState<FinancialCategory[]>([]);
  const [financialSearch,setFinancialSearch]=useState("");
  const [financialType,setFinancialType]=useState<"income"|"expense">("income");
  const [financialAmount,setFinancialAmount]=useState("");
  const [financialCategoryId,setFinancialCategoryId]=useState("");
  const [financialPayment,setFinancialPayment]=useState("cash");
  const [financialDescription,setFinancialDescription]=useState("");
  const [financialReference,setFinancialReference]=useState("");
  const [financialSaving,setFinancialSaving]=useState(false);
  const [financialNotice,setFinancialNotice]=useState("");
  const [financialError,setFinancialError]=useState("");
  const [leaveRows,setLeaveRows]=useState<LeaveRow[]>([]);
  const [leaveEmployeeId,setLeaveEmployeeId]=useState("");
  const [leaveType,setLeaveType]=useState("leave");
  const [leaveStart,setLeaveStart]=useState(jakartaDateInput());
  const [leaveEnd,setLeaveEnd]=useState(jakartaDateInput());
  const [leaveReason,setLeaveReason]=useState("");
  const [leaveNotice,setLeaveNotice]=useState("");
  const [leaveError,setLeaveError]=useState("");
  const [leaveSaving,setLeaveSaving]=useState(false);
  const [notificationRows,setNotificationRows]=useState<NotificationRow[]>([]);
  const [notificationError,setNotificationError]=useState("");

  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const [attendanceStatusDrafts, setAttendanceStatusDrafts] = useState<Record<string,string>>({});
  const [attendanceSavingId, setAttendanceSavingId] = useState<string|null>(null);
  const [dailyAttendanceRows, setDailyAttendanceRows] = useState<DailyAttendanceRow[]>([]);
  const [attendanceMode, setAttendanceMode] = useState<AttendanceMode>("once_daily");
  const [attendanceModeLoading, setAttendanceModeLoading] = useState(false);
  const [attendanceModeSaving, setAttendanceModeSaving] = useState(false);
  const [attendanceModeNotice, setAttendanceModeNotice] = useState("");
  const [attendanceModeError, setAttendanceModeError] = useState("");
  const [employeeRows, setEmployeeRows] = useState<EmployeeRow[]>([]);
  const [employeeLoading, setEmployeeLoading] = useState(false);
  const [employeeSaving, setEmployeeSaving] = useState(false);
  const [employeeError, setEmployeeError] = useState("");
  const [employeeNotice, setEmployeeNotice] = useState("");
  const [editingEmployeeId, setEditingEmployeeId] = useState<string|null>(null);
  const [employeeForm, setEmployeeForm] = useState({employee_code:"",full_name:"",email:"",phone:"",job_title:"",joined_on:jakartaDateInput(),notes:""});
  const [createLoginAccount, setCreateLoginAccount] = useState(false);
  const [newAccountRole, setNewAccountRole] = useState<"employee"|"hrd"|"admin">("employee");
  const [employeePassword, setEmployeePassword] = useState("");
  const [accountRows, setAccountRows] = useState<AccountRow[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountSavingId, setAccountSavingId] = useState<string|null>(null);
  const [accountRefresh, setAccountRefresh] = useState(0);
  const [accountError, setAccountError] = useState("");
  const [accountNotice, setAccountNotice] = useState("");
  const storeScopedAccount = profile?.role === "employee" && storePlacementActive;
  const canAccessCurrentModule = (key: ModuleKey) => (canAccessModule(profile?.role, key) || (key === "cashier" && storePlacementActive)) && (!storeScopedAccount || ["dashboard","profile","attendance","leave","notifications","cashier"].includes(key));
  useEffect(() => { if (storeScopedAccount && !["dashboard","profile","attendance","leave","notifications"].includes(activePage)) setActivePage("dashboard"); }, [storeScopedAccount,activePage]);

  const loadProfileAndCounts = useCallback(async (currentSession: Session) => {
    setDataLoading(true);
    setError("");
    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id,email,full_name,role,is_active")
      .eq("id", currentSession.user.id)
      .maybeSingle();
    if (profileError || !profileData) {
      setError("Profil belum dapat dibaca. Periksa konfigurasi Supabase dan kebijakan RLS.");
      setProfile(null);
      setDataLoading(false);
      return;
    }
    const safeProfile = profileData as Profile;
    setProfile(safeProfile);
    const { data: placementRows, error: placementError } = await supabase.from("offline_store_memberships").select("store_id,store_role,job_title,job_title_id").eq("user_id", safeProfile.id).eq("is_active", true).limit(1);
    const hasPlacement = !placementError && Boolean(placementRows?.length);
    setStorePlacementActive(hasPlacement);
    if (hasPlacement && placementRows?.[0]) {
      const placement = placementRows[0] as {store_id:string;store_role:string;job_title:string|null;job_title_id:string|null};
      const [storeResult,titleResult] = await Promise.all([
        supabase.from("offline_stores").select("store_code,name").eq("id",placement.store_id).maybeSingle(),
        placement.job_title_id ? supabase.from("offline_store_job_titles").select("title").eq("id",placement.job_title_id).maybeSingle() : Promise.resolve({data:null,error:null})
      ]);
      setStorePlacementInfo(storeResult.data ? {store_id:placement.store_id,store_code:storeResult.data.store_code,name:storeResult.data.name,store_role:placement.store_role,job_title:titleResult.data?.title||placement.job_title} : null);
    } else setStorePlacementInfo(null);
    if (!safeProfile.is_active) {
      setError("Akun Anda belum aktif. Hubungi Owner untuk mengaktifkan akses.");
      setDataLoading(false);
      return;
    }
    const isScopedStoreUser = safeProfile.role === "employee" && hasPlacement;
    const [employees, attendance, products, orders, refunds, reports] = await Promise.all([
      supabase.from("employees").select("id", { count: "exact", head: true }),
      supabase.from("attendance_records").select("id", { count: "exact", head: true }),
      isScopedStoreUser
        ? supabase.from("offline_store_products").select("id", { count: "exact", head: true }).eq("store_id", placementRows?.[0]?.store_id || "")
        : supabase.from("products").select("id", { count: "exact", head: true }),
      isScopedStoreUser ? Promise.resolve({count:0,error:null}) : supabase.from("product_orders").select("id", { count: "exact", head: true }),
      isScopedStoreUser ? Promise.resolve({count:0,error:null}) : supabase.from("product_refunds").select("id", { count: "exact", head: true }),
      isScopedStoreUser ? Promise.resolve({count:0,error:null}) : supabase.from("financial_reports").select("id", { count: "exact", head: true })
    ]);
    const finances = safeProfile.role==="owner" ? await supabase.from("financial_transactions").select("id", { count: "exact", head: true }) : {count:0,error:null};
    setCounts({employees:employees.count??0,attendance:attendance.count??0,products:products.count??0,finances:finances.count??0,orders:orders.count??0,refunds:refunds.count??0,reports:reports.count??0});
    const failed = [employees, attendance, products, orders, refunds, reports, finances].some((item) => item.error);
    if (failed) setMessage("Sebagian ringkasan tidak dapat dibaca oleh role atau kebijakan akses saat ini.");
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (!profile?.id) { setMyEmployeeProfile(null); return; }
    let alive = true;
    void supabase.from("employees")
      .select("id,employee_code,full_name,email,phone,job_title,employment_status,joined_on,notes,profile_id")
      .eq("profile_id", profile.id)
      .maybeSingle()
      .then(({ data }) => { if (alive) setMyEmployeeProfile((data ?? null) as EmployeeRow | null); });
    return () => { alive = false; };
  }, [profile?.id]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (data.session) void loadProfileAndCounts(data.session);
      setPageLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!alive) return;
      setSession(nextSession);
      if (nextSession) {
        setMessage("");
        void loadProfileAndCounts(nextSession);
      } else {
        setProfile(null);
        setCounts({ employees: 0, attendance: 0, products: 0, finances: 0, orders:0, refunds:0, reports:0 });
      }
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [loadProfileAndCounts]);

  useEffect(() => { if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("setup-password") === "1") setSetupPasswordMode(true); }, []);

  useEffect(() => {
    if (!session || !profile?.is_active || !["orders","refunds","finance-reports","customers"].includes(activePage)) return;
    let alive = true;
    async function loadBusinessWorkflows() {
      if (activePage === "orders") {
        const [productsResult, ordersResult, customersResult] = await Promise.all([
          supabase.from("products").select("id,name,sku,unit,sale_price,current_stock,is_active").eq("is_active", true).order("name"),
          supabase.from("product_orders").select("id,order_code,status,notes,created_at,ordered_by,reviewed_by,reviewed_at,customer_id,payment_method,payment_evidence_path,stock_reserved,business_customers(store_name,customer_code),ordered_by_profile:profiles!product_orders_ordered_by_fkey(full_name,email),reviewed_by_profile:profiles!product_orders_reviewed_by_fkey(full_name,email),product_order_items(id,product_id,quantity,unit_price,line_total,products(name,sku,unit))").order("created_at", {ascending:false}).limit(100),
          supabase.from("business_customers").select("id,customer_code,store_name,owner_name,phone,email,address,notes,created_by,is_active,created_at").eq("is_active",true).order("store_name").limit(500)
        ]);
        if (!alive) return;
        if (productsResult.error) setOrderError("Daftar produk belum dapat dimuat. Periksa izin inventaris.");
        else { setOrderProducts((productsResult.data ?? []) as unknown as OrderProduct[]); setOrderError(""); }
        if (ordersResult.error) setOrderError("Riwayat order belum dapat dimuat. Periksa izin database.");
        else setOrderRows((ordersResult.data ?? []) as unknown as OrderRow[]);
        if (!customersResult.error) setCustomerRows((customersResult.data??[]).map(c=>({...c,order_count:0,last_order_at:null})) as CustomerRow[]);
      } else if (activePage === "customers") {
        const [customersResult, customerOrdersResult] = await Promise.all([
          supabase.from("business_customers").select("id,customer_code,store_name,owner_name,phone,email,address,notes,created_by,is_active,created_at").order("created_at",{ascending:false}).limit(500),
          supabase.from("product_orders").select("id,order_code,status,notes,created_at,ordered_by,customer_id,payment_method,stock_reserved,business_customers(store_name,customer_code),ordered_by_profile:profiles!product_orders_ordered_by_fkey(full_name,email),product_order_items(id,product_id,quantity,unit_price,line_total,products(name,sku,unit))").not("customer_id","is",null).order("created_at",{ascending:false}).limit(2000)
        ]);
        if (!alive) return;
        if (customersResult.error) setCustomerError("Data toko belum dapat dimuat: "+customersResult.error.message);
        else {
          const orderData = customerOrdersResult.error ? [] : (customerOrdersResult.data??[]); if (!customerOrdersResult.error) setOrderRows((orderData as unknown as OrderRow[]));
          const activity = new Map<string,{count:number;last:string|null}>();
          for (const order of orderData) {
            if (!order.customer_id) continue;
            const old = activity.get(order.customer_id)??{count:0,last:null};
            old.count += 1;
            if (!old.last || order.created_at > old.last) old.last = order.created_at;
            activity.set(order.customer_id,old);
          }
          setCustomerRows((customersResult.data??[]).map(c=>({...c,order_count:activity.get(c.id)?.count??0,last_order_at:activity.get(c.id)?.last??null})) as CustomerRow[]);
          setCustomerError(customerOrdersResult.error?"Daftar toko tampil, tetapi ringkasan aktivitas order belum dapat dibaca.": "");
        }
      } else if (activePage === "refunds") {
        const [ordersResult, refundsResult, customersResult] = await Promise.all([
          supabase.from("product_orders").select("id,order_code,status,notes,created_at,ordered_by,customer_id,payment_method,payment_evidence_path,stock_reserved,business_customers(store_name,customer_code),product_order_items(id,product_id,quantity,unit_price,line_total,products(name,sku,unit))").in("status", ["approved","fulfilled"]).order("created_at", {ascending:false}).limit(100),
          supabase.from("product_refunds").select("id,refund_code,order_id,order_item_id,requested_by,reviewed_by,reviewed_at,requested_by_profile:profiles!product_refunds_requested_by_fkey(full_name,email),reviewed_by_profile:profiles!product_refunds_reviewed_by_fkey(full_name,email),quantity,amount,reason,status,created_at,product_orders(order_code,customer_id,business_customers(store_name,customer_code))").order("created_at", {ascending:false}).limit(100),
          supabase.from("business_customers").select("id,customer_code,store_name,owner_name,phone,email,address,notes,created_by,is_active,created_at").eq("is_active",true).order("store_name").limit(500)
        ]);
        if (!alive) return;
        if (!ordersResult.error) setOrderRows((ordersResult.data ?? []) as unknown as OrderRow[]);
        if (!customersResult.error) setCustomerRows((customersResult.data??[]).map(c=>({...c,order_count:0,last_order_at:null})) as CustomerRow[]);
        if (refundsResult.error) setRefundError("Riwayat refund belum dapat dimuat. Periksa izin database.");
        else { setRefundRows((refundsResult.data ?? []) as unknown as RefundRow[]); setRefundError(""); }
      } else if (activePage === "finance-reports") {
        const [reportsResult, ordersResult, customersResult] = await Promise.all([
          supabase.from("financial_reports").select("id,report_code,report_type,amount,description,payment_method,status,created_at,submitted_by,reviewed_by,reviewed_at,submitted_by_profile:profiles!financial_reports_submitted_by_fkey(full_name,email),reviewed_by_profile:profiles!financial_reports_reviewed_by_fkey(full_name,email),related_order_id,related_customer_id,business_customers!financial_reports_related_customer_id_fkey(store_name,customer_code),product_orders(order_code,business_customers(store_name,customer_code))").order("created_at", {ascending:false}).limit(100),
          supabase.from("product_orders").select("id,order_code,status,notes,created_at,ordered_by,customer_id,payment_method,payment_evidence_path,stock_reserved,business_customers(store_name,customer_code),product_order_items(id,product_id,quantity,unit_price,line_total,products(name,sku,unit))").order("created_at",{ascending:false}).limit(100),
          supabase.from("business_customers").select("id,customer_code,store_name,owner_name,phone,email,address,notes,created_by,is_active,created_at").eq("is_active",true).order("store_name").limit(500)
        ]);
        if (!alive) return;
        if (reportsResult.error) setFinanceReportError("Laporan uang belum dapat dimuat. Periksa izin database.");
        else { setFinanceReportRows((reportsResult.data ?? []) as unknown as FinanceReportRow[]); setFinanceReportError(""); }
        if (!ordersResult.error) setOrderRows((ordersResult.data ?? []) as unknown as OrderRow[]);
        if (!customersResult.error) setCustomerRows((customersResult.data??[]).map(c=>({...c,order_count:0,last_order_at:null})) as CustomerRow[]);
      }
    }
    void loadBusinessWorkflows();
    return () => { alive = false; };
  }, [activePage, session, profile, businessRefresh]);

  useEffect(() => {
    if (!session || !profile?.is_active) return;
    const refresh = () => setBusinessRefresh(v => v + 1);
    let channel = supabase.channel("business-live-sync-" + profile.id);
    for (const table of ["products","product_categories","product_costs","product_orders","product_order_items","product_refunds","financial_reports","financial_transactions","financial_categories","stock_movements","notifications","leave_requests","attendance_records","employees","business_customers","profiles"]) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") refresh();
    });
    return () => { void supabase.removeChannel(channel); };
  }, [session, profile?.id, profile?.is_active]);

  useEffect(() => {
    if (!businessRefresh || !session || !profile?.is_active) return;
    void loadProfileAndCounts(session);
  }, [businessRefresh, session, profile?.is_active, loadProfileAndCounts]);

  useEffect(() => {
    if (!session || !profile?.is_active || !["inventory","barcode","finance","leave","notifications"].includes(activePage)) return;
    let alive=true;
    async function loadAdditionalModules(){
      if(activePage==="inventory"){
        const [p,c,m]=await Promise.all([
          supabase.from("products").select("id,sku,barcode_value,name,category_id,unit,description,sale_price,current_stock,minimum_stock,storage_location,is_active,product_categories(name),product_costs(cost_price)").order("name").limit(500),
          supabase.from("product_categories").select("id,name").order("name"),
          supabase.from("stock_movements").select("id,product_id,movement_type,quantity,unit_cost,reference_code,reason,movement_at,created_by,created_by_profile:profiles!stock_movements_created_by_fkey(full_name,email),products(name,sku)").order("movement_at",{ascending:false}).limit(50)
        ]);
        if(!alive)return;
        if(p.error)setInventoryError("Produk belum dapat dimuat. Periksa izin inventaris.");else setProductRows((p.data??[]) as unknown as ProductRow[]);
        if(!c.error)setProductCategories((c.data??[]) as ProductCategory[]);
        if(!m.error)setStockMovementRows((m.data??[]) as unknown as StockMovementRow[]);
      } else if(activePage==="barcode"){
        const {data:p,error:productError}=await supabase.from("products").select("id,sku,barcode_value,name,category_id,unit,description,sale_price,current_stock,minimum_stock,storage_location,is_active").eq("is_active",true).order("name").limit(500);
        if(!alive)return;
        if(productError)setInventoryError("Daftar produk belum dapat dimuat.");else setProductRows((p??[]) as unknown as ProductRow[]);
      }
      if(activePage==="finance"&&profile?.role==="owner"){
        const [tx,cats,ordersForProfit]=await Promise.all([
          supabase.from("financial_transactions").select("id,transaction_code,transaction_type,amount,transaction_at,payment_method,description,reference_code,status,created_by,created_by_profile:profiles!financial_transactions_created_by_fkey(full_name,email),financial_categories(name)").order("transaction_at",{ascending:false}).limit(300),
          supabase.from("financial_categories").select("id,name,transaction_type").eq("is_active",true).order("name"),
          supabase.from("product_orders").select("id,status,product_order_items(line_total,quantity,products(product_costs(cost_price)))").in("status",["approved","fulfilled"]).limit(2000)
        ]);
        if(!alive)return;
        if(tx.error)setFinancialError("Buku keuangan belum dapat dimuat.");else setFinancialRows((tx.data??[]) as unknown as FinancialTransactionRow[]);
        if(!cats.error)setFinancialCategories((cats.data??[]) as FinancialCategory[]);
        if(!ordersForProfit.error){const profitOrders=(ordersForProfit.data??[]) as Array<{product_order_items?:Array<{line_total:number|string;quantity:number|string;products?:{product_costs?:{cost_price:number|string}|Array<{cost_price:number|string}>|null}|null}>|null}>;const missing=profitOrders.reduce((sum,order)=>sum+(order.product_order_items??[]).filter(line=>{const costs=line.products?.product_costs;return Array.isArray(costs)?costs.length===0:!costs;}).length,0);const gross=profitOrders.reduce((sum,order)=>sum+(order.product_order_items??[]).reduce((lineSum,line)=>{const costs=line.products?.product_costs;const cost=Array.isArray(costs)?costs[0]?.cost_price:costs?.cost_price;return lineSum+Number(line.line_total||0)-Number(line.quantity||0)*Number(cost??0);},0),0);setGrossProfit(gross);setGrossProfitMissingCostCount(missing);}
      }
      if(activePage==="leave"){
        const {data,error:queryError}=await supabase.from("leave_requests").select("id,employee_id,leave_type,start_date,end_date,reason,status,created_at,reviewed_by,reviewed_at,reviewed_by_profile:profiles!leave_requests_reviewed_by_fkey(full_name,email),employees(full_name,employee_code,profile_id)").order("created_at",{ascending:false}).limit(200);
        if(!alive)return;
        if(queryError)setLeaveError("Permohonan izin belum dapat dimuat. Periksa hubungan akun karyawan.");else setLeaveRows((data??[]) as unknown as LeaveRow[]);
        if(profile?.role==="employee"){
          const employeeProfileId=profile.id;
          const {data:emp}=await supabase.from("employees").select("id").eq("profile_id",employeeProfileId).maybeSingle();
          if(alive&&emp)setLeaveEmployeeId(emp.id);
        }
      }
      if(activePage==="notifications"){
        const {data,error:queryError}=await supabase.from("notifications").select("id,title,message,notification_type,read_at,created_at").order("created_at",{ascending:false}).limit(100);
        if(!alive)return;
        if(queryError)setNotificationError("Notifikasi belum dapat dimuat.");else setNotificationRows((data??[]) as NotificationRow[]);
      }
    }
    void loadAdditionalModules();
    return ()=>{alive=false;};
  },[activePage,session,profile,businessRefresh]);

  useEffect(() => {
    if (activePage !== "attendance" || !session || !profile?.is_active) return;
    let alive = true;
    async function loadAttendanceHistory() {
      setAttendanceLoading(true);
      setAttendanceError("");
      const { data, error: queryError } = await supabase
        .from("attendance_records")
        .select("id,employee_id,work_date,check_in_at,check_out_at,status,check_in_method,check_out_method,notes,recorded_by,evidence_path,employees(full_name,employee_code),recorded_by_profile:profiles!attendance_records_recorded_by_fkey(full_name,email)")
        .order("work_date", { ascending: false })
        .limit(100);
      if (queryError) {
        if (alive) setAttendanceError("Riwayat absensi tidak dapat dibaca. Periksa izin akses database.");
        if (alive) setAttendanceLoading(false);
        return;
      }
      const rows = (data ?? []) as unknown as AttendanceRow[];
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const { data: todayRows, error: todayError } = await supabase.from("attendance_records").select("employee_id,check_out_at,employees(full_name,employee_code)").eq("work_date", today).order("check_in_at", { ascending: false });
      if (todayError && alive) setAttendanceError("Rekap absensi hari ini tidak dapat dibaca.");
      if (alive) setDailyAttendanceRows((todayRows ?? []) as unknown as DailyAttendanceRow[]);
      const withUrls = await Promise.all(rows.map(async (row) => {
        if (!row.evidence_path) return { ...row, evidence_url: null };
        const { data: signed, error: signedError } = await supabase.storage
          .from("attendance-evidence")
          .createSignedUrl(row.evidence_path, 60);
        return { ...row, evidence_url: signedError ? null : signed?.signedUrl ?? null };
      }));
      if (alive) setAttendanceRows(withUrls);
      if (alive) setAttendanceLoading(false);
    }
    void loadAttendanceHistory();
    return () => { alive = false; };
  }, [activePage, session, profile]);

  useEffect(() => {
    if (activePage !== "employees" || !session || !profile?.is_active || !["owner", "admin", "hrd"].includes(profile.role)) return;
    let alive = true;
    async function loadEmployees() {
      setEmployeeLoading(true); setEmployeeError("");
      const { data, error: queryError } = await supabase.from("employees")
        .select("id,employee_code,full_name,email,phone,job_title,employment_status,joined_on,notes,profile_id")
        .order("created_at", { ascending: false });
      if (!alive) return;
      if (queryError) { setEmployeeError("Daftar karyawan gagal dibaca. Pastikan Anda login sebagai Owner/Admin."); setEmployeeRows([]); }
      else setEmployeeRows((data ?? []) as EmployeeRow[]);
      setEmployeeLoading(false);
    }
    void loadEmployees();
    return () => { alive = false; };
  }, [activePage, session, profile]);

  useEffect(() => {
    if (activePage !== "settings" || !session || !profile?.is_active || !["owner", "admin"].includes(profile.role)) return;
    let alive = true;
    async function loadAttendanceMode() {
      setAttendanceModeLoading(true); setAttendanceModeError("");
      const { data, error: queryError } = await supabase.from("app_settings").select("setting_value").eq("setting_key", "attendance_mode").maybeSingle();
      if (!alive) return;
      if (queryError) setAttendanceModeError("Pengaturan mode absensi gagal dibaca. Periksa kebijakan database.");
      else {
        const value = (data?.setting_value as { mode?: string } | null)?.mode;
        setAttendanceMode(value === "multiple_sessions" ? "multiple_sessions" : "once_daily");
      }
      setAttendanceModeLoading(false);
    }
    void loadAttendanceMode();
    return () => { alive = false; };
  }, [activePage, session, profile]);

  async function saveAttendanceMode(nextMode: AttendanceMode) {
    if (!session || !profile || !["owner", "admin"].includes(profile.role)) return;
    setAttendanceModeSaving(true); setAttendanceModeError(""); setAttendanceModeNotice("");
    const { error: saveError } = await supabase.from("app_settings").upsert({ setting_key: "attendance_mode", setting_value: { mode: nextMode }, description: "Aturan check-in/check-out harian", updated_by: session.user.id, updated_at: new Date().toISOString() }, { onConflict: "setting_key" });
    if (saveError) setAttendanceModeError("Mode absensi gagal disimpan. Pengaturan sebelumnya tetap berlaku.");
    else { setAttendanceMode(nextMode); setAttendanceModeNotice(nextMode === "once_daily" ? "Mode Sekali Sehari berhasil diaktifkan." : "Mode Check-in/Check-out Berulang berhasil diaktifkan."); }
    setAttendanceModeSaving(false);
  }

  useEffect(() => {
    if (!["settings", "employees"].includes(activePage) || !session || !profile?.is_active || !["owner", "admin"].includes(profile.role)) return;
    let alive = true;
    async function loadAccounts() {
      setAccountLoading(true); setAccountError("");
      const { data, error: invokeError } = await supabase.functions.invoke("manage-employee-accounts", { body: { action: "list_accounts" } });
      if (!alive) return;
      if (invokeError || data?.error) { setAccountError(data?.error || "Daftar akun gagal dimuat."); setAccountRows([]); }
      else setAccountRows((data?.accounts ?? []) as AccountRow[]);
      setAccountLoading(false);
    }
    void loadAccounts();
    return () => { alive = false; };
  }, [activePage, session, profile, accountRefresh]);

  async function updateAccount(account: AccountRow, role: Role, is_active: boolean) {
    setAccountSavingId(account.id); setAccountError(""); setAccountNotice("");
    const { data, error: invokeError } = await supabase.functions.invoke("manage-employee-accounts", {
      body: { action: "update_account", user_id: account.id, role, is_active }
    });
    if (invokeError || data?.error) setAccountError(data?.error || "Role/status akun gagal disimpan.");
    else {
      setAccountRows(rows => rows.map(row => row.id === account.id ? { ...row, role, is_active } : row));
      setAccountNotice("Role dan status akun berhasil diperbarui.");
    }
    setAccountSavingId(null);
  }


  async function deleteEmployeeLogin(emp: EmployeeRow, account: AccountRow) {
    const confirmed = window.confirm("Hapus akun login untuk " + emp.full_name + " (" + account.email + ")? Data karyawan dan riwayat absensi tetap disimpan, tetapi akun ini tidak bisa login lagi.");
    if (!confirmed) return;
    setAccountSavingId(account.id); setEmployeeError(""); setEmployeeNotice("");
    const { data, error: invokeError } = await supabase.functions.invoke("manage-employee-accounts", {
      body: { action: "delete_employee_account", user_id: account.id, employee_id: emp.id }
    });
    if (invokeError || data?.error) setEmployeeError(data?.error || "Akun gagal dihapus.");
    else {
      setAccountRows(rows => rows.filter(row => row.id !== account.id));
      setEmployeeRows(rows => rows.map(row => row.id === emp.id ? { ...row, profile_id: null } : row));
      setEmployeeNotice("Akun login dihapus. Data karyawan dan riwayat absensi tetap dipertahankan.");
    }
    setAccountSavingId(null);
  }

  async function deleteAccount(account: AccountRow) {
    if (profile?.role !== "owner" || account.role === "owner" || account.id === profile.id) return;
    const confirmed = window.confirm(`Hapus akun ${account.email} secara permanen? Profil login akan dihapus. Data transaksi bisnis yang sudah tercatat tidak ikut dihapus.`);
    if (!confirmed) return;
    setAccountSavingId(account.id); setAccountError(""); setAccountNotice("");
    const { data, error: invokeError } = await supabase.functions.invoke("manage-employee-accounts", { body: { action: "delete_account", user_id: account.id } });
    if (invokeError || data?.error) setAccountError(data?.error || "Akun gagal dihapus.");
    else { setAccountRows(rows => rows.filter(row => row.id !== account.id)); setAccountNotice(`Akun ${account.email} berhasil dihapus.`); setAccountRefresh(v => v + 1); }
    setAccountSavingId(null);
  }

  function resetEmployeeForm() {
    setEditingEmployeeId(null);
    setEmployeeForm({employee_code:"",full_name:"",email:"",phone:"",job_title:"",joined_on:jakartaDateInput(),notes:""});
    setCreateLoginAccount(false); setNewAccountRole("employee"); setEmployeePassword("");
  }

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !["owner", "admin", "hrd"].includes(profile.role)) { setEmployeeError("Akun ini tidak memiliki izin mengelola data karyawan."); return; }
    const code = employeeForm.employee_code.trim(), name = employeeForm.full_name.trim();
    if (!code || !name) { setEmployeeError("Kode dan nama karyawan wajib diisi."); return; }
    setEmployeeSaving(true); setEmployeeError(""); setEmployeeNotice("");
    const payload = { employee_code:code, full_name:name, email:employeeForm.email.trim()||null, phone:employeeForm.phone.trim()||null, job_title:employeeForm.job_title.trim()||null, joined_on:employeeForm.joined_on||null, notes:employeeForm.notes.trim()||null, updated_at:new Date().toISOString() };
    if (createLoginAccount && editingEmployeeId) {
      setEmployeeError("Pembuatan akun login tersedia saat menambahkan karyawan baru. Untuk karyawan lama, hubungkan akun melalui proses khusus.");
      setEmployeeSaving(false); return;
    }
    if (createLoginAccount && (!payload.email || employeePassword.length < 8)) {
      setEmployeeError("Untuk membuat akun login, email wajib diisi dan kata sandi minimal 8 karakter.");
      setEmployeeSaving(false); return;
    }
    if (editingEmployeeId) {
      const result = await supabase.from("employees").update(payload).eq("id", editingEmployeeId);
      if (result.error) setEmployeeError(result.error.code === "23505" ? "Kode karyawan sudah dipakai. Gunakan kode lain." : "Data gagal disimpan. Periksa izin database.");
      else {
        setEmployeeNotice("Data karyawan diperbarui.");
        resetEmployeeForm();
      }
    } else {
      const { data: newEmployee, error: insertError } = await supabase.from("employees")
        .insert({...payload, employment_status:"active", created_by:session?.user.id})
        .select("id").single();
      if (insertError || !newEmployee) {
        setEmployeeError(insertError?.code === "23505" ? "Kode karyawan sudah dipakai. Gunakan kode lain." : "Data gagal disimpan. Periksa izin database.");
      } else if (createLoginAccount) {
        const { data: accountData, error: accountInvokeError } = await supabase.functions.invoke("manage-employee-accounts", {
          body: { action: "create_employee_account", employee_id: newEmployee.id, email: payload.email, password: employeePassword, full_name: name, role: newAccountRole }
        });
        if (accountInvokeError || accountData?.error) {
          setEmployeeError("Data karyawan tersimpan, tetapi akun login belum berhasil dibuat: " + (accountData?.error || accountInvokeError?.message || "kesalahan server"));
          setEmployeeNotice("Karyawan dibuat tanpa akun login. Perbaiki kendala akun lalu coba lagi.");
        } else {
          setEmployeeNotice("Akun berhasil dibuat dengan role " + (newAccountRole === "admin" ? "Admin" : newAccountRole === "hrd" ? "HRD/SDM" : "Karyawan") + ". Berikan email dan kata sandi awal secara aman.");
          resetEmployeeForm();
        }
      } else {
        setEmployeeNotice("Karyawan berhasil ditambahkan. Akun login belum dibuat.");
        resetEmployeeForm();
      }
    }
    const { data: refreshed } = await supabase.from("employees").select("id,employee_code,full_name,email,phone,job_title,employment_status,joined_on,notes,profile_id").order("created_at", { ascending:false });
    setEmployeeRows((refreshed ?? []) as EmployeeRow[]);
    if (session) void loadProfileAndCounts(session);
    setEmployeeSaving(false);
  }

  async function toggleEmployeeStatus(emp: EmployeeRow) {
    const status = emp.employment_status === "active" ? "inactive" : "active";
    setEmployeeError(""); setEmployeeNotice("");
    const { error: updateError } = await supabase.from("employees").update({employment_status:status,updated_at:new Date().toISOString()}).eq("id", emp.id);
    if (updateError) setEmployeeError("Status karyawan gagal diubah. Periksa izin database.");
    else {
      setEmployeeRows(rows => rows.map(row => row.id === emp.id ? {...row, employment_status:status} : row));
      setEmployeeNotice("Status karyawan berhasil diperbarui.");
      if (session) void loadProfileAndCounts(session);
    }
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const identifier = email.trim();
    const credentials = identifier.includes("@")
      ? { email: identifier, password }
      : { phone: identifier, password };
    try {
      const { error: authError } = await supabase.auth.signInWithPassword(credentials);
      if (authError) {
        const msg = authError.message.toLowerCase();
        if (msg.includes("email not confirmed")) setError("Email akun belum dikonfirmasi. Minta Owner memeriksa status akun atau konfirmasi email di Supabase.");
        else if (msg.includes("invalid login credentials")) setError("Email atau kata sandi salah, atau akun belum berhasil dibuat. Pastikan memakai email yang tepat.");
        else setError("Login gagal: " + authError.message);
      }
    } catch {
      setError("Layanan login tidak dapat dihubungi. Periksa koneksi dan konfigurasi Supabase, lalu coba lagi.");
    } finally { setBusy(false); }
  }

  async function handleSetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    if (newPassword.length < 8) { setError("Kata sandi harus minimal 8 karakter."); setBusy(false); return; }
    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) setError("Kata sandi gagal disimpan. Pastikan tautan undangan masih berlaku, lalu coba buka ulang email undangan.");
    else {
      setNewPassword("");
      setSetupPasswordMode(false);
      if (typeof window !== "undefined") window.history.replaceState({}, "", window.location.pathname);
      await supabase.auth.signOut({ scope: "local" });
      setSession(null); setProfile(null);
      setMessage("Kata sandi berhasil dibuat. Silakan masuk menggunakan email dan kata sandi baru.");
    }
    setBusy(false);
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined
    });
    if (resetError) setError("Permintaan reset gagal. Periksa email dan konfigurasi URL redirect Supabase.");
    else setMessage("Jika email terdaftar, instruksi pemulihan akan dikirim. Periksa kotak masuk dan spam.");
    setBusy(false);
  }

  async function handleProfilePasswordChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfilePasswordNotice("");
    setProfilePasswordError("");
    if (profileNewPassword.length < 8) {
      setProfilePasswordError("Password baru harus minimal 8 karakter.");
      return;
    }
    if (profileNewPassword !== profileConfirmPassword) {
      setProfilePasswordError("Konfirmasi password belum sama.");
      return;
    }
    setBusy(true);
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password: profileNewPassword });
      if (passwordError) {
        setProfilePasswordError("Password gagal diperbarui: " + passwordError.message);
      } else {
        setProfilePasswordNotice("Password berhasil diperbarui. Gunakan password baru pada login berikutnya.");
        setProfileNewPassword("");
        setProfileConfirmPassword("");
      }
    } catch {
      setProfilePasswordError("Layanan autentikasi tidak dapat dihubungi. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setError("");
    try {
      const { error: logoutError } = await supabase.auth.signOut({ scope: "local" });
      if (logoutError) {
        // If the Auth endpoint is unreachable, still end this browser's local session.
        try {
          if (typeof window !== "undefined") {
            const keys = Object.keys(window.localStorage);
            for (const key of keys) {
              if (key.startsWith("sb-") && key.endsWith("-auth-token")) window.localStorage.removeItem(key);
            }
          }
        } catch {
          // Storage can be unavailable in privacy-restricted browser contexts.
        }
        setSession(null);
        setProfile(null);
        setCounts({ employees: 0, attendance: 0, products: 0, finances: 0, orders: 0, refunds: 0, reports: 0 });
        setMessage("Anda telah keluar dari sesi lokal. Koneksi autentikasi sedang bermasalah; jika akun masih terbuka di perangkat lain, keluarkan sesi perangkat tersebut juga.");
        setError("");
      }
    } catch {
      try {
        if (typeof window !== "undefined") {
          const keys = Object.keys(window.localStorage);
          for (const key of keys) {
            if (key.startsWith("sb-") && key.endsWith("-auth-token")) window.localStorage.removeItem(key);
          }
        }
      } catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
      }
      setSession(null);
      setProfile(null);
      setCounts({ employees: 0, attendance: 0, products: 0, finances: 0, orders: 0, refunds: 0, reports: 0 });
      setMessage("Sesi lokal di perangkat ini sudah dibersihkan. Koneksi autentikasi perlu diperiksa.");
      setError("");
    } finally {
      setBusy(false);
    }
  }

  async function saveTeamAttendanceStatus(row: AttendanceRow) {
    setAttendanceSavingId(row.id);
    setAttendanceError("");
    const nextStatus = attendanceStatusDrafts[row.id] || row.status;
    const { error: saveError } = await supabase.rpc("update_offline_store_team_attendance", { p_attendance_id: row.id, p_status: nextStatus, p_notes: row.notes || null });
    if (saveError) setAttendanceError(saveError.message || "Status absensi gagal diperbarui.");
    else setAttendanceRows(prev => prev.map(item => item.id === row.id ? { ...item, status: nextStatus, recorded_by: profile?.id || item.recorded_by } : item));
    setAttendanceSavingId(null);
  }

  if (pageLoading) return <main className="login-side"><div className="subtle">Memeriksa sesi aman…</div></main>;

  if (setupPasswordMode && session) return (
    <main className="login-wrap">
      <section className="login-hero"><div><div className="brand"><div className="brand-mark"><img src="/ndranexa-web.svg" alt="Logo NDRANEXA" style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}} /></div><div><div className="brand-title">NDRANEXA</div><div className="brand-sub">BUSINESS PLATFORM</div></div></div><div style={{marginTop:"clamp(50px,12vh,120px)"}}><div className="eyebrow">AKTIVASI ANGGOTA TOKO</div><div className="hero-big">Amankan akun <span className="gradient-text">Anda.</span></div><p className="subtle" style={{maxWidth:440}}>Buat kata sandi pribadi untuk mulai menggunakan akun Toko Offline.</p></div></div></section>
      <section className="login-side"><div className="login-card"><div className="eyebrow">PENGATURAN KATA SANDI</div><h2>Buat kata sandi</h2><p className="subtle">Gunakan minimal 8 karakter. Kata sandi hanya diketahui oleh Anda.</p><form onSubmit={handleSetPassword}><div className="field"><label htmlFor="new-password">Kata sandi baru</label><input id="new-password" type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="Minimal 8 karakter"/></div>{error&&<div className="error-box" role="alert">{error}</div>}<button className="btn btn-primary" type="submit" disabled={busy||!isSupabaseConfigured}>{busy?"Menyimpan…":"Simpan kata sandi dan lanjutkan"}</button></form></div></section>
    </main>
  );

  if (!session) return (
    <main className="login-wrap">
      <section className="login-hero">
        <div>
          <div className="brand"><div className="brand-mark"><img src="/ndranexa-web.svg" alt="Logo NDRANEXA" style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}} /></div><div><div className="brand-title">NDRANEXA</div><div className="brand-sub">BUSINESS PLATFORM</div></div></div>
          <div style={{ marginTop: "clamp(50px,12vh,120px)" }}>
            <div className="eyebrow">Satu sistem. Kendali penuh.</div>
            <div className="hero-big">Kelola bisnis lebih <span className="gradient-text">cerdas.</span></div>
            <p className="subtle" style={{ maxWidth: 440 }}>Satu ruang kerja untuk mengelola karyawan, absensi, inventaris, dan keuangan dengan kontrol akses yang terstruktur.</p>
            <div className="feature-pills"><span className="feature-pill">◷ Absensi</span><span className="feature-pill">▤ Inventaris</span><span className="feature-pill">◈ Keuangan</span><span className="feature-pill">▥ Barcode</span><span className="feature-pill">♙ Role OWNER / ADMIN</span></div>
          </div>
        </div>
        <div className="subtle" style={{ fontSize: 11 }}>Akses aman · Terhubung ke Supabase · Tampilan responsif</div>
      </section>
      <section className="login-side">
        <div className="login-card">
          <div className="eyebrow">{resetMode ? "PEMULIHAN AKUN" : "SELAMAT DATANG KEMBALI"}</div>
          <h2>{resetMode ? "Reset kata sandi" : "Masuk ke akun Anda"}</h2>
          <p className="subtle">{resetMode ? "Masukkan email akun untuk meminta instruksi pemulihan." : "Masuk untuk melanjutkan ke dashboard bisnis Anda."}</p>
          {!isSupabaseConfigured && <div className="error-box">Konfigurasi Supabase belum dipasang. Admin deployment perlu mengisi NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.</div>}
          <form onSubmit={resetMode ? handleReset : handleLogin}>
            <div className="field"><label htmlFor="email">{resetMode ? "Email akun" : "Email atau nomor HP"}</label><input id="email" type="text" inputMode="text" autoComplete="username" required placeholder={resetMode ? "nama@bisnis.com" : "nama@bisnis.com atau +628123456789"} value={email} onChange={(event) => setEmail(event.target.value)} /></div>
            {!resetMode && <div className="field"><label htmlFor="password">Kata sandi</label><input id="password" type="password" autoComplete="current-password" required minLength={6} placeholder="Masukkan kata sandi" value={password} onChange={(event) => setPassword(event.target.value)} /></div>}
            {error && <div className="error-box" role="alert">{error}</div>}
            {message && <div className="info-box" role="status">{message}</div>}
            <button className="btn btn-primary" type="submit" disabled={busy || !isSupabaseConfigured}>{busy ? "Memproses…" : resetMode ? "Kirim instruksi reset" : "Masuk ke dashboard →"}</button>
          </form>
          <button className="btn" style={{ width: "100%", marginTop: 10, background: "transparent" }} onClick={() => { setResetMode(!resetMode); setError(""); setMessage(""); }}>{resetMode ? "Kembali ke login" : "Lupa kata sandi?"}</button>
          <p className="footer">Akses hanya untuk akun yang sudah diaktifkan oleh sistem.</p>
        </div>
      </section>
    </main>
  );

  async function submitCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !customerStoreName.trim()) { setCustomerError("Nama toko wajib diisi."); return; }
    setCustomerSubmitting(true); setCustomerError(""); setCustomerNotice("");
    const customerCode = "TOK-" + jakartaDateInput().replaceAll("-","") + "-" + Math.random().toString(36).slice(2,7).toUpperCase();
    const { data, error: insertError } = await supabase.from("business_customers").insert({
      customer_code: customerCode, store_name: customerStoreName.trim(), owner_name: customerOwnerName.trim()||null,
      phone: customerPhone.trim()||null, email: customerEmail.trim()||null, address: customerAddress.trim()||null,
      notes: customerNotes.trim()||null, created_by: profile.id
    }).select("id,customer_code,store_name,owner_name,phone,email,address,notes,created_by,is_active,created_at").single();
    if (insertError || !data) setCustomerError("Pendaftaran toko gagal: "+(insertError?.message??"Data tidak tersimpan."));
    else {
      setCustomerNotice("Toko "+data.store_name+" berhasil didaftarkan sebagai member dengan kode "+data.customer_code+".");
      setCustomerStoreName(""); setCustomerOwnerName(""); setCustomerPhone(""); setCustomerEmail(""); setCustomerAddress(""); setCustomerNotes("");
      setCustomerRows(rows=>[{...data,order_count:0,last_order_at:null} as CustomerRow,...rows.filter(row=>row.id!==data.id)]);
      setSelectedOrderCustomerId(data.id); setBusinessRefresh(v=>v+1);
    }
    setCustomerSubmitting(false);
  }

  async function openOrderEvidence(path:string) {
    const {data,error:linkError}=await supabase.storage.from("order-payment-evidence").createSignedUrl(path,60);
    if(linkError||!data?.signedUrl){setOrderError("Foto bukti tidak dapat dibuka: "+(linkError?.message??"Akses ditolak."));return;}
    window.open(data.signedUrl,"_blank","noopener,noreferrer");
  }

  function addOrderCartItem() {
    const product = orderProducts.find((item) => item.id === selectedOrderProductId);
    const quantity = Number(orderQuantity);
    if (!product || !Number.isFinite(quantity) || quantity <= 0) { setOrderError("Pilih produk dan jumlah yang valid."); return; }
    const existing = orderCart.find(line => line.product_id === product.id);
    const totalQty = quantity + (existing ? Number(existing.quantity) : 0);
    if (totalQty > Number(product.current_stock)) { setOrderError("Stok "+product.name+" hanya "+product.current_stock+" "+product.unit+"."); return; }
    setOrderCart(lines => existing ? lines.map(line => line.product_id === product.id ? {...line,quantity:String(totalQty)} : line) : [...lines,{product_id:product.id,quantity:String(quantity)}]);
    setOrderError(""); setSelectedOrderProductId(""); setOrderQuantity("1");
  }

  async function submitProductOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || orderCart.length===0 || !selectedOrderCustomerId) { setOrderError("Pilih toko dan tambahkan minimal satu produk."); return; }
    setOrderSubmitting(true); setOrderError(""); setOrderNotice("");
    const items = orderCart.map(line => ({product_id:line.product_id,quantity:Number(line.quantity)}));
    for (const line of items) {
      const product = orderProducts.find(p=>p.id===line.product_id);
      if (!product || !Number.isFinite(line.quantity) || line.quantity<=0 || line.quantity>Number(product.current_stock)) {
        setOrderError("Stok atau jumlah untuk "+(product?.name??"produk")+" tidak valid. Periksa keranjang order.");
        setOrderSubmitting(false); setBusinessRefresh(v=>v+1); return;
      }
    }
    let evidencePath: string | null = null;
    if (orderEvidenceFile) {
      if (orderEvidenceFile.size > 3 * 1024 * 1024) { setOrderError("Foto bukti maksimal 3 MB."); setOrderSubmitting(false); return; }
      if (!["image/jpeg","image/png","image/webp"].includes(orderEvidenceFile.type)) { setOrderError("Bukti harus berupa foto JPG, PNG, atau WEBP."); setOrderSubmitting(false); return; }
      const safeName = orderEvidenceFile.name.replace(/[^a-zA-Z0-9._-]/g,"_");
      evidencePath = `${profile.id}/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from("order-payment-evidence").upload(evidencePath,orderEvidenceFile,{contentType:orderEvidenceFile.type,upsert:false});
      if (uploadError) { setOrderError("Foto bukti gagal diunggah: "+uploadError.message); setOrderSubmitting(false); return; }
    }
    const { data: orderResult, error: createError } = await supabase.rpc("submit_product_order_multi",{
      p_items:items,p_notes:orderNotes.trim()||null,p_customer_id:selectedOrderCustomerId,
      p_payment_method:orderPaymentMethod,p_payment_evidence_path:evidencePath
    });
    const order = Array.isArray(orderResult) ? orderResult[0] : orderResult;
    if (createError || !order) {
      let cleanupNote = "";
      if (evidencePath) {
        const {data:linkedOrder,error:lookupError}=await supabase.from("product_orders").select("id").eq("payment_evidence_path",evidencePath).maybeSingle();
        if (!lookupError && !linkedOrder) {
          const {error:cleanupError}=await supabase.storage.from("order-payment-evidence").remove([evidencePath]);
          if (cleanupError) cleanupNote=" Bukti pembayaran belum tertaut dan perlu dibersihkan manual.";
        }
      }
      setOrderError((createError?.message ?? "Order gagal dibuat.")+cleanupNote);
      setOrderSubmitting(false); return;
    }
    setOrderNotice(`Order ${order.order_code} dengan ${items.length} jenis produk berhasil dikirim. Stok dicadangkan dan menunggu persetujuan Admin/Owner.`);
    setOrderCart([]); setOrderNotes(""); setOrderQuantity("1"); setOrderEvidenceFile(null); setOrderPaymentMethod("cash"); setBusinessRefresh((v)=>v+1); setOrderSubmitting(false);
  }

  function receiptEscape(value: unknown) {
    return String(value ?? "—").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch] ?? ch));
  }

  function printBusinessReceipt(title: string, body: string) {
    const lowerTitle = title.toLocaleLowerCase("id-ID");
    const documentClass = lowerTitle.includes("refund") ? "receipt-refund" : lowerTitle.includes("laporan uang") || lowerTitle.includes("keuangan") ? "receipt-finance" : lowerTitle.includes("order") || lowerTitle.includes("produk") ? "receipt-order" : "receipt-general";
    const documentLabel = documentClass === "receipt-refund" ? "BUKTI PENGAJUAN / PENYELESAIAN REFUND" : documentClass === "receipt-finance" ? "BUKTI LAPORAN KEUANGAN" : documentClass === "receipt-order" ? "BUKTI ORDER PRODUK" : "DOKUMEN ADMINISTRASI";
    const documentSubtitle = documentClass === "receipt-refund" ? "Dokumen pengembalian dana dan referensi order asal" : documentClass === "receipt-finance" ? "Dokumen pencatatan uang masuk atau uang keluar" : documentClass === "receipt-order" ? "Bukti rincian pesanan produk" : "Dokumen administrasi internal";
    const documentFooter = documentClass === "receipt-refund" ? "Simpan bersama bukti order asal dan bukti pengembalian dana. Status pada dokumen mengikuti catatan sistem." : documentClass === "receipt-finance" ? "Dokumen ini merupakan catatan laporan; bukan bukti pembayaran kecuali dilengkapi bukti transaksi yang sah." : documentClass === "receipt-order" ? "Simpan sebagai bukti order. Pastikan rincian produk, jumlah, dan status sesuai catatan sistem." : "Dokumen dibuat dari catatan sistem. Periksa data sebelum ditandatangani atau diarsipkan.";
    const printWindow = window.open("", "_blank", "width=900,height=720");
    if (!printWindow) { window.alert("Izinkan pop-up browser untuk mencetak struk."); return; }
    printWindow.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${receiptEscape(title)}</title><style>
      @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font:12px Arial,sans-serif;color:#17345b;margin:0;background:#fff}
      .receipt{max-width:760px;margin:auto;border:1px solid #cfe0f4;padding:24px;border-radius:8px;position:relative;overflow:hidden}\n      .receipt-order{border-top:5px solid #173f70}.receipt-order h1{letter-spacing:.035em}.receipt-refund{border:1px solid #e7d0a6;border-top:5px solid #bd7a28;background:linear-gradient(180deg,#fffdf8 0%,#fff 180px)}.receipt-refund h1{color:#8a5317}.receipt-refund h2{color:#8a5317;border-bottom-color:#ead8b7}.receipt-finance{border:1px double #bfd2ea;border-top:5px double #173f70;background:linear-gradient(180deg,#f7faff 0%,#fff 180px)}.receipt-finance h1{color:#173f70}.receipt-finance .meta-box{background:#e8f0fb;border-color:#bfd2ea}.receipt-refund .meta-box{background:#fff3df;border-color:#edd3a5}.receipt-refund th{background:#fff1d8;color:#74470e}.receipt-finance th{background:#e8f0fb}.receipt-general{border-top:3px solid #6b7b8e}.receipt-general h1{color:#36485d}.receipt-general .meta-box{background:#f4f6f8;border-color:#dce2e8}.receipt-refund .total{color:#8a5317}.receipt-finance .total{color:#173f70}
      header{display:grid;grid-template-columns:1.2fr 1fr;gap:22px;align-items:center;border-bottom:2px solid #164b87;padding-bottom:14px;margin-bottom:16px}
      .brand-wrap{display:flex;align-items:center;gap:12px;min-width:0}.brand-wrap img{width:104px;max-width:100%;height:auto;flex:0 0 auto}
      .brand{font-size:17px;font-weight:800;letter-spacing:1px;color:#16345c}.subtitle{font-size:10px;letter-spacing:2px;color:#526b8a;margin-top:3px}
      .company-info{border-left:1px solid #9bbbe1;padding-left:16px;font-size:10px;line-height:1.8;color:#254b78}
      .doc-heading{display:grid;grid-template-columns:1.05fr 1fr;gap:16px;align-items:start;margin:18px 0 22px}
      h1{font-size:20px;line-height:1.2;margin:0 0 6px;text-transform:uppercase;color:#123967}
      .doc-number{font-size:13px;color:#234a78;overflow-wrap:anywhere}.doc-number strong{display:block;font-size:16px;margin-top:5px}
      .meta-box{background:#eef6ff;border:1px solid #d7e8fb;border-radius:5px;padding:12px;line-height:1.8}
      h2{font-size:12px;margin:18px 0 8px;color:#163f70;text-transform:none;border-bottom:1px solid #d5e4f5;padding-bottom:5px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 24px}.field{display:flex;gap:8px;margin:6px 0;min-width:0}.label{width:125px;color:#58708c;flex-shrink:0}.value{font-weight:600;overflow-wrap:anywhere}
      table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #d2e2f4;padding:8px;text-align:left}th{background:#edf5ff;font-size:10px;color:#173d6b}td.num,th.num{text-align:right}
      .total{display:flex;justify-content:flex-end;gap:24px;font-size:14px;font-weight:800;margin:14px 0;color:#123967}
      .note{background:#f1f7fe;border:1px solid #deebf9;padding:10px;border-radius:4px;white-space:pre-wrap;overflow-wrap:anywhere}
      .signatures{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-top:34px}
      .sign{border-right:1px solid #c7d9ef;padding:0 8px;text-align:left;min-width:0;font-size:10px}.sign:last-child{border-right:0}
      .sign-title{font-weight:700;color:#173f70;min-height:16px}.sign-role{color:#58708c;margin-top:3px;min-height:14px}
      .sign-space{height:64px;border-bottom:1px solid #6285b0;margin-bottom:8px}
      .owner-sign{height:64px;display:flex;align-items:center;justify-content:center;margin-bottom:8px;border-bottom:1px solid #6285b0}
      .owner-sign svg{width:100px;height:48px;max-width:100%}.sign-name{font-weight:700;overflow-wrap:anywhere}.sign-date{margin-top:4px;color:#58708c;font-size:9px}
      footer{text-align:center;border-top:1px solid #cfe0f4;padding-top:10px;margin-top:22px;font-size:10px;color:#526b8a}
      .actions{text-align:center;margin:18px}@media print{.actions{display:none!important}body{background:#fff!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}.receipt{border:0!important;border-radius:0;padding:0;max-width:none;overflow:visible}.receipt-refund,.receipt-finance,.receipt-order,.receipt-general{background:#fff!important}.receipt header{break-inside:avoid}.receipt table{break-inside:auto}.receipt tr{break-inside:avoid;break-after:auto}.signatures{break-inside:avoid}.sign{font-size:9px}.owner-sign svg{width:88px;height:42px}}
      @media(max-width:600px){header,.doc-heading{grid-template-columns:1fr}.company-info{border-left:0;border-top:1px solid #9bbbe1;padding:10px 0 0}.grid{grid-template-columns:1fr}.signatures{gap:4px}.sign{padding:0 4px}.label{width:100px}}
    </style></head><body><div class="actions"><button onclick="window.print()">Cetak struk</button> <button onclick="window.close()">Tutup</button></div><main class="receipt ${documentClass}"><header><div class="brand-wrap"><img src="${window.location.origin}/ndranexa-company.svg" alt="Logo NDRANEXA NIAGA NUSANTARA" style="display:block;width:104px;max-width:100%;height:auto;object-fit:contain"/></div><div class="company-info"><strong>NDRANEXA NIAGA NUSANTARA</strong><br>Kantor Pusat<br>Dokumen transaksi internal</div></header><section class="doc-heading"><div><h1>${receiptEscape(title)}</h1><div class="doc-number">${documentSubtitle}</div></div><div class="meta-box"><strong>${documentLabel}</strong><br>NDRANEXA NIAGA NUSANTARA<br><span style="color:#58708c">Nomor dan status mengikuti catatan sistem</span></div></section>${body}<footer>${documentFooter}</footer></main></body></html>`);
    printWindow.document.close();
  }

  function receiptField(label: string, value: unknown) {
    return `<div class="field"><span class="label">${receiptEscape(label)}</span><span>:</span><span class="value">${receiptEscape(value || "—")}</span></div>`;
  }

  function receiptSignature(title: string, role: string, name: string, date?: string, owner = false) {
    const mark = owner ? `<div class="owner-sign" aria-label="Paraf otomatis Owner"><svg viewBox="0 0 160 76" role="img" aria-label="Paraf dekoratif Owner"><path d="M9 57 C22 42 31 23 43 17 C50 13 51 22 44 33 L25 59 C42 42 59 27 66 31 C71 34 60 47 58 51 C69 42 82 31 90 35 C95 38 87 47 83 50 C99 43 112 37 126 41 C133 43 139 41 150 35" fill="none" stroke="#163f70" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>` : `<div class="sign-space"></div>`;
    return `<div class="sign"><div class="sign-title">${receiptEscape(title)}</div><div class="sign-role">${receiptEscape(role)}</div>${mark}<div class="sign-name">${receiptEscape(name)}</div>${date ? `<div class="sign-date">${receiptEscape(date)}</div>` : ""}</div>`;
  }

  function receiptSignatures(createdBy: string, customer: string, employee: string, date: string) {
    return `<div class="signatures">${receiptSignature("Dibuat oleh", "Pembuat transaksi", createdBy, date)}${receiptSignature("Pelanggan", "Penerima / pelanggan", customer, date)}${receiptSignature("Karyawan", "Pengaju / petugas", employee, date)}${receiptSignature("Owner", "Pemilik", "INDRA SAPUTRA", "", true)}</div>`;
  }

    async function submitRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !refundOrderId || !refundItemId || !refundReason.trim()) { setRefundError("Pilih order, produk, dan tulis alasan refund."); return; }
    const order = orderRows.find((item)=>item.id===refundOrderId);
    const item = order?.product_order_items.find((candidate)=>candidate.id===refundItemId);
    const quantity = Number(refundQuantity);
    if (!order || !item || !Number.isFinite(quantity) || quantity<=0 || quantity>Number(item.quantity)) { setRefundError("Pilih order dan produk yang valid; jumlah refund tidak boleh melebihi jumlah order."); return; }
    setRefundSubmitting(true); setRefundError(""); setRefundNotice("");
    const { data: refundResult, error: insertError } = await supabase.rpc("submit_product_refund",{p_order_id:order.id,p_order_item_id:item.id,p_quantity:quantity,p_reason:refundReason.trim()});
    const refund = Array.isArray(refundResult) ? refundResult[0] : refundResult;
    if (insertError || !refund) setRefundError("Refund gagal dikirim: "+(insertError?.message??"Permintaan tidak dapat diproses."));
    else { setRefundNotice(`Permintaan refund ${refund.refund_code} berhasil dikirim untuk ditinjau.`); setRefundReason(""); setRefundQuantity("1"); setBusinessRefresh((v)=>v+1); }
    setRefundSubmitting(false);
  }

  async function submitFinanceReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !financeReportDescription.trim() || !Number.isFinite(Number(financeReportAmount)) || Number(financeReportAmount)<=0) { setFinanceReportError("Isi nominal lebih dari nol dan keterangan transaksi."); return; }
    setFinanceReportSubmitting(true); setFinanceReportError(""); setFinanceReportNotice("");
    const reportCode = `LAP-${jakartaDateInput().replaceAll("-","")}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const { error: insertError } = await supabase.from("financial_reports").insert({report_code:reportCode,report_type:financeReportType,amount:Number(financeReportAmount),description:financeReportDescription.trim(),payment_method:financeReportPayment,reference_code:financeReportReference.trim()||null,related_order_id:financeReportRelatedOrderId||null,related_customer_id:financeReportCustomerId||null,submitted_by:profile.id});
    if (insertError) setFinanceReportError("Laporan gagal dikirim: "+insertError.message);
    else { setFinanceReportNotice(`Laporan ${reportCode} terkirim untuk diperiksa.`); setFinanceReportAmount(""); setFinanceReportDescription(""); setFinanceReportReference(""); setFinanceReportRelatedOrderId(""); setFinanceReportCustomerId(""); setBusinessRefresh((v)=>v+1); }
    setFinanceReportSubmitting(false);
  }

  async function reviewBusinessItem(table:"product_orders"|"product_refunds"|"financial_reports", id:string, status:string) {
    if (!profile || !["owner","admin"].includes(profile.role)) return;
    if(status==="fulfilled"&&table==="product_orders"){const {error:e}=await supabase.rpc("fulfill_product_order",{p_order_id:id});if(e){setError("Order tidak dapat dipenuhi: "+e.message);return;}}
    else if(status==="approved"&&table==="product_refunds"){const {error:e}=await supabase.rpc("approve_product_refund",{p_refund_id:id});if(e){setError("Refund tidak dapat disetujui: "+e.message);return;}}
    else if(status==="approved"&&table==="financial_reports"){const {error:e}=await supabase.rpc("approve_financial_report",{p_report_id:id});if(e){setError("Laporan tidak dapat diposting: "+e.message);return;}}
    else {const {error:e}=await supabase.from(table).update({status,reviewed_by:profile.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);if(e){setError("Status gagal diperbarui: "+e.message);return;}}
    setBusinessRefresh(v=>v+1);
  }

  async function saveProduct(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!profile||!["owner","admin"].includes(profile.role)){setInventoryError("Hanya Admin/Owner yang dapat mengelola produk.");return;}
    const salePrice=Number(inventoryForm.sale_price);
    const costPrice=Number(inventoryForm.cost_price);
    const targetStock=Number(inventoryForm.initial_stock);
    const minimumStock=Number(inventoryForm.minimum_stock);
    if(!inventoryForm.sku.trim()||!inventoryForm.barcode_value.trim()||!inventoryForm.name.trim()||
       ![salePrice,costPrice,targetStock,minimumStock].every(Number.isFinite)||
       salePrice<0||costPrice<0||targetStock<0||minimumStock<0){
      setInventoryError("SKU, barcode, nama, harga, dan stok wajib valid serta tidak boleh negatif.");return;
    }
    setInventorySaving(true);setInventoryError("");setInventoryNotice("");
    const {data:productId,error:saveError}=await supabase.rpc("save_product_with_stock",{
      p_product_id:editingProductId,
      p_sku:inventoryForm.sku.trim(),
      p_barcode_value:inventoryForm.barcode_value.trim(),
      p_name:inventoryForm.name.trim(),
      p_category_id:inventoryForm.category_id||null,
      p_unit:inventoryForm.unit.trim()||"pcs",
      p_description:inventoryForm.description.trim()||null,
      p_sale_price:salePrice,
      p_cost_price:costPrice,
      p_target_stock:targetStock,
      p_minimum_stock:minimumStock,
      p_storage_location:inventoryForm.storage_location.trim()||null
    });
    if(saveError||!productId){
      setInventoryError("Produk, harga pokok, dan stok tidak disimpan karena transaksi gagal: "+(saveError?.message??"Tidak ada ID produk yang dikembalikan."));
    }else{
      setInventoryNotice(editingProductId
        ?"Perubahan produk, harga pokok, stok, dan riwayat penyesuaian tersimpan bersama."
        :"Produk, harga pokok, stok awal, dan riwayat stok berhasil dicatat bersama.");
      setEditingProductId(null);
      setInventoryForm({sku:"",barcode_value:"",name:"",category_id:"",unit:"pcs",description:"",sale_price:"0",cost_price:"0",initial_stock:"0",minimum_stock:"0",storage_location:""});
      setBusinessRefresh(v=>v+1);
    }
    setInventorySaving(false);
  }
  async function saveProductCategory(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!profile||!["owner","admin"].includes(profile.role))return;
    const name=newProductCategoryName.trim();if(!name)return;
    if(productCategories.some(c=>c.name.toLowerCase()===name.toLowerCase())){setInventoryError("Kategori dengan nama tersebut sudah ada.");return;}
    const {data,error:saveError}=await supabase.from("product_categories").insert({name}).select("id,name").single();
    if(saveError)setInventoryError("Kategori gagal dibuat: "+saveError.message);else{setProductCategories(rows=>[...rows,data as ProductCategory].sort((a,b)=>a.name.localeCompare(b.name)));setNewProductCategoryName("");setInventoryNotice("Kategori produk berhasil ditambahkan.");}
  }
  async function saveFinancialCategory(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!profile||profile.role!=="owner")return;
    const name=newFinancialCategoryName.trim();if(!name)return;
    if(financialCategories.some(c=>c.transaction_type===newFinancialCategoryType&&c.name.toLowerCase()===name.toLowerCase())){setFinancialError("Kategori dengan nama tersebut sudah ada untuk jenis transaksi ini.");return;}
    const {data,error:saveError}=await supabase.from("financial_categories").insert({name,transaction_type:newFinancialCategoryType}).select("id,name,transaction_type").single();
    if(saveError)setFinancialError("Kategori keuangan gagal dibuat: "+saveError.message);else{setFinancialCategories(rows=>[...rows,data as FinancialCategory].sort((a,b)=>a.name.localeCompare(b.name)));setNewFinancialCategoryName("");setFinancialNotice("Kategori keuangan berhasil ditambahkan.");}
  }
  async function saveStockMovement(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!profile||!["owner","admin"].includes(profile.role))return;
    setStockSaving(true);setInventoryError("");setInventoryNotice("");
    const {error:saveError}=await supabase.rpc("record_stock_movement",{p_product_id:stockForm.product_id,p_movement_type:stockForm.movement_type,p_quantity:Number(stockForm.quantity),p_unit_cost:stockForm.unit_cost?Number(stockForm.unit_cost):null,p_reference_code:stockForm.reference_code.trim()||null,p_reason:stockForm.reason.trim()||null,p_notes:stockForm.notes.trim()||null});
    if(saveError)setInventoryError("Pergerakan stok gagal: "+saveError.message);
    else{setInventoryNotice("Stok dan riwayat pergerakan berhasil diperbarui bersama.");setStockForm(v=>({...v,quantity:"1",unit_cost:"",reference_code:"",reason:"",notes:""}));setBusinessRefresh(v=>v+1);}
    setStockSaving(false);
  }
  async function saveFinancialTransaction(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!profile||profile.role!=="owner")return;
    if(!financialDescription.trim()||!Number.isFinite(Number(financialAmount))||Number(financialAmount)<=0){setFinancialError("Nominal harus lebih dari nol dan keterangan wajib diisi.");return;}
    setFinancialSaving(true);setFinancialError("");setFinancialNotice("");
    const code=`TRX-${jakartaDateInput().replaceAll("-","")}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const {error:saveError}=await supabase.from("financial_transactions").insert({transaction_code:code,transaction_type:financialType,category_id:financialCategoryId||null,amount:Number(financialAmount),payment_method:financialPayment,description:financialDescription.trim(),reference_code:financialReference.trim()||null,created_by:profile.id});
    if(saveError)setFinancialError("Transaksi gagal dicatat: "+saveError.message);
    else{setFinancialNotice("Transaksi resmi berhasil dicatat.");setFinancialAmount("");setFinancialDescription("");setFinancialReference("");setBusinessRefresh(v=>v+1);}
    setFinancialSaving(false);
  }
  async function submitLeaveRequest(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!profile||!leaveEmployeeId){setLeaveError("Akun belum terhubung ke data karyawan. Minta Admin menghubungkan profil.");return;}
    if(leaveEnd<leaveStart||!leaveReason.trim()){setLeaveError("Tanggal akhir harus setelah tanggal mulai dan alasan wajib diisi.");return;}
    setLeaveSaving(true);setLeaveError("");setLeaveNotice("");
    const {error:saveError}=await supabase.from("leave_requests").insert({employee_id:leaveEmployeeId,leave_type:leaveType,start_date:leaveStart,end_date:leaveEnd,reason:leaveReason.trim(),status:"pending"});
    if(saveError)setLeaveError("Permohonan gagal dikirim: "+saveError.message);
    else{setLeaveNotice("Permohonan berhasil dikirim untuk ditinjau.");setLeaveReason("");setBusinessRefresh(v=>v+1);}
    setLeaveSaving(false);
  }
  async function reviewLeaveRequest(id:string,status:"approved"|"rejected"){
    if(!profile||!["owner","admin","hrd"].includes(profile.role))return;
    const {error:saveError}=await supabase.from("leave_requests").update({status,reviewed_by:profile.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);
    if(saveError)setLeaveError("Status permohonan gagal diperbarui.");else setBusinessRefresh(v=>v+1);
  }
  async function markNotificationRead(id:string){
    const {error:saveError}=await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",id);
    if(saveError)setNotificationError("Notifikasi gagal diperbarui.");else setNotificationRows(rows=>rows.map(n=>n.id===id?{...n,read_at:new Date().toISOString()}:n));
  }
  async function deleteProduct(product:ProductRow){
    if(!profile||!["owner","admin"].includes(profile.role))return;
    if(!window.confirm(`Hapus produk “${product.name}”? Produk yang sudah masuk riwayat order tidak bisa dihapus agar catatan transaksi tetap utuh.`))return;
    const [ordersRef,movementsRef,costRef]=await Promise.all([
      supabase.from("product_order_items").select("id",{count:"exact",head:true}).eq("product_id",product.id),
      supabase.from("stock_movements").select("id",{count:"exact",head:true}).eq("product_id",product.id),
      supabase.from("product_costs").select("product_id",{count:"exact",head:true}).eq("product_id",product.id)
    ]);
    if(ordersRef.error||movementsRef.error||costRef.error){setInventoryError("Riwayat produk tidak dapat diverifikasi; produk tidak dihapus.");return;}
    if((ordersRef.count??0)>0||(movementsRef.count??0)>0||(costRef.count??0)>0){
      const {error:archiveError}=await supabase.from("products").update({is_active:false,updated_at:new Date().toISOString()}).eq("id",product.id);
      if(archiveError)setInventoryError("Produk gagal diarsipkan: "+archiveError.message);else{setInventoryNotice("Produk dihapus dari katalog aktif dan diarsipkan agar riwayat order, stok, serta keuangan tetap utuh.");setShowInactiveProducts(false);setBusinessRefresh(v=>v+1);}return;
    }
    const {error:deleteError}=await supabase.from("products").delete().eq("id",product.id);
    if(deleteError)setInventoryError("Produk gagal dihapus: "+deleteError.message);else{setInventoryNotice("Produk berhasil dihapus permanen karena belum memiliki riwayat.");setBusinessRefresh(v=>v+1);}
  }

  async function deleteProductCategory(category:ProductCategory){
    if(!profile||!["owner","admin"].includes(profile.role))return;
    if(!window.confirm(`Hapus kategori “${category.name}”? Produk di kategori ini akan tetap ada dan dipindahkan menjadi tanpa kategori.`))return;
    setInventoryError("");setInventoryNotice("");
    const {error:deleteError}=await supabase.rpc("delete_product_category",{p_category_id:category.id});
    if(deleteError)setInventoryError("Kategori dan tautan produk tidak diubah karena penghapusan gagal: "+deleteError.message);
    else{setInventoryNotice("Kategori dihapus dan produk dipindahkan menjadi tanpa kategori dalam satu transaksi.");setSelectedCategoryId(null);setBusinessRefresh(v=>v+1);}
  }

  async function toggleProductActive(product:ProductRow){
    if(!profile||!["owner","admin"].includes(profile.role))return;
    const {error:saveError}=await supabase.from("products").update({is_active:!product.is_active,updated_at:new Date().toISOString()}).eq("id",product.id);
    if(saveError)setInventoryError("Status produk gagal diperbarui.");else{setInventoryNotice(product.is_active?"Produk dinonaktifkan.":"Produk diaktifkan.");setBusinessRefresh(v=>v+1);}
  }

  const displayName = profile?.full_name || profile?.email || session.user.email || "Pengguna";
  const isActive = Boolean(profile?.is_active);
  const moduleTitle = navItems.find((item) => item.key === activePage)?.label ?? "Ringkasan";

  return (
    <main className={`app-shell role-${profile?.role ?? "employee"} ${mobileMenuOpen ? "mobile-menu-open" : ""}`}>
      {mobileMenuOpen && <button type="button" className="mobile-menu-backdrop" aria-label="Tutup menu navigasi" onClick={() => setMobileMenuOpen(false)} />}
      <aside id="mobile-navigation" className="sidebar" aria-label="Navigasi utama">
        <div className="brand"><div className="brand-mark"><img src="/ndranexa-web.svg" alt="Logo NDRANEXA" style={{width:"100%",height:"100%",objectFit:"contain",display:"block"}} /></div><div><div className="brand-title">NDRANEXA</div><div className="brand-sub">BUSINESS PLATFORM</div></div></div>
        {["UTAMA", "OPERASIONAL", "INVENTARIS", "TRANSAKSI", "MANAJEMEN", "AKUN"].filter((group) => navItems.some((item) => item.group === group && (canAccessCurrentModule(item.key)) && item.label.toLowerCase().includes(menuSearch.trim().toLowerCase()))).map((group) => (
          <div key={group}>
            <div className="nav-label">{group}</div>
            <nav className="nav-list">
              {navItems.filter((item) => item.group === group && (canAccessCurrentModule(item.key)) && item.label.toLowerCase().includes(menuSearch.trim().toLowerCase())).map((item) => (
                <button key={item.key} className={`nav-item ${activePage === item.key || (["categories","products"].includes(item.key) && activePage === "inventory") ? "active" : ""}`} onClick={() => { if (item.key === "cashier") { window.location.href = "/offline-store?tab=pos"; return; } if (item.key === "transactions") { window.location.href = "/trx"; return; } if (item.key === "categories" || item.key === "products") setActivePage("inventory"); else setActivePage(item.key); setMobileMenuOpen(false); }}>
                  <span className="nav-icon">{item.icon}</span>{item.label}
                </button>
              ))}
            </nav>
          </div>
        ))}
        {(profile?.role === "owner" || profile?.role === "admin" || storePlacementActive) && <div><div className="nav-label">TOKO</div><nav className="nav-list"><Link href="/offline-store" className="nav-item" onClick={() => setMobileMenuOpen(false)}><span className="nav-icon"><Store size={16}/></span>Toko Offline</Link>{(profile?.role === "owner" || profile?.role === "admin") && <Link href="/store-requests" className="nav-item" onClick={() => setMobileMenuOpen(false)}><span className="nav-icon"><Inbox size={16}/></span>Pengajuan Permintaan</Link>}</nav></div>}
        {profile?.role !== "employee" && <div className="field menu-search"><label htmlFor="menu-search">Cari menu</label><input id="menu-search" type="search" value={menuSearch} onChange={e=>setMenuSearch(e.target.value)} placeholder="Cari menu..." aria-label="Cari menu website"/></div>}
        <div className="sidebar-bottom"><div className="side-foot"><strong>{profile?.role === "owner" ? "Owner workspace" : profile?.role === "admin" ? "◈ Admin workspace" : profile?.role === "hrd" ? "HRD workspace" : "◷ Ruang kerja karyawan"}</strong><p>{profile?.role === "owner" ? "Kontrol penuh bisnis, pengguna, dan konfigurasi." : profile?.role === "admin" ? "Kelola kegiatan operasional sesuai kewenangan." : profile?.role === "hrd" ? "Kelola data pekerja, kehadiran, dan cuti." : "Order, laporan uang, refund, dan absensi pribadi."}</p></div><button className="logout-button" onClick={handleLogout} disabled={busy}><span className="logout-symbol">↪</span><span><strong>{busy ? "Memproses..." : "Keluar dari akun"}</strong><small>Akhiri sesi dengan aman</small></span></button></div>
      </aside>
      <section className="main">
        <header className="topbar">
          <button type="button" className="mobile-menu-toggle" onClick={() => setMobileMenuOpen((open) => !open)} aria-expanded={mobileMenuOpen} aria-controls="mobile-navigation"><span className="mobile-menu-toggle-icon">{mobileMenuOpen ? <X size={17}/> : <Menu size={17}/>}</span><span>Menu</span></button>
          <div className="topbar-heading"><div><div className="eyebrow">{profile?.role === "owner" ? "OWNER CONTROL CENTER" : profile?.role === "admin" ? "ADMIN OPERATIONS" : profile?.role === "hrd" ? "HRD PEOPLE OPERATIONS" : "MY WORKSPACE"} / {moduleTitle.toUpperCase()}</div><div className="subtle workspace-caption" style={{ marginTop: 5 }}>{profile?.role === "owner" ? "Visibilitas menyeluruh dan pengaturan bisnis." : profile?.role === "admin" ? "Pusat kegiatan dan pengelolaan operasional." : profile?.role === "hrd" ? "Pusat data karyawan, absensi, dan cuti." : "Kelola order, laporan uang, refund, dan absensi pribadi."}</div></div></div>
          <button type="button" className="user-menu user-menu-button" onClick={() => setActivePage("profile")} aria-label="Buka profil saya"><div className="avatar">{displayName.slice(0,1).toUpperCase()}</div><div className="user-copy"><div className="user-email">{displayName}</div><div className="user-role">{roleName(profile?.role)}{isActive ? " · AKTIF" : " · NONAKTIF"}</div></div><span className="profile-shortcut">Profil ↗</span></button>
        </header>
        {activePage === "dashboard" ? <>
          <div className="welcome"><div><div className="eyebrow">DASHBOARD OVERVIEW</div><h1>Selamat datang, {displayName.split("@")[0]} <Hand size={20} style={{display:"inline",verticalAlign:"middle"}}/></h1><p className="subtle" style={{ marginBottom: 0 }}>Berikut ringkasan data yang tersedia pada workspace Anda.</p></div><div className="date-pill">● &nbsp; Database terhubung</div></div>
          {!isActive && <div className="error-box">Akun ini tidak aktif. Beberapa tindakan akan dibatasi. Hubungi Owner.</div>}
          {message && <div className="info-box">{message}</div>}
          {error && <div className="error-box">{error}</div>}
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-top"><span>{profile?.role==="employee"?"Absensi saya":"Catatan Absensi"}</span><span className="stat-icon">◷</span></div><div className="stat-value">{dataLoading ? "—" : counts.attendance}</div><div className="stat-note">Catatan yang dapat diakses</div></div>
            <div className="stat-card"><div className="stat-top"><span>Produk tersedia</span><span className="stat-icon">▤</span></div><div className="stat-value">{dataLoading ? "—" : counts.products}</div><div className="stat-note">Produk yang dapat diakses</div></div>
            {!storeScopedAccount&&<div className="stat-card"><div className="stat-top"><span>Order Produk</span><span className="stat-icon"><ShoppingCart size={16}/></span></div><div className="stat-value">{dataLoading ? "—" : counts.orders}</div><div className="stat-note">Order sesuai hak akses</div></div>}
            {!storeScopedAccount&&<div className="stat-card"><div className="stat-top"><span>Refund Produk</span><span className="stat-icon">↩</span></div><div className="stat-value">{dataLoading ? "—" : counts.refunds}</div><div className="stat-note">Permintaan refund tercatat</div></div>}
            {!storeScopedAccount&&<div className="stat-card"><div className="stat-top"><span>Laporan uang</span><span className="stat-icon">↗</span></div><div className="stat-value">{dataLoading ? "—" : counts.reports}</div><div className="stat-note">Laporan sesuai hak akses</div></div>}
            {profile?.role==="owner"&&<div className="stat-card"><div className="stat-top"><span>Transaksi resmi</span><span className="stat-icon">◈</span></div><div className="stat-value">{dataLoading ? "—" : counts.finances}</div><div className="stat-note">Buku besar Owner</div></div>}
          </div>
          {["owner","admin"].includes(profile?.role ?? "") && <section className="panel" style={{marginBottom:18,border:"1px solid rgba(74,144,226,.45)"}}>
            <div className="panel-head"><div><div className="eyebrow">KANTOR PUSAT</div><h2>Pengajuan Pembelian dari Toko Offline</h2><p className="subtle">Periksa permintaan stok dari semua toko, lalu setujui dan kirim barang atau tolak dengan alasan.</p></div><span className="status">PUSAT</span></div>
            <div className="business-actions"><Link href="/offline-store/purchases" className="btn btn-primary">Buka pengajuan pembelian →</Link><span className="subtle">Pengajuan yang sudah dikirim tetap tersimpan; tidak perlu diajukan ulang.</span></div>
          </section>}
          <div className="content-grid">
            <section className="panel"><div className="panel-head"><div><h2>Modul bisnis</h2><div className="subtle">Pilih area kerja yang ingin Anda buka</div></div><span className="status">ONLINE</span></div>
              <div className="activity-list">
                {navItems.filter((item) => item.key !== "dashboard" && (canAccessCurrentModule(item.key)) && (item.label+" "+descriptions[item.key]).toLowerCase().includes(menuSearch.trim().toLowerCase())).map((item) => <button className="activity" key={item.key} onClick={() => setActivePage(item.key)} style={{ width: "100%", textAlign: "left", background: "transparent", color: "inherit", borderLeft: 0, borderRight: 0, borderBottom: 0, cursor: "pointer" }}><div className="activity-icon">{item.icon}</div><div className="activity-copy"><strong>{item.label}</strong><span>{descriptions[item.key]}</span></div><span className="activity-time">BUKA ↗</span></button>)}
              </div>
            </section>
            <section className="panel"><div className="panel-head"><div><h2>Akses cepat</h2><div className="subtle">Pintasan modul</div></div></div><div className="quick-grid">
              {[{key:"orders" as ModuleKey,icon:"orders",label:"Order produk",desc:"Ajukan kebutuhan kerja"},{key:"refunds" as ModuleKey,icon:"↩",label:"Refund produk",desc:"Pengembalian barang"},{key:"finance-reports" as ModuleKey,icon:"↗",label:"Laporan uang",desc:"Catat uang masuk/keluar"},{key:"customers" as ModuleKey,icon:"customers",label:"Data Toko / Member",desc:"Daftarkan pembeli/toko"},{key:"attendance" as ModuleKey,icon:"◷",label:"Absensi",desc:"Check-in / Check-out"},{key:"leave" as ModuleKey,icon:"▣",label:"Izin / cuti",desc:"Permohonan hari kerja"},{key:"notifications" as ModuleKey,icon:"notifications",label:"Notifikasi",desc:"Status dan pembaruan"},{key:"employees" as ModuleKey,icon:"team",label:"Karyawan",desc:"Data tim"},{key:"inventory" as ModuleKey,icon:"▤",label:"Inventaris",desc:"Stok & produk"},{key:"finance" as ModuleKey,icon:"◈",label:"Keuangan",desc:"Buku besar resmi"},{key:"settings" as ModuleKey,icon:"settings",label:"Pengaturan",desc:"Akses dan aturan"}].filter((item) => canAccessCurrentModule(item.key)).map((item) => <button className="quick-card" key={item.key} onClick={() => setActivePage(item.key)}><span>{item.key==="orders"?<ShoppingCart size={17}/>:item.key==="refunds"?<RotateCcw size={17}/>:item.key==="finance-reports"||item.key==="finance"?<Banknote size={17}/>:item.key==="customers"?<Store size={17}/>:item.key==="employees"?<Users size={17}/>:item.key==="notifications"?<Bell size={17}/>:item.key==="settings"?<Settings size={17}/>:<Boxes size={17}/>}</span><strong>{item.label}</strong><small>{item.desc}</small></button>)}
            </div><div className="info-box" style={{ marginTop: 15 }}>{storeScopedAccount?"Akses operasional toko melalui menu Toko Offline. Data dan transaksi dibatasi ke penempatan aktif Anda.":profile?.role==="employee"?"Catat aktivitas selama shift: order produk, refund, uang masuk/keluar, dan absensi. Status laporan akan diperbarui setelah Admin/Owner meninjau.":profile?.role==="admin"?"Tinjau order, refund, laporan harian, persediaan, dan kehadiran tim dari satu workspace.":"Pantau alur order, stok, refund, laporan karyawan, dan transaksi resmi dari satu pusat kendali."}</div></section>
          </div>
        </> : activePage === "attendance" ? <section className="panel" style={{ maxWidth: 920 }}>
          <div className="eyebrow">MODUL / ABSENSI</div>
          <h1 style={{marginTop:10}}>Absensi</h1>
          <p className="subtle">Riwayat absensi tersedia di TRX. Gunakan kamera untuk melakukan absensi; pengelolaan status harian tim tetap tersedia untuk manajer toko yang berwenang.</p>
          <div className="business-actions" style={{marginTop:18,flexWrap:"wrap"}}>
            <button className="btn btn-primary" type="button" onClick={()=>{window.location.href="/trx";}}>Buka riwayat di TRX</button>
            <Link className="btn" href="/attendance-camera">Buka kamera & pendaftaran wajah</Link>
          </div>
          {isStoreManager&&<div className="panel" style={{marginTop:18}}>
            <div className="section-head"><div><h2>Pengelolaan status tim hari ini</h2><p className="subtle">Perubahan status dibatasi pada anggota tim sesuai penempatan Anda.</p></div><span className="status">{dailyAttendanceRows.length} sesi</span></div>
            {attendanceError&&<div className="error-box" role="alert">{attendanceError}</div>}
            {attendanceLoading?<p className="subtle">Memuat status tim…</p>:attendanceRows.filter(row=>row.work_date===jakartaDateInput()).length===0?<p className="subtle">Belum ada catatan absensi tim hari ini.</p>:attendanceRows.filter(row=>row.work_date===jakartaDateInput()).map(row=><article className="business-record" key={row.id}>
              <div className="business-record-head"><div><strong>{row.employees?.full_name||"Karyawan"}</strong><small>{row.employees?.employee_code||"—"} · {row.work_date}</small></div><span className="status-pill">{row.status}</span></div>
              <div className="business-actions" style={{marginTop:10}}><select aria-label={"Status absensi "+(row.employees?.full_name||"karyawan")} value={attendanceStatusDrafts[row.id]||row.status} onChange={e=>setAttendanceStatusDrafts(prev=>({...prev,[row.id]:e.target.value}))}><option value="present">Hadir</option><option value="late">Terlambat</option><option value="leave">Izin</option><option value="sick">Sakit</option><option value="absent">Alpa</option><option value="holiday">Libur</option></select><button className="btn btn-primary" disabled={attendanceSavingId===row.id||(attendanceStatusDrafts[row.id]||row.status)===row.status} onClick={()=>void saveTeamAttendanceStatus(row)}>{attendanceSavingId===row.id?"Menyimpan…":"Simpan status"}</button></div>
            </article>)}
          </div>}
        </section> : activePage === "employees" ? <section className="panel" style={{ maxWidth: 1200 }}>
          <div className="eyebrow">MODUL / KARYAWAN</div>
          <div className="section-head" style={{marginTop:12}}>
            <div><h1>Pengelolaan karyawan</h1><p className="subtle">Tambah, edit, dan nonaktifkan karyawan. Karyawan aktif tersedia pada pilihan di halaman absensi kamera.</p></div>
            <button className="btn" onClick={()=>setActivePage("dashboard")}>← Kembali</button>
          </div>
          {employeeError && <div className="error-box" role="alert">{employeeError}</div>}
          {employeeNotice && <div className="info-box" role="status">{employeeNotice}</div>}
          {["owner","admin","hrd"].includes(profile?.role ?? "") && <form onSubmit={saveEmployee} className="panel" style={{marginTop:18,background:"rgba(10,20,38,.45)"}}>
            <h2>{editingEmployeeId ? "Edit karyawan" : "Tambah karyawan baru"}</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginTop:14}}>
              <div className="field"><label htmlFor="employee-code">Kode karyawan *</label><input id="employee-code" required maxLength={40} value={employeeForm.employee_code} onChange={e=>setEmployeeForm(f=>({...f,employee_code:e.target.value}))} placeholder="Contoh: KRY-001"/></div>
              <div className="field"><label htmlFor="employee-name">Nama lengkap *</label><input id="employee-name" required maxLength={120} value={employeeForm.full_name} onChange={e=>setEmployeeForm(f=>({...f,full_name:e.target.value}))} placeholder="Nama karyawan"/></div>
              <div className="field"><label htmlFor="employee-email">Email (opsional)</label><input id="employee-email" type="email" value={employeeForm.email} onChange={e=>setEmployeeForm(f=>({...f,email:e.target.value}))} placeholder="karyawan@bisnis.com"/></div>
              <div className="field"><label htmlFor="employee-phone">Nomor HP (opsional)</label><input id="employee-phone" type="tel" value={employeeForm.phone} onChange={e=>setEmployeeForm(f=>({...f,phone:e.target.value}))} placeholder="+628..."/></div>
              <div className="field"><label htmlFor="employee-title">Jabatan (opsional)</label><input id="employee-title" value={employeeForm.job_title} onChange={e=>setEmployeeForm(f=>({...f,job_title:e.target.value}))} placeholder="Contoh: Kasir"/></div>
              <div className="field"><label htmlFor="employee-joined">Tanggal bergabung</label><input id="employee-joined" type="date" value={employeeForm.joined_on} onChange={e=>setEmployeeForm(f=>({...f,joined_on:e.target.value}))}/></div>
            </div>
            {!editingEmployeeId && ["owner","admin"].includes(profile?.role ?? "") && <div className="panel" style={{marginTop:14,background:"rgba(10,20,38,.35)"}}>
              <label style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={createLoginAccount} onChange={e=>setCreateLoginAccount(e.target.checked)} /> Buat akun login untuk karyawan ini</label>
              {createLoginAccount && <div style={{marginTop:12}}><p className="subtle">Akun akan login menggunakan email di atas. Pilih role sesuai kewenangan Anda.</p><div className="field"><label htmlFor="new-account-role">Role akun *</label><select id="new-account-role" value={newAccountRole} onChange={e=>setNewAccountRole(e.target.value as "employee"|"hrd"|"admin")}><option value="employee">Karyawan (akses operasional terbatas)</option>{profile?.role==="owner" && <option value="hrd">HRD / SDM</option>}{profile?.role==="owner" && <option value="admin">Admin (akses operasional)</option>}</select></div><div className="field"><label htmlFor="employee-initial-password">Kata sandi awal (minimal 8 karakter) *</label><input id="employee-initial-password" type="password" minLength={8} autoComplete="new-password" required value={employeePassword} onChange={e=>setEmployeePassword(e.target.value)} placeholder="Buat kata sandi sementara"/></div></div>}
            </div>}
            <div className="field"><label htmlFor="employee-notes">Catatan (opsional)</label><textarea id="employee-notes" rows={2} value={employeeForm.notes} onChange={e=>setEmployeeForm(f=>({...f,notes:e.target.value}))} placeholder="Catatan internal"/></div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button className="btn btn-primary" type="submit" disabled={employeeSaving}>{employeeSaving?"Menyimpan…":editingEmployeeId?"Simpan perubahan":"Tambah karyawan"}</button>{editingEmployeeId && <button className="btn" type="button" onClick={resetEmployeeForm}>Batal edit</button>}</div>
          </form>}
          <div className="section-head" style={{marginTop:24}}><div><h2>Daftar karyawan</h2><p className="subtle">{employeeRows.length} data · Gunakan status nonaktif jika karyawan memiliki riwayat absensi.</p></div><button className="btn" type="button" onClick={()=>setActivePage("employees")} disabled={employeeLoading}>Muat ulang</button></div><div className="field" style={{maxWidth:480,marginBottom:14}}><label htmlFor="employee-search">Cari / filter karyawan</label><input id="employee-search" type="search" value={employeeSearch} onChange={e=>setEmployeeSearch(e.target.value)} placeholder="Nama, kode, email, jabatan, status..." /></div>
          {employeeLoading ? <p className="subtle">Memuat daftar karyawan…</p> : employeeRows.length===0 ? <div className="info-box">Belum ada karyawan. Isi formulir di atas untuk menambahkan karyawan pertama.</div> : <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:900}}>
              <thead><tr style={{textAlign:"left",color:"#91a1b8"}}><th style={{padding:10}}>Kode</th><th style={{padding:10}}>Nama</th><th style={{padding:10}}>Kontak / Jabatan</th><th style={{padding:10}}>Role akun</th><th style={{padding:10}}>Status</th><th style={{padding:10}}>Aksi</th></tr></thead>
              <tbody>{employeeRows.filter(emp=>([emp.employee_code,emp.full_name,emp.email,emp.phone,emp.job_title,emp.employment_status,emp.joined_on].join(" ")).toLowerCase().includes(employeeSearch.trim().toLowerCase())).map(emp=><tr key={emp.id} style={{borderTop:"1px solid #25334a"}}>
                <td style={{padding:10}}><strong>{emp.employee_code}</strong></td><td style={{padding:10}}>{emp.full_name}<div className="subtle">{emp.joined_on||"Tanggal bergabung belum diisi"}</div></td>
                <td style={{padding:10}}>{emp.email||emp.phone||"Kontak belum diisi"}<div className="subtle">{emp.job_title||"Jabatan belum diisi"}</div></td>
                <td style={{padding:10}}>{(() => { const linked = accountRows.find(a => a.id === emp.profile_id || a.employee?.employee_code === emp.employee_code); return linked ? (profile?.role === "owner" ? <select aria-label={"Role akun pusat "+linked.email} value={linked.role} disabled={accountSavingId===linked.id || linked.role==="owner"} onChange={e=>void updateAccount(linked,e.target.value as Role,linked.is_active)}>{linked.role!=="employee" && <option value={linked.role} disabled>{linked.role==="admin"?"Admin (saat ini)":"Owner (dilindungi)"}</option>}<option value="employee">Karyawan</option><option value="admin">Admin</option></select> : <span className="status">{roleName(linked.role)}</span>) : <span className="subtle">Belum ada akun</span>; })()}</td>
                <td style={{padding:10}}><span className="status">{emp.employment_status==="active"?"AKTIF":"NONAKTIF"}</span></td>
                <td style={{padding:10}}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn" type="button" onClick={()=>{setEditingEmployeeId(emp.id);setEmployeeForm({employee_code:emp.employee_code,full_name:emp.full_name,email:emp.email||"",phone:emp.phone||"",job_title:emp.job_title||"",joined_on:emp.joined_on||"",notes:emp.notes||""});setEmployeeError("");setEmployeeNotice("");}}>Edit</button><button className="btn" type="button" onClick={()=>void toggleEmployeeStatus(emp)}>{emp.employment_status==="active"?"Nonaktifkan":"Aktifkan"}</button>{(() => { const linked = accountRows.find(a => a.id === emp.profile_id || a.employee?.employee_code === emp.employee_code); return profile?.role === "owner" && linked && linked.role !== "owner" ? <button className="btn" type="button" disabled={accountSavingId===linked.id} onClick={()=>void deleteEmployeeLogin(emp,linked)}>{accountSavingId===linked.id?"Memproses…":"Hapus akun"}</button> : null; })()}</div></td>
              </tr>)}</tbody>
            </table>
          </div>}
          <div className="info-box" style={{marginTop:16}}>Ini adalah role akun kantor pusat, bukan jabatan toko. Akun Manajer Toko tetap menggunakan role akun “Karyawan”; tetapkan jabatan Manajer melalui Toko Offline → Tim & Jabatan. Role Owner tidak dapat diberikan dari daftar karyawan. Menghapus akun login tidak menghapus data karyawan atau riwayat absensi.</div>
        </section> : activePage === "orders" ? <section className="business-page">
          <div className="business-hero"><div><div className="eyebrow">TRANSAKSI OPERASIONAL</div><h1>Order Produk</h1><p>Ajukan kebutuhan produk untuk aktivitas kerja dan pantau prosesnya dari satu tempat.</p></div><div className="business-hero-icon"><ShoppingCart size={24}/></div></div>
          {orderNotice && <div className="info-box" role="status">{orderNotice}</div>}{orderError && <div className="error-box" role="alert">{orderError}</div>}
          {["owner","admin"].includes(profile?.role??"")&&<div className="stats-grid"><div className="stat-card"><div className="stat-top">Order menunggu</div><div className="stat-value">{orderRows.filter(o=>o.status==="pending").length}</div><div className="stat-note">Perlu ditinjau Admin/Owner</div></div><div className="stat-card"><div className="stat-top">Nilai order tercatat</div><div className="stat-value">{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(orderRows.reduce((sum,o)=>sum+o.product_order_items.reduce((n,it)=>n+Number(it.line_total),0),0))}</div><div className="stat-note">Nilai permintaan; bukan kas masuk resmi</div></div><div className="stat-card"><div className="stat-top">Unit stok dicadangkan</div><div className="stat-value">{orderRows.filter(o=>o.stock_reserved).reduce((sum,o)=>sum+o.product_order_items.reduce((n,it)=>n+Number(it.quantity),0),0).toLocaleString("id-ID")}</div><div className="stat-note">Order pending/disetujui yang belum dipenuhi</div></div></div>}
          <div className="business-columns">
            <form className="panel business-form" onSubmit={submitProductOrder}>
              <div className="eyebrow">BUAT ORDER BARU</div><h2>Pilih produk</h2>
              <div className="field"><label htmlFor="order-product">Produk tersedia</label><select id="order-product" value={selectedOrderProductId} onChange={e=>setSelectedOrderProductId(e.target.value)}><option value="">Pilih produk…</option>{orderProducts.map(p=><option key={p.id} value={p.id} disabled={Number(p.current_stock)<=0}>{p.name} — stok {p.current_stock} {p.unit} — {new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(p.sale_price)} / {p.unit}</option>)}</select></div>
              {selectedOrderProductId && (()=>{const p=orderProducts.find(x=>x.id===selectedOrderProductId);return p?<div className="order-product-preview"><strong>{p.name}</strong><span>SKU: {p.sku}</span><span><strong>Stok tersedia:</strong> {p.current_stock} {p.unit}</span><strong>Harga satuan: {new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(p.sale_price)} / {p.unit}</strong></div>:null})()}
              <div className="field"><label htmlFor="order-customer">Nama toko / pembeli *</label><select id="order-customer" value={selectedOrderCustomerId} onChange={e=>setSelectedOrderCustomerId(e.target.value)} required><option value="">Pilih toko / pembeli</option>{customerRows.filter(c=>c.is_active).map(c=><option key={c.id} value={c.id}>{c.store_name} · {c.customer_code}</option>)}</select><small className="subtle">Wajib dipilih agar Admin bisa melihat order berasal dari toko mana. Jika belum terdaftar, daftarkan melalui menu Data Toko / Member.</small></div>
              <div className="field"><label htmlFor="order-qty">Jumlah produk ini</label><input id="order-qty" type="number" min="0.01" step="0.01" max={orderProducts.find(p=>p.id===selectedOrderProductId)?.current_stock ?? undefined} value={orderQuantity} onChange={e=>setOrderQuantity(e.target.value)} required /></div><button className="btn" type="button" disabled={!selectedOrderProductId} onClick={addOrderCartItem}>＋ Tambahkan produk ke order</button><div className="panel" style={{padding:14,marginTop:12}}><h3>Keranjang order ({orderCart.length} jenis produk)</h3>{orderCart.length===0?<p className="subtle">Belum ada produk. Tambahkan satu atau lebih produk berbeda.</p>:orderCart.map(line=>{const p=orderProducts.find(item=>item.id===line.product_id);return <div className="business-line" key={line.product_id}><span>{p?.name??"Produk"} × {line.quantity} {p?.unit??""}<small className="subtle" style={{display:"block"}}>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(line.quantity)*(p?.sale_price??0))}</small></span><button className="btn btn-compact" type="button" aria-label={"Hapus "+(p?.name??"produk")+" dari keranjang"} title="Hapus produk dari keranjang" onClick={()=>setOrderCart(rows=>rows.filter(row=>row.product_id!==line.product_id))}>Hapus</button></div>})}<div className="business-line"><strong>Total perkiraan</strong><strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(orderCart.reduce((sum,line)=>sum+Number(line.quantity)*(orderProducts.find(p=>p.id===line.product_id)?.sale_price??0),0))}</strong></div></div>
              <div className="field"><label htmlFor="order-payment-method">Metode pembayaran toko</label><select id="order-payment-method" value={orderPaymentMethod} onChange={e=>setOrderPaymentMethod(e.target.value)}><option value="cash">Tunai / cash</option><option value="bank_transfer">Transfer bank</option><option value="e_wallet">E-wallet / QRIS</option><option value="card">Kartu debit/kredit</option><option value="other">Lainnya / belum diketahui</option></select></div><div className="field"><label htmlFor="order-evidence">Foto bukti pembayaran (opsional, maks. 3 MB)</label><input id="order-evidence" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>setOrderEvidenceFile(e.target.files?.[0]??null)} /><small className="subtle">JPG, PNG, atau WEBP. Foto tidak wajib; ukuran maksimal 3 MB.</small>{orderEvidenceFile&&<small className="subtle">Dipilih: {orderEvidenceFile.name} ({(orderEvidenceFile.size/1024/1024).toFixed(2)} MB)</small>}</div><div className="field"><label htmlFor="order-notes">Catatan kebutuhan (opsional)</label><textarea id="order-notes" value={orderNotes} onChange={e=>setOrderNotes(e.target.value)} rows={3} placeholder="Contoh: untuk order pelanggan / kebutuhan shift sore" /></div>
              <button className="btn btn-primary" type="submit" disabled={orderSubmitting||!orderProducts.length||!selectedOrderCustomerId||orderCart.length===0}>{orderSubmitting?"Mengirim order…":"Kirim seluruh order ke Admin →"}</button>
              {!orderProducts.length && <p className="subtle">Belum ada produk aktif dengan stok tersedia.</p>}
            </form>
            <div className="panel centralized-history"><div className="eyebrow">AKTIVITAS TERKINI</div><h2>Riwayat order</h2>
              <div className="business-actions"><input aria-label="Cari riwayat order" placeholder="Cari kode / toko / pembuat…" value={orderHistorySearch} onChange={e=>setOrderHistorySearch(e.target.value)}/><select aria-label="Filter status order" value={orderHistoryStatus} onChange={e=>setOrderHistoryStatus(e.target.value)}><option value="all">Semua status</option><option value="pending">Menunggu</option><option value="approved">Disetujui</option><option value="fulfilled">Dipenuhi</option><option value="rejected">Ditolak</option><option value="cancelled">Dibatalkan</option></select><label className="field"><span>Dari</span><input type="date" value={orderHistoryFrom} onChange={e=>setOrderHistoryFrom(e.target.value)}/></label><label className="field"><span>Sampai</span><input type="date" value={orderHistoryTo} onChange={e=>setOrderHistoryTo(e.target.value)}/></label></div>{orderRows.filter(o=>(orderHistoryStatus==="all"||o.status===orderHistoryStatus)&&(!orderHistoryFrom||o.created_at.slice(0,10)>=orderHistoryFrom)&&(!orderHistoryTo||o.created_at.slice(0,10)<=orderHistoryTo)&&(`${o.order_code} ${o.business_customers?.store_name??""} ${o.ordered_by_profile?.full_name??""} ${o.ordered_by_profile?.email??""}`).toLowerCase().includes(orderHistorySearch.toLowerCase())).length===0?<p className="subtle">Tidak ada order yang cocok dengan filter.</p>:orderRows.filter(o=>(orderHistoryStatus==="all"||o.status===orderHistoryStatus)&&(!orderHistoryFrom||o.created_at.slice(0,10)>=orderHistoryFrom)&&(!orderHistoryTo||o.created_at.slice(0,10)<=orderHistoryTo)&&(`${o.order_code} ${o.business_customers?.store_name??""} ${o.ordered_by_profile?.full_name??""} ${o.ordered_by_profile?.email??""}`).toLowerCase().includes(orderHistorySearch.toLowerCase())).map(o=><article className="business-record" key={o.id}><div className="business-record-head"><div><strong>{o.order_code}</strong><small>{new Date(o.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</small></div><span className={`status-pill status-${o.status}`}>{o.status==="pending"?"Menunggu":o.status==="approved"?"Disetujui":o.status==="fulfilled"?"Dipenuhi":o.status==="rejected"?"Ditolak":"Dibatalkan"}</span></div>{<p className="subtle">Nama toko/data toko: <strong>{o.business_customers?.store_name??"Tidak ditautkan ke data toko"}</strong>{o.business_customers?.customer_code?` · ${o.business_customers.customer_code}`:""}</p>}<p className="subtle">Tanggal order: <strong>{new Date(o.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</strong></p><p className="subtle">Dibuat oleh: <strong>{o.ordered_by_profile?.full_name||o.ordered_by_profile?.email||"Akun "+o.ordered_by.slice(0,8)}</strong></p>{o.reviewed_by&&<p className="subtle">Ditinjau oleh: <strong>{o.reviewed_by_profile?.full_name||o.reviewed_by_profile?.email||"Akun "+o.reviewed_by.slice(0,8)}</strong>{o.reviewed_at?` · ${new Date(o.reviewed_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}`:""}</p>}<p className="subtle">Pembayaran toko: {({"cash":"Tunai / cash","bank_transfer":"Transfer bank","e_wallet":"E-wallet / QRIS","card":"Kartu debit/kredit","other":"Lainnya / belum diketahui"} as Record<string,string>)[o.payment_method??"other"]??"Belum dicatat"}{o.stock_reserved?" · Stok sudah dicadangkan":""}</p>{o.payment_evidence_path&&(o.ordered_by===profile?.id||["owner","admin"].includes(profile?.role??""))&&<button className="btn" type="button" onClick={()=>void openOrderEvidence(o.payment_evidence_path!)}>Lihat foto bukti</button>}{o.product_order_items?.map(it=><div className="business-line" key={it.id}><span>{it.products?.name ?? "Produk"} × {it.quantity}</span><strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(it.line_total)}</strong></div>)}{o.notes&&<p className="subtle">{o.notes}</p>}{["owner","admin"].includes(profile?.role??"")&&<div className="business-actions"><button className="btn" type="button" onClick={()=>printBusinessReceipt("Struk Order Produk",`<h2>Informasi Order</h2><div class="grid">${receiptField("Nomor order",o.order_code)}${receiptField("Tanggal",new Date(o.created_at).toLocaleString("id-ID"))}${receiptField("Toko / pembeli",o.business_customers?.store_name)}${receiptField("Kode toko",o.business_customers?.customer_code)}${receiptField("Pembuat order",o.ordered_by_profile?.full_name||o.ordered_by_profile?.email)}${receiptField("Dicetak oleh",profile?.full_name||profile?.email)}${receiptField("Status",o.status)}${receiptField("Metode pembayaran",o.payment_method)}</div><h2>Rincian produk</h2><table><thead><tr><th>No</th><th>Produk</th><th class="num">Jumlah</th><th class="num">Harga satuan</th><th class="num">Total</th></tr></thead><tbody>${o.product_order_items.map((it,i)=>`<tr><td>${i+1}</td><td>${receiptEscape(it.products?.name||"Produk")}</td><td class="num">${it.quantity} ${receiptEscape(it.products?.unit||"")}</td><td class="num">${new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(it.unit_price)}</td><td class="num">${new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(it.line_total)}</td></tr>`).join("")}</tbody></table><div class="total"><span>Total order</span><span>${new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(o.product_order_items.reduce((sum,it)=>sum+Number(it.line_total),0))}</span></div>${o.notes?`<h2>Catatan</h2><div class="note">${receiptEscape(o.notes)}</div>`:""}${receiptSignatures(o.ordered_by_profile?.full_name||o.ordered_by_profile?.email||"Nama akun",o.business_customers?.store_name||"Nama pelanggan",o.ordered_by_profile?.full_name||o.ordered_by_profile?.email||"Nama karyawan",new Date(o.created_at).toLocaleDateString("id-ID"))}`)}>Cetak struk</button></div>}{["owner","admin"].includes(profile?.role??"")&&o.status==="pending"&&<div className="business-actions"><button className="btn btn-primary" onClick={()=>void reviewBusinessItem("product_orders",o.id,"approved")}>Setujui</button><button className="btn" onClick={()=>void reviewBusinessItem("product_orders",o.id,"rejected")}>Tolak</button></div>}{["owner","admin"].includes(profile?.role??"")&&o.status==="approved"&&<div className="business-actions"><button className="btn btn-primary" onClick={()=>void reviewBusinessItem("product_orders",o.id,"fulfilled")}>Tandai dipenuhi</button></div>}</article>)}
            </div>
          </div>
        </section> : activePage === "customers" ? <section className="business-page">
          <div className="business-hero"><div><div className="eyebrow">CRM & MEMBER TOKO</div><h1>Data Toko / Member</h1><p>Daftarkan pembeli/toko agar terhubung dengan order produk dan pantau aktivitas pembeliannya.</p></div><div className="business-hero-icon"><Store size={24}/></div></div>
          {customerNotice&&<div className="info-box" role="status">{customerNotice}</div>}{customerError&&<div className="error-box" role="alert">{customerError}</div>}
          <div className="business-columns">
            <form className="panel business-form" onSubmit={submitCustomer}><div className="eyebrow">REGISTRASI MEMBER BARU</div><h2>Data toko / pembeli</h2>
              <div className="field"><label htmlFor="customer-store">Nama toko / pembeli *</label><input id="customer-store" value={customerStoreName} onChange={e=>setCustomerStoreName(e.target.value)} placeholder="Contoh: Toko Sumber Rejeki" required maxLength={160}/></div>
              <div className="field"><label htmlFor="customer-owner">Nama pemilik / PIC</label><input id="customer-owner" value={customerOwnerName} onChange={e=>setCustomerOwnerName(e.target.value)} placeholder="Nama penanggung jawab" maxLength={120}/></div>
              <div className="field"><label htmlFor="customer-phone">Nomor telepon / WhatsApp</label><input id="customer-phone" type="tel" value={customerPhone} onChange={e=>setCustomerPhone(e.target.value)} placeholder="08xxxxxxxxxx" maxLength={40}/></div>
              <div className="field"><label htmlFor="customer-email">Email</label><input id="customer-email" type="email" value={customerEmail} onChange={e=>setCustomerEmail(e.target.value)} placeholder="toko@email.com" maxLength={254}/></div>
              <div className="field"><label htmlFor="customer-address">Alamat toko</label><textarea id="customer-address" value={customerAddress} onChange={e=>setCustomerAddress(e.target.value)} rows={2} maxLength={500}/></div>
              <div className="field"><label htmlFor="customer-notes">Catatan</label><textarea id="customer-notes" value={customerNotes} onChange={e=>setCustomerNotes(e.target.value)} rows={2} placeholder="Preferensi order atau catatan penting" maxLength={1000}/></div>
              <button className="btn btn-primary" type="submit" disabled={customerSubmitting}>{customerSubmitting?"Mendaftarkan…":"Daftarkan toko sebagai member →"}</button>
            </form>
            <div className="panel business-history"><div className="section-head"><div><div className="eyebrow">DATABASE PELANGGAN</div><h2>Aktivitas toko</h2><p className="subtle">Status aktivitas dihitung dari order yang benar-benar tercatat.</p></div><button className="btn" type="button" onClick={()=>setBusinessRefresh(v=>v+1)}>↻ Muat ulang</button></div>
              {customerRows.length===0?<p className="subtle">Belum ada member toko. Daftarkan toko pertama melalui formulir.</p>:customerRows.map(c=><article className="business-record" key={c.id}><div className="business-record-head"><div><strong>{c.store_name}</strong><small>{c.customer_code}</small></div><span className={c.order_count>0&&c.last_order_at&&Date.now()-new Date(c.last_order_at).getTime()<=30*86400000?"status-pill status-approved":"status-pill status-pending"}>{c.order_count===0?"Belum pernah order":c.last_order_at&&Date.now()-new Date(c.last_order_at).getTime()<=30*86400000?"Aktif order 30 hari":"Tidak aktif 30 hari"}</span></div><button className="btn btn-primary" type="button" onClick={()=>setSelectedCustomerProfileId(selectedCustomerProfileId===c.id?null:c.id)}>{selectedCustomerProfileId===c.id?"Tutup profil":"Buka dashboard profil toko →"}</button>
                {selectedCustomerProfileId===c.id&&<div style={{marginTop:14}}><div className="eyebrow">PROFIL TOKO</div><p className="subtle">Terdaftar {new Date(c.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})} · PIC {c.owner_name||"—"} · Telepon {c.phone||"—"}</p><p className="subtle">Email: {c.email||"—"} · Alamat: {c.address||"—"} · Catatan: {c.notes||"—"}</p><div className="stats-grid"><div className="stat-card"><div className="stat-top">Total order</div><div className="stat-value">{orderRows.filter(o=>o.customer_id===c.id).length}</div></div><div className="stat-card"><div className="stat-top">Nominal order disetujui/dipenuhi</div><div className="stat-value" style={{fontSize:16}}>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(orderRows.filter(o=>o.customer_id===c.id&&["approved","fulfilled"].includes(o.status)).reduce((sum,o)=>sum+o.product_order_items.reduce((a,it)=>a+Number(it.line_total),0),0))}</div></div><div className="stat-card"><div className="stat-top">Total unit produk</div><div className="stat-value">{orderRows.filter(o=>o.customer_id===c.id).reduce((sum,o)=>sum+o.product_order_items.reduce((a,it)=>a+Number(it.quantity),0),0)}</div></div></div><p className="subtle">Riwayat order toko dipusatkan di TRX agar riwayat tidak tersebar di dalam modul pelanggan.</p><Link className="btn" href="/trx">Lihat riwayat order di TRX</Link></div>}
              </article>)}
            </div>
          </div>
        </section> : activePage === "refunds" ? <section className="business-page">
          <div className="business-hero"><div><div className="eyebrow">PENGEMBALIAN PRODUK</div><h1>Refund Produk</h1><p>{profile?.role==="employee"?"Refund hanya dapat diajukan untuk order milik akun Anda yang sudah disetujui atau dipenuhi. Jika order masih menunggu Admin/Owner, tunggu keputusan terlebih dahulu.":"Owner/Admin dapat mengajukan refund untuk order toko yang sudah disetujui atau dipenuhi, termasuk order yang dibuat oleh akun lain."}</p></div><div className="business-hero-icon">↩</div></div>
          {refundNotice && <div className="info-box" role="status">{refundNotice}</div>}{refundError && <div className="error-box" role="alert">{refundError}</div>}
          <div className="business-columns">
            <form className="panel business-form" onSubmit={submitRefund}><div className="eyebrow">AJUKAN REFUND</div><h2>Detail pengembalian</h2>
              <div className="field"><label htmlFor="refund-customer">Pilih toko / pembeli *</label><select id="refund-customer" value={refundCustomerId} onChange={e=>{setRefundCustomerId(e.target.value);setRefundOrderId("");setRefundItemId("");setRefundQuantity("1");}} required><option value="">Pilih toko terlebih dahulu</option>{customerRows.filter(c=>c.is_active).map(c=><option key={c.id} value={c.id}>{c.store_name} · {c.customer_code}</option>)}</select><small className="subtle">Daftar order otomatis difilter sesuai toko yang dipilih.</small></div>
              <div className="field"><label htmlFor="refund-order">Order dari toko terpilih</label><select id="refund-order" value={refundOrderId} onChange={e=>{setRefundOrderId(e.target.value);setRefundItemId("");setRefundQuantity("1");}} required disabled={!refundCustomerId}><option value="">{refundCustomerId?"Pilih order…":"Pilih toko terlebih dahulu"}</option>{orderRows.filter(o=>(profile?.role!=="employee"||o.ordered_by===profile?.id)&&o.customer_id===refundCustomerId&&["approved","fulfilled"].includes(o.status)).map(o=><option key={o.id} value={o.id}>{o.order_code} · {o.status==="approved"?"Disetujui":"Dipenuhi"}</option>)}</select>{refundCustomerId&&orderRows.filter(o=>(profile?.role!=="employee"||o.ordered_by===profile?.id)&&o.customer_id===refundCustomerId&&["approved","fulfilled"].includes(o.status)).length===0&&<small className="subtle">Tidak ada order yang memenuhi syarat refund dari toko ini.</small>}</div>
              <div className="field"><label htmlFor="refund-item">Produk</label><select id="refund-item" value={refundItemId} onChange={e=>setRefundItemId(e.target.value)} required><option value="">Pilih produk…</option>{orderRows.find(o=>o.id===refundOrderId)?.product_order_items.map(it=><option key={it.id} value={it.id}>{it.products?.name??"Produk"} · dipesan {it.quantity} {it.products?.unit??""}</option>)}</select></div>
              <div className="field"><label htmlFor="refund-qty">Jumlah yang direfund</label><input id="refund-qty" type="number" min="0.01" step="0.01" max={orderRows.find(o=>o.id===refundOrderId)?.product_order_items.find(it=>it.id===refundItemId)?.quantity??undefined} value={refundQuantity} onChange={e=>setRefundQuantity(e.target.value)} required /></div>
              <div className="field"><label htmlFor="refund-reason">Alasan refund</label><textarea id="refund-reason" value={refundReason} onChange={e=>setRefundReason(e.target.value)} rows={3} placeholder="Jelaskan kondisi atau alasan pengembalian" required /></div>
              <button className="btn btn-primary" type="submit" disabled={refundSubmitting}>{refundSubmitting?"Mengirim…":"Kirim permintaan refund →"}</button>
            </form>
            <div className="panel centralized-history"><div className="eyebrow">PEMANTAUAN</div><h2>Riwayat refund</h2><div className="business-actions"><input aria-label="Cari riwayat refund" placeholder="Cari kode / toko / order…" value={refundHistorySearch} onChange={e=>setRefundHistorySearch(e.target.value)}/><select aria-label="Filter status refund" value={refundHistoryStatus} onChange={e=>setRefundHistoryStatus(e.target.value)}><option value="all">Semua status</option><option value="pending">Dalam tinjauan</option><option value="approved">Disetujui</option><option value="rejected">Ditolak</option></select><label className="field"><span>Dari</span><input type="date" value={refundHistoryFrom} onChange={e=>setRefundHistoryFrom(e.target.value)}/></label><label className="field"><span>Sampai</span><input type="date" value={refundHistoryTo} onChange={e=>setRefundHistoryTo(e.target.value)}/></label></div>{refundRows.filter(r=>(refundHistoryStatus==="all"||r.status===refundHistoryStatus)&&(!refundHistoryFrom||r.created_at.slice(0,10)>=refundHistoryFrom)&&(!refundHistoryTo||r.created_at.slice(0,10)<=refundHistoryTo)&&(`${r.refund_code} ${r.product_orders?.order_code??""} ${r.product_orders?.business_customers?.store_name??""}`).toLowerCase().includes(refundHistorySearch.toLowerCase())).length===0?<p className="subtle">Tidak ada refund yang cocok dengan filter.</p>:refundRows.filter(r=>(refundHistoryStatus==="all"||r.status===refundHistoryStatus)&&(!refundHistoryFrom||r.created_at.slice(0,10)>=refundHistoryFrom)&&(!refundHistoryTo||r.created_at.slice(0,10)<=refundHistoryTo)&&(`${r.refund_code} ${r.product_orders?.order_code??""} ${r.product_orders?.business_customers?.store_name??""}`).toLowerCase().includes(refundHistorySearch.toLowerCase())).map(r=><article className="business-record" key={r.id}><div className="business-record-head"><div><strong>{r.refund_code}</strong><small>Order {r.product_orders?.order_code??"—"} · Toko: {r.product_orders?.business_customers?.store_name??"Tidak ditautkan"} · {new Date(r.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</small></div><span className={`status-pill ${r.status==="approved"?"status-approved":r.status==="rejected"?"status-rejected":"status-pending"}`}>{r.status==="pending"||r.status==="under_review"?"Dalam tinjauan":r.status==="approved"?"Disetujui":r.status==="rejected"?"Ditolak":r.status}</span></div><p><strong>Alasan refund:</strong> {r.reason}</p><p className="subtle">Diajukan oleh: <strong>{r.requested_by_profile?.full_name||r.requested_by_profile?.email||(r.requested_by===profile?.id?(profile?.full_name||profile?.email):"Akun "+r.requested_by.slice(0,8))}</strong></p>{r.reviewed_by&&<p className="subtle">Diproses oleh: <strong>{r.reviewed_by_profile?.full_name||r.reviewed_by_profile?.email||"Akun "+r.reviewed_by.slice(0,8)}</strong>{r.reviewed_at?` · ${new Date(r.reviewed_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}`:""}</p>}{["owner","admin"].includes(profile?.role??"")&&<div className="business-actions"><button className="btn" type="button" onClick={()=>printBusinessReceipt("Struk Pengajuan Refund",`<h2>Informasi Pengajuan</h2><div class="grid">${receiptField("Nomor refund",r.refund_code)}${receiptField("Nomor order",r.product_orders?.order_code)}${receiptField("Toko / pembeli",r.product_orders?.business_customers?.store_name)}${receiptField("Tanggal pengajuan",new Date(r.created_at).toLocaleString("id-ID"))}${receiptField("Pengaju",r.requested_by===profile?.id?(profile?.full_name||profile?.email):"Lihat detail pengaju di riwayat")}${receiptField("Status",r.status)}</div><h2>Rincian refund</h2><div class="grid">${receiptField("Jumlah",r.quantity+" unit")}${receiptField("Nominal",new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(r.amount))}</div><h2>Alasan</h2><div class="note">${receiptEscape(r.reason)}</div>${receiptSignatures("Nama akun",r.product_orders?.business_customers?.store_name||"Nama pelanggan",r.requested_by===profile?.id?(profile?.full_name||profile?.email||"Nama pengaju"):"ID "+r.requested_by.slice(0,8),new Date(r.created_at).toLocaleDateString("id-ID"))}`)}>Cetak struk</button></div>}<div className="business-line"><span>{r.quantity} unit</span><strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(r.amount)}</strong></div>{["owner","admin","hrd"].includes(profile?.role??"")&&r.status==="pending"&&<div className="business-actions"><button className="btn btn-primary" onClick={()=>void reviewBusinessItem("product_refunds",r.id,"approved")}>Setujui</button><button className="btn" onClick={()=>void reviewBusinessItem("product_refunds",r.id,"rejected")}>Tolak</button></div>}</article>)}</div>
          </div>
        </section> : activePage === "finance-reports" ? <section className="business-page">
          <div className="business-hero"><div><div className="eyebrow">LAPORAN KEUANGAN HARIAN</div><h1>Laporan Uang Masuk / Keluar</h1><p>Catat transaksi selama shift. Laporan masuk ke antrean pemeriksaan Admin/Owner dan tidak langsung mengubah buku keuangan resmi.</p></div><div className="business-hero-icon">↗</div></div>
          {financeReportNotice && <div className="info-box" role="status">{financeReportNotice}</div>}{financeReportError && <div className="error-box" role="alert">{financeReportError}</div>}
          <div className="business-columns">
            <form className="panel business-form" onSubmit={submitFinanceReport}><div className="eyebrow">BUAT LAPORAN</div><h2>Detail transaksi</h2>
              <div className="field"><label htmlFor="finance-report-type">Jenis transaksi</label><select id="finance-report-type" value={financeReportType} onChange={e=>setFinanceReportType(e.target.value as "income"|"expense")}><option value="income">Uang masuk</option><option value="expense">Uang keluar</option></select></div>
              <div className="field"><label htmlFor="finance-report-amount">Nominal (Rp)</label><input id="finance-report-amount" type="number" min="1" step="1" value={financeReportAmount} onChange={e=>setFinanceReportAmount(e.target.value)} placeholder="Contoh: 150000" required /></div>
              <div className="field"><label htmlFor="finance-report-desc">Keterangan</label><textarea id="finance-report-desc" value={financeReportDescription} onChange={e=>setFinanceReportDescription(e.target.value)} rows={3} placeholder="Apa transaksi yang terjadi?" required /></div>
              <div className="field"><label htmlFor="finance-report-payment">Metode pembayaran</label><select id="finance-report-payment" value={financeReportPayment} onChange={e=>setFinanceReportPayment(e.target.value)}><option value="cash">Tunai</option><option value="bank_transfer">Transfer bank</option><option value="e_wallet">E-wallet</option><option value="card">Kartu</option><option value="other">Lainnya</option></select></div>
              <div className="field"><label htmlFor="finance-report-customer">Nama toko / pembeli *</label><select id="finance-report-customer" value={financeReportCustomerId} onChange={e=>setFinanceReportCustomerId(e.target.value)} required><option value="">Pilih toko / pembeli</option>{customerRows.filter(c=>c.is_active).map(c=><option key={c.id} value={c.id}>{c.store_name} · {c.customer_code}</option>)}</select><small className="subtle">Wajib dipilih supaya laporan uang jelas berasal dari toko mana.</small></div><div className="field"><label htmlFor="finance-report-order">Terkait order (opsional)</label><select id="finance-report-order" value={financeReportRelatedOrderId} onChange={e=>setFinanceReportRelatedOrderId(e.target.value)}><option value="">Tidak terkait order tertentu</option>{orderRows.filter(o=>profile?.role!=="employee"||o.ordered_by===profile?.id).map(o=><option key={o.id} value={o.id}>{o.order_code} · {o.business_customers?.store_name??"Tanpa data toko"}</option>)}</select><small className="subtle">Pilih order agar laporan uang jelas terkait toko dan nomor order.</small></div><div className="field"><label htmlFor="finance-report-ref">Referensi / bukti (opsional)</label><input id="finance-report-ref" value={financeReportReference} onChange={e=>setFinanceReportReference(e.target.value)} placeholder="Nomor transaksi / referensi" /></div>
              <button className="btn btn-primary" type="submit" disabled={financeReportSubmitting||!financeReportCustomerId}>{financeReportSubmitting?"Mengirim laporan…":"Kirim laporan →"}</button>
            </form>
            <div className="panel centralized-history"><div className="eyebrow">AUDIT HARIAN</div><h2>Riwayat laporan</h2><div className="business-actions"><input aria-label="Cari riwayat uang" placeholder="Cari kode / keterangan / toko…" value={moneyHistorySearch} onChange={e=>setMoneyHistorySearch(e.target.value)}/><select aria-label="Filter status laporan uang" value={moneyHistoryStatus} onChange={e=>setMoneyHistoryStatus(e.target.value)}><option value="all">Semua status</option><option value="pending">Menunggu</option><option value="approved">Disetujui</option><option value="rejected">Ditolak</option></select><label className="field"><span>Dari</span><input type="date" value={moneyHistoryFrom} onChange={e=>setMoneyHistoryFrom(e.target.value)}/></label><label className="field"><span>Sampai</span><input type="date" value={moneyHistoryTo} onChange={e=>setMoneyHistoryTo(e.target.value)}/></label></div>{financeReportRows.filter(r=>(moneyHistoryStatus==="all"||r.status===moneyHistoryStatus)&&(!moneyHistoryFrom||r.created_at.slice(0,10)>=moneyHistoryFrom)&&(!moneyHistoryTo||r.created_at.slice(0,10)<=moneyHistoryTo)&&(`${r.report_code} ${r.description} ${r.business_customers?.store_name??r.product_orders?.business_customers?.store_name??""}`).toLowerCase().includes(moneyHistorySearch.toLowerCase())).length===0?<p className="subtle">Tidak ada laporan uang yang cocok dengan filter.</p>:financeReportRows.filter(r=>(moneyHistoryStatus==="all"||r.status===moneyHistoryStatus)&&(!moneyHistoryFrom||r.created_at.slice(0,10)>=moneyHistoryFrom)&&(!moneyHistoryTo||r.created_at.slice(0,10)<=moneyHistoryTo)&&(`${r.report_code} ${r.description} ${r.business_customers?.store_name??r.product_orders?.business_customers?.store_name??""}`).toLowerCase().includes(moneyHistorySearch.toLowerCase())).map(r=><article className="business-record" key={r.id}><div className="business-record-head"><div><strong>{r.report_code}</strong><small>{new Date(r.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})} · Order {r.product_orders?.order_code??"tanpa order"} · Toko: {r.business_customers?.store_name??r.product_orders?.business_customers?.store_name??"Tidak ditautkan"}</small></div><span className={`status-pill status-${r.status}`}>{r.status==="pending"?"Menunggu":r.status==="approved"?"Disetujui":"Ditolak"}</span></div><div className="business-line"><span>{r.report_type==="income"?"Uang masuk":"Uang keluar"} · {r.description}</span><strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(r.amount)}</strong></div><small className="subtle">Metode pembayaran: {r.payment_method??"Belum dicatat"}</small><p className="subtle">Diajukan oleh: <strong>{r.submitted_by_profile?.full_name||r.submitted_by_profile?.email||(r.submitted_by===profile?.id?(profile?.full_name||profile?.email):"Akun "+r.submitted_by.slice(0,8))}</strong></p>{r.reviewed_by&&<p className="subtle">Ditinjau oleh: <strong>{r.reviewed_by_profile?.full_name||r.reviewed_by_profile?.email||"Akun "+r.reviewed_by.slice(0,8)}</strong>{r.reviewed_at?` · ${new Date(r.reviewed_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}`:""}</p>}{["owner","admin"].includes(profile?.role??"")&&<div className="business-actions"><button className="btn" type="button" onClick={()=>printBusinessReceipt("Struk Laporan Uang",`<h2>Informasi Laporan</h2><div class="grid">${receiptField("Nomor laporan",r.report_code)}${receiptField("Tanggal",new Date(r.created_at).toLocaleString("id-ID"))}${receiptField("Jenis",r.report_type==="income"?"Uang masuk":"Uang keluar")}${receiptField("Toko / pembeli",r.business_customers?.store_name||r.product_orders?.business_customers?.store_name)}${receiptField("Nomor order",r.product_orders?.order_code)}${receiptField("Pengaju",r.submitted_by===profile?.id?(profile?.full_name||profile?.email):"Lihat detail pengaju di riwayat")}${receiptField("Status",r.status)}${receiptField("Metode pembayaran",r.payment_method)}</div><h2>Rincian transaksi</h2><div class="note">${receiptEscape(r.description)}</div><div class="total"><span>Nominal</span><span>${new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(r.amount)}</span></div>${receiptSignatures(r.submitted_by===profile?.id?(profile?.full_name||profile?.email||"Nama pengaju"):"ID "+r.submitted_by.slice(0,8),r.business_customers?.store_name||r.product_orders?.business_customers?.store_name||"Nama pelanggan",r.submitted_by===profile?.id?(profile?.full_name||profile?.email||"Nama karyawan"):"ID "+r.submitted_by.slice(0,8),new Date(r.created_at).toLocaleDateString("id-ID"))}`)}>Cetak struk</button></div>}{["owner","admin"].includes(profile?.role??"")&&r.status==="pending"&&<div className="business-actions"><button className="btn btn-primary" onClick={()=>void reviewBusinessItem("financial_reports",r.id,"approved")}>Setujui</button><button className="btn" onClick={()=>void reviewBusinessItem("financial_reports",r.id,"rejected")}>Tolak</button></div>}</article>)}</div>
          </div>
        </section> : activePage === "inventory" ? <section className="business-page">
          <div className="business-hero"><div><div className="eyebrow">KONTROL STOK TERPADU</div><h1>Inventaris & Stok</h1><p>Kelola katalog, stok minimum, barcode dan riwayat pergerakan dalam satu sumber data.</p></div><div className="business-hero-icon">▤</div></div>
          {inventoryNotice&&<div className="info-box" role="status">{inventoryNotice}</div>}{inventoryError&&<div className="error-box" role="alert">{inventoryError}</div>}
          <div className="stats-grid"><div className="stat-card"><div className="stat-top">Produk aktif</div><div className="stat-value">{productRows.filter(p=>p.is_active).length}</div></div><div className="stat-card"><div className="stat-top">Stok menipis</div><div className="stat-value">{productRows.filter(p=>p.is_active&&Number(p.current_stock)<=Number(p.minimum_stock)).length}</div></div><div className="stat-card"><div className="stat-top">Total unit</div><div className="stat-value">{productRows.reduce((n,p)=>n+Number(p.current_stock),0).toLocaleString("id-ID")}</div></div></div>
          {["owner","admin"].includes(profile?.role??"")&&<div className="business-columns">
            <form className="panel business-form" onSubmit={saveProduct}><h2>{editingProductId?"Edit informasi produk":"Tambah produk"}</h2>
              <div className="field"><label>Nama produk *</label><input value={inventoryForm.name} onChange={e=>setInventoryForm(v=>({...v,name:e.target.value}))} required/></div>
              <div className="field"><label>SKU unik *</label><input value={inventoryForm.sku} onChange={e=>setInventoryForm(v=>({...v,sku:e.target.value}))} required/></div>
              <div className="field"><label>Barcode unik *</label><input value={inventoryForm.barcode_value} onChange={e=>setInventoryForm(v=>({...v,barcode_value:e.target.value}))} required/></div>
              <div className="field"><label>Kategori</label><select value={inventoryForm.category_id} onChange={e=>setInventoryForm(v=>({...v,category_id:e.target.value}))}><option value="">Tanpa kategori</option>{productCategories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div className="field"><label>Satuan barang</label><input value={inventoryForm.unit} onChange={e=>setInventoryForm(v=>({...v,unit:e.target.value}))} placeholder="Contoh: pcs, kg, box" required/><small className="subtle">Isi jenis satuan barang, bukan angka stok. Contoh: pcs. Jumlah stok diisi terpisah pada kolom Stok awal.</small></div>
              <div className="field"><label>Harga jual per satuan (Rp)</label><input type="number" min="0" value={inventoryForm.sale_price} onChange={e=>setInventoryForm(v=>({...v,sale_price:e.target.value}))} required/></div><div className="field"><label>Harga pokok / modal per satuan (Rp)</label><input type="number" min="0" value={inventoryForm.cost_price} onChange={e=>setInventoryForm(v=>({...v,cost_price:e.target.value}))} required/><small className="subtle">Dipakai untuk menghitung laba kotor order. Isi modal barang yang benar agar laba tidak keliru.</small></div>
              <div className="field"><label>{editingProductId?"Stok fisik yang ingin ditetapkan":"Stok awal"}</label><input type="number" min="0" step="0.01" value={inventoryForm.initial_stock} onChange={e=>setInventoryForm(v=>({...v,initial_stock:e.target.value}))} required/><small className="subtle">{editingProductId?"Isi jumlah stok akhir yang benar. Selisih akan dicatat otomatis sebagai penyesuaian stok.":"Jumlah ini dicatat sebagai stok awal saat produk dibuat."}</small></div>
              <div className="field"><label>Batas minimum stok</label><input type="number" min="0" step="0.01" value={inventoryForm.minimum_stock} onChange={e=>setInventoryForm(v=>({...v,minimum_stock:e.target.value}))} required/></div>
              <div className="field"><label>Lokasi penyimpanan</label><input value={inventoryForm.storage_location} onChange={e=>setInventoryForm(v=>({...v,storage_location:e.target.value}))}/></div>
              <div className="field"><label>Deskripsi</label><textarea value={inventoryForm.description} onChange={e=>setInventoryForm(v=>({...v,description:e.target.value}))} rows={2}/></div>
              <button className="btn btn-primary" type="submit" disabled={inventorySaving}>{inventorySaving?"Menyimpan…":editingProductId?"Simpan perubahan produk":"Simpan produk + stok awal"}</button>
            </form>
            <form className="panel business-form" onSubmit={saveStockMovement}><h2>Catat pergerakan stok</h2>
              <div className="field"><label>Produk (stok saat ini)</label><select value={stockForm.product_id} onChange={e=>setStockForm(v=>({...v,product_id:e.target.value}))} required><option value="">Pilih produk…</option>{productRows.map(p=><option key={p.id} value={p.id}>{p.name} — Stok tersedia: {p.current_stock} {p.unit}</option>)}</select></div>
              <div className="field"><label>Jenis</label><select value={stockForm.movement_type} onChange={e=>setStockForm(v=>({...v,movement_type:e.target.value}))}><option value="purchase_in">Barang masuk</option><option value="customer_return_in">Retur pelanggan masuk</option><option value="adjustment_in">Penyesuaian (+)</option><option value="sale_out">Penjualan keluar</option><option value="internal_out">Pemakaian/order internal</option><option value="damaged_out">Barang rusak</option><option value="lost_out">Barang hilang</option><option value="supplier_return_out">Retur pemasok</option><option value="adjustment_out">Penyesuaian (-)</option></select></div>
              <div className="field"><label>Jumlah</label><input type="number" min="0.01" step="0.01" value={stockForm.quantity} onChange={e=>setStockForm(v=>({...v,quantity:e.target.value}))} required/></div>
              <div className="field"><label>Harga pokok per unit</label><input type="number" min="0" step="0.01" value={stockForm.unit_cost} onChange={e=>setStockForm(v=>({...v,unit_cost:e.target.value}))}/></div>
              <div className="field"><label>Referensi</label><input value={stockForm.reference_code} onChange={e=>setStockForm(v=>({...v,reference_code:e.target.value}))}/></div>
              <div className="field"><label>Alasan</label><input value={stockForm.reason} onChange={e=>setStockForm(v=>({...v,reason:e.target.value}))}/></div>
              <div className="field"><label>Catatan</label><textarea rows={2} value={stockForm.notes} onChange={e=>setStockForm(v=>({...v,notes:e.target.value}))}/></div>
              <button className="btn btn-primary" type="submit" disabled={stockSaving||!productRows.length}>{stockSaving?"Memproses…":"Simpan pergerakan stok"}</button>
            </form>
          </div>}
          {["owner","admin"].includes(profile?.role??"")&&<form className="panel business-form" onSubmit={saveProductCategory}><h2>Tambah kategori produk</h2><div className="field"><label>Nama kategori</label><input value={newProductCategoryName} onChange={e=>setNewProductCategoryName(e.target.value)} placeholder="Contoh: Aksesoris" required/></div><button className="btn" type="submit">Simpan kategori</button></form>}<div className="panel business-history"><div className="section-head"><div><div className="eyebrow">KATEGORI</div><h2>Kategori produk</h2></div><span className="subtle">{productCategories.length} kategori</span></div><div className="grid-cards">{productCategories.map(category=><article className="panel" key={category.id}><h3>{category.name}</h3><div className="business-line"><span>Jumlah produk</span><strong>{productRows.filter(p=>p.category_id===category.id).length}</strong></div><button className="btn btn-primary" type="button" onClick={()=>setSelectedCategoryId(selectedCategoryId===category.id?null:category.id)}>{selectedCategoryId===category.id?"Tutup detail":"Buka detail kategori →"}</button>{selectedCategoryId===category.id&&<><div className="divider"/>{productRows.filter(p=>p.category_id===category.id).length===0?<p className="subtle">Belum ada produk di kategori ini.</p>:productRows.filter(p=>p.category_id===category.id).map(p=><div className="business-line" key={p.id}><span><strong>{p.name}</strong><small className="subtle" style={{display:"block"}}>{p.sku} · Stok {p.current_stock} {p.unit}</small></span><strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(p.sale_price)}</strong></div>)}{["owner","admin"].includes(profile?.role??"")&&<button className="btn" type="button" onClick={()=>void deleteProductCategory(category)}>Hapus kategori</button>}</>}</article>)}</div></div>
          <div className="panel business-history"><div className="section-head"><div><div className="eyebrow">KATALOG</div><h2>Daftar produk</h2></div><div className="business-actions"><input aria-label="Cari produk" placeholder="Cari nama / SKU / barcode…" value={inventorySearch} onChange={e=>setInventorySearch(e.target.value)}/><label className="subtle"><input type="checkbox" checked={showInactiveProducts} onChange={e=>setShowInactiveProducts(e.target.checked)}/> Tampilkan produk nonaktif/terarsip</label></div></div>
          <div className="table-wrap"><table><thead><tr><th>Produk</th><th>SKU / Barcode</th><th>Harga per unit</th><th>Stok tersedia</th><th>Status</th>{["owner","admin"].includes(profile?.role??"")&&<th>Aksi</th>}</tr></thead><tbody>{productRows.filter(p=>(showInactiveProducts||p.is_active)&&(p.name+" "+p.sku+" "+p.barcode_value).toLowerCase().includes(inventorySearch.toLowerCase())).map(p=><tr key={p.id}><td><strong>{p.name}</strong><div className="subtle">{p.product_categories?.name??"Tanpa kategori"}</div></td><td><code>{p.sku}</code><div className="subtle">{p.barcode_value}</div></td><td>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(p.sale_price)} / {p.unit}</td><td><strong>{p.current_stock} {p.unit}</strong><div className="subtle">Jumlah barang yang tersedia</div>{Number(p.current_stock)<=Number(p.minimum_stock)&&<div className="status-pill status-pending">Stok menipis</div>}</td><td><span className={`status-pill ${p.is_active?"status-approved":"status-rejected"}`}>{p.is_active?"Aktif":"Nonaktif"}</span></td>{["owner","admin"].includes(profile?.role??"")&&<td><div className="business-actions"><button className="btn" onClick={()=>{setEditingProductId(p.id);setInventoryForm({sku:p.sku,barcode_value:p.barcode_value,name:p.name,category_id:p.category_id??"",unit:p.unit,description:p.description??"",sale_price:String(p.sale_price),cost_price:String(p.product_costs?.cost_price??0),initial_stock:String(p.current_stock),minimum_stock:String(p.minimum_stock),storage_location:p.storage_location??""});}}>Edit</button><button className="btn" onClick={()=>void toggleProductActive(p)}>{p.is_active?"Nonaktifkan":"Aktifkan"}</button><button className="btn" type="button" onClick={()=>void deleteProduct(p)}>Hapus</button></div></td>}</tr>)}</tbody></table></div></div>
          {["owner","admin"].includes(profile?.role??"")&&<div className="panel centralized-history"><h2>Pergerakan stok terbaru</h2>{stockMovementRows.length===0?<p className="subtle">Belum ada pergerakan stok.</p>:stockMovementRows.map(m=><article className="business-record" key={m.id}><div className="business-record-head"><div><strong>{m.products?.name??"Produk"} · {m.movement_type.replaceAll("_"," ")}</strong><small>{new Date(m.movement_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</small></div><span className="status-pill">{m.quantity} unit</span></div><p>Alasan: {m.reason??"Tanpa alasan"} · Referensi: {m.reference_code??"Tanpa referensi"}</p><p className="subtle">SKU: {m.products?.sku??"—"} · Dicatat oleh: {m.created_by_profile?.full_name||m.created_by_profile?.email||(m.created_by?"Akun "+m.created_by.slice(0,8):"Belum tercatat")}</p></article>)}</div>}
        </section> : activePage === "barcode" ? <section className="business-page">
          <div className="business-hero"><div><div className="eyebrow">PENCARIAN PRODUK CEPAT</div><h1>Barcode & SKU</h1><p>Masukkan atau scan barcode menggunakan scanner keyboard untuk melihat produk dan stok terkini.</p></div><div className="business-hero-icon">▥</div></div>
          <div className="panel business-form"><div className="field"><label>Scan / ketik barcode, SKU, atau nama produk</label><input autoFocus value={barcodeSearch} onChange={e=>setBarcodeSearch(e.target.value)} placeholder="Arahkan scanner ke kolom ini…"/></div><p className="subtle">Scanner barcode USB/Bluetooth yang mengetik kode ke kolom ini dapat digunakan.</p></div>
          <div className="grid-cards">{productRows.filter(p=>p.is_active&&(p.name+" "+p.sku+" "+p.barcode_value).toLowerCase().includes(barcodeSearch.toLowerCase())).map(p=><article className="panel" key={p.id}><div className="eyebrow">{p.sku}</div><h2>{p.name}</h2><div className="business-line"><span>Barcode</span><strong><code>{p.barcode_value}</code></strong></div><div className="business-line"><span>Stok tersedia</span><strong>{p.current_stock} {p.unit}</strong></div><div className="business-line"><span>Harga per {p.unit}</span><strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(p.sale_price)}</strong></div></article>)}</div>
          {barcodeSearch&&productRows.filter(p=>p.is_active&&(p.name+" "+p.sku+" "+p.barcode_value).toLowerCase().includes(barcodeSearch.toLowerCase())).length===0&&<div className="panel subtle">Tidak ada produk yang cocok.</div>}
        </section> : activePage === "finance" ? <section className="business-page">
          <div className="business-hero"><div><div className="eyebrow">BUKU BESAR RESMI · OWNER</div><h1>Keuangan Bisnis</h1><p>Transaksi yang diverifikasi masuk ke buku besar resmi; laporan karyawan tetap menunggu verifikasi di menu Laporan Uang.</p></div><div className="business-hero-icon">◈</div></div>
          {financialNotice&&<div className="info-box" role="status">{financialNotice}</div>}{financialError&&<div className="error-box" role="alert">{financialError}</div>}
          <div className="stats-grid"><div className="stat-card"><div className="stat-top">Uang masuk</div><div className="stat-value" style={{fontSize:20}}>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(financialRows.filter(t=>t.status==="posted"&&t.transaction_type==="income").reduce((n,t)=>n+Number(t.amount),0))}</div></div><div className="stat-card"><div className="stat-top">Uang keluar</div><div className="stat-value" style={{fontSize:20}}>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(financialRows.filter(t=>t.status==="posted"&&t.transaction_type==="expense").reduce((n,t)=>n+Number(t.amount),0))}</div></div><div className="stat-card"><div className="stat-top">Saldo bersih</div><div className="stat-value" style={{fontSize:20}}>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(financialRows.filter(t=>t.status==="posted").reduce((n,t)=>n+(t.transaction_type==="income"?1:-1)*Number(t.amount),0))}</div></div><div className="stat-card"><div className="stat-top">Laba kotor order</div><div className="stat-value" style={{fontSize:20}}>{grossProfitMissingCostCount>0?"Belum akurat":new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(grossProfit)}</div><div className="stat-note">{grossProfitMissingCostCount>0?`${grossProfitMissingCostCount} baris produk belum memiliki harga pokok. Isi Harga pokok/modal di menu Inventaris agar laba kotor dihitung benar.`:"Penjualan order disetujui/dipenuhi dikurangi harga pokok barang."}</div></div></div>
          {profile?.role==="owner"&&<form className="panel business-form" style={{marginBottom:16}} onSubmit={saveFinancialCategory}><div className="eyebrow">KATEGORI BUKU BESAR</div><h2>Tambah kategori keuangan</h2><div className="business-actions"><div className="field" style={{flex:"1 1 220px"}}><label htmlFor="new-finance-category">Nama kategori</label><input id="new-finance-category" value={newFinancialCategoryName} onChange={e=>setNewFinancialCategoryName(e.target.value)} placeholder="Contoh: Penjualan, Transportasi" required/></div><div className="field" style={{flex:"1 1 180px"}}><label htmlFor="new-finance-category-type">Jenis</label><select id="new-finance-category-type" value={newFinancialCategoryType} onChange={e=>setNewFinancialCategoryType(e.target.value as "income"|"expense")}><option value="income">Uang masuk</option><option value="expense">Uang keluar</option></select></div><button className="btn btn-primary" type="submit">Tambah kategori</button></div><div className="subtle">Kategori tersimpan: {financialCategories.map(c=>c.name+" ("+(c.transaction_type==="income"?"masuk":"keluar")+")").join(" · ")||"Belum ada kategori"}</div></form>}
          <div className="business-columns"><form className="panel business-form" onSubmit={saveFinancialTransaction}><h2>Tambah transaksi resmi</h2><div className="field"><label>Jenis transaksi</label><select value={financialType} onChange={e=>{setFinancialType(e.target.value as "income"|"expense");setFinancialCategoryId("");}}><option value="income">Uang masuk</option><option value="expense">Uang keluar</option></select></div><div className="field"><label>Nominal (Rp)</label><input type="number" min="1" value={financialAmount} onChange={e=>setFinancialAmount(e.target.value)} required/></div><div className="field"><label>Kategori</label><select value={financialCategoryId} onChange={e=>setFinancialCategoryId(e.target.value)}><option value="">Tanpa kategori</option>{financialCategories.filter(c=>c.transaction_type===financialType).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div className="field"><label>Metode</label><select value={financialPayment} onChange={e=>setFinancialPayment(e.target.value)}><option value="cash">Tunai</option><option value="bank_transfer">Transfer bank</option><option value="e_wallet">E-wallet</option><option value="card">Kartu</option><option value="other">Lainnya</option></select></div><div className="field"><label>Keterangan</label><textarea rows={3} value={financialDescription} onChange={e=>setFinancialDescription(e.target.value)} required/></div><div className="field"><label>Referensi</label><input value={financialReference} onChange={e=>setFinancialReference(e.target.value)}/></div><button className="btn btn-primary" type="submit" disabled={financialSaving}>{financialSaving?"Menyimpan…":"Simpan transaksi"}</button></form>
          <div className="panel centralized-history"><div className="section-head"><div><h2>Buku besar</h2></div><input aria-label="Cari transaksi" placeholder="Cari kode / keterangan…" value={financialSearch} onChange={e=>setFinancialSearch(e.target.value)}/></div>{financialRows.filter(t=>(t.transaction_code+" "+t.description+" "+(t.reference_code??"")).toLowerCase().includes(financialSearch.toLowerCase())).map(t=><article className="business-record" key={t.id}><div className="business-record-head"><div><strong>{t.transaction_code}</strong><small>{new Date(t.transaction_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</small></div><span className={`status-pill ${t.transaction_type==="income"?"status-approved":"status-rejected"}`}>{t.transaction_type==="income"?"Uang masuk":"Uang keluar"}</span></div><div className="business-line"><span>Kategori: {t.financial_categories?.name??"Tanpa kategori"} · Keterangan: {t.description}</span><strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(t.amount)}</strong></div><p className="subtle">Metode pembayaran: {t.payment_method??"Tidak dicatat"} · Referensi: {t.reference_code??"Tidak ada"}</p><p className="subtle">Dicatat oleh: {t.created_by_profile?.full_name||t.created_by_profile?.email||(t.created_by?"Akun "+t.created_by.slice(0,8):"Belum tercatat")}</p></article>)}</div></div>
          <form className="panel business-form" onSubmit={saveFinancialCategory}><h2>Tambah kategori keuangan</h2><div className="business-columns"><div className="field"><label>Nama kategori</label><input value={newFinancialCategoryName} onChange={e=>setNewFinancialCategoryName(e.target.value)} placeholder="Contoh: Penjualan harian" required/></div><div className="field"><label>Jenis transaksi</label><select value={newFinancialCategoryType} onChange={e=>setNewFinancialCategoryType(e.target.value as "income"|"expense")}><option value="income">Uang masuk</option><option value="expense">Uang keluar</option></select></div></div><button className="btn" type="submit">Tambah kategori</button></form>
        </section> : activePage === "leave" ? <section className="business-page">
          <div className="business-hero"><div><div className="eyebrow">KEHADIRAN & HARI KERJA</div><h1>Izin / Cuti</h1><p>Karyawan mengajukan izin, sakit atau cuti; Admin/Owner meninjau dan memperbarui status.</p></div><div className="business-hero-icon">▣</div></div>
          {leaveNotice&&<div className="info-box" role="status">{leaveNotice}</div>}{leaveError&&<div className="error-box" role="alert">{leaveError}</div>}
          {profile?.role==="employee"&&<form className="panel business-form" onSubmit={submitLeaveRequest}><h2>Ajukan permohonan</h2><div className="field"><label>Jenis</label><select value={leaveType} onChange={e=>setLeaveType(e.target.value)}><option value="leave">Cuti</option><option value="sick">Sakit</option><option value="permission">Izin</option></select></div><div className="business-columns"><div className="field"><label>Mulai</label><input type="date" value={leaveStart} onChange={e=>setLeaveStart(e.target.value)} required/></div><div className="field"><label>Sampai</label><input type="date" min={leaveStart} value={leaveEnd} onChange={e=>setLeaveEnd(e.target.value)} required/></div></div><div className="field"><label>Alasan</label><textarea rows={3} value={leaveReason} onChange={e=>setLeaveReason(e.target.value)} required/></div><button className="btn btn-primary" type="submit" disabled={leaveSaving||!leaveEmployeeId}>{leaveSaving?"Mengirim…":"Kirim permohonan"}</button>{!leaveEmployeeId&&<p className="subtle">Profil harus dihubungkan dengan data karyawan oleh Admin.</p>}</form>}
          <div className="panel centralized-history"><h2>{profile?.role==="employee"?"Permohonan saya":"Permohonan karyawan"}</h2><p className="subtle">Riwayat menampilkan alasan, rentang tanggal, status, pengaju, dan nama pihak yang memutuskan bila tersedia.</p>{leaveRows.filter(r=>profile?.role!=="employee"||r.employees?.profile_id===profile?.id).length===0?<p className="subtle">Belum ada permohonan izin/cuti yang dapat ditampilkan.</p>:leaveRows.filter(r=>profile?.role!=="employee"||r.employees?.profile_id===profile?.id).map(r=><article className="business-record" key={r.id}><div className="business-record-head"><div><strong>{r.employees?.full_name??"Karyawan"} · {r.leave_type==="leave"?"Cuti":r.leave_type==="sick"?"Sakit":"Izin"}</strong><small>{r.start_date} sampai {r.end_date} · {r.employees?.employee_code}</small></div><span className={`status-pill status-${r.status}`}>{r.status==="pending"?"Menunggu":r.status==="approved"?"Disetujui":"Ditolak"}</span></div><p><strong>Alasan:</strong> {r.reason}</p><p className="subtle">Diajukan pada: <strong>{new Date(r.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</strong> · Karyawan: <strong>{r.employees?.full_name??"Nama karyawan tidak tersedia"}</strong> ({r.employees?.employee_code??"Kode tidak tersedia"})</p>{r.reviewed_by&&<p className="subtle">Diputuskan oleh: <strong>{r.reviewed_by_profile?.full_name||r.reviewed_by_profile?.email||"Akun "+r.reviewed_by.slice(0,8)}</strong>{r.reviewed_at?` · ${new Date(r.reviewed_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}`:""}</p>}{["owner","admin","hrd"].includes(profile?.role??"")&&r.status==="pending"&&<div className="business-actions"><button className="btn btn-primary" onClick={()=>void reviewLeaveRequest(r.id,"approved")}>Setujui</button><button className="btn" onClick={()=>void reviewLeaveRequest(r.id,"rejected")}>Tolak</button></div>}</article>)}</div>
        </section> : activePage === "notifications" ? <section className="business-page">
          <div className="business-hero"><div><div className="eyebrow">PUSAT INFORMASI</div><h1>Notifikasi</h1><p>Pembaruan dan pesan sistem yang ditujukan untuk akun Anda.</p></div><div className="business-hero-icon">♢</div></div>
          {notificationError&&<div className="error-box" role="alert">{notificationError}</div>}
          <div className="business-history">{notificationRows.length===0?<div className="panel subtle">Belum ada notifikasi.</div>:notificationRows.map(n=><article className="business-record" key={n.id} style={{opacity:n.read_at?0.72:1}}><div className="business-record-head"><div><strong>{n.title}</strong><small>{new Date(n.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</small></div><span className="status-pill">{n.read_at?"Sudah dibaca":"Baru"}</span></div><p>{n.message}</p>{!n.read_at&&<button className="btn" onClick={()=>void markNotificationRead(n.id)}>Tandai sudah dibaca</button>}</article>)}</div>
        </section> : activePage === "profile" ? <section className="business-page profile-page">
          <div className="business-hero"><div><div className="eyebrow">PENGATURAN AKUN</div><h1>Profil Saya</h1><p>Informasi akun dan pekerjaan Anda dalam satu tempat.</p></div><div className="business-hero-icon">◉</div></div>
          <div className="profile-overview panel">
            <div className="profile-avatar">{displayName.slice(0,1).toUpperCase()}</div>
            <div className="profile-overview-copy"><h2>{displayName}</h2><p className="subtle">{profile?.email || session.user.email || "Email belum tersedia"}</p><div className="profile-tags"><span className="status-pill">{roleName(profile?.role)}</span><span className={`status-pill ${isActive ? "status-approved" : "status-rejected"}`}>{isActive ? "Akun aktif" : "Akun nonaktif"}</span></div></div>
          </div>
          <div className="profile-details-grid">
            <article className="panel profile-detail-card"><div className="eyebrow">INFORMASI AKUN</div><h2>Identitas akun</h2><dl><div><dt>Nama lengkap</dt><dd>{profile?.full_name || "Belum diatur"}</dd></div><div><dt>Email login</dt><dd>{profile?.email || session.user.email || "Tidak tersedia"}</dd></div><div><dt>Hak akses</dt><dd>{roleName(profile?.role)}</dd></div><div><dt>Status akun</dt><dd>{isActive ? "Aktif" : "Nonaktif"}</dd></div></dl></article>
            <article className="panel profile-detail-card"><div className="eyebrow">INFORMASI PEKERJAAN</div><h2>Data karyawan</h2><dl><div><dt>Kode karyawan</dt><dd>{myEmployeeProfile?.employee_code || "Belum ditautkan"}</dd></div><div><dt>Jabatan kantor</dt><dd>{myEmployeeProfile?.job_title || (storePlacementInfo?.job_title || (storePlacementInfo?.store_role === "manager" ? "Manajer Toko" : storePlacementInfo?.store_role === "store_admin" ? "Admin Toko" : storePlacementInfo?.store_role === "inventory" ? "Petugas Gudang" : storePlacementInfo?.store_role === "cashier" ? "Kasir" : roleName(profile?.role)))}</dd></div><div><dt>Status kerja</dt><dd>{myEmployeeProfile ? (myEmployeeProfile.employment_status === "active" ? "Aktif bekerja" : "Nonaktif") : "Data belum tersedia"}</dd></div><div><dt>Tanggal bergabung</dt><dd>{myEmployeeProfile?.joined_on || "Belum diatur"}</dd></div></dl><p className="subtle profile-note">Jika kode, jabatan, atau tanggal bergabung belum benar, hubungi administrator untuk memperbarui data karyawan.</p></article>
            {storePlacementInfo && <article className="panel profile-detail-card"><div className="eyebrow">PENEMPATAN KERJA AKTIF</div><h2>{storePlacementInfo.store_code} — {storePlacementInfo.name}</h2><dl><div><dt>Jabatan toko</dt><dd>{storePlacementInfo.job_title || (storePlacementInfo.store_role === "manager" ? "Manajer Toko" : storePlacementInfo.store_role === "store_admin" ? "Admin Toko" : storePlacementInfo.store_role === "inventory" ? "Petugas Gudang" : "Kasir")}</dd></div><div><dt>Ruang lingkup akses</dt><dd>Data operasional toko yang ditugaskan</dd></div></dl></article>}
          </div>
          <div className="panel profile-security"><div><h2>Keamanan akun</h2><p className="subtle">Ubah password akun Anda kapan saja. Password baru minimal 8 karakter.</p></div>{profilePasswordNotice&&<div className="info-box" role="status">{profilePasswordNotice}</div>}{profilePasswordError&&<div className="error-box" role="alert">{profilePasswordError}</div>}<form className="business-form" onSubmit={handleProfilePasswordChange}><div className="business-columns"><div className="field"><label>Password baru</label><input type="password" autoComplete="new-password" minLength={8} value={profileNewPassword} onChange={e=>setProfileNewPassword(e.target.value)} required/></div><div className="field"><label>Konfirmasi password baru</label><input type="password" autoComplete="new-password" minLength={8} value={profileConfirmPassword} onChange={e=>setProfileConfirmPassword(e.target.value)} required/></div></div><div className="business-actions"><button className="btn btn-primary" type="submit" disabled={busy}>{busy?"Menyimpan…":"Reset / Ganti Password"}</button><button className="btn" type="button" onClick={() => void handleLogout()} disabled={busy}>{busy ? "Memproses…" : "Keluar dari akun"}</button></div></form></div>
        </section> : <section className="panel" style={{ maxWidth: 900 }}>
          <div className="eyebrow">MODUL / {activePage.toUpperCase()}</div><h1 style={{ marginTop: 12 }}>{moduleTitle}</h1><p className="subtle">{descriptions[activePage]}</p>
          {activePage === "settings" ? <><div className="info-box">Pilih aturan absensi yang akan berlaku untuk semua akun karyawan. Mode tersimpan di database dan tetap aktif sampai diubah lagi.</div><div className="panel" style={{marginTop:16,background:"rgba(10,20,38,.45)"}}><h2>Aturan Check-in / Check-out</h2><p className="subtle">Owner dan Admin dapat mengubah pilihan ini. Perubahan tidak menghapus riwayat absensi yang sudah tersimpan.</p><div className="field"><label htmlFor="attendance-mode">Mode absensi</label><select id="attendance-mode" value={attendanceMode} disabled={attendanceModeLoading||attendanceModeSaving} onChange={e=>void saveAttendanceMode(e.target.value as AttendanceMode)}><option value="once_daily">Sekali sehari — 1 Check-in dan 1 Check-out</option><option value="multiple_sessions">Berulang — boleh Check-in lagi setelah Check-out</option></select></div><div className="subtle">{attendanceMode==="once_daily"?"Karyawan tidak bisa memulai sesi kedua pada tanggal yang sama.":"Karyawan boleh memulai sesi baru setelah sesi sebelumnya selesai Check-out."}</div>{attendanceModeLoading&&<p className="subtle">Memuat pengaturan…</p>}{attendanceModeSaving&&<p className="subtle">Menyimpan mode…</p>}{attendanceModeNotice&&<div className="info-box" role="status" style={{marginTop:12}}>{attendanceModeNotice}</div>}{attendanceModeError&&<div className="error-box" role="alert" style={{marginTop:12}}>{attendanceModeError}</div>}</div>
            {["owner","admin"].includes(profile?.role??"")&&<div className="panel business-history" style={{marginTop:18}}>
              <div className="section-head"><div><div className="eyebrow">AKSES & KEAMANAN</div><h2>Pengelolaan akun</h2><p className="subtle">Ubah role dan status akun, atau hapus akun login secara permanen. Owner yang sedang digunakan selalu dilindungi.</p></div><button className="btn" type="button" onClick={()=>setAccountRefresh(v=>v+1)} disabled={accountLoading}>↻ Muat ulang</button></div>
              {accountError&&<div className="error-box" role="alert">{accountError}</div>}{accountNotice&&<div className="info-box" role="status">{accountNotice}</div>}
              <div className="field"><label htmlFor="account-search">Cari akun</label><input id="account-search" value={accountSearch} onChange={e=>setAccountSearch(e.target.value)} placeholder="Cari email, nama, atau role…"/></div>
              {accountLoading?<p className="subtle">Memuat daftar akun…</p>:accountRows.filter(a=>(a.email+" "+(a.full_name??"")+" "+a.role).toLowerCase().includes(accountSearch.toLowerCase())).length===0?<p className="subtle">Tidak ada akun yang cocok.</p>:accountRows.filter(a=>(a.email+" "+(a.full_name??"")+" "+a.role).toLowerCase().includes(accountSearch.toLowerCase())).map(a=><article className="business-record" key={a.id}>
                <div className="business-record-head"><div><strong>{a.full_name||"Nama belum diatur"}</strong><small>{a.email}{a.id===profile?.id?" · Akun Anda":""}</small></div><span className={a.is_active?"status-pill status-approved":"status-pill status-rejected"}>{a.is_active?"Aktif":"Nonaktif"}</span></div>
                {a.employee&&<p className="subtle">Karyawan: {a.employee.full_name} · {a.employee.employee_code} · {a.employee.employment_status==="active"?"Bekerja":"Nonaktif"}</p>}
                <div className="business-actions"><label className="field" style={{margin:0,minWidth:150,flex:"1 1 160px"}}><span>Role</span><select aria-label={"Role "+a.email} value={a.role} disabled={accountSavingId===a.id||a.id===profile?.id||(profile?.role!=="owner"&&a.role==="owner")} onChange={e=>void updateAccount(a,e.target.value as Role,a.is_active)}><option value="employee">Karyawan</option>{profile?.role==="owner"&&<option value="hrd">HRD / SDM</option>}<option value="admin">Admin</option>{profile?.role==="owner"&&<option value="owner">Owner</option>}</select></label>
                <button className={a.is_active?"btn":"btn btn-primary"} type="button" disabled={accountSavingId===a.id||a.id===profile?.id||(profile?.role!=="owner"&&a.role!=="employee")} onClick={()=>void updateAccount(a,a.role,!a.is_active)}>{accountSavingId===a.id?"Menyimpan…":a.is_active?"Nonaktifkan akun":"Aktifkan akun"}</button>{profile?.role==="owner"&&a.role!=="owner"&&<button className="btn btn-danger" type="button" disabled={accountSavingId===a.id} onClick={()=>void deleteAccount(a)}>{accountSavingId===a.id?"Memproses…":"Hapus akun"}</button>}</div>
              </article>)}
              <p className="subtle">Demi keamanan, akun Anda sendiri tidak dapat diubah dari daftar ini. Perubahan role hanya dilakukan melalui fungsi server yang memeriksa kewenangan.</p>
            </div>}
            <div className="info-box" style={{marginTop:16}}>Mode absensi berlaku bagi semua akun. Pengaturan role dan status akun dibatasi sesuai kewenangan Owner/Admin.</div></> : <div className="info-box">Modul ini belum tersedia untuk role ini.</div>}
          <div className="section-head"><div><h2>Ringkasan terkait</h2><div className="subtle">Angka dibaca dari database sesuai hak akses akun.</div></div><button className="btn" onClick={() => setActivePage("dashboard")}>← Kembali ke ringkasan</button></div>
          <div className="stats-grid">
            {activePage === "settings" && <div className="stat-card"><div className="stat-top">Role akun</div><div className="stat-value" style={{ fontSize: 20 }}>{profile?.role?.toUpperCase() ?? "—"}</div><div className="stat-note">Status: {profile?.is_active ? "Aktif" : "Tidak aktif"}</div></div>}
          </div>
        </section>}
        <div className="footer">NDRANEXA NIAGA NUSANTARA · Ruang kerja transaksi & operasional · Data dibatasi sesuai role</div>
      </section>
    </main>
  );
}