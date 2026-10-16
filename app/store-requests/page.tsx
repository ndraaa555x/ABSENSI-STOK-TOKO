"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import AppIcon from "@/components/app-icon";

type Profile = { id: string; full_name: string | null; email: string | null; role: string; is_active: boolean };
type Store = { id: string; store_code: string; name: string };
type Product = { id: string; name: string; sku: string; unit: string };
type PurchaseOrder = { id: string; order_code: string; store_id: string; status: string; subtotal: number; paid_amount: number; notes: string | null; requested_at: string; requested_by?: string | null; reviewed_by?: string | null; reviewed_at?: string | null };
type PurchaseItem = { id: string; order_id: string; central_product_id: string; quantity_requested: number; quantity_shipped: number; quantity_received: number; unit_cost: number; line_total: number };
type Person = { id: string; full_name: string | null; email: string | null };

const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(value) || 0);
const statusLabel: Record<string, string> = { requested: "Menunggu keputusan kantor", shipped: "Sudah dikirim", received: "Sudah diterima toko", rejected: "Ditolak", cancelled: "Dibatalkan" };

export default function CentralStoreRequestsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [filterStatus, setFilterStatus] = useState("requested");
  const [filterStore, setFilterStore] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) { setSession(null); setProfile(null); setLoading(false); return; }
    setSession(auth.session);
    const { data: p, error: pe } = await supabase.from("profiles").select("id,full_name,email,role,is_active").eq("id", auth.session.user.id).maybeSingle();
    if (pe || !p || !p.is_active) { setError("Profil akun tidak aktif atau tidak dapat dibaca."); setLoading(false); return; }
    setProfile(p as Profile);
    if (!["owner", "admin"].includes(p.role)) { setError("Halaman ini khusus Owner/Admin Kantor Pusat."); setLoading(false); return; }

    const [ss, oo, ii, pp, peopleResult] = await Promise.all([
      supabase.from("offline_stores").select("id,store_code,name").order("name"),
      supabase.from("offline_store_purchase_orders").select("id,order_code,store_id,status,subtotal,paid_amount,notes,requested_at,requested_by,reviewed_by,reviewed_at").order("requested_at", { ascending: false }).limit(500),
      supabase.from("offline_store_purchase_items").select("id,order_id,central_product_id,quantity_requested,quantity_shipped,quantity_received,unit_cost,line_total").order("created_at", { ascending: false }).limit(2000),
      supabase.from("products").select("id,name,sku,unit"),
      supabase.from("profiles").select("id,full_name,email").limit(2000)
    ]);
    const firstError = ss.error || oo.error || ii.error || pp.error;
    if (firstError) setError(firstError.message);
    setStores((ss.data || []) as Store[]);
    setOrders((oo.data || []) as PurchaseOrder[]);
    setItems((ii.data || []) as PurchaseItem[]);
    setProducts((pp.data || []) as Product[]);
    setPeople((peopleResult.data || []) as Person[]);
    if (peopleResult.error) console.warn("Nama pemohon tidak dapat dimuat:", peopleResult.error.message);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function processOrder(order: PurchaseOrder, mode: "ship" | "reject") {
    if (mode === "reject" && !window.confirm("Tolak pengajuan " + order.order_code + "? Anda akan diminta mengisi alasan penolakan.")) return;
    const reason = mode === "reject" ? (window.prompt("Alasan penolakan:") || "").trim() : "";
    if (mode === "reject" && !reason) { setError("Alasan penolakan wajib diisi."); return; }
    setBusyId(order.id); setError(""); setNotice("");
    try {
      const result = mode === "ship"
        ? await supabase.rpc("ship_offline_store_purchase", { p_order_id: order.id })
        : await supabase.rpc("reject_offline_store_purchase", { p_order_id: order.id, p_reason: reason });
      if (result.error) throw result.error;
      setNotice(mode === "ship" ? "Pengajuan " + order.order_code + " disetujui dan diproses untuk pengiriman." : "Pengajuan " + order.order_code + " ditolak dan alasannya dicatat.");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Permintaan tidak berhasil diproses.");
    } finally { setBusyId(""); }
  }

  const storeById = useMemo(() => new Map(stores.map(s => [s.id, s])), [stores]);
  const productById = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const personById = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);
  const filtered = useMemo(() => orders.filter(o => {
    const store = storeById.get(o.store_id);
    const requester = o.requested_by ? personById.get(o.requested_by) : null;
    const statusMatch = filterStatus === "all" || o.status === filterStatus;
    const storeMatch = filterStore === "all" || o.store_id === filterStore;
    const haystack = [o.order_code, store?.name, store?.store_code, requester?.full_name, requester?.email, o.notes].filter(Boolean).join(" ").toLocaleLowerCase("id-ID");
    return statusMatch && storeMatch && haystack.includes(search.trim().toLocaleLowerCase("id-ID"));
  }), [orders, storeById, personById, filterStatus, filterStore, search]);
  const pendingCount = orders.filter(o => o.status === "requested").length;
  const shippingCount = orders.filter(o => o.status === "shipped").length;
  const receivedCount = orders.filter(o => o.status === "received").length;
  const totalPending = orders.filter(o => o.status === "requested").reduce((sum, o) => sum + Number(o.subtotal || 0), 0);

  if (!isSupabaseConfigured) return <main className="main"><section className="panel"><h1>Pengajuan Permintaan Toko</h1><p>Konfigurasi Supabase belum tersedia.</p></section></main>;
  if (loading) return <main className="main"><section className="panel"><p>Memuat pengajuan dari semua toko…</p></section></main>;
  if (!session || !profile) return <main className="main"><section className="panel"><h1>Pengajuan Permintaan Toko</h1><p>Silakan login melalui website utama terlebih dahulu.</p><Link href="/" className="btn btn-primary">Ke halaman login</Link></section></main>;
  if (!["owner", "admin"].includes(profile.role)) return <main className="main"><section className="panel"><h1>Akses terbatas</h1><p>Modul ini hanya tersedia untuk Owner/Admin Kantor Pusat.</p><Link href="/" className="btn">Kembali ke dashboard</Link></section></main>;

  return <main className="main">
    <div className="topbar"><div><div className="eyebrow">KANTOR PUSAT · MODUL TOKO</div><h1>Pengajuan Permintaan Toko</h1><p className="subtle">Pusat kendali pengajuan barang dari seluruh toko offline. Proses semuanya dari halaman ini tanpa membuka modul toko satu per satu.</p></div><div className="business-actions"><Link href="/" className="btn">← Dashboard utama</Link><button className="btn" onClick={() => void load()} disabled={Boolean(busyId)}>Muat ulang</button></div></div>
    {notice && <div className="info-box" role="status">{notice}</div>}
    {error && <div className="error-box" role="alert">{error}</div>}
    <div className="info-box">Seluruh daftar pengajuan dan tindak lanjut toko telah dipusatkan di <Link href="/transactions">Transaksi (TRX) <AppIcon name="next" size={14} /></Link>. Gunakan TRX untuk meninjau, menyetujui, menolak, dan memantau pengajuan. Data asli tetap tersimpan.</div>
    <div className="stats-grid" style={{display:"none"}}>
      <div className="stat-card"><div className="stat-top">Menunggu keputusan</div><div className="stat-value">{pendingCount.toLocaleString("id-ID")}</div><div className="stat-note">Total nilai {money(totalPending)}</div></div>
      <div className="stat-card"><div className="stat-top">Dalam pengiriman</div><div className="stat-value">{shippingCount.toLocaleString("id-ID")}</div><div className="stat-note">Menunggu konfirmasi toko</div></div>
      <div className="stat-card"><div className="stat-top">Sudah diterima</div><div className="stat-value">{receivedCount.toLocaleString("id-ID")}</div><div className="stat-note">Riwayat permintaan selesai</div></div>
    </div>
    <section className="panel" style={{display:"none"}}>
      <div className="section-head"><div><h2>Daftar permintaan seluruh toko</h2><p className="subtle">Setiap pengajuan ditampilkan satu kali, beserta detail barang, harga modal, pemohon, dan status proses.</p></div><span className="status">KANTOR PUSAT</span></div>
      <div className="business-columns">
        <div className="field"><label htmlFor="request-search">Cari pengajuan</label><input id="request-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nomor pengajuan, nama toko, pemohon…"/></div>
        <div className="field"><label htmlFor="request-store">Filter toko</label><select id="request-store" value={filterStore} onChange={e => setFilterStore(e.target.value)}><option value="all">Semua toko</option>{stores.map(s => <option key={s.id} value={s.id}>{s.store_code} — {s.name}</option>)}</select></div>
        <div className="field"><label htmlFor="request-status">Status pengajuan</label><select id="request-status" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}><option value="requested">Menunggu keputusan</option><option value="shipped">Dalam pengiriman</option><option value="received">Sudah diterima</option><option value="rejected">Ditolak</option><option value="cancelled">Dibatalkan</option><option value="all">Semua status</option></select></div>
      </div>
      <div className="business-page">
        {filtered.map(order => {
          const store = storeById.get(order.store_id);
          const requester = order.requested_by ? personById.get(order.requested_by) : null;
          const lines = items.filter(i => i.order_id === order.id);
          return <article className="business-record" key={order.id}>
            <div className="business-record-head"><div><strong>{order.order_code}</strong><small>{store ? store.store_code + " · " + store.name : "Toko tidak diketahui"} · {new Date(order.requested_at).toLocaleString("id-ID")}</small><small>Diminta oleh: {requester?.full_name || requester?.email || "Data pemohon tidak tersedia"}</small></div><span className={"status-pill " + (order.status === "received" ? "status-approved" : order.status === "rejected" ? "status-rejected" : "")}>{statusLabel[order.status] || order.status}</span></div>
            {lines.map(item => { const product = productById.get(item.central_product_id); return <div className="business-line" key={item.id}><span><strong>{product?.name || "Produk kantor"}</strong><br/><small>{product?.sku || "Tanpa SKU"} · Diminta {Number(item.quantity_requested).toLocaleString("id-ID")} {product?.unit || "unit"} · Dikirim {Number(item.quantity_shipped).toLocaleString("id-ID")} · Diterima {Number(item.quantity_received).toLocaleString("id-ID")}</small><br/><small>Harga modal: {money(Number(item.unit_cost))} per unit</small></span><strong>{money(Number(item.line_total))}</strong></div>; })}
            {order.notes && <p className="subtle">Catatan toko: {order.notes}</p>}
            <div className="business-line"><span>Total permintaan</span><strong>{money(Number(order.subtotal))}</strong></div>
            {order.status === "requested" && <div className="business-actions"><button className="btn btn-primary" disabled={Boolean(busyId)} onClick={() => void processOrder(order, "ship")}>{busyId === order.id ? "Memproses…" : "Setujui & proses pengiriman"}</button><button className="btn btn-danger" disabled={Boolean(busyId)} onClick={() => void processOrder(order, "reject")}>Tolak permintaan</button></div>}
            {order.status === "shipped" && <p className="subtle">Barang telah diproses dari sisi kantor. Toko perlu mengonfirmasi penerimaan untuk memperbarui stok toko.</p>}
            {order.status === "received" && <p className="subtle">Permintaan telah diterima toko. Pembayaran tercatat terpisah dari proses pengiriman.</p>}
          </article>;
        })}
        {filtered.length === 0 && <div className="info-box">Tidak ada pengajuan yang sesuai dengan pencarian dan filter ini.</div>}
      </div>
    </section>
    <p className="footer">SMART BUSINESS MANAGEMENT · Pengajuan Permintaan Toko · Modul khusus Kantor Pusat</p>
  </main>;
}
