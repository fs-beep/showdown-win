import type { NextApiRequest, NextApiResponse } from 'next';
import { kv } from '@vercel/kv';

const PAYOUT_CONTRACT = '0x7b8df4195eda5b193304eecb5107de18b6557d24';
const USDM_TOKEN = '0xfafddbb3fc7688494971a79cc65dca3ef82079e7';
const MAINNET_RPC = process.env.GAME_RESULTS_RPC_URL || process.env.MAINNET_RPC_URL || 'https://mainnet.megaeth.com/rpc?vip=1&u=ShowdownV2&v=5184000&s=mafia&verify=1768480681-D2QvAT3JRTgLzi6xznmLd6ZeCHypjBf34gkTQ9HD8mM%3D';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const MAX_SPAN = 5000;
const CONCURRENCY = 1;
const LOG_BATCH_DELAY_MS = 200;
const USDM_START_BLOCK = 5721028;
const MAX_BLOCKS_PER_SYNC = 50000; // Smaller chunks for RPC stability
const RPC_ATTEMPTS = 5;
const RPC_BASE_DELAY_MS = 1000;
const RPC_JITTER_MS = 500;
const BATCH_DELAY_MS = 150;

type ProfitRow = { player: string; won: string; lost: string; net: string; txs: number };
type VolumePoint = { day: string; volume: string };
type State = {
  lastBlock: number;
  totals: Record<string, { won: string; lost: string; txs: number }>;
  volumeByDay: Record<string, string>;
  totalVolume: string;
};
type CachedData = {
  rows: ProfitRow[];
  volumeSeries: VolumePoint[];
  totalVolume: string;
  lastBlock: number;
  updatedAt: number;
};

const STATE_KEY = 'usdm:state:v6';
const CACHE_KEY = 'usdm:cache:v6';

let memCache: CachedData | null = null;

function nowMs() { return Date.now(); }
function toHex(n: number) { return '0x' + n.toString(16); }
function parseAddr(topic?: string) { return topic ? '0x' + topic.slice(-40).toLowerCase() : ''; }
function toTopicAddr(addr: string) { return '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0'); }

function buildRanges(from: number, to: number) {
  const ranges: Array<{ from: number; to: number }> = [];
  let s = from;
  while (s <= to) {
    const e = Math.min(s + MAX_SPAN - 1, to);
    ranges.push({ from: s, to: e });
    s = e + 1;
  }
  return ranges;
}

async function rpc(body: any) {
  let lastErr: any = null;
  for (let i = 0; i < RPC_ATTEMPTS; i += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch(MAINNET_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        lastErr = new Error(`RPC HTTP ${res.status}`);
        await new Promise(r => setTimeout(r, RPC_BASE_DELAY_MS * Math.pow(1.5, i) + Math.random() * RPC_JITTER_MS));
        continue;
      }
      if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
      const j = await res.json();
      if (Array.isArray(j)) {
        const bad = j.find((x: any) => x?.error);
        if (bad) throw new Error(bad.error?.message || 'RPC batch error');
      } else if (j?.error) {
        throw new Error(j.error?.message || 'RPC error');
      }
      return j;
    } catch (e: any) {
      lastErr = e;
      await new Promise(r => setTimeout(r, RPC_BASE_DELAY_MS * Math.pow(1.5, i) + Math.random() * RPC_JITTER_MS));
    }
  }
  throw lastErr || new Error('RPC failed');
}

async function getLatestBlock() {
  const j = await rpc({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] });
  if (!j?.result) throw new Error('Block not found');
  return { num: parseInt(j.result.number, 16), ts: parseInt(j.result.timestamp, 16) };
}

async function getLogsChunked(fromBlock: number, toBlock: number) {
  const ranges = buildRanges(fromBlock, toBlock);
  const payoutTopic = toTopicAddr(PAYOUT_CONTRACT);
  const all: any[] = [];
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const slice = ranges.slice(i, i + CONCURRENCY);
    const reqs = slice.flatMap((r, idx) => [
      rpc({ jsonrpc: '2.0', id: 1000 + i + idx * 2, method: 'eth_getLogs', params: [{ fromBlock: toHex(r.from), toBlock: toHex(r.to), address: USDM_TOKEN, topics: [TRANSFER_TOPIC, payoutTopic] }] }),
      rpc({ jsonrpc: '2.0', id: 1000 + i + idx * 2 + 1, method: 'eth_getLogs', params: [{ fromBlock: toHex(r.from), toBlock: toHex(r.to), address: USDM_TOKEN, topics: [TRANSFER_TOPIC, null, payoutTopic] }] }),
    ]);
    const parts = await Promise.all(reqs);
    const seen = new Set<string>();
    for (const p of parts) {
      for (const log of p?.result || []) {
        const key = `${log.transactionHash}:${log.logIndex}`;
        if (!seen.has(key)) { seen.add(key); all.push(log); }
      }
    }
    if (LOG_BATCH_DELAY_MS) await new Promise(r => setTimeout(r, LOG_BATCH_DELAY_MS));
  }
  return all;
}

async function batchGetBlocks(blockNums: number[]) {
  if (blockNums.length === 0) return new Map<number, number>();
  const reqs = blockNums.map((n, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'eth_getBlockByNumber', params: [toHex(n), false] }));
  const chunks: any[] = [];
  for (let i = 0; i < reqs.length; i += 400) {
    const slice = reqs.slice(i, i + 400);
    const res = await rpc(slice);
    chunks.push(...res);
    if (BATCH_DELAY_MS) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }
  const map = new Map<number, number>();
  for (const r of chunks) {
    if (r?.result) map.set(parseInt(r.result.number, 16), parseInt(r.result.timestamp, 16));
  }
  return map;
}

function updateState(state: State, logs: any[], blockTs: Map<number, number>) {
  for (const log of logs) {
    const from = parseAddr(log.topics?.[1]);
    const to = parseAddr(log.topics?.[2]);
    if (from !== PAYOUT_CONTRACT && to !== PAYOUT_CONTRACT) continue;
    const value = BigInt(log.data || '0x0');
    if (value === 0n) continue;
    const ts = blockTs.get(parseInt(log.blockNumber, 16)) || 0;
    if (ts > 0) {
      const d = new Date(ts * 1000);
      const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      state.volumeByDay[day] = (BigInt(state.volumeByDay[day] || '0') + value).toString();
      state.totalVolume = (BigInt(state.totalVolume || '0') + value).toString();
    }
    if (from === PAYOUT_CONTRACT) {
      const s = state.totals[to] || { won: '0', lost: '0', txs: 0 };
      s.won = (BigInt(s.won) + value).toString();
      s.txs += 1;
      state.totals[to] = s;
    } else {
      const s = state.totals[from] || { won: '0', lost: '0', txs: 0 };
      s.lost = (BigInt(s.lost) + value).toString();
      s.txs += 1;
      state.totals[from] = s;
    }
  }
}

function computeCache(state: State): CachedData {
  const rows: ProfitRow[] = Object.entries(state.totals).map(([player, s]) => ({
    player,
    won: s.won,
    lost: s.lost,
    net: (BigInt(s.won) - BigInt(s.lost)).toString(),
    txs: s.txs,
  }));
  rows.sort((a, b) => {
    const na = BigInt(a.net), nb = BigInt(b.net);
    return na === nb ? b.txs - a.txs : (na > nb ? -1 : 1);
  });
  const volumeSeries = Object.entries(state.volumeByDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, volume]) => ({ day, volume }));
  return {
    rows: rows.slice(0, 10),
    volumeSeries,
    totalVolume: state.totalVolume || '0',
    lastBlock: state.lastBlock,
    updatedAt: nowMs(),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const fresh = req.query?.fresh === '1';
  const kvOk = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);

  // 1) Return cached data immediately for non-fresh requests
  if (!fresh) {
    if (memCache) {
      return res.status(200).json({ ok: true, ...memCache, source: 'memory' });
    }
    if (kvOk) {
      try {
        const kvCache = await kv.get<CachedData>(CACHE_KEY);
        if (kvCache) {
          memCache = kvCache;
          return res.status(200).json({ ok: true, ...kvCache, source: 'kv' });
        }
      } catch {}
    }
  }

  // 2) Fresh request or no cache - do incremental sync
  let state: State | null = null;
  let warning: string | null = null;

  // Load existing state
  if (kvOk) {
    try { state = await kv.get<State>(STATE_KEY); } catch {}
  }
  if (!state) state = { lastBlock: 0, totals: {}, volumeByDay: {}, totalVolume: '0' };

  try {
    const latest = await getLatestBlock();
    let fromBlock = state.lastBlock > 0 ? state.lastBlock + 1 : USDM_START_BLOCK;
    // Limit how many blocks we scan per request
    const targetToBlock = latest.num;
    const toBlock = Math.min(fromBlock + MAX_BLOCKS_PER_SYNC - 1, targetToBlock);
    const needsMoreSync = toBlock < targetToBlock;

    if (fromBlock <= toBlock) {
      const logs = await getLogsChunked(fromBlock, toBlock);
      if (logs.length > 0) {
        const blockNums = [...new Set(logs.map(l => parseInt(l.blockNumber, 16)))];
        const blockTs = await batchGetBlocks(blockNums);
        updateState(state, logs, blockTs);
      }
      state.lastBlock = toBlock;

      // Save state and cache to KV immediately
      if (kvOk) {
        try { await kv.set(STATE_KEY, state); } catch {}
      }
    }

    const cache = computeCache(state);
    memCache = cache;
    if (kvOk) {
      try { await kv.set(CACHE_KEY, cache); } catch {}
    }

    return res.status(200).json({ ok: true, ...cache, source: 'fresh', needsMoreSync, syncedTo: toBlock, latestBlock: targetToBlock });
  } catch (e: any) {
    warning = e?.message || String(e);
    // Return cached data with warning if available
    if (memCache) {
      return res.status(200).json({ ok: true, ...memCache, warning, source: 'memory-fallback' });
    }
    if (kvOk) {
      try {
        const kvCache = await kv.get<CachedData>(CACHE_KEY);
        if (kvCache) {
          memCache = kvCache;
          return res.status(200).json({ ok: true, ...kvCache, warning, source: 'kv-fallback' });
        }
      } catch {}
    }
    // Last resort: compute from current state
    const cache = computeCache(state);
    return res.status(200).json({ ok: true, ...cache, warning, source: 'state-fallback' });
  }
}
