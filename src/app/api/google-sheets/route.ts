import Papa from "papaparse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractSheetInfo(url: string): { sheetId: string; gid: string } | null {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!idMatch) return null;
  // gid may live in the query string or the fragment (e.g. #gid=0). Match either.
  const gidMatch = url.match(/[?&#]gid=(\d+)/);
  return { sheetId: idMatch[1], gid: gidMatch?.[1] ?? "0" };
}

export async function POST(request: Request) {
  let body: { url?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return Response.json({ ok: false, error: "url is required." }, { status: 400 });
  }

  const info = extractSheetInfo(url);
  if (!info) {
    return Response.json(
      {
        ok: false,
        error:
          "Couldn't find a sheet ID in that URL. Paste the URL from the browser's address bar while viewing the sheet.",
      },
      { status: 400 },
    );
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${info.sheetId}/export?format=csv&gid=${info.gid}`;
  let res: Response;
  try {
    res = await fetch(exportUrl, { redirect: "follow", cache: "no-store" });
  } catch (err) {
    return Response.json(
      { ok: false, error: `Network error reaching Google: ${(err as Error).message}` },
      { status: 502 },
    );
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      return Response.json(
        {
          ok: false,
          error:
            "Couldn't access the sheet. Make sure it's shared as 'Anyone with the link' (Viewer).",
        },
        { status: res.status },
      );
    }
    return Response.json(
      { ok: false, error: `Google returned HTTP ${res.status}.` },
      { status: res.status },
    );
  }

  const text = await res.text();

  // Private sheets that don't satisfy the "anyone with the link" rule return Google's
  // HTML sign-in page with a 200 status. Detect that and surface a friendly error.
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<") || trimmed.startsWith("<!DOCTYPE")) {
    return Response.json(
      {
        ok: false,
        error:
          "The sheet appears to be private. Share it as 'Anyone with the link' (Viewer) and try again.",
      },
      { status: 400 },
    );
  }

  const parsed = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length && !parsed.data.length) {
    return Response.json(
      {
        ok: false,
        error: `Failed to parse sheet CSV: ${parsed.errors[0].message}`,
      },
      { status: 400 },
    );
  }

  return Response.json({
    ok: true,
    headers: parsed.meta.fields ?? [],
    rows: parsed.data,
  });
}
