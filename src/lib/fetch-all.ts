/** PostgREST caps a response at 1000 rows — page through so analytics never silently truncate.
 *  usage: fetchAll<Row>((from, to) => supabase.from("x").select("*").order("id").range(from, to)) */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 1_000_000; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error || !data) break;
    out.push(...(data as T[]));
    if (data.length < size) break;
  }
  return out;
}
