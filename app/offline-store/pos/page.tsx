"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Profile = { id: string; email: string; full_name: string | null; role: string; is_active: boolean };
type Store = { id: string; store_code: string; name: string; is_active: boolean };
type Product = { id: string; store_id: string; name: string; sku: string; barcode_value: string | null; unit: string; sale_price: number; current_stock: number; is_active: boolean };
type Membership = { store_id: string; store_role: string; is_active: boolean };
type CartLine = { product_id: string; quantity: number };
const money = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n) || 0);
const isCentralAdmin = (p: Profile | null) => Boolean(p && ["owner", "admin"].includes(p.role));

export default function OfflineStorePOSPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [storeId, setStoreId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [search, setSearch] = useState("");
  const [quantityToAdd, setQuantityToAdd] = useState("1");
  const [payment, setPayment] = useState("cash");
  const [discountPercent, setDiscountPercent] = useState("0");
  const [cashReceived, setCashReceived] = useState("");
  const [discountLimit, setDiscountLimit] = useState(5);
  const [loading, setLoading] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [lastSaleCode, setLastSaleCode] = useState("");

  const centralAdmin = isCentralAdmin(profile);
  const membership = memberships.find((m) => m.store_id === storeId && m.is_active);
  const canCashier = Boolean(centralAdmin || (membership && ["manager", "store_admin", "cashier"].includes(membership.store_role)));
  const currentStore = stores.find((s) => s.id === storeId) || null;
  const activeProducts = useMemo(() => products.filter((p) => p.is_active), [products]);
  const filteredProducts = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("id-ID");
    return activeProducts.filter((p) => !term || [p.name, p.sku, p.barcode_value || ""].some((v) => v.toLocaleLowerCase("id-ID").includes(term)));
  }, [activeProducts, search]);
  const cartRows = useMemo(() => cart.map((line) => {
    const product = activeProducts.find((p) => p.id === line.product_id);
    return product ? { ...line, product, lineTotal: Number(product.sale_price) * line.quantity } : null;
  }).filter((line): line is CartLine & { product: Product; lineTotal: number } => line !== null), [cart, activeProducts]);
  const subtotal = cartRows.reduce((sum, line) => sum + line.lineTotal, 0);
  const discountAmount = subtotal * Math.min(100, Math.max(0, Number(discountPercent) || 0)) / 100;
  const total = Math.max(0, subtotal - discountAmount);
  const changeDue = Math.max(0, (Number(cashReceived) || 0) - total);

  const loadProducts = useCallback(async (id: string, role: string | undefined) => {
    if (!id) { setProducts([]); return; }
    setLoadingProducts(true);
    const defaultDiscountLimit = ["manager", "store_admin"].includes(role || "") ? 15 : 5;
    setDiscountLimit(defaultDiscountLimit);
    const [productResult, policyResult] = await Promise.all([
      supabase.from("offline_store_products").select("id,store_id,name,sku,barcode_value,unit,sale_price,current_stock,is_active").eq("store_id", id).eq("is_active", true).order("name"),
      supabase.from("offline_store_discount_policies").select("cashier_max_percent,manager_max_percent").eq("store_id", id).maybeSingle()
    ]);
    if (productResult.error) setError(productResult.error.message);
    else setProducts((productResult.data || []) as Product[]);
    if (policyResult.data) {
      const limit = ["manager", "store_admin"].includes(role || "") ? Number(policyResult.data.manager_max_percent) : Number(policyResult.data.cashier_max_percent);
      setDiscountLimit(Number.isFinite(limit) ? limit : defaultDiscountLimit);
    }
    setLoadingProducts(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setLoading(true); setError("");
      const { data: authData, error: authError } = await supabase.auth.getSession();
      if (cancelled) return;
      if (authError || !authData.session) { setSession(null); setProfile(null); setLoading(false); return; }
      setSession(authData.session);
      const { data: p, error: profileError } = await supabase.from("profiles").select("id,email,full_name,role,is_active").eq("id", authData.session.user.id).maybeSingle();
      if (cancelled) return;
      if (profileError || !p || !p.is_active) { setError(profileError?.message || "Akun tidak aktif atau profil tidak dapat dibaca."); setLoading(false); return; }
      setProfile(p as Profile);
      const [storeResult, memberResult] = await Promise.all([
        supabase.from("offline_stores").select("id,store_code,name,is_active").eq("is_active", true).order("name"),
        supabase.from("offline_store_memberships").select("store_id,store_role,is_active").eq("user_id", p.id).eq("is_active", true)
      ]);
      if (cancelled) return;
      if (storeResult.error) setError(storeResult.error.message);
      else {
        const visible = (storeResult.data || []) as Store[];
        const activeMemberships = (memberResult.data || []) as Membership[];
        setStores(visible); setMemberships(activeMemberships);
        const allowed = ["owner", "admin"].includes(p.role) ? visible : visible.filter((s) => activeMemberships.some((m) => m.store_id === s.id));
        setStoreId(allowed[0]?.id || "");
        if (!allowed.length) setError("Akun ini belum memiliki penempatan toko yang aktif.");
      }
      if (memberResult.error && !["owner", "admin"].includes(p.role)) setError(memberResult.error.message);
      setLoading(false);
    }
    void initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (storeId && profile) {
      const role = memberships.find((m) => m.store_id === storeId && m.is_active)?.store_role;
      void loadProducts(storeId, centralAdmin ? "manager" : role);
    }
  }, [storeId, profile, memberships, centralAdmin, loadProducts]);

  function addProduct(product: Product) {
    setError(""); setNotice("");
    const amount = Math.max(0.001, Number(quantityToAdd) || 1);
    const existing = cart.find((line) => line.product_id === product.id);
    if (Number(product.current_stock) <= 0) { setError("Stok produk habis."); return; }
    if ((existing?.quantity || 0) + amount > Number(product.current_stock)) { setError("Jumlah melebihi stok tersedia untuk " + product.name + "."); return; }
    setCart((current) => existing
      ? current.map((line) => line.product_id === product.id ? { ...line, quantity: line.quantity + amount } : line)
      : [...current, { product_id: product.id, quantity: amount }]);
    setQuantityToAdd("1");
  }

  function updateQuantity(productId: string, value: string) {
    const quantity = Number(value);
    if (!Number.isFinite(quantity) || quantity <= 0) { setCart((current) => current.filter((line) => line.product_id !== productId)); return; }
    const product = activeProducts.find((p) => p.id === productId);
    if (product && quantity > Number(product.current_stock)) { setError("Jumlah tidak boleh melebihi stok tersedia."); return; }
    setError("");
    setCart((current) => current.map((line) => line.product_id === productId ? { ...line, quantity } : line));
  }

  async function checkout(event: FormEvent) {
    event.preventDefault();
    if (!storeId || !canCashier || !cartRows.length || busy) return;
    const discount = Number(discountPercent) || 0;
    if (discount < 0 || discount > discountLimit) { setError("Diskon manual maksimal " + discountLimit + "% untuk jabatan Anda."); return; }
    if (payment === "cash" && Number(cashReceived) < total) { setError("Uang diterima belum mencukupi total pembayaran."); return; }
    setBusy(true); setError(""); setNotice("");
    const saleCode = "POS-" + Date.now().toString(36).toUpperCase();
    try {
      const result = await supabase.rpc("complete_offline_store_sale", {
        p_store_id: storeId, p_sale_code: saleCode,
        p_items: cartRows.map((line) => ({ store_product_id: line.product_id, quantity: line.quantity })),
        p_payment_method: payment, p_discount_percent: discount
      });
      if (result.error) throw result.error;
      setLastSaleCode(saleCode);
      setNotice("Penjualan berhasil disimpan. Stok dan harga pokok diperbarui oleh sistem.");
      setCart([]); setDiscountPercent("0"); setCashReceived("");
      await loadProducts(storeId, centralAdmin ? "manager" : membership?.store_role);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Transaksi gagal diproses. Silakan coba lagi.");
    } finally { setBusy(false); }
  }

  if (!isSupabaseConfigured) return <main className="pos-page"><section className="panel"><h1>Kasir / POS</h1><p>Konfigurasi Supabase belum tersedia.</p></section></main>;
  if (loading) return <main className="pos-page"><section className="panel"><p>Menyiapkan ruang kasir…</p></section></main>;
  if (!session || !profile) return <main className="pos-page"><section className="panel"><h1>Kasir / POS</h1><p>Silakan login dari aplikasi utama terlebih dahulu.</p><Link className="btn btn-primary" href="/">Kembali ke aplikasi</Link></section></main>;

  return <main className="pos-page">
    <header className="pos-header">
      <div className="pos-brand"><div className="pos-brand-mark" aria-hidden="true"><svg viewBox="0 0 48 48" width="42" height="42" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"><path d="M24 3L43 14L24 25L5 14Z"/><path d="M5 21L24 32L43 21M5 29L24 40L43 29"/></svg></div><div><div className="eyebrow">NDRAAAID</div><h1>Kasir / POS</h1><p className="subtle">Halaman khusus transaksi agar kasir tetap fokus.</p></div></div>
      <div className="pos-header-actions">
        {stores.length > 1 && <label className="pos-store-select"><span>Toko aktif</span><select value={storeId} onChange={(e) => { setStoreId(e.target.value); setCart([]); setLastSaleCode(""); }}><option value="">Pilih toko</option>{stores.filter((s) => centralAdmin || memberships.some((m) => m.store_id === s.id && m.is_active)).map((s) => <option key={s.id} value={s.id}>{s.store_code} — {s.name}</option>)}</select></label>}
        <Link className="btn" href="/offline-store"> Kembali ke modul toko</Link>
      </div>
    </header>
    {notice && <div className="info-box" role="status">{notice}{lastSaleCode && <strong className="pos-receipt-code"> · Kode: {lastSaleCode}</strong>}</div>}
    {error && <div className="error-box" role="alert">{error}</div>}
    {!canCashier && currentStore && <div className="error-box">Akun ini tidak memiliki hak kasir untuk toko yang dipilih.</div>}
    {currentStore && canCashier && <div className="pos-workspace">
      <section className="pos-catalog panel">
        <div className="pos-section-head"><div><div className="eyebrow">{currentStore.store_code}</div><h2>{currentStore.name}</h2><p className="subtle">Cari atau scan produk, lalu masukkan beberapa produk ke satu order.</p></div><span className="status">{activeProducts.length} produk</span></div>
        <div className="pos-search-row">
          <label className="field pos-search"><span>Cari / scan produk</span><input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { const code = search.trim().toLocaleLowerCase("id-ID"); const match = activeProducts.find((p) => p.sku.toLocaleLowerCase("id-ID") === code || (p.barcode_value || "").toLocaleLowerCase("id-ID") === code); if (match) { event.preventDefault(); addProduct(match); setSearch(""); } } }} placeholder="Nama produk, SKU, atau barcode…" /></label>
          <label className="field pos-add-quantity"><span>Jumlah</span><input type="number" min="0.001" step="0.001" value={quantityToAdd} onChange={(e) => setQuantityToAdd(e.target.value)} /></label>
        </div>
        {loadingProducts ? <p className="subtle">Memuat produk…</p> : filteredProducts.length === 0 ? <div className="pos-empty">Produk tidak ditemukan. Pastikan produk aktif dan memiliki stok.</div> : <div className="pos-product-grid">
          {filteredProducts.map((p) => {
            const inCart = cart.find((line) => line.product_id === p.id)?.quantity || 0;
            const available = Number(p.current_stock);
            return <button key={p.id} type="button" className="pos-product-card" disabled={available <= 0 || !canCashier || busy} onClick={() => addProduct(p)}>
              <span className="pos-product-sku">{p.sku}</span><strong>{p.name}</strong><span className="pos-product-price">{money(Number(p.sale_price))}</span>
              <span className={available <= 3 ? "pos-stock low" : "pos-stock"}>Stok {available.toLocaleString("id-ID")} {p.unit}</span>
              {inCart > 0 && <span className="pos-in-cart">Di order: {inCart.toLocaleString("id-ID")}</span>}
              <span className="pos-add-label">{available <= 0 ? "Stok habis" : "+ Tambahkan"}</span>
            </button>;
          })}
        </div>}
      </section>
      <form className="pos-cart panel" onSubmit={checkout}>
        <div className="pos-section-head"><div><div className="eyebrow">ORDER AKTIF</div><h2>Keranjang belanja</h2><p className="subtle">{cartRows.length} jenis produk · {cartRows.reduce((sum, line) => sum + line.quantity, 0).toLocaleString("id-ID")} unit</p></div><button type="button" className="btn btn-compact" disabled={!cart.length || busy} onClick={() => { setCart([]); setError(""); }}>Kosongkan</button></div>
        {!cartRows.length ? <div className="pos-cart-empty"><span aria-hidden="true"><svg viewBox="0 0 40 40" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8H10L14 27H31L35 13H12"/><circle cx="17" cy="33" r="2"/><circle cx="29" cy="33" r="2"/></svg></span><strong>Belum ada produk</strong><p className="subtle">Pilih satu atau beberapa produk.</p></div> : <div className="pos-cart-lines">
          {cartRows.map((line) => <article className="pos-cart-line" key={line.product_id}>
            <div className="pos-cart-product"><strong>{line.product.name}</strong><span>{money(Number(line.product.sale_price))} / {line.product.unit}</span></div>
            <div className="pos-quantity-control"><button type="button" aria-label={"Kurangi " + line.product.name} onClick={() => updateQuantity(line.product_id, String(line.quantity - 1))} disabled={busy}>−</button><input aria-label={"Jumlah " + line.product.name} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(e) => updateQuantity(line.product_id, e.target.value)} disabled={busy}/><button type="button" aria-label={"Tambah " + line.product.name} onClick={() => updateQuantity(line.product_id, String(line.quantity + 1))} disabled={busy || line.quantity >= Number(line.product.current_stock)}>+</button></div>
            <strong className="pos-line-total">{money(line.lineTotal)}</strong><button type="button" className="pos-remove" aria-label={"Hapus " + line.product.name} onClick={() => setCart((current) => current.filter((item) => item.product_id !== line.product_id))} disabled={busy}>Hapus</button>
          </article>)}
        </div>}
        <div className="pos-checkout-fields">
          <label className="field"><span>Diskon manual seluruh order (%)</span><input type="number" min="0" max={discountLimit} step="0.01" value={discountPercent} onChange={(e) => setDiscountPercent(e.target.value)} disabled={busy}/><small className="subtle">Maksimal sesuai jabatan: {discountLimit}%. Promo aktif tetap divalidasi sistem.</small></label>
          <label className="field"><span>Metode pembayaran</span><select value={payment} onChange={(e) => setPayment(e.target.value)} disabled={busy}><option value="cash">Tunai</option><option value="bank_transfer">Transfer bank</option><option value="e_wallet">E-wallet</option><option value="card">Kartu</option><option value="other">Lainnya</option></select></label>
          {payment === "cash" && <label className="field"><span>Uang diterima (Rp)</span><input type="number" min={total} step="1" value={cashReceived} onChange={(e) => setCashReceived(e.target.value)} placeholder="Masukkan uang dari pelanggan" disabled={busy}/><small className="subtle">Kembalian perkiraan: {money(changeDue)}</small></label>}
        </div>
        <div className="pos-totals"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Diskon manual</span><strong>− {money(discountAmount)}</strong></div><div className="pos-grand-total"><span>Total sementara</span><strong>{money(total)}</strong></div><p className="subtle">Total final dapat menyesuaikan promo aktif yang divalidasi server saat checkout.</p></div>
        <button type="submit" className="btn btn-primary pos-checkout-button" disabled={busy || !canCashier || !cartRows.length || loadingProducts}>{busy ? "Memproses pembayaran…" : "✓ Selesaikan checkout"}</button>
        <p className="pos-safe-note">Stok dan harga pokok hanya diperbarui setelah server menerima transaksi.</p>
      </form>
    </div>}
    {!currentStore && <section className="panel"><h2>Toko belum tersedia</h2><p className="subtle">Pastikan akun memiliki penempatan toko aktif dan hak akses kasir.</p><Link className="btn" href="/offline-store">Buka modul toko</Link></section>}
  </main>;
}
