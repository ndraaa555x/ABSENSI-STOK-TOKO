"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Profile = { id: string; email: string; full_name: string | null; role: "owner" | "admin" | "employee"; is_active: boolean };
type Counts = { employees: number; attendance: number; products: number; finances: number };
type AttendanceRow = { id: string; work_date: string; check_in_at: string | null; check_out_at: string | null; status: string; check_in_method: string | null; check_out_method: string | null; evidence_path: string | null; employees: { full_name: string; employee_code: string } | null; evidence_url?: string | null };
type ModuleKey = "dashboard" | "employees" | "attendance" | "inventory" | "finance" | "barcode" | "settings";
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
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");

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

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const identifier = email.trim();
    const credentials = identifier.includes("@")
      ? { email: identifier, password }
      : { phone: identifier, password };
    const { error: authError } = await supabase.auth.signInWithPassword(credentials);
    if (authError) setError("Login gagal. Periksa email, kata sandi, dan status akun Anda.");
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

  async function handleLogout() {
    setBusy(true);
    const { error: logoutError } = await supabase.auth.signOut();
    if (logoutError) setError("Logout gagal. Silakan coba lagi.");
    setBusy(false);
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
              {navItems.filter((item) => item.group === group).map((item) => (
                <button key={item.key} className={`nav-item ${activePage === item.key ? "active" : ""}`} onClick={() => setActivePage(item.key)}>
                  <span className="nav-icon">{item.icon}</span>{item.label}
                </button>
              ))}
            </nav>
          </div>
        ))}
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
                {navItems.filter((item) => item.key !== "dashboard").map((item) => <button className="activity" key={item.key} onClick={() => setActivePage(item.key)} style={{ width: "100%", textAlign: "left", background: "transparent", color: "inherit", borderLeft: 0, borderRight: 0, borderBottom: 0, cursor: "pointer" }}><div className="activity-icon">{item.icon}</div><div className="activity-copy"><strong>{item.label}</strong><span>{descriptions[item.key]}</span></div><span className="activity-time">BUKA ↗</span></button>)}
              </div>
            </section>
            <section className="panel"><div className="panel-head"><div><h2>Akses cepat</h2><div className="subtle">Pintasan modul</div></div></div><div className="quick-grid">
              {[{key:"employees" as ModuleKey,icon:"♙",label:"Karyawan",desc:"Data tim"},{key:"attendance" as ModuleKey,icon:"◷",label:"Absensi",desc:"Kehadiran"},{key:"inventory" as ModuleKey,icon:"▤",label:"Inventaris",desc:"Stok & produk"},{key:"finance" as ModuleKey,icon:"◈",label:"Keuangan",desc:"Arus transaksi"}].map((item) => <button className="quick-card" key={item.key} onClick={() => setActivePage(item.key)}><span>{item.icon}</span><strong>{item.label}</strong><small>{item.desc}</small></button>)}
            </div><div className="info-box" style={{ marginTop: 15 }}>Fondasi login dan ringkasan data sudah disiapkan. Form transaksi dan alur operasional akan dikembangkan serta diuji per modul.</div></section>
          </div>
        </> : activePage === "attendance" ? <section className="panel" style={{ maxWidth: 1200 }}>
          <div className="eyebrow">MODUL / ABSENSI</div>
          <div className="section-head" style={{ marginTop: 12 }}>
            <div><h1>Riwayat absensi</h1><p className="subtle">Maksimal 100 catatan terbaru. Foto bukti hanya tersedia selama 7 hari sejak diunggah.</p></div>
            <button className="btn" onClick={() => setActivePage("dashboard")}>← Kembali</button>
          </div>
          {attendanceError && <div className="error-box" role="alert">{attendanceError}</div>}
          {attendanceLoading ? <p className="subtle">Memuat riwayat absensi…</p> : attendanceRows.length === 0 ? <div className="info-box">Belum ada riwayat absensi yang dapat ditampilkan.</div> : <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 760 }}>
              <thead><tr style={{ textAlign: "left", color: "#91a1b8" }}>
                <th style={{ padding: 10 }}>Karyawan</th><th style={{ padding: 10 }}>Tanggal</th><th style={{ padding: 10 }}>Masuk</th><th style={{ padding: 10 }}>Pulang</th><th style={{ padding: 10 }}>Status</th><th style={{ padding: 10 }}>Bukti wajah</th>
              </tr></thead>
              <tbody>{attendanceRows.map((row) => <tr key={row.id} style={{ borderTop: "1px solid #25334a" }}>
                <td style={{ padding: 10 }}><strong>{row.employees?.full_name ?? "Karyawan"}</strong><div className="subtle">{row.employees?.employee_code ?? "—"}</div></td>
                <td style={{ padding: 10 }}>{row.work_date}</td>
                <td style={{ padding: 10 }}>{row.check_in_at ? new Date(row.check_in_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td style={{ padding: 10 }}>{row.check_out_at ? new Date(row.check_out_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                <td style={{ padding: 10 }}>{row.status}</td>
                <td style={{ padding: 10 }}>{row.evidence_url ? <a href={row.evidence_url} target="_blank" rel="noreferrer" style={{ color: "#67e8f9", textDecoration: "underline" }}>Lihat foto ↗</a> : <span className="subtle">Tidak tersedia / kedaluwarsa</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section> : <section className="panel" style={{ maxWidth: 900 }}>
          <div className="eyebrow">MODUL / {activePage.toUpperCase()}</div><h1 style={{ marginTop: 12 }}>{moduleTitle}</h1><p className="subtle">{descriptions[activePage]}</p>
          <div className="info-box">Modul ini masih dalam tahap fondasi. Kami tidak akan menampilkan data contoh seolah-olah merupakan data bisnis asli.</div>
          <div className="section-head"><div><h2>Ringkasan terkait</h2><div className="subtle">Angka dibaca dari database sesuai hak akses akun.</div></div><button className="btn" onClick={() => setActivePage("dashboard")}>← Kembali ke ringkasan</button></div>
          <div className="stats-grid">
            {activePage === "employees" && <div className="stat-card"><div className="stat-top">Karyawan</div><div className="stat-value">{counts.employees}</div></div>}
            {activePage === "attendance" && <div className="stat-card"><div className="stat-top">Catatan absensi</div><div className="stat-value">{counts.attendance}</div></div>}
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
