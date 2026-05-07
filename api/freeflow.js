// FlowCharts FreeFlow proxy.
// Frontend calls this route only. FreeFlow key stays server-side.

const FREEFLOW_BASE = "https://www.free-flow.site/public";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(body));
}

function cleanKey(value) {
  return String(value || "")
    .trim()
    .replace(/^FREEFLOW_API_KEY\s*=\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function getKey(req) {
  return cleanKey(
    process.env.FREEFLOW_API_KEY ||
    process.env.FREE_FLOW_API_KEY ||
    process.env.FF_API_KEY ||
    req?.headers?.["x-freeflow-key"] ||
    ""
  );
}

function daysBetweenToday(dateString) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const exp = new Date(`${dateString}T00:00:00Z`);
  return Math.max(0, Math.round((exp - today) / 86400000));
}

function pickExpiration(expirations, requestedDte, requestedExp) {
  if (requestedExp && expirations.includes(requestedExp)) return requestedExp;
  const target = Number.isFinite(Number(requestedDte)) ? Number(requestedDte) : 0;
  const sorted = [...expirations].sort();
  const exact = sorted.find((exp) => daysBetweenToday(exp) === target);
  if (exact) return exact;
  return sorted.find((exp) => daysBetweenToday(exp) >= target) || sorted[0] || null;
}

async function parseResp(r) {
  const text = await r.text();
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function ff(path, params, key) {
  const url = new URL(FREEFLOW_BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });

  // First try official header auth.
  let r = await fetch(url.toString(), {
    headers: {
      "X-API-Key": key,
      "Accept": "application/json",
      "User-Agent": "FlowCharts/1.0",
    },
  });
  let data = await parseResp(r);

  // If FreeFlow rejects header auth from serverless, retry with query api_key fallback.
  if (r.status === 401) {
    const url2 = new URL(url.toString());
    url2.searchParams.set("api_key", key);
    r = await fetch(url2.toString(), {
      headers: {
        "Accept": "application/json",
        "User-Agent": "FlowCharts/1.0",
      },
    });
    data = await parseResp(r);
  }

  if (!r.ok) {
    const err = new Error(
      r.status === 401
        ? "FreeFlow rejected the API key. Recheck the key value in Vercel or paste a new key into Settings."
        : `FreeFlow ${path} returned HTTP ${r.status}`
    );
    err.status = r.status;
    err.details = data;
    throw err;
  }

  return data;
}

function contractsFromSnapshot(snapshot) {
  if (Array.isArray(snapshot)) return snapshot;
  return (
    snapshot?.contracts ||
    snapshot?.data ||
    snapshot?.rows ||
    snapshot?.snapshot?.contracts ||
    snapshot?.result?.contracts ||
    []
  );
}

async function getLiveNqSpot() {
  // Server-side only. UI labels this generically as Live NQ reference.
  // If this fails, frontend falls back to FreeFlow QQQ ratio calculation.
  const symbols = ["NQ=F", "MNQ=F"];
  for (const sym of symbols) {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`;
      const r = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 FlowCharts/1.0",
        },
      });
      if (!r.ok) continue;
      const data = await r.json();
      const meta = data?.chart?.result?.[0]?.meta || {};
      const p = Number(meta.regularMarketPrice || meta.previousClose || meta.chartPreviousClose);
      if (Number.isFinite(p) && p > 10000 && p < 50000) {
        return { nqSpot: p, nqSpotSource: "Live NQ reference", nqSpotTime: new Date().toISOString() };
      }
    } catch (_) {}
  }
  return null;
}

module.exports = async function handler(req, res) {
  try {
    const key = getKey(req);

    if (req.query?.debug === "1") {
      return json(res, 200, {
        ok: true,
        keyPresent: Boolean(key),
        keyStartsWithFf: key.startsWith("ff_"),
        keyLength: key.length,
        routeVersion: "trading-ready-final",
      });
    }

    if (!key || !key.startsWith("ff_")) {
      return json(res, 500, {
        ok: false,
        error: "Missing or invalid FREEFLOW_API_KEY on the server.",
        fix: "Add FREEFLOW_API_KEY in Vercel, or paste your FreeFlow key in Settings for local fallback testing.",
      });
    }

    const q = req.query || {};
    const symbol = String(q.symbol || "QQQ").toUpperCase();
    const endpoint = String(q.endpoint || q.type || "gamma").toLowerCase();
    const requestedDte = q.dte ?? q.expIndex ?? "0";
    const requestedExp = q.exp || q.expiration;

    if (!["SPY", "QQQ", "GLD", "SLV"].includes(symbol)) {
      return json(res, 400, { ok: false, error: "Unsupported FreeFlow symbol.", allowed: ["SPY", "QQQ", "GLD", "SLV"] });
    }

    const expirationsRaw = await ff("/expirations", { symbol }, key);
    const expirations = Array.isArray(expirationsRaw) ? expirationsRaw : (expirationsRaw.expirations || []);
    const exp = pickExpiration(expirations, requestedDte, requestedExp);

    if (endpoint === "expirations") {
      return json(res, 200, { ok: true, symbol, expirations, selectedExpiration: exp });
    }

    if (!exp) {
      return json(res, 404, { ok: false, error: "No expiration found from FreeFlow.", symbol, expirations });
    }

    if (endpoint === "chart") {
      const chart = await ff("/chart", { symbol, range: q.range || "3mo", interval: q.interval || undefined }, key);
      return json(res, 200, { ok: true, ...chart });
    }

    if (endpoint === "walls") {
      const walls = await ff("/walls", { symbol, exp }, key);
      return json(res, 200, { ok: true, symbol, expiration: exp, expirations, ...walls });
    }

    if (endpoint === "snapshot") {
      const snapshot = await ff("/snapshot", { symbol, exp }, key);
      return json(res, 200, { ok: true, symbol, expiration: exp, expirations, ...snapshot });
    }

    const [walls, snapshot, chart5m, nqRef] = await Promise.all([
      ff("/walls", { symbol, exp }, key),
      ff("/snapshot", { symbol, exp }, key),
      ff("/chart", { symbol, interval: "5m" }, key).catch(() => null),
      getLiveNqSpot().catch(() => null),
    ]);

    const contracts = contractsFromSnapshot(snapshot);
    const qqqSpot = Number(snapshot?.spot ?? walls?.spot ?? null);

    return json(res, 200, {
      ok: true,
      symbol,
      targetSymbol: "NQ",
      source: "FreeFlow QQQ options",
      expiration: exp,
      expirations,
      dte: snapshot?.dte ?? daysBetweenToday(exp),
      spot: qqqSpot,
      qqqSpot,
      nqSpot: nqRef?.nqSpot ?? null,
      nqSpotSource: nqRef?.nqSpotSource ?? null,
      nqSpotTime: nqRef?.nqSpotTime ?? null,
      conversionRatio: nqRef?.nqSpot && qqqSpot ? nqRef.nqSpot / qqqSpot : null,
      total_gex: snapshot?.total_gex ?? walls?.total_gex ?? walls?.net_gex ?? null,
      net_gex: snapshot?.total_gex ?? walls?.net_gex ?? null,
      total_dex: snapshot?.total_dex ?? walls?.total_dex ?? null,
      call_wall: walls?.call_wall ?? walls?.callWall ?? null,
      put_wall: walls?.put_wall ?? walls?.putWall ?? null,
      gamma_flip: walls?.gamma_flip ?? walls?.gammaFlip ?? null,
      call_oi_wall: walls?.call_oi_wall ?? null,
      put_oi_wall: walls?.put_oi_wall ?? null,
      contracts,
      snapshot,
      walls,
      chart5m,
      candles: chart5m?.candles || [],
      lastUpdated: new Date().toISOString(),
    });
  } catch (e) {
    console.error("freeflow proxy error", e);
    return json(res, e.status || 500, {
      ok: false,
      error: e.message || "FreeFlow proxy failed.",
      details: e.details || undefined,
    });
  }
};
