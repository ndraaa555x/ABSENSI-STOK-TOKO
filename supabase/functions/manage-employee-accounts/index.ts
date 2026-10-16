import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const corsHeaders = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json"};
type AccountEmployeeLink = { profile_id: string | null; employee_code: string; employment_status: string; full_name: string };
type AccountProfile = { id: string; email: string; full_name: string | null; role: string; is_active: boolean; created_at: string };
function reply(status:number,payload:Record<string,unknown>){return new Response(JSON.stringify(payload),{status,headers:corsHeaders});}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST") return reply(405,{error:"Method not allowed"});
 const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key) return reply(500,{error:"Konfigurasi server belum tersedia."});
 const auth=req.headers.get("authorization")??"", token=auth.startsWith("Bearer ")?auth.slice(7):"";
 if(!token) return reply(401,{error:"Sesi login diperlukan."});
 const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authData,error:authError}=await admin.auth.getUser(token);
 if(authError||!authData.user) return reply(401,{error:"Sesi login tidak valid."});
 const {data:actor,error:actorError}=await admin.from("profiles").select("id,email,role,is_active,full_name").eq("id",authData.user.id).maybeSingle();
 if(actorError||!actor||!actor.is_active) return reply(403,{error:"Akun tidak aktif atau profil tidak tersedia."});
 let body:Record<string,unknown>; try{body=await req.json();}catch{return reply(400,{error:"Permintaan tidak valid."});}
 const writeAudit=async(action:string,entityId:string,details:Record<string,unknown>)=>{const {error}=await admin.from("audit_logs").insert({actor_id:actor.id,action,entity_table:"profiles",entity_id:entityId,details:{actor_name:actor.full_name??actor.email,actor_email:actor.email,actor_role:actor.role,...details}});return error;};
 if(body.action==="list_accounts"){
  if(!["owner","admin"].includes(actor.role)) return reply(403,{error:"Hanya Owner/Admin yang dapat melihat daftar akun."});
  const {data,error}=await admin.from("profiles").select("id,email,full_name,role,is_active,created_at").order("created_at",{ascending:false});
  if(error) return reply(500,{error:"Daftar akun gagal dimuat."});
  const {data:links}=await admin.from("employees").select("profile_id,employee_code,employment_status,full_name").not("profile_id","is",null);
  const linked = new Map<string, AccountEmployeeLink>((links ?? []).filter((employee: AccountEmployeeLink) => Boolean(employee.profile_id)).map((employee: AccountEmployeeLink) => [employee.profile_id as string, employee]));
  return reply(200,{accounts:(data??[]).map((profile: AccountProfile)=>({...profile,employee:linked.get(profile.id)??null}))});
 }
 if(body.action==="create_employee_account"){
  if(!["owner","admin"].includes(actor.role)) return reply(403,{error:"Hanya Owner/Admin yang dapat membuat akun karyawan."});
  const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
  const password=typeof body.password==="string"?body.password:"";
  const fullName=typeof body.full_name==="string"?body.full_name.trim():"";
  const requestedRole=["admin","hrd"].includes(String(body.role))?String(body.role):"employee";
  if(requestedRole!=="employee"&&actor.role!=="owner") return reply(403,{error:"Hanya Owner yang dapat membuat akun dengan role khusus."});
  const employeeId=typeof body.employee_id==="string"?body.employee_id:"";
  if(!email.includes("@")||password.length<8||!fullName||!employeeId) return reply(400,{error:"Email, nama, ID karyawan, dan kata sandi minimal 8 karakter wajib diisi."});
  const {data:employee,error:empError}=await admin.from("employees").select("id,email,profile_id").eq("id",employeeId).maybeSingle();
  if(empError||!employee) return reply(404,{error:"Data karyawan tidak ditemukan."});
  if(employee.profile_id) return reply(409,{error:"Karyawan ini sudah terhubung ke akun."});
  if(employee.email&&employee.email.toLowerCase()!==email) return reply(400,{error:"Email akun harus sama dengan email pada data karyawan."});
  const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName}});
  if(createError||!created.user) return reply(400,{error:createError?.message??"Akun login gagal dibuat."});
  const userId=created.user.id;
  const {error:profileError}=await admin.from("profiles").upsert({id:userId,email,full_name:fullName,role:requestedRole,is_active:true,updated_at:new Date().toISOString()},{onConflict:"id"});
  if(profileError){await admin.auth.admin.deleteUser(userId);return reply(500,{error:"Profil akun gagal dibuat; akun login dibatalkan."});}
  const {error:linkError}=await admin.from("employees").update({profile_id:userId,email,updated_at:new Date().toISOString()}).eq("id",employeeId).is("profile_id",null);
  if(linkError){await admin.from("profiles").delete().eq("id",userId);await admin.auth.admin.deleteUser(userId);return reply(500,{error:"Akun gagal dihubungkan dengan data karyawan; perubahan dibatalkan."});}
  const auditError=await writeAudit("create_account",userId,{target_email:email,target_role:requestedRole,result:"success"});
  if(auditError){await admin.from("employees").update({profile_id:null,updated_at:new Date().toISOString()}).eq("id",employeeId).eq("profile_id",userId);await admin.from("profiles").delete().eq("id",userId);await admin.auth.admin.deleteUser(userId);return reply(500,{error:"Akun dibatalkan karena catatan audit gagal disimpan."});}
  return reply(200,{success:true,user_id:userId,message:"Akun login karyawan berhasil dibuat."});
 }

 if(body.action==="create_store_member"){
  const storeId=typeof body.store_id==="string"?body.store_id:"";
  const fullName=typeof body.full_name==="string"?body.full_name.trim():"";
  const email=typeof body.email==="string"?body.email.trim().toLowerCase():"";
  const password=typeof body.temporary_password==="string"?body.temporary_password:"";
  const titleId=typeof body.job_title_id==="string"?body.job_title_id:"";
  if(!storeId||!fullName||!email.includes("@")||password.length<8||!titleId) return reply(400,{error:"Nama lengkap, email, password sementara minimal 8 karakter, toko, dan jabatan wajib diisi."});
  if(!["owner","admin","employee"].includes(actor.role)) return reply(403,{error:"Akun ini tidak berwenang menambahkan anggota toko."});
  const {data:store,error:storeError}=await admin.from("offline_stores").select("id,name,is_active").eq("id",storeId).maybeSingle();
  if(storeError||!store||!store.is_active) return reply(404,{error:"Toko aktif tidak ditemukan."});
  if(actor.role==="employee"){
   const {data:own,error:ownError}=await admin.from("offline_store_memberships").select("store_role").eq("store_id",storeId).eq("user_id",actor.id).eq("is_active",true).maybeSingle();
   if(ownError||!own||own.store_role!=="manager") return reply(403,{error:"Hanya Manajer Toko aktif yang dapat menambahkan anggota untuk toko penempatannya."});
  }
  const {data:title,error:titleError}=await admin.from("offline_store_job_titles").select("id,title,permission_role,store_id,is_active").eq("id",titleId).eq("store_id",storeId).eq("is_active",true).maybeSingle();
  if(titleError||!title) return reply(400,{error:"Jabatan tidak aktif atau bukan milik toko ini."});
  if(!["store_admin","inventory","cashier"].includes(title.permission_role)) return reply(403,{error:"Manajer hanya dapat menambahkan anggota dengan jabatan bawahan."});
  const {data:existingProfile,error:existingError}=await admin.from("profiles").select("id").ilike("email",email).maybeSingle();
  if(existingError) return reply(500,{error:"Status email akun gagal diperiksa."});
  if(existingProfile) return reply(409,{error:"Email sudah terdaftar di sistem. Untuk akun yang sudah ada, minta Owner/Admin melakukan penempatan dari menu Anggota Toko."});
  const {data:created,error:createError}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:fullName}});
  if(createError||!created.user) return reply(400,{error:createError?.message??"Akun anggota gagal dibuat."});
  const userId=created.user.id;
  const {error:profileError}=await admin.from("profiles").upsert({id:userId,email,full_name:fullName,role:"employee",is_active:true,updated_at:new Date().toISOString()},{onConflict:"id"});
  if(profileError){await admin.auth.admin.deleteUser(userId);return reply(500,{error:"Profil Karyawan gagal dibuat; pembuatan akun dibatalkan."});}
  const {data:membership,error:membershipError}=await admin.from("offline_store_memberships").insert({store_id:storeId,user_id:userId,store_role:title.permission_role,is_active:true,created_by:actor.id,job_title_id:title.id,job_title:title.title}).select("id").single();
  if(membershipError){
   await admin.from("profiles").delete().eq("id",userId);
   await admin.auth.admin.deleteUser(userId);
   return reply(500,{error:"Penempatan anggota gagal dibuat; pembuatan akun dibatalkan. "+membershipError.message});
  }
  const {error:auditError}=await admin.from("audit_logs").insert({actor_id:actor.id,action:"create_store_member",entity_table:"offline_store_memberships",entity_id:membership.id,details:{store_id:storeId,store_name:store.name,target_user_id:userId,target_email:email,target_full_name:fullName,store_role:title.permission_role,job_title:title.title,result:"created_with_temporary_password"}});
  if(auditError){
   await admin.from("offline_store_memberships").delete().eq("id",membership.id);
   await admin.from("profiles").delete().eq("id",userId);
   await admin.auth.admin.deleteUser(userId);
   return reply(500,{error:"Pembuatan akun dibatalkan karena catatan audit gagal disimpan."});
  }
  return reply(200,{success:true,user_id:userId,message:"Akun anggota berhasil dibuat. Berikan email dan password sementara kepada anggota secara langsung; minta anggota mengganti password setelah masuk."});
 }
 if(body.action==="delete_employee_account"){
  if(!["owner","admin"].includes(actor.role)) return reply(403,{error:"Hanya Owner/Admin yang dapat menghapus akun karyawan."});
  const targetId=typeof body.user_id==="string"?body.user_id:"", employeeId=typeof body.employee_id==="string"?body.employee_id:"";
  if(!targetId||!employeeId) return reply(400,{error:"ID akun dan ID karyawan wajib diisi."});
  if(targetId===actor.id) return reply(400,{error:"Anda tidak dapat menghapus akun yang sedang digunakan."});
  const {data:target,error:targetError}=await admin.from("profiles").select("id,role").eq("id",targetId).maybeSingle();
  if(targetError||!target) return reply(404,{error:"Akun tujuan tidak ditemukan."});
  if(target.role==="owner") return reply(403,{error:"Akun Owner dilindungi dan tidak dapat dihapus dari menu karyawan."});
  const {data:employee,error:employeeError}=await admin.from("employees").select("id,profile_id").eq("id",employeeId).maybeSingle();
  if(employeeError||!employee) return reply(404,{error:"Data karyawan tidak ditemukan."});
  if(employee.profile_id && employee.profile_id!==targetId) return reply(409,{error:"Akun yang dipilih tidak terhubung dengan karyawan ini."});
  const {error:unlinkError}=await admin.from("employees").update({profile_id:null,updated_at:new Date().toISOString()}).eq("id",employeeId).eq("profile_id",targetId);
  if(unlinkError) return reply(500,{error:"Akun gagal dilepas dari data karyawan."});
  const {error:deleteError}=await admin.auth.admin.deleteUser(targetId);
  if(deleteError){
   await admin.from("employees").update({profile_id:targetId,updated_at:new Date().toISOString()}).eq("id",employeeId).is("profile_id",null);
   return reply(500,{error:"Akun login gagal dihapus; tautan karyawan dipulihkan."});
  }
  const auditError=await writeAudit("delete_account",targetId,{target_role:target.role,result:"success",source:"employee_management"});
  if(auditError) return reply(200,{success:true,audit_warning:"Akun sudah dihapus, tetapi catatan audit gagal disimpan."});
  return reply(200,{success:true,message:"Akun login dihapus. Data karyawan dan riwayat absensi tetap disimpan."});
 }

 if(body.action==="delete_account"){
  if(actor.role!=="owner") return reply(403,{error:"Hanya Owner yang dapat menghapus akun."});
  const targetId=typeof body.user_id==="string"?body.user_id:"";
  if(!targetId) return reply(400,{error:"ID akun wajib diisi."});
  if(targetId===actor.id) return reply(400,{error:"Akun Owner yang sedang digunakan tidak dapat dihapus."});
  const {data:target,error:targetError}=await admin.from("profiles").select("id,role,email,full_name").eq("id",targetId).maybeSingle();
  if(targetError||!target) return reply(404,{error:"Akun tujuan tidak ditemukan."});
  if(target.role==="owner") return reply(403,{error:"Akun Owner dilindungi dan tidak dapat dihapus."});
  const {data:linkedEmployees,error:linkedEmployeesError}=await admin.from("employees").select("id").eq("profile_id",targetId);
  if(linkedEmployeesError) return reply(500,{error:"Tautan data karyawan gagal diperiksa."});
  const linkedEmployeeIds=(linkedEmployees??[]).map((employee:{id:string})=>employee.id);
  if(linkedEmployeeIds.length){
   const {error:unlinkError}=await admin.from("employees").update({profile_id:null,updated_at:new Date().toISOString()}).in("id",linkedEmployeeIds).eq("profile_id",targetId);
   if(unlinkError) return reply(500,{error:"Akun gagal dilepas dari data karyawan."});
  }
  const {error:deleteError}=await admin.auth.admin.deleteUser(targetId);
  if(deleteError){
   if(linkedEmployeeIds.length){
    const {error:restoreError}=await admin.from("employees").update({profile_id:targetId,updated_at:new Date().toISOString()}).in("id",linkedEmployeeIds).is("profile_id",null);
    if(restoreError) return reply(500,{error:"Akun gagal dihapus dan tautan karyawan perlu dipulihkan oleh Owner."});
   }
   return reply(500,{error:"Akun login gagal dihapus; tautan data karyawan telah dipulihkan."});
  }
  const auditError=await writeAudit("delete_account",targetId,{target_email:target.email,target_role:target.role,target_full_name:target.full_name,result:"success",source:"access_security_settings"});
  if(auditError) return reply(200,{success:true,audit_warning:"Akun sudah dihapus, tetapi catatan audit gagal disimpan."});
  return reply(200,{success:true,message:"Akun login dan profil pengguna berhasil dihapus; data operasional bisnis tidak ikut dihapus."});
 }
 if(body.action==="update_account"){
  if(actor.role!=="owner" && !(actor.role==="admin" && body.role==="employee")) return reply(403,{error:"Admin hanya dapat menetapkan role Karyawan. Perubahan role khusus hanya boleh dilakukan Owner."});
  const targetId=typeof body.user_id==="string"?body.user_id:"", role=body.role, active=body.is_active;
  if(!targetId||!["owner","admin","hrd","employee"].includes(String(role))||typeof active!=="boolean") return reply(400,{error:"Data role/status tidak valid."});
  if(targetId===actor.id&&(role!=="owner"||active!==true)) return reply(400,{error:"Owner tidak dapat menurunkan role atau menonaktifkan akunnya sendiri."});
  const {data:target,error:targetError}=await admin.from("profiles").select("id,role,is_active").eq("id",targetId).maybeSingle();
  if(targetError||!target) return reply(404,{error:"Akun tujuan tidak ditemukan."});
  if(actor.role!=="owner" && target.role==="owner") return reply(403,{error:"Admin tidak dapat mengubah akun Owner."});
  if(target.role==="owner"&&role!=="owner"){
   const {count,error:countError}=await admin.from("profiles").select("id",{count:"exact",head:true}).eq("role","owner").eq("is_active",true);
   if(countError||(count??0)<=1) return reply(400,{error:"Minimal satu Owner aktif harus dipertahankan."});
  }
  if(role==="owner"&&active!==true) return reply(400,{error:"Akun dengan role Owner harus tetap aktif."});
  const {error:updateError}=await admin.from("profiles").update({role,is_active:active,updated_at:new Date().toISOString()}).eq("id",targetId);
  if(updateError) return reply(500,{error:"Role/status akun gagal disimpan."});
  const auditError=await writeAudit("update_account",targetId,{previous_role:target.role,new_role:role,previous_is_active:target.is_active,new_is_active:active,result:"success"});
  if(auditError) return reply(200,{success:true,audit_warning:"Perubahan tersimpan, tetapi catatan audit gagal disimpan."});
  return reply(200,{success:true,message:"Role dan status akun berhasil diperbarui."});
 }
 return reply(400,{error:"Aksi tidak dikenal."});
});