"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const pagerStyle:React.CSSProperties={padding:"7px 10px",border:"1px solid #334155",borderRadius:7,background:"#172338",color:"#e5e7eb",cursor:"pointer",fontSize:13};
type Product = { id: string; name: string; sku: string; barcode_value: string | null; is_active: boolean };
const L = ["0001101","0011001","0010011","0111101","0100011","0110001","0101111","0111011","0110111","0001011"];
const G = ["0100111","0110011","0011011","0100001","0011101","0111001","0000101","0010001","0001001","0010111"];
const R = ["1110010","1100110","1101100","1000010","1011100","1001110","1010000","1000100","1001000","1110100"];
const PARITY = ["LLLLLL","LLGLGG","LLGGLG","LLGGGL","LGLLGG","LGGLLG","LGGGLL","LGLGLG","LGLGGL","LGGLGL"];
function validEan13(value: string) {
  if (!/^\\d{13}$/.test(value)) return false;
  const sum = value.slice(0, 12).split("").reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - sum % 10) % 10 === Number(value[12]);
}
function ean13Bits(value: string) {
  if (!validEan13(value)) return null;
  let bits = "101";
  const parity = PARITY[Number(value[0])];
  for (let i = 1; i <= 6; i++) bits += (parity[i - 1] === "L" ? L : G)[Number(value[i])];
  bits += "01010";
  for (let i = 7; i <= 12; i++) bits += R[Number(value[i])];
  return bits + "101";
}
function Barcode({ value }: { value: string }) {
  const bits = ean13Bits(value);
  if (!bits) return <div style={{padding:12,background:"#fff7ed",color:"#9a3412",borderRadius:6,fontSize:13}}>Barcode belum valid. Isi kode EAN-13 sebanyak 13 digit dengan angka pemeriksa yang benar. SKU tetap bisa dipakai untuk pencarian.</div>;
  return <svg role="img" aria-label={"Barcode EAN-13 " + value} viewBox="0 0 115 62" style={{width:"100%",height:124,shapeRendering:"crispEdges"}}><rect width="115" height="62" fill="white"/>{bits.split("").map((bit,index)=>bit==="1"?<rect key={index} x={10+index} y={index<3||index>=92||(index>=45&&index<50)?2:5} width="1" height={index<3||index>=92||(index>=45&&index<50)?48:42} fill="black"/>:null)}<text x="57.5" y="59" textAnchor="middle" fontSize="5" fill="black">{value}</text></svg>;
}
export default function BarcodePage() {
  const [rows, setRows] = useState<Product[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page,setPage]=useState(1); const pageSize=20;
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error } = await supabase.from("products").select("id,name,sku,barcode_value,is_active").eq("is_active", true).order("name");
    if (error) setError(error.message); else setRows((data || []) as Product[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const filtered = rows.filter(p => [p.name, p.sku, p.barcode_value || ""].some(v => v.toLowerCase().includes(q.toLowerCase()))); const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize)); const visible=filtered.slice((page-1)*pageSize,page*pageSize);
  return <main style={{minHeight:"100vh",background:"#0b1220",color:"#e5e7eb",padding:24,fontFamily:"Arial,sans-serif"}}><div style={{maxWidth:1100,margin:"0 auto"}}><header style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}><div><p style={{color:"#93c5fd"}}>NDRANEXA BUSINESS PLATFORM</p><h1>Barcode Produk</h1><p style={{color:"#9ca3af"}}>Cari produk dan cetak label EAN-13 yang valid.</p></div><Link href="/" style={{color:"#bfdbfe"}}>← Dashboard</Link></header>{error&&<p role="alert" style={{background:"#451a1a",padding:12,borderRadius:8}}>{error}</p>}<input aria-label="Cari produk" placeholder="Cari nama, SKU, barcode…" value={q} onChange={e=>{setQ(e.target.value);setPage(1)}} style={{width:"100%",boxSizing:"border-box",padding:12,margin:"20px 0",borderRadius:8,border:"1px solid #334155",background:"#111c2e",color:"#fff"}}/>{loading?<p>Memuat…</p>:<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(min(100%,240px),1fr))",gap:14}}>{visible.map(p=><article key={p.id} style={{background:"#fff",color:"#111827",borderRadius:10,padding:16,breakInside:"avoid"}}><strong>{p.name}</strong><p style={{margin:"6px 0",color:"#4b5563"}}>SKU: {p.sku}</p><Barcode value={(p.barcode_value||"").trim()}/><div style={{textAlign:"center",fontFamily:"monospace",marginTop:4}}>{p.barcode_value||"Belum ada barcode"}</div><button onClick={()=>window.print()} className="no-print" style={{marginTop:12,width:"100%",padding:9,border:0,borderRadius:6,background:"#1d4ed8",color:"#fff",cursor:"pointer"}}>Cetak label</button></article>)}</div>}{!loading&&!filtered.length&&<p>Tidak ada produk.</p>}{!loading&&filtered.length>0&&<nav aria-label="Halaman barcode" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,flexWrap:"wrap",padding:"18px 0"}}><button type="button" disabled={page===1} onClick={()=>setPage(v=>Math.max(1,v-1))} style={pagerStyle}>‹ Sebelumnya</button>{Array.from({length:pageCount},(_,i)=>i+1).map(n=><button type="button" key={n} aria-current={page===n?"page":undefined} onClick={()=>setPage(n)} style={{...pagerStyle,background:page===n?"#2563eb":"#172338"}}>{n}</button>)}<button type="button" disabled={page===pageCount} onClick={()=>setPage(v=>Math.min(pageCount,v+1))} style={pagerStyle}>Berikutnya ›</button><small style={{width:"100%",textAlign:"center",color:"#9ca3af"}}>Menampilkan {(page-1)*pageSize+1}–{Math.min(page*pageSize,filtered.length)} dari {filtered.length} produk · Maksimal 20 per halaman</small></nav>}<style jsx global>{`@media print{body{background:white!important}main{background:white!important;color:black!important;padding:0!important}header,input,.no-print{display:none!important}article{border:1px solid #aaa;page-break-inside:avoid}}`}</style></div></main>;
}
