// Still 2 push function. Sends reminder notifications to people's phones (Web Push, VAPID).
//
// Callers:
//   - The reminder job in the database (every minute, only when someone is due): {"mode":"due"} with the x-still-secret header.
//   - The app's "Send me a test" button: {"mode":"test"} with the person's sign-in token.
//   - Setup and health checks from the database: {"mode":"setup"} and {"mode":"selftest"} with the secret.
//
// The VAPID private key and the shared secret live in Supabase Vault and never leave Supabase.
import webpush from "npm:web-push@3.6.7";
import postgres from "npm:postgres@3.4.7";
import { createECDH, randomBytes, timingSafeEqual } from "node:crypto";

const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 2, idle_timeout: 20 });
const SUPA_URL = Deno.env.get("SUPABASE_URL") ?? "https://icovzdxbbvbdbhcvdbrv.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_rGazt0U4ycF564bSIBcBew_gO9RfORw";
const SUBJECT = "https://wikedlyangelic-alt.github.io/Still-2/";
const APP_ORIGIN = "https://wikedlyangelic-alt.github.io";
const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

type Sub = { endpoint: string; p256dh: string; auth: string; user_id: string };
type Keys = { publicKey: string; privateKey: string; secret: string };

let cached: Keys | null = null;
async function keys(): Promise<Keys | null> {
  if (cached) return cached;
  const rows = await sql`select name, decrypted_secret from vault.decrypted_secrets where name in ('still_vapid_public', 'still_vapid_private', 'still_push_secret')`;
  const m: Record<string, string> = {};
  for (const r of rows) m[r.name] = r.decrypted_secret;
  if (!m.still_push_secret) return null;
  const k = { publicKey: m.still_vapid_public ?? "", privateKey: m.still_vapid_private ?? "", secret: m.still_push_secret };
  if (k.publicKey && k.privateKey) cached = k;
  return k;
}

function cors(origin: string | null): Record<string, string> {
  const ok = origin === APP_ORIGIN || (origin ?? "").startsWith("http://localhost") || (origin ?? "").startsWith("http://127.0.0.1");
  return {
    "Access-Control-Allow-Origin": ok ? origin! : APP_ORIGIN,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json" } });
}
function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// What the reminder says depends on the time of day where the person is.
const PROMPTS: Record<string, string[]> = {
  morning: [
    "Good morning. What's one thing you're grateful for as the day begins?",
    "Before the day gets busy, what's something good in your life right now?",
    "Take one slow breath. What are you thankful for this morning?",
  ],
  day: [
    "A quick pause. What's gone well so far today?",
    "Who or what made today a little better?",
    "What's one small good thing from the last few hours?",
  ],
  evening: [
    "As the day winds down, what are you grateful for?",
    "What was the best moment of today?",
    "Who are you thankful for today, and why?",
  ],
};
function promptFor(tz: string) {
  let hour = 12;
  try { hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: tz }).format(new Date())); } catch (_) { /* keep midday */ }
  const set = hour >= 4 && hour < 11 ? PROMPTS.morning : hour >= 11 && hour < 17 ? PROMPTS.day : PROMPTS.evening;
  return set[Math.floor(Math.random() * set.length)];
}

function request(sub: Pick<Sub, "endpoint" | "p256dh" | "auth">, payload: unknown, k: Keys) {
  const d = webpush.generateRequestDetails(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    JSON.stringify(payload),
    { vapidDetails: { subject: SUBJECT, publicKey: k.publicKey, privateKey: k.privateKey }, TTL: 4 * 3600, urgency: "normal", topic: "reminder", contentEncoding: "aes128gcm" },
  );
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(d.headers)) {
    if (name.toLowerCase() !== "content-length") headers[name] = String(value);
  }
  return { url: d.endpoint, headers, body: new Uint8Array(d.body as Uint8Array) };
}

async function sendAll(subs: Sub[], payloadFor: (s: Sub) => unknown, k: Keys) {
  const results = await Promise.all(subs.map(async (s) => {
    if (!PUSH_HOST.test(s.endpoint)) return { endpoint: s.endpoint, status: 0 };
    try {
      const r = request(s, payloadFor(s), k);
      const res = await fetch(r.url, { method: "POST", headers: r.headers, body: r.body });
      const status = res.status;
      await res.body?.cancel();
      return { endpoint: s.endpoint, status };
    } catch (_) {
      return { endpoint: s.endpoint, status: -1 };
    }
  }));
  const gone = results.filter((r) => r.status === 404 || r.status === 410).map((r) => r.endpoint);
  const ok = results.filter((r) => r.status >= 200 && r.status < 300).map((r) => r.endpoint);
  if (gone.length) await sql`delete from public.push_subscriptions where endpoint in ${sql(gone)}`;
  if (ok.length) await sql`update public.push_subscriptions set last_ok_at = now() where endpoint in ${sql(ok)}`;
  return { sent: ok.length, gone: gone.length, failed: results.length - ok.length - gone.length, statuses: results.map((r) => r.status) };
}

async function userFromToken(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+/.test(auth) || auth.includes("sb_publishable_")) return null;
  const res = await fetch(`${SUPA_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: PUBLISHABLE_KEY } });
  if (!res.ok) { await res.body?.cancel(); return null; }
  const u = await res.json();
  return typeof u?.id === "string" ? u.id : null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json({ error: "POST only" }, 405, origin);

  let body: { mode?: string } = {};
  try { body = await req.json(); } catch (_) { /* empty body */ }
  const mode = body.mode ?? "";

  try {
    const k = await keys();
    if (!k) return json({ error: "Not set up" }, 503, origin);
    const fromJob = sameSecret(req.headers.get("x-still-secret") ?? "", k.secret);

    if (mode === "setup") {
      if (!fromJob) return json({ error: "Not allowed" }, 401, origin);
      if (k.publicKey && k.privateKey) return json({ publicKey: k.publicKey, created: false }, 200, origin);
      const v = webpush.generateVAPIDKeys();
      await sql`select vault.create_secret(${v.privateKey}, 'still_vapid_private', 'VAPID private key for Still reminders')`;
      await sql`select vault.create_secret(${v.publicKey}, 'still_vapid_public', 'VAPID public key for Still reminders (the app has a copy)')`;
      cached = null;
      return json({ publicKey: v.publicKey, created: true }, 200, origin);
    }

    if (!k.publicKey || !k.privateKey) return json({ error: "Not set up" }, 503, origin);

    if (mode === "selftest") {
      if (!fromJob) return json({ error: "Not allowed" }, 401, origin);
      const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
      const r = request({ endpoint: "https://fcm.googleapis.com/fcm/send/selftest", p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") }, { title: "Still", body: "selftest" }, k);
      return json({ ok: true, bytes: r.body.length, encoding: r.headers["Content-Encoding"], hasVapid: /^vapid t=/.test(r.headers["Authorization"] ?? "") }, 200, origin);
    }

    if (mode === "due") {
      if (!fromJob) return json({ error: "Not allowed" }, 401, origin);
      const due = await sql<{ user_id: string; tz: string; send: boolean }[]>`select * from still_private.claim_due_reminders()`;
      const sendTo = due.filter((d) => d.send);
      if (!sendTo.length) return json({ due: due.length, sent: 0 }, 200, origin);
      const tzOf = new Map(sendTo.map((d) => [d.user_id, d.tz]));
      const subs = await sql<Sub[]>`select endpoint, p256dh, auth, user_id::text as user_id from public.push_subscriptions where user_id in ${sql(sendTo.map((d) => d.user_id))}`;
      const out = await sendAll(subs, (s) => ({ title: "Still", body: promptFor(tzOf.get(s.user_id) ?? "UTC"), url: "./?from=reminder", tag: "still-reminder" }), k);
      return json({ due: due.length, ...out }, 200, origin);
    }

    if (mode === "test") {
      const userId = await userFromToken(req);
      if (!userId) return json({ error: "Sign in first" }, 401, origin);
      const subs = await sql<Sub[]>`select endpoint, p256dh, auth, user_id::text as user_id from public.push_subscriptions where user_id = ${userId}`;
      if (!subs.length) return json({ sent: 0, phones: 0 }, 200, origin);
      const out = await sendAll(subs, () => ({ title: "Still", body: "This is how your reminders will look. Tap to write a moment.", url: "./?from=reminder", tag: "still-test" }), k);
      return json({ phones: subs.length, ...out }, 200, origin);
    }

    return json({ error: "Unknown mode" }, 400, origin);
  } catch (e) {
    console.error("push function error", e instanceof Error ? e.message : String(e));
    return json({ error: "Something went wrong" }, 500, origin);
  }
});
