const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });

const safeKey = (value) =>
  String(value || "")
    .replace(/[^a-zA-Z0-9._/-]/g, "-")
    .replace(/\.{2,}/g, ".")
    .slice(0, 240);

async function usage(env) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(size_bytes), 0) AS bytes, COUNT(*) AS files FROM file_metadata",
  ).first();
  const used = Number(row?.bytes || 0);
  const limit = Number(env.MVP_MAX_STORAGE_BYTES);
  const percent = limit ? Math.round((used / limit) * 10000) / 100 : 0;
  return {
    storage: { usedBytes: used, limitBytes: limit, percent },
    files: Number(row?.files || 0),
    warning:
      percent >= 95 ? "critical" : percent >= 85 ? "high" : percent >= 70 ? "medium" : null,
    billingGuard: "Application storage is capped; Cloudflare budget alerts remain notification-only.",
  };
}

async function handleApi(request, env, url) {
  if (url.pathname === "/api/health" && request.method === "GET") {
    const db = await env.DB.prepare("SELECT 1 AS ok").first();
    return json({
      ok: db?.ok === 1,
      service: "ProQTrack MVP",
      environment: env.ENVIRONMENT,
      storage: await usage(env),
    });
  }

  if (url.pathname === "/api/usage" && request.method === "GET") {
    return json(await usage(env));
  }

  if (env.MVP_DATA_API_ENABLED !== "true") {
    return json(
      {
        error: "DATA_API_LOCKED",
        message: "MVP cloud storage is provisioned but remains locked until server authentication is enabled.",
      },
      503,
    );
  }

  if (url.pathname === "/api/state" && request.method === "GET") {
    const row = await env.DB.prepare(
      "SELECT payload, version, updated_at FROM app_snapshots WHERE id = 'primary'",
    ).first();
    return json(
      row
        ? { data: JSON.parse(row.payload), version: row.version, updatedAt: row.updated_at }
        : { data: null, version: 0, updatedAt: null },
    );
  }

  if (url.pathname === "/api/state" && request.method === "PUT") {
    const body = await request.json();
    const serialized = JSON.stringify(body.data);
    if (serialized.length > 4_000_000) {
      return json({ error: "MVP_STATE_LIMIT_EXCEEDED" }, 413);
    }
    const current = await env.DB.prepare(
      "SELECT version FROM app_snapshots WHERE id = 'primary'",
    ).first();
    const expected = Number(body.version || 0);
    if (current && Number(current.version) !== expected) {
      return json({ error: "VERSION_CONFLICT", version: current.version }, 409);
    }
    const nextVersion = Number(current?.version || 0) + 1;
    await env.DB.prepare(
      `INSERT INTO app_snapshots (id, payload, version, updated_at)
       VALUES ('primary', ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         version = excluded.version,
         updated_at = CURRENT_TIMESTAMP`,
    )
      .bind(serialized, nextVersion)
      .run();
    return json({ ok: true, version: nextVersion });
  }

  if (url.pathname === "/api/files" && request.method === "POST") {
    const contentType = request.headers.get("content-type") || "application/octet-stream";
    const length = Number(request.headers.get("content-length") || 0);
    const maxFile = Number(env.MVP_MAX_FILE_BYTES);
    if (!length || length > maxFile) {
      return json({ error: "FILE_SIZE_LIMIT", maxBytes: maxFile }, 413);
    }
    const current = await usage(env);
    if (current.storage.usedBytes + length > current.storage.limitBytes) {
      return json({ error: "MVP_STORAGE_CAP_REACHED", usage: current }, 507);
    }
    const name = safeKey(url.searchParams.get("name") || "file");
    const projectId = safeKey(url.searchParams.get("projectId"));
    const ownerId = safeKey(url.searchParams.get("ownerId"));
    const category = safeKey(url.searchParams.get("category") || "attachment");
    const key = `${projectId || "general"}/${crypto.randomUUID()}-${name}`;
    await env.FILES.put(key, request.body, {
      httpMetadata: { contentType },
      customMetadata: { projectId, ownerId, category },
    });
    await env.DB.prepare(
      `INSERT INTO file_metadata
       (object_key, owner_id, project_id, category, content_type, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(key, ownerId || null, projectId || null, category, contentType, length)
      .run();
    return json({ ok: true, key, usage: await usage(env) }, 201);
  }

  if (url.pathname.startsWith("/api/files/") && request.method === "GET") {
    const key = decodeURIComponent(url.pathname.slice("/api/files/".length));
    const object = await env.FILES.get(key);
    if (!object) return json({ error: "FILE_NOT_FOUND" }, 404);
    return new Response(object.body, {
      headers: {
        "content-type": object.httpMetadata?.contentType || "application/octet-stream",
        "cache-control": "private, max-age=300",
      },
    });
  }

  return json({ error: "NOT_FOUND" }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith("/api/")) return await handleApi(request, env, url);
      return env.ASSETS.fetch(request);
    } catch (error) {
      console.error("Request failed", error);
      return json({ error: "INTERNAL_ERROR" }, 500);
    }
  },
};
