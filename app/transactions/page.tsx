"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase row shapes are validated against the database schema during load. */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type Role = "owner" | "admin" | "hrd" | "employee";
type Profile = { id: string; full_name: string | null; role: Role; is_active: boolean };
type TrxCategory = "Pesanan" | "Refund" | "Pengajuan Toko" | "Produk Toko" | "Penerimaan Stok" | "Penjualan Toko" | "Aktivitas Sistem" | "Keuangan" | "Stok" | "Absensi" | "Cuti";
type TrxStatus = "Menunggu" | "Belum diproses" | "Diproses" | "Menunggu persetujuan" | "Disetujui" | "Ditolak" | "Selesai" | "Perlu diperiksa" | "Kendala";
type Trx = {
  id: string;
  code: string;
  category: TrxCategory;
  activity: string;
  location: string;
  storeId?: string | null;
  status: TrxStatus;
  createdAt: string;
  actor: string;
  ownerId: string | null;
  handlerId?: string | null;
  reviewerId?: string | null;
  reviewedBy?: string;
  processedBy: string;
  amount?: number | null;
  paidAmount?: number | null;
  dueAmount?: number | null;
  description?: string | null;
  sourceStatus: string;
  sourceTable: "product_orders" | "product_refunds" | "financial_reports" | "financial_transactions" | "offline_store_purchase_orders" | "offline_product_submissions" | "offline_stock_receipts" | "offline_store_sales" | "offline_store_finance_entries" | "audit_logs" | "stock_movements" | "attendance_records" | "leave_requests";
};

const PAGE_SIZE = 20;
const CATEGORIES = ["Semua", "Pesanan", "Refund", "Pengajuan Toko", "Produk Toko", "Penerimaan Stok", "Penjualan Toko", "Aktivitas Sistem", "Keuangan", "Stok", "Absensi", "Cuti"] as const;
const VIEWS = ["Perlu Ditindaklanjuti", "Tugas Saya", "Selesai", "Semua Transaksi"] as const;
const money = (value: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
const dateTime = (value: string) => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const normalize = (value: unknown) => String(value ?? "").trim().toLowerCase();
async function readAllRows(table: string, columns: string, orderColumn?: string) {
  const client = supabase as any;
  const rows: any[] = [];
  let offset = 0;
  const batchSize = 1000;
  while (offset < 50000) {
    let query = client.from(table).select(columns);
    if (orderColumn) query = query.order(orderColumn, { ascending: false });
    const { data, error } = await query.range(offset, offset + batchSize - 1);
    if (error) return { data: null, error };
    rows.push(...(data ?? []));
    if (!data || data.length < batchSize) break;
    offset += batchSize;
  }
  return { data: rows, error: null };
}

const isOpenStatus = (row: Trx) => {
  const s = normalize(row.sourceStatus);
  if (row.category === "Pesanan") return ["pending", "approved", "menunggu", "disetujui"].includes(s);
  if (row.category === "Refund") return ["pending", "under_review", "requested", "approved", "menunggu", "disetujui"].includes(s);
  if (row.category === "Pengajuan Toko") return ["requested", "shipped", "pending", "diproses", "dikirim"].includes(s) || (s === "received" && Number(row.dueAmount || 0) > 0);
  if (row.category === "Produk Toko") return ["pending", "requested", "submitted", "under_review", "needs_revision", "perlu_perbaikan"].includes(s);
  if (row.category === "Penerimaan Stok") return ["pending", "requested", "draft", "processing"].includes(s);
  if (row.category === "Cuti" || row.category === "Keuangan") return ["pending", "requested", "submitted", "menunggu", "pending_approval"].includes(s);
  return false;
};

function statusLabel(status: string, category: TrxCategory): TrxStatus {
  const s = normalize(status);
  if (["rejected", "declined", "denied", "ditolak"].includes(s)) return "Ditolak";
  if (["approved", "disetujui"].includes(s)) return category === "Refund" ? "Diproses" : "Disetujui";
  if (["completed", "complete", "fulfilled", "received", "paid", "posted", "closed", "selesai", "dipenuhi", "diterima", "lunas"].includes(s)) return "Selesai";
  if (["processing", "in_progress", "shipped", "shipping", "diproses", "dikirim"].includes(s)) return "Diproses";
  if (["requested", "pending", "waiting", "submitted", "menunggu", "pending_approval"].includes(s)) return ["Pengajuan Toko", "Penerimaan Stok"].includes(category) ? "Belum diproses" : "Menunggu persetujuan";
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
  const [storeMemberships, setStoreMemberships] = useState<{store_id:string;store_role:string;user_id?:string}[]>([]);
  const [teamMemberships, setTeamMemberships] = useState<{store_id:string;store_role:string;user_id?:string}[]>([]);
  const [rows, setRows] = useState<Trx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState<string>("Semua");
  const [viewFilter, setViewFilter] = useState<(typeof VIEWS)[number]>("Perlu Ditindaklanjuti");
  const [statusFilter, setStatusFilter] = useState("all");
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
    const errors: string[] = [];
    const { data: memberRows, error: memberError } = await supabase.from("offline_store_memberships").select("store_id,user_id,store_role").eq("user_id", current.id).eq("is_active", true);
    if (memberError) errors.push("keanggotaan toko");
    const ownMemberships = (memberRows || []) as {store_id:string;store_role:string;user_id?:string}[];
    setStoreMemberships(ownMemberships);
    let teamRows = ownMemberships;
    if (ownMemberships.length && !["owner","admin"].includes(current.role)) {
      const storeIds = ownMemberships.map((m) => m.store_id);
      const { data, error: teamError } = await supabase.from("offline_store_memberships").select("store_id,user_id,store_role").in("store_id", storeIds).eq("is_active", true);
      if (teamError) errors.push("anggota tim toko");
      if (data?.length) teamRows = data as {store_id:string;store_role:string;user_id?:string}[];
    }
    setTeamMemberships(teamRows);
    const result: Trx[] = [];
    const [orders, orderItems, refunds, reports, ledger, requests, purchaseItems, submissions, receipts, receiptItems, sales, saleItems, storeLedger, movements, attendance, leaves, stores, employees, people, products, storeProducts] = await Promise.all([
      readAllRows("product_orders", "id,order_code,status,ordered_by,reviewed_by,requested_at,created_at,notes", "created_at"),
      readAllRows("product_order_items", "id,order_id,product_id,quantity,unit_price,line_total", "created_at"),
      readAllRows("product_refunds", "id,refund_code,order_id,requested_by,reviewed_by,status,amount,reason,created_at", "created_at"),
      readAllRows("financial_reports", "id,report_code,report_type,amount,description,status,submitted_by,reviewed_by,posted_transaction_id,created_at", "created_at"),
      readAllRows("financial_transactions", "id,transaction_code,transaction_type,amount,description,status,created_by,transaction_at,created_at,reference_code", "transaction_at"),
      readAllRows("offline_store_purchase_orders", "id,order_code,store_id,status,subtotal,paid_amount,notes,requested_by,reviewed_by,shipped_by,received_by,requested_at,created_at", "created_at"),
      readAllRows("offline_store_purchase_items", "id,order_id,central_product_id,store_product_id,quantity_requested,quantity_shipped,quantity_received,unit_cost,line_total", "created_at"),
      readAllRows("offline_product_submissions", "id,store_id,proposed_name,proposed_category_name,status,review_note,requested_by,reviewed_by,requested_at,reviewed_at,created_product_id,created_store_product_id", "requested_at"),
      readAllRows("offline_stock_receipts", "id,store_id,receipt_code,status,supplier_name,notes,received_by,received_at,created_by,created_at", "created_at"),
      readAllRows("offline_stock_receipt_items", "id,receipt_id,store_product_id,quantity,unit_cost", "created_at"),
      readAllRows("offline_store_sales", "id,store_id,sale_code,subtotal,discount_total,total,payment_method,status,cashier_id,created_at", "created_at"),
      readAllRows("offline_store_sale_items", "id,sale_id,store_product_id,product_name,quantity,unit_price,discount_amount,line_total"),
      readAllRows("offline_store_finance_entries", "id,store_id,order_id,entry_type,amount,payment_method,description,reference_code,created_by,created_at", "created_at"),
      readAllRows("stock_movements", "id,movement_type,quantity,reference_code,reason,notes,movement_at,created_by", "movement_at"),
      readAllRows("attendance_records", "id,employee_id,work_date,status,check_in_at,check_out_at,recorded_by,created_at", "created_at"),
      readAllRows("leave_requests", "id,employee_id,leave_type,start_date,end_date,reason,status,reviewed_by,created_at", "created_at"),
      readAllRows("offline_stores", "id,name,store_code"),
      readAllRows("employees", "id,full_name,profile_id"),
      readAllRows("profiles", "id,full_name,role"),
      readAllRows("products", "id,name,sku"),
      readAllRows("offline_store_products", "id,store_id,name,sku")
    ]);

    const addError = (label: string, response: { error: { message: string } | null }) => { if (response.error) errors.push(label); };
    addError("pesanan", orders); addError("detail pesanan", orderItems); addError("katalog produk", products); addError("produk toko", storeProducts); addError("refund", refunds); addError("laporan keuangan", reports); addError("buku besar", ledger); addError("pengajuan toko", requests); addError("detail pembelian toko", purchaseItems); addError("pengajuan produk toko", submissions); addError("penerimaan stok", receipts); addError("detail penerimaan stok", receiptItems); addError("penjualan toko", sales); addError("detail penjualan toko", saleItems); addError("keuangan toko", storeLedger); addError("stok", movements); addError("absensi", attendance); addError("cuti", leaves);
    const personNames = new Map<string, string>();
    (people.data ?? []).forEach((p: any) => personNames.set(p.id, p.full_name || p.role || "Akun"));
    const employeeNames = new Map<string, string>();
    const employeeProfileIds = new Map<string, string>();
    (employees.data ?? []).forEach((e: any) => {
      employeeNames.set(e.id, e.full_name || "Karyawan");
      if (e.profile_id) {
        employeeProfileIds.set(e.id, e.profile_id);
        if (e.full_name) personNames.set(e.profile_id, e.full_name);
      }
    });
    const storeNames = new Map<string, string>();
    (stores.data ?? []).forEach((s: any) => storeNames.set(s.id, s.name || s.store_code || "Toko Offline"));
    const productNames = new Map<string, string>();
    (products.data ?? []).forEach((p: any) => productNames.set(p.id, p.name || p.sku || "Produk"));
    const storeProductNames = new Map<string, string>();
    (storeProducts.data ?? []).forEach((p: any) => storeProductNames.set(p.id, p.name || p.sku || "Produk toko"));
    const groupLines = (items: any[], key: string, format: (item: any) => string) => {
      const grouped = new Map<string, string[]>();
      items.forEach((item) => { const list = grouped.get(item[key]) || []; list.push(format(item)); grouped.set(item[key], list); });
      return grouped;
    };
    const orderLines = groupLines(orderItems.data ?? [], "order_id", (i) => `${productNames.get(i.product_id) || "Produk"} × ${i.quantity} (${money(Number(i.line_total || 0))})`);
    const purchaseLines = groupLines(purchaseItems.data ?? [], "order_id", (i) => `${productNames.get(i.central_product_id) || "Produk"} × ${i.quantity_requested} · dikirim ${i.quantity_shipped} · diterima ${i.quantity_received} · modal/unit ${money(Number(i.unit_cost || 0))}`);
    const receiptLines = groupLines(receiptItems.data ?? [], "receipt_id", (i) => `${storeProductNames.get(i.store_product_id) || "Produk toko"} × ${i.quantity} · modal/unit ${money(Number(i.unit_cost || 0))}`);
    const saleLines = groupLines(saleItems.data ?? [], "sale_id", (i) => `${i.product_name || storeProductNames.get(i.store_product_id) || "Produk"} × ${i.quantity} · diskon ${money(Number(i.discount_amount || 0))}`);

    (orders.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.order_code || `ORD-${r.id.slice(0, 8)}`, category: "Pesanan",
      activity: "Pesanan produk", location: "Kantor Pusat", status: statusLabel(r.status, "Pesanan"),
      createdAt: r.created_at || r.requested_at, actor: personNames.get(r.ordered_by) || "Akun tidak diketahui",
      ownerId: r.ordered_by || null, handlerId: r.reviewed_by || null, reviewerId: r.reviewed_by || null, reviewedBy: personNames.get(r.reviewed_by) || "Belum disetujui", processedBy: personNames.get(r.reviewed_by) || "Belum ditangani", description: [r.notes || "", ...(orderLines.get(r.id) || [])].filter(Boolean).join(" · "), sourceStatus: r.status, sourceTable: "product_orders"
    }));
    (refunds.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.refund_code || `REF-${r.id.slice(0, 8)}`, category: "Refund",
      activity: "Permintaan pengembalian dana", location: "Kantor Pusat", status: statusLabel(r.status, "Refund"),
      createdAt: r.created_at, actor: personNames.get(r.requested_by) || "Akun tidak diketahui",
      ownerId: r.requested_by || null, handlerId: r.reviewed_by || null, reviewerId: r.reviewed_by || null, reviewedBy: personNames.get(r.reviewed_by) || "Belum disetujui", processedBy: personNames.get(r.reviewed_by) || "Belum ditangani", amount: Number(r.amount || 0), description: r.reason, sourceStatus: r.status, sourceTable: "product_refunds"
    }));
    (reports.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.report_code || `FIN-${r.id.slice(0, 8)}`, category: "Keuangan",
      activity: r.report_type === "income" ? "Laporan pemasukan" : r.report_type === "expense" ? "Laporan pengeluaran" : "Laporan keuangan",
      location: "Kantor Pusat", status: r.posted_transaction_id ? "Selesai" : statusLabel(r.status, "Keuangan"), createdAt: r.created_at,
      actor: personNames.get(r.submitted_by) || "Akun tidak diketahui", ownerId: r.submitted_by || null, handlerId: r.reviewed_by || null, reviewerId: r.reviewed_by || null, reviewedBy: personNames.get(r.reviewed_by) || "Belum disetujui", processedBy: personNames.get(r.reviewed_by) || "Belum ditangani",
      amount: Number(r.amount || 0), description: r.description, sourceStatus: r.posted_transaction_id ? "posted" : r.status, sourceTable: "financial_reports"
    }));
    (ledger.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.transaction_code || `LED-${r.id.slice(0, 8)}`, category: "Keuangan",
      activity: r.transaction_type === "income" ? "Transaksi uang masuk" : "Transaksi uang keluar", location: "Buku Besar Kantor",
      status: statusLabel(r.status, "Keuangan"), createdAt: r.transaction_at || r.created_at,
      actor: personNames.get(r.created_by) || "Akun tidak diketahui", ownerId: r.created_by || null,
      processedBy: personNames.get(r.created_by) || "—", amount: Number(r.amount || 0),
      description: [r.description, r.reference_code ? `Referensi: ${r.reference_code}` : ""].filter(Boolean).join(" · "),
      sourceStatus: r.status, sourceTable: "financial_transactions"
    }));
    (submissions.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: `PROD-${r.id.slice(0, 8).toUpperCase()}`, category: "Produk Toko", storeId: r.store_id,
      activity: `Pengajuan produk toko: ${r.proposed_name || "Produk baru"}`, location: storeNames.get(r.store_id) || "Toko Offline",
      status: statusLabel(r.status, "Produk Toko"), createdAt: r.requested_at, actor: personNames.get(r.requested_by) || "Akun tidak diketahui",
      ownerId: r.requested_by || null, handlerId: r.reviewed_by || null, reviewerId: r.reviewed_by || null, reviewedBy: personNames.get(r.reviewed_by) || "Belum disetujui", processedBy: personNames.get(r.reviewed_by) || "Belum ditangani",
      description: [r.proposed_category_name ? `Kategori: ${r.proposed_category_name}` : "", r.review_note || ""].filter(Boolean).join(" · "),
      sourceStatus: r.status, sourceTable: "offline_product_submissions"
    }));
    (receipts.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.receipt_code || `RCV-${r.id.slice(0, 8).toUpperCase()}`, category: "Penerimaan Stok", storeId: r.store_id,
      activity: `Penerimaan stok${r.supplier_name ? ` dari ${r.supplier_name}` : ""}`, location: storeNames.get(r.store_id) || "Toko Offline",
      status: statusLabel(r.status, "Penerimaan Stok"), createdAt: r.received_at || r.created_at,
      actor: personNames.get(r.created_by) || "Akun tidak diketahui", ownerId: r.created_by || null, handlerId: r.received_by || null,
      processedBy: personNames.get(r.received_by) || "Belum diterima", description: [r.notes || "", ...(receiptLines.get(r.id) || [])].filter(Boolean).join(" · "), sourceStatus: r.status, sourceTable: "offline_stock_receipts"
    }));
    (sales.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.sale_code || `SALE-${r.id.slice(0, 8).toUpperCase()}`, category: "Penjualan Toko", storeId: r.store_id,
      activity: "Penjualan toko offline", location: storeNames.get(r.store_id) || "Toko Offline", status: statusLabel(r.status, "Penjualan Toko"), createdAt: r.created_at,
      actor: personNames.get(r.cashier_id) || "Kasir", ownerId: r.cashier_id || null, handlerId: r.cashier_id || null, processedBy: personNames.get(r.cashier_id) || "Kasir",
      amount: Number(r.total || 0), description: [`Subtotal ${money(Number(r.subtotal || 0))}`, `Diskon ${money(Number(r.discount_total || 0))}`, `Metode ${r.payment_method || "—"}`, ...(saleLines.get(r.id) || [])].join(" · "),
      sourceStatus: r.status, sourceTable: "offline_store_sales"
    }));
    (storeLedger.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.reference_code || `SFIN-${r.id.slice(0, 8).toUpperCase()}`, category: "Keuangan", storeId: r.store_id,
      activity: r.entry_type === "purchase_expense" ? "Beban pembelian stok toko" : "Pembayaran toko ke kantor",
      location: storeNames.get(r.store_id) || "Toko Offline", status: "Selesai", createdAt: r.created_at,
      actor: personNames.get(r.created_by) || "Akun tidak diketahui", ownerId: r.created_by || null, handlerId: r.created_by || null,
      processedBy: personNames.get(r.created_by) || "—", amount: Number(r.amount || 0),
      description: [r.description, r.payment_method ? `Metode: ${r.payment_method}` : "", r.order_id ? `Order: ${r.order_id.slice(0, 8)}` : ""].filter(Boolean).join(" · "),
      sourceStatus: "posted", sourceTable: "offline_store_finance_entries"
    }));
    (requests.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.order_code || `PO-${r.id.slice(0, 8)}`, category: "Pengajuan Toko", storeId: r.store_id,
      activity: "Pengajuan pembelian barang dari toko", location: storeNames.get(r.store_id) || "Toko Offline",
      status: r.status === "received" && Number(r.paid_amount || 0) < Number(r.subtotal || 0) ? "Diproses" : statusLabel(r.status, "Pengajuan Toko"), paidAmount: Number(r.paid_amount || 0), dueAmount: Math.max(0, Number(r.subtotal || 0) - Number(r.paid_amount || 0)), createdAt: r.created_at || r.requested_at,
      actor: personNames.get(r.requested_by) || "Akun tidak diketahui", ownerId: r.requested_by || null, handlerId: r.received_by || r.shipped_by || r.reviewed_by || null, reviewerId: r.reviewed_by || null, reviewedBy: personNames.get(r.reviewed_by) || "Belum disetujui", processedBy: personNames.get(r.received_by || r.shipped_by || r.reviewed_by) || "Belum ditangani",
      amount: Number(r.subtotal || 0), description: [r.notes || "", ...(purchaseLines.get(r.id) || []), r.status === "received" ? `Pembayaran: ${money(Number(r.paid_amount || 0))} dari ${money(Number(r.subtotal || 0))}` : ""].filter(Boolean).join(" · "), sourceStatus: r.status, sourceTable: "offline_store_purchase_orders"
    }));
    if (current.role === "owner") {
      const { data: auditRows, error: auditError } = await readAllRows("audit_logs", "id,actor_id,action,entity_table,entity_id,details,created_at", "created_at");
      if (auditError) errors.push("audit sistem");
      (auditRows ?? []).forEach((r: any) => result.push({
        id: String(r.id), code: `AUD-${String(r.id).slice(0, 8).toUpperCase()}`, category: "Aktivitas Sistem",
        activity: String(r.action || "Aktivitas sistem").replaceAll("_", " "), location: String(r.entity_table || "Sistem"),
        status: "Selesai", createdAt: r.created_at, actor: personNames.get(r.actor_id) || "Akun tidak diketahui", ownerId: r.actor_id || null,
        handlerId: r.actor_id || null, processedBy: personNames.get(r.actor_id) || "—",
        description: `${r.entity_table || "Data"} · ${r.entity_id || "Tanpa ID"} · ${typeof r.details === "string" ? r.details : JSON.stringify(r.details || {})}`,
        sourceStatus: "logged", sourceTable: "audit_logs"
      }));
    }
    (movements.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: r.reference_code || `STK-${r.id.slice(0, 8)}`, category: "Stok",
      activity: `Pergerakan stok: ${String(r.movement_type || "perubahan").replaceAll("_", " ")}`, location: "Kantor Pusat",
      status: "Selesai", createdAt: r.movement_at || r.created_at,
      actor: personNames.get(r.created_by) || "Akun tidak diketahui", ownerId: r.created_by || null, processedBy: personNames.get(r.created_by) || "—",
      description: r.reason || r.notes, sourceStatus: r.movement_type || "recorded", sourceTable: "stock_movements"
    }));
    (attendance.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: `ABS-${String(r.work_date || "").replaceAll("-", "")}-${r.id.slice(0, 4).toUpperCase()}`, category: "Absensi",
      activity: `Catatan absensi: ${r.status || "tercatat"}`, location: "Lokasi kerja",
      status: "Selesai", createdAt: r.created_at || r.check_in_at || r.work_date,
      actor: employeeNames.get(r.employee_id) || "Karyawan", ownerId: employeeProfileIds.get(r.employee_id) || null, handlerId: r.recorded_by || null, processedBy: personNames.get(r.recorded_by) || "—",
      description: r.work_date ? `Tanggal kerja ${r.work_date}` : "", sourceStatus: r.status, sourceTable: "attendance_records"
    }));
    (leaves.data ?? []).forEach((r: any) => result.push({
      id: r.id, code: `CUT-${r.id.slice(0, 8).toUpperCase()}`, category: "Cuti",
      activity: `Pengajuan ${r.leave_type || "izin/cuti"}`, location: "Kantor / penempatan kerja",
      status: statusLabel(r.status, "Cuti"), createdAt: r.created_at,
      actor: employeeNames.get(r.employee_id) || "Karyawan", ownerId: employeeProfileIds.get(r.employee_id) || null, handlerId: r.reviewed_by || null, reviewerId: r.reviewed_by || null, reviewedBy: personNames.get(r.reviewed_by) || "Belum diputuskan", processedBy: personNames.get(r.reviewed_by) || "Belum diputuskan",
      description: `${r.start_date || "—"} s.d. ${r.end_date || "—"} · ${r.reason || "Tanpa catatan"}`, sourceStatus: r.status, sourceTable: "leave_requests"
    }));

    if (errors.length) setError(`Sebagian data tidak dapat dibaca: ${errors.join(", ")}. Daftar yang berhasil dibaca tetap ditampilkan; akses database perlu diperiksa untuk kelengkapan penuh.`);
    setRows(result.filter((r) => Boolean(r.createdAt)).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    setLoading(false);
  }, []);

  useEffect(() => { if (isSupabaseConfigured) void load(); else { setError("Koneksi database belum dikonfigurasi."); setLoading(false); } }, [load, refresh]);

  const canViewRow = useCallback((r: Trx) => {
    if (!profile) return false;
    if (profile.role === "owner" || profile.role === "admin") return true;
    if (profile.role === "hrd") return ["Absensi", "Cuti"].includes(r.category) && (r.ownerId === profile.id || r.category === "Absensi" || r.category === "Cuti");
    const assignedStoreIds = new Set(storeMemberships.map((m) => m.store_id));
    const hasStoreScope = assignedStoreIds.size > 0;
    if (hasStoreScope) {
      if (r.storeId && assignedStoreIds.has(r.storeId)) return true;
      if (["Absensi", "Cuti"].includes(r.category) && r.ownerId && teamMemberships.some((m) => m.user_id === r.ownerId)) return true;
      return false;
    }
    return r.ownerId === profile.id && ["Pesanan", "Refund", "Keuangan", "Absensi", "Cuti"].includes(r.category);
  }, [profile, storeMemberships, teamMemberships]);
  const visibleRows = useMemo(() => {
    const q = normalize(search);
    return rows.filter((r) => {
      const categoryOk = category === "Semua" || r.category === category;
      const viewOk = viewFilter === "Perlu Ditindaklanjuti" ? isOpenStatus(r)
         : viewFilter === "Tugas Saya" ? ((["owner","admin"].includes(profile?.role ?? "") && isOpenStatus(r) && ["Pesanan","Refund","Pengajuan Toko","Produk Toko","Keuangan"].includes(r.category) && ["pending","requested","under_review"].includes(normalize(r.sourceStatus))) || r.ownerId === profile?.id || r.handlerId === profile?.id || Boolean(r.storeId && storeMemberships.some((m) => m.store_id === r.storeId && ((r.sourceTable === "offline_store_purchase_orders" && ((r.sourceStatus === "shipped" && ["manager","store_admin","inventory"].includes(m.store_role)) || (r.sourceStatus === "received" && Number(r.dueAmount || 0) > 0 && ["manager","store_admin"].includes(m.store_role)))) || (r.sourceTable === "offline_stock_receipts" && r.sourceStatus === "pending" && ["manager","store_admin","inventory"].includes(m.store_role))))))
        : viewFilter === "Selesai" ? r.status === "Selesai" : true;
      const statusOk = statusFilter === "all" || r.status === statusFilter;
      const permissionOk = canViewRow(r);
      const searchOk = !q || [r.code, r.category, r.activity, r.location, r.actor, r.status, r.description].some((v) => normalize(v).includes(q));
      return categoryOk && viewOk && statusOk && permissionOk && searchOk;
    });
  }, [rows, category, viewFilter, profile, statusFilter, search, canViewRow, storeMemberships]);
  const openRows = useMemo(() => rows.filter((r) => canViewRow(r) && isOpenStatus(r)), [rows, canViewRow]);
  const pendingApproval = useMemo(() => rows.filter((r) => canViewRow(r) && ["Menunggu", "Menunggu persetujuan", "Belum diproses", "Perlu diperiksa"].includes(r.status)), [rows, canViewRow]);
  const pages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pageRows = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [category, viewFilter, statusFilter, search]);


  async function processSelected(action: "approve" | "reject" | "fulfill" | "ship" | "receive" | "pay" | "revise") {
    if (!selected || !profile || loading) return;
    const canAdmin = profile.role === "owner" || profile.role === "admin";
    const canReviewLeave = canAdmin || profile.role === "hrd";
    const selectedMembership = selected.storeId ? storeMemberships.find((m) => m.store_id === selected.storeId) : undefined;
    const canStoreReceive = Boolean(selectedMembership && ["manager","store_admin","inventory"].includes(selectedMembership.store_role));
    const canStorePay = Boolean(selectedMembership && selectedMembership.store_role === "manager");
    const allowed = selected.category === "Cuti" ? canReviewLeave
      : selected.sourceTable === "offline_product_submissions" ? canAdmin
      : selected.sourceTable === "offline_store_purchase_orders" ? (action === "ship" || action === "reject" ? canAdmin : action === "receive" ? canStoreReceive : action === "pay" ? canStorePay : false)
      : selected.sourceTable === "offline_stock_receipts" ? action === "receive" && canStoreReceive
      : canAdmin;
    if (!allowed) return;
    if (action === "reject") {
      const reason = window.prompt("Tuliskan alasan penolakan:");
      if (!reason?.trim()) return;
      if (selected.sourceTable === "offline_store_purchase_orders") {
        const { error: rpcError } = await supabase.rpc("reject_offline_store_purchase", { p_order_id: selected.id, p_reason: reason.trim() });
        if (rpcError) { window.alert("Penolakan gagal: " + rpcError.message); return; }
      } else if (selected.sourceTable === "offline_product_submissions") {
        const { error: rpcError } = await supabase.rpc("review_offline_product_submission", { p_submission_id: selected.id, p_decision: "rejected", p_review_note: reason.trim(), p_create_category: false });
        if (rpcError) { window.alert("Penolakan pengajuan produk gagal: " + rpcError.message); return; }
      } else {
        const { error: updateError } = await supabase.from(selected.sourceTable).update({ status: "rejected", reviewed_by: profile.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", selected.id);
        if (updateError) { window.alert("Penolakan gagal: " + updateError.message); return; }
      }
    } else if (selected.sourceTable === "offline_store_purchase_orders" && action === "receive") {
      const { error: rpcError } = await supabase.rpc("receive_offline_store_purchase", { p_order_id: selected.id });
      if (rpcError) { window.alert("Penerimaan gagal dicatat: " + rpcError.message); return; }
    } else if (selected.sourceTable === "offline_store_purchase_orders" && action === "pay") {
      const amount = Number(window.prompt("Nominal pembayaran (Rp):") || 0);
      if (!Number.isFinite(amount) || amount <= 0) return;
      const method = window.prompt("Metode pembayaran (cash, bank_transfer, e_wallet, other):", "bank_transfer") || "bank_transfer";
      const { error: rpcError } = await supabase.rpc("pay_offline_store_purchase", { p_order_id: selected.id, p_amount: amount, p_payment_method: method });
      if (rpcError) { window.alert("Pembayaran gagal dicatat: " + rpcError.message); return; }
    } else if (selected.sourceTable === "offline_stock_receipts" && action === "receive") {
      const { error: rpcError } = await supabase.rpc("receive_offline_stock", { p_receipt_id: selected.id });
      if (rpcError) { window.alert("Penerimaan stok gagal dicatat: " + rpcError.message); return; }
    } else if (selected.sourceTable === "offline_product_submissions" && (action === "approve" || action === "revise")) {
      const note = action === "revise" ? (window.prompt("Catatan perbaikan yang wajib dilengkapi:") || "").trim() : (window.prompt("Catatan persetujuan (opsional):") || "").trim();
      if (action === "revise" && !note) return;
      const { error: rpcError } = await supabase.rpc("review_offline_product_submission", { p_submission_id: selected.id, p_decision: action === "approve" ? "approved" : "needs_revision", p_review_note: note || null, p_create_category: true });
      if (rpcError) { window.alert("Pengajuan produk gagal diproses: " + rpcError.message); return; }
    } else if (selected.sourceTable === "offline_store_purchase_orders" && action === "ship") {
      const { error: rpcError } = await supabase.rpc("ship_offline_store_purchase", { p_order_id: selected.id });
      if (rpcError) { window.alert("Pengiriman gagal diproses: " + rpcError.message); return; }
    } else if (selected.sourceTable === "product_refunds" && action === "approve") {
      const { error: rpcError } = await supabase.rpc("approve_product_refund", { p_refund_id: selected.id });
      if (rpcError) { window.alert("Refund gagal disetujui: " + rpcError.message); return; }
    } else if (selected.sourceTable === "financial_reports" && action === "approve") {
      const { error: rpcError } = await supabase.rpc("approve_financial_report", { p_report_id: selected.id });
      if (rpcError) { window.alert("Laporan gagal diposting: " + rpcError.message); return; }
    } else if (selected.sourceTable === "product_orders" && action === "fulfill") {
      const { error: rpcError } = await supabase.rpc("fulfill_product_order", { p_order_id: selected.id });
      if (rpcError) { window.alert("Order gagal dipenuhi: " + rpcError.message); return; }
    } else {
      const nextStatus = action === "approve" ? "approved" : "rejected";
      const { error: updateError } = await supabase.from(selected.sourceTable).update({ status: nextStatus, reviewed_by: profile.id, reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", selected.id);
      if (updateError) { window.alert("Status gagal diperbarui: " + updateError.message); return; }
    }
    setSelected(null);
    setRefresh((v) => v + 1);
  }

  const filteredRows = pageRows;

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
        .trx-modal{width:min(560px,100%);max-height:85vh;overflow:auto;background:#101827;border:1px solid #334155;border-radius:14px;padding:18px}.trx-print-signatures{display:none}
        .trx-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}.trx-detail{background:#0b1220;border:1px solid #25334a;border-radius:9px;padding:10px;min-width:0}.trx-detail label{display:block;font-size:10px;color:#91a1b8;margin-bottom:5px}.trx-detail strong{font-size:12px;overflow-wrap:anywhere}
        @media print{body{background:#fff!important}.trx-page>*:not(.trx-modal-backdrop){display:none!important}.trx-modal-backdrop{position:static!important;background:#fff!important;padding:0!important;display:block!important}.trx-modal{width:100%!important;max-height:none!important;overflow:visible!important;border:0!important;border-radius:0!important;background:#fff!important;color:#111!important;box-shadow:none!important}.trx-modal .trx-btn{display:none!important}.trx-modal .trx-muted{color:#444!important}.trx-detail{border:1px solid #bbb!important;background:#fff!important}.trx-print-signatures{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;margin-top:36px;page-break-inside:avoid}.trx-print-signatures div{border-top:1px solid #555;padding-top:8px;min-height:54px}.trx-print-signatures strong{display:block;margin-top:28px}}@media(max-width:720px){.trx-page{padding:15px 10px}.trx-top{align-items:flex-start}.trx-stats{gap:6px}.trx-stat{padding:9px}.trx-stat-value{font-size:19px}.trx-controls{grid-template-columns:1fr 1fr}.trx-controls input{grid-column:1/-1}.trx-table th:nth-child(3),.trx-table td:nth-child(3),.trx-table th:nth-child(5),.trx-table td:nth-child(5){display:none}.trx-table td,.trx-table th{padding:9px 7px}.trx-code{white-space:normal;overflow-wrap:anywhere}.trx-detail-grid{grid-template-columns:1fr 1fr}}
      `}</style>
      <div className="trx-shell">
        <div className="trx-top">
          <div><div className="trx-eyebrow">PUSAT PENGAJUAN & RIWAYAT</div><h1 className="trx-title">Transaksi (TRX)</h1><div className="trx-muted">Semua aktivitas yang diizinkan untuk akun ini, dengan prioritas pengajuan yang masih membutuhkan tindakan.</div></div>
          <div style={{display:"flex",gap:7,flexWrap:"wrap"}}><Link href="/" className="trx-btn">← Dashboard</Link><button className="trx-btn" onClick={() => setRefresh((v) => v + 1)} disabled={loading}>{loading ? "Memuat…" : "↻ Segarkan"}</button></div>
        </div>
        <section className="trx-stats">
          <div className="trx-stat"><div className="trx-stat-label">Belum selesai</div><div className="trx-stat-value">{loading ? "—" : openRows.length}</div><div className="trx-muted">Perlu ditindaklanjuti</div></div>
          <div className="trx-stat"><div className="trx-stat-label">Menunggu persetujuan</div><div className="trx-stat-value">{loading ? "—" : pendingApproval.length}</div><div className="trx-muted">Belum diputuskan</div></div>
          <div className="trx-stat"><div className="trx-stat-label">Total data terbaca</div><div className="trx-stat-value">{loading ? "—" : rows.length}</div><div className="trx-muted">Sumber data yang berhasil dibaca</div></div>
        </section>
        {error && <div role="status" style={{border:"1px solid #92400e",background:"#78350f33",borderRadius:9,padding:10,fontSize:12,marginBottom:12,color:"#fde68a"}}>{error}</div>}
        <div className="trx-cats" aria-label="Tampilan transaksi">{VIEWS.map((item) => <button key={item} className={`trx-cat ${viewFilter === item ? "active" : ""}`} onClick={() => setViewFilter(item)}>{item}</button>)}</div>
        <div className="trx-cats" aria-label="Kategori transaksi">{CATEGORIES.map((item) => <button key={item} className={`trx-cat ${category === item ? "active" : ""}`} onClick={() => setCategory(item)}>{item}</button>)}</div>
        <div className="trx-controls">
          <input className="trx-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari kode, nama, toko, aktivitas…" aria-label="Cari transaksi" />
          <select className="trx-input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter status">
            <option value="all">Semua status</option><option value="Menunggu persetujuan">Menunggu persetujuan</option><option value="Belum diproses">Belum diproses</option><option value="Diproses">Diproses</option><option value="Disetujui">Disetujui</option><option value="Ditolak">Ditolak</option><option value="Selesai">Selesai</option><option value="Perlu diperiksa">Perlu diperiksa</option>
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
        <p className="trx-muted" style={{marginTop:10}}>Data sumber tetap utuh. Tindakan yang tersedia mengikuti status transaksi dan kewenangan akun; riwayat yang tidak dapat dibaca akan ditandai di atas.</p>
      </div>
      {selected && <div className="trx-modal-backdrop" onClick={() => setSelected(null)}><section className="trx-modal" role="dialog" aria-modal="true" aria-label="Detail transaksi" onClick={(e) => e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"flex-start"}}><div><div className="trx-eyebrow">DETAIL TRANSAKSI</div><h2 style={{fontSize:19,margin:"7px 0"}}>{selected.code}</h2><div className="trx-muted">{selected.activity}</div></div><div style={{display:"flex",gap:7,flexWrap:"wrap"}}>{["owner","admin"].includes(profile?.role ?? "") && ["Pesanan","Refund","Pengajuan Toko","Produk Toko","Penerimaan Stok","Penjualan Toko","Keuangan"].includes(selected.category) && <button className="trx-btn" onClick={() => window.print()}>Cetak bukti transaksi</button>}<button className="trx-btn" onClick={() => setSelected(null)}>Tutup</button></div></div>
        <div style={{marginTop:12}}><span className={badgeClass(selected.status)}>{selected.status}</span></div>
        <div className="trx-detail-grid">
          <div className="trx-detail"><label>Kategori</label><strong>{selected.category}</strong></div><div className="trx-detail"><label>Lokasi / penempatan</label><strong>{selected.location}</strong></div>
          <div className="trx-detail"><label>Dibuat / diajukan oleh</label><strong>{selected.actor}</strong></div><div className="trx-detail"><label>Diproses / ditangani oleh</label><strong>{selected.processedBy}</strong></div><div className="trx-detail"><label>Disetujui / diputuskan oleh</label><strong>{selected.reviewedBy || "Belum dicatat"}</strong></div><div className="trx-detail"><label>Waktu tercatat</label><strong>{dateTime(selected.createdAt)}</strong></div>
          <div className="trx-detail"><label>Status pada sumber</label><strong>{selected.sourceStatus || "—"}</strong></div><div className="trx-detail"><label>Nominal</label><strong>{selected.amount != null ? money(selected.amount) : "Tidak berlaku"}</strong></div>
        </div>
        <div className="trx-detail" style={{marginTop:12}}><label>Catatan / rincian</label><strong>{selected.description || "Tidak ada catatan tambahan."}</strong></div>
        <div className="trx-print-signatures"><div>Dibuat oleh<strong>{selected.actor}</strong></div><div>Pelanggan / unit<strong>{selected.location}</strong></div><div>Karyawan<strong>{selected.actor}</strong></div><div>Owner<strong>INDRA SAPUTRA</strong></div></div>
        {((profile?.role === "owner" || profile?.role === "admin") || (profile?.role === "hrd" && selected.category === "Cuti") || (selected.storeId && storeMemberships.some((m) => m.store_id === selected.storeId && (selected.sourceTable === "offline_store_purchase_orders" ? ["manager","store_admin","inventory"].includes(m.store_role) : ["manager","store_admin","inventory"].includes(m.store_role))) && ["offline_store_purchase_orders","offline_stock_receipts"].includes(selected.sourceTable))) && <div style={{display:"flex",gap:7,flexWrap:"wrap",marginTop:14}}>
          {["owner","admin"].includes(profile?.role ?? "") && selected.sourceStatus === "pending" && selected.sourceTable === "product_orders" && <><button className="trx-btn" onClick={() => void processSelected("approve")}>Setujui pesanan</button><button className="trx-btn" onClick={() => void processSelected("reject")}>Tolak</button></> }
          {["owner","admin"].includes(profile?.role ?? "") && ["pending","under_review"].includes(normalize(selected.sourceStatus)) && selected.sourceTable === "product_refunds" && <><button className="trx-btn" onClick={() => void processSelected("approve")}>Setujui refund</button><button className="trx-btn" onClick={() => void processSelected("reject")}>Tolak</button></> }
          {["owner","admin"].includes(profile?.role ?? "") && selected.sourceStatus === "pending" && selected.sourceTable === "financial_reports" && <><button className="trx-btn" onClick={() => void processSelected("approve")}>Setujui & catat</button><button className="trx-btn" onClick={() => void processSelected("reject")}>Tolak laporan</button></> }
          {["owner","admin"].includes(profile?.role ?? "") && selected.sourceStatus === "requested" && selected.sourceTable === "offline_store_purchase_orders" && <><button className="trx-btn" onClick={() => void processSelected("ship")}>Setujui & proses pengiriman</button><button className="trx-btn" onClick={() => void processSelected("reject")}>Tolak pengajuan</button></> }
          {selected.sourceStatus === "shipped" && selected.sourceTable === "offline_store_purchase_orders" && <button className="trx-btn" onClick={() => void processSelected("receive")}>Konfirmasi barang diterima</button>}
           {selected.sourceStatus === "pending" && selected.sourceTable === "offline_stock_receipts" && <button className="trx-btn" onClick={() => void processSelected("receive")}>Konfirmasi stok diterima</button>}
          {storeMemberships.some((m) => m.store_id === selected.storeId && m.store_role === "manager") && selected.sourceStatus === "received" && selected.sourceTable === "offline_store_purchase_orders" && Number(selected.dueAmount || 0) > 0 && <button className="trx-btn" onClick={() => void processSelected("pay")}>Catat pembayaran · {money(Number(selected.dueAmount || 0))}</button> }
          {["owner","admin"].includes(profile?.role ?? "") && ["pending","under_review","requested"].includes(normalize(selected.sourceStatus)) && selected.sourceTable === "offline_product_submissions" && <><button className="trx-btn" onClick={() => void processSelected("approve")}>Setujui produk</button><button className="trx-btn" onClick={() => void processSelected("revise")}>Minta perbaikan</button><button className="trx-btn" onClick={() => void processSelected("reject")}>Tolak pengajuan</button></> }
          {selected.sourceStatus === "pending" && selected.sourceTable === "leave_requests" && <><button className="trx-btn" onClick={() => void processSelected("approve")}>Setujui cuti</button><button className="trx-btn" onClick={() => void processSelected("reject")}>Tolak cuti</button></>}
          {selected.sourceStatus === "approved" && selected.sourceTable === "product_orders" && <button className="trx-btn" onClick={() => void processSelected("fulfill")}>Tandai dipenuhi</button>}
        </div>}
        <p className="trx-muted" style={{marginTop:12}}>Nama pemroses dan pemberi persetujuan ditampilkan jika dicatat oleh sumber. Aksi hanya tersedia untuk kategori dan status yang sesuai izin akun.</p>
      </section></div>}
    </main>
  );
}
