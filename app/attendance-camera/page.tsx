"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type Employee = { id: string; employee_code: string; full_name: string; employment_status: string; profile_id?: string | null };
type FaceApi = {
  nets: {
    ssdMobilenetv1: { loadFromUri: (url: string) => Promise<void> };
    faceLandmark68Net: { loadFromUri: (url: string) => Promise<void> };
    faceRecognitionNet: { loadFromUri: (url: string) => Promise<void> };
  };
  detectSingleFace: (input: HTMLCanvasElement | HTMLVideoElement) => {
    withFaceLandmarks: () => { withFaceDescriptor: () => Promise<{ descriptor: Float32Array } | undefined> };
  };
};
declare global { interface Window { faceapi?: FaceApi } }

const MODEL_URL = "https://cdn.jsdelivr.net/gh/vladmandic/face-api@master/model";
const SCRIPT_URL = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/dist/face-api.js";
const distance = (a: number[], b: number[]) => Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));

export default function AttendanceCameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<{ role: string; is_active: boolean } | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [consent, setConsent] = useState(false);
  const [mode, setMode] = useState<"enroll" | "checkin" | "checkout">("checkin");
  const [faceRegistered, setFaceRegistered] = useState(false);
  const isManager = profile?.role === "owner" || profile?.role === "admin" || profile?.role === "hrd";
  const [cameraReady, setCameraReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      if (!data.session) return;
      const { data: p } = await supabase.from("profiles").select("role,is_active").eq("id", data.session.user.id).maybeSingle();
      if (!alive) return;
      setProfile(p);
      if (p?.is_active && (p.role === "owner" || p.role === "admin" || p.role === "hrd")) {
        const { data: rows, error: employeeError } = await supabase.from("employees").select("id,employee_code,full_name,employment_status,profile_id").eq("employment_status", "active").order("full_name");
        if (!alive) return;
        if (employeeError) setError("Daftar karyawan tidak dapat dibaca. Periksa kebijakan database.");
        setEmployees((rows ?? []) as Employee[]);
      } else if (p?.is_active) {
        const { data: ownEmployee, error: ownError } = await supabase.from("employees").select("id,employee_code,full_name,employment_status,profile_id").eq("profile_id", data.session.user.id).eq("employment_status", "active").maybeSingle();
        if (!alive) return;
        if (ownError || !ownEmployee) setError("Akun ini belum ditautkan ke data karyawan aktif. Minta Owner/Admin menghubungkan akun Anda di menu Karyawan.");
        else { setEmployees([ownEmployee as Employee]); setEmployeeId(ownEmployee.id); }
      }
    });
    return () => { alive = false; streamRef.current?.getTracks().forEach(track => track.stop()); };
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadFaceModels() {
      try {
        if (!window.faceapi) {
          await new Promise<void>((resolve, reject) => {
            const existing = document.querySelector<HTMLScriptElement>('script[data-face-api="true"]');
            if (existing) {
              if (window.faceapi) resolve();
              else { existing.addEventListener("load", () => resolve(), { once: true }); existing.addEventListener("error", () => reject(new Error("Pustaka verifikasi wajah tidak dapat dimuat.")), { once: true }); }
              return;
            }
            const script = document.createElement("script");
            script.src = SCRIPT_URL;
            script.async = true;
            script.dataset.faceApi = "true";
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Pustaka verifikasi wajah tidak dapat dimuat. Periksa koneksi internet."));
            document.head.appendChild(script);
          });
        }
        const api = window.faceapi;
        if (!api) throw new Error("Pustaka verifikasi wajah tidak tersedia.");
        await Promise.all([api.nets.ssdMobilenetv1.loadFromUri(MODEL_URL), api.nets.faceLandmark68Net.loadFromUri(MODEL_URL), api.nets.faceRecognitionNet.loadFromUri(MODEL_URL)]);
        if (alive) setModelReady(true);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Model wajah gagal dimuat.");
      }
    }
    void loadFaceModels();
    return () => { alive = false; };
  }, []);


  useEffect(() => {
    let alive = true;
    async function checkTemplate() {
      if (!employeeId || !session) { setFaceRegistered(false); return; }
      const { data, error: templateError } = await supabase.from("employee_face_templates").select("employee_id").eq("employee_id", employeeId).maybeSingle();
      if (!alive) return;
      if (templateError) { setError("Status pendaftaran wajah tidak dapat diperiksa. Periksa izin database."); return; }
      const registered = Boolean(data?.employee_id);
      setFaceRegistered(registered);
      setMode(registered ? "checkin" : "enroll");
    }
    void checkTemplate();
    return () => { alive = false; };
  }, [employeeId, session]);

  const startCamera = useCallback(async () => {
    setError(""); setNotice("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Browser tidak mendukung kamera. Gunakan HTTPS atau localhost.");
      streamRef.current?.getTracks().forEach(track => track.stop());
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setCameraReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kamera tidak dapat dibuka. Izinkan akses kamera di browser.");
    }
  }, []);

  const capture = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !window.faceapi || !cameraReady) throw new Error("Nyalakan kamera terlebih dahulu.");
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) throw new Error("Kamera belum siap. Tunggu sebentar lalu coba lagi.");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Tidak dapat mengambil gambar dari kamera.");
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const detection = await window.faceapi.detectSingleFace(canvas).withFaceLandmarks().withFaceDescriptor();
    if (!detection) throw new Error("Wajah belum terdeteksi. Hadapkan wajah ke kamera dengan pencahayaan cukup.");
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Gagal membuat foto.")), "image/jpeg", 0.82));
    if (blob.size > 5 * 1024 * 1024) throw new Error("Foto melebihi batas 5 MB.");
    return { descriptor: Array.from(detection.descriptor), blob };
  }, [cameraReady]);

  async function enrollFace() {
    if (!employeeId) { setError(isManager ? "Pilih karyawan terlebih dahulu." : "Akun Anda belum terhubung ke data karyawan. Hubungi Owner/Admin."); return; }
    if (!consent) { setError("Persetujuan karyawan wajib dicentang sebelum pendaftaran wajah."); return; }
    if (!modelReady) { setError("Model verifikasi wajah masih dimuat."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const { descriptor } = await capture();
      if (faceRegistered) throw new Error("Wajah sudah terdaftar. Pendaftaran hanya boleh dilakukan sekali; hubungi Owner/Admin jika perlu peninjauan ulang.");
      const { error: saveError } = await supabase.from("employee_face_templates").insert({
        employee_id: employeeId, embedding: descriptor, consent_at: new Date().toISOString(),
        enrolled_at: new Date().toISOString(), updated_at: new Date().toISOString(), created_by: session?.user.id
      });
      if (saveError) throw new Error("Template wajah tidak tersimpan. Pastikan akun aktif, wajah belum terdaftar, dan kebijakan database mengizinkan pendaftaran wajah milik sendiri.");
      setFaceRegistered(true);
      setMode("checkin");
      setNotice("Pendaftaran wajah berhasil. Pendaftaran awal selesai; absensi berikutnya hanya menyediakan Check-in dan Check-out.");
    } catch (e) { setError(e instanceof Error ? e.message : "Pendaftaran wajah gagal."); }
    finally { setBusy(false); }
  }

  async function recordAttendance() {
    if (!employeeId) { setError("Pilih karyawan terlebih dahulu."); return; }
    if (!modelReady) { setError("Model verifikasi wajah masih dimuat."); return; }
    if (!consent) { setError("Persetujuan pemrosesan foto bukti absensi wajib diberikan."); return; }
    setBusy(true); setError(""); setNotice("");
    let uploadedPath: string | null = null;
    try {
      const { descriptor, blob } = await capture();
      const { data: template, error: templateError } = await supabase.from("employee_face_templates").select("embedding,consent_at").eq("employee_id", employeeId).maybeSingle();
      if (templateError) throw new Error("Template wajah tidak dapat dibaca.");
      if (!template?.embedding || !Array.isArray(template.embedding) || !template.consent_at) throw new Error("Karyawan belum mendaftar wajah dengan persetujuan. Daftarkan wajah terlebih dahulu.");
      if (distance(descriptor, template.embedding as number[]) > 0.52) throw new Error("Wajah tidak cocok dengan template terdaftar. Coba lagi atau minta pemeriksaan manual Owner/Admin.");
      const now = new Date();
      const workDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
      const { data: setting, error: settingError } = await supabase.from("app_settings").select("setting_value").eq("setting_key", "attendance_mode").maybeSingle();
      if (settingError) throw new Error("Aturan absensi tidak dapat dibaca. Hubungi Owner/Admin.");
      const attendanceMode = (setting?.setting_value as { mode?: string } | null)?.mode === "multiple_sessions" ? "multiple_sessions" : "once_daily";
      const { data: existing, error: lookupError } = await supabase.from("attendance_records").select("id,check_in_at,check_out_at").eq("employee_id", employeeId).eq("work_date", workDate).is("check_out_at", null).order("check_in_at", { ascending: false }).limit(1).maybeSingle();
      if (lookupError) throw new Error("Riwayat absensi hari ini tidak dapat dibaca.");
      if (mode === "checkin" && existing?.check_in_at) throw new Error("Anda masih memiliki sesi kerja aktif. Lakukan Check-out terlebih dahulu.");
      if (mode === "checkin" && attendanceMode === "once_daily") {
        const { count, error: dayError } = await supabase.from("attendance_records").select("id", { count: "exact", head: true }).eq("employee_id", employeeId).eq("work_date", workDate);
        if (dayError) throw new Error("Riwayat absensi hari ini tidak dapat dibaca.");
        if ((count ?? 0) > 0) throw new Error("Mode Sekali Sehari aktif: Anda sudah memiliki catatan absensi hari ini.");
      }
      if (mode === "checkout" && !existing?.check_in_at) throw new Error("Tidak ada sesi aktif untuk Check-out. Silakan Check-in terlebih dahulu.");
      const path = `${session?.user.id}/${employeeId}/${now.getTime()}.jpg`;
      const { error: uploadError } = await supabase.storage.from("attendance-evidence").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) throw new Error("Foto bukti gagal diunggah ke penyimpanan privat. Periksa kebijakan Storage.");
      uploadedPath = path;
      if (mode === "checkin") {
        const { error: insertError } = await supabase.from("attendance_records").insert({
          employee_id: employeeId, work_date: workDate, check_in_at: now.toISOString(),
          check_in_method: "face_match", status: "present", recorded_by: session?.user.id, evidence_path: path
        });
        if (insertError) throw new Error("Foto tersimpan, tetapi catatan check-in gagal. Minta Owner/Admin memeriksa izin database.");
      } else {
        const { error: updateError } = await supabase.from("attendance_records").update({
          check_out_at: now.toISOString(), check_out_method: "face_match", evidence_path: path
        }).eq("id", existing!.id);
        if (updateError) throw new Error("Foto tersimpan, tetapi catatan check-out gagal. Minta Owner/Admin memeriksa izin database.");
      }
      setNotice(mode === "checkin" ? "Check-in berhasil. Foto bukti disimpan privat dengan masa berlaku 7 hari." : "Check-out berhasil. Foto bukti disimpan privat dengan masa berlaku 7 hari.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Absensi gagal.");
      if (uploadedPath) {
        await supabase.storage.from("attendance-evidence").remove([uploadedPath]);
      }
    } finally { setBusy(false); }
  }

  if (!session) return <main className="login-side"><div className="login-card"><h1>Absensi kamera</h1><p>Silakan login terlebih dahulu.</p><Link href="/">Kembali ke login</Link></div></main>;
  if (!profile || !profile.is_active) return <main className="login-side"><div className="login-card"><h1>Akses terbatas</h1><p>Akun belum aktif atau profil tidak dapat dibaca. Hubungi Owner/Admin.</p><Link href="/">Kembali ke dashboard</Link></div></main>;
  if (employees.length === 0 && !isManager) return <main className="login-side"><div className="login-card"><h1>Akun belum terhubung</h1><p>{error || "Akun login Anda belum terhubung ke data karyawan aktif. Minta Owner/Admin menghubungkannya di menu Karyawan."}</p><Link href="/">Kembali ke dashboard</Link></div></main>;

  return <main className={`login-side attendance-workspace ${isManager ? "attendance-manager" : "attendance-employee"}`} style={{ alignItems: "flex-start", paddingTop: 28 }}>
    <section className="login-card" style={{ width: "min(100%, 980px)" }}>
      <div className="eyebrow">SMART BUSINESS / ABSENSI WAJAH</div>
      <h1 style={{ marginTop: 10 }}>Absensi karyawan</h1>
      <p className="subtle">{isManager ? "Mode pengelola: pilih karyawan untuk membantu pendaftaran awal atau pencatatan absensi." : "Pilih Check-in atau Check-out. Pendaftaran wajah hanya dilakukan satu kali pada penggunaan awal."} Pencocokan wajah adalah pemeriksaan bantu, bukan jaminan anti-spoofing.</p>
      {isManager && <div className="field"><label htmlFor="employee">Pilih karyawan aktif</label><select id="employee" value={employeeId} onChange={e => setEmployeeId(e.target.value)}><option value="">Pilih karyawan…</option>{employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name} ({emp.employee_code})</option>)}</select></div>}{!isManager && employees[0] && <div className="info-box">Akun: <strong>{employees[0].full_name}</strong> · {employees[0].employee_code}</div>}
      <div className="field"><label htmlFor="mode">Tindakan</label><select id="mode" value={mode} onChange={e => setMode(e.target.value as typeof mode)}>{!faceRegistered && <option value="enroll">Daftarkan wajah (sekali saja)</option>}<option value="checkin">Check-in</option><option value="checkout">Check-out</option></select></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18, marginTop: 16 }}>
        <div>
          <video ref={videoRef} muted playsInline autoPlay style={{ width: "100%", aspectRatio: "4/3", background: "#0b1220", borderRadius: 14, objectFit: "cover" }} />
          <canvas ref={canvasRef} hidden />
          <div className="subtle" style={{ marginTop: 8 }}>Kamera: {cameraReady ? "aktif" : "belum dinyalakan"} · Model wajah: {modelReady ? "siap" : "memuat…"}</div>
          <button className="btn" style={{ width: "100%", marginTop: 12 }} type="button" onClick={startCamera} disabled={busy}>Aktifkan kamera</button>
        </div>
        <div>
          <div className="info-box"><strong>Persetujuan & privasi</strong><p>Jelaskan tujuan kepada karyawan sebelum melanjutkan. Template numerik wajah disimpan di database dengan pembatasan akses. Foto bukti absensi disimpan di bucket privat dan dijadwalkan untuk dihapus setelah 7 hari. Jangan mendaftarkan wajah tanpa persetujuan nyata.</p></div>
          <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14, fontSize: 13, lineHeight: 1.5 }}><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3 }} /><span>Saya mengonfirmasi karyawan telah diberi penjelasan dan menyetujui pemrosesan template wajah serta foto bukti sesuai tujuan di atas.</span></label>
          <button className="btn btn-primary" style={{ width: "100%", marginTop: 16 }} type="button" disabled={busy || !modelReady || !cameraReady} onClick={mode === "enroll" ? enrollFace : recordAttendance}>{busy ? "Memproses…" : mode === "enroll" ? "Ambil wajah & simpan template" : mode === "checkin" ? "Verifikasi wajah & check-in" : "Verifikasi wajah & check-out"}</button>
          {notice && <div className="info-box" role="status" style={{ marginTop: 14 }}>{notice}</div>}
          {error && <div className="error-box" role="alert" style={{ marginTop: 14 }}>{error}</div>}
        </div>
      </div>
      <div className="section-head" style={{ marginTop: 24 }}><div><h2>Catatan keamanan</h2><p className="subtle">Karyawan hanya dapat memilih akun karyawannya sendiri. RLS database tetap harus mengizinkan pembacaan template milik sendiri serta pencatatan absensi milik sendiri. Browser-based face matching dapat dipalsukan oleh klien yang dimodifikasi; jangan gunakan sebagai satu-satunya bukti identitas untuk keputusan berisiko tinggi.</p></div><Link className="btn" href="/">Kembali ke dashboard</Link></div>
    </section>
  </main>;
}
