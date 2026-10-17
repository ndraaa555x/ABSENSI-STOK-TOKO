"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, CreditCard, Minus, Plus, ReceiptText, RefreshCw, Search, ShoppingBag, Trash2 } from "lucide-react";
import { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Profile = { id:string; email:string; full_name:string|null; role:string; is_active:boolean };
type Store = { id:string; store_code:string; name:string; is_active:boolean };
type Membership = { id:string; store_id:string; user_id:string; store_role:string; is_active:boolean };
type Product = { id:string; store_id:string; name:string; sku:string; barcode_value:string|null; unit:string; sale_price:number; current_stock:number; is_active:boolean };
type CartLine = { product_id:string; quantity:number };
type Sale = { id:string; sale_code:string; total:number; discount_total:number; payment_method:string; created_at:string; status:string };

const money=(n:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0);
const dateLabel=(v:string)=>new Date(v).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"});

export default function CashierWorkspacePage(){
 const [session,setSession]=useState<Session|null>(null);
 const [profile,setProfile]=useState<Profile|null>(null);
 const [stores,setStores]=useState<Store[]>([]);
 const [memberships,setMemberships]=useState<Membership[]>([]);
 const [storeId,setStoreId]=useState("");
 const [products,setProducts]=useState<Product[]>([]);
 const [sales,setSales]=useState<Sale[]>([]);
 const [cart,setCart]=useState<CartLine[]>([]);
 const [search,setSearch]=useState("");
 const [discount,setDiscount]=useState("0");
 const [payment,setPayment]=useState("cash");
 const [cashReceived,setCashReceived]=useState("");
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("");
 const [error,setError]=useState("");
 const [cashierMax,setCashierMax]=useState(5);
 const [managerMax,setManagerMax]=useState(15);
 const [lastSale,setLastSale]=useState<Sale|null>(null);
 const isAdmin=profile?.role==="owner"||profile?.role==="admin";
 const membership=memberships.find(m=>m.store_id===storeId&&m.user_id===profile?.id&&m.is_active);
 const isManager=isAdmin||membership?.store_role==="manager";
 const canSell=Boolean(isAdmin||membership&&["manager","store_admin","cashier"].includes(membership.store_role));
 const activeStore=stores.find(s=>s.id===storeId);
 const activeProducts=useMemo(()=>products.filter(p=>p.is_active&&Number(p.current_stock)>0),[products]);
 const filteredProducts=useMemo(()=>activeProducts.filter(p=>[p.name,p.sku,p.barcode_value||""].join(" ").toLowerCase().includes(search.trim().toLowerCase())),[activeProducts,search]);
 const cartDetails=useMemo(()=>cart.map(line=>{const product=activeProducts.find(p=>p.id===line.product_id)||products.find(p=>p.id===line.product_id);return product?{...line,product,lineTotal:Number(product.sale_price)*line.quantity}:null;}).filter((x):x is CartLine&{product:Product;lineTotal:number}=>Boolean(x)),[cart,activeProducts,products]);
 const subtotal=cartDetails.reduce((sum,line)=>sum+line.lineTotal,0);
 const discountPercent=Math.max(0,Number(discount)||0);
 const discountTotal=Math.round(subtotal*discountPercent/100);
 const total=Math.max(0,subtotal-discountTotal);
 const change=Math.max(0,(Number(cashReceived)||0)-total);
 const maxDiscount=isManager?managerMax:cashierMax;

 const loadWorkspace=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const {data:auth}=await supabase.auth.getSession();
   if(!auth.session){setSession(null);setProfile(null);setLoading(false);return;}
   setSession(auth.session);
   const {data:p,error:profileError}=await supabase.from("profiles").select("id,email,full_name,role,is_active").eq("id",auth.session.user.id).maybeSingle();
   if(profileError||!p||!p.is_active){setError(profileError?.message||"Akun tidak aktif atau profil tidak dapat dibaca.");setLoading(false);return;}
   setProfile(p as Profile);
   const [storeResult,memberResult]=await Promise.all([
    supabase.from("offline_stores").select("id,store_code,name,is_active").eq("is_active",true).order("name"),
    supabase.from("offline_store_memberships").select("id,store_id,user_id,store_role,is_active").eq("user_id",p.id).eq("is_active",true)
   ]);
   if(storeResult.error)throw storeResult.error;
   if(memberResult.error&&!["owner","admin"].includes(p.role))throw memberResult.error;
   const allStores=(storeResult.data||[]) as Store[];
   const membershipsData=(memberResult.data||[]) as Membership[];
   setMemberships(membershipsData);
   const allowedStores=["owner","admin"].includes(p.role)?allStores:allStores.filter(s=>membershipsData.some(m=>m.store_id===s.id&&["manager","store_admin","cashier"].includes(m.store_role)));
   setStores(allowedStores);
   setStoreId(prev=>allowedStores.some(s=>s.id===prev)?prev:(allowedStores[0]?.id||""));
  }catch(e){setError(e instanceof Error?e.message:"Gagal memuat ruang kerja kasir.");}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void loadWorkspace();const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>{if(!next){setSession(null);setProfile(null);}});return()=>subscription.unsubscribe();},[loadWorkspace]);

 const loadStoreData=useCallback(async()=>{
  if(!storeId||!profile)return;
  setError("");
  const [productResult,saleResult,policyResult]=await Promise.all([
   supabase.from("offline_store_products").select("id,store_id,name,sku,barcode_value,unit,sale_price,current_stock,is_active").eq("store_id",storeId).eq("is_active",true).order("name"),
   supabase.from("offline_store_sales").select("id,sale_code,total,discount_total,payment_method,created_at,status").eq("store_id",storeId).order("created_at",{ascending:false}).limit(8),
   supabase.from("offline_store_discount_policies").select("cashier_max_percent,manager_max_percent").eq("store_id",storeId).maybeSingle()
  ]);
  if(productResult.error)setError(productResult.error.message);else setProducts((productResult.data||[]) as Product[]);
  if(saleResult.error)setError(saleResult.error.message);else setSales((saleResult.data||[]) as Sale[]);
  if(policyResult.data){setCashierMax(Number(policyResult.data.cashier_max_percent)||0);setManagerMax(Number(policyResult.data.manager_max_percent)||0);}
 },[storeId,profile]);
 useEffect(()=>{void loadStoreData();},[loadStoreData]);

 function addProduct(p:Product){setCart(prev=>{const existing=prev.find(x=>x.product_id===p.id);if(existing)return prev.map(x=>x.product_id===p.id?{...x,quantity:Math.min(Number(p.current_stock),x.quantity+1)}:x);return [...prev,{product_id:p.id,quantity:1}];});setNotice("");}
 function changeQuantity(id:string,quantity:number){const p=products.find(x=>x.id===id);if(quantity<=0){setCart(prev=>prev.filter(x=>x.product_id!==id));return;}setCart(prev=>prev.map(x=>x.product_id===id?{...x,quantity:Math.min(Number(p?.current_stock)||quantity,quantity)}:x));}
 async function checkout(e:FormEvent){
  e.preventDefault();setNotice("");setError("");
  if(!storeId||!canSell){setError("Akun ini tidak memiliki hak kasir pada toko yang dipilih.");return;}
  if(!cartDetails.length){setError("Tambahkan produk ke keranjang sebelum menyelesaikan transaksi.");return;}
  if(cartDetails.some(line=>line.quantity<=0||line.quantity>Number(line.product.current_stock))){setError("Jumlah keranjang melebihi stok tersedia.");return;}
  if(discountPercent>maxDiscount){setError("Diskon melebihi batas jabatan ("+maxDiscount+"%).");return;}
  if(payment==="cash"&&(Number(cashReceived)||0)<total){setError("Uang diterima belum cukup untuk membayar total transaksi.");return;}
  setBusy(true);
  try{
   const code="POS-"+new Date().toISOString().replace(/[-:TZ.]/g,"").slice(0,14)+"-"+Math.random().toString(36).slice(2,5).toUpperCase();
   const result=await supabase.rpc("complete_offline_store_sale",{p_store_id:storeId,p_sale_code:code,p_items:cartDetails.map(line=>({store_product_id:line.product_id,quantity:line.quantity})),p_payment_method:payment,p_discount_percent:discountPercent});
   if(result.error)throw result.error;
   setNotice("Transaksi berhasil disimpan. Stok toko diperbarui oleh sistem.");
   setCart([]);setDiscount("0");setPayment("cash");setCashReceived("");
   await loadStoreData();
   const {data:latest}=await supabase.from("offline_store_sales").select("id,sale_code,total,discount_total,payment_method,created_at,status").eq("store_id",storeId).eq("sale_code",code).maybeSingle();
   if(latest)setLastSale(latest as Sale);
  }catch(e){setError(e instanceof Error?e.message:"Transaksi gagal diproses.");}
  finally{setBusy(false);}
 }
 async function printReceipt(s:Sale){
  const {data:detail,error:detailError}=await supabase.from("offline_store_sales").select("id,sale_code,total,discount_total,payment_method,created_at,offline_store_sale_items(product_name,quantity,unit_price,line_total)").eq("id",s.id).maybeSingle();
  if(detailError){setError("Rincian struk tidak dapat dibaca: "+detailError.message);return;}
  const esc=(v:unknown)=>String(v??"—").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
  const w=window.open("","_blank","width=460,height=700");if(!w){setError("Izinkan pop-up browser untuk mencetak struk.");return;}
  const items=(detail?.offline_store_sale_items||[]) as Array<{product_name:string;quantity:number;unit_price:number;line_total:number}>;
  const rows=items.map(line=>\`<tr><td>\${esc(line.product_name)} × \${Number(line.quantity)||0}<small style="display:block;color:#666">\${esc(money(Number(line.unit_price)||0))} / unit</small></td><td style="text-align:right">\${esc(money(Number(line.line_total)||0))}</td></tr>\`).join("");
  w.document.write(\`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Struk \${esc(s.sale_code)}</title><style>body{font:12px Arial,sans-serif;color:#222;padding:16px}h2{text-align:center;font-size:17px;margin:0 0 6px}.muted{color:#666;text-align:center}table{width:100%;border-collapse:collapse;margin:16px 0}td{padding:7px 0;border-bottom:1px dashed #ccc;vertical-align:top}.total{display:flex;justify-content:space-between;font-weight:bold;font-size:15px;border-top:1px solid #222;padding-top:10px}button{padding:8px 14px}@media print{button{display:none}}</style></head><body><h2>\${esc(activeStore?.name||"TOKO OFFLINE")}</h2><div class="muted">\${esc(activeStore?.store_code||"")}</div><p>No: <strong>\${esc(s.sale_code)}</strong><br/>Tanggal: \${esc(dateLabel(s.created_at))}<br/>Kasir: \${esc(profile?.full_name||profile?.email||"—")}</p><table>\${rows||"<tr><td>Rincian barang tidak tersedia.</td></tr>"}</table><p>Diskon: \${esc(money(s.discount_total))}</p><div class="total"><span>Total</span><span>\${esc(money(s.total))}</span></div><p>Metode: \${esc(s.payment_method)}</p><p class="muted">Terima kasih atas kunjungan Anda.</p><div style="text-align:center"><button onclick="window.print()">Cetak struk</button></div></body></html>\`);
  w.document.close();
 }
 if(!isSupabaseConfigured)return <main className="main"><section className="panel"><h1>Kasir / POS</h1><p>Konfigurasi Supabase belum tersedia.</p></section></main>;
 if(loading)return <main className="main"><section className="panel"><p>Memuat ruang kerja kasir…</p></section></main>;
 if(!session||!profile)return <main className="main"><section className="panel"><h1>Kasir / POS</h1><p>Silakan login terlebih dahulu.</p><Link className="btn btn-primary" href="/">Kembali ke aplikasi</Link></section></main>;
 return <main className="main" style={{maxWidth:1500,margin:"0 auto",padding:"24px clamp(14px,3vw,34px)"}}>
  <header className="topbar" style={{alignItems:"center",gap:18,flexWrap:"wrap"}}><div><div className="eyebrow">RUANG KERJA KASIR</div><h1 style={{margin:"5px 0"}}>Kasir / POS</h1><p className="subtle">Pilih barang, atur jumlah, terapkan diskon sesuai jabatan, lalu selesaikan pembayaran dalam satu transaksi.</p></div><div className="business-actions"><Link href="/offline-store" className="btn"><ArrowLeft size={16}/> Modul Toko</Link><Link href="/" className="btn">Dashboard</Link></div></header>
  {notice&&<div className="info-box" role="status">{notice}</div>}{error&&<div className="error-box" role="alert"><CircleAlert size={16}/> {error}</div>}
  {stores.length===0?<section className="panel" style={{marginTop:18}}><h2>Toko belum tersedia</h2><p className="subtle">Akun ini belum memiliki penempatan aktif dengan izin Kasir/POS. Minta Owner/Admin atau Manajer Toko memeriksa jabatan dan akses.</p></section>:<>
   {isAdmin&&<section className="panel" style={{marginTop:16}}><div className="field"><label>Toko aktif</label><select value={storeId} onChange={e=>{setStoreId(e.target.value);setCart([]);setLastSale(null);}}>{stores.map(s=><option key={s.id} value={s.id}>{s.store_code} — {s.name}</option>)}</select></div></section>}
   <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,430px),1fr))",gap:18,alignItems:"start",marginTop:18}}>
    <section className="panel" style={{minWidth:0}}><div className="section-head"><div><div className="eyebrow">{activeStore?.store_code||"TOKO"}</div><h2>{activeStore?.name||"Pilih toko"}</h2><p className="subtle">{activeProducts.length} produk tersedia · data stok khusus toko ini</p></div><button className="btn" type="button" onClick={()=>void loadStoreData()}><RefreshCw size={15}/> Muat ulang</button></div>
     <div className="field" style={{position:"relative"}}><label>Cari nama, SKU, atau barcode</label><Search size={16} style={{position:"absolute",left:12,bottom:13,color:"var(--muted,#7c8796)"}}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari atau pindai barcode…" style={{paddingLeft:38}}/></div>
     <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(min(100%,185px),1fr))",gap:10,marginTop:12}}>
      {filteredProducts.map(p=><button key={p.id} type="button" onClick={()=>addProduct(p)} disabled={!canSell} className="panel" style={{textAlign:"left",padding:14,cursor:canSell?"pointer":"not-allowed",border:"1px solid var(--border,#d8dee8)",background:"var(--panel,#fff)",color:"var(--text,#1f2937)"}}><div style={{display:"flex",justifyContent:"space-between",gap:8}}><ShoppingBag size={18}/><span className="trx-tag">{p.current_stock} {p.unit}</span></div><strong style={{display:"block",marginTop:12,overflowWrap:"anywhere"}}>{p.name}</strong><small className="subtle">{p.sku}</small><div style={{fontWeight:750,marginTop:8}}>{money(Number(p.sale_price))}</div><div className="subtle" style={{marginTop:7,fontSize:12}}>Tambah ke keranjang <Plus size={13} style={{verticalAlign:"middle"}}/></div></button>)}
      {filteredProducts.length===0&&<p className="subtle">Tidak ada produk cocok atau stok tersedia habis.</p>}
     </div>
    </section>
    <section className="panel" style={{minWidth:0}}><div className="section-head"><div><div className="eyebrow">CHECKOUT</div><h2>Keranjang transaksi</h2><p className="subtle">{cartDetails.length} jenis produk</p></div><ShoppingBag size={22}/></div>
     {!canSell&&<div className="info-box">Jabatan akun ini belum memiliki hak Kasir/POS pada toko yang dipilih.</div>}
     <form onSubmit={checkout}>
      <div style={{display:"grid",gap:9}}>
       {cartDetails.map(line=><div key={line.product_id} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:10,padding:"12px 0",borderBottom:"1px solid var(--border,#e5e7eb)"}}><div style={{minWidth:0}}><strong style={{overflowWrap:"anywhere"}}>{line.product.name}</strong><div className="subtle">{money(Number(line.product.sale_price))} / {line.product.unit} · stok {line.product.current_stock}</div><div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}><button className="btn btn-compact" type="button" aria-label="Kurangi jumlah" onClick={()=>changeQuantity(line.product_id,line.quantity-1)}><Minus size={14}/></button><strong>{line.quantity}</strong><button className="btn btn-compact" type="button" aria-label="Tambah jumlah" disabled={line.quantity>=Number(line.product.current_stock)} onClick={()=>changeQuantity(line.product_id,line.quantity+1)}><Plus size={14}/></button><button className="btn btn-compact" type="button" onClick={()=>changeQuantity(line.product_id,0)} aria-label="Hapus produk dari keranjang"><Trash2 size={14}/></button></div></div><strong>{money(line.lineTotal)}</strong></div>)}
       {cartDetails.length===0&&<div style={{padding:24,textAlign:"center",border:"1px dashed var(--border,#cbd5e1)",borderRadius:12}}><ShoppingBag size={26}/><p className="subtle">Keranjang masih kosong. Pilih produk di sebelah kiri untuk memulai transaksi.</p></div>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:12,marginTop:16}}><div className="field"><label>Diskon (%) · batas {maxDiscount}%</label><input type="number" min="0" max={maxDiscount} step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)} disabled={!canSell}/></div><div className="field"><label>Metode pembayaran</label><select value={payment} onChange={e=>setPayment(e.target.value)}><option value="cash">Tunai</option><option value="transfer">Transfer</option><option value="qris">QRIS</option></select></div></div>
      {payment==="cash"&&<div className="field"><label>Uang diterima</label><input type="number" min={total} value={cashReceived} onChange={e=>setCashReceived(e.target.value)} placeholder="Masukkan nominal uang"/></div>}
      <div style={{display:"grid",gap:8,background:"var(--soft,#f7f8fa)",padding:14,borderRadius:12,marginTop:12}}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><span className="subtle">Subtotal</span><strong>{money(subtotal)}</strong></div><div style={{display:"flex",justifyContent:"space-between",gap:12}}><span className="subtle">Diskon ({discountPercent}%)</span><strong>− {money(discountTotal)}</strong></div><div style={{display:"flex",justifyContent:"space-between",gap:12,fontSize:19,borderTop:"1px solid var(--border,#d8dee8)",paddingTop:10}}><strong>Total</strong><strong>{money(total)}</strong></div>{payment==="cash"&&<div style={{display:"flex",justifyContent:"space-between",gap:12}}><span className="subtle">Kembalian</span><strong>{money(change)}</strong></div>}</div>
      <button className="btn btn-primary" type="submit" disabled={busy||!canSell||!cartDetails.length} style={{width:"100%",justifyContent:"center",marginTop:14,minHeight:46}}><CreditCard size={17}/>{busy?"Memproses transaksi…":"Selesaikan pembayaran"}</button>
     </form>
    </section>
   </div>
   {lastSale&&<section className="panel" style={{marginTop:18}}><div className="section-head"><div><h2>Transaksi berhasil</h2><p className="subtle">{lastSale.sale_code} · {dateLabel(lastSale.created_at)} · {money(lastSale.total)}</p></div><button className="btn btn-primary" type="button" onClick={()=>printReceipt(lastSale)}><ReceiptText size={16}/> Cetak struk</button></div></section>}
   <section className="panel" style={{marginTop:18}}><div className="section-head"><div><h2>Transaksi terbaru</h2><p className="subtle">Riwayat lengkap terpusat tetap tersedia di TRX.</p></div><Link className="btn" href={"/trx"+(storeId?"?storeId="+encodeURIComponent(storeId):"")}>Buka TRX</Link></div>
    {sales.length===0?<p className="subtle">Belum ada transaksi pada toko ini.</p>:<div style={{display:"grid",gap:8}}>{sales.map(s=><div key={s.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,flexWrap:"wrap",borderBottom:"1px solid var(--border,#e5e7eb)",padding:"10px 0"}}><div><strong>{s.sale_code}</strong><div className="subtle">{dateLabel(s.created_at)} · {s.payment_method} · {s.status}</div></div><div style={{display:"flex",alignItems:"center",gap:10}}><strong>{money(Number(s.total))}</strong><button className="btn btn-compact" type="button" onClick={()=>printReceipt(s)} title="Cetak struk"><ReceiptText size={15}/></button></div></div>)}</div>}
   </section>
  </>}
 </main>;
}
