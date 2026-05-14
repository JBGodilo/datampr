import { promises as dns } from "node:dns";
import { isDomainLike } from "@/lib/validators";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain")?.trim().toLowerCase();
  if (!domain || !isDomainLike(domain)) {
    return Response.json({ ok: false, valid: false, error: "Invalid domain." }, { status: 400 });
  }

  try {
    const mx = await dns.resolveMx(domain).catch(() => [] as { exchange: string }[]);
    if (mx.length > 0) {
      return Response.json({ ok: true, valid: true, via: "mx" });
    }
    const a = await dns.resolve4(domain).catch(() => [] as string[]);
    if (a.length > 0) {
      return Response.json({ ok: true, valid: true, via: "a" });
    }
    const aaaa = await dns.resolve6(domain).catch(() => [] as string[]);
    if (aaaa.length > 0) {
      return Response.json({ ok: true, valid: true, via: "aaaa" });
    }
    return Response.json({ ok: true, valid: false });
  } catch (err) {
    return Response.json(
      { ok: false, valid: false, error: (err as Error).message },
      { status: 500 },
    );
  }
}
