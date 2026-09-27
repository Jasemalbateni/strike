/** Reads and sanitises the public Supabase settings (a pasted ".../rest/v1" or trailing slash would break Auth). */
export function supabaseEnv() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  const url = raw.trim().replace(/\/(rest|auth|storage|realtime)\/v1\/?$/i, "").replace(/\/+$/, "");
  if (!url || !key) throw new Error("Supabase env vars are missing: NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return { url, key };
}
