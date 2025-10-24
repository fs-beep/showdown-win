
import Head from 'next/head';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Download, Loader2, Play, Server, ShieldAlert } from 'lucide-react';

type Row = {
  blockNumber: number;
  txHash: string;
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

type ClassRow = { klass: string; wins: number; losses: number; total: number; winrate: number };
type ApiResponse = { ok: boolean; error?: string; rows?: Row[] };

const MIN_DATE = '2025-07-25';
const SHOWDOWN_LOGO = '/images/showdown_small.jpg';
const SHOWDOWN_BANNER = '/images/showdown_large.jpeg';

function fmtDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseDateFlexible(dateStr?: string): { y:number; m:number; d:number } | null {
  if (!dateStr) return null;
  const s = dateStr.trim();
  // YYYY-MM-DD
  let m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (m) return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
  // DD.MM.YYYY
  m = /^([0-9]{2})\.([0-9]{2})\.([0-9]{4})$/.exec(s);
  if (m) return { y: Number(m[3]), m: Number(m[2]), d: Number(m[1]) };
  // MM/DD/YYYY
  m = /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})$/.exec(s);
  if (m) return { y: Number(m[3]), m: Number(m[1]), d: Number(m[2]) };
  return null;
}
function toStartOfDayEpoch(dateStr?: string): number | undefined {
  const p = parseDateFlexible(dateStr);
  if (!p) return undefined;
  const d = new Date(p.y, p.m-1, p.d, 0, 0, 0);
  if (isNaN(d.getTime())) return undefined;
  return Math.floor(d.getTime()/1000);
}
function toEndOfDayEpoch(dateStr?: string): number | undefined {
  const p = parseDateFlexible(dateStr);
  if (!p) return undefined;
  const d = new Date(p.y, p.m-1, p.d, 23, 59, 59);
  if (isNaN(d.getTime())) return undefined;
  return Math.floor(d.getTime()/1000);
}

export default function Home() {
  const [startDate, setStartDate] = useState<string>(MIN_DATE);
  const [endDate, setEndDate] = useState<string>('');
  const [player, setPlayer] = useState<string>('megaflop');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [matrixOnlyPlayer, setMatrixOnlyPlayer] = useState<boolean>(false);

  const stats = useMemo(() => {
    const p = player.trim().toLowerCase();
    const winRows = rows.filter(r => r.winningPlayer?.trim?.().toLowerCase() === p);
    const loseRows = rows.filter(r => r.losingPlayer?.trim?.().toLowerCase() === p);

    const wins = winRows.length;
    const losses = loseRows.length;
    const total = wins + losses;
    const winrate = total ? (wins / total) : 0;

    const classCounts = new Map<string, number>();
    for (const r of winRows) {
      const cls = (r.winningClasses ?? '').trim();
      if (!cls) continue;
      classCounts.set(cls, (classCounts.get(cls) || 0) + 1);
    }
    let dominantClass: string | null = null;
    let dominantClassCount = 0;
    for (const [cls, cnt] of classCounts.entries()) {
      if (cnt > dominantClassCount) { dominantClass = cls; dominantClassCount = cnt; }
    }
    const dominantClassPct = wins ? (dominantClassCount / wins) : 0;

    return { wins, losses, total, winrate, dominantClass, dominantClassPct };
  }, [rows, player]);

  const filtered = useMemo(() => {
    const p = player.trim().toLowerCase();
    return rows
      .filter(r => r.winningPlayer?.trim?.().toLowerCase() === p || r.losingPlayer?.trim?.().toLowerCase() === p)
      .map(r => ({
        ...r,
        result: r.winningPlayer?.trim?.().toLowerCase() === p ? 'W' : 'L',
        opponent: r.winningPlayer?.trim?.().toLowerCase() === p ? r.losingPlayer : r.winningPlayer,
      }))
      .sort((a, b) => b.blockNumber - a.blockNumber); // newest first
  }, [rows, player]);

  const classStats: ClassRow[] = useMemo(() => {
    const p = player.trim().toLowerCase();
    const map = new Map<string, { wins: number; losses: number; total: number }>();
    for (const r of rows) {
      if (r.winningPlayer?.trim?.().toLowerCase() === p) {
        const cls = (r.winningClasses ?? '').trim() || '(unknown)';
        const s = map.get(cls) || { wins: 0, losses: 0, total: 0 };
        s.wins += 1; s.total += 1; map.set(cls, s);
      } else if (r.losingPlayer?.trim?.().toLowerCase() === p) {
        const cls = (r.losingClasses ?? '').trim() || '(unknown)';
        const s = map.get(cls) || { wins: 0, losses: 0, total: 0 };
        s.losses += 1; s.total += 1; map.set(cls, s);
      }
    }
    const out = Array.from(map.entries()).map(([klass, s]) => ({ klass, ...s, winrate: s.total ? s.wins / s.total : 0 }));
    out.sort((a,b) => b.total - a.total || b.winrate - a.winrate);
    return out;
  }, [rows, player]);

  // Overall per-class stats for all matches in the selected date window
  const overallClassStats: ClassRow[] = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; total: number }>();
    for (const r of rows) {
      const w = (r.winningClasses ?? '').trim();
      const l = (r.losingClasses ?? '').trim();
      if (w) {
        const s = map.get(w) || { wins: 0, losses: 0, total: 0 };
        s.wins += 1; s.total += 1; map.set(w, s);
      }
      if (l) {
        const s = map.get(l) || { wins: 0, losses: 0, total: 0 };
        s.losses += 1; s.total += 1; map.set(l, s);
      }
    }
    const out = Array.from(map.entries()).map(([klass, s]) => ({ klass, ...s, winrate: s.total ? s.wins / s.total : 0 }));
    out.sort((a,b) => b.total - a.total || b.winrate - a.winrate);
    return out;
  }, [rows]);

  // Class vs Class matrix (dual-classes only). Toggle: all games vs only games including the selected player.
  const classVsClass = useMemo(() => {
    const p = player.trim().toLowerCase();
    const subset = matrixOnlyPlayer
      ? rows.filter(r => r.winningPlayer?.trim?.().toLowerCase() === p || r.losingPlayer?.trim?.().toLowerCase() === p)
      : rows;

    const classesSet = new Set<string>();
    const wins: Record<string, Record<string, number>> = {};
    for (const r of subset) {
      const w = (r.winningClasses ?? '').trim();
      const l = (r.losingClasses ?? '').trim();
      if (!w || !l) continue;
      if (!w.includes('/') || !l.includes('/')) continue;
      classesSet.add(w); classesSet.add(l);
      if (!wins[w]) wins[w] = {};
      wins[w][l] = (wins[w][l] ?? 0) + 1;
    }
    const classes = Array.from(classesSet).sort();
    const matrix = classes.map(rowClass => {
      const cells = classes.map(colClass => {
        if (rowClass === colClass) return { colClass, pct: null as number | null, wins: 0, losses: 0, total: 0 };
        const w_rc_cc = (wins[rowClass]?.[colClass]) ?? 0; // row beats col
        const w_cc_rc = (wins[colClass]?.[rowClass]) ?? 0; // col beats row
        const total = w_rc_cc + w_cc_rc;
        const pct = total > 0 ? w_rc_cc / total : null;
        return { colClass, pct, wins: w_rc_cc, losses: w_cc_rc, total };
      });
      return { rowClass, cells };
    });
    return { classes, matrix };
  }, [rows, player, matrixOnlyPlayer]);

  const applyPreset = (kind: 'today'|'last7'|'last30'|'thisMonth'|'prevMonth'|'allTime'|'sincePatch') => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (kind === 'today') {
      const s = fmtDate(today) < MIN_DATE ? MIN_DATE : fmtDate(today);
      setStartDate(s); setEndDate(fmtDate(today));
    } else if (kind === 'last7') {
      const start = new Date(today); start.setDate(start.getDate()-6);
      const s = fmtDate(start) < MIN_DATE ? MIN_DATE : fmtDate(start);
      setStartDate(s); setEndDate(fmtDate(today));
    } else if (kind === 'last30') {
      const start = new Date(today); start.setDate(start.getDate()-29);
      const s = fmtDate(start) < MIN_DATE ? MIN_DATE : fmtDate(start);
      setStartDate(s); setEndDate(fmtDate(today));
    } else if (kind === 'thisMonth') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const s = fmtDate(start) < MIN_DATE ? MIN_DATE : fmtDate(start);
      setStartDate(s); setEndDate(fmtDate(today));
    } else if (kind === 'prevMonth') {
      const startPrev = new Date(today.getFullYear(), today.getMonth()-1, 1);
      const endPrev = new Date(today.getFullYear(), today.getMonth(), 0);
      const s = fmtDate(startPrev) < MIN_DATE ? MIN_DATE : fmtDate(startPrev);
      setStartDate(s); setEndDate(fmtDate(endPrev));
    } else if (kind === 'allTime') {
      setStartDate(MIN_DATE); setEndDate('');
    } else if (kind === 'sincePatch') {
      // Latest balance patch: 2025-10-03 → today
      setStartDate('2025-10-03');
      setEndDate(fmtDate(today));
    }
  };

  const run = async () => {
    setError(null); setRows([]); setLoading(true);
    try {
      const body = {
        startTs: toStartOfDayEpoch(startDate),
        endTs: toEndOfDayEpoch(endDate),
      };
      const res = await fetch('/api/eth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j: ApiResponse = await res.json();
      if (!j.ok) throw new Error(j.error || 'Unknown error');
      const sorted = (j.rows || []).sort((a,b)=>a.blockNumber-b.blockNumber);
      setRows(sorted);
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const dl = (name: string, data: any) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <Head><title>Showdown Winrate Checker</title></Head>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-4 rounded-xl bg-black text-white px-4 py-2 text-sm">
          This tool was brought to you by <span className="font-semibold">megaflop</span>.{' '}
          <a className="underline" href="https://x.com/fisiroky" target="_blank" rel="noreferrer">Follow on X</a>
        </div>

        <div className="flex items-center gap-3">
          <img src={SHOWDOWN_LOGO} alt="Showdown logo" className="h-10 w-10 rounded"/>
          <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold tracking-tight">Showdown Winrate Checker</motion.h1>
        </div>
        <p className="mt-2 text-gray-600">Pick a <b>start</b> and <b>end</b> date (local). I’ll resolve them to the right block numbers and fetch on-chain <code>GameResultEvent</code> logs. Historic days are served from cache; today updates incrementally.</p>

        <div className="mt-4">
          <img src={SHOWDOWN_BANNER} alt="Showdown game artwork" className="w-full rounded-2xl shadow-sm object-cover"/>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700"><Server className="h-4 w-4"/> Filters</div>
            <label className="mt-3 block text-xs text-gray-500">Player Name</label>
            <input className="mt-1 w-full rounded-xl border p-2 text-sm" value={player} onChange={e=>setPlayer(e.target.value)} placeholder="megaflop" />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500">Start date</label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-gray-400"/>
                  <input type="text" inputMode="numeric" placeholder="YYYY-MM-DD or DD.MM.YYYY" className="mt-1 w-full rounded-xl border p-2 pl-7 text-sm" value={startDate} onChange={e=>setStartDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500">End date (empty = latest)</label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-gray-400"/>
                  <input type="text" inputMode="numeric" placeholder="YYYY-MM-DD or DD.MM.YYYY" className="mt-1 w-full rounded-xl border p-2 pl-7 text-sm" value={endDate} onChange={e=>setEndDate(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="text-gray-500 mr-1">Presets:</span>
              <button className="rounded-full border px-3 py-1" onClick={()=>applyPreset('today')}>Today</button>
              <button className="rounded-full border px-3 py-1" onClick={()=>applyPreset('last7')}>Last 7 days</button>
              <button className="rounded-full border px-3 py-1" onClick={()=>applyPreset('last30')}>Last 30 days</button>
              <button className="rounded-full border px-3 py-1" onClick={()=>applyPreset('thisMonth')}>This month</button>
              <button className="rounded-full border px-3 py-1" onClick={()=>applyPreset('prevMonth')}>Previous month</button>
              <button className="rounded-full border px-3 py-1" onClick={()=>applyPreset('allTime')}>All time</button>
                <button className="rounded-full border px-3 py-1" onClick={()=>applyPreset('sincePatch')}>Since last balance patch</button>
            </div>

            <button onClick={run} disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2 text-white shadow disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Play className="h-4 w-4"/>}
              {loading ? "Fetching..." : "Compute Winrate"}
            </button>
            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5"/>
                <div>
                  <div className="font-medium">Heads up</div>
                  <div>{error}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Wins</div>
            <div className="mt-1 text-3xl font-semibold">{stats.wins}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Losses</div>
            <div className="mt-1 text-3xl font-semibold">{stats.losses}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Win Rate</div>
            <div className="mt-1 text-3xl font-semibold">{(stats.winrate*100).toFixed(2)}%</div>
          </div>
          <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Dominant Class</div>
            <div className="mt-1 text-base font-medium">{stats.dominantClass || '—'}</div>
            {stats.dominantClass && <div className="text-xs text-gray-500 mt-1">{Math.round((stats.dominantClassPct||0) * 100)}% of wins</div>}
          </div>
        </div>

        {/* All matches per-class performance (global) */}
        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700">Per‑Class Performance — All Matches in Range</div>
            {overallClassStats.length > 0 && (
              <button onClick={() => dl("showdown_class_stats_all.json", overallClassStats)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                <Download className="h-4 w-4"/> Download JSON
              </button>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2">Class</th>
                  <th className="p-2">Wins</th>
                  <th className="p-2">Losses</th>
                  <th className="p-2">Games</th>
                  <th className="p-2">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {overallClassStats.map((r, i) => (
                  <tr key={r.klass + i} className="border-b">
                    <td className="p-2">{r.klass}</td>
                    <td className="p-2 tabular-nums">{r.wins}</td>
                    <td className="p-2 tabular-nums">{r.losses}</td>
                    <td className="p-2 tabular-nums">{r.total}</td>
                    <td className="p-2 tabular-nums">{(r.winrate*100).toFixed(1)}%</td>
                  </tr>
                ))}
                {overallClassStats.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-gray-500" colSpan={5}>No data yet — run a query above.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Per-class performance (player specific) */}
        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700">Per‑Class Performance for <span className="font-semibold">{player || '—'}</span></div>
            {classStats.length > 0 && (
              <button onClick={() => dl("showdown_class_stats_" + (player||'player') + ".json", classStats)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                <Download className="h-4 w-4"/> Download JSON
              </button>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2">Class</th>
                  <th className="p-2">Wins</th>
                  <th className="p-2">Losses</th>
                  <th className="p-2">Games</th>
                  <th className="p-2">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {classStats.map((r, i) => (
                  <tr key={r.klass + i} className="border-b">
                    <td className="p-2">{r.klass}</td>
                    <td className="p-2 tabular-nums">{r.wins}</td>
                    <td className="p-2 tabular-nums">{r.losses}</td>
                    <td className="p-2 tabular-nums">{r.total}</td>
                    <td className="p-2 tabular-nums">{(r.winrate*100).toFixed(1)}%</td>
                  </tr>
                ))}
                {classStats.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-gray-500" colSpan={5}>No class stats yet — run a query above.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Class-vs-Class matrix with toggle */}
        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700">Class vs Class — Win rate of <span className="font-semibold">class</span> vs <span className="font-semibold">class</span></div>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" className="h-4 w-4" checked={matrixOnlyPlayer} onChange={e=>setMatrixOnlyPlayer(e.target.checked)} />
              Only matches incl. <span className="font-semibold">{player || 'player'}</span>
            </label>
          </div>
          <div className="mt-1 text-xs text-gray-500">Only dual-classes (with a <code>/</code>) are included. Cell = win rate of row‑class vs column‑class, with sample size in parentheses. “—” = no matches (or same class).</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2">Class \ Class</th>
                  {classVsClass.classes.map((c) => (
                    <th key={c} className="p-2 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classVsClass.matrix.map((row) => (
                  <tr key={row.rowClass} className="border-b">
                    <td className="p-2 font-medium whitespace-nowrap">{row.rowClass}</td>
                    {row.cells.map((cell) => {
                      const bgStyle = cell.pct === null ? {} : { backgroundColor: `hsl(${Math.round((cell.pct as number) * 120)}, 85%, 60%)` };
                      return (
                        <td
                          key={row.rowClass + '->' + cell.colClass}
                          className="p-2 tabular-nums text-center align-middle"
                          style={bgStyle}
                          title={`${cell.wins}/${cell.total} wins`}
                        >
                          {cell.pct === null ? '—' : `${Math.round((cell.pct as number)*100)}% (${cell.total})`}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {classVsClass.classes.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-gray-500" colSpan={1}>No data yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 text-[10px] text-gray-500">Color scale: 0% → red, 50% → yellow, 100% → green.</div>
        </div>

        {/* Player-specific matches */}
        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700">Matches for <span className="font-semibold">{player || '—'}</span> ({filtered.length})</div>
            {filtered.length > 0 && (
              <button onClick={() => dl("showdown_matches_for_" + (player||'player') + ".json", filtered)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                <Download className="h-4 w-4"/> Download JSON
              </button>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2">Block</th>
                  <th className="p-2">Game #</th>
                  <th className="p-2">Result</th>
                  <th className="p-2">Opponent</th>
                  <th className="p-2">Started</th>
                  <th className="p-2">Reason</th>
                  <th className="p-2">Tx</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, i) => (
                  <tr key={r.txHash + i} className="border-b">
                    <td className="p-2 tabular-nums">{r.blockNumber}</td>
                    <td className="p-2 tabular-nums">{r.gameNumber}</td>
                    <td className="p-2 font-medium">{r.result}</td>
                    <td className="p-2">{r.opponent}</td>
                    <td className="p-2">{r.startedAt}</td>
                    <td className="p-2">{r.endReason}</td>
                    <td className="p-2"><a className="text-blue-600 underline" href={`https://web3.okx.com/explorer/megaeth-testnet/tx/${r.txHash}`} target="_blank" rel="noreferrer">tx</a></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-gray-500" colSpan={7}>No matches for this player (in the chosen range) yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* All decoded list (newest first) */}
        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700">All Decoded Matches ({rows.length})</div>
            {rows.length > 0 && (
              <button onClick={() => dl("showdown_winrate_results.json", rows)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                <Download className="h-4 w-4"/> Download JSON
              </button>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-2">Block</th>
                  <th className="p-2">Game #</th>
                  <th className="p-2">Game ID</th>
                  <th className="p-2">Started</th>
                  <th className="p-2">Winner</th>
                  <th className="p-2">Loser</th>
                  <th className="p-2">Reason</th>
                  <th className="p-2">Tx</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice().sort((a,b)=>b.blockNumber - a.blockNumber).map((r, i) => (
                  <tr key={r.txHash + i} className="border-b">
                    <td className="p-2 tabular-nums">{r.blockNumber}</td>
                    <td className="p-2 tabular-nums">{r.gameNumber}</td>
                    <td className="p-2">{r.gameId}</td>
                    <td className="p-2">{r.startedAt}</td>
                    <td className="p-2 font-medium">{r.winningPlayer}</td>
                    <td className="p-2">{r.losingPlayer}</td>
                    <td className="p-2">{r.endReason}</td>
                    <td className="p-2"><a className="text-blue-600 underline" href={`https://web3.okx.com/explorer/megaeth-testnet/tx/${r.txHash}`} target="_blank" rel="noreferrer">tx</a></td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-gray-500" colSpan={8}>
                      {loading ? "Fetching logs..." : "No rows yet. Pick a date range and click Compute."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-xs text-gray-500">
          Daily cache on the server makes historical queries instant; today is fetched incrementally.
        </div>
      </div>
    </div>
  );
}
