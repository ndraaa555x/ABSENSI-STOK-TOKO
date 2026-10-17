"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Session } from "@supabase/supabase-js";
import { ArrowLeftRight, RefreshCw, Search, ClipboardList, ShieldCheck } from "lucide-react";
import { IconClockHour4 } from "@tabler/icons-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Item={id:string;code:string;kind:string;title:string;detail:string;status:string;at:string|null;actor:string;origin:string};
const money=(n:number)=>new Intl.NumberFormat("id-ID",{style:"currency",currency:"IDR",maximumFractionDigits:0}).format(Number(n)||0);
const fmt=(v:string|null)=>v?new Date(v).toLocaleString("id-ID",{dateStyle:"medium",timeStyle:"short"}):"—";
const label=(v:string)=>String(v||"—").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default function TrxPage(){
 const router=useRouter();
 const [session,setSession]=useState<Session|null>(null);
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [items,setItems]=useState<Item[]>([]);
 const [errors,setErrors]=useState<string[]>([]);
 const [search,setSearch]=useState("");
 const [kind,setKind]=useState("all");
 const [status,setStatus]=useState("all");
 const [from,setFrom]=useState("");
 const [to,setTo]=useState("");
 const load=useCallback(async()=>{
  setRefreshing(true);
  const [orders,refunds,reports,attendance,leaves,movements,finances,submissions,receipts,sales,storeFinances]=await Promise.all([
   supabase.from("product_orders").select("id,order_code,status,notes,created_at,ordered_by,ordered_by_profile:profiles!product_orders_ordered_by_fkey(full_name,email)").order("created_at",{ascending:false}).limit(300),
   supabase.from("product_refunds").select("id,refund_code,status,reason,amount,created_at,requested_by,requested_by_profile:profiles!product_refunds_requested_by_fkey(full_name,email)").order("created_at",{ascending:false}).limit(300),
   supabase.from("financial_reports").select("id,report_code,report_type,status,description,amount,created_at,submitted_by,submitted_by_profile:profiles!financial_reports_submitted_by_fkey(full_name,email)").order("created_at",{ascending:false}).limit(300),
   supabase.from("attendance_records").select("id,work_date,check_in_at,check_out_at,status,notes,recorded_by,employees(full_name,employee_code)").order("work_date",{ascending:false}).limit(300),
   supabase.from("leave_requests").select("id,leave_type,start_date,end_date,reason,status,created_at,employees(full_name,employee_code)").order("created_at",{ascending:false}).limit(300),
   supabase.from("stock_movements").select("id,movement_type,quantity,reason,reference_code,movement_at,created_by,products(name,sku)").order("movement_at",{ascending:false}).limit(300),
   supabase.from("financial_transactions").select("id,transaction_code,transaction_type,amount,description,status,transaction_at,created_by").order("transaction_at",{ascending:false}).limit(300),
   supabase.from("offline_product_submissions").select("id,proposed_name,proposed_sku,proposed_category_name,status,review_note,requested_at,requested_by").order("requested_at",{ascending:false}).limit(300),
   supabase.from("offline_stock_receipts").select("id,receipt_code,status,supplier_name,created_at").order("created_at",{ascending:false}).limit(300),
   supabase.from("offline_store_sales").select("id,sale_code,subtotal,discount_total,total,payment_method,cashier_id,created_at,status").order("created_at",{ascending:false}).limit(300),
   supabase.from("offline_store_finance_entries").select("id,entry_type,amount,payment_method,description,reference_code,created_at").order("created_at",{ascending:false}).limit(300)
  ]);
  const next:Item[]=[];
  const actor=(p:any,id:any)=>p?.full_name||p?.email||(id?String(id).slice(0,8):"Tidak tercatat");
  (orders.data||[]).forEach((r:any)=>next.push({id:"order-"+r.id,code:r.order_code||r.id,kind:"Order",title:"Order produk",detail:r.notes||"Permintaan/order produk",status:r.status||"—",at:r.created_at,actor:actor(r.ordered_by_profile,r.ordered_by),origin:"Kantor"}));
  (refunds.data||[]).forEach((r:any)=>next.push({id:"refund-"+r.id,code:r.refund_code||r.id,kind:"Refund",title:"Pengajuan refund",detail:(r.reason||"Tanpa alasan")+(r.amount!=null?" · "+money(r.amount):""),status:r.status||"—",at:r.created_at,actor:actor(r.requested_by_profile,r.requested_by),origin:"Kantor"}));
  (reports.data||[]).forEach((r:any)=>next.push({id:"report-"+r.id,code:r.report_code||r.id,kind:"Laporan uang",title:r.report_type==="expense"?"Laporan uang keluar":"Laporan uang masuk",detail:(r.description||"Tanpa keterangan")+" · "+money(r.amount),status:r.status||"—",at:r.created_at,actor:actor(r.submitted_by_profile,r.submitted_by),origin:"Kantor"}));
  (attendance.data||[]).forEach((r:any)=>next.push({id:"attendance-"+r.id,code:"ABS-"+String(r.id).slice(0,8),kind:"Absensi",title:r.employees?.full_name||"Catatan absensi",detail:[r.work_date,r.check_in_at?"Masuk "+new Date(r.check_in_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}):"",r.check_out_at?"Pulang "+new Date(r.check_out_at).toLocaleTimeString("id-ID",{hour:"2-digit",minute:"2-digit"}):"",r.notes].filter(Boolean).join(" · "),status:r.status||"—",at:r.check_in_at||r.work_date,actor:actor(null,r.recorded_by),origin:"Kehadiran"}));
  (leaves.data||[]).forEach((r:any)=>next.push({id:"leave-"+r.id,code:"IZIN-"+String(r.id).slice(0,8),kind:"Izin/Cuti",title:r.employees?.full_name||"Permohonan karyawan",detail:[label(r.leave_type),r.start_date+" s.d. "+r.end_date,r.reason].filter(Boolean).join(" · "),status:r.status||"—",at:r.created_at,actor:r.employees?.full_name||"Tidak tercatat",origin:"Kehadiran"}));
  (movements.data||[]).forEach((r:any)=>next.push({id:"stock-"+r.id,code:r.reference_code||"STK-"+String(r.id).slice(0,8),kind:"Stok",title:r.products?.name||"Pergerakan stok",detail:[label(r.movement_type),"Jumlah "+r.quantity,r.reason].filter(Boolean).join(" · "),status:"Tercatat",at:r.movement_at,actor:actor(null,r.created_by),origin:"Inventaris"}));
  (finances.data||[]).forEach((r:any)=>next.push({id:"finance-"+r.id,code:r.transaction_code||r.id,kind:"Keuangan",title:r.transaction_type==="income"?"Uang masuk":"Uang keluar",detail:(r.description||"Tanpa keterangan")+" · "+money(r.amount),status:r.status||"—",at:r.transaction_at,actor:actor(null,r.created_by),origin:"Keuangan"}));
  (submissions.data||[]).forEach((r:any)=>next.push({id:"submission-"+r.id,code:"PRODUK-"+String(r.id).slice(0,8),kind:"Pengajuan produk toko",title:r.proposed_name||"Pengajuan produk",detail:[r.proposed_sku,r.proposed_category_name,r.review_note].filter(Boolean).join(" · "),status:r.status||"—",at:r.requested_at,actor:actor(null,r.requested_by),origin:"Toko offline"}));
  (receipts.data||[]).forEach((r:any)=>next.push({id:"receipt-"+r.id,code:r.receipt_code||r.id,kind:"Penerimaan stok toko",title:"Penerimaan barang",detail:r.supplier_name||"Pemasok tidak dicatat",status:r.status||"—",at:r.created_at,actor:"Catatan toko",origin:"Toko offline"}));
  (sales.data||[]).forEach((r:any)=>next.push({id:"sale-"+r.id,code:r.sale_code||r.id,kind:"Penjualan toko",title:"Penjualan kasir",detail:"Total "+money(r.total)+" · Diskon "+money(r.discount_total)+" · "+label(r.payment_method),status:r.status||"—",at:r.created_at,actor:actor(null,r.cashier_id),origin:"Toko offline"}));
  (storeFinances.data||[]).forEach((r:any)=>next.push({id:"store-finance-"+r.id,code:r.reference_code||"TOKO-"+String(r.id).slice(0,8),kind:"Keuangan toko",title:label(r.entry_type),detail:(r.description||"Tanpa keterangan")+" · "+money(r.amount)+(r.payment_method?" · "+label(r.payment_method):""),status:"Tercatat",at:r.created_at,actor:"Catatan toko",origin:"Toko offline"}));
  setItems(next.sort((a,b)=>new Date(b.at||0).getTime()-new Date(a.at||0).getTime()));
  setErrors([orders,refunds,reports,attendance,leaves,movements,finances,submissions,receipts,sales,storeFinances].filter((x:any)=>x.error).map((x:any)=>x.error.message||"Sebagian sumber tidak dapat dibaca."));
  setRefreshing(false);setLoading(false);
 },[]);
 useEffect(()=>{let alive=true;supabase.auth.getSession().then(({data})=>{if(!alive)return;if(!data.session){router.replace("/");return;}setSession(data.session);void load();});const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setSession(s);if(!s)router.replace("/");});return()=>{alive=false;subscription.unsubscribe();};},[load,router]);
 const kinds=useMemo(()=>Array.from(new Set(items.map(i=>i.kind))).sort(),[items]);
 const filtered=useMemo(()=>items.filter(i=>(kind==="all"||i.kind===kind)&&(status==="all"||i.status===status)&&(!from||String(i.at||"").slice(0,10)>=from)&&(!to||String(i.at||"").slice(0,10)<=to)&&[i.code,i.kind,i.title,i.detail,i.status,i.actor,i.origin].join(" ").toLowerCase().includes(search.toLowerCase())),[items,kind,status,from,to,search]);
 const statuses=useMemo(()=>Array.from(new Set(items.map(i=>i.status))).sort(),[items]);
 return <main className="trx-shell">
  <header className="trx-hero"><div><div className="trx-kicker">Workspace · Riwayat terpusat</div><h1 className="trx-title">TRX & Aktivitas</h1><p className="trx-subtitle">Satu tempat untuk menelusuri transaksi, pengajuan, persetujuan, kehadiran, stok, dan keuangan. Sumber data tidak dihapus; hasil yang tampil mengikuti izin baca akun Anda.</p></div><div className="trx-icon-box"><ArrowLeftRight size={23}/></div></header>
  {errors.length>0&&<div className="info-box" role="status">Sebagian sumber riwayat tidak tersedia untuk akun ini atau dibatasi kebijakan akses. Data yang berhasil dibaca tetap ditampilkan.</div>}
  <section className="trx-toolbar" aria-label="Filter riwayat">
   <div style={{position:"relative"}}><Search size={15} style={{position:"absolute",left:10,top:12,color:"#94a3b8"}}/><input style={{paddingLeft:32}} aria-label="Cari TRX" placeholder="Cari kode, keterangan, pembuat…" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <select aria-label="Jenis riwayat" value={kind} onChange={e=>setKind(e.target.value)}><option value="all">Semua jenis</option>{kinds.map(k=><option key={k} value={k}>{k}</option>)}</select>
   <select aria-label="Status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">Semua status</option>{statuses.map(s=><option key={s} value={s}>{label(s)}</option>)}</select>
   <button className="btn" type="button" onClick={()=>{setFrom("");setTo("");setSearch("");setKind("all");setStatus("all");}}><RefreshCw size={14}/> Reset</button>
   <label style={{display:"flex",alignItems:"center",gap:7,fontSize:11,color:"#94a3b8"}}>Dari <input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
   <label style={{display:"flex",alignItems:"center",gap:7,fontSize:11,color:"#94a3b8"}}>Sampai <input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
  </section>
  <div className="trx-summary"><span>{loading?"Memuat riwayat…":filtered.length+" catatan"} {refreshing&&!loading?"· memperbarui":""}</span><span><ShieldCheck size={13} style={{verticalAlign:"middle",marginRight:5}}/>Akses data mengikuti kebijakan akun dan database</span></div>
  <div className="trx-table-wrap"><table className="trx-table"><colgroup><col style={{width:"16%"}}/><col style={{width:"15%"}}/><col style={{width:"29%"}}/><col style={{width:"10%"}}/><col style={{width:"15%"}}/><col style={{width:"15%"}}/></colgroup><thead><tr><th>Kode / Waktu</th><th>Jenis</th><th>Detail aktivitas</th><th>Status</th><th>Dibuat / dicatat oleh</th><th>Sumber</th></tr></thead><tbody>
  {loading?<tr><td colSpan={6} className="trx-empty">Memuat data riwayat…</td></tr>:filtered.length===0?<tr><td colSpan={6} className="trx-empty"><ClipboardList size={25}/><p>Tidak ada riwayat yang cocok dengan filter.</p></td></tr>:filtered.map(i=><tr key={i.id}><td><div className="trx-primary">{i.code}</div><div className="trx-secondary"><IconClockHour4 size={12} style={{verticalAlign:"middle",marginRight:4}}/>{fmt(i.at)}</div></td><td><span className="trx-tag">{i.kind}</span></td><td><div className="trx-primary">{i.title}</div><div className="trx-secondary">{i.detail||"Tidak ada keterangan tambahan"}</div></td><td><span className="trx-tag">{label(i.status)}</span></td><td>{i.actor||"Tidak tercatat"}</td><td><span className="trx-secondary">{i.origin}</span></td></tr>)}
  </tbody></table></div>
  <footer className="trx-footer">Data ditampilkan dari catatan sumber yang dapat dibaca oleh sesi Anda. Tindakan persetujuan atau perubahan data tetap dilakukan dari modul kerja yang sesuai; TRX menjadi pusat penelusuran, bukan pengganti alur kerja.</footer>
  <div style={{marginTop:14}}><Link className="btn" href="/"><ArrowLeftRight size={14}/> Kembali ke workspace</Link></div>
 </main>;
}
