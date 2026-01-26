import type { NextApiRequest, NextApiResponse } from 'next';
import { kv } from '@vercel/kv';
import { gzipSync } from 'zlib';
import { randomBytes } from 'crypto';

type SharePayload = {
  createdAt: number;
  params: { start?: string; end?: string; player?: string; only?: string; compare?: string };
  rows: any[];
  aggByClass?: Record<string, { wins: number; losses: number; total: number }>;
  aggLastUpdate?: number | null;
};

function sendJson(res: NextApiResponse, status: number, payload: any) {
  const json = JSON.stringify(payload);
  const gz = gzipSync(json);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  res.status(status).send(gz);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) {
      return sendJson(res, 200, { ok: false, error: 'Sharing requires KV to be configured.' });
    }
    if (req.method === 'POST') {
      const body = (req.body || {}) as SharePayload;
      const id = randomBytes(8).toString('hex');
      const key = `share:${id}`;
      const payload: SharePayload = {
        createdAt: Date.now(),
        params: body.params || {},
        rows: Array.isArray(body.rows) ? body.rows : [],
        aggByClass: body.aggByClass,
        aggLastUpdate: body.aggLastUpdate ?? null,
      };
      await kv.set(key, payload, { ex: 60 * 60 * 24 * 7 });
      return sendJson(res, 200, { ok: true, id });
    }
    if (req.method === 'GET') {
      const id = typeof req.query.id === 'string' ? req.query.id : '';
      if (!id) return sendJson(res, 200, { ok: false, error: 'Missing id.' });
      const data = await kv.get<SharePayload>(`share:${id}`);
      if (!data) return sendJson(res, 200, { ok: false, error: 'Snapshot not found or expired.' });
      return sendJson(res, 200, { ok: true, data });
    }
    return sendJson(res, 200, { ok: false, error: 'Unsupported method.' });
  } catch (e: any) {
    return sendJson(res, 200, { ok: false, error: e?.message || String(e) });
  }
}
