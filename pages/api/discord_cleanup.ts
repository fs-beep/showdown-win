import type { NextApiRequest, NextApiResponse } from 'next';

const DISCORD_API = 'https://discord.com/api/v10';

type DiscordThread = {
  id: string;
  name?: string;
  thread_metadata?: {
    archived?: boolean;
    archive_timestamp?: string; // ISO
    locked?: boolean;
    auto_archive_duration?: number;
  };
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function discordFetch(path: string, opts: RequestInit, token: string, attempt = 0): Promise<Response> {
  const res = await fetch(`${DISCORD_API}${path}`, {
    ...opts,
    headers: {
      'Authorization': `Bot ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (res.status === 429) {
    // Rate limited; respect retry-after
    const retry = Number(res.headers.get('Retry-After')) || 1;
    await sleep((retry + 0.5) * 1000);
    if (attempt < 5) return discordFetch(path, opts, token, attempt + 1);
  }
  return res;
}

// Discord snowflake to timestamp (ms)
function snowflakeToTimestampMs(id: string): number {
  try {
    const asBig = BigInt(id);
    const tsPart = Number(asBig >> 22n);
    return tsPart + 1420070400000; // Discord epoch
  } catch {
    return 0;
  }
}

async function listActiveThreads(channelId: string, token: string): Promise<DiscordThread[]> {
  const res = await discordFetch(`/channels/${channelId}/threads/active`, { method: 'GET' }, token);
  if (!res.ok) return [];
  const j = await res.json() as { threads?: DiscordThread[] };
  return j?.threads || [];
}

async function listArchivedThreadsOnce(channelId: string, token: string, kind: 'public' | 'private', beforeIso?: string): Promise<{ threads: DiscordThread[]; hasMore: boolean; beforeNext?: string }> {
  const qp = new URLSearchParams();
  // Discord expects `before` as ISO8601 for archived listing
  if (beforeIso) qp.set('before', beforeIso);
  qp.set('limit', '50');
  const res = await discordFetch(`/channels/${channelId}/threads/archived/${kind}?${qp.toString()}`, { method: 'GET' }, token);
  if (!res.ok) return { threads: [], hasMore: false };
  const j = await res.json() as { threads?: DiscordThread[]; has_more?: boolean };
  const threads = j?.threads || [];
  // next cursor: use the oldest archive_timestamp we saw
  const times = threads.map(t => t.thread_metadata?.archive_timestamp).filter(Boolean) as string[];
  const minIso = times.length ? times.sort()[0] : undefined;
  return { threads, hasMore: !!j?.has_more, beforeNext: minIso };
}

async function listArchivedThreadsAll(channelId: string, token: string, kind: 'public' | 'private', stopBeforeMs: number): Promise<DiscordThread[]> {
  const out: DiscordThread[] = [];
  let beforeIso: string | undefined = undefined;
  // We paginate a few pages best-effort to avoid long runs; daily cron will catch up
  for (let i = 0; i < 6; i++) {
    const { threads, hasMore, beforeNext } = await listArchivedThreadsOnce(channelId, token, kind, beforeIso);
    out.push(...threads);
    if (!hasMore || !beforeNext) break;
    // If the next page would already be older than TTL, we can still fetch one more page; otherwise continue
    beforeIso = beforeNext;
    // Fast stop if the page is already very old
    const oldest = threads
      .map(t => t.thread_metadata?.archive_timestamp)
      .filter(Boolean)
      .map(s => Date.parse(s as string))
      .sort((a, b) => a - b)[0];
    if (oldest && oldest < stopBeforeMs) break;
  }
  return out;
}

async function deleteThread(threadId: string, token: string): Promise<boolean> {
  const res = await discordFetch(`/channels/${threadId}`, { method: 'DELETE' }, token);
  if (res.status === 404) return true; // already gone
  return res.ok;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'POST only' });
    }
    const token = process.env.DISCORD_BOT_TOKEN || '';
    const channelsCsv = process.env.DISCORD_CHANNEL_IDS || '';
    const ttlHours = Number(process.env.THREAD_TTL_HOURS || req.body?.ttlHours || 168); // default 7 days
    if (!token || !channelsCsv) {
      return res.status(200).json({ ok: false, error: 'Missing DISCORD_BOT_TOKEN or DISCORD_CHANNEL_IDS' });
    }
    const channelIds = channelsCsv.split(',').map(s => s.trim()).filter(Boolean);
    const cutoffMs = Date.now() - ttlHours * 3600 * 1000;

    let scanned = 0;
    let toDelete: string[] = [];

    for (const ch of channelIds) {
      // Active threads
      const active = await listActiveThreads(ch, token);
      scanned += active.length;
      for (const t of active) {
        const createdMs = snowflakeToTimestampMs(t.id);
        if (createdMs && createdMs < cutoffMs) toDelete.push(t.id);
      }
      // Archived public + private
      const archPub = await listArchivedThreadsAll(ch, token, 'public', cutoffMs);
      const archPriv = await listArchivedThreadsAll(ch, token, 'private', cutoffMs);
      scanned += archPub.length + archPriv.length;
      for (const t of [...archPub, ...archPriv]) {
        const createdMs = snowflakeToTimestampMs(t.id);
        if (createdMs && createdMs < cutoffMs) toDelete.push(t.id);
      }
    }

    // De-dupe
    toDelete = Array.from(new Set(toDelete));

    // Delete with gentle concurrency
    let deleted = 0, failed = 0;
    const CONC = 4;
    for (let i = 0; i < toDelete.length; i += CONC) {
      const slice = toDelete.slice(i, i + CONC);
      const results = await Promise.all(slice.map(async (id) => {
        const ok = await deleteThread(id, token);
        return ok;
      }));
      for (const ok of results) ok ? deleted++ : failed++;
      // Short nap to be nice to rate limits
      await sleep(300);
    }

    res.status(200).json({ ok: true, scanned, considered: toDelete.length, deleted, failed, ttlHours });
  } catch (e: any) {
    res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
}


