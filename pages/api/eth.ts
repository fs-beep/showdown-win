
import type { NextApiRequest, NextApiResponse } from 'next';
import { Interface } from 'ethers';
import { gzipSync } from 'zlib';

const RPC = process.env.RPC_URL || 'https://timothy.megaeth.com/mafia/rpc/l1z4x7c0v3b6n9m2a5s8d1f4g7h0j3k6q9w2e5r8';
const CONTRACT = (process.env.CONTRACT_ADDRESS || '0x86b6f3856f086cd29462985f7bbff0d55d2b5d53').toLowerCase();
const LEGACY_CONTRACT = '0xae2afe4d192127e6617cfa638a94384b53facec1'.toLowerCase();
const LEGACY_TOPIC0 = '0xccc938abc01344413efee36b5d484cedd3bf4ce93b496e8021ba021fed9e2725';
const TOPIC0 = '0x95340ecf2fd1c1da827f4cf010d0726c65c2e05684a492c4eeaa6ac1b91babf0';
// New contract started around Nov 15, 2025 00:00:00 UTC (legacy contract stopped around then)
const NEW_CONTRACT_START_TS = Math.floor(new Date('2025-11-15T00:00:00Z').getTime() / 1000);
const MAX_SPAN = 100_000;
const MAX_DAYS_CACHE = 120;
const RPC_RETRY_ATTEMPTS = 6;
const RPC_BASE_DELAY_MS = 800;
const DAY_RANGE_CONCURRENCY = 10; // Increased for faster KV cache retrieval
const LOG_RANGE_CONCURRENCY = 2;

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
  gameType?: string;
  metadata?: string;
  network?: 'legacy' | 'megaeth-testnet-v2';
};
type DayEntry = { fromBlock: number; toBlock: number; rows: Row[]; lastUpdate: number };
type DayAgg = { byClass: Record<string, { wins: number; losses: number; total: number }>; lastUpdate: number };
type BlockInfo = { num: number; ts: number };
type BlockBounds = { earliest: BlockInfo; latest: BlockInfo };

const CACHE_NAMESPACE = (process.env.CACHE_NAMESPACE || `${CONTRACT}:${TOPIC0}`).toLowerCase();
function memKey(dayIndex: number) { return `${CACHE_NAMESPACE}:${dayIndex}`; }
const dayCache = new Map<string, DayEntry>();
const dayOrder: string[] = [];
function remember(dayIndex: number, entry: DayEntry) {
  const key = memKey(dayIndex);
  if (!dayCache.has(key)) dayOrder.push(key);
  dayCache.set(key, entry);
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
function kvKey(dayIndex: number) { return `${CACHE_NAMESPACE}:day:${dayIndex}`; }
function kvAggKey(dayIndex: number) { return `${CACHE_NAMESPACE}:dayAgg:${dayIndex}`; }
function legacyKvKey(dayIndex: number) { return `day:${dayIndex}`; }
function legacyKvAggKey(dayIndex: number) { return `dayAgg:${dayIndex}`; }
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
    const dayStartTs = dayIndex * 86400;
    const needsNewContract = dayStartTs >= NEW_CONTRACT_START_TS;
    
    if (needsNewContract) {
      // For days after Nov 15, ONLY use new contract cache - never fall back to legacy
      const newKey = await client.get(kvKey(dayIndex));
      return newKey as DayEntry | null;
    } else {
      // For days before Nov 15, try both keys (legacy might have data)
      const [newKey, legacyKey] = await Promise.all([
        client.get(kvKey(dayIndex)),
        client.get(legacyKvKey(dayIndex)),
      ]);
      return (newKey || legacyKey) as DayEntry | null;
    }
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
  'event GameResultEvent(uint256 gameNumber, string gameId, string startedAt, string winningPlayer, string winningClasses, string losingPlayer, string losingClasses, string gameLength, string endReason, string gameType, string metadata)',
]);
const legacyIface = new Interface([
  'event GameResultEvent(uint256 gameNumber, string gameId, string startedAt, string winningPlayer, string winningClasses, string losingPlayer, string losingClasses, string gameLength, string endReason)',
]);

function toHex(n: number) { return '0x' + n.toString(16); }
function sleep(ms: number) { return new Promise(r=>setTimeout(r, ms)); }
function normalizePlayer(raw: string): string {
  const val = (raw || '').trim();
  const idx = val.indexOf('#');
  return idx === -1 ? val : val.slice(0, idx);
}
function sendJson(res: NextApiResponse, status: number, payload: any) {
  const json = JSON.stringify(payload);
  const gz = gzipSync(json);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Encoding', 'gzip');
  res.status(status).send(gz);
}

async function rpc(body: any, attempts = RPC_RETRY_ATTEMPTS, baseDelay = RPC_BASE_DELAY_MS) {
  let lastErr: any = null;
  for (let i=0;i<attempts;i++) {
    try {
      const res = await fetch(RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.status === 429 || res.status === 503) {
        lastErr = new Error('RPC HTTP ' + res.status);
        const retryAfter = Number(res.headers.get('retry-after'));
        const wait = retryAfter > 0 ? retryAfter * 1000 : Math.round(baseDelay * Math.pow(1.8, i));
        await sleep(wait);
        continue;
      }
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

async function findBlockAtOrAfter(targetTs: number, bounds?: BlockBounds): Promise<number> {
  const earliest = bounds?.earliest ?? await getEarliest();
  const latest = bounds?.latest ?? await getLatest();
  const clamped = Math.max(targetTs, earliest.ts);
  if (clamped <= earliest.ts) return earliest.num;
  if (clamped > latest.ts) return latest.num;
  let lo = earliest.num, hi = latest.num;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2);
    const b = await getBlockByNumber(mid);
    if (b.ts >= clamped) hi = mid; else lo = mid + 1;
  }
  return lo;
}
async function findBlockAtOrBefore(targetTs: number, bounds?: BlockBounds): Promise<number> {
  const earliest = bounds?.earliest ?? await getEarliest();
  const latest = bounds?.latest ?? await getLatest();
  const clamped = Math.min(targetTs, latest.ts);
  if (clamped < earliest.ts) return earliest.num;
  if (clamped >= latest.ts) return latest.num;
  let lo = earliest.num, hi = latest.num;
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo + 1) / 2);
    const b = await getBlockByNumber(mid);
    if (b.ts <= clamped) lo = mid; else hi = mid - 1;
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

async function getLogsSingle(fromBlock: number, toBlock: number, contract: string = CONTRACT, topic0: string = TOPIC0) {
  const j = await rpc({ jsonrpc: '2.0', id: 1, method: 'eth_getLogs', params: [{ fromBlock: toHex(fromBlock), toBlock: toHex(toBlock), address: contract, topics: [topic0] }] });
  const arr = j?.result || [];
  // Defensive: some RPC providers can occasionally return duplicate logs in large ranges
  const uniq = new Map<string, any>();
  for (const log of arr) {
    const key = `${log.transactionHash}-${parseInt(log.logIndex, 16)}`;
    uniq.set(key, log);
  }
  return Array.from(uniq.values());
}
async function getLogsChunked(fromBlock: number, toBlock: number, contract: string = CONTRACT, topic0: string = TOPIC0) {
  const ranges = buildRanges(fromBlock, toBlock);
  let all: any[] = [];
  const CONCURRENCY = Math.max(1, LOG_RANGE_CONCURRENCY);
  for (let i=0; i<ranges.length; i+=CONCURRENCY) {
    const slice = ranges.slice(i, i+CONCURRENCY);
    const reqs = slice.map((r, idx) => rpc({ jsonrpc: '2.0', id: 1000+i+idx, method: 'eth_getLogs', params: [{ fromBlock: toHex(r.from), toBlock: toHex(r.to), address: contract, topics: [topic0] }] }));
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
    const parsed = iface.parseLog({ topics: log.topics, data: log.data });
    const [gameNumber, gameId, startedAt, winningPlayer, winningClasses, losingPlayer, losingClasses, gameLength, endReason, gameType, metadata] = (parsed as any).args as any[];
    return {
      blockNumber: parseInt(log.blockNumber, 16),
      txHash: log.transactionHash,
      logIndex: parseInt(log.logIndex, 16),
      gameNumber: Number(gameNumber?.toString?.() ?? gameNumber),
      gameId: String(gameId),
      startedAt: String(startedAt),
      winningPlayer: normalizePlayer(String(winningPlayer)),
      winningClasses: String(winningClasses),
      losingPlayer: normalizePlayer(String(losingPlayer)),
      losingClasses: String(losingClasses),
      gameLength: String(gameLength),
      endReason: String(endReason),
      gameType: gameType != null ? String(gameType) : undefined,
      metadata: metadata != null ? String(metadata) : undefined,
      network: 'megaeth-testnet-v2',
    };
  } catch { return null; }
}

function decodeLegacy(log: any): Row | null {
  try {
    const parsed = legacyIface.parseLog({ topics: log.topics, data: log.data });
    const [gameNumber, gameId, startedAt, winningPlayer, winningClasses, losingPlayer, losingClasses, gameLength, endReason] = (parsed as any).args as any[];
    return {
      blockNumber: parseInt(log.blockNumber, 16),
      txHash: log.transactionHash,
      logIndex: parseInt(log.logIndex, 16),
      gameNumber: Number(gameNumber?.toString?.() ?? gameNumber),
      gameId: String(gameId),
      startedAt: String(startedAt),
      winningPlayer: normalizePlayer(String(winningPlayer)),
      winningClasses: String(winningClasses),
      losingPlayer: normalizePlayer(String(losingPlayer)),
      losingClasses: String(losingClasses),
      gameLength: String(gameLength),
      endReason: String(endReason),
      network: 'legacy',
    };
  } catch { return null; }
}

function decodeLogs(logs: any[], isLegacy: boolean = false): Row[] {
  const decoder = isLegacy ? decodeLegacy : decode;
  return (logs as any[]).map(decoder).filter(Boolean) as Row[];
}

function dedupeRows(rows: Row[]): Row[] {
  const uniq = new Map<string, Row>();
  for (const r of rows) {
    const idxOrBlock = (typeof (r as any).logIndex === 'number' && !isNaN((r as any).logIndex)) ? (r as any).logIndex : r.blockNumber;
    uniq.set(`${r.txHash}:${idxOrBlock}`, r);
  }
  return Array.from(uniq.values());
}
function mergeRows(a: Row[], b: Row[]): Row[] {
  const map = new Map<string, Row>();
  for (const r of a) map.set(stableRowKey(r), r);
  for (const r of b) map.set(stableRowKey(r), r);
  return Array.from(map.values());
}
function hasMegaRows(entry: DayEntry | null | undefined) {
  return Boolean(entry?.rows?.some(r => r.network === 'megaeth-testnet-v2'));
}
function mergeDayEntries(a: DayEntry | null, b: DayEntry | null): DayEntry | null {
  if (!a) return b;
  if (!b) return a;
  const rows = dedupeRows([...a.rows, ...b.rows]).sort(sortByTimestamp);
  return {
    fromBlock: Math.min(a.fromBlock, b.fromBlock),
    toBlock: Math.max(a.toBlock, b.toBlock),
    rows,
    lastUpdate: Date.now(),
  };
}
async function ensureMegaRows(entry: DayEntry | null, dayStartTs: number, dayEndTs: number, bounds: BlockBounds) {
  if (hasMegaRows(entry)) return entry!;
  const built = await buildDay(dayStartTs, dayEndTs, bounds);
  const merged = mergeDayEntries(entry, built.entry);
  return merged || built.entry;
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
function sortByTimestamp(a: Row, b: Row): number {
  const tsA = parseStartedAtTs(a.startedAt);
  const tsB = parseStartedAtTs(b.startedAt);
  if (tsA !== null && tsB !== null) return tsB - tsA; // newest first
  if (tsA !== null) return -1; // a has timestamp, b doesn't - a comes first
  if (tsB !== null) return 1; // b has timestamp, a doesn't - b comes first
  return b.blockNumber - a.blockNumber; // fallback to blockNumber (newest first)
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

async function buildDay(dayStartTs: number, dayEndTs: number, bounds: BlockBounds) {
  const key = Math.floor(dayStartTs / 86400);
  const safeStart = Math.max(dayStartTs, bounds.earliest.ts);
  const endTs = Math.min(Math.max(dayEndTs, 0), bounds.latest.ts);
  const fromBlock = await findBlockAtOrAfter(safeStart, bounds);
  const toBlock = await findBlockAtOrBefore(endTs, bounds);
  if (toBlock < fromBlock) return { key, entry: { fromBlock, toBlock, rows: [], lastUpdate: Date.now() } };
  
  // Determine which contract to use based on the day start timestamp
  // For Nov 15 and later, use new contract; before Nov 15, use legacy
  const isLegacyDay = dayStartTs < NEW_CONTRACT_START_TS;
  const contract = isLegacyDay ? LEGACY_CONTRACT : CONTRACT;
  const topic0 = isLegacyDay ? LEGACY_TOPIC0 : TOPIC0;
  const isLegacy = isLegacyDay;
  
  // Safety: For days after Nov 15, ensure we're using the new contract
  if (dayStartTs >= NEW_CONTRACT_START_TS && contract !== CONTRACT) {
    // This should never happen, but if it does, use new contract
    const logs = await getLogsChunked(fromBlock, toBlock, CONTRACT, TOPIC0);
    const rows = dedupeRows(decodeLogs(logs, false));
    return { key, entry: { fromBlock, toBlock, rows, lastUpdate: Date.now() } };
  }
  
  try {
    const logs = await getLogsSingle(fromBlock, toBlock, contract, topic0);
    const rows = dedupeRows(decodeLogs(logs, isLegacy));
    return { key, entry: { fromBlock, toBlock, rows, lastUpdate: Date.now() } };
  } catch {
    const logs = await getLogsChunked(fromBlock, toBlock, contract, topic0);
    const rows = dedupeRows(decodeLogs(logs, isLegacy));
    return { key, entry: { fromBlock, toBlock, rows, lastUpdate: Date.now() } };
  }
}

async function extendToday(existing: DayEntry, dayStartTs: number, dayEndTs: number, bounds: BlockBounds): Promise<DayEntry> {
  const fromBlock = existing.toBlock + 1;
  const toBlock = await findBlockAtOrBefore(Math.min(Math.max(dayEndTs, 0), bounds.latest.ts), bounds);
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

async function fetchRangeRowsDirect(startTs: number, endTs: number, bounds: BlockBounds): Promise<Row[]> {
  const clampedStart = Math.max(startTs, bounds.earliest.ts);
  const clampedEnd = Math.min(Math.max(endTs, clampedStart), bounds.latest.ts);
  if (clampedEnd < clampedStart) return [];
  
  // Optimize: only query contracts that have data for this date range
  const needsLegacy = clampedStart < NEW_CONTRACT_START_TS;
  const needsNew = clampedEnd >= NEW_CONTRACT_START_TS;
  
  const queries: Promise<Row[]>[] = [];
  
  if (needsLegacy) {
    // Query legacy contract for dates before new contract started
    const legacyEndTs = Math.min(clampedEnd, NEW_CONTRACT_START_TS - 1);
    const legacyFromBlock = await findBlockAtOrAfter(clampedStart, bounds);
    const legacyToBlock = await findBlockAtOrBefore(legacyEndTs, bounds);
    if (legacyToBlock >= legacyFromBlock) {
      queries.push((async () => {
        try {
          const logs = await getLogsSingle(legacyFromBlock, legacyToBlock, LEGACY_CONTRACT, LEGACY_TOPIC0);
          return dedupeRows(decodeLogs(logs, true));
        } catch {
          const logs = await getLogsChunked(legacyFromBlock, legacyToBlock, LEGACY_CONTRACT, LEGACY_TOPIC0);
          return dedupeRows(decodeLogs(logs, true));
        }
      })());
    }
  }
  
  if (needsNew) {
    // Query new contract for dates after it started
    const newStartTs = Math.max(clampedStart, NEW_CONTRACT_START_TS);
    const newFromBlock = await findBlockAtOrAfter(newStartTs, bounds);
    const newToBlock = await findBlockAtOrBefore(clampedEnd, bounds);
    if (newToBlock >= newFromBlock) {
      queries.push((async () => {
        try {
          // Ensure we're using the correct contract and topic
          if (CONTRACT !== '0x86b6f3856f086cd29462985f7bbff0d55d2b5d53') {
            throw new Error(`Wrong contract address: ${CONTRACT}`);
          }
          const logs = await getLogsSingle(newFromBlock, newToBlock, CONTRACT, TOPIC0);
          const decoded = decodeLogs(logs, false);
          const deduped = dedupeRows(decoded);
          if (deduped.length === 0 && logs.length > 0) {
            console.error('Decoded logs but got 0 rows', { logsLength: logs.length, fromBlock: newFromBlock, toBlock: newToBlock });
          }
          return deduped;
        } catch (err: any) {
          console.error('getLogsSingle failed, trying chunked', { 
            error: err?.message || String(err),
            fromBlock: newFromBlock,
            toBlock: newToBlock,
            contract: CONTRACT,
            topic0: TOPIC0
          });
          try {
            const logs = await getLogsChunked(newFromBlock, newToBlock, CONTRACT, TOPIC0);
            const decoded = decodeLogs(logs, false);
            const deduped = dedupeRows(decoded);
            return deduped;
          } catch (chunkErr: any) {
            console.error('getLogsChunked also failed', {
              error: chunkErr?.message || String(chunkErr),
              fromBlock: newFromBlock,
              toBlock: newToBlock
            });
            return []; // Return empty instead of throwing
          }
        }
      })());
    }
  }
  
  if (queries.length === 0) {
    console.error('fetchRangeRowsDirect: No queries to execute', { startTs, endTs, needsLegacy, needsNew });
    return [];
  }
  
  // Execute queries in parallel with error handling
  let results: Row[][];
  try {
    results = await Promise.all(queries);
  } catch (err: any) {
    console.error('fetchRangeRowsDirect: Promise.all failed', {
      error: err?.message || String(err),
      startTs,
      endTs,
      queriesCount: queries.length
    });
    return [];
  }
  
  // Merge all results
  let allRows: Row[] = [];
  for (const rows of results) {
    if (Array.isArray(rows)) {
      allRows = mergeRows(allRows, rows);
    } else {
      console.error('fetchRangeRowsDirect: Invalid rows result', { rows });
    }
  }
  allRows.sort(sortByTimestamp);
  
  if (allRows.length === 0 && endTs >= NEW_CONTRACT_START_TS) {
    console.error('fetchRangeRowsDirect: Got 0 rows for new contract range', {
      startTs,
      endTs,
      needsNew,
      queriesCount: queries.length,
      resultsLengths: results.map(r => Array.isArray(r) ? r.length : 'invalid')
    });
  }
  
  return allRows;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { startTs, endTs, rebuildDay, wantAgg } = (req.body || {}) as { startTs?: number; endTs?: number; rebuildDay?: number; wantAgg?: boolean };
    // Admin: rebuild a specific day (UTC day index)
    if (typeof rebuildDay === 'number' && rebuildDay >= 0) {
      const earliest = await getEarliest();
      const latest = await getLatest();
      const bounds: BlockBounds = { earliest, latest };
      const start = rebuildDay * 86400;
      const end = start + 86399;
      const built = await buildDay(start, end, bounds);
      remember(built.key, built.entry);
      await kvSetDay(built.key, built.entry);
      return sendJson(res, 200, { ok: true, rebuilt: built.key, fromBlock: built.entry.fromBlock, toBlock: built.entry.toBlock, rows: built.entry.rows.length });
    }
    const earliest = await getEarliest();
    const latest = await getLatest();
    const bounds: BlockBounds = { earliest, latest };

    const sTs = typeof startTs === 'number' && startTs > 0 ? startTs : earliest.ts;
    const eTs = typeof endTs === 'number' && endTs > 0 ? endTs : latest.ts;
    if (eTs < sTs) return sendJson(res, 200, { ok: true, rows: [] });

    let resultRows: Row[] = [];

    if (!KV_ENV_PRESENT) {
      resultRows = await fetchRangeRowsDirect(sTs, eTs, bounds);
    } else {
      // SIMPLIFIED APPROACH: Split query into two parts
      // 1. Days before Nov 15: use cache (fast, proven to work)
      // 2. Days after Nov 14: ALWAYS fetch directly using fetchRangeRowsDirect (guaranteed to work)
      
      const beforeNewContractEnd = Math.min(eTs, NEW_CONTRACT_START_TS - 1);
      const afterNewContractStart = Math.max(sTs, NEW_CONTRACT_START_TS);
      
      // Fetch days before Nov 15 using cache
      // IMPORTANT: Skip days after Nov 14 - they're fetched directly below
      if (sTs < NEW_CONTRACT_START_TS && beforeNewContractEnd >= sTs) {
        const startDay = Math.floor(sTs / 86400);
        const endDay = Math.floor(beforeNewContractEnd / 86400);
        const todayDay = Math.floor(latest.ts / 86400);
        const newContractStartDay = Math.floor(NEW_CONTRACT_START_TS / 86400);

      const dayRanges: Array<{ key:number, start:number, end:number }> = [];
      for (let d = startDay; d <= endDay; d++) {
        // Skip days after Nov 14 - they're fetched directly, not through cache
        if (d >= newContractStartDay) continue;
        const dayStart = d * 86400;
        const dayEnd = dayStart + 86399;
        dayRanges.push({ key: d, start: Math.max(dayStart, sTs), end: Math.min(dayEnd, beforeNewContractEnd) });
      }

      const CONC = Math.max(1, DAY_RANGE_CONCURRENCY);
      for (let i=0; i<dayRanges.length; i+=CONC) {
        const slice = dayRanges.slice(i, i+CONC).map(async (r) => {
          const isHistorical = r.key < todayDay;
          const dayStartTs = r.key * 86400;
          const dayEndTs = dayStartTs + 86399;
          // Days after Nov 14 need new contract data
          const needsNewContract = dayStartTs >= NEW_CONTRACT_START_TS;
          
          // For days after Nov 14, always use full day range when rebuilding
          const rebuildStart = needsNewContract ? dayStartTs : r.start;
          const rebuildEnd = needsNewContract ? dayEndTs : r.end;
          
          // For days after Nov 14: ensure we have cached data from new contract
          if (needsNewContract && isHistorical) {
            // Check cache first - but be aggressive: if cache is empty or doesn't have mega rows, always fetch fresh
            // 1) Try in-memory cache
            const mem = dayCache.get(memKey(r.key));
            if (mem && hasMegaRows(mem) && mem.rows.length > 0) {
              // Cache has new contract data with actual rows - use it
              resultRows.push(...mem.rows);
              return;
            }
            
            // 2) Try persistent KV cache
            const fromKv = await kvGetDay(r.key);
            if (fromKv && hasMegaRows(fromKv) && fromKv.rows.length > 0) {
              // KV cache has new contract data with actual rows - use it and load into memory
              remember(r.key, fromKv);
              resultRows.push(...fromKv.rows);
              return;
            }
            
            // 3) Cache doesn't exist, is empty, or doesn't have new contract data - ALWAYS fetch fresh using EXACT same method as extendToday
            // This is the proven method that works for today
            const fromBlock = await findBlockAtOrAfter(rebuildStart, bounds);
            const toBlock = await findBlockAtOrBefore(rebuildEnd, bounds);
            if (toBlock < fromBlock) {
              // No blocks in range - don't cache, just return empty (will retry next time)
              return;
            }
            
            // Use EXACT same method as extendToday: getLogsSingle/getLogsChunked with defaults (CONTRACT/TOPIC0)
            let newLogs: any[] = [];
            try {
              newLogs = await getLogsSingle(fromBlock, toBlock);
            } catch {
              newLogs = await getLogsChunked(fromBlock, toBlock);
            }
            // Use EXACT same decode method as extendToday
            const newRows = (newLogs as any[]).map(decode).filter(Boolean) as Row[];
            // Dedupe same way as extendToday
            const uniq = new Map<string, Row>();
            for (const r of newRows) {
              const idxOrBlock = (typeof (r as any).logIndex === 'number' && !isNaN((r as any).logIndex)) ? (r as any).logIndex : r.blockNumber;
              uniq.set(`${r.txHash}:${idxOrBlock}`, r);
            }
            const fetchedRows = Array.from(uniq.values());
            
            const entry: DayEntry = {
              fromBlock,
              toBlock,
              rows: fetchedRows,
              lastUpdate: Date.now()
            };
            
            // Only cache if we got data - don't cache empty results for days after Nov 14
            // This ensures we keep retrying until we get the data
            if (fetchedRows.length > 0) {
              remember(r.key, entry);
              await kvSetDay(r.key, entry);
            }
            resultRows.push(...fetchedRows);
            return;
          }
          
          // For days before Nov 15 or today: use existing logic
          // 1) Try in-memory first (fast)
          const mem = dayCache.get(memKey(r.key));
          if (mem) {
            if (isHistorical) {
              // Use cache as-is
              resultRows.push(...mem.rows);
              return;
            } else {
              // Today: extend with latest data
              const updated = await extendToday(mem, r.start, r.end, bounds);
              remember(r.key, updated);
              await kvSetDay(r.key, updated);
              resultRows.push(...updated.rows);
              return;
            }
          }

          // 2) Try persistent KV
          const fromKv = await kvGetDay(r.key);
          if (fromKv) {
            if (isHistorical) {
              // Use cache as-is, load into memory for next time
              remember(r.key, fromKv);
              resultRows.push(...fromKv.rows);
              return;
            } else {
              // Today: extend with latest data
              const updated = await extendToday(fromKv, r.start, r.end, bounds);
              remember(r.key, updated);
              await kvSetDay(r.key, updated);
              resultRows.push(...updated.rows);
              return;
            }
          }

          // 3) Build fresh and persist
          const built = await buildDay(rebuildStart, rebuildEnd, bounds);
          remember(built.key, built.entry);
          await kvSetDay(built.key, built.entry);
          resultRows.push(...built.entry.rows);
        });
        await Promise.all(slice);
      }
      
      // ALWAYS fetch days after Nov 14 directly (bypass cache completely)
      // This guarantees we get the data using the same method that works for today
      if (eTs >= NEW_CONTRACT_START_TS) {
        // Fetch all days after Nov 14 up to end of query (excluding today, which is handled below)
        const todayDay = Math.floor(latest.ts / 86400);
        const todayStartTs = todayDay * 86400;
        const fetchEnd = Math.min(eTs, todayStartTs - 1); // Exclude today
        
        if (fetchEnd >= afterNewContractStart) {
          try {
            // Fetch directly - this is the proven method that works
            console.log('Fetching new contract data directly', {
              start: afterNewContractStart,
              end: fetchEnd,
              startDate: new Date(afterNewContractStart * 1000).toISOString(),
              endDate: new Date(fetchEnd * 1000).toISOString(),
              contract: CONTRACT,
              topic0: TOPIC0
            });
            const newContractRows = await fetchRangeRowsDirect(afterNewContractStart, fetchEnd, bounds);
            console.log('Fetched new contract rows', { count: newContractRows.length });
            resultRows = mergeRows(resultRows, newContractRows);
            console.log('Merged result rows', { totalCount: resultRows.length });
          } catch (fetchError: any) {
            console.error('Direct fetch failed, trying fallback', {
              error: fetchError?.message || String(fetchError),
              stack: fetchError?.stack
            });
            // If fetchRangeRowsDirect fails, try direct method like extendToday uses
            try {
              const fromBlock = await findBlockAtOrAfter(afterNewContractStart, bounds);
              const toBlock = await findBlockAtOrBefore(fetchEnd, bounds);
              if (toBlock >= fromBlock) {
                let newLogs: any[] = [];
                try {
                  newLogs = await getLogsSingle(fromBlock, toBlock, CONTRACT, TOPIC0);
                } catch {
                  newLogs = await getLogsChunked(fromBlock, toBlock, CONTRACT, TOPIC0);
                }
                const newRows = (newLogs as any[]).map(decode).filter(Boolean) as Row[];
                const uniq = new Map<string, Row>();
                for (const r of newRows) {
                  const idxOrBlock = (typeof (r as any).logIndex === 'number' && !isNaN((r as any).logIndex)) ? (r as any).logIndex : r.blockNumber;
                  uniq.set(`${r.txHash}:${idxOrBlock}`, r);
                }
                const fallbackRows = Array.from(uniq.values());
                resultRows = mergeRows(resultRows, fallbackRows);
              }
            } catch (fallbackError: any) {
              // Last resort: return error in response so we can debug
              console.error('Failed to fetch new contract data:', {
                start: afterNewContractStart,
                end: fetchEnd,
                fetchError: fetchError?.message || String(fetchError),
                fallbackError: fallbackError?.message || String(fallbackError),
                contract: CONTRACT,
                topic0: TOPIC0
              });
            }
          }
        }
      }
      }
    }

    // Only do live fetch for today's data (to get latest matches), skip for historical dates
    const todayDay = Math.floor(latest.ts / 86400);
    const endDay = Math.floor(eTs / 86400);
    if (endDay >= todayDay) {
      // Request includes today - fetch live data for today only
      const todayStartTs = todayDay * 86400;
      const liveStartTs = Math.max(sTs, todayStartTs);
      if (liveStartTs <= eTs) {
        const liveRows = await fetchRangeRowsDirect(liveStartTs, eTs, bounds);
        resultRows = mergeRows(resultRows, liveRows);
      }
    }
    resultRows.sort(sortByTimestamp);

    // First constrain precisely to the requested [sTs, eTs] window (even if cached full days were used)
    const windowed = filterRowsByTs(resultRows, sTs, eTs);

    // Final defensive pass: dedupe across days and cache formats
    const byKey = new Map<string, Row>();
    for (const r of windowed) byKey.set(stableRowKey(r), r);
    const out = Array.from(byKey.values());
    out.sort(sortByTimestamp);
    if (wantAgg) {
      const agg = computeAgg(out);
      return sendJson(res, 200, { ok: true, rows: out, aggByClass: agg.byClass, aggLastUpdate: agg.lastUpdate });
    }
    sendJson(res, 200, { ok: true, rows: out });
  } catch (e:any) {
    sendJson(res, 200, { ok: false, error: e?.message || String(e) });
  }
}
