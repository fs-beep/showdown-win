
import type { NextApiRequest, NextApiResponse } from 'next';
import { Interface } from 'ethers';

const RPC = process.env.RPC_URL || 'https://carrot.megaeth.com/mafia/rpc/203gha2ymvvv8531d14umthkq9ug0ct7z3b8am7b';
const CONTRACT = (process.env.CONTRACT_ADDRESS || '0xae2afe4d192127e6617cfa638a94384b53facec1').toLowerCase();
const TOPIC0 = '0xccc938abc01344413efee36b5d484cedd3bf4ce93b496e8021ba021fed9e2725';
const MAX_SPAN = 100_000;
const MAX_DAYS_CACHE = 120;

type Row = {
  blockNumber: number;
  txHash: string;
  logIndex: number;
  gameNumber: number;
  gameId: string;
  startedAt: string;
  winningPlayer: string;
  winningClasses: string;
  losingPlayer: string;
  losingClasses: string;
  gameLength: string;
  endReason: string;
};
type DayEntry = { fromBlock: number; toBlock: number; rows: Row[]; lastUpdate: number };
type DayAgg = { byClass: Record<string, { wins: number; losses: number; total: number }>; lastUpdate: number };

const dayCache = new Map<number, DayEntry>();
const dayOrder: number[] = [];
function remember(dayIndex: number, entry: DayEntry) {
  if (!dayCache.has(dayIndex)) dayOrder.push(dayIndex);
  dayCache.set(dayIndex, entry);
  while (dayOrder.length > MAX_DAYS_CACHE) {
    const evict = dayOrder.shift();
    if (evict !== undefined) dayCache.delete(evict);
  }
}
function dayIndexFromTs(ts: number) { return Math.floor(ts / 86400); }
function clamp(n: number, a: number, b: number) { return Math.max(a, Math.min(b, n)); }

// Optional persistent cache (Vercel KV or Upstash for Redis via REST). Falls back to in-memory only if not configured.
// We lazily import '@vercel/kv' after normalizing envs so it works with either KV_* or UPSTASH_*.
const KV_ENV_PRESENT = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
function kvKey(dayIndex: number) { return `day:${dayIndex}`; }
function kvAggKey(dayIndex: number) { return `dayAgg:${dayIndex}`; }
let _kvClient: any | null = null;
async function getKv() {
  if (!KV_ENV_PRESENT) return null;
  // Normalize Upstash → Vercel KV env names if needed
  if (!process.env.KV_REST_API_URL && process.env.UPSTASH_REDIS_REST_URL) {
    process.env.KV_REST_API_URL = process.env.UPSTASH_REDIS_REST_URL;
  }
  if (!process.env.KV_REST_API_TOKEN && process.env.UPSTASH_REDIS_REST_TOKEN) {
    process.env.KV_REST_API_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
  }
  if (!_kvClient) {
    const mod = await import('@vercel/kv');
    _kvClient = mod.kv;
  }
  return _kvClient;
}
async function kvGetDay(dayIndex: number): Promise<DayEntry | null> {
  try {
    const client = await getKv();
    if (!client) return null;
    const v = await client.get(kvKey(dayIndex));
    return (v as DayEntry | null) || null;
  } catch {
    return null;
  }
}
function computeAgg(rows: Row[]): DayAgg {
  const map: Record<string, { wins: number; losses: number; total: number }> = {};
  for (const r of rows) {
    const w = (r.winningClasses || '').trim();
    const l = (r.losingClasses || '').trim();
    if (w) { if (!map[w]) map[w] = { wins: 0, losses: 0, total: 0 }; map[w].wins += 1; map[w].total += 1; }
    if (l) { if (!map[l]) map[l] = { wins: 0, losses: 0, total: 0 }; map[l].losses += 1; map[l].total += 1; }
  }
  return { byClass: map, lastUpdate: Date.now() };
}

async function kvSetDay(dayIndex: number, entry: DayEntry): Promise<void> {
  try {
    const client = await getKv();
    if (!client) return;
    await client.set(kvKey(dayIndex), entry);
    // Also persist aggregates for fast stats
    const agg = computeAgg(entry.rows);
    await client.set(kvAggKey(dayIndex), agg);
  } catch {}
}

const iface = new Interface([
  'event GameResultEvent(uint256 gameNumber, string gameId, string startedAt, string winningPlayer, string winningClasses, string losingPlayer, string losingClasses, string gameLength, string endReason)',
]);

function toHex(n: number) { return '0x' + n.toString(16); }
function sleep(ms: number) { return new Promise(r=>setTimeout(r, ms)); }

async function rpc(body: any, attempts = 4, baseDelay = 250) {
  let lastErr: any = null;
  for (let i=0;i<attempts;i++) {
    try {
      const res = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error('RPC HTTP ' + res.status);
      const j = await res.json();
      if (Array.isArray(j)) {
        const bad = j.find((x:any)=>x && x.error);
        if (bad) throw new Error(bad.error?.message || 'RPC batch error');
      } else if (j && j.error) {
        throw new Error(j.error?.message || 'RPC error');
      }
      return j;
    } catch (e:any) {
      lastErr = e;
      await sleep(Math.round(baseDelay * Math.pow(1.6, i)));
    }
  }
  throw lastErr || new Error('RPC failed after retries');
}

async function getBlockByTag(tag: string): Promise<{ num:number; ts:number }> {
  const j = await rpc({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: [tag, false] });
  const blk = j?.result;
  if (!blk) throw new Error('Block not found');
  return { num: parseInt(blk.number, 16), ts: parseInt(blk.timestamp, 16) };
}
async function getBlockByNumber(n: number) { return getBlockByTag(toHex(n)); }
async function getEarliest() { return getBlockByTag('earliest'); }
async function getLatest() { return getBlockByTag('latest'); }

async function findBlockAtOrAfter(targetTs: number): Promise<number> {
  const earliest = await getEarliest();
  const latest = await getLatest();
  if (targetTs <= earliest.ts) return earliest.num;
  if (targetTs > latest.ts) return latest.num;
  let lo = earliest.num, hi = latest.num;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const b = await getBlockByNumber(mid);
    if (b.ts >= targetTs) hi = mid; else lo = mid + 1;
  }
  return lo;
}
async function findBlockAtOrBefore(targetTs: number): Promise<number> {
  const earliest = await getEarliest();
  const latest = await getLatest();
  if (targetTs < earliest.ts) return earliest.num;
  if (targetTs >= latest.ts) return latest.num;
  let lo = earliest.num, hi = latest.num;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo + 1) / 2);
    const b = await getBlockByNumber(mid);
    if (b.ts <= targetTs) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function buildRanges(fromBlock: number, toBlock: number) {
  const ranges: Array<{ from: number; to: number }> = [];
  let s = fromBlock;
  while (s <= toBlock) {
    const e = Math.min(s + MAX_SPAN - 1, toBlock);
    ranges.push({ from: s, to: e });
    s = e + 1;
  }
  return ranges;
}

async function getLogsSingle(fromBlock: number, toBlock: number) {
  const j = await rpc({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: toHex(fromBlock), toBlock: toHex(toBlock), address: CONTRACT, topics: [TOPIC0] }] });
  const arr = j?.result || [];
  // Defensive: some RPC providers can occasionally return duplicate logs in large ranges
  const uniq = new Map<string, any>();
  for (const log of arr) {
    const key = `${log.transactionHash}-${parseInt(log.logIndex, 16)}`;
    uniq.set(key, log);
  }
  return Array.from(uniq.values());
}
async function getLogsChunked(fromBlock: number, toBlock: number) {
  const ranges = buildRanges(fromBlock, toBlock);
  let all: any[] = [];
  const CONCURRENCY = 8;
  for (let i=0; i<ranges.length; i+=CONCURRENCY) {
    const slice = ranges.slice(i, i+CONCURRENCY);
    const reqs = slice.map((r, idx) => rpc({ jsonrpc: '2.0', id: 1000+i+idx, method: 'eth_getLogs', params: [{ fromBlock: toHex(r.from), toBlock: toHex(r.to), address: CONTRACT, topics: [TOPIC0] }] }));
    const parts = await Promise.all(reqs);
    for (const p of parts) all.push(...(p?.result || []));
  }
  const uniq = new Map<string, any>();
  for (const log of all) {
    const key = `${log.transactionHash}-${parseInt(log.logIndex, 16)}`;
    uniq.set(key, log);
  }
  return Array.from(uniq.values());
}

function decode(log: any): Row | null {
  try {
    const ifaceObj = new Interface([
      'event GameResultEvent(uint256 gameNumber, string gameId, string startedAt, string winningPlayer, string winningClasses, string losingPlayer, string losingClasses, string gameLength, string endReason)',
    ]);
    const parsed = ifaceObj.parseLog({ topics: log.topics, data: log.data });
    const [gameNumber, gameId, startedAt, winningPlayer, winningClasses, losingPlayer, losingClasses, gameLength, endReason] = (parsed as any).args as any[];
    return {
      blockNumber: parseInt(log.blockNumber, 16),
      txHash: log.transactionHash,
      logIndex: parseInt(log.logIndex, 16),
      gameNumber: Number(gameNumber?.toString?.() ?? gameNumber),
      gameId: String(gameId),
      startedAt: String(startedAt),
      winningPlayer: String(winningPlayer),
      winningClasses: String(winningClasses),
      losingPlayer: String(losingPlayer),
      losingClasses: String(losingClasses),
      gameLength: String(gameLength),
      endReason: String(endReason),
    };
  } catch { return null; }
}

function parseStartedAtTs(str: string): number | null {
  if (!str) return null;
  // Common on-chain string: "YYYY-MM-DD HH:mm:ss UTC"
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[ T]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\s*(?:UTC|Z))?$/i.exec(str.trim());
  if (m) {
    const year = Number(m[1]);
    const month = Number(m[2]) - 1; // JS months are 0-based
    const day = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6]);
    const ms = Date.UTC(year, month, day, hour, minute, second);
    return Math.floor(ms / 1000);
  }
  // Fallback: try to coerce to ISO
  const iso = str.replace(' ', 'T').replace(/\s*UTC$/i, 'Z');
  const ms = Date.parse(iso);
  if (isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}
function filterRowsByTs(rows: Row[], startTs: number, endTs: number): Row[] {
  return rows.filter((r) => {
    const ts = parseStartedAtTs(r.startedAt);
    if (ts == null) return true;
    return ts >= startTs && ts <= endTs;
  });
}
function stableRowKey(r: Row): string {
  const anyR: any = r as any;
  if (typeof anyR.logIndex === 'number' && !isNaN(anyR.logIndex)) return `${r.txHash}:${anyR.logIndex}`;
  if (r.gameId) return `gid:${r.gameId}`;
  return `${r.txHash}:${r.blockNumber}`;
}

async function buildDay(dayStartTs: number, dayEndTs: number, latestTs: number) {
  const key = Math.floor(dayStartTs / 86400);
  const endTs = Math.min(Math.max(dayEndTs, 0), latestTs);
  const fromBlock = await findBlockAtOrAfter(dayStartTs);
  const toBlock = await findBlockAtOrBefore(endTs);
  if (toBlock < fromBlock) return { key, entry: { fromBlock, toBlock, rows: [], lastUpdate: Date.now() } };
  try {
    const logs = await getLogsSingle(fromBlock, toBlock);
    const rows = (logs as any[]).map(decode).filter(Boolean) as Row[];
    // Extra safety: dedupe by (txHash, logIndex)
    const uniq = new Map<string, Row>();
    for (const r of rows) uniq.set(`${r.txHash}:${r.logIndex}`, r);
    const uniqueRows = Array.from(uniq.values());
    return { key, entry: { fromBlock, toBlock, rows: uniqueRows, lastUpdate: Date.now() } };
  } catch {
    const logs = await getLogsChunked(fromBlock, toBlock);
    const rows = (logs as any[]).map(decode).filter(Boolean) as Row[];
    const uniq = new Map<string, Row>();
    for (const r of rows) uniq.set(`${r.txHash}:${r.logIndex}`, r);
    const uniqueRows = Array.from(uniq.values());
    return { key, entry: { fromBlock, toBlock, rows: uniqueRows, lastUpdate: Date.now() } };
  }
}

async function extendToday(existing: DayEntry, dayStartTs: number, dayEndTs: number, latestTs: number): Promise<DayEntry> {
  const fromBlock = existing.toBlock + 1;
  const toBlock = await findBlockAtOrBefore(Math.min(Math.max(dayEndTs, 0), latestTs));
  if (toBlock < fromBlock) return existing;
  let newLogs: any[] = [];
  try {
    newLogs = await getLogsSingle(fromBlock, toBlock);
  } catch {
    newLogs = await getLogsChunked(fromBlock, toBlock);
  }
  const newRows = (newLogs as any[]).map(decode).filter(Boolean) as Row[];
  const merged = [...existing.rows, ...newRows];
  const uniq = new Map<string, Row>();
  for (const r of merged) {
    const idxOrBlock = (typeof (r as any).logIndex === 'number' && !isNaN((r as any).logIndex)) ? (r as any).logIndex : r.blockNumber;
    uniq.set(`${r.txHash}:${idxOrBlock}`, r);
  }
  return { fromBlock: existing.fromBlock, toBlock, rows: Array.from(uniq.values()), lastUpdate: Date.now() };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { startTs, endTs, rebuildDay, wantAgg } = (req.body || {}) as { startTs?: number; endTs?: number; rebuildDay?: number; wantAgg?: boolean };
    // Admin: rebuild a specific day (UTC day index)
    if (typeof rebuildDay === 'number' && rebuildDay >= 0) {
      const latest = await getLatest();
      const start = rebuildDay * 86400;
      const end = start + 86399;
      const built = await buildDay(start, end, latest.ts);
      remember(built.key, built.entry);
      await kvSetDay(built.key, built.entry);
      return res.status(200).json({ ok: true, rebuilt: built.key, fromBlock: built.entry.fromBlock, toBlock: built.entry.toBlock, rows: built.entry.rows.length });
    }
    const earliest = await getEarliest();
    const latest = await getLatest();

    const sTs = typeof startTs === 'number' && startTs > 0 ? startTs : earliest.ts;
    const eTs = typeof endTs === 'number' && endTs > 0 ? endTs : latest.ts;
    if (eTs < sTs) return res.status(200).json({ ok: true, rows: [] });

    const startDay = Math.floor(sTs / 86400);
    const endDay = Math.floor(eTs / 86400);
    const todayDay = Math.floor(latest.ts / 86400);

    const dayRanges: Array<{ key:number, start:number, end:number }> = [];
    for (let d = startDay; d <= endDay; d++) {
      const dayStart = d * 86400;
      const dayEnd = dayStart + 86399;
      dayRanges.push({ key: d, start: Math.max(dayStart, sTs), end: Math.min(dayEnd, eTs) });
    }

    const resultRows: Row[] = [];

    const CONC = 6;
    for (let i=0; i<dayRanges.length; i+=CONC) {
      const slice = dayRanges.slice(i, i+CONC).map(async (r) => {
        // 1) Try in-memory first (fast)
        const mem = dayCache.get(r.key);
        if (mem && r.key < todayDay) {
          resultRows.push(...mem.rows);
          return;
        }
        if (mem && r.key === todayDay) {
          const updated = await extendToday(mem, r.start, r.end, latest.ts);
          remember(r.key, updated);
          await kvSetDay(r.key, updated);
          resultRows.push(...updated.rows);
          return;
        }

        // 2) Try persistent KV
        const fromKv = await kvGetDay(r.key);
        if (fromKv && r.key < todayDay) {
          remember(r.key, fromKv);
          resultRows.push(...fromKv.rows);
          return;
        }
        if (fromKv && r.key === todayDay) {
          const updated = await extendToday(fromKv, r.start, r.end, latest.ts);
          remember(r.key, updated);
          await kvSetDay(r.key, updated);
          resultRows.push(...updated.rows);
          return;
        }

        // 3) Build fresh and persist
        const built = await buildDay(r.start, r.end, latest.ts);
        remember(built.key, built.entry);
        await kvSetDay(built.key, built.entry);
        resultRows.push(...built.entry.rows);
      });
      await Promise.all(slice);
    }

    // First constrain precisely to the requested [sTs, eTs] window (even if cached full days were used)
    const windowed = filterRowsByTs(resultRows, sTs, eTs);

    // Final defensive pass: dedupe across days and cache formats
    const byKey = new Map<string, Row>();
    for (const r of windowed) byKey.set(stableRowKey(r), r);
    const out = Array.from(byKey.values());
    out.sort((a,b)=> a.blockNumber - b.blockNumber);
    if (wantAgg) {
      const agg = computeAgg(out);
      return res.status(200).json({ ok: true, rows: out, aggByClass: agg.byClass, aggLastUpdate: agg.lastUpdate });
    }
    res.status(200).json({ ok: true, rows: out });
  } catch (e:any) {
    res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
}
