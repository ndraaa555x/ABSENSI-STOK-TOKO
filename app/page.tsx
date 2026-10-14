"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Profile = { id: string; email: string; full_name: string | null; role: "owner" | "admin" | "employee"; is_active: boolean };
type Counts = { employees: number; attendance: number; products: number; finances: number };
type AttendanceRow = { id: string; work_date: string; check_in_at: string | null; check_out_at: string | null; status: string; check_in_method: string | null; check_out_method: string | null; evidence_path: string | null; employees: { full_name: string; employee_code: string } | null; evidence_url?: string | null };
type DailyAttendanceRow = { employee_id: string; check_out_at: string | null; employees: { full_name: string; employee_code: string } | null };
type AttendanceMode = "once_daily" | "multiple_sessions";
type ModuleKey = "dashboard" | "employees" | "attendance" | "orders" | "refunds" | "finance-reports" | "inventory" | "finance" | "barcode" | "settings";
type OrderProduct = { id:string; name:string; sku:string; unit:string; sale_price:number; current_stock:number; is_active:boolean };
type OrderItem = { id:string; quantity:number; unit_price:number; line_total:number; product_id:string; products:{name:string;sku:string;unit:string}|null };
type OrderRow = { id:string; order_code:string; status:string; notes:string|null; created_at:string; ordered_by:string; product_order_items:OrderItem[] };
type RefundRow = { id:string; refund_code:string; order_id:string; order_item_id:string; requested_by:string; quantity:number; amount:number; reason:string; status:string; created_at:string; product_orders:{order_code:string}|null };
type FinanceReportRow = { id:string; report_code:string; report_type:string; amount:number; description:string; payment_method:string|null; status:string; created_at:string; submitted_by:string };
type EmployeeRow = { id:string; employee_code:string; full_name:string; email:string|null; phone:string|null; job_title:string|null; employment_status:"active"|"inactive"; joined_on:string|null; notes:string|null; profile_id?:string|null };
type AccountRow = { id:string; email:string; full_name:string|null; role:"owner"|"admin"|"employee"; is_active:boolean; employee?:{employee_code:string;employment_status:string;full_name:string}|null };
const navItems: { key: ModuleKey; icon: string; label: string; group: string }[] = [
  { key: "dashboard", icon: "▦", label: "Ringkasan", group: "UTAMA" },
  { key: "employees", icon: "♙", label: "Karyawan", group: "OPERASIONAL" },
  { key: "attendance", icon: "◷", label: "Absensi", group: "OPERASIONAL" },
  { key: "orders", icon: "🛒", label: "Order Produk", group: "TRANSAKSI" },
  { key: "refunds", icon: "↩", label: "Refund Produk", group: "TRANSAKSI" },
  { key: "finance-reports", icon: "↗", label: "Laporan Uang", group: "TRANSAKSI" },
  { key: "inventory", icon: "▤", label: "Inventaris & Stok", group: "OPERASIONAL" },
  { key: "barcode", icon: "▥", label: "Barcode", group: "OPERASIONAL" },
  { key: "finance", icon: "◈", label: "Keuangan", group: "MANAJEMEN" },
  { key: "settings", icon: "⚙", label: "Pengaturan", group: "MANAJEMEN" }
];
const descriptions: Record<ModuleKey, string> = {
  dashboard: "Pantau ringkasan data bisnis Anda.",
  employees: "Kelola data dan akun karyawan sesuai kewenangan.",
  attendance: "Pantau kehadiran dan riwayat kerja sesuai hak akses.",
  orders: "Ajukan order produk untuk kebutuhan operasional kerja dan pantau status persetujuannya.",
  refunds: "Ajukan pengembalian produk dari order yang sudah disetujui atau dipenuhi.",
  "finance-reports": "Catat uang masuk atau pengeluaran harian untuk diperiksa Admin/Owner.",
  inventory: "Pantau produk dan ketersediaan stok untuk mendukung order kerja.",
  barcode: "Cari produk berdasarkan SKU atau barcode.",
  finance: "Lihat ringkasan transaksi keuangan yang dikelola Owner.",
  settings: "Kelola pengaturan bisnis dan kontrol akses sesuai role."
};

export default function HomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [counts, setCounts] = useState<Counts>({ employees: 0, attendance: 0, products: 0, finances: 0 });
  const [pageLoading, setPageLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [activePage, setActivePage] = useState<ModuleKey>("dashboard");
  const [menuSearch, setMenuSearch] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [attendanceSearch, setAttendanceSearch] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [businessRefresh, setBusinessRefresh] = useState(0);
  const [orderProducts, setOrderProducts] = useState<OrderProduct[]>([]);
  const [orderRows, setOrderRows] = useState<OrderRow[]>([]);
  const [refundRows, setRefundRows] = useState<RefundRow[]>([]);
  const [financeReportRows, setFinanceReportRows] = useState<FinanceReportRow[]>([]);
  const [selectedOrderProductId, setSelectedOrderProductId] = useState("");
  const [orderQuantity, setOrderQuantity] = useState("1");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  const [orderNotice, setOrderNotice] = useState("");
  const [orderError, setOrderError] = useState("");
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
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
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
  const [employeeForm, setEmployeeForm] = useState({employee_code:"",full_name:"",email:"",phone:"",job_title:"",joined_on:new Date().toISOString().slice(0,10),notes:""});
  const [createLoginAccount, setCreateLoginAccount] = useState(false);
  const [newAccountRole, setNewAccountRole] = useState<"employee"|"admin">("employee");
  const [employeePassword, setEmployeePassword] = useState("");
  const [accountRows, setAccountRows] = useState<AccountRow[]>([]);
  const [accountLoading, setAccountLoading] = useState(false);
  const [accountSavingId, setAccountSavingId] = useState<string|null>(null);
  const [accountRefresh, setAccountRefresh] = useState(0);
  const [accountError, setAccountError] = useState("");
  const [accountNotice, setAccountNotice] = useState("");

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
    if (!safeProfile.is_active) {
      setError("Akun Anda belum aktif. Hubungi Owner untuk mengaktifkan akses.");
      setDataLoading(false);
      return;
    }
    const [employees, attendance, products, finances] = await Promise.all([
      supabase.from("employees").select("id", { count: "exact", head: true }),
      supabase.from("attendance_records").select("id", { count: "exact", head: true }),
      supabase.from("products").select("id", { count: "exact", head: true }),
      supabase.from("financial_transactions").select("id", { count: "exact", head: true })
    ]);
    setCounts({
      employees: employees.count ?? 0,
      attendance: attendance.count ?? 0,
      products: products.count ?? 0,
      finances: finances.count ?? 0
    });
    const failed = [employees, attendance, products, finances].some((item) => item.error);
    if (failed) setMessage("Sebagian ringkasan tidak dapat dibaca oleh role atau kebijakan akses saat ini.");
    setDataLoading(false);
  }, []);

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
        setCounts({ employees: 0, attendance: 0, products: 0, finances: 0 });
      }
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, [loadProfileAndCounts]);

  useEffect(() => {
    if (!session || !profile?.is_active || !["orders","refunds","finance-reports"].includes(activePage)) return;
    let alive = true;
    async function loadBusinessWorkflows() {
      if (activePage === "orders") {
        const [productsResult, ordersResult] = await Promise.all([
          supabase.from("products").select("id,name,sku,unit,sale_price,current_stock,is_active").eq("is_active", true).gt("current_stock", 0).order("name"),
          supabase.from("product_orders").select("id,order_code,status,notes,created_at,ordered_by,product_order_items(id,product_id,quantity,unit_price,line_total,products(name,sku,unit))").order("created_at", {ascending:false}).limit(100)
        ]);
        if (!alive) return;
        if (productsResult.error) setOrderError("Daftar produk belum dapat dimuat. Pastikan migrasi order dan izin produk sudah aktif.");
        else { setOrderProducts((productsResult.data ?? []) as unknown as OrderProduct[]); setOrderError(""); }
        if (ordersResult.error) setOrderError("Riwayat order belum dapat dimuat. Periksa izin database.");
        else setOrderRows((ordersResult.data ?? []) as unknown as OrderRow[]);
      } else if (activePage === "refunds") {
        const [ordersResult, refundsResult] = await Promise.all([
          supabase.from("product_orders").select("id,order_code,status,notes,created_at,ordered_by,product_order_items(id,product_id,quantity,unit_price,line_total,products(name,sku,unit))").in("status", ["approved","fulfilled"]).order("created_at", {ascending:false}).limit(100),
          supabase.from("product_refunds").select("id,refund_code,order_id,order_item_id,requested_by,quantity,amount,reason,status,created_at,product_orders(order_code)").order("created_at", {ascending:false}).limit(100)
        ]);
        if (!alive) return;
        if (!ordersResult.error) setOrderRows((ordersResult.data ?? []) as unknown as OrderRow[]);
        if (refundsResult.error) setRefundError("Riwayat refund belum dapat dimuat. Periksa izin database.");
        else { setRefundRows((refundsResult.data ?? []) as unknown as RefundRow[]); setRefundError(""); }
      } else if (activePage === "finance-reports") {
        const { data, error: queryError } = await supabase.from("financial_reports").select("id,report_code,report_type,amount,description,payment_method,status,created_at,submitted_by").order("created_at", {ascending:false}).limit(100);
        if (!alive) return;
        if (queryError) setFinanceReportError("Laporan uang belum dapat dimuat. Periksa izin database.");
        else { setFinanceReportRows((data ?? []) as unknown as FinanceReportRow[]); setFinanceReportError(""); }
      }
    }
    void loadBusinessWorkflows();
    return () => { alive = false; };
  }, [activePage, session, profile, businessRefresh]);

  useEffect(() => {
    if (activePage !== "attendance" || !session || !profile?.is_active) return;
    let alive = true;
    async function loadAttendanceHistory() {
      setAttendanceLoading(true);
      setAttendanceError("");
      const { data, error: queryError } = await supabase
        .from("attendance_records")
        .select("id,work_date,check_in_at,check_out_at,status,check_in_method,check_out_method,evidence_path,employees(full_name,employee_code)")
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
    if (activePage !== "employees" || !session || !profile?.is_active || !["owner", "admin"].includes(profile.role)) return;
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

  async function updateAccount(account: AccountRow, role: "owner"|"admin"|"employee", is_active: boolean) {
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

  function resetEmployeeForm() {
    setEditingEmployeeId(null);
    setEmployeeForm({employee_code:"",full_name:"",email:"",phone:"",job_title:"",joined_on:new Date().toISOString().slice(0,10),notes:""});
    setCreateLoginAccount(false); setNewAccountRole("employee"); setEmployeePassword("");
  }

  async function saveEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !["owner", "admin"].includes(profile.role)) { setEmployeeError("Hanya Owner/Admin yang dapat mengelola karyawan."); return; }
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
          setEmployeeNotice("Akun berhasil dibuat dengan role " + (newAccountRole === "admin" ? "Admin" : "Karyawan") + ". Berikan email dan kata sandi awal secara aman.");
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
        setCounts({ employees: 0, attendance: 0, products: 0, finances: 0 });
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
      setCounts({ employees: 0, attendance: 0, products: 0, finances: 0 });
      setMessage("Sesi lokal di perangkat ini sudah dibersihkan. Koneksi autentikasi perlu diperiksa.");
      setError("");
    } finally {
      setBusy(false);
    }
  }

  if (pageLoading) return <main className="login-side"><div className="subtle">Memeriksa sesi aman…</div></main>;

  if (!session) return (
    <main className="login-wrap">
      <section className="login-hero">
        <div>
          <div className="brand"><div className="brand-mark">SB</div><div><div className="brand-title">SMART BUSINESS</div><div className="brand-sub">MANAGEMENT SYSTEM</div></div></div>
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

  async function submitProductOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !selectedOrderProductId) { setOrderError("Pilih produk terlebih dahulu."); return; }
    const product = orderProducts.find((item) => item.id === selectedOrderProductId);
    const quantity = Number(orderQuantity);
    if (!product || !Number.isFinite(quantity) || quantity <= 0 || quantity > Number(product.current_stock)) { setOrderError("Jumlah order tidak valid atau melebihi stok tersedia."); return; }
    setOrderSubmitting(true); setOrderError(""); setOrderNotice("");
    const orderCode = `ORD-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const { data: order, error: createError } = await supabase.from("product_orders").insert({order_code:orderCode,ordered_by:profile.id,notes:orderNotes.trim()||null}).select("id,order_code").single();
    if (createError || !order) { setOrderError(createError?.message ?? "Order gagal dibuat."); setOrderSubmitting(false); return; }
    const price = Number(product.sale_price);
    const { error: itemError } = await supabase.from("product_order_items").insert({order_id:order.id,product_id:product.id,quantity,unit_price:price,line_total:quantity*price});
    if (itemError) { setOrderError("Nomor order dibuat, tetapi detail produk gagal disimpan. Hubungi Admin dan sampaikan nomor "+order.order_code+"."); setOrderSubmitting(false); return; }
    setOrderNotice(`Order ${order.order_code} berhasil dikirim untuk ditinjau Admin.`);
    setOrderNotes(""); setOrderQuantity("1"); setBusinessRefresh((v)=>v+1); setOrderSubmitting(false);
  }

  async function submitRefund(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !refundOrderId || !refundItemId || !refundReason.trim()) { setRefundError("Pilih order, produk, dan tulis alasan refund."); return; }
    const order = orderRows.find((item)=>item.id===refundOrderId);
    const item = order?.product_order_items.find((candidate)=>candidate.id===refundItemId);
    const quantity = Number(refundQuantity);
    if (!item || !Number.isFinite(quantity) || quantity<=0 || quantity>Number(item.quantity)) { setRefundError("Jumlah refund tidak valid atau melebihi jumlah order."); return; }
    setRefundSubmitting(true); setRefundError(""); setRefundNotice("");
    const refundCode = `REF-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const { error: insertError } = await supabase.from("product_refunds").insert({refund_code:refundCode,order_id:order.id,order_item_id:item.id,requested_by:profile.id,quantity,amount:quantity*Number(item.unit_price),reason:refundReason.trim()});
    if (insertError) setRefundError("Refund gagal dikirim: "+insertError.message);
    else { setRefundNotice(`Permintaan refund ${refundCode} berhasil dikirim untuk ditinjau.`); setRefundReason(""); setRefundQuantity("1"); setBusinessRefresh((v)=>v+1); }
    setRefundSubmitting(false);
  }

  async function submitFinanceReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || !financeReportDescription.trim() || !Number.isFinite(Number(financeReportAmount)) || Number(financeReportAmount)<=0) { setFinanceReportError("Isi nominal lebih dari nol dan keterangan transaksi."); return; }
    setFinanceReportSubmitting(true); setFinanceReportError(""); setFinanceReportNotice("");
    const reportCode = `LAP-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${Math.random().toString(36).slice(2,7).toUpperCase()}`;
    const { error: insertError } = await supabase.from("financial_reports").insert({report_code:reportCode,report_type:financeReportType,amount:Number(financeReportAmount),description:financeReportDescription.trim(),payment_method:financeReportPayment,reference_code:financeReportReference.trim()||null,submitted_by:profile.id});
    if (insertError) setFinanceReportError("Laporan gagal dikirim: "+insertError.message);
    else { setFinanceReportNotice(`Laporan ${reportCode} terkirim untuk diperiksa.`); setFinanceReportAmount(""); setFinanceReportDescription(""); setFinanceReportReference(""); setBusinessRefresh((v)=>v+1); }
    setFinanceReportSubmitting(false);
  }

  async function reviewBusinessItem(table:"product_orders"|"product_refunds"|"financial_reports", id:string, status:string) {
    if (!profile || !["owner","admin"].includes(profile.role)) return;
    const { error: updateError } = await supabase.from(table).update({status,reviewed_by:profile.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",id);
    if (updateError) { setError("Status gagal diperbarui: "+updateError.message); return; }
    setBusinessRefresh((v)=>v+1);
  }

  const displayName = profile?.full_name || profile?.email || session.user.email || "Pengguna";
  const isActive = Boolean(profile?.is_active);
  const moduleTitle = navItems.find((item) => item.key === activePage)?.label ?? "Ringkasan";

  return (
    <main className={`app-shell role-${profile?.role ?? "employee"}`}>
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">SB</div><div><div className="brand-title">SMART BUSINESS</div><div className="brand-sub">MANAGEMENT SYSTEM</div></div></div>
        {["UTAMA", "OPERASIONAL", "TRANSAKSI", "MANAJEMEN"].filter((group) => navItems.some((item) => item.group === group && (profile?.role === "owner" || (profile?.role === "admin" ? item.key !== "finance" : ["dashboard", "attendance", "orders", "refunds", "finance-reports"].includes(item.key))) && item.label.toLowerCase().includes(menuSearch.trim().toLowerCase()))).map((group) => (
          <div key={group}>
            <div className="nav-label">{group}</div>
            <nav className="nav-list">
              {navItems.filter((item) => item.group === group && (profile?.role === "owner" || (profile?.role === "admin" ? item.key !== "finance" : ["dashboard", "attendance", "orders", "refunds", "finance-reports"].includes(item.key))) && item.label.toLowerCase().includes(menuSearch.trim().toLowerCase())).map((item) => (
                <button key={item.key} className={`nav-item ${activePage === item.key ? "active" : ""}`} onClick={() => setActivePage(item.key)}>
                  <span className="nav-icon">{item.icon}</span>{item.label}
                </button>
              ))}
            </nav>
          </div>
        ))}
        {profile?.role !== "employee" && <div className="field menu-search"><label htmlFor="menu-search">Cari menu</label><input id="menu-search" type="search" value={menuSearch} onChange={e=>setMenuSearch(e.target.value)} placeholder="Cari menu..." aria-label="Cari menu website"/></div>}
        <div className="sidebar-bottom"><div className="side-foot"><strong>{profile?.role === "owner" ? "✦ Owner workspace" : profile?.role === "admin" ? "◈ Admin workspace" : "◷ Ruang kerja karyawan"}</strong><p>{profile?.role === "owner" ? "Kontrol penuh bisnis, pengguna, dan konfigurasi." : profile?.role === "admin" ? "Kelola kegiatan operasional sesuai kewenangan." : "Akses cepat untuk kehadiran dan aktivitas pribadi."}</p></div><button className="logout-button" onClick={handleLogout} disabled={busy}><span className="logout-symbol">↪</span><span><strong>{busy ? "Memproses..." : "Keluar dari akun"}</strong><small>Akhiri sesi dengan aman</small></span></button></div>
      </aside>
      <section className="main">
        <header className="topbar">
          <div><div className="eyebrow">{profile?.role === "owner" ? "OWNER CONTROL CENTER" : profile?.role === "admin" ? "ADMIN OPERATIONS" : "MY WORKSPACE"} / {moduleTitle.toUpperCase()}</div><div className="subtle workspace-caption" style={{ marginTop: 5 }}>{profile?.role === "owner" ? "Visibilitas menyeluruh dan pengaturan bisnis." : profile?.role === "admin" ? "Pusat kegiatan dan pengelolaan operasional." : "Ruang pribadi untuk kehadiran dan aktivitas kerja."}</div></div>
          <div className="user-menu"><div className="avatar">{displayName.slice(0,1).toUpperCase()}</div><div className="user-copy"><div className="user-email">{displayName}</div><div className="user-role">{profile?.role === "owner" ? "OWNER" : profile?.role === "admin" ? "ADMIN" : "KARYAWAN"}{isActive ? " · AKTIF" : " · NONAKTIF"}</div></div></div>
        </header>
        {activePage === "dashboard" ? <>
          <div className="welcome"><div><div className="eyebrow">DASHBOARD OVERVIEW</div><h1>Selamat datang, {displayName.split("@")[0]} 👋</h1><p className="subtle" style={{ marginBottom: 0 }}>Berikut ringkasan data yang tersedia pada workspace Anda.</p></div><div className="date-pill">● &nbsp; Database terhubung</div></div>
          {!isActive && <div className="error-box">Akun ini tidak aktif. Beberapa tindakan akan dibatasi. Hubungi Owner.</div>}
          {message && <div className="info-box">{message}</div>}
          {error && <div className="error-box">{error}</div>}
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-top"><span>Total Karyawan</span><span className="stat-icon">♙</span></div><div className="stat-value">{dataLoading ? "—" : counts.employees}</div><div className="stat-note">Data karyawan tersimpan</div></div>
            <div className="stat-card"><div className="stat-top"><span>Catatan Absensi</span><span className="stat-icon">◷</span></div><div className="stat-value">{dataLoading ? "—" : counts.attendance}</div><div className="stat-note">Jumlah catatan yang dapat diakses</div></div>
            <div className="stat-card"><div className="stat-top"><span>Produk Inventaris</span><span className="stat-icon">▤</span></div><div className="stat-value">{dataLoading ? "—" : counts.products}</div><div className="stat-note">Item produk tersimpan</div></div>
            <div className="stat-card"><div className="stat-top"><span>Transaksi Keuangan</span><span className="stat-icon">◈</span></div><div className="stat-value">{dataLoading ? "—" : counts.finances}</div><div className="stat-note">Transaksi yang dapat diakses</div></div>
          </div>
          <div className="content-grid">
            <section className="panel"><div className="panel-head"><div><h2>Modul bisnis</h2><div className="subtle">Pilih area kerja yang ingin Anda buka</div></div><span className="status">ONLINE</span></div>
              <div className="activity-list">
                {navItems.filter((item) => item.key !== "dashboard" && (profile?.role === "owner" || (profile?.role === "admin" ? item.key !== "finance" : ["attendance"].includes(item.key))) && (item.label+" "+descriptions[item.key]).toLowerCase().includes(menuSearch.trim().toLowerCase())).map((item) => <button className="activity" key={item.key} onClick={() => setActivePage(item.key)} style={{ width: "100%", textAlign: "left", background: "transparent", color: "inherit", borderLeft: 0, borderRight: 0, borderBottom: 0, cursor: "pointer" }}><div className="activity-icon">{item.icon}</div><div className="activity-copy"><strong>{item.label}</strong><span>{descriptions[item.key]}</span></div><span className="activity-time">BUKA ↗</span></button>)}
              </div>
            </section>
            <section className="panel"><div className="panel-head"><div><h2>Akses cepat</h2><div className="subtle">Pintasan modul</div></div></div><div className="quick-grid">
              {[{key:"employees" as ModuleKey,icon:"♙",label:"Karyawan",desc:"Data tim"},{key:"attendance" as ModuleKey,icon:"◷",label:"Absensi",desc:"Kehadiran"},{key:"inventory" as ModuleKey,icon:"▤",label:"Inventaris",desc:"Stok & produk"},{key:"finance" as ModuleKey,icon:"◈",label:"Keuangan",desc:"Arus transaksi"}].filter((item) => profile?.role === "owner" || (profile?.role === "admin" && item.key !== "finance") || (profile?.role === "employee" && item.key === "attendance")).map((item) => <button className="quick-card" key={item.key} onClick={() => setActivePage(item.key)}><span>{item.icon}</span><strong>{item.label}</strong><small>{item.desc}</small></button>)}
            </div><div className="info-box" style={{ marginTop: 15 }}>Fondasi login dan ringkasan data sudah disiapkan. Form transaksi dan alur operasional akan dikembangkan serta diuji per modul.</div></section>
          </div>
        </> : activePage === "attendance" ? <section className="panel" style={{ maxWidth: 1200 }}>
          <div className="eyebrow">MODUL / ABSENSI</div>
          <div className="section-head" style={{ marginTop: 12 }}>
            <div><h1>Riwayat absensi</h1><p className="subtle">Maksimal 100 catatan terbaru. Foto bukti hanya tersedia selama 7 hari sejak diunggah.</p><Link className="btn" href="/attendance-camera" style={{ display: "inline-flex", marginTop: 10 }}>Buka kamera & pendaftaran wajah →</Link></div>
            <button className="btn" onClick={() => setActivePage("dashboard")}>← Kembali</button>
          </div>
          {attendanceError && <div className="error-box" role="alert">{attendanceError}</div>}
          {["owner","admin"].includes(profile?.role ?? "") && <div className="panel" style={{marginTop:16,marginBottom:20,background:"rgba(10,20,38,.45)"}}><div className="panel-head"><div><h2>Rekap absensi hari ini</h2><p className="subtle">Jumlah sesi absensi per akun karyawan pada tanggal {new Intl.DateTimeFormat("id-ID",{timeZone:"Asia/Jakarta",dateStyle:"full"}).format(new Date())}.</p></div><span className="status">{dailyAttendanceRows.length} sesi</span></div>{dailyAttendanceRows.length===0 ? <div className="info-box">Belum ada sesi absensi hari ini.</div> : <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:520}}><thead><tr style={{textAlign:"left",color:"#91a1b8"}}><th style={{padding:10}}>Karyawan</th><th style={{padding:10}}>Jumlah sesi</th><th style={{padding:10}}>Status hari ini</th></tr></thead><tbody>{Array.from(dailyAttendanceRows.reduce((map,row)=>{const key=row.employee_id;const prev=map.get(key)||{employee_id:key,employees:row.employees,count:0,open:0};prev.count+=1;if(!row.check_out_at)prev.open+=1;map.set(key,prev);return map;},new Map<string,{employee_id:string;employees:DailyAttendanceRow["employees"];count:number;open:number}>()).values()).map(row=><tr key={row.employee_id} style={{borderTop:"1px solid #25334a"}}><td style={{padding:10}}><strong>{row.employees?.full_name??"Karyawan"}</strong><div className="subtle">{row.employees?.employee_code??"—"}</div></td><td style={{padding:10}}>{row.count} sesi</td><td style={{padding:10}}>{row.open>0?`Masih bekerja (${row.open} sesi aktif)`:"Semua sesi sudah Check-out"}</td></tr>)}</tbody></table></div>}</div>}
          {attendanceLoading ? <p className="subtle">Memuat riwayat absensi…</p> : attendanceRows.length === 0 ? <div className="info-box">Belum ada riwayat absensi yang dapat ditampilkan.</div> : <><div className="field" style={{maxWidth:480,marginBottom:14}}><label htmlFor="attendance-search">Cari absensi</label><input id="attendance-search" type="search" value={attendanceSearch} onChange={e=>setAttendanceSearch(e.target.value)} placeholder="Nama, kode karyawan, tanggal, status..." /></div><p className="subtle">{attendanceRows.filter(row=>([row.employees?.full_name,row.employees?.employee_code,row.work_date,row.status,row.check_in_method,row.check_out_method].join(" ")).toLowerCase().includes(attendanceSearch.trim().toLowerCase())).length} catatan cocok</p><div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 760 }}>
              <thead><tr style={{ textAlign: "left", color: "#91a1b8" }}>
                <th style={{ padding: 10 }}>Karyawan</th><th style={{ padding: 10 }}>Tanggal</th><th style={{ padding: 10 }}>Masuk</th><th style={{ padding: 10 }}>Pulang</th><th style={{ padding: 10 }}>Status</th><th style={{ padding: 10 }}>Bukti wajah</th>
              </tr></thead>
              <tbody>{attendanceRows.filter(row=>([row.employees?.full_name,row.employees?.employee_code,row.work_date,row.status,row.check_in_method,row.check_out_method].join(" ")).toLowerCase().includes(attendanceSearch.trim().toLowerCase())).map((row) => <tr key={row.id} style={{ borderTop: "1px solid #25334a" }}>
                <td style={{ padding: 10 }}><strong>{row.employees?.full_name ?? "Karyawan"}</strong><div className="subtle">{row.employees?.employee_code ?? "—"}</div></td>
                <td style={{ padding: 10 }}>{row.work_date}</td>
                <td style={{ padding: 10 }}>{row.check_in_at ? new Date(row.check_in_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td style={{ padding: 10 }}>{row.check_out_at ? new Date(row.check_out_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td style={{ padding: 10 }}>{row.status}</td>
                <td style={{ padding: 10 }}>{row.evidence_url ? <a href={row.evidence_url} target="_blank" rel="noreferrer" style={{ color: "#67e8f9", textDecoration: "underline" }}>Lihat foto ↗</a> : <span className="subtle">Tidak tersedia / kedaluwarsa</span>}</td>
              </tr>)}</tbody>
            </table>
          </div></>}
        </section> : activePage === "employees" ? <section className="panel" style={{ maxWidth: 1200 }}>
          <div className="eyebrow">MODUL / KARYAWAN</div>
          <div className="section-head" style={{marginTop:12}}>
            <div><h1>Pengelolaan karyawan</h1><p className="subtle">Tambah, edit, dan nonaktifkan karyawan. Karyawan aktif tersedia pada pilihan di halaman absensi kamera.</p></div>
            <button className="btn" onClick={()=>setActivePage("dashboard")}>← Kembali</button>
          </div>
          {employeeError && <div className="error-box" role="alert">{employeeError}</div>}
          {employeeNotice && <div className="info-box" role="status">{employeeNotice}</div>}
          {["owner","admin"].includes(profile?.role ?? "") && <form onSubmit={saveEmployee} className="panel" style={{marginTop:18,background:"rgba(10,20,38,.45)"}}>
            <h2>{editingEmployeeId ? "Edit karyawan" : "Tambah karyawan baru"}</h2>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:14,marginTop:14}}>
              <div className="field"><label htmlFor="employee-code">Kode karyawan *</label><input id="employee-code" required maxLength={40} value={employeeForm.employee_code} onChange={e=>setEmployeeForm(f=>({...f,employee_code:e.target.value}))} placeholder="Contoh: KRY-001"/></div>
              <div className="field"><label htmlFor="employee-name">Nama lengkap *</label><input id="employee-name" required maxLength={120} value={employeeForm.full_name} onChange={e=>setEmployeeForm(f=>({...f,full_name:e.target.value}))} placeholder="Nama karyawan"/></div>
              <div className="field"><label htmlFor="employee-email">Email (opsional)</label><input id="employee-email" type="email" value={employeeForm.email} onChange={e=>setEmployeeForm(f=>({...f,email:e.target.value}))} placeholder="karyawan@bisnis.com"/></div>
              <div className="field"><label htmlFor="employee-phone">Nomor HP (opsional)</label><input id="employee-phone" type="tel" value={employeeForm.phone} onChange={e=>setEmployeeForm(f=>({...f,phone:e.target.value}))} placeholder="+628..."/></div>
              <div className="field"><label htmlFor="employee-title">Jabatan (opsional)</label><input id="employee-title" value={employeeForm.job_title} onChange={e=>setEmployeeForm(f=>({...f,job_title:e.target.value}))} placeholder="Contoh: Kasir"/></div>
              <div className="field"><label htmlFor="employee-joined">Tanggal bergabung</label><input id="employee-joined" type="date" value={employeeForm.joined_on} onChange={e=>setEmployeeForm(f=>({...f,joined_on:e.target.value}))}/></div>
            </div>
            {!editingEmployeeId && <div className="panel" style={{marginTop:14,background:"rgba(10,20,38,.35)"}}>
              <label style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={createLoginAccount} onChange={e=>setCreateLoginAccount(e.target.checked)} /> Buat akun login untuk karyawan ini</label>
              {createLoginAccount && <div style={{marginTop:12}}><p className="subtle">Akun akan login menggunakan email di atas. Pilih role sesuai kewenangan Anda.</p><div className="field"><label htmlFor="new-account-role">Role akun *</label><select id="new-account-role" value={newAccountRole} onChange={e=>setNewAccountRole(e.target.value as "employee"|"admin")}><option value="employee">Karyawan (akses operasional terbatas)</option>{profile?.role==="owner" && <option value="admin">Admin (akses operasional)</option>}</select></div><div className="field"><label htmlFor="employee-initial-password">Kata sandi awal (minimal 8 karakter) *</label><input id="employee-initial-password" type="password" minLength={8} autoComplete="new-password" required value={employeePassword} onChange={e=>setEmployeePassword(e.target.value)} placeholder="Buat kata sandi sementara"/></div></div>}
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
                <td style={{padding:10}}>{(() => { const linked = accountRows.find(a => a.id === emp.profile_id || a.employee?.employee_code === emp.employee_code); return linked ? (profile?.role === "owner" ? <select aria-label={"Role "+linked.email} value={linked.role} disabled={accountSavingId===linked.id || linked.role==="owner"} onChange={e=>void updateAccount(linked,e.target.value as "owner"|"admin"|"employee",linked.is_active)}>{linked.role!=="employee" && <option value={linked.role} disabled>{linked.role==="admin"?"Admin (saat ini)":"Owner (dilindungi)"}</option>}<option value="employee">Karyawan</option>{profile?.role==="owner" && <><option value="admin">Admin</option><option value="owner">Owner</option></>}</select> : <span className="status">{linked.role==="employee"?"KARYAWAN":linked.role.toUpperCase()}</span>) : <span className="subtle">Belum ada akun</span>; })()}</td>
                <td style={{padding:10}}><span className="status">{emp.employment_status==="active"?"AKTIF":"NONAKTIF"}</span></td>
                <td style={{padding:10}}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn" type="button" onClick={()=>{setEditingEmployeeId(emp.id);setEmployeeForm({employee_code:emp.employee_code,full_name:emp.full_name,email:emp.email||"",phone:emp.phone||"",job_title:emp.job_title||"",joined_on:emp.joined_on||"",notes:emp.notes||""});setEmployeeError("");setEmployeeNotice("");}}>Edit</button><button className="btn" type="button" onClick={()=>void toggleEmployeeStatus(emp)}>{emp.employment_status==="active"?"Nonaktifkan":"Aktifkan"}</button>{(() => { const linked = accountRows.find(a => a.id === emp.profile_id || a.employee?.employee_code === emp.employee_code); return profile?.role === "owner" && linked && linked.role !== "owner" ? <button className="btn" type="button" disabled={accountSavingId===linked.id} onClick={()=>void deleteEmployeeLogin(emp,linked)}>{accountSavingId===linked.id?"Memproses…":"Hapus akun"}</button> : null; })()}</div></td>
              </tr>)}</tbody>
            </table>
          </div>}
          <div className="info-box" style={{marginTop:16}}>Pengaturan role dan penghapusan akun login tersedia langsung di daftar karyawan. Role “Employee” ditampilkan sebagai “KARYAWAN”. Menghapus akun login tidak menghapus data karyawan atau riwayat absensi.</div>
        </section> : activePage === "orders" ? <section className="business-page">
          <div className="business-hero"><div><div className="eyebrow">TRANSAKSI OPERASIONAL</div><h1>Order Produk</h1><p>Ajukan kebutuhan produk untuk aktivitas kerja dan pantau prosesnya dari satu tempat.</p></div><div className="business-hero-icon">🛒</div></div>
          {orderNotice && <div className="info-box" role="status">{orderNotice}</div>}{orderError && <div className="error-box" role="alert">{orderError}</div>}
          <div className="business-columns">
            <form className="panel business-form" onSubmit={submitProductOrder}>
              <div className="eyebrow">BUAT ORDER BARU</div><h2>Pilih produk</h2>
              <div className="field"><label htmlFor="order-product">Produk tersedia</label><select id="order-product" value={selectedOrderProductId} onChange={e=>setSelectedOrderProductId(e.target.value)} required><option value="">Pilih produk…</option>{orderProducts.map(p=><option key={p.id} value={p.id}>{p.name} · stok {p.current_stock} {p.unit} · {new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(p.sale_price)}</option>)}</select></div>
              {selectedOrderProductId && (()=>{const p=orderProducts.find(x=>x.id===selectedOrderProductId);return p?<div className="order-product-preview"><strong>{p.name}</strong><span>SKU {p.sku}</span><span>Stok tersedia: {p.current_stock} {p.unit}</span><strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(p.sale_price)} / {p.unit}</strong></div>:null})()}
              <div className="field"><label htmlFor="order-qty">Jumlah</label><input id="order-qty" type="number" min="0.01" step="0.01" max={orderProducts.find(p=>p.id===selectedOrderProductId)?.current_stock ?? undefined} value={orderQuantity} onChange={e=>setOrderQuantity(e.target.value)} required /></div>
              <div className="field"><label htmlFor="order-notes">Catatan kebutuhan (opsional)</label><textarea id="order-notes" value={orderNotes} onChange={e=>setOrderNotes(e.target.value)} rows={3} placeholder="Contoh: untuk order pelanggan / kebutuhan shift sore" /></div>
              <button className="btn btn-primary" type="submit" disabled={orderSubmitting||!orderProducts.length}>{orderSubmitting?"Mengirim order…":"Kirim order ke Admin →"}</button>
              {!orderProducts.length && <p className="subtle">Belum ada produk aktif dengan stok tersedia.</p>}
            </form>
            <div className="panel business-history"><div className="eyebrow">AKTIVITAS TERKINI</div><h2>Riwayat order</h2>
              {orderRows.length===0?<p className="subtle">Belum ada order yang tercatat.</p>:orderRows.map(o=><article className="business-record" key={o.id}><div className="business-record-head"><div><strong>{o.order_code}</strong><small>{new Date(o.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</small></div><span className={`status-pill status-${o.status}`}>{o.status==="pending"?"Menunggu":o.status==="approved"?"Disetujui":o.status==="fulfilled"?"Dipenuhi":o.status==="rejected"?"Ditolak":"Dibatalkan"}</span></div>{o.product_order_items?.map(it=><div className="business-line" key={it.id}><span>{it.products?.name ?? "Produk"} × {it.quantity}</span><strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(it.line_total)}</strong></div>)}{o.notes&&<p className="subtle">{o.notes}</p>}{["owner","admin"].includes(profile?.role??"")&&o.status==="pending"&&<div className="business-actions"><button className="btn btn-primary" onClick={()=>void reviewBusinessItem("product_orders",o.id,"approved")}>Setujui</button><button className="btn" onClick={()=>void reviewBusinessItem("product_orders",o.id,"rejected")}>Tolak</button></div>}{["owner","admin"].includes(profile?.role??"")&&o.status==="approved"&&<div className="business-actions"><button className="btn btn-primary" onClick={()=>void reviewBusinessItem("product_orders",o.id,"fulfilled")}>Tandai dipenuhi</button></div>}</article>)}
            </div>
          </div>
        </section> : activePage === "refunds" ? <section className="business-page">
          <div className="business-hero"><div><div className="eyebrow">PENGEMBALIAN PRODUK</div><h1>Refund Produk</h1><p>Ajukan refund dari order yang disetujui atau sudah dipenuhi. Semua permintaan tercatat untuk ditinjau.</p></div><div className="business-hero-icon">↩</div></div>
          {refundNotice && <div className="info-box" role="status">{refundNotice}</div>}{refundError && <div className="error-box" role="alert">{refundError}</div>}
          <div className="business-columns">
            <form className="panel business-form" onSubmit={submitRefund}><div className="eyebrow">AJUKAN REFUND</div><h2>Detail pengembalian</h2>
              <div className="field"><label htmlFor="refund-order">Order terkait</label><select id="refund-order" value={refundOrderId} onChange={e=>{setRefundOrderId(e.target.value);setRefundItemId("");}} required><option value="">Pilih order…</option>{orderRows.filter(o=>["approved","fulfilled"].includes(o.status)).map(o=><option key={o.id} value={o.id}>{o.order_code} · {o.status}</option>)}</select></div>
              <div className="field"><label htmlFor="refund-item">Produk</label><select id="refund-item" value={refundItemId} onChange={e=>setRefundItemId(e.target.value)} required><option value="">Pilih produk…</option>{orderRows.find(o=>o.id===refundOrderId)?.product_order_items.map(it=><option key={it.id} value={it.id}>{it.products?.name??"Produk"} · dipesan {it.quantity} {it.products?.unit??""}</option>)}</select></div>
              <div className="field"><label htmlFor="refund-qty">Jumlah yang direfund</label><input id="refund-qty" type="number" min="0.01" step="0.01" max={orderRows.find(o=>o.id===refundOrderId)?.product_order_items.find(it=>it.id===refundItemId)?.quantity??undefined} value={refundQuantity} onChange={e=>setRefundQuantity(e.target.value)} required /></div>
              <div className="field"><label htmlFor="refund-reason">Alasan refund</label><textarea id="refund-reason" value={refundReason} onChange={e=>setRefundReason(e.target.value)} rows={3} placeholder="Jelaskan kondisi atau alasan pengembalian" required /></div>
              <button className="btn btn-primary" type="submit" disabled={refundSubmitting}>{refundSubmitting?"Mengirim…":"Kirim permintaan refund →"}</button>
            </form>
            <div className="panel business-history"><div className="eyebrow">PEMANTAUAN</div><h2>Riwayat refund</h2>{refundRows.length===0?<p className="subtle">Belum ada permintaan refund.</p>:refundRows.map(r=><article className="business-record" key={r.id}><div className="business-record-head"><div><strong>{r.refund_code}</strong><small>Order {r.product_orders?.order_code??"—"} · {new Date(r.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</small></div><span className={`status-pill status-${r.status}`}>{r.status==="pending"?"Menunggu":r.status==="approved"?"Disetujui":"Ditolak"}</span></div><p>{r.reason}</p><div className="business-line"><span>{r.quantity} unit</span><strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(r.amount)}</strong></div>{["owner","admin"].includes(profile?.role??"")&&r.status==="pending"&&<div className="business-actions"><button className="btn btn-primary" onClick={()=>void reviewBusinessItem("product_refunds",r.id,"approved")}>Setujui</button><button className="btn" onClick={()=>void reviewBusinessItem("product_refunds",r.id,"rejected")}>Tolak</button></div>}</article>)}</div>
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
              <div className="field"><label htmlFor="finance-report-ref">Referensi / bukti (opsional)</label><input id="finance-report-ref" value={financeReportReference} onChange={e=>setFinanceReportReference(e.target.value)} placeholder="Nomor transaksi / referensi" /></div>
              <button className="btn btn-primary" type="submit" disabled={financeReportSubmitting}>{financeReportSubmitting?"Mengirim laporan…":"Kirim laporan →"}</button>
            </form>
            <div className="panel business-history"><div className="eyebrow">AUDIT HARIAN</div><h2>Riwayat laporan</h2>{financeReportRows.length===0?<p className="subtle">Belum ada laporan uang.</p>:financeReportRows.map(r=><article className="business-record" key={r.id}><div className="business-record-head"><div><strong>{r.report_code}</strong><small>{new Date(r.created_at).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"})}</small></div><span className={`status-pill status-${r.status}`}>{r.status==="pending"?"Menunggu":r.status==="approved"?"Disetujui":"Ditolak"}</span></div><div className="business-line"><span>{r.report_type==="income"?"Uang masuk":"Uang keluar"} · {r.description}</span><strong>{new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(r.amount)}</strong></div><small className="subtle">Metode: {r.payment_method??"—"}</small>{["owner","admin"].includes(profile?.role??"")&&r.status==="pending"&&<div className="business-actions"><button className="btn btn-primary" onClick={()=>void reviewBusinessItem("financial_reports",r.id,"approved")}>Setujui</button><button className="btn" onClick={()=>void reviewBusinessItem("financial_reports",r.id,"rejected")}>Tolak</button></div>}</article>)}</div>
          </div>
        </section> : <section className="panel" style={{ maxWidth: 900 }}>
          <div className="eyebrow">MODUL / {activePage.toUpperCase()}</div><h1 style={{ marginTop: 12 }}>{moduleTitle}</h1><p className="subtle">{descriptions[activePage]}</p>
          {activePage === "settings" ? <><div className="info-box">Pilih aturan absensi yang akan berlaku untuk semua akun karyawan. Mode tersimpan di database dan tetap aktif sampai diubah lagi.</div><div className="panel" style={{marginTop:16,background:"rgba(10,20,38,.45)"}}><h2>Aturan Check-in / Check-out</h2><p className="subtle">Owner dan Admin dapat mengubah pilihan ini. Perubahan tidak menghapus riwayat absensi yang sudah tersimpan.</p><div className="field"><label htmlFor="attendance-mode">Mode absensi</label><select id="attendance-mode" value={attendanceMode} disabled={attendanceModeLoading||attendanceModeSaving} onChange={e=>void saveAttendanceMode(e.target.value as AttendanceMode)}><option value="once_daily">Sekali sehari — 1 Check-in dan 1 Check-out</option><option value="multiple_sessions">Berulang — boleh Check-in lagi setelah Check-out</option></select></div><div className="subtle">{attendanceMode==="once_daily"?"Karyawan tidak bisa memulai sesi kedua pada tanggal yang sama.":"Karyawan boleh memulai sesi baru setelah sesi sebelumnya selesai Check-out."}</div>{attendanceModeLoading&&<p className="subtle">Memuat pengaturan…</p>}{attendanceModeSaving&&<p className="subtle">Menyimpan mode…</p>}{attendanceModeNotice&&<div className="info-box" role="status" style={{marginTop:12}}>{attendanceModeNotice}</div>}{attendanceModeError&&<div className="error-box" role="alert" style={{marginTop:12}}>{attendanceModeError}</div>}</div><div className="info-box" style={{marginTop:16}}>Owner dapat mengatur role dan status akun lain. Akun Owner yang sedang digunakan dilindungi dari perubahan diri sendiri.</div></> : <div className="info-box">Modul ini masih dalam tahap fondasi. Kami tidak akan menampilkan data contoh seolah-olah merupakan data bisnis asli.</div>}
          <div className="section-head"><div><h2>Ringkasan terkait</h2><div className="subtle">Angka dibaca dari database sesuai hak akses akun.</div></div><button className="btn" onClick={() => setActivePage("dashboard")}>← Kembali ke ringkasan</button></div>
          <div className="stats-grid">
            {(activePage === "inventory" || activePage === "barcode") && <div className="stat-card"><div className="stat-top">Produk</div><div className="stat-value">{counts.products}</div></div>}
            {activePage === "finance" && <div className="stat-card"><div className="stat-top">Transaksi</div><div className="stat-value">{counts.finances}</div></div>}
            {activePage === "settings" && <div className="stat-card"><div className="stat-top">Role akun</div><div className="stat-value" style={{ fontSize: 20 }}>{profile?.role?.toUpperCase() ?? "—"}</div><div className="stat-note">Status: {profile?.is_active ? "Aktif" : "Tidak aktif"}</div></div>}
          </div>
        </section>}
        <div className="footer">SMART BUSINESS MANAGEMENT · Ruang kerja transaksi & operasional · Data dibatasi sesuai role</div>
      </section>
    </main>
  );
}