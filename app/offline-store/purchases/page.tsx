"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Profile = { id: string; email: string; role: string; is_active: boolean };
type Store = { id: string; store_code: string; name: string };
type Product = { id: string; name: string; sku: string; unit: string; current_stock: number; is_active: boolean; cost_price?: number };
type Order = { id: string; order_code: string; store_id: string; status: string; subtotal: number; paid_amount: number; notes: string | null; requested_at: string };
type Item = { id: string; order_id: string; central_product_id: string; quantity_requested: number; quantity_shipped: number; quantity_received: number; unit_cost: number; line_total: number };
type Entry = { id: string; store_id: string; order_id: string | null; entry_type: string; amount: number; payment_method: string | null; description: string; reference_code: string | null; created_at: string };
const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n) || 0);
const statusLabel: Record<string, string> = { requested: "Menunggu kantor", shipped: "Dikirim", received: "Diterima", rejected: "Ditolak", cancelled: "Dibatalkan" };

export default function OfflineStorePurchasesPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [memberships, setMemberships] = useState<{ store_id: string; store_role: string }[]>([]);
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [notes, setNotes] = useState("");
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const isAdmin = Boolean(profile && ["owner", "admin"].includes(profile.role));
  const member = memberships.find(m => m.store_id === storeId);
  const canOrder = isAdmin || member?.store_role === "manager" || member?.store_role === "store_admin" || member?.store_role === "inventory";
  const canReceive = canOrder;
  const canFinance = isAdmin || member?.store_role === "manager" || member?.store_role === "store_admin";
  const selectedStore = stores.find(s => s.id === storeId);
  const selectedProduct = products.find(p => p.id === productId);
  const fmtStatus = (s: string) => statusLabel[s] || s;

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data: auth } = await supabase.auth.getSession();
    if (!auth.session) { setSession(null); setProfile(null); setLoading(false); return; }
    setSession(auth.session);
    const { data: p, error: pe } = await supabase.from("profiles").select("id,email,role,is_active").eq("id", auth.session.user.id).maybeSingle();
    if (pe || !p || !p.is_active) { setError("Akun belum aktif atau profil tidak dapat dibaca."); setLoading(false); return; }
    setProfile(p as Profile);
    const { data: ss, error: se } = await supabase.from("offline_stores").select("id,store_code,name").order("name");
    if (se) { setError(se.message); setLoading(false); return; }
    let allowedStores = (ss || []) as Store[];
    if (!["owner", "admin"].includes(p.role)) {
      const { data: mm } = await supabase.from("offline_store_memberships").select("store_id,store_role").eq("user_id", p.id).eq("is_active", true);
      setMemberships((mm || []) as { store_id: string; store_role: string }[]);
      const ids = (mm || []).map((m: { store_id: string }) => m.store_id);
      allowedStores = allowedStores.filter(s => ids.includes(s.id));
    } else {
      const { data: mm } = await supabase.from("offline_store_memberships").select("store_id,store_role").eq("user_id", p.id).eq("is_active", true);
      setMemberships((mm || []) as { store_id: string; store_role: string }[]);
    }
    setStores(allowedStores);
    setStoreId(prev => allowedStores.some(s => s.id === prev) ? prev : (allowedStores[0]?.id || ""));
    const { data: pp, error: ppe } = await supabase.from("products").select("id,name,sku,unit,current_stock,is_active").eq("is_active", true).order("name");
    if (ppe) setError(ppe.message);
    setProducts((pp || []) as Product[]);
    setLoading(false);
  }, []);

  const loadStoreData = useCallback(async () => {
    if (!storeId || !profile) { setOrders([]); setItems([]); setEntries([]); return; }
    const [oo, ii, ee] = await Promise.all([
      supabase.from("offline_store_purchase_orders").select("*").eq("store_id", storeId).order("requested_at", { ascending: false }).limit(100),
      supabase.from("offline_store_purchase_items").select("*").order("created_at", { ascending: false }).limit(500),
      supabase.from("offline_store_finance_entries").select("*").eq("store_id", storeId).order("created_at", { ascending: false }).limit(100)
    ]);
    if (oo.error) setError(oo.error.message); else setOrders((oo.data || []) as Order[]);
    if (ii.error) setError(ii.error.message); else setItems((ii.data || []) as Item[]);
    if (ee.error && canFinance) setError(ee.error.message); else setEntries((ee.data || []) as Entry[]);
  }, [storeId, profile, canFinance]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadStoreData(); }, [loadStoreData]);

  async function action(fn: () => PromiseLike<{ error: { message: string } | null }>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await fn();
      if (result.error) throw result.error;
      setNotice(success);
      await loadStoreData();
      await load();
    } catch (e: unknown) { setError(e instanceof Error ? e.message : "Operasi gagal."); }
    finally { setBusy(false); }
  }

  async function submitOrder(e: FormEvent) {
    e.preventDefault();
    if (!storeId || !productId) return;
    await action(() => supabase.rpc("create_offline_store_purchase", { p_store_id: storeId, p_items: [{ product_id: productId, quantity: Number(quantity) }], p_notes: notes || null }), "Permintaan pembelian dikirim ke kantor.");
    setProductId(""); setQuantity("1"); setNotes("");
  }

  async function ship(order: Order) {
    await action(() => supabase.rpc("ship_offline_store_purchase", { p_order_id: order.id }), "Pesanan diproses dan stok kantor dikurangi.");
  }
  async function reject(order: Order) {
    const reason = window.prompt("Alasan penolakan (opsional):") || null;
    await action(() => supabase.rpc("reject_offline_store_purchase", { p_order_id: order.id, p_reason: reason }), "Permintaan pembelian ditolak.");
  }
  async function receive(order: Order) {
    await action(() => supabase.rpc("receive_offline_store_purchase", { p_order_id: order.id }), "Barang diterima, stok toko dan biaya pembelian dicatat.");
  }
  async function pay(order: Order) {
    const amount = Number(paymentAmounts[order.id] || 0);
    await action(() => supabase.rpc("pay_offline_store_purchase", { p_order_id: order.id, p_amount: amount, p_payment_method: paymentMethods[order.id] || "cash" }), "Pembayaran toko berhasil dicatat.");
    setPaymentAmounts(prev => ({ ...prev, [order.id]: "" }));
  }

  const orderItems = useMemo(() => {
    const productMap = new Map(products.map(p => [p.id, p]));
    return orders.map(o => ({ ...o, lines: items.filter(i => i.order_id === o.id).map(i => ({ ...i, product: productMap.get(i.central_product_id) })) }));
  }, [orders, items, products]);

  if (!isSupabaseConfigured) return <main className="main"><section className="panel"><h1>Pembelian Toko Offline</h1><p>Konfigurasi Supabase belum tersedia.</p></section></main>;
  if (loading) return <main className="main"><section className="panel"><p>Memuat modul pembelian…</p></section></main>;
  if (!session || !profile) return <main className="main"><section className="panel"><h1>Pembelian Toko Offline</h1><p>Silakan login dari aplikasi utama terlebih dahulu.</p><Link href="/" className="btn btn-primary">Kembali ke aplikasi</Link></section></main>;

  return <main className="main">
    <div className="topbar"><div><div className="eyebrow">SMART BUSINESS MANAGEMENT</div><h1>Pembelian Toko Offline</h1><p className="subtle">Permintaan stok dari kantor pusat dengan pencatatan keuangan terpisah per toko.</p></div><div className="business-actions"><Link href="/offline-store" className="btn">← Toko Offline</Link><Link href="/" className="btn">Dashboard</Link></div></div>
    {notice && <div className="info-box" role="status">{notice}</div>}{error && <div className="error-box" role="alert">{error}</div>}
    <section className="panel">
      <div className="section-head"><div><h2>Pilih toko</h2><p className="subtle">Setiap toko memiliki tagihan dan catatan keuangan pembeliannya sendiri.</p></div><button className="btn" onClick={() => void load()} disabled={busy}>Muat ulang</button></div>
      {stores.length === 0 ? <p className="subtle">Belum ada toko yang dapat diakses akun ini.</p> : <div className="field"><label>Toko</label><select value={storeId} onChange={e => setStoreId(e.target.value)}>{stores.map(s => <option key={s.id} value={s.id}>{s.store_code} — {s.name}</option>)}</select></div>}
      {selectedStore && <div className="stats-grid"><div className="stat-card"><div className="stat-top">Pesanan menunggu</div><div className="stat-value">{orders.filter(o => o.status === "requested").length}</div></div><div className="stat-card"><div className="stat-top">Dalam pengiriman</div><div className="stat-value">{orders.filter(o => o.status === "shipped").length}</div></div><div className="stat-card"><div className="stat-top">Sisa tagihan toko</div><div className="stat-value">{money(orders.filter(o => o.status === "received").reduce((n,o) => n + Math.max(0, Number(o.subtotal)-Number(o.paid_amount)),0))}</div></div></div>}
    </section>
    {selectedStore && <div className="business-page">
      {canOrder && <form className="panel business-form" onSubmit={submitOrder}>
        <h2>Ajukan pembelian ke kantor</h2><p className="subtle">Harga modal diambil dari data biaya produk kantor. Stok kantor baru berkurang setelah Owner/Admin mengirim pesanan.</p>
        <div className="business-columns"><div className="field"><label>Produk kantor</label><select value={productId} onChange={e => setProductId(e.target.value)} required><option value="">Pilih produk</option>{products.map(p => <option key={p.id} value={p.id}>{p.name} · {p.sku} · stok kantor {Number(p.current_stock).toLocaleString("id-ID")} {p.unit}</option>)}</select></div><div className="field"><label>Jumlah diminta</label><input type="number" min="0.001" step="0.001" value={quantity} onChange={e => setQuantity(e.target.value)} required/></div></div>
        {selectedProduct && <div className="info-box">Stok kantor: {Number(selectedProduct.current_stock).toLocaleString("id-ID")} {selectedProduct.unit}. Harga pembelian ditentukan dari harga modal kantor saat permintaan dibuat.</div>}
        <div className="field"><label>Catatan untuk kantor</label><textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Misalnya kebutuhan stok mingguan"/></div>
        <button className="btn btn-primary" disabled={busy || !productId}>{busy ? "Mengirim…" : "Kirim permintaan pembelian"}</button>
      </form>}
      <section className="panel business-history"><h2>Pesanan pembelian</h2><p className="subtle">Alur: diajukan → dikirim kantor (stok kantor berkurang) → diterima toko (stok toko bertambah dan biaya masuk ke keuangan toko).</p>
        {orderItems.map(o => <article className="business-record" key={o.id}>
          <div className="business-record-head"><div><strong>{o.order_code}</strong><small>{new Date(o.requested_at).toLocaleString("id-ID")} · {o.lines.length} item</small></div><span className={"status-pill " + (o.status === "received" ? "status-approved" : o.status === "rejected" ? "status-rejected" : "")}>{fmtStatus(o.status)}</span></div>
          {o.lines.map(i => <div className="business-line" key={i.id}><span>{i.product?.name || "Produk kantor"} · {Number(i.quantity_requested).toLocaleString("id-ID")} {i.product?.unit || ""} × {money(Number(i.unit_cost))}</span><strong>{money(Number(i.line_total))}</strong></div>)}
          <div className="business-line"><span>Total pesanan</span><strong>{money(Number(o.subtotal))}</strong></div>
          {o.notes && <p className="subtle">Catatan: {o.notes}</p>}
          {isAdmin && o.status === "requested" && <div className="business-actions"><button className="btn btn-primary" disabled={busy} onClick={() => void ship(o)}>Setujui & kirim barang</button><button className="btn btn-danger" disabled={busy} onClick={() => void reject(o)}>Tolak</button></div>}
          {canReceive && o.status === "shipped" && <button className="btn btn-primary" disabled={busy} onClick={() => void receive(o)}>Konfirmasi barang diterima</button>}
          {canFinance && o.status === "received" && Number(o.subtotal) > Number(o.paid_amount) && <div className="business-columns"><div className="field"><label>Bayar sekarang (sisa {money(Number(o.subtotal)-Number(o.paid_amount))})</label><input type="number" min="1" max={Number(o.subtotal)-Number(o.paid_amount)} value={paymentAmounts[o.id] || ""} onChange={e => setPaymentAmounts(prev => ({...prev,[o.id]:e.target.value}))} required/></div><div className="field"><label>Metode pembayaran</label><select value={paymentMethods[o.id] || "cash"} onChange={e => setPaymentMethods(prev => ({...prev,[o.id]:e.target.value}))}><option value="cash">Tunai</option><option value="bank_transfer">Transfer bank</option><option value="e_wallet">E-wallet</option><option value="other">Lainnya</option></select></div><div className="field"><label>&nbsp;</label><button className="btn btn-primary" disabled={busy || Number(paymentAmounts[o.id] || 0) <= 0} onClick={() => void pay(o)}>Catat pembayaran</button></div></div>}
          {o.status === "received" && <p className="subtle">Pembayaran: {money(Number(o.paid_amount))} dari {money(Number(o.subtotal))} · {Number(o.paid_amount) >= Number(o.subtotal) ? "Lunas" : "Belum lunas"}</p>}
        </article>)}
        {orderItems.length === 0 && <p className="subtle">Belum ada pesanan pembelian.</p>}
      </section>
      {canFinance && <section className="panel business-history"><h2>Keuangan toko · pembelian dari kantor</h2><p className="subtle">Catatan ini terpisah dari keuangan kantor dan hanya tersedia untuk Owner/Admin serta manager toko.</p>
        {entries.map(e => <article className="business-record" key={e.id}><div className="business-record-head"><div><strong>{e.entry_type === "purchase_expense" ? "Beban pembelian stok" : "Pembayaran ke kantor"}</strong><small>{e.reference_code || "Tanpa referensi"} · {new Date(e.created_at).toLocaleString("id-ID")}</small></div><strong>{money(Number(e.amount))}</strong></div><p className="subtle">{e.description}{e.payment_method ? " · " + e.payment_method : ""}</p></article>)}
        {entries.length === 0 && <p className="subtle">Belum ada transaksi keuangan pembelian.</p>}
      </section>}
    </div>}
    <p className="footer">SMART BUSINESS MANAGEMENT · Pembelian toko offline · Stok dan keuangan dicatat terpisah</p>
  </main>;
}
