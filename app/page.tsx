"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Profile = { id: string; email: string; full_name: string | null; role: "owner" | "admin" | "employee"; is_active: boolean };
type Counts = { employees: number; attendance: number; products: number; finances: number };
type AttendanceRow = { id: string; work_date: string; check_in_at: string | null; check_out_at: string | null; status: string; check_in_method: string | null; check_out_method: string | null; evidence_path: string | null; employees: { full_name: string; employee_code: string } | null; evidence_url?: string | null };
type ModuleKey = "dashboard" | "employees" | "attendance" | "inventory" | "finance" | "barcode" | "settings";
type EmployeeRow = { id:string; employee_code:string; full_name:string; email:string|null; phone:string|null; job_title:string|null; employment_status:"active"|"inactive"; joined_on:string|null; notes:string|null; profile_id?:string|null };
type AccountRow = { id:string; email:string; full_name:string|null; role:"owner"|"admin"|"employee"; is_active:boolean; employee?:{employee_code:string;employment_status:string;full_name:string}|null };
const navItems: { key: ModuleKey; icon: string; label: string; group: string }[] = [
  { key: "dashboard", icon: "▦", label: "Ringkasan", group: "UTAMA" },
  { key: "employees", icon: "♙", label: "Karyawan", group: "OPERASIONAL" },
  { key: "attendance", icon: "◷", label: "Absensi", group: "OPERASIONAL" },
  { key: "inventory", icon: "▤", label: "Inventaris & Stok", group: "OPERASIONAL" },
  { key: "barcode", icon: "▥", label: "Barcode", group: "OPERASIONAL" },
  { key: "finance", icon: "◈", label: "Keuangan", group: "MANAJEMEN" },
  { key: "settings", icon: "⚙", label: "Pengaturan", group: "MANAJEMEN" }
];
const descriptions: Record<ModuleKey, string> = {
  dashboard: "Pantau ringkasan data bisnis Anda.",
  employees: "Fondasi data karyawan sudah tersedia di database. Form tambah, edit, dan pencarian akan disiapkan pada tahap modul karyawan.",
  attendance: "Fondasi pencatatan absensi sudah tersedia di database. Alur check-in, check-out, dan rekap akan dibangun berikutnya.",
  inventory: "Fondasi produk, kategori, dan pergerakan stok sudah tersedia di database. Form transaksi stok akan dibangun berikutnya.",
  barcode: "Database memiliki kolom barcode dan SKU. Pemindaian kamera serta cetak label belum diaktifkan pada tahap fondasi ini.",
  finance: "Fondasi transaksi pemasukan dan pengeluaran sudah tersedia di database. Form pencatatan dan laporan akan dibangun berikutnya.",
  settings: "Pengaturan dan kontrol akses Owner tersedia pada database. Pengelolaan akun Admin dan pengaturan bisnis akan dibangun berikutnya."
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
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
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
        .select("id,employee_code,full_name,email,phone,job_title,employment_status,joined_on,notes")
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

  const displayName = profile?.full_name || profile?.email || session.user.email || "Pengguna";
  const isActive = Boolean(profile?.is_active);
  const moduleTitle = navItems.find((item) => item.key === activePage)?.label ?? "Ringkasan";

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">SB</div><div><div className="brand-title">SMART BUSINESS</div><div className="brand-sub">MANAGEMENT SYSTEM</div></div></div>
        {["UTAMA", "OPERASIONAL", "MANAJEMEN"].map((group) => (
          <div key={group}>
            <div className="nav-label">{group}</div>
            <nav className="nav-list">
              {navItems.filter((item) => item.group === group && item.label.toLowerCase().includes(menuSearch.trim().toLowerCase())).map((item) => (
                <button key={item.key} className={`nav-item ${activePage === item.key ? "active" : ""}`} onClick={() => setActivePage(item.key)}>
                  <span className="nav-icon">{item.icon}</span>{item.label}
                </button>
              ))}
            </nav>
          </div>
        ))}
        <div className="field" style={{marginTop:18,marginBottom:18}}><label htmlFor="menu-search">Cari menu</label><input id="menu-search" type="search" value={menuSearch} onChange={e=>setMenuSearch(e.target.value)} placeholder="Cari dashboard, absensi..." aria-label="Cari menu website"/></div>
        <div className="side-foot"><strong>◈ Sistem terhubung</strong><p>Data disimpan di Supabase. Akses tabel tetap dikendalikan oleh kebijakan keamanan database.</p></div>
      </aside>
      <section className="main">
        <header className="topbar">
          <div><div className="eyebrow">WORKSPACE / {moduleTitle.toUpperCase()}</div><div className="subtle" style={{ marginTop: 5 }}>Pusat kendali operasional bisnis Anda</div></div>
          <div className="user-menu"><div className="avatar">{displayName.slice(0,1).toUpperCase()}</div><div><div className="user-email">{displayName}</div><div className="user-role">{profile?.role ?? "pengguna"}{isActive ? " · aktif" : " · nonaktif"}</div></div><button className="btn" onClick={handleLogout} disabled={busy}>Keluar</button></div>
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
                {navItems.filter((item) => item.key !== "dashboard" && (item.label+" "+descriptions[item.key]).toLowerCase().includes(menuSearch.trim().toLowerCase())).map((item) => <button className="activity" key={item.key} onClick={() => setActivePage(item.key)} style={{ width: "100%", textAlign: "left", background: "transparent", color: "inherit", borderLeft: 0, borderRight: 0, borderBottom: 0, cursor: "pointer" }}><div className="activity-icon">{item.icon}</div><div className="activity-copy"><strong>{item.label}</strong><span>{descriptions[item.key]}</span></div><span className="activity-time">BUKA ↗</span></button>)}
              </div>
            </section>
            <section className="panel"><div className="panel-head"><div><h2>Akses cepat</h2><div className="subtle">Pintasan modul</div></div></div><div className="quick-grid">
              {[{key:"employees" as ModuleKey,icon:"♙",label:"Karyawan",desc:"Data tim"},{key:"attendance" as ModuleKey,icon:"◷",label:"Absensi",desc:"Kehadiran"},{key:"inventory" as ModuleKey,icon:"▤",label:"Inventaris",desc:"Stok & produk"},{key:"finance" as ModuleKey,icon:"◈",label:"Keuangan",desc:"Arus transaksi"}].map((item) => <button className="quick-card" key={item.key} onClick={() => setActivePage(item.key)}><span>{item.icon}</span><strong>{item.label}</strong><small>{item.desc}</small></button>)}
            </div><div className="info-box" style={{ marginTop: 15 }}>Fondasi login dan ringkasan data sudah disiapkan. Form transaksi dan alur operasional akan dikembangkan serta diuji per modul.</div></section>
          </div>
        </> : activePage === "attendance" ? <section className="panel" style={{ maxWidth: 1200 }}>
          <div className="eyebrow">MODUL / ABSENSI</div>
          <div className="section-head" style={{ marginTop: 12 }}>
            <div><h1>Riwayat absensi</h1><p className="subtle">Maksimal 100 catatan terbaru. Foto bukti hanya tersedia selama 7 hari sejak diunggah.</p><Link className="btn" href="/attendance-camera" style={{ display: "inline-flex", marginTop: 10 }}>Buka kamera & pendaftaran wajah →</Link></div>
            <button className="btn" onClick={() => setActivePage("dashboard")}>← Kembali</button>
          </div>
          {attendanceError && <div className="error-box" role="alert">{attendanceError}</div>}
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
          </div>}
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
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:760}}>
              <thead><tr style={{textAlign:"left",color:"#91a1b8"}}><th style={{padding:10}}>Kode</th><th style={{padding:10}}>Nama</th><th style={{padding:10}}>Kontak / Jabatan</th><th style={{padding:10}}>Status</th><th style={{padding:10}}>Aksi</th></tr></thead>
              <tbody>{employeeRows.filter(emp=>([emp.employee_code,emp.full_name,emp.email,emp.phone,emp.job_title,emp.employment_status,emp.joined_on].join(" ")).toLowerCase().includes(employeeSearch.trim().toLowerCase())).map(emp=><tr key={emp.id} style={{borderTop:"1px solid #25334a"}}>
                <td style={{padding:10}}><strong>{emp.employee_code}</strong></td><td style={{padding:10}}>{emp.full_name}<div className="subtle">{emp.joined_on||"Tanggal bergabung belum diisi"}</div></td>
                <td style={{padding:10}}>{emp.email||emp.phone||"Kontak belum diisi"}<div className="subtle">{emp.job_title||"Jabatan belum diisi"}</div></td>
                <td style={{padding:10}}><span className="status">{emp.employment_status==="active"?"AKTIF":"NONAKTIF"}</span></td>
                <td style={{padding:10}}><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="btn" type="button" onClick={()=>{setEditingEmployeeId(emp.id);setEmployeeForm({employee_code:emp.employee_code,full_name:emp.full_name,email:emp.email||"",phone:emp.phone||"",job_title:emp.job_title||"",joined_on:emp.joined_on||"",notes:emp.notes||""});setEmployeeError("");setEmployeeNotice("");}}>Edit</button><button className="btn" type="button" onClick={()=>void toggleEmployeeStatus(emp)}>{emp.employment_status==="active"?"Nonaktifkan":"Aktifkan"}</button></div></td>
              </tr>)}</tbody>
            </table>
          </div>}
          <div className="info-box" style={{marginTop:16}}>Data karyawan tidak otomatis membuat akun login atau mengubah role OWNER/ADMIN. Pengelolaan akun dan role dilakukan terpisah demi keamanan.</div>
        </section> : <section className="panel" style={{ maxWidth: 900 }}>
          <div className="eyebrow">MODUL / {activePage.toUpperCase()}</div><h1 style={{ marginTop: 12 }}>{moduleTitle}</h1><p className="subtle">{descriptions[activePage]}</p>
          <div className="info-box">{activePage === "settings" ? "Owner dapat mengatur role dan status akun lain. Akun Owner yang sedang digunakan dilindungi dari perubahan diri sendiri." : "Modul ini masih dalam tahap fondasi. Kami tidak akan menampilkan data contoh seolah-olah merupakan data bisnis asli."}</div>
          {activePage === "settings" && ["owner","admin"].includes(profile?.role ?? "") && <section className="panel" style={{marginTop:18}}>
            <div className="section-head"><div><h2>Pengelolaan akun & role</h2><p className="subtle">Daftar akun login. Hanya Owner yang dapat mengubah role dan status aktif.</p></div><button className="btn" type="button" onClick={()=>setAccountRefresh(n=>n+1)} disabled={accountLoading}>Muat ulang</button></div>
            {accountError && <div className="error-box" role="alert">{accountError}</div>}
            {accountNotice && <div className="info-box" role="status">{accountNotice}</div>}
            {accountLoading ? <p className="subtle">Memuat akun…</p> : accountRows.length===0 ? <div className="info-box">Belum ada daftar akun yang dapat ditampilkan.</div> : <><div className="field" style={{maxWidth:480,marginBottom:14}}><label htmlFor="account-search">Cari akun</label><input id="account-search" type="search" value={accountSearch} onChange={e=>setAccountSearch(e.target.value)} placeholder="Nama, email, role, status..." /></div><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13,minWidth:720}}>
              <thead><tr style={{textAlign:"left",color:"#91a1b8"}}><th style={{padding:10}}>Nama / Email</th><th style={{padding:10}}>Karyawan</th><th style={{padding:10}}>Role</th><th style={{padding:10}}>Status</th></tr></thead>
              <tbody>{accountRows.filter(account=>([account.full_name,account.email,account.role,account.is_active?"aktif":"nonaktif",account.employee?.employee_code,account.employee?.full_name].join(" ")).toLowerCase().includes(accountSearch.trim().toLowerCase())).map(account=><tr key={account.id} style={{borderTop:"1px solid #25334a"}}>
                <td style={{padding:10}}><strong>{account.full_name||"Tanpa nama"}</strong><div className="subtle">{account.email}</div></td>
                <td style={{padding:10}}>{account.employee ? account.employee.employee_code+" · "+account.employee.employment_status : "Akun non-karyawan"}</td>
                <td style={{padding:10}}>{profile?.role==="owner" ? <select aria-label={"Role "+account.email} value={account.role} disabled={accountSavingId===account.id || account.id===profile?.id} onChange={e=>void updateAccount(account,e.target.value as "owner"|"admin"|"employee",account.is_active)}><option value="employee">Employee</option><option value="admin">Admin</option><option value="owner">Owner</option></select> : <span className="status">{account.role.toUpperCase()}</span>}</td>
                <td style={{padding:10}}>{account.id===profile?.id ? <span className="status">AKTIF (akun Anda)</span> : profile?.role==="owner" ? <button className="btn" type="button" disabled={accountSavingId===account.id} onClick={()=>void updateAccount(account,account.role,!account.is_active)}>{accountSavingId===account.id?"Menyimpan…":account.is_active?"Nonaktifkan":"Aktifkan"}</button> : <span className="status">{account.is_active?"AKTIF":"NONAKTIF"}</span>}</td>
              </tr>)}</tbody>
            </table></div>}
          </section>}
          <div className="section-head"><div><h2>Ringkasan terkait</h2><div className="subtle">Angka dibaca dari database sesuai hak akses akun.</div></div><button className="btn" onClick={() => setActivePage("dashboard")}>← Kembali ke ringkasan</button></div>
          <div className="stats-grid">
            {(activePage === "inventory" || activePage === "barcode") && <div className="stat-card"><div className="stat-top">Produk</div><div className="stat-value">{counts.products}</div></div>}
            {activePage === "finance" && <div className="stat-card"><div className="stat-top">Transaksi</div><div className="stat-value">{counts.finances}</div></div>}
            {activePage === "settings" && <div className="stat-card"><div className="stat-top">Role akun</div><div className="stat-value" style={{ fontSize: 20 }}>{profile?.role?.toUpperCase() ?? "—"}</div><div className="stat-note">Status: {profile?.is_active ? "Aktif" : "Tidak aktif"}</div></div>}
          </div>
        </section>}
        <div className="footer">SMART BUSINESS MANAGEMENT · Fondasi aplikasi · Data mengikuti akses Supabase RLS</div>
      </section>
    </main>
  );
}