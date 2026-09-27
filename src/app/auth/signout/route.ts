import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Signs the current user out (clears cookies) and lands on the login page with an optional reason. */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  const reason = request.nextUrl.searchParams.get("reason");
  if (reason === "inactive") url.searchParams.set("inactive", "1");
  const res = NextResponse.redirect(url, { status: 303 });
  // belt and braces: drop any sb-* auth cookies that signOut may not have cleared
  request.cookies.getAll().forEach((c) => {
    if (c.name.startsWith("sb-")) res.cookies.set(c.name, "", { maxAge: 0, path: "/" });
  });
  return res;
}
