import type { NextApiRequest, NextApiResponse } from 'next';
import { kv } from '@vercel/kv';

const PAYOUT_CONTRACT = '0x7b8df4195eda5b193304eecb5107de18b6557d24';
const USDM_TOKEN = '0xfafddbb3fc7688494971a79cc65dca3ef82079e7';
const MAINNET_RPC = process.env.GAME_RESULTS_RPC_URL || process.env.MAINNET_RPC_URL || 'https://mainnet.megaeth.com/rpc?vip=1&u=ShowdownV2&v=5184000&s=mafia&verify=1768480681-D2QvAT3JRTgLzi6xznmLd6ZeCHypjBf34gkTQ9HD8mM%3D';
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const GAME_METHOD_SELECTORS = ['0xf5b488dd', '0xc0326157'];
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SPAN = 1000;
const CONCURRENCY = 2;
const LOG_BATCH_DELAY_MS = 150;
const START_BLOCK_LOOKBACK = 200_000;
const MAX_BLOCKS_PER_CALL = 1500;
const MAINNET_CHAIN_ID = 4326;
const chainId = Number(process.env.GAME_RESULTS_CHAIN_ID);
const chainName = (process.env.GAME_RESULTS_CHAIN_NAME || '').toLowerCase();
const isMainnet = chainId === MAINNET_CHAIN_ID || chainName === 'megaeth';
const DEFAULT_USDM_START_BLOCK = 6141480;
const DEFAULT_USDM_START_TS = Math.floor(Date.UTC(2026, 0, 20) / 1000);
const USDM_START_BLOCK = Number.isFinite(Number(process.env.USDM_START_BLOCK))
  ? Number(process.env.USDM_START_BLOCK)
  : (isMainnet ? DEFAULT_USDM_START_BLOCK : null);
const RPC_ATTEMPTS = 6;
const RPC_BASE_DELAY_MS = 900;
const RPC_JITTER_MS = 250;
const BATCH_DELAY_MS = 120;

type ProfitRow = {
  player: string;
  won: string;
  lost: string;
  net: string;
  txs: number;
};
type VolumePoint = { day: string; volume: string };
type State = {
  lastBlock: number;
  totals: Record<string, { won: string; lost: string; txs: number }>;
  volumeByDay: Record<string, string>;
  totalVolume: string;
};

let cached: { rows: ProfitRow[]; updatedAt: number; volumeSeries: VolumePoint[]; totalVolume: string } | null = null;
let memoryState: State | null = null;

function nowMs() { return Date.now(); }
function toLower(x: string | null | undefined) { return (x || '').toLowerCase(); }
function toHex(n: number) { return '0x' + n.toString(16); }
function parseAddr(topic?: string) { return topic ? '0x' + topic.slice(-40).toLowerCase() : ''; }
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
      const timeout = setTimeout(() => controller.abort(), 20_000);
      const res = await fetch(MAINNET_RPC, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      clearTimeout(timeout);
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        lastErr = new Error(`RPC HTTP ${res.status}`);
        const wait = Math.round(RPC_BASE_DELAY_MS * Math.pow(1.7, i)) + Math.floor(Math.random() * RPC_JITTER_MS);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
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
      const wait = Math.round(RPC_BASE_DELAY_MS * Math.pow(1.7, i)) + Math.floor(Math.random() * RPC_JITTER_MS);
      await new Promise(r => setTimeout(r, wait));
    }
  }
  throw lastErr || new Error('RPC failed after retries');
}
async function getLatestBlock() {
  const j = await rpc({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] });
  const blk = j?.result;
  if (!blk) throw new Error('Block not found');
  return { num: parseInt(blk.number, 16), ts: parseInt(blk.timestamp, 16) };
}
async function getBlockByNumber(n: number) {
  const j = await rpc({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: [toHex(n), false] });
  const blk = j?.result;
  if (!blk) throw new Error('Block not found');
  return { num: parseInt(blk.number, 16), ts: parseInt(blk.timestamp, 16) };
}
async function findBlockByTs(targetTs: number, latestNum: number) {
  let low = 0;
  let high = latestNum;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const blk = await getBlockByNumber(mid);
    if (blk.ts >= targetTs) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }
  return best;
}
async function getLogsChunked(fromBlock: number, toBlock: number) {
  const ranges = buildRanges(fromBlock, toBlock);
  const all: any[] = [];
  for (let i = 0; i < ranges.length; i += CONCURRENCY) {
    const slice = ranges.slice(i, i + CONCURRENCY);
    const reqs = slice.map((r, idx) => rpc({ jsonrpc: '2.0', id: 1000 + i + idx, method: 'eth_getLogs', params: [{
      fromBlock: toHex(r.from),
      toBlock: toHex(r.to),
      address: USDM_TOKEN,
      topics: [TRANSFER_TOPIC],
    }] }));
    const parts = await Promise.all(reqs);
    for (const p of parts) {
      all.push(...(p?.result || []));
    }
    if (LOG_BATCH_DELAY_MS) await new Promise(r => setTimeout(r, LOG_BATCH_DELAY_MS));
  }
  return all;
}
async function batchRpc(reqs: any[], maxBatch = 450) {
  const out: any[] = [];
  for (let i = 0; i < reqs.length; i += maxBatch) {
    const slice = reqs.slice(i, i + maxBatch);
    const res = await rpc(slice);
    out.push(...res);
    if (BATCH_DELAY_MS) await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
  }
  return out;
}
async function batchGetTransactions(hashes: string[]) {
  const reqs = hashes.map((h, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'eth_getTransactionByHash', params: [h] }));
  const res = await batchRpc(reqs);
  const map = new Map<string, string>();
  for (const r of res) {
    if (r?.result?.hash) {
      map.set(r.result.hash.toLowerCase(), (r.result.input || '').slice(0, 10));
    }
  }
  return map;
}
async function batchGetBlocks(blockNums: number[]) {
  const reqs = blockNums.map((n, i) => ({ jsonrpc: '2.0', id: i + 1, method: 'eth_getBlockByNumber', params: [toHex(n), false] }));
  const res = await batchRpc(reqs);
  const map = new Map<number, number>();
  for (const r of res) {
    const b = r?.result;
    if (b) map.set(parseInt(b.number, 16), parseInt(b.timestamp, 16));
  }
  return map;
}

function updateStateFromLogs(state: State, logs: any[], txSelectors: Map<string, string>, blockTs: Map<number, number>) {
  for (const log of logs) {
    const txHash = String(log.transactionHash || '').toLowerCase();
    const selector = txSelectors.get(txHash) || '';
    if (selector && !GAME_METHOD_SELECTORS.includes(selector)) continue;
    const from = parseAddr(log.topics?.[1]);
    const to = parseAddr(log.topics?.[2]);
    if (from !== PAYOUT_CONTRACT && to !== PAYOUT_CONTRACT) continue;
    const value = BigInt(log.data || '0x0');
    if (value === 0n) continue;
    const ts = blockTs.get(parseInt(log.blockNumber, 16)) || 0;
    if (ts > 0) {
      const d = new Date(ts * 1000);
      const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
      const prev = BigInt(state.volumeByDay[day] || '0');
      state.volumeByDay[day] = (prev + value).toString();
      const totalPrev = BigInt(state.totalVolume || '0');
      state.totalVolume = (totalPrev + value).toString();
    }
    if (from === PAYOUT_CONTRACT) {
      const s = state.totals[to] || { won: '0', lost: '0', txs: 0 };
      s.won = (BigInt(s.won) + value).toString();
      s.txs += 1;
      state.totals[to] = s;
    } else if (to === PAYOUT_CONTRACT) {
      const s = state.totals[from] || { won: '0', lost: '0', txs: 0 };
      s.lost = (BigInt(s.lost) + value).toString();
      s.txs += 1;
      state.totals[from] = s;
    }
  }
}

function computeRows(state: State) {
  const rows: ProfitRow[] = Object.entries(state.totals).map(([player, s]) => ({
    player,
    won: s.won,
    lost: s.lost,
    net: (BigInt(s.won) - BigInt(s.lost)).toString(),
    txs: s.txs,
  }));
  rows.sort((a, b) => {
    const na = BigInt(a.net);
    const nb = BigInt(b.net);
    if (na === nb) return b.txs - a.txs;
    return na > nb ? -1 : 1;
  });
  return rows.slice(0, 10);
}
function computeVolumeSeries(state: State) {
  return Object.entries(state.volumeByDay)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, volume]) => ({ day, volume }));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const fresh = req.query?.fresh === '1';
    if (!fresh && cached && nowMs() - cached.updatedAt < CACHE_TTL_MS) {
      return res.status(200).json({ ok: true, rows: cached.rows, updatedAt: cached.updatedAt, volumeSeries: cached.volumeSeries, totalVolume: cached.totalVolume });
    }

    const kvConfigured = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
    let kvWarning: string | null = null;

    const stateKey = 'usdm:state';
    let state: State | null = null;
    if (kvConfigured) {
      try {
        state = await kv.get<State>(stateKey);
      } catch (e:any) {
        kvWarning = `KV read failed: ${e?.message || String(e)}`;
      }
    } else {
      kvWarning = 'KV not configured; USDm cache is in-memory only.';
    }
    if (!state) {
      state = memoryState || { lastBlock: 0, totals: {}, volumeByDay: {}, totalVolume: '0' };
    }
    try {
      const latest = await getLatestBlock();
      let fromBlock = Math.max(state.lastBlock + 1, 0);
      if (state.lastBlock === 0 && fromBlock === 1) {
        if (USDM_START_BLOCK !== null) {
          fromBlock = USDM_START_BLOCK;
        } else {
          if (isMainnet) {
            try {
              fromBlock = await findBlockByTs(DEFAULT_USDM_START_TS, latest.num);
              kvWarning = [kvWarning, 'USDM start block not set; using Jan 20, 2026 timestamp.']
                .filter(Boolean)
                .join(' | ');
            } catch (e:any) {
              fromBlock = Math.max(latest.num - START_BLOCK_LOOKBACK, 0);
              kvWarning = [kvWarning, `USDM start block not set; scanning last ${START_BLOCK_LOOKBACK} blocks only.`]
                .filter(Boolean)
                .join(' | ');
            }
          } else {
            fromBlock = Math.max(latest.num - START_BLOCK_LOOKBACK, 0);
            kvWarning = [kvWarning, `USDM start block not set for this chain; scanning last ${START_BLOCK_LOOKBACK} blocks only.`]
              .filter(Boolean)
              .join(' | ');
          }
        }
      }
      let toBlock = latest.num;
      if (toBlock - fromBlock + 1 > MAX_BLOCKS_PER_CALL) {
        toBlock = fromBlock + MAX_BLOCKS_PER_CALL - 1;
        kvWarning = [kvWarning, `USDm sync partial: processing ${MAX_BLOCKS_PER_CALL} blocks (refresh again to continue).`]
          .filter(Boolean)
          .join(' | ');
      }
      if (fromBlock <= toBlock) {
        const logs = await getLogsChunked(fromBlock, toBlock);
        if (logs.length > 0) {
          const txHashes = Array.from(new Set(logs.map(l => String(l.transactionHash || '').toLowerCase()))).filter(Boolean);
          const txSelectors = await batchGetTransactions(txHashes);
          const blockNums = Array.from(new Set(logs.map(l => parseInt(l.blockNumber, 16))));
          const blockTs = await batchGetBlocks(blockNums);
          updateStateFromLogs(state, logs, txSelectors, blockTs);
        }
        state.lastBlock = toBlock;
        memoryState = state;
        if (kvConfigured) {
          try {
            await kv.set(stateKey, state);
          } catch (e:any) {
            kvWarning = `KV write failed: ${e?.message || String(e)}`;
          }
        }
      }
    } catch (e:any) {
      if (cached) {
        return res.status(200).json({
          ok: true,
          rows: cached.rows,
          updatedAt: cached.updatedAt,
          volumeSeries: cached.volumeSeries,
          totalVolume: cached.totalVolume,
          warning: [kvWarning, e?.message || String(e)].filter(Boolean).join(' | ') || undefined,
        });
      }
      // Fall back to current KV/memory state even if refresh failed.
      const rows = computeRows(state);
      const volumeSeries = computeVolumeSeries(state);
      return res.status(200).json({
        ok: true,
        rows,
        updatedAt: nowMs(),
        volumeSeries,
        totalVolume: state.totalVolume || '0',
        warning: [kvWarning, e?.message || String(e)].filter(Boolean).join(' | ') || undefined,
      });
    }

    const rows = computeRows(state);
    const volumeSeries = computeVolumeSeries(state);
    cached = { rows, updatedAt: nowMs(), volumeSeries, totalVolume: state.totalVolume || '0' };
    return res.status(200).json({ ok: true, rows, updatedAt: cached.updatedAt, volumeSeries, totalVolume: cached.totalVolume, warning: kvWarning || undefined });
  } catch (e: any) {
    return res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
}
