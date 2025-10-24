
import Head from 'next/head';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { Calendar, Download, Loader2, Play, Server, ShieldAlert, Moon, Sun, Globe, Clipboard, Check, ArrowUp } from 'lucide-react';

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
type ApiResponse = { ok: boolean; error?: string; rows?: Row[]; aggByClass?: Record<string, { wins: number; losses: number; total: number }>; aggLastUpdate?: number };

const MIN_DATE = '2025-07-25';
const SHOWDOWN_LOGO = '/images/showdown_small.jpg';
const SHOWDOWN_BANNER = '/images/showdown_large.jpeg';
const PLAY_URL = 'https://alpha.showdown.game/';

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
  const router = useRouter();
  const [startDate, setStartDate] = useState<string>(MIN_DATE);
  const [endDate, setEndDate] = useState<string>('');
  const [player, setPlayer] = useState<string>('megaflop');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const hydrated = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [matrixOnlyPlayer, setMatrixOnlyPlayer] = useState<boolean>(false);
  const [useUtc, setUseUtc] = useState<boolean>(true);
  const [compact, setCompact] = useState<boolean>(false);
  const [copiedTx, setCopiedTx] = useState<string | null>(null);
  const [showTop, setShowTop] = useState<boolean>(false);
  const [aggByClass, setAggByClass] = useState<Record<string, { wins: number; losses: number; total: number }> | null>(null);
  const [aggUpdatedAt, setAggUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
      const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initial: 'light' | 'dark' = stored === 'dark' || (!stored && prefersDark) ? 'dark' : 'light';
      setTheme(initial);
      if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', initial === 'dark');
      const c = typeof window !== 'undefined' ? localStorage.getItem('compact') : null;
      if (c === '1') setCompact(true);
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', theme === 'dark');
      if (typeof window !== 'undefined') localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined') localStorage.setItem('compact', compact ? '1' : '0');
    } catch {}
  }, [compact]);

  // 1) Initialize state from URL query once
  useEffect(() => {
    if (hydrated.current) return;
    const q = router.query;
    const s = typeof q.start === 'string' ? q.start : undefined;
    const e = typeof q.end === 'string' ? q.end : undefined;
    const p = typeof q.player === 'string' ? q.player : undefined;
    const only = typeof q.only === 'string' ? q.only : undefined;
    const t = typeof q.theme === 'string' ? q.theme : undefined;
    const tz = typeof q.tz === 'string' ? q.tz : undefined;
    if (s) setStartDate(s);
    if (e) setEndDate(e);
    if (p) setPlayer(p);
    if (only === '1') setMatrixOnlyPlayer(true);
    if (t === 'dark') setTheme('dark');
    if (tz === 'local') setUseUtc(false);
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // 2) Keep URL in sync with state (shallow replace)
  useEffect(() => {
    if (!hydrated.current) return;
    const nextQuery: Record<string, string> = {};
    if (startDate) nextQuery.start = startDate;
    if (endDate) nextQuery.end = endDate;
    if (player) nextQuery.player = player;
    if (matrixOnlyPlayer) nextQuery.only = '1';
    if (theme === 'dark') nextQuery.theme = 'dark';
    nextQuery.tz = useUtc ? 'utc' : 'local';
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }, [startDate, endDate, player, matrixOnlyPlayer, theme, useUtc]);

  

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

  // Pagination state
  const [pageAll, setPageAll] = useState(1);
  const [pageFiltered, setPageFiltered] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);
  const [jumpAll, setJumpAll] = useState<string>('');
  const [jumpFiltered, setJumpFiltered] = useState<string>('');
  // Sorting state
  const [decodedSort, setDecodedSort] = useState<{ key: keyof Row; dir: 'asc'|'desc' }>({ key: 'blockNumber', dir: 'desc' });
  const [filteredSort, setFilteredSort] = useState<{ key: keyof Row | 'result'; dir: 'asc'|'desc' }>({ key: 'blockNumber', dir: 'desc' });
  const [overallSort, setOverallSort] = useState<{ key: keyof ClassRow; dir: 'asc'|'desc' }>({ key: 'total', dir: 'desc' });
  const [playerClassSort, setPlayerClassSort] = useState<{ key: keyof ClassRow; dir: 'asc'|'desc' }>({ key: 'total', dir: 'desc' });
  const sortedAll = useMemo(() => {
    const arr = rows.slice();
    arr.sort((a,b)=>{
      const k = decodedSort.key;
      const va = (a as any)[k];
      const vb = (b as any)[k];
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return decodedSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [rows, decodedSort]);
  const paginatedAll = useMemo(() => {
    const start = (pageAll - 1) * pageSize;
    return sortedAll.slice(start, start + pageSize);
  }, [sortedAll, pageAll, pageSize]);
  const sortedFiltered = useMemo(() => {
    const arr = filtered.slice();
    arr.sort((a:any,b:any)=>{
      const k = filteredSort.key as any;
      const va = a[k]; const vb = b[k];
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return filteredSort.dir === 'asc' ? cmp : -cmp;
    });
    return arr;
  }, [filtered, filteredSort]);
  const paginatedFiltered = useMemo(() => {
    const start = (pageFiltered - 1) * pageSize;
    return sortedFiltered.slice(start, start + pageSize);
  }, [sortedFiltered, pageFiltered, pageSize]);

  useEffect(() => { setPageAll(1); }, [rows, pageSize]);
  useEffect(() => { setPageFiltered(1); }, [filtered, pageSize]);

  // Keyboard: arrow left/right to switch pages on All table
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') setPageAll(p => Math.min(Math.ceil(rows.length / pageSize) || 1, p + 1));
      if (e.key === 'ArrowLeft') setPageAll(p => Math.max(1, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, pageSize]);

  // Show Back-to-top button
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll);
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const copyTx = async (hash: string) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedTx(hash);
      setTimeout(() => setCopiedTx(null), 1200);
    } catch {}
  };

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
    out.sort((a:any,b:any) => {
      const k = playerClassSort.key as any; const dir = playerClassSort.dir;
      const cmp = a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0;
      return dir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, player, playerClassSort]);

  // Overall per-class stats for all matches in the selected date window
  const overallClassStats: ClassRow[] = useMemo(() => {
    if (aggByClass) {
      const out = Object.entries(aggByClass).map(([klass, s]) => ({ klass, wins: s.wins, losses: s.losses, total: s.total, winrate: s.total ? s.wins / s.total : 0 }));
      out.sort((a:any,b:any) => {
        const k = overallSort.key as any; const dir = overallSort.dir;
        const cmp = a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0;
        return dir === 'asc' ? cmp : -cmp;
      });
      return out;
    }
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
    out.sort((a:any,b:any) => {
      const k = overallSort.key as any; const dir = overallSort.dir;
      const cmp = a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0;
      return dir === 'asc' ? cmp : -cmp;
    });
    return out;
  }, [rows, aggByClass, overallSort]);

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
        startTs: useUtc ? toStartOfDayEpoch(startDate) : toStartOfDayEpoch(startDate),
        endTs: useUtc ? toEndOfDayEpoch(endDate) : toEndOfDayEpoch(endDate),
        wantAgg: true,
      };
      const res = await fetch('/api/eth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j: ApiResponse = await res.json();
      if (!j.ok) throw new Error(j.error || 'Unknown error');
      const sorted = (j.rows || []).sort((a,b)=>a.blockNumber-b.blockNumber);
      setRows(sorted);
      setAggByClass(j.aggByClass || null);
      setAggUpdatedAt(j.aggLastUpdate || null);
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
  const toCsv = (rows: Array<Record<string, any>>, columns?: Array<{ key: string; label: string }>) => {
    const keys = columns?.map(c => c.key) || (rows[0] ? Object.keys(rows[0]) : []);
    const header = (columns?.map(c => c.label) || keys).join(',');
    const lines = rows.map(r => keys.map(k => {
      const v = r[k];
      const s = v === null || v === undefined ? '' : String(v);
      const escaped = '"' + s.replace(/"/g, '""') + '"';
      return /[",\n]/.test(s) ? escaped : s;
    }).join(','));
    return [header, ...lines].join('\n');
  };
  const dlCsv = (name: string, rows: Array<Record<string, any>>, columns?: Array<{ key: string; label: string }>) => {
    const csv = toCsv(rows, columns);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <Head><title>Showdown Winrate Checker</title></Head>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-4 rounded-xl bg-black text-white px-4 py-2 text-sm">
          This tool was brought to you by <span className="font-semibold">megaflop</span>.{' '}
          <a className="underline" href="https://x.com/fisiroky" target="_blank" rel="noreferrer">Follow on X</a>
        </div>

          <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={SHOWDOWN_LOGO} alt="Showdown logo" className="h-10 w-10 rounded"/>
            <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold tracking-tight">Showdown Winrate Checker</motion.h1>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={PLAY_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-black text-white px-3 py-1 text-xs shadow hover:opacity-90 dark:bg-white dark:text-black"
            >
              Play Showdown
            </a>
              <button
                onClick={() => setCompact(!compact)}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs dark:border-gray-600"
                title={compact ? 'Compact rows' : 'Comfortable rows'}
              >
                {compact ? 'Comfort' : 'Compact'}
              </button>
              <button
                onClick={() => setUseUtc(!useUtc)}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs dark:border-gray-600"
                title={useUtc ? 'Showing UTC times' : 'Showing local times'}
              >
                <Globe className="h-4 w-4"/>
                {useUtc ? 'UTC' : 'Local'}
              </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs dark:border-gray-600"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4"/> : <Moon className="h-4 w-4"/>}
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
          </div>
        </div>
        {/* subtitle removed per request */}

        <div className="mt-4">
          <a href={PLAY_URL} target="_blank" rel="noreferrer" aria-label="Play Showdown (opens in new tab)">
            <img src={SHOWDOWN_BANNER} alt="Showdown game artwork" className="w-full rounded-2xl shadow-sm object-cover"/>
          </a>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700"><Server className="h-4 w-4"/> Filters</div>
            <label className="mt-3 block text-xs text-gray-500">Player Name</label>
            <input className="mt-1 w-full rounded-xl border p-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" value={player} onChange={e=>setPlayer(e.target.value)} placeholder="megaflop" />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500">Start date</label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-gray-400"/>
                  <input type="text" inputMode="numeric" placeholder="YYYY-MM-DD or DD.MM.YYYY" className="mt-1 w-full rounded-xl border p-2 pl-7 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" value={startDate} onChange={e=>setStartDate(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500">End date (empty = latest)</label>
                <div className="relative">
                  <Calendar className="absolute left-2 top-2.5 h-4 w-4 text-gray-400"/>
                  <input type="text" inputMode="numeric" placeholder="YYYY-MM-DD or DD.MM.YYYY" className="mt-1 w-full rounded-xl border p-2 pl-7 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100" value={endDate} onChange={e=>setEndDate(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="text-gray-500 mr-1">Presets:</span>
              <button className="rounded-full border px-3 py-1 dark:border-gray-600" onClick={()=>applyPreset('today')}>Today</button>
              <button className="rounded-full border px-3 py-1 dark:border-gray-600" onClick={()=>applyPreset('last7')}>Last 7 days</button>
              <button className="rounded-full border px-3 py-1 dark:border-gray-600" onClick={()=>applyPreset('last30')}>Last 30 days</button>
              <button className="rounded-full border px-3 py-1 dark:border-gray-600" onClick={()=>applyPreset('thisMonth')}>This month</button>
              <button className="rounded-full border px-3 py-1 dark:border-gray-600" onClick={()=>applyPreset('prevMonth')}>Previous month</button>
              <button className="rounded-full border px-3 py-1 dark:border-gray-600" onClick={()=>applyPreset('allTime')}>All time</button>
              <button className="rounded-full border px-3 py-1 dark:border-gray-600" onClick={()=>applyPreset('sincePatch')}>Since last balance patch</button>
            </div>

            {/* Removed class and end reason filters per request */}

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
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 text-center shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Wins</div>
            <div className="mt-1 text-3xl font-semibold">{stats.wins}</div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 text-center shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Losses</div>
            <div className="mt-1 text-3xl font-semibold">{stats.losses}</div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 text-center shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Win Rate</div>
            <div className="mt-1 text-3xl font-semibold">{(stats.winrate*100).toFixed(2)}%</div>
          </div>
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 text-center shadow-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">Dominant Class</div>
            <div className="mt-1 text-base font-medium">{stats.dominantClass || '—'}</div>
            {stats.dominantClass && <div className="text-xs text-gray-500 mt-1">{Math.round((stats.dominantClassPct||0) * 100)}% of wins</div>}
          </div>
        </div>

        {/* All matches per-class performance (global) */}
        <div className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-100">Per‑Class Performance — All Matches in Range</div>
            {overallClassStats.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => dl("showdown_class_stats_all.json", overallClassStats)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                  <Download className="h-4 w-4"/> JSON
                </button>
                <button onClick={() => dlCsv("showdown_class_stats_all.csv", overallClassStats)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                  <Download className="h-4 w-4"/> CSV
                </button>
              </div>
            )}
          </div>
          <div className="mt-1 text-[10px] text-gray-500">{aggUpdatedAt ? `Aggregates last updated ${new Date(aggUpdatedAt).toLocaleString()}` : ''}</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                  <th className="p-2 w-52 cursor-pointer" onClick={()=>setOverallSort(s=>({ key:'klass' as any, dir: s.key==='klass' && s.dir==='asc' ? 'desc' : 'asc' }))}>Class</th>
                  <th className="p-2 w-24 cursor-pointer" onClick={()=>setOverallSort(s=>({ key:'wins' as any, dir: s.key==='wins' && s.dir==='asc' ? 'desc' : 'asc' }))}>Wins</th>
                  <th className="p-2 w-24 cursor-pointer" onClick={()=>setOverallSort(s=>({ key:'losses' as any, dir: s.key==='losses' && s.dir==='asc' ? 'desc' : 'asc' }))}>Losses</th>
                  <th className="p-2 w-24 cursor-pointer" onClick={()=>setOverallSort(s=>({ key:'total' as any, dir: s.key==='total' && s.dir==='asc' ? 'desc' : 'asc' }))}>Games</th>
                  <th className="p-2 w-28 cursor-pointer" onClick={()=>setOverallSort(s=>({ key:'winrate' as any, dir: s.key==='winrate' && s.dir==='asc' ? 'desc' : 'asc' }))}>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {overallClassStats.map((r, i) => (
                  <tr key={r.klass + i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
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
        <div className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-100">Per‑Class Performance for <span className="font-semibold">{player || '—'}</span></div>
            {classStats.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => dl("showdown_class_stats_" + (player||'player') + ".json", classStats)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                  <Download className="h-4 w-4"/> JSON
                </button>
                <button onClick={() => dlCsv("showdown_class_stats_" + (player||'player') + ".csv", classStats)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                  <Download className="h-4 w-4"/> CSV
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                  <th className="p-2 w-52 cursor-pointer" onClick={()=>setPlayerClassSort(s=>({ key:'klass' as any, dir: s.key==='klass' && s.dir==='asc' ? 'desc' : 'asc' }))}>Class</th>
                  <th className="p-2 w-24 cursor-pointer" onClick={()=>setPlayerClassSort(s=>({ key:'wins' as any, dir: s.key==='wins' && s.dir==='asc' ? 'desc' : 'asc' }))}>Wins</th>
                  <th className="p-2 w-24 cursor-pointer" onClick={()=>setPlayerClassSort(s=>({ key:'losses' as any, dir: s.key==='losses' && s.dir==='asc' ? 'desc' : 'asc' }))}>Losses</th>
                  <th className="p-2 w-24 cursor-pointer" onClick={()=>setPlayerClassSort(s=>({ key:'total' as any, dir: s.key==='total' && s.dir==='asc' ? 'desc' : 'asc' }))}>Games</th>
                  <th className="p-2 w-28 cursor-pointer" onClick={()=>setPlayerClassSort(s=>({ key:'winrate' as any, dir: s.key==='winrate' && s.dir==='asc' ? 'desc' : 'asc' }))}>Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {classStats.map((r, i) => (
                  <tr key={r.klass + i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
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
        <div className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-100">Class vs Class — Win rate of <span className="font-semibold">class</span> vs <span className="font-semibold">class</span></div>
            <label className="flex items-center gap-2 text-xs text-gray-600">
              <input type="checkbox" className="h-4 w-4" checked={matrixOnlyPlayer} onChange={e=>setMatrixOnlyPlayer(e.target.checked)} />
              Only matches incl. <span className="font-semibold">{player || 'player'}</span>
            </label>
          </div>
          <div className="mt-1 text-xs text-gray-500">Only dual-classes (with a <code>/</code>) are included. Cell = win rate of row‑class vs column‑class, with sample size in parentheses. “—” = no data (same class or fewer than 5 matches).</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead>
                <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                  <th className="p-2">Class \ Class</th>
                  {classVsClass.classes.map((c) => (
                    <th key={c} className="p-2 whitespace-nowrap">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classVsClass.matrix.map((row) => (
                  <tr key={row.rowClass} className="border-b dark:border-gray-700">
                    <td className="p-2 font-medium whitespace-nowrap">{row.rowClass}</td>
                    {row.cells.map((cell) => {
                      const pct = cell.pct as number | null;
                      const enough = (cell.total || 0) >= 5;
                      const bgStyle = pct === null || !enough
                        ? {}
                        : { backgroundColor: `hsl(${Math.round((pct as number) * 120)}, 50%, 45%)` };
                      const label = pct === null || !enough ? '—' : `${Math.round((pct as number)*100)}% (${cell.total})`;
                      return (
                        <td
                          key={row.rowClass + '->' + cell.colClass}
                          className="p-2 tabular-nums text-center align-middle"
                          style={bgStyle}
                          title={pct === null ? '' : `${cell.wins}/${cell.total} wins`}
                        >
                          {label}
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
          <div className="mt-2 text-[10px] text-gray-500">Cells with fewer than 5 matches are hidden. Colors toned: 0% → red, 50% → muted yellow, 100% → green.</div>
        </div>

        {/* Player-specific matches */}
        <div className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-100">Matches for <span className="font-semibold">{player || '—'}</span> ({filtered.length})</div>
            {filtered.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => dl("showdown_matches_for_" + (player||'player') + ".json", filtered)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                  <Download className="h-4 w-4"/> JSON
                </button>
                <button onClick={() => dlCsv("showdown_matches_for_" + (player||'player') + ".csv", filtered)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                  <Download className="h-4 w-4"/> CSV
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                  <th className="p-2 w-28 cursor-pointer" onClick={()=>setFilteredSort(s=>({ key:'blockNumber' as any, dir: s.key==='blockNumber' && s.dir==='asc' ? 'desc' : 'asc' }))}>Block</th>
                  <th className="p-2 w-24 cursor-pointer" onClick={()=>setFilteredSort(s=>({ key:'gameNumber' as any, dir: s.key==='gameNumber' && s.dir==='asc' ? 'desc' : 'asc' }))}>Game #</th>
                  <th className="p-2 w-20 cursor-pointer" onClick={()=>setFilteredSort(s=>({ key:'result' as any, dir: s.key==='result' && s.dir==='asc' ? 'desc' : 'asc' }))}>Result</th>
                  <th className="p-2 w-40 cursor-pointer" onClick={()=>setFilteredSort(s=>({ key:'opponent' as any, dir: (s.key as any)=='opponent' && s.dir==='asc' ? 'desc' : 'asc' }))}>Opponent</th>
                  <th className="p-2 w-40 whitespace-nowrap">Started ({useUtc ? 'UTC' : 'Local'})</th>
                  <th className="p-2 w-36">Reason</th>
                  <th className="p-2 w-16">Tx</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFiltered.map((r, i) => (
                  <tr key={r.txHash + i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="p-2 tabular-nums">{r.blockNumber}</td>
                    <td className="p-2 tabular-nums">{r.gameNumber}</td>
                    <td className="p-2 font-medium">{r.result}</td>
                    <td className="p-2">{r.opponent}</td>
                    <td className="p-2">{r.startedAt}</td>
                    <td className="p-2">{r.endReason}</td>
                    <td className="p-2 flex items-center gap-2">
                      <a className="text-blue-600 underline" href={`https://web3.okx.com/explorer/megaeth-testnet/tx/${r.txHash}`} target="_blank" rel="noreferrer">tx</a>
                      <button className="rounded border px-1 py-0.5 text-[10px]" title="Copy tx hash" onClick={()=>copyTx(r.txHash)}>
                        {copiedTx === r.txHash ? <Check className="h-3 w-3"/> : <Clipboard className="h-3 w-3"/>}
                      </button>
                    </td>
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
          {filtered.length > pageSize && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs">
              <button className="rounded border px-2 py-1" onClick={()=>setPageFiltered(p=>Math.max(1,p-1))} disabled={pageFiltered===1}>Prev</button>
              <div>Page {pageFiltered} / {Math.ceil(filtered.length / pageSize)}</div>
              <button className="rounded border px-2 py-1" onClick={()=>setPageFiltered(p=>Math.min(Math.ceil(filtered.length / pageSize),p+1))} disabled={pageFiltered>=Math.ceil(filtered.length / pageSize)}>Next</button>
              <select className="ml-2 rounded border px-2 py-1 bg-white dark:bg-gray-900 dark:border-gray-700" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <input
                value={jumpFiltered}
                onChange={e=>setJumpFiltered(e.target.value)}
                onKeyDown={e=>{ if (e.key==='Enter') { const n=parseInt(jumpFiltered||'1',10); if (!isNaN(n)) setPageFiltered(Math.min(Math.max(1,n), Math.ceil(filtered.length/pageSize))); } }}
                className="ml-2 w-16 rounded border px-2 py-1 bg-white dark:bg-gray-900 dark:border-gray-700"
                placeholder="Go"
              />
            </div>
          )}
        </div>

        {/* All decoded list (newest first) */}
        <div className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-100">All Decoded Matches ({rows.length})</div>
            {rows.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => dl("showdown_winrate_results.json", rows)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                  <Download className="h-4 w-4"/> JSON
                </button>
                <button onClick={() => dlCsv("showdown_winrate_results.csv", rows)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                  <Download className="h-4 w-4"/> CSV
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                  <th className="p-2 w-28 cursor-pointer" onClick={()=>setDecodedSort(s=>({ key:'blockNumber' as any, dir: s.key==='blockNumber' && s.dir==='asc' ? 'desc' : 'asc' }))}>Block</th>
                  <th className="p-2 w-24 cursor-pointer" onClick={()=>setDecodedSort(s=>({ key:'gameNumber' as any, dir: s.key==='gameNumber' && s.dir==='asc' ? 'desc' : 'asc' }))}>Game #</th>
                  <th className="p-2 w-40">Game ID</th>
                  <th className="p-2 w-40 whitespace-nowrap">Started ({useUtc ? 'UTC' : 'Local'})</th>
                  <th className="p-2 w-40 cursor-pointer" onClick={()=>setDecodedSort(s=>({ key:'winningPlayer' as any, dir: s.key==='winningPlayer' && s.dir==='asc' ? 'desc' : 'asc' }))}>Winner</th>
                  <th className="p-2 w-40 cursor-pointer" onClick={()=>setDecodedSort(s=>({ key:'losingPlayer' as any, dir: s.key==='losingPlayer' && s.dir==='asc' ? 'desc' : 'asc' }))}>Loser</th>
                  <th className="p-2 w-36">Reason</th>
                  <th className="p-2 w-16">Tx</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAll.map((r, i) => (
                  <tr key={r.txHash + i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="p-2 tabular-nums">{r.blockNumber}</td>
                    <td className="p-2 tabular-nums">{r.gameNumber}</td>
                    <td className="p-2">{r.gameId}</td>
                    <td className="p-2">{r.startedAt}</td>
                    <td className="p-2 font-medium">{r.winningPlayer}</td>
                    <td className="p-2">{r.losingPlayer}</td>
                    <td className="p-2">{r.endReason}</td>
                    <td className="p-2 flex items-center gap-2">
                      <a className="text-blue-600 underline" href={`https://web3.okx.com/explorer/megaeth-testnet/tx/${r.txHash}`} target="_blank" rel="noreferrer">tx</a>
                      <button className="rounded border px-1 py-0.5 text-[10px]" title="Copy tx hash" onClick={()=>copyTx(r.txHash)}>
                        {copiedTx === r.txHash ? <Check className="h-3 w-3"/> : <Clipboard className="h-3 w-3"/>}
                      </button>
                    </td>
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
          {rows.length > pageSize && (
            <div className="mt-3 flex items-center justify-center gap-2 text-xs">
              <button className="rounded border px-2 py-1" onClick={()=>setPageAll(p=>Math.max(1,p-1))} disabled={pageAll===1}>Prev</button>
              <div>Page {pageAll} / {Math.ceil((rows.length) / pageSize)}</div>
              <button className="rounded border px-2 py-1" onClick={()=>setPageAll(p=>Math.min(Math.ceil((rows.length) / pageSize),p+1))} disabled={pageAll>=Math.ceil((rows.length) / pageSize)}>Next</button>
              <select className="ml-2 rounded border px-2 py-1 bg-white dark:bg-gray-900 dark:border-gray-700" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <input
                value={jumpAll}
                onChange={e=>setJumpAll(e.target.value)}
                onKeyDown={e=>{ if (e.key==='Enter') { const n=parseInt(jumpAll||'1',10); if (!isNaN(n)) setPageAll(Math.min(Math.max(1,n), Math.ceil(rows.length/pageSize))); } }}
                className="ml-2 w-16 rounded border px-2 py-1 bg-white dark:bg-gray-900 dark:border-gray-700"
                placeholder="Go"
              />
            </div>
          )}
        </div>

        <div className="mt-4 text-xs text-gray-500">
          Daily cache on the server makes historical queries instant; today is fetched incrementally.
        </div>
      </div>
      <BackToTop visible={showTop} />
    </div>
  );
}

// Back to top floating button
function BackToTop({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      className="fixed bottom-6 right-6 z-20 rounded-full bg-black text-white p-3 shadow-lg dark:bg-white dark:text-black"
      title="Back to top"
    >
      <ArrowUp className="h-4 w-4"/>
    </button>
  );
}
