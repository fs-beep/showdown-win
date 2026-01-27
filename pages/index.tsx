
import Head from 'next/head';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { Calendar, Download, Loader2, Play, Server, ShieldAlert, Moon, Sun, Clipboard, Check, ArrowUp } from 'lucide-react';

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
  gameType?: string;
  metadata?: string;
  network?: 'legacy' | 'megaeth-mainnet';
};

type ClassRow = { klass: string; wins: number; losses: number; total: number; winrate: number };
type PlayerRow = { player: string; wins: number; losses: number; total: number; winrate: number };
type UsdmProfitRow = { player: string; won: string; lost: string; net: string; txs: number };
type UsdmVolumePoint = { day: string; volume: string };
type ApiResponse = { ok: boolean; error?: string; warning?: string; rows?: Row[]; aggByClass?: Record<string, { wins: number; losses: number; total: number }>; aggLastUpdate?: number };

const MIN_DATE = '2025-07-25';
const BALANCE_PATCH_DATE = '2026-01-13';
const BALANCE_PATCH_TS = 1768392000; // 2026-01-13 11:00:00 CET (10:00:00 UTC)
const SHOWDOWN_LOGO = '/images/showdown_small.jpg';
const SHOWDOWN_BANNER = '/images/showdown_large.jpeg';
const PLAY_URL = 'https://alpha.showdown.game/';
const stripPlayerSuffix = (name?: string) => {
  if (!name) return '';
  const trimmed = name.trim();
  const idx = trimmed.indexOf('#');
  return idx === -1 ? trimmed : trimmed.slice(0, idx);
};

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
function fmtDisplayDate(dateStr?: string): string {
  const p = parseDateFlexible(dateStr);
  if (!p) return dateStr || '';
  const d = new Date(p.y, p.m - 1, p.d);
  if (isNaN(d.getTime())) return dateStr || '';
  const month = d.toLocaleString('en-US', { month: 'short' });
  const year2 = String(p.y).slice(-2);
  return `${month} ${p.d} ${year2}`;
}
function parseStartedAtTsClient(str?: string): number | null {
  if (!str) return null;
  const s = str.trim();
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[ T]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\s*(?:UTC|Z))?$/i.exec(s);
  if (m) {
    const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
    return Math.floor(ms / 1000);
  }
  const iso = s.replace(' ', 'T').replace(/\s*UTC$/i, 'Z');
  const ms = Date.parse(iso);
  if (isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}
function toStartOfDayEpoch(dateStr?: string): number | undefined {
  const p = parseDateFlexible(dateStr);
  if (!p) return undefined;
  const ms = Date.UTC(p.y, p.m-1, p.d, 0, 0, 0);
  if (isNaN(ms)) return undefined;
  return Math.floor(ms/1000);
}
function toEndOfDayEpoch(dateStr?: string): number | undefined {
  const p = parseDateFlexible(dateStr);
  if (!p) return undefined;
  const ms = Date.UTC(p.y, p.m-1, p.d, 23, 59, 59);
  if (isNaN(ms)) return undefined;
  return Math.floor(ms/1000);
}
function formatUsdm(weiStr?: string) {
  if (!weiStr) return '0';
  const bi = BigInt(weiStr);
  const sign = bi < 0n ? '-' : '';
  const abs = bi < 0n ? -bi : bi;
  const base = 1000000000000000000n;
  const rounded = (abs + 500000000000000000n) / base;
  return `${sign}${rounded.toString()}`;
}
function ratioToFloat(n: bigint, d: bigint) {
  if (d === 0n) return 0;
  const scaled = (n * 10000n) / d;
  return Number(scaled) / 10000;
}
function mergeRowsClient(a: Row[], b: Row[]) {
  const map = new Map<string, Row>();
  for (const r of a) {
    const key = typeof (r as any).logIndex === 'number' ? `${r.txHash}:${(r as any).logIndex}` : (r.gameId ? `gid:${r.gameId}` : `${r.txHash}:${r.blockNumber}`);
    map.set(key, r);
  }
  for (const r of b) {
    const key = typeof (r as any).logIndex === 'number' ? `${r.txHash}:${(r as any).logIndex}` : (r.gameId ? `gid:${r.gameId}` : `${r.txHash}:${r.blockNumber}`);
    map.set(key, r);
  }
  return Array.from(map.values());
}
function shortAddr(addr?: string) {
  if (!addr) return '';
  const a = addr.trim();
  if (a.length <= 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Home() {
  const router = useRouter();
  const [startDate, setStartDate] = useState<string>(BALANCE_PATCH_DATE);
  const [endDate, setEndDate] = useState<string>('');
  const [player, setPlayer] = useState<string>('barry');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const hydrated = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [matrixOnlyPlayer, setMatrixOnlyPlayer] = useState<boolean>(true);
  const [selectedBaseClasses, setSelectedBaseClasses] = useState<string[]>([]);
  const [classVsClassSort, setClassVsClassSort] = useState<{ key: 'opponent' | 'winRate' | 'wins' | 'losses' | 'total'; dir: 'asc' | 'desc' }>({ key: 'total', dir: 'desc' });
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [playerInputFocused, setPlayerInputFocused] = useState(false);
  const [copiedTx, setCopiedTx] = useState<string | null>(null);
  const [showTop, setShowTop] = useState<boolean>(false);
  const [recentPlayers, setRecentPlayers] = useState<string[]>([]);
  const [expandedFiltered, setExpandedFiltered] = useState<Set<string>>(new Set());
  const [expandedAll, setExpandedAll] = useState<Set<string>>(new Set());
  const [aggByClass, setAggByClass] = useState<Record<string, { wins: number; losses: number; total: number }> | null>(null);
  const [aggUpdatedAt, setAggUpdatedAt] = useState<number | null>(null);
  const [player2, setPlayer2] = useState<string>('');
  const [usdmRows, setUsdmRows] = useState<UsdmProfitRow[]>([]);
  const [usdmLoading, setUsdmLoading] = useState(false);
  const [usdmError, setUsdmError] = useState<string | null>(null);
  const [usdmUpdatedAt, setUsdmUpdatedAt] = useState<number | null>(null);
  const [usdmVolumeSeries, setUsdmVolumeSeries] = useState<UsdmVolumePoint[]>([]);
  const [usdmTotalVolume, setUsdmTotalVolume] = useState<string>('0');
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [lastQueryLive, setLastQueryLive] = useState<boolean>(false);
  const [dataPhase, setDataPhase] = useState<'idle' | 'cached' | 'live'>('idle');

  const showMoneyTables = true;

  useEffect(() => {
    try {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
      const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initial: 'light' | 'dark' = stored === 'dark' || (!stored && prefersDark) ? 'dark' : 'light';
      setTheme(initial);
      if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', initial === 'dark');
      const rp = typeof window !== 'undefined' ? localStorage.getItem('recentPlayers') : null;
      if (rp) setRecentPlayers(JSON.parse(rp));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', theme === 'dark');
      if (typeof window !== 'undefined') localStorage.setItem('theme', theme);
    } catch {}
  }, [theme]);


  // 1) Initialize state from URL query once
  useEffect(() => {
    if (hydrated.current || !router.isReady) return;
    const q = router.query;
    const s = typeof q.start === 'string' ? q.start : undefined;
    const e = typeof q.end === 'string' ? q.end : undefined;
    const p = typeof q.player === 'string' ? q.player : undefined;
    const only = typeof q.only === 'string' ? q.only : undefined;
    const t = typeof q.theme === 'string' ? q.theme : undefined;
    
    const cmp = typeof q.compare === 'string' ? q.compare : undefined;
    if (s) setStartDate(s);
    if (e) setEndDate(e);
    if (p) setPlayer(p);
    if (only === '1') setMatrixOnlyPlayer(true);
    if (t === 'dark') setTheme('dark');
    if (cmp) setPlayer2(cmp);
    const share = typeof q.share === 'string' ? q.share : undefined;
    if (share) {
      setShareLoading(true);
      fetch(`/api/share?id=${encodeURIComponent(share)}`)
        .then(r => r.json())
        .then(j => {
          if (!j.ok) throw new Error(j.error || 'Failed to load snapshot');
          const data = j.data || {};
          if (data.params) {
            if (data.params.start) setStartDate(data.params.start);
            if (data.params.end !== undefined) setEndDate(data.params.end);
            if (data.params.player) setPlayer(data.params.player);
            if (data.params.only === '1') setMatrixOnlyPlayer(true);
            if (data.params.compare) setPlayer2(data.params.compare);
          }
          setRows(data.rows || []);
          setAggByClass(data.aggByClass || null);
          setAggUpdatedAt(data.aggLastUpdate || null);
          setWarning(null);
          setError(null);
        })
        .catch((err:any) => setError(err?.message || String(err)))
        .finally(() => setShareLoading(false));
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  // Removed auto-fetch - let users enter name and dates first, then click Compute

  // 2) Keep URL in sync with state (shallow replace)
  useEffect(() => {
    if (!hydrated.current) return;
    const nextQuery: Record<string, string> = {};
    if (startDate) nextQuery.start = startDate;
    if (endDate) nextQuery.end = endDate;
    if (player) nextQuery.player = player;
    if (matrixOnlyPlayer) nextQuery.only = '1';
    if (theme === 'dark') nextQuery.theme = 'dark';
    if (player2.trim()) nextQuery.compare = player2.trim();
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }, [startDate, endDate, player, player2, matrixOnlyPlayer, theme]);

  

  // Count all matches for statistics (regardless of endReason)
  const statRows = useMemo(() => {
    return rows;
  }, [rows]);

  const stats = useMemo(() => {
    const p = player.trim().toLowerCase();
    const winRows = statRows.filter(r => r.winningPlayer?.trim?.().toLowerCase() === p);
    const loseRows = statRows.filter(r => r.losingPlayer?.trim?.().toLowerCase() === p);

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
  }, [statRows, player]);

  const cachedThrough = useMemo(() => {
    let max = 0;
    for (const r of rows) {
      const ts = parseStartedAtTsClient(r.startedAt);
      if (ts && ts > max) max = ts;
    }
    return max ? new Date(max * 1000).toLocaleString() : null;
  }, [rows]);
  const cachedThroughLabel = useMemo(() => {
    const endTs = toEndOfDayEpoch(endDate);
    const now = new Date();
    const todayStartTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
    const yesterday = new Date((todayStartTs - 1) * 1000);
    if (!lastQueryLive && (!endTs || endTs >= todayStartTs)) {
      return yesterday.toLocaleString();
    }
    return cachedThrough || 'latest cached block';
  }, [cachedThrough, endDate, lastQueryLive]);

  const filtered = useMemo(() => {
    const p = player.trim().toLowerCase();
    return rows
      .filter(r => r.winningPlayer?.trim?.().toLowerCase() === p || r.losingPlayer?.trim?.().toLowerCase() === p)
      .map(r => ({
        ...r,
        result: (() => {
          const win = r.winningPlayer?.trim?.().toLowerCase() === p;
          const isTimeout = (r.endReason || '').toLowerCase().includes('timeout');
          const base = win ? 'Win' : 'Loss';
          return isTimeout ? base + ' Timeout' : base;
        })(),
        opponent: r.winningPlayer?.trim?.().toLowerCase() === p ? r.losingPlayer : r.winningPlayer,
        playerClasses: r.winningPlayer?.trim?.().toLowerCase() === p ? r.winningClasses : r.losingClasses,
        opponentClasses: r.winningPlayer?.trim?.().toLowerCase() === p ? r.losingClasses : r.winningClasses,
      }))
      .sort((a, b) => b.blockNumber - a.blockNumber); // newest first
  }, [rows, player]);

  // Quick compare stats for optional second player and head-to-head
  const stats2 = useMemo(() => {
    const p2 = player2.trim().toLowerCase();
    if (!p2) return null as null | { wins:number; losses:number; total:number; winrate:number };
    const winRows = statRows.filter(r => r.winningPlayer?.trim?.().toLowerCase() === p2);
    const loseRows = statRows.filter(r => r.losingPlayer?.trim?.().toLowerCase() === p2);
    const wins = winRows.length; const losses = loseRows.length; const total = wins + losses; const winrate = total ? (wins/total) : 0;
    return { wins, losses, total, winrate };
  }, [statRows, player2]);
  const h2h = useMemo(() => {
    const p1 = player.trim().toLowerCase();
    const p2 = player2.trim().toLowerCase();
    if (!p1 || !p2) return null as null | { p1Wins:number; p2Wins:number; total:number };
    let p1Wins = 0, p2Wins = 0;
    for (const r of statRows) {
      const w = r.winningPlayer?.trim?.().toLowerCase();
      const l = r.losingPlayer?.trim?.().toLowerCase();
      if ((w===p1 && l===p2)) p1Wins++; else if ((w===p2 && l===p1)) p2Wins++;
    }
    return { p1Wins, p2Wins, total: p1Wins + p2Wins };
  }, [statRows, player, player2]);

  // Pagination state
  const [pageAll, setPageAll] = useState(1);
  const [pageFiltered, setPageFiltered] = useState(1);
  const [pageSize, setPageSize] = useState<number>(5);
  const [jumpAll, setJumpAll] = useState<string>('');
  const [jumpFiltered, setJumpFiltered] = useState<string>('');
  // Sorting state
  const [decodedSort, setDecodedSort] = useState<{ key: keyof Row; dir: 'asc'|'desc' }>({ key: 'startedAt', dir: 'desc' });
  const [filteredSort, setFilteredSort] = useState<{ key: keyof Row | 'result'; dir: 'asc'|'desc' }>({ key: 'startedAt', dir: 'desc' });
  const [overallSort, setOverallSort] = useState<{ key: keyof ClassRow; dir: 'asc'|'desc' }>({ key: 'winrate', dir: 'desc' });
  const [playerClassSort, setPlayerClassSort] = useState<{ key: keyof ClassRow; dir: 'asc'|'desc' }>({ key: 'total', dir: 'desc' });
  const sortedAll = useMemo(() => {
    const arr = rows.slice();
    arr.sort((a,b)=>{
      const k = decodedSort.key;
      let va = (a as any)[k];
      let vb = (b as any)[k];
      // Special handling for startedAt - parse timestamp for proper comparison
      if (k === 'startedAt') {
        const parseTs = (str: string): number => {
          if (!str) return 0;
          const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[ T]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\s*(?:UTC|Z))?$/i.exec(str.trim());
          if (m) {
            const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
            return Math.floor(ms / 1000);
          }
          const iso = str.replace(' ', 'T').replace(/\s*UTC$/i, 'Z');
          const parsed = Date.parse(iso);
          return isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
        };
        va = parseTs(va);
        vb = parseTs(vb);
      }
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
      let va = a[k];
      let vb = b[k];
      // Special handling for startedAt - parse timestamp for proper comparison
      if (k === 'startedAt') {
        const parseTs = (str: string): number => {
          if (!str) return 0;
          const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[ T]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\s*(?:UTC|Z))?$/i.exec(str.trim());
          if (m) {
            const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
            return Math.floor(ms / 1000);
          }
          const iso = str.replace(' ', 'T').replace(/\s*UTC$/i, 'Z');
          const parsed = Date.parse(iso);
          return isNaN(parsed) ? 0 : Math.floor(parsed / 1000);
        };
        va = parseTs(va);
        vb = parseTs(vb);
      }
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

  const toggleExpandedFiltered = (tx: string) => {
    setExpandedFiltered(prev => {
      const n = new Set(prev);
      if (n.has(tx)) n.delete(tx); else n.add(tx);
      return n;
    });
  };
  const toggleExpandedAll = (tx: string) => {
    setExpandedAll(prev => {
      const n = new Set(prev);
      if (n.has(tx)) n.delete(tx); else n.add(tx);
      return n;
    });
  };

  const classStats: ClassRow[] = useMemo(() => {
    const p = player.trim().toLowerCase();
    const map = new Map<string, { wins: number; losses: number; total: number }>();
    for (const r of statRows) {
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
  }, [statRows, player, playerClassSort]);

  // Overall per-class stats for all matches in the selected date window
  const overallClassStats: ClassRow[] = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; total: number }>();
    for (const r of statRows) {
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
  }, [statRows, overallSort]);

  // Trend helpers (mini sparkline per class over time)
  function parseTs(str: string): number | null {
    if (!str) return null;
    const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})[ T]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\s*(?:UTC|Z))?$/i.exec(str.trim());
    if (m) {
      const ms = Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]);
      return Math.floor(ms/1000);
    }
    const iso = str.replace(' ', 'T').replace(/\s*UTC$/i, 'Z');
    const ms = Date.parse(iso);
    return isNaN(ms) ? null : Math.floor(ms/1000);
  }
  const dayIndicesAll = useMemo(() => {
    const s = new Set<number>();
    for (const r of statRows) {
      const ts = parseTs(r.startedAt); if (ts==null) continue; s.add(Math.floor(ts/86400));
    }
    return Array.from(s).sort((a,b)=>a-b);
  }, [statRows]);
  const dayIndicesPlayer = useMemo(() => {
    const p = player.trim().toLowerCase();
    const s = new Set<number>();
    for (const r of statRows) {
      if (r.winningPlayer?.trim?.().toLowerCase() !== p && r.losingPlayer?.trim?.().toLowerCase() !== p) continue;
      const ts = parseTs(r.startedAt); if (ts==null) continue; s.add(Math.floor(ts/86400));
    }
    return Array.from(s).sort((a,b)=>a-b);
  }, [statRows, player]);
  function buildTrend(rowsSubset: Row[], classes: string[], dayIdxs: number[]) {
    const idxMap = new Map<number, number>(); dayIdxs.forEach((d,i)=>idxMap.set(d,i));
    const out = new Map<string, number[]>(classes.map(c=>[c, Array(dayIdxs.length).fill(0)]));
    for (const r of rowsSubset) {
      const ts = parseTs(r.startedAt); if (ts==null) continue; const di = Math.floor(ts/86400); const pos = idxMap.get(di); if (pos==null) continue;
      const w = (r.winningClasses||'').trim(); const l=(r.losingClasses||'').trim();
      if (w && out.has(w)) out.get(w)![pos] += 1;
      if (l && out.has(l)) out.get(l)![pos] += 1;
    }
    return out;
  }
  const overallTrends = useMemo(() => buildTrend(statRows, overallClassStats.map(x=>x.klass), dayIndicesAll), [statRows, overallClassStats, dayIndicesAll]);
  const playerRowsSubset = useMemo(()=>{
    const p = player.trim().toLowerCase();
    return statRows.filter(r => r.winningPlayer?.trim?.().toLowerCase() === p || r.losingPlayer?.trim?.().toLowerCase() === p);
  }, [statRows, player]);
  const playerTrends = useMemo(() => buildTrend(playerRowsSubset, classStats.map(x=>x.klass), dayIndicesPlayer), [playerRowsSubset, classStats, dayIndicesPlayer]);

  // Preselect dominant dual-class for the selected player (refresh on player/range changes)
  useEffect(() => {
    if (!matrixOnlyPlayer) return;
    const p = player.trim().toLowerCase();
    if (!p) return;
    const counts = new Map<string, number>();
    for (const r of statRows) {
      const win = r.winningPlayer?.trim?.().toLowerCase() === p;
      const lose = r.losingPlayer?.trim?.().toLowerCase() === p;
      if (!win && !lose) continue;
      const cls = (win ? r.winningClasses : r.losingClasses) || '';
      const trimmed = cls.trim();
      if (!trimmed || !trimmed.includes('/')) continue;
      counts.set(trimmed, (counts.get(trimmed) || 0) + 1);
    }
    let best: string | null = null;
    let bestCount = 0;
    for (const [cls, cnt] of counts.entries()) {
      if (cnt > bestCount) { best = cls; bestCount = cnt; }
    }
    if (!best) {
      setSelectedBaseClasses([]);
      return;
    }
    const parts = best.split('/').map(s => s.trim()).filter(Boolean);
    if (parts.length !== 2) {
      setSelectedBaseClasses([]);
      return;
    }
    setSelectedBaseClasses(parts);
  }, [statRows, player, matrixOnlyPlayer, startDate, endDate]);

  function Spark({ data }: { data: number[] }) {
    const w = 60, h = 14; const max = Math.max(1, ...data); const step = data.length>1 ? (w/(data.length-1)) : w;
    const pts = data.map((v,i)=> `${i*step},${h - (v/max)*h}`).join(' ');
    return (
      <svg width={w} height={h} aria-hidden="true">
        <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1" opacity={0.6} />
      </svg>
    );
  }

  // The 6 base classes
  const BASE_CLASSES = ['Bureaucrat', 'Cheater', 'Gambler', 'Inventor', 'Protector', 'Rebel'] as const;

  const rangeLabel = useMemo(() => {
    const startRaw = startDate || MIN_DATE;
    const endRaw = endDate || '';
    const start = fmtDisplayDate(startRaw);
    const end = endRaw ? fmtDisplayDate(endRaw) : 'latest';
    return `${start} → ${end}`;
  }, [startDate, endDate]);

  // Class vs Class matrix (dual-classes only). Toggle: all games vs only games including the selected player.
  const classVsClass = useMemo(() => {
    const p = player.trim().toLowerCase();
    const subset = matrixOnlyPlayer
      ? statRows.filter(r => r.winningPlayer?.trim?.().toLowerCase() === p || r.losingPlayer?.trim?.().toLowerCase() === p)
      : statRows;

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
    
    // Create matchups map for selected class view
    const matchups: Record<string, Array<{ opponent: string; wins: number; losses: number; total: number; winRate: number }>> = {};
    for (const cls of classes) {
      const opponents: Array<{ opponent: string; wins: number; losses: number; total: number; winRate: number }> = [];
      for (const opp of classes) {
        if (cls === opp) continue;
        const w = (wins[cls]?.[opp]) ?? 0;
        const l = (wins[opp]?.[cls]) ?? 0;
        const total = w + l;
        if (total === 0) continue;
        opponents.push({ opponent: opp, wins: w, losses: l, total, winRate: w / total });
      }
      // Sort by total games descending
      opponents.sort((a, b) => b.total - a.total);
      matchups[cls] = opponents;
    }
    
    return { classes, matchups };
  }, [statRows, player, matrixOnlyPlayer]);

  // Combine selected base classes into a dual-class name (sorted alphabetically)
  const selectedDualClass = useMemo(() => {
    if (selectedBaseClasses.length !== 2) return '';
    return [...selectedBaseClasses].sort().join('/');
  }, [selectedBaseClasses]);

  // Toggle a base class selection
  const toggleBaseClass = (cls: string) => {
    setSelectedBaseClasses(prev => {
      if (prev.includes(cls)) {
        // Deselect
        return prev.filter(c => c !== cls);
      } else if (prev.length < 2) {
        // Add if we have room
        return [...prev, cls];
      } else {
        // Replace the first one if we already have 2
        return [prev[1], cls];
      }
    });
  };

  // Top players by win rate across all rows (min 15 games)
  const topPlayers: PlayerRow[] = useMemo(() => {
    const byPlayer = new Map<string, { wins: number; losses: number; total: number }>();
    for (const r of statRows) {
      const w = (r.winningPlayer ?? '').trim();
      const l = (r.losingPlayer ?? '').trim();
      if (w) {
        const key = w.toLowerCase();
        const s = byPlayer.get(key) || { wins: 0, losses: 0, total: 0 };
        s.wins += 1; s.total += 1; byPlayer.set(key, s);
      }
      if (l) {
        const key = l.toLowerCase();
        const s = byPlayer.get(key) || { wins: 0, losses: 0, total: 0 };
        s.losses += 1; s.total += 1; byPlayer.set(key, s);
      }
    }
    return Array.from(byPlayer.entries())
      .map(([playerKey, s]) => ({ player: playerKey, wins: s.wins, losses: s.losses, total: s.total, winrate: s.total ? s.wins / s.total : 0 }))
      .filter(p => p.total >= 30)
      .sort((a, b) => (b.winrate - a.winrate) || (b.total - a.total) || (b.wins - a.wins) || a.player.localeCompare(b.player))
      .slice(0, 10);
  }, [statRows]);

  // Top player by class (dual-classes only, min 5 games)
  const topPlayersByClass = useMemo(() => {
    // Map: class -> player -> { wins, losses, total }
    const byClassPlayer = new Map<string, Map<string, { wins: number; losses: number; total: number }>>();
    
    for (const r of statRows) {
      const winCls = (r.winningClasses ?? '').trim();
      const loseCls = (r.losingClasses ?? '').trim();
      const winner = (r.winningPlayer ?? '').trim().toLowerCase();
      const loser = (r.losingPlayer ?? '').trim().toLowerCase();
      
      // Only consider dual-classes (contain /)
      if (winCls && winCls.includes('/') && winner) {
        if (!byClassPlayer.has(winCls)) byClassPlayer.set(winCls, new Map());
        const playerMap = byClassPlayer.get(winCls)!;
        const s = playerMap.get(winner) || { wins: 0, losses: 0, total: 0 };
        s.wins += 1; s.total += 1;
        playerMap.set(winner, s);
      }
      if (loseCls && loseCls.includes('/') && loser) {
        if (!byClassPlayer.has(loseCls)) byClassPlayer.set(loseCls, new Map());
        const playerMap = byClassPlayer.get(loseCls)!;
        const s = playerMap.get(loser) || { wins: 0, losses: 0, total: 0 };
        s.losses += 1; s.total += 1;
        playerMap.set(loser, s);
      }
    }
    
    // For each class, find the top player (min 5 games, highest win rate)
    const result: Array<{ klass: string; player: string; wins: number; losses: number; total: number; winrate: number }> = [];
    for (const [klass, playerMap] of byClassPlayer.entries()) {
      let best: { player: string; wins: number; losses: number; total: number; winrate: number } | null = null;
      for (const [playerName, stats] of playerMap.entries()) {
        if (stats.total < 20) continue;
        const wr = stats.wins / stats.total;
        if (!best || wr > best.winrate || (wr === best.winrate && stats.total > best.total)) {
          best = { player: playerName, wins: stats.wins, losses: stats.losses, total: stats.total, winrate: wr };
        }
      }
      if (best) {
        result.push({ klass, ...best });
      }
    }
    
    return result.sort((a, b) => b.winrate - a.winrate || b.total - a.total || a.klass.localeCompare(b.klass));
  }, [statRows]);

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
      // Latest balance patch: 2026-01-13 11:00 CET → latest
      setStartDate(BALANCE_PATCH_DATE);
      setEndDate('');
    }
  };

  const run = async () => {
    setError(null); setWarning(null); setRows([]); setLoading(true); setDataPhase('idle');
    try {
      // Use exact balance patch timestamp if start date matches
      const startTs = startDate === BALANCE_PATCH_DATE ? BALANCE_PATCH_TS : toStartOfDayEpoch(startDate);
      const body = {
        startTs,
        endTs: toEndOfDayEpoch(endDate),
        wantAgg: true,
        live: false,
        cacheOnly: true,
      };
      const res = await fetch('/api/eth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const j: ApiResponse = await res.json();
      if (!j.ok) throw new Error(j.error || 'Unknown error');
      if (j.warning) setWarning(j.warning);
      // Rows are already sorted by timestamp from API
      const normalized = (j.rows || []).map(r => ({
        ...r,
        winningPlayer: stripPlayerSuffix(r.winningPlayer),
        losingPlayer: stripPlayerSuffix(r.losingPlayer),
      }));
      setRows(normalized);
      const setP = new Set<string>(recentPlayers);
      for (const r of normalized) { setP.add((r.winningPlayer||'').trim()); setP.add((r.losingPlayer||'').trim()); }
      const next = Array.from(setP).filter(Boolean).slice(0, 200);
      setRecentPlayers(next);
      try { localStorage.setItem('recentPlayers', JSON.stringify(next)); } catch {}
      setAggByClass(j.aggByClass || null);
      setAggUpdatedAt(j.aggLastUpdate || null);
      setLastQueryLive(false);
      setDataPhase('cached');
      if (!usdmLoading && usdmRows.length === 0) {
        void fetchUsdmTop();
      }
      const todayStart = new Date();
      const todayDayStart = Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), todayStart.getUTCDate()) / 1000;
      const endTs = toEndOfDayEpoch(endDate);
      const needsToday = endTs === undefined || endTs >= todayDayStart;
      if (needsToday) {
        void fetchLatest();
      }
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  const fetchLatest = async () => {
    setError(null); setWarning(null); setLoading(true);
    try {
      const baseStart = startDate === BALANCE_PATCH_DATE ? BALANCE_PATCH_TS : toStartOfDayEpoch(startDate);
      const now = new Date();
      const todayStartTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
      const startTs = Math.max(baseStart || 0, todayStartTs);
      const body = {
        startTs,
        endTs: toEndOfDayEpoch(endDate),
        wantAgg: true,
        live: true,
        cacheOnly: false,
      };
      const res = await fetch('/api/eth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const j: ApiResponse = await res.json();
      if (!j.ok) throw new Error(j.error || 'Unknown error');
      if (j.warning) setWarning(j.warning);
      const normalized = (j.rows || []).map(r => ({
        ...r,
        winningPlayer: stripPlayerSuffix(r.winningPlayer),
        losingPlayer: stripPlayerSuffix(r.losingPlayer),
      }));
      setRows(prev => mergeRowsClient(prev, normalized));
      setAggByClass(j.aggByClass || null);
      setAggUpdatedAt(j.aggLastUpdate || null);
      setLastQueryLive(true);
      setDataPhase('live');
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const fetchUsdmTop = async (force = false) => {
    if (usdmLoading) return;
    if (!force && usdmRows.length > 0 && usdmUpdatedAt) return;
    setUsdmLoading(true); setUsdmError(null);
    try {
      const res = await fetch(force ? '/api/usdm?fresh=1' : '/api/usdm');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Unknown error');
      setUsdmRows(j.rows || []);
      setUsdmVolumeSeries(j.volumeSeries || []);
      setUsdmTotalVolume(j.totalVolume || '0');
      setUsdmUpdatedAt(j.updatedAt || null);
    } catch (e:any) {
      setUsdmError(e?.message || String(e));
    } finally {
      setUsdmLoading(false);
    }
  };

  const shareSnapshot = async () => {
    if (shareLoading) return;
    setShareStatus(null);
    setShareLoading(true);
    try {
      const body = {
        params: {
          start: startDate || undefined,
          end: endDate || undefined,
          player: player || undefined,
          only: matrixOnlyPlayer ? '1' : undefined,
          compare: player2.trim() || undefined,
        },
        rows,
        aggByClass: aggByClass || undefined,
        aggLastUpdate: aggUpdatedAt || undefined,
      };
      const res = await fetch('/api/share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Failed to create snapshot');
      const url = new URL(window.location.href);
      url.searchParams.set('share', j.id);
      const shareUrl = url.toString();
      try { await navigator.clipboard.writeText(shareUrl); } catch {}
      setShareStatus('Share link copied.');
    } catch (e:any) {
      setShareStatus(e?.message || String(e));
    } finally {
      setShareLoading(false);
    }
  };

  const dl = (name: string, data: any) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const prettyMetadata = (meta?: string) => {
    if (!meta) return null;
    try {
      const parsed = JSON.parse(meta);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return meta;
    }
  };
  const txExplorer = (hash: string, network?: Row['network']) => {
    return `https://megaeth.blockscout.com/tx/${hash}?tab=logs`;
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
    <div className={`min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100`}>
      <Head><title>Showdown Meta Tracker</title></Head>
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="mb-4 rounded-xl bg-black text-white px-4 py-2 text-sm">
          This tool was brought to you by <span className="font-semibold">fisiroky</span>.{' '}
          <a className="underline" href="https://x.com/fisiroky" target="_blank" rel="noreferrer">Follow on X</a>
        </div>

          <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={SHOWDOWN_LOGO} alt="Showdown logo" className="h-10 w-10 rounded"/>
            <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-3xl font-semibold tracking-tight">Showdown Meta Tracker</motion.h1>
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
            {/* Share link button removed per request */}
              {/* Compact/comfort toggle removed */}
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
          <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm md:sticky md:top-4 z-20 backdrop-blur-sm bg-white/95 dark:bg-gray-800/95 border border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-100"><Server className="h-4 w-4"/> Filters</div>
            <label className="mt-3 block text-xs text-gray-500">Player Name</label>
            <div className="relative">
            <input
              className="mt-1 w-full rounded-xl border p-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
              value={player}
                onChange={e => { setPlayer(e.target.value); setShowPlayerDropdown(true); }}
                onFocus={() => { setPlayerInputFocused(true); setShowPlayerDropdown(true); }}
                onBlur={() => { setPlayerInputFocused(false); setTimeout(() => setShowPlayerDropdown(false), 150); }}
                placeholder="barry"
            />
              {showPlayerDropdown && playerInputFocused && recentPlayers.length > 0 && (
                <div className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto rounded-xl border bg-white dark:bg-gray-800 dark:border-gray-700 shadow-lg">
                  {recentPlayers
                    .filter(p => p.toLowerCase().includes(player.toLowerCase()))
                    .slice(0, 10)
                    .map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 first:rounded-t-xl last:rounded-b-xl"
                        onMouseDown={() => { setPlayer(p); setShowPlayerDropdown(false); }}
                      >
                        {p}
                      </button>
              ))}
                  {recentPlayers.filter(p => p.toLowerCase().includes(player.toLowerCase())).length === 0 && (
                    <div className="px-3 py-2 text-sm text-gray-500">No matching players</div>
                  )}
                </div>
              )}
            </div>

            <label className="mt-3 block text-xs text-gray-500">Compare vs (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border p-2 text-sm dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100"
              value={player2}
              onChange={e=>setPlayer2(e.target.value)}
              placeholder="opponent player"
              list="player-suggestions"
            />

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
              <button className="rounded-full border px-3 py-1 dark:border-gray-600" onClick={()=>applyPreset('sincePatch')}>Since last balance patch</button>
              <button className="rounded-full border px-3 py-1 dark:border-gray-600" onClick={()=>applyPreset('today')}>Today</button>
              <button className="rounded-full border px-3 py-1 dark:border-gray-600" onClick={()=>applyPreset('thisMonth')}>This month</button>
              <button className="rounded-full border px-3 py-1 dark:border-gray-600" onClick={()=>applyPreset('allTime')}>All time</button>
            </div>

            {/* Removed class and end reason filters per request */}

            <button onClick={() => run()} disabled={loading} className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-black px-4 py-2 text-white shadow disabled:opacity-60">
              {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Play className="h-4 w-4"/>}
              {loading ? "Fetching..." : "Compute Winrate"}
            </button>
            <button
              onClick={() => fetchLatest()}
              disabled={loading || rows.length === 0}
              className="mt-2 inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <ArrowUp className="h-4 w-4"/>}
              Fetch today (live)
            </button>
            {rows.length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                {dataPhase === 'cached' && `Showing cached data through ${cachedThroughLabel}. Fetching today now…`}
                {dataPhase === 'live' && `Updated with today’s matches. Cached through ${cachedThroughLabel}.`}
                {dataPhase === 'idle' && `Showing cached data through ${cachedThroughLabel}.`}
              </div>
            )}
            <button
              onClick={shareSnapshot}
              disabled={shareLoading || rows.length === 0}
              className="mt-2 inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm disabled:opacity-60"
              title="Copy a shareable snapshot link"
            >
              {shareLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}
              Share snapshot
            </button>
            {shareStatus && (
              <div className="mt-2 text-xs text-gray-500">{shareStatus}</div>
            )}
            {error && (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5"/>
                <div>
                  <div className="font-medium">Heads up</div>
                  <div>{error}</div>
                </div>
              </div>
            )}
            {warning && !error && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 mt-0.5"/>
                <div>
                  <div className="font-medium">Heads up</div>
                  <div>{warning}</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Stats - Compact horizontal layout */}
        <div className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Wins</div>
              {loading && stats.wins === 0 ? (
                <div className="mt-1 h-8 w-16 mx-auto bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
              ) : (
                <div className="mt-1 text-2xl font-bold text-green-600 dark:text-green-400">{stats.wins}</div>
              )}
          </div>
            <div className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Losses</div>
              {loading && stats.losses === 0 ? (
                <div className="mt-1 h-8 w-16 mx-auto bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
              ) : (
                <div className="mt-1 text-2xl font-bold text-red-600 dark:text-red-400">{stats.losses}</div>
              )}
          </div>
            <div className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Win Rate</div>
              {loading && stats.wins === 0 && stats.losses === 0 ? (
                <div className="mt-1 h-8 w-20 mx-auto bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
              ) : (
                <div className="mt-1 text-2xl font-bold">{(stats.winrate*100).toFixed(1)}%</div>
              )}
          </div>
            <div className="text-center p-3 rounded-xl bg-gray-50 dark:bg-gray-700/50">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Top Class</div>
              {loading && !stats.dominantClass ? (
                <div className="mt-1 h-6 w-24 mx-auto bg-gray-200 dark:bg-gray-600 rounded animate-pulse" />
              ) : (
                <>
                  <div className="mt-1 text-sm font-semibold truncate">{stats.dominantClass || '—'}</div>
                  {stats.dominantClass && <div className="text-[10px] text-gray-500">{Math.round((stats.dominantClassPct||0) * 100)}% of wins</div>}
                </>
              )}
            </div>
          </div>
        </div>
        {/* Top classes chips removed per request */}
        {player2.trim() && stats2 && (
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 text-center shadow-sm">
              <div className="text-xs uppercase tracking-wide text-gray-500">{player2} — Wins/Losses</div>
              <div className="mt-1 text-2xl font-semibold">{stats2.wins}/{stats2.losses}</div>
              <div className="text-xs text-gray-500">WR {(stats2.winrate*100).toFixed(1)}%</div>
            </div>
            {h2h && (
              <div className="rounded-2xl bg-white dark:bg-gray-800 p-4 text-center shadow-sm md:col-span-2">
                <div className="text-xs uppercase tracking-wide text-gray-500">Head‑to‑Head vs {player2}</div>
                <div className="mt-1 text-2xl font-semibold">{player} {h2h.p1Wins} – {h2h.p2Wins} {player2}</div>
                <div className="text-xs text-gray-500">{h2h.total} matches</div>
              </div>
            )}
          </div>
        )}

        {/* Tables navigation */}
        <div className="mt-6 rounded-2xl border border-gray-200/70 bg-white/60 p-3 shadow-sm backdrop-blur dark:border-gray-700/70 dark:bg-gray-800/60">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-gray-300">Jump to</div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <a href="#player-class-stats" className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60">Player class stats</a>
            <a href="#class-vs-class" className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60">Class vs Class</a>
            <a href="#player-matches" className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60">Player matches</a>
            <a href="#global-class-stats" className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60">Global class stats</a>
            <a href="#top-players" className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60">Top players</a>
            <a href="#top-by-class" className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60">Top by class</a>
            <a href="#all-decoded" className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60">All matches (decoded)</a>
            {showMoneyTables && (
              <a href="#top-usdm-profits" className="rounded-full border border-gray-300 px-3 py-1 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700/60">Top USDm profits</a>
            )}
          </div>
        </div>

        {/* Player-focused tables */}
        <details id="player-section" className="mt-6" open>
          <summary className="flex items-center gap-3 cursor-pointer list-none text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <span>Player-focused</span>
            <span className="h-px flex-1 bg-gray-200/70 dark:bg-gray-700/70" />
            <span className="text-[11px] normal-case text-gray-400 dark:text-gray-500">depends on selected player</span>
          </summary>
          <div className="mt-4">
        {/* Per-class performance (player specific) */}
        <div id="player-class-stats" className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
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
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                  <th className="p-2 w-52 cursor-pointer sticky left-0 bg-gray-50 dark:bg-gray-700" aria-sort={playerClassSort.key==='klass' ? (playerClassSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setPlayerClassSort(s=>({ key:'klass' as any, dir: s.key==='klass' && s.dir==='asc' ? 'desc' : 'asc' }))}>Class {playerClassSort.key==='klass' ? (playerClassSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={playerClassSort.key==='wins' ? (playerClassSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setPlayerClassSort(s=>({ key:'wins' as any, dir: s.key==='wins' && s.dir==='asc' ? 'desc' : 'asc' }))}>Wins {playerClassSort.key==='wins' ? (playerClassSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={playerClassSort.key==='losses' ? (playerClassSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setPlayerClassSort(s=>({ key:'losses' as any, dir: s.key==='losses' && s.dir==='asc' ? 'desc' : 'asc' }))}>Losses {playerClassSort.key==='losses' ? (playerClassSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={playerClassSort.key==='total' ? (playerClassSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setPlayerClassSort(s=>({ key:'total' as any, dir: s.key==='total' && s.dir==='asc' ? 'desc' : 'asc' }))}>Games {playerClassSort.key==='total' ? (playerClassSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-28 cursor-pointer" aria-sort={playerClassSort.key==='winrate' ? (playerClassSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setPlayerClassSort(s=>({ key:'winrate' as any, dir: s.key==='winrate' && s.dir==='asc' ? 'desc' : 'asc' }))}>Win Rate {playerClassSort.key==='winrate' ? (playerClassSort.dir==='asc'?'↑':'↓') : ''}</th>
                </tr>
              </thead>
              <tbody>
                {classStats.map((r, i) => (
                  <tr key={r.klass + i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="p-2 sticky left-0 bg-white dark:bg-gray-800">{r.klass}</td>
                    <td className="p-2 tabular-nums">{r.wins}</td>
                    <td className="p-2 tabular-nums">{r.losses}</td>
                    <td className="p-2 tabular-nums">{r.total}</td>
                    <td className="p-2 tabular-nums flex items-center gap-2">{(r.winrate*100).toFixed(1)}% <span className="text-gray-400"><Spark data={playerTrends.get(r.klass) || []} /></span></td>
                  </tr>
                ))}
                {loading && classStats.length === 0 && (
                  <SkeletonTableRows rows={6} cols={5} />
                )}
                {classStats.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-gray-500" colSpan={5}>No class stats yet — run a query above.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Class-vs-Class matchups with base class selector */}
        <div id="class-vs-class" className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-100">Class vs Class — Win rates</div>
            <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
              <input type="checkbox" className="h-4 w-4 rounded" checked={matrixOnlyPlayer} onChange={e=>setMatrixOnlyPlayer(e.target.checked)} />
              Only matches incl. <span className="font-semibold">{player || 'player'}</span>
            </label>
          </div>
          <div className="mt-1 text-[11px] text-gray-500">Shows all matches by default; toggle to limit to matches including the selected player.</div>
          
          {/* Base class selector - pick exactly 2 */}
          <div className="mt-4">
            <div className="text-xs text-gray-500 mb-2">Select 2 classes to form a dual-class</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {BASE_CLASSES.map(cls => {
                const isSelected = selectedBaseClasses.includes(cls);
                return (
                  <button
                    key={cls}
                    onClick={() => toggleBaseClass(cls)}
                    className={`px-2 py-2 sm:px-4 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-800'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-105'
                    }`}
                  >
                    {cls}
                  </button>
                );
              })}
            </div>
            {selectedBaseClasses.length === 1 && (
              <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                Select one more class to see matchups
              </div>
            )}
          </div>

          {/* Show selected dual-class and its matchups */}
          {selectedDualClass && classVsClass.matchups[selectedDualClass] && (
            <div className="mt-5">
              <div className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
                <div className="text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Showing win rates for </span>
                  <span className="font-bold text-blue-700 dark:text-blue-300">{selectedDualClass}</span>
                  <span className="text-gray-600 dark:text-gray-400"> vs opponents</span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs md:text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                      <th 
                        className="p-2 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                        onClick={() => setClassVsClassSort(s => ({ key: 'opponent', dir: s.key === 'opponent' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                      >
                        Opponent {classVsClassSort.key === 'opponent' ? (classVsClassSort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th 
                        className="p-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                        onClick={() => setClassVsClassSort(s => ({ key: 'winRate', dir: s.key === 'winRate' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      >
                        <span className="font-bold text-blue-600 dark:text-blue-400">{selectedDualClass}</span> WR {classVsClassSort.key === 'winRate' ? (classVsClassSort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th 
                        className="p-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                        onClick={() => setClassVsClassSort(s => ({ key: 'wins', dir: s.key === 'wins' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      >
                        Wins {classVsClassSort.key === 'wins' ? (classVsClassSort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th 
                        className="p-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                        onClick={() => setClassVsClassSort(s => ({ key: 'losses', dir: s.key === 'losses' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      >
                        Losses {classVsClassSort.key === 'losses' ? (classVsClassSort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th 
                        className="p-2 text-center cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                        onClick={() => setClassVsClassSort(s => ({ key: 'total', dir: s.key === 'total' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      >
                        Games {classVsClassSort.key === 'total' ? (classVsClassSort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {classVsClass.matchups[selectedDualClass].length === 0 ? (
                      <tr>
                        <td className="p-4 text-center text-gray-500" colSpan={5}>No matchup data for {selectedDualClass}.</td>
                      </tr>
                    ) : (
                      [...classVsClass.matchups[selectedDualClass]]
                        .sort((a, b) => {
                          const dir = classVsClassSort.dir === 'asc' ? 1 : -1;
                          if (classVsClassSort.key === 'opponent') return dir * a.opponent.localeCompare(b.opponent);
                          if (classVsClassSort.key === 'winRate') return dir * (a.winRate - b.winRate);
                          if (classVsClassSort.key === 'wins') return dir * (a.wins - b.wins);
                          if (classVsClassSort.key === 'losses') return dir * (a.losses - b.losses);
                          return dir * (a.total - b.total);
                        })
                        .map(m => {
                          const hue = Math.round(m.winRate * 120);
                          return (
                            <tr key={m.opponent} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                              <td className="p-2 font-medium">{m.opponent}</td>
                              <td className="p-2 text-center">
                                <span
                                  className="inline-block rounded-full px-2 py-0.5 text-xs text-white font-medium"
                                  style={{ backgroundColor: `hsl(${hue}, 60%, 45%)` }}
                                >
                                  {(m.winRate * 100).toFixed(0)}%
                                </span>
                              </td>
                              <td className="p-2 text-center tabular-nums text-green-600 dark:text-green-400">{m.wins}</td>
                              <td className="p-2 text-center tabular-nums text-red-600 dark:text-red-400">{m.losses}</td>
                              <td className="p-2 text-center tabular-nums">{m.total}</td>
                            </tr>
                          );
                        })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {selectedDualClass && !classVsClass.matchups[selectedDualClass] && classVsClass.classes.length > 0 && (
            <div className="mt-4 p-4 text-center text-gray-500 text-sm border border-dashed rounded-xl dark:border-gray-700">
              No data found for <span className="font-semibold">{selectedDualClass}</span> in the current dataset
            </div>
          )}
          {!selectedDualClass && classVsClass.classes.length > 0 && (
            <div className="mt-4 p-4 text-center text-gray-500 text-sm border border-dashed rounded-xl dark:border-gray-700">
              Select 2 classes above to see matchup win rates
            </div>
          )}
          {classVsClass.classes.length === 0 && (
            <div className="mt-4 p-4 text-center text-gray-500 text-sm">
              {loading ? 'Loading...' : 'No dual-class data yet — run a query above.'}
            </div>
          )}
          </div>

        {/* Player-specific matches */}
        <div id="player-matches" className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
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
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                  <th className="p-2 w-24 cursor-pointer" aria-sort={filteredSort.key==='gameNumber' ? (filteredSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setFilteredSort(s=>({ key:'gameNumber' as any, dir: s.key==='gameNumber' && s.dir==='asc' ? 'desc' : 'asc' }))}>Game # {filteredSort.key==='gameNumber' ? (filteredSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-20 cursor-pointer" aria-sort={filteredSort.key==='result' ? (filteredSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setFilteredSort(s=>({ key:'result' as any, dir: s.key==='result' && s.dir==='asc' ? 'desc' : 'asc' }))}>Result {filteredSort.key==='result' ? (filteredSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-40 cursor-pointer" onClick={()=>setFilteredSort(s=>({ key:'opponent' as any, dir: (s.key as any)=='opponent' && s.dir==='asc' ? 'desc' : 'asc' }))}>Opponent</th>
                  <th className="p-2 w-44">Player class</th>
                  <th className="p-2 w-44">Opponent class</th>
                  <th className="p-2 w-24">Duration</th>
                  <th className="p-2 w-40 whitespace-nowrap cursor-pointer" aria-sort={filteredSort.key==='startedAt' ? (filteredSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setFilteredSort(s=>({ key:'startedAt' as any, dir: s.key==='startedAt' && s.dir==='asc' ? 'desc' : 'asc' }))}>Started {filteredSort.key==='startedAt' ? (filteredSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-16">Tx</th>
                </tr>
              </thead>
              <tbody>
                {paginatedFiltered.map((r, i) => {
                  const metadataPretty = prettyMetadata(r.metadata);
                  return (
                    <Fragment key={r.txHash + i}>
                      <tr className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer" onClick={()=>toggleExpandedFiltered(r.txHash)}>
                        <td className="p-2 tabular-nums">{r.gameNumber}</td>
                        <td className="p-2 font-medium">{r.result}</td>
                        <td className="p-2">{r.opponent}</td>
                        <td className="p-2">{(r as any).playerClasses}</td>
                        <td className="p-2">{(r as any).opponentClasses}</td>
                        <td className="p-2">{r.gameLength || '—'}</td>
                        <td className="p-2">{r.startedAt}</td>
                        <td className="p-2 flex items-center gap-2">
                          <a className="text-blue-600 underline" href={txExplorer(r.txHash, r.network)} target="_blank" rel="noreferrer">tx</a>
                          <button className="rounded border px-1 py-0.5 text-[10px]" title="Copy tx hash" onClick={()=>copyTx(r.txHash)}>
                            {copiedTx === r.txHash ? <Check className="h-3 w-3"/> : <Clipboard className="h-3 w-3"/>}
                          </button>
                        </td>
                      </tr>
                      {expandedFiltered.has(r.txHash) && (
                        <tr className="border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40">
                          <td colSpan={8} className="p-3 text-xs">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              <div><span className="text-gray-500">Player class:</span> {(r as any).playerClasses}</div>
                              <div><span className="text-gray-500">Opponent class:</span> {(r as any).opponentClasses}</div>
                              <div><span className="text-gray-500">Length:</span> {r.gameLength || '—'}</div>
                              <div><span className="text-gray-500">Game type:</span> {r.gameType || '—'}</div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-gray-500" colSpan={8}>
                      {loading ? <SkeletonTableRows rows={8} cols={7} /> : `No matches for this player in range ${rangeLabel} yet.`}
                    </td>
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
                <option value={5}>5</option>
                <option value={15}>15</option>
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

        {showMoneyTables && (
          <>
            {/* Top USDm profits */}
            <div id="top-usdm-profits" className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
              <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-100">Top 10 USDm profits (all-time)</div>
                <a
                  className="text-xs text-blue-600 underline"
                  href="https://megaeth.blockscout.com/address/0x7B8DF4195eda5b193304eeCB5107DE18b6557D24?tab=txs"
                  target="_blank"
                  rel="noreferrer"
                >
                  payout contract
                </a>
              </div>
              <div className="mt-1 text-[10px] text-gray-500">
                Net = wins - losses (USDm transfers for game settlement). {usdmUpdatedAt ? `Updated ${new Date(usdmUpdatedAt).toLocaleString()}` : ''}
              </div>
          <div className="mt-2">
            <button
              onClick={() => fetchUsdmTop(true)}
              disabled={usdmLoading}
              className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs"
            >
              {usdmLoading ? <Loader2 className="h-3 w-3 animate-spin"/> : <ArrowUp className="h-3 w-3"/>}
              Refresh USDm
            </button>
          </div>
              {usdmError && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">
                  {usdmError}
                </div>
              )}
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs md:text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                      <th className="p-2 w-10">#</th>
                      <th className="p-2">Player</th>
                      <th className="p-2">Won</th>
                      <th className="p-2">Lost</th>
                      <th className="p-2">Net</th>
                      <th className="p-2">#games</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usdmRows.map((r, i) => (
                      <tr key={r.player + i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="p-2 tabular-nums">{i + 1}</td>
                        <td className="p-2 font-mono">
                          <a className="text-blue-600 underline" href={`https://megaeth.blockscout.com/address/${r.player}`} target="_blank" rel="noreferrer" title={r.player}>
                            {shortAddr(r.player)}
                          </a>
                        </td>
                        <td className="p-2 tabular-nums">{formatUsdm(r.won)}</td>
                        <td className="p-2 tabular-nums">{formatUsdm(r.lost)}</td>
                        <td className="p-2 tabular-nums font-semibold">{formatUsdm(r.net)}</td>
                        <td className="p-2 tabular-nums">{r.txs}</td>
                      </tr>
                    ))}
                    {usdmLoading && usdmRows.length === 0 && (
                      <SkeletonTableRows rows={5} cols={6} />
                    )}
                    {!usdmLoading && usdmRows.length === 0 && !usdmError && (
                      <tr>
                        <td className="p-6 text-center text-gray-500" colSpan={6}>No USDm game settlement transfers yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* USDm volume */}
            <div className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-100">USDM volume over time</div>
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-gray-500">Total volume</div>
                  <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">{formatUsdm(usdmTotalVolume)}</div>
                </div>
              </div>
              <div className="mt-1 text-[10px] text-gray-500">Daily USDm transferred via the payout contract (game settlement only).</div>
              <div className="mt-3">
                {usdmVolumeSeries.length === 0 && usdmLoading && (
                  <div className="h-28 rounded-xl bg-gray-100 dark:bg-gray-700/40 animate-pulse" />
                )}
                {usdmVolumeSeries.length === 0 && !usdmLoading && (
                  <div className="h-28 rounded-xl bg-gray-50 dark:bg-gray-700/40 flex items-center justify-center text-xs text-gray-500">No volume data yet.</div>
                )}
                {usdmVolumeSeries.length > 0 && (() => {
                  const w = 600;
                  const h = 120;
                  const pad = 8;
                  const vols = usdmVolumeSeries.map(p => BigInt(p.volume || '0'));
                  const max = vols.reduce((a, b) => (a > b ? a : b), 0n) || 1n;
                  const startLabel = fmtDisplayDate(usdmVolumeSeries[0]?.day);
                  const endLabel = fmtDisplayDate(usdmVolumeSeries[usdmVolumeSeries.length - 1]?.day);
                  const points = usdmVolumeSeries.map((p, i) => {
                    const x = usdmVolumeSeries.length === 1 ? w / 2 : pad + (i / (usdmVolumeSeries.length - 1)) * (w - pad * 2);
                    const ratio = ratioToFloat(BigInt(p.volume || '0'), max);
                    const y = pad + (1 - ratio) * (h - pad * 2);
                    return `${x.toFixed(2)},${y.toFixed(2)}`;
                  }).join(' ');
                  return (
                    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28">
                      <line x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} stroke="#94a3b8" strokeWidth="1" />
                      <line x1={pad} y1={h - pad} x2={pad} y2={h - pad + 4} stroke="#94a3b8" strokeWidth="1" />
                      <line x1={w - pad} y1={h - pad} x2={w - pad} y2={h - pad + 4} stroke="#94a3b8" strokeWidth="1" />
                      <text x={pad} y={h} fontSize="9" fill="#94a3b8" textAnchor="start">{startLabel}</text>
                      <text x={w - pad} y={h} fontSize="9" fill="#94a3b8" textAnchor="end">{endLabel}</text>
                      <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="2" />
                    </svg>
                  );
                })()}
              </div>
            </div>
          </>
        )}

          </div>
        </details>

        {/* Global tables */}
        <details id="global-section" className="mt-10" open>
          <summary className="flex items-center gap-3 cursor-pointer list-none text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
            <span>Meta / Global</span>
            <span className="h-px flex-1 bg-gray-200/70 dark:bg-gray-700/70" />
            <span className="text-[11px] normal-case text-gray-400 dark:text-gray-500">all matches in range ({rangeLabel})</span>
          </summary>
          <div className="mt-4">

        {/* All matches per-class performance (global) */}
        <div id="global-class-stats" className="rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-100">Per‑Class Performance — All Matches ({rangeLabel})</div>
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
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                  <th className="p-2 w-52 cursor-pointer sticky left-0 bg-gray-50 dark:bg-gray-700" aria-sort={overallSort.key==='klass' ? (overallSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setOverallSort(s=>({ key:'klass' as any, dir: s.key==='klass' && s.dir==='asc' ? 'desc' : 'asc' }))}>Class {overallSort.key==='klass' ? (overallSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={overallSort.key==='wins' ? (overallSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setOverallSort(s=>({ key:'wins' as any, dir: s.key==='wins' && s.dir==='asc' ? 'desc' : 'asc' }))}>Wins {overallSort.key==='wins' ? (overallSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={overallSort.key==='losses' ? (overallSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setOverallSort(s=>({ key:'losses' as any, dir: s.key==='losses' && s.dir==='asc' ? 'desc' : 'asc' }))}>Losses {overallSort.key==='losses' ? (overallSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={overallSort.key==='total' ? (overallSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setOverallSort(s=>({ key:'total' as any, dir: s.key==='total' && s.dir==='asc' ? 'desc' : 'asc' }))}>Games {overallSort.key==='total' ? (overallSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-28 cursor-pointer" aria-sort={overallSort.key==='winrate' ? (overallSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setOverallSort(s=>({ key:'winrate' as any, dir: s.key==='winrate' && s.dir==='asc' ? 'desc' : 'asc' }))}>Win Rate {overallSort.key==='winrate' ? (overallSort.dir==='asc'?'↑':'↓') : ''}</th>
                </tr>
              </thead>
              <tbody>
                {overallClassStats.map((r, i) => (
                  <tr key={r.klass + i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="p-2 sticky left-0 bg-white dark:bg-gray-800">{r.klass}</td>
                    <td className="p-2 tabular-nums">{r.wins}</td>
                    <td className="p-2 tabular-nums">{r.losses}</td>
                    <td className="p-2 tabular-nums">{r.total}</td>
                    <td className="p-2 tabular-nums flex items-center gap-2">{(r.winrate*100).toFixed(1)}% <span className="text-gray-400"><Spark data={overallTrends.get(r.klass) || []} /></span></td>
                  </tr>
                ))}
                {loading && overallClassStats.length === 0 && (
                  <SkeletonTableRows rows={6} cols={5} />
                )}
                {overallClassStats.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-gray-500" colSpan={5}>No data yet — run a query above.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Players by Win Rate (min 15 games) */}
        <div id="top-players" className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-100">Top Players by Win Rate <span className="text-gray-500">(min 30 games)</span></div>
            {topPlayers.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => dl("showdown_top_players.json", topPlayers)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                  <Download className="h-4 w-4"/> JSON
                </button>
                <button onClick={() => dlCsv("showdown_top_players.csv", topPlayers)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                  <Download className="h-4 w-4"/> CSV
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead>
                <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                  <th className="p-2 w-10">#</th>
                  <th className="p-2">Player</th>
                  <th className="p-2">Wins</th>
                  <th className="p-2">Losses</th>
                  <th className="p-2">Games</th>
                  <th className="p-2">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {topPlayers.map((p, i) => (
                  <tr key={p.player + i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="p-2 tabular-nums">{i+1}</td>
                    <td className="p-2">{p.player}</td>
                    <td className="p-2 tabular-nums">{p.wins}</td>
                    <td className="p-2 tabular-nums">{p.losses}</td>
                    <td className="p-2 tabular-nums">{p.total}</td>
                    <td className="p-2 tabular-nums">{(p.winrate*100).toFixed(1)}%</td>
                  </tr>
                ))}
                {loading && topPlayers.length === 0 && (
                  <SkeletonTableRows rows={5} cols={6} />
                )}
                {!loading && topPlayers.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-gray-500" colSpan={6}>No players meet the 30‑game threshold yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Top Player by Class */}
        <div id="top-by-class" className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-100">Top Player by Class <span className="text-gray-500">(dual-classes, min 20 games)</span></div>
            {topPlayersByClass.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => dl("showdown_top_by_class.json", topPlayersByClass)} className="inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-sm">
                  <Download className="h-4 w-4"/> JSON
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead>
                <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                  <th className="p-2">Class</th>
                  <th className="p-2">Best Player</th>
                  <th className="p-2 text-center">W/L</th>
                  <th className="p-2 text-center">Games</th>
                  <th className="p-2 text-center">Win Rate</th>
                </tr>
              </thead>
              <tbody>
                {topPlayersByClass.map((row) => {
                  const hue = Math.round(row.winrate * 120);
                  return (
                    <tr key={row.klass} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="p-2 font-medium">{row.klass}</td>
                      <td className="p-2">{row.player}</td>
                      <td className="p-2 text-center tabular-nums">
                        <span className="text-green-600 dark:text-green-400">{row.wins}</span>
                        <span className="text-gray-400 mx-1">/</span>
                        <span className="text-red-600 dark:text-red-400">{row.losses}</span>
                      </td>
                      <td className="p-2 text-center tabular-nums">{row.total}</td>
                      <td className="p-2 text-center">
                        <span
                          className="inline-block rounded-full px-2 py-0.5 text-xs text-white font-medium"
                          style={{ backgroundColor: `hsl(${hue}, 60%, 45%)` }}
                        >
                          {(row.winrate * 100).toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {loading && topPlayersByClass.length === 0 && (
                  <SkeletonTableRows rows={5} cols={5} />
                )}
                {!loading && topPlayersByClass.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-gray-500" colSpan={5}>No class data available yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* All decoded list (newest first) */}
        <div id="all-decoded" className="mt-6 rounded-2xl bg-white dark:bg-gray-800 p-4 shadow-sm">
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
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b bg-gray-50 dark:bg-gray-700 dark:border-gray-700">
                  <th className="p-2 w-24 cursor-pointer" aria-sort={decodedSort.key==='gameNumber' ? (decodedSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setDecodedSort(s=>({ key:'gameNumber' as any, dir: s.key==='gameNumber' && s.dir==='asc' ? 'desc' : 'asc' }))}>Game # {decodedSort.key==='gameNumber' ? (decodedSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-40">Game ID</th>
                  <th className="p-2 w-40 whitespace-nowrap cursor-pointer" aria-sort={decodedSort.key==='startedAt' ? (decodedSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setDecodedSort(s=>({ key:'startedAt' as any, dir: s.key==='startedAt' && s.dir==='asc' ? 'desc' : 'asc' }))}>Started {decodedSort.key==='startedAt' ? (decodedSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-40 cursor-pointer" onClick={()=>setDecodedSort(s=>({ key:'winningPlayer' as any, dir: s.key==='winningPlayer' && s.dir==='asc' ? 'desc' : 'asc' }))}>Winner</th>
                  <th className="p-2 w-40 cursor-pointer" onClick={()=>setDecodedSort(s=>({ key:'losingPlayer' as any, dir: s.key==='losingPlayer' && s.dir==='asc' ? 'desc' : 'asc' }))}>Loser</th>
                  <th className="p-2 w-36">Reason</th>
                  <th className="p-2 w-16">Tx</th>
                </tr>
              </thead>
              <tbody>
                {paginatedAll.map((r, i) => {
                  const metadataPretty = prettyMetadata(r.metadata);
                  return (
                    <Fragment key={r.txHash + i}>
                      <tr className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer" onClick={()=>toggleExpandedAll(r.txHash)}>
                        <td className="p-2 tabular-nums">{r.gameNumber}</td>
                        <td className="p-2">{r.gameId}</td>
                        <td className="p-2">{r.startedAt}</td>
                        <td className="p-2 font-medium">{r.winningPlayer}</td>
                        <td className="p-2">{r.losingPlayer}</td>
                        <td className="p-2">{r.endReason}</td>
                        <td className="p-2 flex items-center gap-2">
                          <a className="text-blue-600 underline" href={txExplorer(r.txHash, r.network)} target="_blank" rel="noreferrer">tx</a>
                          <button className="rounded border px-1 py-0.5 text-[10px]" title="Copy tx hash" onClick={()=>copyTx(r.txHash)}>
                            {copiedTx === r.txHash ? <Check className="h-3 w-3"/> : <Clipboard className="h-3 w-3"/>}
                          </button>
                        </td>
                      </tr>
                      {expandedAll.has(r.txHash) && (
                        <tr className="border-b dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40">
                          <td colSpan={7} className="p-3 text-xs">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                              <div><span className="text-gray-500">Winning classes:</span> {r.winningClasses}</div>
                              <div><span className="text-gray-500">Losing classes:</span> {r.losingClasses}</div>
                              <div><span className="text-gray-500">Length:</span> {r.gameLength}</div>
                              <div><span className="text-gray-500">Game type:</span> {r.gameType || '—'}</div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td className="p-6 text-center text-gray-500" colSpan={7}>{loading ? <SkeletonTableRows rows={10} cols={7} /> : `No rows for range ${rangeLabel}. Pick a different date range and click Compute.`}</td>
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
                <option value={5}>5</option>
                <option value={15}>15</option>
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

          </div>
        </details>

        <div className="mt-4 text-xs text-gray-500">
          Daily cache on the server makes historical queries instant; today is fetched incrementally.
        </div>
      </div>
      {/* copy toast */}
      {copiedTx && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 rounded-full bg-black text-white px-3 py-1 text-xs shadow dark:bg-white dark:text-black">
          Copied tx: {copiedTx.slice(0,10)}…
        </div>
      )}
      {/* link copied toast removed */}
      <BackToTop visible={showTop} />
    </div>
  );
}

function TopClasses({ rows, player }: { rows: Row[]; player: string }) {
  // Global class winrates
  const globalMap: Record<string, { wins:number; total:number }> = {};
  for (const r of rows) {
    const w = (r.winningClasses||'').trim(); const l=(r.losingClasses||'').trim();
    if (w) { if (!globalMap[w]) globalMap[w] = { wins:0, total:0 }; globalMap[w].wins += 1; globalMap[w].total += 1; }
    if (l) { if (!globalMap[l]) globalMap[l] = { wins:0, total:0 }; globalMap[l].total += 1; }
  }
  const global = Object.entries(globalMap)
    .map(([klass, s]) => ({ klass, wins: s.wins, total: s.total, wr: s.total ? s.wins/s.total : 0 }))
    .sort((a,b)=> b.total - a.total)
    .slice(0,8);

  // Player's own classes when they played
  const p = player.trim().toLowerCase();
  const ownMap: Record<string, { wins:number; total:number }> = {};
  for (const r of rows) {
    const wp = r.winningPlayer?.trim?.().toLowerCase();
    const lp = r.losingPlayer?.trim?.().toLowerCase();
    if (wp === p) {
      const cls = (r.winningClasses||'').trim(); if (!cls) continue;
      if (!ownMap[cls]) ownMap[cls] = { wins:0, total:0 }; ownMap[cls].wins += 1; ownMap[cls].total += 1;
    } else if (lp === p) {
      const cls = (r.losingClasses||'').trim(); if (!cls) continue;
      if (!ownMap[cls]) ownMap[cls] = { wins:0, total:0 }; ownMap[cls].total += 1;
    }
  }
  const mine = Object.entries(ownMap)
    .map(([klass, s]) => ({ klass, wins: s.wins, total: s.total, wr: s.total ? s.wins/s.total : 0 }))
    .sort((a,b)=> b.total - a.total)
    .slice(0,8);

  const Chip = ({ name, wr, total }: { name:string; wr:number; total:number }) => {
    const hue = Math.round(wr * 120);
    const style = { backgroundColor: `hsl(${hue}, 70%, 45%)`, color: 'white' } as React.CSSProperties;
    return (
      <span className="rounded-full px-2 py-1 text-xs" style={style} title={`WR ${(wr*100).toFixed(1)}% · ${total} games`}>
        {name} {(wr*100).toFixed(0)}% ({total})
      </span>
    );
  };

  if (global.length === 0) return null;
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Top classes (Global):</span>
        {global.map(c => <Chip key={'g-'+c.klass} name={c.klass} wr={c.wr} total={c.total} />)}
      </div>
      {mine.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-gray-500">Top classes (By player):</span>
          {mine.map(c => <Chip key={'p-'+c.klass} name={c.klass} wr={c.wr} total={c.total} />)}
        </div>
      )}
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

// Skeleton table rows for loading states
function SkeletonTableRows({ rows, cols }: { rows: number; cols: number }) {
  const r = Array.from({ length: rows });
  const c = Array.from({ length: cols });
  return (
    <>
      {r.map((_, i) => (
        <tr key={i} className="animate-pulse">
          {c.map((__, j) => (
            <td key={j} className="p-2">
              <div className="h-3 rounded bg-gray-200 dark:bg-gray-700"/>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
