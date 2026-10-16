"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Role = "owner" | "admin" | "hrd" | "employee";
type Profile = { id: string; full_name: string | null; role: Role; is_active: boolean };
type TrxCategory = "Pesanan" | "Refund" | "Pengajuan Toko" | "Keuangan" | "Stok" | "Absensi" | "Cuti";
type TrxStatus = "Menunggu" | "Belum diproses" | "Diproses" | "Menunggu persetujuan" | "Disetujui" | "Ditolak" | "Selesai" | "Perlu diperiksa" | "Kendala";
type Trx = {
  id: string;
  code: string;
  category: TrxCategory;
  activity: string;
  location: string;
  status: TrxStatus;
  createdAt: string;
  actor: string;
  ownerId: string | null;
  amount?: number | null;
  description?: string | null;
  sourceStatus: string;
};

const PAGE_SIZE = 20;
const CATEGORIES = ["Semua", "Pesanan", "Refund", "Pengajuan Toko", "Keuangan", "Stok", "Absensi", "Cuti"] as const;
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
const isOpenStatus = (status: string) => !["approved", "completed", "complete", "fulfilled", "received", "paid", "closed", "rejected", "cancelled", "canceled", "selesai", "disetujui", "ditolak", "dibatalkan", "dipenuhi", "diterima", "lunas"].includes(normalize(status));

function statusLabel(status: string, category: TrxCategory): TrxStatus {
  const s = normalize(status);
  if (["rejected", "declined", "denied", "ditolak"].includes(s)) return "Ditolak";
  if (["approved", "disetujui"].includes(s)) return category === "Refund" ? "Diproses" : "Disetujui";
  if (["completed", "complete", "fulfilled", "received", "paid", "closed", "selesai", "dipenuhi", "diterima", "lunas"].includes(s)) return "Selesai";
  if (["processing", "in_progress", "shipped", "shipping", "diproses", "dikirim"].includes(s)) return "Diproses";
  if (["requested", "pending", "waiting", "submitted", "menunggu", "pending_approval"].includes(s)) return category === "Pengajuan Toko" ? "Belum diproses" : "Menunggu persetujuan";
  if (["draft", "unreviewed", "belum_diperiksa"].includes(s)) return "Perlu diperiksa";
  return "Perlu diperiksa";
}

function badgeClass(status: TrxStatus) {
  if (["Selesai", "Disetujui"].includes(status)) return "trx-badge trx-good";
  if (["Ditolak", "Kendala"].includes(status)) return "trx-badge trx-bad";
  if (["Diproses"].includes(status)) return "trx-badge trx-progress";
  return "trx-badge trx-wait";
}

export default function TransactionsPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rows, setRows] = useState<Trx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<string>("Semua");
  const [statusFilter, setStatusFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Trx | null>(null);
  const [refresh, setRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const session = sessionData.session;
    if (!session) {
      window.location.href = "/";
      return;
    }
    const { data: profileData, error: profileError } = await supabase.from("profiles").select("id,full_name,role,is_active").eq("id", session.user.id).maybeSingle();
    if (profileError || !profileData || !profileData.is_active) {
      setError("Profil akun tidak dapat diverifikasi. Silakan masuk kembali atau hubungi administrator.");
      setLoading(false);
      return;
    }
    const current = profileData as Profile;
    setProfile(current);
    const result: Trx[] = [];
    const errors: string[] = [];
    const [orders, refunds, reports, requests, movements, attendance, leaves, stores, employees, people] = await Promise.all([
      supabase.from("product_orders").select("id,order_code,status,ordered_by,reviewed_by,requested_at,created_at,notes").order("created_at", { ascending: false }).limit(500),
      supabase.from("product_refunds").select("id,refund_code,order_id,requested_by,reviewed_by,status,amount,reason,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("financial_reports").select("id,report_code,report_type,amount,description,status,submitted_by,reviewed_by,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("offline_store_purchase_orders").select("id,order_code,store_id,status,subtotal,notes,requested_by,reviewed_by,shipped_by,received_by,requested_at,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("stock_movements").select("id,movement_type,quantity,reference_code,reason,notes,movement_at,created_by").order("movement_at", { ascending: false }).limit(500),
      supabase.from("attendance_records").select("id,employee_id,work_date,status,check_in_at,check_out_at,recorded_by,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("leave_requests").select("id,employee_id,leave_type,start_date,end_date,reason,status,reviewed_by,created_at").order("created_at", { ascending: false }).limit(500),
      supabase.from("offline_stores").select("id,name,store_code").limit(500),
      supabase.from("employees").select("id,full_name,profile_id").limit(1000),
      supabase.from("profiles").select("id,full_name,role").limit(1000)
    ]);

    const addError = (label: string, response: { error: { message: string } | null }) => { if (response.error) errors.push(label); };
    addError("pesanan", orders); addError("refund", refunds); addError("laporan keuangan", reports); addError("pengajuan toko", requests); addError("stok", movements); addError("absensi", attendance); addError("cuti", leaves);
    const personNames = new Map<string, string>();
    (people.data ?? []).forEach((p: any) => personNames.set(p.id, p.full_name || p.role || "Akun"));
    const employeeNames = new Map<string, string>();
    (employees.data ?? []).forEach((e: any) => employeeNames.set(e.id, e.full_name || "Karyawan"));
    const storeNames = new Map<string, string>();
    (stores.data ?? []).forEach((s: any) => storeNames.set(s.id, s.name || s.store_code || "Toko Offline"));

    (orders.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.order_code || `ORD-${r.id.slice(0, 8)}`, category: "Pesanan",
      activity: "Pesanan produk", location: "Kantor Pusat", status: statusLabel(r.status, "Pesanan"),
      createdAt: r.created_at || r.requested_at, actor: personNames.get(r.ordered_by) || "Akun tidak diketahui",
      ownerId: r.ordered_by || null, description: r.notes, sourceStatus: r.status
    }));
    (refunds.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.refund_code || `REF-${r.id.slice(0, 8)}`, category: "Refund",
      activity: "Permintaan pengembalian dana", location: "Kantor Pusat", status: statusLabel(r.status, "Refund"),
      createdAt: r.created_at, actor: personNames.get(r.requested_by) || "Akun tidak diketahui",
      ownerId: r.requested_by || null, amount: Number(r.amount || 0), description: r.reason, sourceStatus: r.status
    }));
    (reports.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.report_code || `FIN-${r.id.slice(0, 8)}`, category: "Keuangan",
      activity: r.report_type === "income" ? "Laporan pemasukan" : r.report_type === "expense" ? "Laporan pengeluaran" : "Laporan keuangan",
      location: "Kantor Pusat", status: statusLabel(r.status, "Keuangan"), createdAt: r.created_at,
      actor: personNames.get(r.submitted_by) || "Akun tidak diketahui", ownerId: r.submitted_by || null,
      amount: Number(r.amount || 0), description: r.description, sourceStatus: r.status
    }));
    (requests.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.order_code || `PO-${r.id.slice(0, 8)}`, category: "Pengajuan Toko",
      activity: "Pengajuan pembelian barang dari toko", location: storeNames.get(r.store_id) || "Toko Offline",
      status: statusLabel(r.status, "Pengajuan Toko"), createdAt: r.created_at || r.requested_at,
      actor: personNames.get(r.requested_by) || "Akun tidak diketahui", ownerId: r.requested_by || null,
      amount: Number(r.subtotal || 0), description: r.notes, sourceStatus: r.status
    }));
    (movements.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.reference_code || `STK-${r.id.slice(0, 8)}`, category: "Stok",
      activity: `Pergerakan stok: ${String(r.movement_type || "perubahan").replaceAll("_", " ")}`, location: "Kantor Pusat",
      status: "Selesai", createdAt: r.movement_at || r.created_at,
      actor: personNames.get(r.created_by) || "Akun tidak diketahui", ownerId: r.created_by || null,
      description: r.reason || r.notes, sourceStatus: r.movement_type || "recorded"
    }));
    (attendance.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: `ABS-${String(r.work_date || "").replaceAll("-", "")}-${r.id.slice(0, 4).toUpperCase()}`, category: "Absensi",
      activity: `Catatan absensi: ${r.status || "tercatat"}`, location: "Lokasi kerja",
      status: "Selesai", createdAt: r.created_at || r.check_in_at || r.work_date,
      actor: employeeNames.get(r.employee_id) || "Karyawan", ownerId: r.employee_id || null,
      description: r.work_date ? `Tanggal kerja ${r.work_date}` : "", sourceStatus: r.status
    }));
    (leaves.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: `CUT-${r.id.slice(0, 8).toUpperCase()}`, category: "Cuti",
      activity: `Pengajuan ${r.leave_type || "izin/cuti"}`, location: "Kantor / penempatan kerja",
      status: statusLabel(r.status, "Cuti"), createdAt: r.created_at,
      actor: employeeNames.get(r.employee_id) || "Karyawan", ownerId: r.employee_id || null,
      description: `${r.start_date || "—"} s.d. ${r.end_date || "—"} · ${r.reason || "Tanpa catatan"}`, sourceStatus: r.status
    }));

    if (errors.length) setError(`Sebagian data tidak dapat dibaca: ${errors.join(", ")}. Daftar yang berhasil dibaca tetap ditampilkan; akses database perlu diperiksa untuk kelengkapan penuh.`);
    setRows(result.filter((r) => Boolean(r.createdAt)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setLoading(false);
  }, []);

  useEffect(() => { if (isSupabaseConfigured) void load(); else { setError("Koneksi database belum dikonfigurasi."); setLoading(false); } }, [load, refresh]);

  const visibleRows = useMemo(() => {
    const q = normalize(search);
    return rows.filter((r) => {
      const categoryOk = category === "Semua" || r.category === category;
      const statusOk = statusFilter === "all" || (statusFilter === "open" ? isOpenStatus(r.sourceStatus) && !["Stok", "Absensi"].includes(r.category) : r.status === statusFilter);
      const searchOk = !q || [r.code, r.category, r.activity, r.location, r.actor, r.status, r.description].some((v) => normalize(v).includes(q));
      return categoryOk && statusOk && searchOk;
    });
  }, [rows, category, statusFilter, search]);
  const openRows = useMemo(() => rows.filter((r) => isOpenStatus(r.sourceStatus) && !["Stok", "Absensi"].includes(r.category)), [rows]);
  const pendingApproval = useMemo(() => rows.filter((r) => ["Menunggu", "Menunggu persetujuan", "Belum diproses", "Perlu diperiksa"].includes(r.status)), [rows]);
  const pages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pageRows = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [category, statusFilter, search]);

  const canSeeAll = profile?.role === "owner" || profile?.role === "admin";
  const canSeeFinance = canSeeAll || profile?.role === "hrd";
  const filteredRows = pageRows.filter((r) => canSeeFinance || r.category !== "Keuangan");

  return (
    <main className="trx-page">
      <style jsx>{`
        .trx-page{min-height:100vh;padding:24px clamp(14px,3vw,34px);background:#080d18;color:#f2f6ff;font-family:inherit}
        .trx-shell{max-width:1440px;margin:0 auto}
        .trx-top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:18px}
        .trx-eyebrow{font-size:10px;letter-spacing:.16em;color:#67e8f9;font-weight:800}
        .trx-title{font-size:clamp(24px,3vw,32px);font-weight:800;margin:7px 0}
        .trx-muted{font-size:12px;line-height:1.5;color:#91a1b8}
        .trx-btn{border:1px solid #2b4261;background:#132138;color:#e8f2ff;border-radius:9px;padding:8px 11px;font-size:12px;font-weight:700;white-space:nowrap}
        .trx-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-bottom:14px}
        .trx-stat{border:1px solid #25334a;background:#101827;border-radius:11px;padding:11px 13px;min-width:0}
        .trx-stat-label{font-size:11px;color:#91a1b8}.trx-stat-value{font-size:22px;font-weight:800;margin-top:4px}
        .trx-controls{display:grid;grid-template-columns:minmax(160px,1.5fr) repeat(2,minmax(120px,1fr));gap:8px;margin:14px 0}
        .trx-input{width:100%;min-width:0;background:#0d1523;border:1px solid #25334a;color:#f2f6ff;border-radius:9px;padding:9px 10px;font-size:12px;outline:none}
        .trx-cats{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0}
        .trx-cat{border:1px solid #25334a;background:#101827;color:#aab8cd;padding:7px 10px;border-radius:999px;font-size:11px}
        .trx-cat.active{background:#18304a;border-color:#3b82f6;color:#eaf4ff}
        .trx-table-wrap{border:1px solid #25334a;border-radius:12px;overflow:hidden;background:#101827}
        .trx-table{width:100%;border-collapse:collapse;font-size:12px}
        .trx-table th{text-align:left;background:#131f31;color:#9eacc1;font-size:10px;letter-spacing:.04em;font-weight:700;padding:10px 11px;white-space:nowrap}
        .trx-table td{padding:9px 11px;border-top:1px solid #25334a;vertical-align:middle}
        .trx-row{cursor:pointer}.trx-row:hover{background:#152238}
        .trx-code{font-weight:800;color:#e8f2ff;white-space:nowrap}.trx-activity{font-weight:700}.trx-sub{font-size:10px;color:#91a1b8;margin-top:3px;line-height:1.4}
        .trx-badge{display:inline-flex;border-radius:999px;padding:4px 7px;font-size:10px;font-weight:800;white-space:nowrap;border:1px solid transparent}
        .trx-wait{color:#fcd34d;background:#78350f33;border-color:#92400e66}.trx-progress{color:#93c5fd;background:#1e3a8a44;border-color:#1d4ed866}.trx-good{color:#6ee7b7;background:#064e3b44;border-color:#04785766}.trx-bad{color:#fda4af;background:#88133744;border-color:#9f123966}
        .trx-empty{padding:28px 14px;text-align:center;color:#91a1b8;font-size:12px}
        .trx-pager{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-top:1px solid #25334a;font-size:11px;color:#91a1b8}
        .trx-modal-backdrop{position:fixed;inset:0;background:#020617cc;display:flex;align-items:center;justify-content:center;padding:16px;z-index:100}
        .trx-modal{width:min(560px,100%);max-height:85vh;overflow:auto;background:#101827;border:1px solid #334155;border-radius:14px;padding:18px}
        .trx-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}.trx-detail{background:#0b1220;border:1px solid #25334a;border-radius:9px;padding:10px;min-width:0}.trx-detail label{display:block;font-size:10px;color:#91a1b8;margin-bottom:5px}.trx-detail strong{font-size:12px;overflow-wrap:anywhere}
        @media(max-width:720px){.trx-page{padding:15px 10px}.trx-top{align-items:flex-start}.trx-stats{gap:6px}.trx-stat{padding:9px}.trx-stat-value{font-size:19px}.trx-controls{grid-template-columns:1fr 1fr}.trx-controls input{grid-column:1/-1}.trx-table th:nth-child(3),.trx-table td:nth-child(3),.trx-table th:nth-child(5),.trx-table td:nth-child(5){display:none}.trx-table td,.trx-table th{padding:9px 7px}.trx-code{white-space:normal;overflow-wrap:anywhere}.trx-detail-grid{grid-template-columns:1fr 1fr}}
      `}</style>
      <div className="trx-shell">
        <div className="trx-top">
          <div><div className="trx-eyebrow">PUSAT RIWAYAT & TINDAK LANJUT</div><h1 className="trx-title">Transaksi (TRX)</h1><div className="trx-muted">Semua aktivitas yang diizinkan untuk akun ini, dengan prioritas pengajuan yang masih membutuhkan tindakan.</div></div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}><Link href="/" className="trx-btn">← Dashboard</Link><button className="trx-btn" onClick={() => setRefresh((v) => v + 1)} disabled={loading}>{loading ? "Memuat…" : "↻ Segarkan"}</button></div>
        </div>
        <section className="trx-stats">
          <div className="trx-stat"><div className="trx-stat-label">Belum selesai</div><div className="trx-stat-value">{loading ? "—" : openRows.length}</div><div className="trx-muted">Perlu ditindaklanjuti</div></div>
          <div className="trx-stat"><div className="trx-stat-label">Menunggu persetujuan</div><div className="trx-stat-value">{loading ? "—" : pendingApproval.length}</div><div className="trx-muted">Belum diputuskan</div></div>
          <div className="trx-stat"><div className="trx-stat-label">Total data terbaca</div><div className="trx-stat-value">{loading ? "—" : rows.length}</div><div className="trx-muted">Sumber data yang berhasil dibaca</div></div>
        </section>
        {error && <div role="status" style={{border:"1px solid #92400e",background:"#78350f33",borderRadius:9,padding:10,fontSize:12,marginBottom:12,color:"#fde68a"}}>{error}</div>}
        <div className="trx-cats">{CATEGORIES.map((item) => <button key={item} className={`trx-cat ${category === item ? "active" : ""}`} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="trx-controls">
          <input className="trx-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode, nama, toko, aktivitas…" aria-label="Cari transaksi" />
          <select className="trx-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter status">
            <option value="open">Belum selesai / perlu tindakan</option><option value="all">Semua status</option><option value="Menunggu persetujuan">Menunggu persetujuan</option><option value="Belum diproses">Belum diproses</option><option value="Diproses">Diproses</option><option value="Disetujui">Disetujui</option><option value="Ditolak">Ditolak</option><option value="Selesai">Selesai</option><option value="Perlu diperiksa">Perlu diperiksa</option>
          </select>
          <div className="trx-muted" style={{alignSelf:"center"}}>Menampilkan {filteredRows.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, visibleRows.length)} dari {visibleRows.length} hasil · 20 per halaman</div>
        </div>
        <div className="trx-table-wrap">
          <table className="trx-table">
            <thead><tr><th>KODE TRX / AKTIVITAS</th><th>KATEGORI</th><th>LOKASI</th><th>STATUS</th><th>PELAKU</th><th>WAKTU</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="trx-empty">Memuat transaksi…</td></tr> : filteredRows.length === 0 ? <tr><td colSpan={6} className="trx-empty">Tidak ada transaksi yang cocok. Coba ubah filter ke “Semua status” atau pilih kategori “Semua”.</td></tr> : filteredRows.map((r) => <tr key={`${r.category}-${r.id}`} className="trx-row" onClick={() => setSelected(r)}>
                <td><div className="trx-code">{r.code}</div><div className="trx-sub">{r.activity}{r.amount != null ? ` · ${money(r.amount)}` : ""}</div></td>
                <td>{r.category}</td><td>{r.location}</td><td><span className={badgeClass(r.status)}>{r.status}</span></td><td>{r.actor}</td><td style={{whiteSpace:"nowrap"}}>{dateTime(r.createdAt)}</td>
              </tr>)}
            </tbody>
          </table>
          <div className="trx-pager"><span>Halaman {Math.min(page, pages)} dari {pages}</span><div style={{display:"flex",gap:6}}><button className="trx-btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Sebelumnya</button><button className="trx-btn" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Berikutnya</button></div></div>
        </div>
        <p className="trx-muted" style={{marginTop:10}}>Catatan: halaman ini menggabungkan catatan dari modul sumber tanpa menghapus data asli. Tombol tindakan persetujuan akan diaktifkan setelah alur tindakan setiap kategori dipetakan dan diuji.</p>
      </div>
      {selected && <div className="trx-modal-backdrop" onClick={() => setSelected(null)}><section className="trx-modal" role="dialog" aria-modal="true" aria-label="Detail transaksi" onClick={(e) => e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}><div><div className="trx-eyebrow">DETAIL TRANSAKSI</div><h2 style={{fontSize:19,margin:"7px 0"}}>{selected.code}</h2><div className="trx-muted">{selected.activity}</div></div><button className="trx-btn" onClick={() => setSelected(null)}>Tutup</button></div>
        <div style={{marginTop:12}}><span className={badgeClass(selected.status)}>{selected.status}</span></div>
        <div className="trx-detail-grid">
          <div className="trx-detail"><label>Kategori</label><strong>{selected.category}</strong></div><div className="trx-detail"><label>Lokasi / penempatan</label><strong>{selected.location}</strong></div>
          <div className="trx-detail"><label>Dibuat / diajukan oleh</label><strong>{selected.actor}</strong></div><div className="trx-detail"><label>Waktu tercatat</label><strong>{dateTime(selected.createdAt)}</strong></div>
          <div className="trx-detail"><label>Status pada sumber</label><strong>{selected.sourceStatus || "—"}</strong></div><div className="trx-detail"><label>Nominal</label><strong>{selected.amount != null ? money(selected.amount) : "Tidak berlaku"}</strong></div>
        </div>
        <div className="trx-detail" style={{marginTop:12}}><label>Catatan / rincian</label><strong>{selected.description || "Tidak ada catatan tambahan."}</strong></div>
        <p className="trx-muted" style={{marginTop:12}}>Riwayat keputusan dan nama pemroses/pemberi persetujuan akan ditampilkan dari data sumber jika tersedia. Perubahan status harus dilakukan melalui tindakan yang memiliki izin, bukan dengan mengubah label tampilan.</p>
      </section></div>}
    </main>
  );
}
