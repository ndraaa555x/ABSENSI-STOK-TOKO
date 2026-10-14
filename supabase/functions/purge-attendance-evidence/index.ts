import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server configuration missing" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  const authorization = req.headers.get("authorization") ?? "";
  if (authorization !== `Bearer ${serviceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: expired, error: queryError } = await admin
    .from("attendance_records")
    .select("id,evidence_path")
    .not("evidence_path", "is", null)
    .lte("evidence_expires_at", new Date().toISOString())
    .limit(500);

  if (queryError) {
    return new Response(JSON.stringify({ error: "Could not query expired attendance evidence" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  if (!expired?.length) {
    return new Response(JSON.stringify({ deleted: 0, message: "No expired evidence" }), {
      headers: { "content-type": "application/json" },
    });
  }

  let deleted = 0;
  const failures: string[] = [];
  for (const row of expired) {
    const path = row.evidence_path as string;
    const { error: storageError } = await admin.storage.from("attendance-evidence").remove([path]);
    if (storageError) {
      failures.push(row.id as string);
      continue;
    }

    const { error: updateError } = await admin
      .from("attendance_records")
      .update({ evidence_path: null, evidence_expires_at: null })
      .eq("id", row.id)
      .eq("evidence_path", path);

    if (updateError) failures.push(row.id as string);
    else deleted++;
  }

  return new Response(JSON.stringify({
    deleted,
    failed_count: failures.length,
    failed_record_ids: failures,
  }), {
    status: failures.length ? 207 : 200,
    headers: { "content-type": "application/json" },
  });
});
