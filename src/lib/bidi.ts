/** Keep number runs like "4–5", "20×30" or "3-2" in reading order inside Arabic (RTL) text.
 *  Wraps each run in Unicode isolates (LRI … PDI); idempotent. */
export function bidi(s: string): string;
export function bidi(s: string | undefined): string | undefined;
export function bidi(s: string | null | undefined): string | null | undefined;
export function bidi(s: string | null | undefined) {
  if (!s || s.includes("⁦")) return s;
  return s.replace(/[0-9][0-9 ×xX*/:.,\-–+]*[0-9]|[0-9]/g, (m) => "⁦" + m + "⁩");
}
