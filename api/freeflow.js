// Vercel serverless proxy for FreeFlow.
// Keeps FREEFLOW_API_KEY server-side only.
// Frontend should call /api/freeflow, never free-flow.site directly.

const BASE = "https://www.free-flow.site/public";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
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
  let exact = sorted.find((exp) => daysBetweenToday(exp) === target);
  if (exact) return exact;
  return sorted.find((exp) => daysBetweenToday(exp) >= target) || sorted[0] || null;
}

async function ff(path, params, key) {
  const url = new URL(BASE + path);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });

  const r = await fetch(url.toString(), {
    headers: { "X-API-Key": key },
  });

  const text = await r.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!r.ok) {
    const safe = r.status === 401
      ? "FreeFlow rejected the API key. Check FREEFLOW_API_KEY in Vercel and redeploy."
      : `FreeFlow ${path} returned HTTP ${r.status}`;
    const err = new Error(safe);
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
    []
  );
}

function cleanKey(value) {
  return String(value || "")
    .trim()
    .replace(/^FREEFLOW_API_KEY\s*=\s*/i, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

module.exports = async function handler(req, res) {
  try {
    const key = cleanKey(process.env.FREEFLOW_API_KEY);

    if (req.query && req.query.debug === "1") {
      return json(res, 200, {
        ok: true,
        keyPresent: Boolean(key),
        keyStartsWithFf: key.startsWith("ff_"),
        keyLength: key.length,
        note: "This does not expose the key. If keyLength is wrong or keyStartsWithFf is false, fix Vercel env variable."
      });
    }

    if (!key || !key.startsWith("ff_")) {
      return json(res, 500, {
        ok: false,
        error: "Missing or invalid FREEFLOW_API_KEY on the server.",
        fix: "Add FREEFLOW_API_KEY in Vercel Environment Variables, paste only the ff_ key, then redeploy with build cache disabled.",
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
    const expirations = Array.isArray(expirationsRaw)
      ? expirationsRaw
      : (expirationsRaw.expirations || []);

    const exp = pickExpiration(expirations, requestedDte, requestedExp);

    if (endpoint === "expirations") {
      return json(res, 200, { ok: true, symbol, expirations, selectedExpiration: exp });
    }

    if (!exp) {
      return json(res, 404, { ok: false, error: "No expiration found from FreeFlow.", symbol, expirations });
    }

    if (endpoint === "walls") {
      const walls = await ff("/walls", { symbol, exp }, key);
      return json(res, 200, { ok: true, symbol, expiration: exp, expirations, ...walls });
    }

    if (endpoint === "snapshot") {
      const snapshot = await ff("/snapshot", { symbol, exp }, key);
      return json(res, 200, { ok: true, symbol, expiration: exp, expirations, ...snapshot });
    }

    if (endpoint === "chart") {
      const chart = await ff("/chart", { symbol, range: q.range || "3mo", interval: q.interval || undefined }, key);
      return json(res, 200, { ok: true, ...chart });
    }

    // Default/full gamma payload: expirations + walls + snapshot + contracts in one response.
    const [walls, snapshot] = await Promise.all([
      ff("/walls", { symbol, exp }, key),
      ff("/snapshot", { symbol, exp }, key),
    ]);

    const contracts = contractsFromSnapshot(snapshot);

    return json(res, 200, {
      ok: true,
      symbol,
      targetSymbol: "NQ",
      source: "FreeFlow QQQ options",
      expiration: exp,
      expirations,
      dte: snapshot?.dte ?? daysBetweenToday(exp),
      spot: snapshot?.spot ?? walls?.spot ?? null,
      qqqSpot: snapshot?.spot ?? walls?.spot ?? null,
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
