import type { NextApiRequest, NextApiResponse } from 'next';

const PAYOUT_CONTRACT = '0x7b8df4195eda5b193304eecb5107de18b6557d24';
const BLOCKSCOUT_API = 'https://megaeth.blockscout.com/api';
const TOKEN_SYMBOL = 'USDm';
const TOKEN_NAME = 'MegaUSD';
const GAME_METHOD_SELECTORS = ['0xf5b488dd', '0xc0326157'];
const OFFSET = 1000;
const MAX_PAGES = 200;
const CACHE_TTL_MS = 5 * 60 * 1000;

type ProfitRow = {
  player: string;
  won: string;
  lost: string;
  net: string;
  txs: number;
};
type VolumePoint = { day: string; volume: string };

let cached: { rows: ProfitRow[]; updatedAt: number; volumeSeries: VolumePoint[]; totalVolume: string } | null = null;

function nowMs() { return Date.now(); }
function toLower(x: string | null | undefined) { return (x || '').toLowerCase(); }

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function fetchAllTransfers() {
  const results: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${BLOCKSCOUT_API}?module=account&action=tokentx&address=${PAYOUT_CONTRACT}&page=${page}&offset=${OFFSET}&sort=asc`;
    const data = await fetchJson(url);
    const batch = Array.isArray(data?.result) ? data.result : [];
    if (batch.length === 0) break;
    results.push(...batch);
    if (batch.length < OFFSET) break;
  }
  return results;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (cached && nowMs() - cached.updatedAt < CACHE_TTL_MS) {
      return res.status(200).json({ ok: true, rows: cached.rows, updatedAt: cached.updatedAt, volumeSeries: cached.volumeSeries, totalVolume: cached.totalVolume });
    }

    const transfers = await fetchAllTransfers();
    const totals = new Map<string, { won: bigint; lost: bigint; txs: number }>();
    const volumeByDay = new Map<string, bigint>();
    let totalVolume = 0n;

    for (const t of transfers) {
      const symbol = t?.tokenSymbol || t?.tokenName || '';
      if (symbol && symbol !== TOKEN_SYMBOL && symbol !== TOKEN_NAME) continue;
      const input = (t?.input || '').slice(0, 10);
      if (input && !GAME_METHOD_SELECTORS.includes(input)) continue;
      const from = toLower(t?.from);
      const to = toLower(t?.to);
      const value = BigInt(t?.value || '0');
      if (value === 0n) continue;
      const ts = Number(t?.timeStamp || 0);
      if (ts > 0) {
        const d = new Date(ts * 1000);
        const day = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
        volumeByDay.set(day, (volumeByDay.get(day) || 0n) + value);
        totalVolume += value;
      }
      if (from === PAYOUT_CONTRACT) {
        const s = totals.get(to) || { won: 0n, lost: 0n, txs: 0 };
        s.won += value; s.txs += 1; totals.set(to, s);
      } else if (to === PAYOUT_CONTRACT) {
        const s = totals.get(from) || { won: 0n, lost: 0n, txs: 0 };
        s.lost += value; s.txs += 1; totals.set(from, s);
      }
    }

    const rows: ProfitRow[] = Array.from(totals.entries())
      .map(([player, s]) => ({
        player,
        won: s.won.toString(),
        lost: s.lost.toString(),
        net: (s.won - s.lost).toString(),
        txs: s.txs,
      }))
      .sort((a, b) => {
        const na = BigInt(a.net);
        const nb = BigInt(b.net);
        if (na === nb) return b.txs - a.txs;
        return na > nb ? -1 : 1;
      })
      .slice(0, 10);

    const volumeSeries: VolumePoint[] = Array.from(volumeByDay.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, volume]) => ({ day, volume: volume.toString() }));

    cached = { rows, updatedAt: nowMs(), volumeSeries, totalVolume: totalVolume.toString() };
    return res.status(200).json({ ok: true, rows, updatedAt: cached.updatedAt, volumeSeries, totalVolume: totalVolume.toString() });
  } catch (e: any) {
    return res.status(200).json({ ok: false, error: e?.message || String(e) });
  }
}
