// Post-deploy smoke test against real Supabase + OpenAI (costs a few cents).
// Usage: SMOKE_URL=https://your-app.vercel.app npm run smoke   (default http://localhost:3000)
// Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env.local.
// Creates throwaway users and removes them (and their files) at the end.
import { createClient } from "@supabase/supabase-js";
import { jsPDF } from "jspdf";
import { readFileSync } from "node:fs";

const env = { ...Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
  .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)])), ...process.env };
const base = env.SMOKE_URL || "http://localhost:3000";
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SERVICE_ROLE ?? env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anonClient = () => createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

let failed = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + detail}`); if (!ok) failed++; };
const password = `Tmp-${Math.random().toString(36).slice(2)}Aa1!`;
const users = [];

async function newUser(tag) {
  const email = `smoke+${tag}${Date.now()}@example.com`;
  const { data } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  users.push(data.user.id);
  const client = anonClient();
  const { data: s } = await client.auth.signInWithPassword({ email, password });
  const headers = { Authorization: `Bearer ${s.session.access_token}`, "Content-Type": "application/json" };
  const api = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers, body: body && JSON.stringify(body) });
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { status: r.status, json, text };
  };
  return { id: data.user.id, client, api, headers };
}

try {
  const u = await newUser("a");
  check("signup trigger created a profile", (await u.client.from("profiles").select("user_id")).data?.length === 1);
  check("no token -> 401", (await fetch(base + "/api/vitals")).status === 401);

  const v = await u.api("POST", "/api/vitals", { heart_rate: 72 });
  check("vitals add", v.status === 200 && v.json.heart_rate === 72, v.text);
  check("vitals reject empty", (await u.api("POST", "/api/vitals", {})).status === 422);
  check("vitals delete", (await u.api("DELETE", `/api/vitals/${v.json.id}`)).status === 200);

  const doc = new jsPDF();
  ["Patient: Asha Rao", "Report date: 12 March 2026", "Report type: Blood Test", "Haemoglobin 10.2 g/dL LOW", "Medication: Ferrous sulfate 200 mg daily"]
    .forEach((line, i) => doc.text(line, 10, 20 + i * 10));
  const path = `${u.id}/${Date.now()}-smoke.pdf`;
  await u.client.storage.from("reports").upload(path, new Uint8Array(doc.output("arraybuffer")), { contentType: "application/pdf" });
  check("storage blocks another user's folder",
    !!(await u.client.storage.from("reports").upload(`${users[0] === u.id ? "x" : u.id}-other/a.pdf`, new Uint8Array([1]))).error);

  const [i1, i2] = await Promise.all([1, 2].map(() => u.api("POST", "/api/reports/ingest", { storage_path: path, filename: "smoke.pdf" })));
  check("simultaneous ingests share one report", i1.json?.report_id === i2.json?.report_id, `${i1.text} ${i2.text}`);
  let status = "processing";
  for (let i = 0; i < 45 && status === "processing"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    status = (await u.api("GET", `/api/reports/${i1.json.report_id}`)).json?.status;
  }
  check("ingest reaches ready", status === "ready", status);

  const ask = async (question) => {
    const r = await fetch(base + "/api/chat/stream", { method: "POST", headers: u.headers, body: JSON.stringify({ question }) });
    const events = (await r.text()).split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).filter((d) => d !== "[DONE]").map((d) => JSON.parse(d));
    return { answer: events.map((e) => e.t ?? "").join(""), sources: events.find((e) => e.sources)?.sources, error: events.find((e) => e.error) };
  };
  const chat = await ask("What medication was I prescribed?");
  check("chat answers from the report and cites it", /ferrous/i.test(chat.answer) && chat.sources?.includes("smoke.pdf"), JSON.stringify(chat));
  check("greeting answers", (await ask("hello")).answer.length > 0);

  const stuck = `${u.id}/${Date.now()}-stuck.pdf`;
  await admin.from("reports").insert({ user_id: u.id, filename: "stuck.pdf", storage_path: stuck, status: "processing", updated_at: new Date(Date.now() - 10 * 60e3).toISOString() });
  const list = (await u.api("GET", "/api/reports")).json.reports;
  check("stuck processing report is expired", list.find((r) => r.filename === "stuck.pdf")?.status === "failed");

  check("delete report", (await u.api("DELETE", `/api/reports/${i1.json.report_id}`)).status === 200);
  const files = (await admin.storage.from("reports").list(u.id)).data ?? [];
  check("deleted report's file is gone", !files.some((f) => path.endsWith(f.name)));

  const denied = [];
  for (let n = 0; n < 3; n++) denied.push((await u.client.rpc("consume_quota", { p_kind: "chat", p_limit: 2 })).data);
  check("quota allows 2 then denies once", denied[2]?.length === 1 && denied[2][0].allowed === false, JSON.stringify(denied));
  check("anonymous cannot call consume_quota", !!(await anonClient().rpc("consume_quota", { p_kind: "chat", p_limit: 2 })).error);

  const other = await newUser("b");
  check("another user sees none of these reports", (await other.client.from("reports").select("id")).data?.length === 0);
  check("delete account", (await u.api("DELETE", "/api/account")).status === 200);
  check("account is gone", !(await admin.auth.admin.getUserById(u.id)).data?.user);
} finally {
  for (const id of users) {
    const files = (await admin.storage.from("reports").list(id)).data ?? [];
    if (files.length) await admin.storage.from("reports").remove(files.map((f) => `${id}/${f.name}`));
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}
console.log(failed ? `\n${failed} check(s) FAILED` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
