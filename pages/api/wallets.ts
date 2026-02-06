import type { NextApiRequest, NextApiResponse } from 'next';

const ACTIVITY_URL = 'https://wallet.showdown.game/activity';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// In-memory cache
let memCache: { data: Record<string, string>; ts: number } | null = null;

async function fetchMapping(): Promise<Record<string, string>> {
  const res = await fetch(ACTIVITY_URL, { headers: { Accept: 'text/html' } });
  if (!res.ok) throw new Error(`Activity page returned ${res.status}`);
  const html = await res.text();

  // Parse the table rows. The page content contains pipe-separated rows:
  // #|Nickname|WalletAddress|Rating|Winnings|...
  const mapping: Record<string, string> = {};
  const lines = html.split('\n');
  for (const line of lines) {
    const parts = line.split('|').map(s => s.trim());
    // Find a part that looks like a wallet address
    for (let i = 0; i < parts.length; i++) {
      if (/^0x[a-fA-F0-9]{38,42}$/.test(parts[i])) {
        // Nickname is the part before the address (after the row number)
        const nick = parts[i - 1] || '';
        if (nick && !/^\d+$/.test(nick) && !nick.startsWith('#') && !nick.startsWith('Wallet')) {
          mapping[parts[i].toLowerCase()] = nick;
        }
        break;
      }
    }
  }

  // Also try regex for HTML table rows (fallback if page renders as HTML)
  const rowRegex = /<td[^>]*>\s*(\d+)\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>\s*<td[^>]*>\s*(0x[a-fA-F0-9]{40})\s*<\/td>/gi;
  let m;
  while ((m = rowRegex.exec(html)) !== null) {
    const nick = m[2].trim();
    const addr = m[3].toLowerCase();
    if (nick && addr) mapping[addr] = nick;
  }

  return mapping;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Return from memory cache if fresh
    if (memCache && Date.now() - memCache.ts < CACHE_TTL_MS) {
      return res.status(200).json({ ok: true, mapping: memCache.data, cached: true, count: Object.keys(memCache.data).length });
    }

    const mapping = await fetchMapping();
    const count = Object.keys(mapping).length;

    if (count > 0) {
      memCache = { data: mapping, ts: Date.now() };
    }

    return res.status(200).json({ ok: true, mapping, cached: false, count });
  } catch (err: any) {
    // If we have stale cache, return it
    if (memCache) {
      return res.status(200).json({ ok: true, mapping: memCache.data, cached: true, stale: true, count: Object.keys(memCache.data).length });
    }
    return res.status(500).json({ ok: false, error: err.message || 'Failed to fetch wallet mapping' });
  }
}
