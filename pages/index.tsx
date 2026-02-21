
import Head from 'next/head';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import { Calendar, Download, Loader2, Play, Server, ShieldAlert, Clipboard, Check, ArrowUp } from 'lucide-react';

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
type UsdmProfitRow = { player: string; won: string; lost: string; net: string; txs: number };

// Wallet → in-game nickname mapping (from https://wallet.showdown.game/activity)
const WALLET_TO_NICK: Record<string, string> = {
  '0x40c1eaa23ddd6973330889b30bce05fa21e9b87d': 'been1575',
  '0x2ddf9f00cd543f54421cef64eb29c408b49d679f': 'Alex',
  '0xf645058ed581662df6b8d07239ecf8a5433d19ec': 'Nav',
  '0xef71cf2f7e246783e8c660ab70e59629e952b5be': 'Asso',
  '0x4221b5252200b45db09bf635599f0498ec702d09': 'homeprotector',
  '0x13cf9980a0238d6f32c3e70172695eca57216fec': 'Flash',
  '0x7b149bd829021c7da62bd8c6af1e041367938acf': 'megaflop',
  '0xc0a89392f019e81b35ce3bfa82d2309e621ccb7a': 'krysaaa',
  '0x1befab8bf83742fa13162d65c528a029b9786076': 'barry',
  '0x34079266660196371cfd4cbd3afcbe937909e2c2': 'ASR',
  '0xb8680980b03776fb12948442325171ae4fea4b11': 'Hoangthao',
  '0xa61933b3074db32c4acca235e9f6991a8dce685b': 'fajridrop',
  '0x3dc0ebb9bace78124e2168f3339d04b18af1cd88': 'McDuck',
  '0x04e49b062680bc585ccaa8e81c28000ea8664eb3': 'GPpoker',
  '0x1be706aacfdc2244611b54ffed0502dc45a45bd1': 'SE1',
  '0x8b0219552a3bd3a843c083b9d6ca1e99dafd44d7': 'Kaito',
  '0x229a171a3c486762e080b22d1b687ceb9fc74fa3': 'metaalex',
  '0x8689ad878545177403f5be5e6e31cfef94025a81': 'Lilin',
  '0x48efd1928d62c38bdcdd2b6d71ac60c4f333e1f': 'm777',
  '0x910d0efd8e2d831af89fb9ec60d22b60e6f34508': 'saintlee',
  '0x90edb8322ebf7695dfdc22324c844af273828af3': 'CrypLykos',
  '0x6e9aabcbfa8a45e715729b4df3643e8bec3a1f4c': 'nguyenhai',
  '0x9b9595555b77c5add018b2e52f5ed7e9e34a28fa': 'Lecrawl',
  '0xda3f1157b1c66ed91fa835eade9a9026a8495c35': 'mrL',
  '0xd3f804e7a8e5d9a3a84ab9f6b18c7e33bbc6baab': 'eduzzo',
  '0xdf9cb973634af0b5cb8c953c77213cb2f8489951': 'bangsand',
  '0x2550fdf63d761d3e912282d041a527aef493aff7': 'Corleone',
  '0x09a920a30c406db57b6d1a56f24eb0af43468f71': 'Ariefw219',
  '0x3c39ce87ed582a91db288aa0556d5b954da4acdc': 'ninja3',
  '0x958e31a0a9410b9f6204fe0a6a52de644f5f3f8b': 'LYLN',
  '0x5e14da20d61969d445a07ad3a576a7c1c2710952': 'ComfyJoe',
  '0x12ad0d86952bfa551a5166aee20ce0d47c12d3e6': 'NorrisNguyenNP',
  '0xade6976f6d4930cb1868d48d1cdf99c6db3dea38': 'KINGTA',
  '0x7fdf6ced2953d53a30ca2774f918cdff293f04ed': 'Ajeto',
  '0xe000441b32d0aba1bd2fb5b7fd1e7f82cb612052': 'MegaManRivs',
  '0x8bea9b54e8e145b0b1f69b47b54d5a577b00ea4a': 'jam',
  '0x647f44d213a1c76f51621943d0b1ee28877ce4fc': 'Kangliu',
  '0x0c3e1eee5723ff6d670f9f2cc2e9541fd30c5ef2': 'Scorpion',
  '0x790c4a63f30f098efdd16c64b54939877eca43d1': 'miguelusin',
  '0x7e77b7b7f379fa67bb82505080a952eda83806b3': 'Yan',
  '0xb10ee603248bdd1d5f004d48e87f52a96bd1e149': 'police911',
  '0x11b72e0c989be9130cefb10832fefb4f49cdcdd8': 'chiboozor',
  '0xf05dabb6fcdb8f51dd39aa42ea811285efee57cf': 'mouse',
  '0x49015274d2c9e71938d3e471072c2b749f786a91': 'Snep',
  '0x4db3c5a9b9742295950d13e25c8cdaf9bb203e1c': 'RQLTR',
  '0x64a6ce1145e23c9caf9b5da2be3a13c9d8945b8f': 'DarthDuck',
  '0x853db182b8783fa8250d96e0d38f95e457e5f3d6': 'StanCifka',
  '0x5e535ac83516c729624874be88c275b86a0878c4': 'gdgr',
  '0x4e8c39b5aad3ddb277ac56b9463fe279c596b40d': 'tango',
};
type UsdmVolumePoint = { day: string; volume: string };
type ApiResponse = { ok: boolean; error?: string; warning?: string; rows?: Row[]; aggByClass?: Record<string, { wins: number; losses: number; total: number }>; aggLastUpdate?: number };

const MIN_DATE = '2025-07-25';
const BALANCE_PATCH_DATE = '2026-01-13';
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Format date as "2026-Jan-13" for display, parse "2026-Jan-13" or "2026-01-13" to ISO
function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return '';
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate; // Return as-is if not ISO format
  const [, year, month, day] = match;
  return `${year}-${MONTH_NAMES[parseInt(month, 10) - 1]}-${day}`;
}
function parseDateInput(input: string): string {
  if (!input) return '';
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
  // Try parsing "2026-Jan-13" format
  const match = input.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})$/);
  if (match) {
    const [, year, monthName, day] = match;
    const monthIdx = MONTH_NAMES.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
    if (monthIdx >= 0) return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${day}`;
  }
  return input; // Return as-is
}
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
function formatUsdm(weiStr?: string, showSign = false) {
  if (!weiStr) return '$0';
  const bi = BigInt(weiStr);
  const sign = bi < 0n ? '-' : (showSign && bi > 0n ? '+' : '');
  const abs = bi < 0n ? -bi : bi;
  const base = 1000000000000000000n;
  // Floor instead of round - total wagered should always be even (2 players × whole dollars)
  const floored = abs / base;
  const num = Number(floored);
  const formatted = num.toLocaleString('en-US');
  return `${sign}$${formatted}`;
}
function usdmNetClass(weiStr?: string) {
  if (!weiStr) return '';
  const bi = BigInt(weiStr);
  const base = 1000000000000000000n;
  const rounded = Number((bi < 0n ? -bi : bi) / base);
  if (bi > 0n) {
    if (rounded >= 10000) return 'text-green-400 text-2xl font-black';
    if (rounded >= 1000) return 'text-green-400 text-xl font-bold';
    if (rounded >= 100) return 'text-green-400 text-lg font-bold';
    return 'text-green-400 font-semibold';
  } else if (bi < 0n) {
    return 'text-gray-500 font-normal';
  }
  return '';
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

// Tournament winnings data (manual until smart contract is deployed)
const TOURNAMENT_WINNERS = [
  { address: '0x9B9595555B77c5aDd018B2E52F5eD7e9e34a28FA', prize: 2400, display: '1 ETH (~$2,400)', rank: 1 },
  { address: '0xEf71Cf2F7E246783E8c660ab70E59629E952b5be', prize: 300, display: '$300', rank: 2 },
  { address: '0x40c1EAA23DDD6973330889B30bcE05Fa21E9B87D', prize: 200, display: '$200', rank: 3 },
  { address: '0x64A6cE1145E23c9CaF9b5dA2BE3a13C9d8945B8f', prize: 100, display: '$100', rank: 4 },
  { address: '0x11B72e0C989bE9130cEFb10832fEFB4F49CdcDd8', prize: 50, display: '$50', rank: 5 },
  { address: '0x910D0EFd8E2D831af89FB9eC60D22B60E6f34508', prize: 50, display: '$50', rank: 6 },
  { address: '0x2DdF9F00CD543F54421CEf64eB29C408b49D679F', prize: 50, display: '$50', rank: 7 },
  { address: '0x3Dc0ebb9bACe78124e2168F3339d04B18AF1cd88', prize: 50, display: '$50', rank: 8 },
];
const TOURNAMENT_TOTAL = TOURNAMENT_WINNERS.reduce((sum, w) => sum + w.prize, 0);

export default function Home() {
  const router = useRouter();
  const [startDate, setStartDate] = useState<string>(BALANCE_PATCH_DATE);
  const [endDate, setEndDate] = useState<string>('');
  const [player, setPlayer] = useState<string>('');
  const hydrated = useRef(false);
  const dauChartRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [matrixOnlyPlayer, setMatrixOnlyPlayer] = useState<boolean>(false);
  const [experienceFilter, setExperienceFilter] = useState<'all' | 'pro' | 'mixed' | 'beginnerVsBeginner'>('all');
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
  const [usdmRowsWeekly, setUsdmRowsWeekly] = useState<UsdmProfitRow[]>([]);
  const [usdmRowsMonthly, setUsdmRowsMonthly] = useState<UsdmProfitRow[]>([]);
  const [usdmPeriod, setUsdmPeriod] = useState<'all' | 'monthly' | 'weekly'>('all');
  const [cachedDominantClasses, setCachedDominantClasses] = useState<Record<string, string>>({});
  const [dynamicWalletToNick, setDynamicWalletToNick] = useState<Record<string, string>>({});
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [lastQueryLive, setLastQueryLive] = useState<boolean>(false);
  const [dataPhase, setDataPhase] = useState<'idle' | 'cached' | 'live'>('idle');
  const [showPlayerExplorer, setShowPlayerExplorer] = useState(false);
  const [explorerSearch, setExplorerSearch] = useState('');
  const [explorerWallet, setExplorerWallet] = useState<string | null>(null);
  const [explorerNick, setExplorerNick] = useState<string | null>(null);
  const [explorerData, setExplorerData] = useState<{ days: { day: string; won: string; lost: string; net: string; txs: number }[]; totals: { won: string; lost: string; net: string; txs: number } } | null>(null);
  const [explorerLoading, setExplorerLoading] = useState(false);
  const [explorerError, setExplorerError] = useState<string | null>(null);
  const explorerChartRef = useRef<HTMLDivElement>(null);
  type PnlData = { days: { day: string; won: string; lost: string; net: string; txs: number }[]; totals: { won: string; lost: string; net: string; txs: number } };
  const [walletInput, setWalletInput] = useState('');
  const [walletPnl, setWalletPnl] = useState<PnlData | null>(null);
  const [walletPnlLoading, setWalletPnlLoading] = useState(false);
  const [walletPnlError, setWalletPnlError] = useState<string | null>(null);
  const [walletPnlNick, setWalletPnlNick] = useState<string | null>(null);
  const walletPnlChartRef = useRef<HTMLDivElement>(null);

  const showMoneyTables = true;
  const activeUsdmRows = usdmPeriod === 'weekly' ? usdmRowsWeekly : usdmPeriod === 'monthly' ? usdmRowsMonthly : usdmRows;

  useEffect(() => {
    try {
      // Always dark mode
      if (typeof document !== 'undefined') document.documentElement.classList.add('dark');
      const rp = typeof window !== 'undefined' ? localStorage.getItem('recentPlayers') : null;
      if (rp) setRecentPlayers(JSON.parse(rp));
      // Load cached dominant classes
      const dc = typeof window !== 'undefined' ? localStorage.getItem('dominantClasses') : null;
      if (dc) setCachedDominantClasses(JSON.parse(dc));
    } catch {}
    // Fetch dynamic wallet→nickname mapping (cached 24h server-side)
    fetch('/api/wallets').then(r => r.json()).then(d => {
      if (d.ok && d.mapping) setDynamicWalletToNick(d.mapping);
    }).catch(() => {});
  }, []);

  // Load cached USDM data on page load
  useEffect(() => {
    if (showMoneyTables && usdmRows.length === 0 && !usdmLoading) {
      void fetchUsdmTop();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMoneyTables]);


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
    const money = typeof q.money === 'string' ? q.money : undefined;
    const walletParam = typeof q.wallet === 'string' ? q.wallet.trim().toLowerCase() : undefined;
    if (s) setStartDate(s);
    if (e) setEndDate(e);
    if (p) setPlayer(p);
    if (only === '1') setMatrixOnlyPlayer(true);
    if (cmp) setPlayer2(cmp);
    if (money === '1') setShowPlayerExplorer(true);
    if (walletParam && /^0x[a-f0-9]{40}$/.test(walletParam)) {
      setWalletInput(walletParam);
    }
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

  // Auto-load wallet P&L when ?wallet=0x... is in URL (public)
  const walletAutoLoaded = useRef(false);
  useEffect(() => {
    if (walletAutoLoaded.current) return;
    if (!walletInput || walletPnl || walletPnlLoading) return;
    if (!/^0x[a-f0-9]{40}$/i.test(walletInput)) return;
    walletAutoLoaded.current = true;
    fetchWalletPnl(walletInput);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walletInput]);

  // Removed auto-fetch - let users enter name and dates first, then click Compute

  // 2) Keep URL in sync with state (shallow replace)
  useEffect(() => {
    if (!hydrated.current) return;
    const nextQuery: Record<string, string> = {};
    if (startDate) nextQuery.start = startDate;
    if (endDate) nextQuery.end = endDate;
    if (player) nextQuery.player = player;
    if (matrixOnlyPlayer) nextQuery.only = '1';
    if (player2.trim()) nextQuery.compare = player2.trim();
    if (walletInput && /^0x[a-f0-9]{40}$/i.test(walletInput)) nextQuery.wallet = walletInput;
    router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  }, [startDate, endDate, player, player2, matrixOnlyPlayer, walletInput]);

  // Calculate all-time games per player (for experience filter)
  const playerGameCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const w = r.winningPlayer?.trim?.().toLowerCase() || '';
      const l = r.losingPlayer?.trim?.().toLowerCase() || '';
      if (w) counts[w] = (counts[w] || 0) + 1;
      if (l) counts[l] = (counts[l] || 0) + 1;
    }
    return counts;
  }, [rows]);

  // Filter rows based on experience level
  const experienceFilteredRows = useMemo(() => {
    if (experienceFilter === 'all') return rows;
    const PRO_THRESHOLD = 25;
    return rows.filter(r => {
      const w = r.winningPlayer?.trim?.().toLowerCase() || '';
      const l = r.losingPlayer?.trim?.().toLowerCase() || '';
      const wCount = playerGameCounts[w] || 0;
      const lCount = playerGameCounts[l] || 0;
      const wIsPro = wCount >= PRO_THRESHOLD;
      const lIsPro = lCount >= PRO_THRESHOLD;
      if (experienceFilter === 'pro') {
        // Both players must have 25+ games (pro vs pro)
        return wIsPro && lIsPro;
      } else if (experienceFilter === 'mixed') {
        // One pro and one beginner (mixed skill matchup)
        return (wIsPro && !lIsPro) || (!wIsPro && lIsPro);
      } else {
        // Both players have < 25 games (beginner vs beginner)
        return !wIsPro && !lIsPro;
      }
    });
  }, [rows, experienceFilter, playerGameCounts]);

  // Count all matches for statistics (regardless of endReason), respecting experience filter
  const statRows = useMemo(() => {
    return experienceFilteredRows;
  }, [experienceFilteredRows]);

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
    return experienceFilteredRows
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
  }, [experienceFilteredRows, player]);

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

  // Auto-scroll DAU chart to show latest (rightmost) data
  useEffect(() => {
    if (dauChartRef.current && rows.length > 0) {
      dauChartRef.current.scrollLeft = dauChartRef.current.scrollWidth;
    }
  }, [rows]);

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

  // Daily Active Users (unique addresses that played at least one game per day)
  const dailyActiveUsers = useMemo(() => {
    const dauMap: Record<string, Set<string>> = {};
    for (const r of rows) {
      // Parse date from startedAt (format: "1/15/2026, 2:08:00 PM" or ISO)
      let day = '';
      try {
        const d = new Date(r.startedAt);
        if (!isNaN(d.getTime())) {
          day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        }
      } catch {}
      if (!day) continue;
      
      if (!dauMap[day]) dauMap[day] = new Set();
      const w = r.winningPlayer?.trim?.().toLowerCase();
      const l = r.losingPlayer?.trim?.().toLowerCase();
      if (w) dauMap[day].add(w);
      if (l) dauMap[day].add(l);
    }
    
    // Convert to sorted array
    return Object.entries(dauMap)
      .map(([day, users]) => ({ day, count: users.size }))
      .sort((a, b) => a.day.localeCompare(b.day));
  }, [rows]);

  // Dominant winning classes per wallet address (for USDM Top Earners table)
  // Merges hardcoded WALLET_TO_NICK with dynamically fetched mapping (refreshed daily)
  const computedDominantClasses = useMemo(() => {
    if (rows.length === 0) return {};
    // Merge hardcoded + dynamic mapping (dynamic overwrites if conflict)
    const mergedWalletToNick = { ...WALLET_TO_NICK, ...dynamicWalletToNick };
    // Build nickname → wallets reverse map (multi-map for duplicate nicknames)
    const nickToWallets: Record<string, string[]> = {};
    for (const [addr, nick] of Object.entries(mergedWalletToNick)) {
      const key = nick.toLowerCase();
      if (!nickToWallets[key]) nickToWallets[key] = [];
      nickToWallets[key].push(addr.toLowerCase());
    }
    // Count winning classes per wallet address (only from Feb 3 2026 onwards)
    const CLASS_CUTOFF = new Date('2026-02-03T00:00:00Z').getTime();
    const classCounts: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      try { if (new Date(r.startedAt).getTime() < CLASS_CUTOFF) continue; } catch { continue; }
      const nick = r.winningPlayer?.trim();
      if (!nick) continue;
      const wallets = nickToWallets[nick.toLowerCase()];
      if (!wallets || wallets.length === 0) continue;
      const classes = (r.winningClasses ?? '').trim();
      if (!classes) continue;
      // Attribute wins to ALL wallets sharing this nickname
      for (const wallet of wallets) {
        if (!classCounts[wallet]) classCounts[wallet] = {};
        classCounts[wallet][classes] = (classCounts[wallet][classes] ?? 0) + 1;
      }
    }
    // For each wallet, pick top 1-2 classes
    const result: Record<string, string> = {};
    for (const [wallet, counts] of Object.entries(classCounts)) {
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const total = sorted.reduce((s, [, c]) => s + c, 0);
      if (sorted.length === 0) continue;
      const top = sorted[0];
      result[wallet] = top[0];
    }
    return result;
  }, [rows, dynamicWalletToNick]);

  // Persist dominant classes to localStorage & merge with cache
  useEffect(() => {
    if (Object.keys(computedDominantClasses).length > 0) {
      const merged = { ...cachedDominantClasses, ...computedDominantClasses };
      setCachedDominantClasses(merged);
      try { localStorage.setItem('dominantClasses', JSON.stringify(merged)); } catch {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedDominantClasses]);

  // Merged lookup: fresh computed data takes priority, falls back to cache
  const walletDominantClasses = useMemo(() => {
    return { ...cachedDominantClasses, ...computedDominantClasses };
  }, [cachedDominantClasses, computedDominantClasses]);

  // Reverse mapping: nickname → wallet address (for player explorer search)
  const nickToWalletMap = useMemo(() => {
    const merged = { ...WALLET_TO_NICK, ...dynamicWalletToNick };
    const map: Record<string, string> = {};
    for (const [addr, nick] of Object.entries(merged)) {
      map[nick.toLowerCase()] = addr.toLowerCase();
    }
    return map;
  }, [dynamicWalletToNick]);

  // All searchable players for explorer: [{ nick, wallet }]
  const explorerPlayerList = useMemo(() => {
    const merged = { ...WALLET_TO_NICK, ...dynamicWalletToNick };
    return Object.entries(merged)
      .map(([addr, nick]) => ({ nick, wallet: addr.toLowerCase() }))
      .sort((a, b) => a.nick.localeCompare(b.nick));
  }, [dynamicWalletToNick]);

  // Filtered search results for explorer
  const explorerSearchResults = useMemo(() => {
    const q = explorerSearch.trim().toLowerCase();
    if (!q) return explorerPlayerList.slice(0, 20);
    return explorerPlayerList.filter(p =>
      p.nick.toLowerCase().includes(q) || p.wallet.includes(q)
    ).slice(0, 20);
  }, [explorerSearch, explorerPlayerList]);

  // Fetch player P&L data
  const fetchPlayerPnl = async (wallet: string, nick: string) => {
    setExplorerWallet(wallet);
    setExplorerNick(nick);
    setExplorerLoading(true);
    setExplorerError(null);
    setExplorerData(null);
    try {
      const res = await fetch(`/api/usdm?player=${wallet}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Unknown error');
      if (!j.playerData) {
        setExplorerError('Player not found in money match data');
        return;
      }
      setExplorerData(j.playerData);
      setTimeout(() => {
        explorerChartRef.current?.scrollTo({ left: explorerChartRef.current.scrollWidth, behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setExplorerError(err?.message || 'Failed to fetch');
    } finally {
      setExplorerLoading(false);
    }
  };

  // Fetch public wallet P&L (for the filter wallet input)
  const fetchWalletPnl = async (addr: string) => {
    const w = addr.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(w)) {
      setWalletPnlError('Invalid wallet address');
      return;
    }
    setWalletPnlLoading(true);
    setWalletPnlError(null);
    setWalletPnl(null);
    if (showPlayerExplorer) {
      const merged = { ...WALLET_TO_NICK, ...dynamicWalletToNick };
      setWalletPnlNick(merged[w] || null);
    } else {
      setWalletPnlNick(null);
    }
    try {
      const res = await fetch(`/api/usdm?player=${w}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Unknown error');
      if (!j.playerData) {
        setWalletPnlError('No money match data found for this wallet');
        return;
      }
      setWalletPnl(j.playerData);
      setTimeout(() => {
        walletPnlChartRef.current?.scrollTo({ left: walletPnlChartRef.current.scrollWidth, behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      setWalletPnlError(err?.message || 'Failed to fetch');
    } finally {
      setWalletPnlLoading(false);
    }
  };

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
        if (stats.total < 25) continue;
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
      // Also fetch fresh mainnet data if query includes dates after Jan 15
      const MAINNET_TS = Math.floor(new Date('2026-01-15T11:49:24Z').getTime() / 1000);
      const needsMainnetRefresh = (endTs === undefined || endTs > MAINNET_TS);
      if (needsToday || needsMainnetRefresh) {
        void fetchLatest();
      }
    } catch (e:any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };
  // Mainnet cutover: 2026-01-15 11:49:24 UTC
  const MAINNET_START_TS = Math.floor(new Date('2026-01-15T11:49:24Z').getTime() / 1000);
  
  const fetchLatest = async () => {
    setError(null); setWarning(null); setLoading(true);
    try {
      const baseStart = startDate === BALANCE_PATCH_DATE ? BALANCE_PATCH_TS : toStartOfDayEpoch(startDate);
      const now = new Date();
      const todayStartTs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000;
      const endTs = toEndOfDayEpoch(endDate);
      // If query includes mainnet period (after Jan 15), fetch all mainnet data fresh
      const includesMainnet = (endTs === undefined || endTs > MAINNET_START_TS) && (baseStart || 0) <= (endTs || Date.now() / 1000);
      const startTs = includesMainnet 
        ? Math.max(baseStart || 0, MAINNET_START_TS + 1) // Fetch all mainnet data
        : Math.max(baseStart || 0, todayStartTs); // Just today
      const body = {
        startTs,
        endTs,
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

  const [usdmLastSyncTime, setUsdmLastSyncTime] = useState<number>(0);
  const [usdmDebug, setUsdmDebug] = useState<string>('');
  
  // Client-side RPC helper for when Vercel is rate-limited
  const clientRpc = async (method: string, params: any[]) => {
    const res = await fetch('https://mainnet.megaeth.com/rpc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || 'RPC error');
    return j.result;
  };
  
  // Client-side sync when API fails
  const clientSideSync = async (lastBlock: number) => {
    try {
      setUsdmDebug('Syncing from browser...');
      const PAYOUT = '0x7b8df4195eda5b193304eecb5107de18b6557d24';
      const USDM = '0xfafddbb3fc7688494971a79cc65dca3ef82079e7';
      const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
      
      const latestHex = await clientRpc('eth_blockNumber', []);
      const latest = parseInt(latestHex, 16);
      const from = Math.max(lastBlock + 1, 5721028);
      if (from >= latest) {
        setUsdmDebug('Up to date');
        return null;
      }
      
      setUsdmDebug(`Browser sync: blocks ${from.toLocaleString()} to ${latest.toLocaleString()}...`);
      
      // Fetch logs in one big request (client-side has better rate limits)
      const logs = await clientRpc('eth_getLogs', [{
        fromBlock: '0x' + from.toString(16),
        toBlock: '0x' + latest.toString(16),
        address: USDM,
        topics: [TRANSFER_TOPIC],
      }]);
      
      // Filter for payout contract transfers
      const relevant = (logs || []).filter((l: any) => {
        const fromAddr = l.topics[1]?.slice(-40).toLowerCase();
        const toAddr = l.topics[2]?.slice(-40).toLowerCase();
        return fromAddr === PAYOUT.slice(2) || toAddr === PAYOUT.slice(2);
      });
      
      if (relevant.length === 0) {
        setUsdmDebug('No new transfers');
        return null;
      }
      
      // Calculate new volume for display
      let newVolume = BigInt(0);
      for (const log of relevant) {
        newVolume += BigInt(log.data);
      }
      
      setUsdmDebug(`Saving ${relevant.length} transfers to server...`);
      
      // Send logs to server to persist
      try {
        const saveRes = await fetch('/api/usdm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logs: relevant, toBlock: latest }),
        });
        const saveJson = await saveRes.json();
        if (saveJson.ok && saveJson.saved) {
          setUsdmDebug(`Synced! +${relevant.length} transfers (saved)`);
          // Return the server's computed total for accuracy
          return { totalVolume: saveJson.totalVolume, logs: relevant.length, toBlock: latest, saved: true };
        }
      } catch (e) {
        console.warn('Failed to save to server:', e);
      }
      
      // Fallback: return local calculation
      setUsdmDebug(`Found ${relevant.length} new transfers (+$${Math.round(Number(newVolume) / 1e18)})`);
      return { newVolume: newVolume.toString(), logs: relevant.length, toBlock: latest };
    } catch (e: any) {
      console.error('Client sync error:', e);
      setUsdmDebug(`Browser sync failed: ${e?.message || 'Unknown'}`);
      return null;
    }
  };
  
  const fetchUsdmTop = async (force = false, isAutoRetry = false) => {
    if (usdmLoading) return;
    if (!force && usdmRows.length > 0 && usdmUpdatedAt) return;
    
    setUsdmLoading(true); setUsdmError(null);
    try {
      const res = await fetch(force ? '/api/usdm?fresh=1' : '/api/usdm');
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'Unknown error');
      setUsdmRows(j.rows || []);
      setUsdmRowsWeekly(j.rowsWeekly || []);
      setUsdmRowsMonthly(j.rowsMonthly || []);
      setUsdmVolumeSeries(j.volumeSeries || []);
      setUsdmTotalVolume(j.totalVolume || '0');
      setUsdmUpdatedAt(j.updatedAt || null);
      setUsdmError(null);
      
      // Check if we got a fallback response (means sync failed)
      const isFallback = j.source?.includes('fallback');
      const isRateLimit = j.warning?.includes('429') || j.warning?.toLowerCase().includes('upstream');
      
      // If API is rate-limited, try client-side sync
      if (isFallback && isRateLimit && j.lastBlock) {
        const clientResult = await clientSideSync(j.lastBlock);
        if (clientResult) {
          // Use server's total if saved, otherwise calculate locally
          if (clientResult.saved && clientResult.totalVolume) {
            setUsdmTotalVolume(clientResult.totalVolume);
          } else if (clientResult.newVolume) {
            const currentVol = BigInt(j.totalVolume || '0');
            const newTotal = currentVol + BigInt(clientResult.newVolume);
            setUsdmTotalVolume(newTotal.toString());
          }
          setUsdmUpdatedAt(Date.now());
          setUsdmLastSyncTime(Date.now());
          // Re-fetch to get updated rows/leaderboard
          setTimeout(() => fetchUsdmTop(false, false), 1000);
          return;
        }
      }
      
      // Show progress info
      if (j.debug || j.syncedTo) {
        const behind = j.latestBlock && j.syncedTo ? j.latestBlock - j.syncedTo : 0;
        if (behind > 100) {
          const pct = j.latestBlock ? Math.round((j.syncedTo / j.latestBlock) * 100) : 100;
          setUsdmDebug(`Syncing... ${pct}% (${behind.toLocaleString()} blocks left)`);
        } else if (j.debug?.logsFound > 0) {
          setUsdmDebug(`Synced! +${j.debug.logsFound} transfers`);
        } else {
          setUsdmDebug('Up to date');
        }
      } else if (isFallback && isRateLimit) {
        setUsdmDebug('Server busy, will try browser sync...');
      }
      
      // Auto-continue syncing
      const behind = j.latestBlock && j.syncedTo ? j.latestBlock - j.syncedTo : 0;
      if (j.needsMoreSync || behind > 100 || (isFallback && isRateLimit)) {
        if (isRateLimit) {
          setTimeout(() => fetchUsdmTop(true, true), 15000);
        } else {
          setTimeout(() => fetchUsdmTop(true, true), 2000);
        }
      } else {
        // Fully synced!
        setUsdmLastSyncTime(Date.now());
        setUsdmDebug('');
      }
    } catch (e:any) {
      const errMsg = e?.message || String(e);
      // On rate limit or upstream error, auto-retry with longer delay
      if (errMsg.includes('429') || errMsg.toLowerCase().includes('upstream')) {
        setUsdmDebug('RPC busy, retrying in 15s...');
        setTimeout(() => fetchUsdmTop(true, true), 15000);
      } else {
        const isDataFresh = usdmUpdatedAt && (Date.now() - usdmUpdatedAt) < 5 * 60 * 1000;
        if (!isDataFresh) {
          setUsdmError(errMsg);
        }
      }
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
    <div className={`min-h-screen bg-[#0a0a0a] text-gray-100`}>
      <Head><title>Showdown Meta Tracker</title></Head>
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="mb-4 rounded-lg bg-[#1a1a1a] text-gray-500 px-4 py-2 text-xs border border-gray-800">
          <span className="text-gray-400">Track the meta, find your edge.</span>{' '}
          <span className="text-gray-500">Built on fully transparent onchain MegaETH data.</span>
        </div>

          <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={SHOWDOWN_LOGO} alt="Showdown logo" className="h-10 w-10 rounded"/>
            <div>
              <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-bold tracking-wide text-red-500 uppercase">
                Showdown
              </motion.h1>
              <div className="text-xs text-gray-400 uppercase tracking-widest">
                Meta Tracker
          </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={PLAY_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-5 py-2.5 text-sm font-bold uppercase tracking-wide transition-colors"
            >
              Play Now
            </a>
            <div className="text-[10px] text-gray-500 mt-1">Referral code <span className="text-gray-400 font-medium">#405</span> for bonus showpoints</div>
          </div>
        </div>
        {/* subtitle removed per request */}

        {/* Wallet P&L Panel (public — shown when wallet address is filled) */}
        {(walletPnl || walletPnlLoading || walletPnlError) && (
          <div className="mt-6 rounded-lg bg-[#141414] p-5 border border-emerald-900/40">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="text-sm font-semibold text-gray-200">
                  Money Match P&L
                </div>
                {showPlayerExplorer && walletPnlNick && (
                  <span className="text-xs text-emerald-400 font-medium">{walletPnlNick}</span>
                )}
              </div>
              {walletInput && (
                <a className="text-[10px] text-gray-500 font-mono hover:text-gray-300" href={`https://megaeth.blockscout.com/address/${walletInput}`} target="_blank" rel="noreferrer">
                  {shortAddr(walletInput)}
                </a>
              )}
        </div>

            {walletPnlLoading && (
              <div className="text-sm text-gray-400 py-6 text-center">Loading P&L data...</div>
            )}
            {walletPnlError && !walletPnlLoading && (
              <div className="text-sm text-red-400 py-4 text-center">{walletPnlError}</div>
            )}

            {walletPnl && !walletPnlLoading && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="text-center p-3 rounded-lg bg-[#1c1c1c]">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400">Won</div>
                    <div className="mt-1 text-xl font-bold text-green-400">{formatUsdm(walletPnl.totals.won)}</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-[#1c1c1c]">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400">Lost</div>
                    <div className="mt-1 text-xl font-bold text-red-400">{formatUsdm(walletPnl.totals.lost)}</div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-[#1c1c1c]">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400">Net P&L</div>
                    <div className={`mt-1 text-xl font-bold ${BigInt(walletPnl.totals.net) >= 0n ? 'text-green-400' : 'text-red-400'}`}>
                      {formatUsdm(walletPnl.totals.net, true)}
                    </div>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-[#1c1c1c]">
                    <div className="text-[10px] uppercase tracking-wider text-gray-400">Games</div>
                    <div className="mt-1 text-xl font-bold text-gray-200">{walletPnl.totals.txs}</div>
                  </div>
                </div>

                {walletPnl.days.length > 0 && (() => {
                  const maxAbs = Math.max(...walletPnl.days.map(d => Math.abs(Number(BigInt(d.net) / 1000000000000000000n))), 1);
                  const chartHeight = 120;
                  const numDays = walletPnl.days.length;
                  const barWidth = numDays <= 7 ? 36 : numDays <= 15 ? 28 : numDays <= 30 ? 22 : numDays <= 60 ? 16 : 14;
                  const gap = barWidth <= 18 ? 1 : 2;
                  const labelEvery = numDays <= 10 ? 1 : numDays <= 20 ? 2 : numDays <= 40 ? 3 : numDays <= 80 ? 5 : 7;
                  const totalWidth = numDays * (barWidth + gap);
                  const halfChart = chartHeight / 2;
                  return (
                    <div>
                      <div className="text-xs text-gray-400 mb-2">Daily Net P&L</div>
                      <div ref={walletPnlChartRef} className="overflow-x-auto pb-2 -mx-1">
                        <div className="relative" style={{ height: chartHeight + 30, minWidth: Math.max(totalWidth, 280) }}>
                          <div className="absolute left-0 right-0 border-t border-gray-700/50" style={{ top: halfChart }} />
                          <div className="flex items-center" style={{ height: chartHeight, minWidth: Math.max(totalWidth, 280), gap }}>
                            {walletPnl.days.map((d, i) => {
                              const netDollars = Number(BigInt(d.net) / 1000000000000000000n);
                              const isPositive = netDollars >= 0;
                              const barH = Math.max((Math.abs(netDollars) / maxAbs) * halfChart, 2);
                              const isToday = d.day === new Date().toISOString().slice(0, 10);
                              return (
                                <div key={d.day} className="flex flex-col items-center" style={{ width: barWidth, minWidth: barWidth, height: '100%' }}>
                                  {isPositive ? (
                                    <>
                                      <div className="flex-1 flex flex-col items-center justify-end">
                                        <div className="text-[8px] text-green-400 mb-0.5 leading-none" style={{ flexShrink: 0 }}>
                                          {netDollars > 0 ? `+$${netDollars}` : ''}
                                        </div>
                                        <div
                                          className={`rounded-t transition-all ${isToday ? 'bg-red-500' : 'bg-green-500'}`}
                                          style={{ height: barH, width: '75%', flexShrink: 0, minHeight: 2 }}
                                          title={`${d.day}: +$${netDollars} (${d.txs} games)`}
                                        />
                                      </div>
                                      <div style={{ height: halfChart }} />
                                    </>
                                  ) : (
                                    <>
                                      <div style={{ height: halfChart }} />
                                      <div className="flex-1 flex flex-col items-center justify-start">
                                        <div
                                          className={`rounded-b transition-all ${isToday ? 'bg-red-500' : 'bg-red-500/80'}`}
                                          style={{ height: barH, width: '75%', flexShrink: 0, minHeight: 2 }}
                                          title={`${d.day}: -$${Math.abs(netDollars)} (${d.txs} games)`}
                                        />
                                        <div className="text-[8px] text-red-400 mt-0.5 leading-none" style={{ flexShrink: 0 }}>
                                          {netDollars < 0 ? `-$${Math.abs(netDollars)}` : ''}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex" style={{ minWidth: Math.max(totalWidth, 280), gap }}>
                            {walletPnl.days.map((d, i) => {
                              const isToday = d.day === new Date().toISOString().slice(0, 10);
                              const showLabel = i % labelEvery === 0 || i === numDays - 1 || isToday;
                              return (
                                <div key={d.day + '-label'} className="text-center" style={{ width: barWidth, minWidth: barWidth }}>
                                  <div className={`text-[8px] text-gray-400 whitespace-nowrap leading-none ${showLabel ? '' : 'invisible'}`}>
                                    {d.day.slice(5)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-gray-500 border-t border-gray-800 pt-2">
                        <div>{numDays} days active</div>
                        <div>Avg: {formatUsdm((BigInt(walletPnl.totals.net) / BigInt(Math.max(numDays, 1))).toString(), true)}/day</div>
                        <div>{walletPnl.totals.txs} total games</div>
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr_1fr]">
          <div className="rounded-lg bg-[#141414] p-5 lg:sticky lg:top-4 z-20 border border-gray-800/60">
            <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-4">
              Filters
            </div>
            <label className="block text-[11px] text-gray-400 mb-1">Player Name <span className="text-gray-600">(game stats)</span></label>
            <div className="relative">
            <input
              className="w-full rounded-lg bg-[#1c1c1c] border border-gray-700/60 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-gray-600 focus:outline-none"
              value={player}
                onChange={e => { setPlayer(e.target.value); setShowPlayerDropdown(true); }}
                onFocus={() => { setPlayerInputFocused(true); setShowPlayerDropdown(true); }}
                onBlur={() => { setPlayerInputFocused(false); setTimeout(() => setShowPlayerDropdown(false), 150); }}
                placeholder="Enter player name"
            />
              {showPlayerDropdown && playerInputFocused && recentPlayers.length > 0 && (
                <div className="absolute z-30 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-700/60 bg-[#1c1c1c] shadow-xl">
                  {recentPlayers
                    .filter(p => p.toLowerCase().includes(player.toLowerCase()))
                    .slice(0, 10)
                    .map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm text-gray-300 hover:bg-[#282828] first:rounded-t-lg last:rounded-b-lg"
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

            <div className="mt-3">
              <label className="block text-[11px] text-gray-400 mb-1">Wallet Address <span className="text-emerald-600">(shows P&L)</span></label>
              <div className="flex gap-1.5">
            <input
                  type="text"
                  className="flex-1 min-w-0 rounded-lg bg-[#1c1c1c] border border-gray-700/60 px-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-emerald-700 focus:outline-none font-mono"
                  value={walletInput}
                  onChange={e => setWalletInput(e.target.value.trim())}
                  onKeyDown={e => { if (e.key === 'Enter' && walletInput) fetchWalletPnl(walletInput); }}
                  placeholder="0x..."
                />
                <button
                  onClick={() => fetchWalletPnl(walletInput)}
                  disabled={!walletInput || walletPnlLoading}
                  className="rounded-lg bg-emerald-700/60 hover:bg-emerald-700 px-3 py-2 text-xs text-emerald-200 font-medium transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  {walletPnlLoading ? '...' : 'P&L'}
                </button>
              </div>
              {walletPnl && !walletPnlError && (
                <div className="mt-1.5 text-[10px] text-emerald-500">
                  {showPlayerExplorer && walletPnlNick && <span className="font-medium">{walletPnlNick} · </span>}
                  Net: {formatUsdm(walletPnl.totals.net, true)} · {walletPnl.totals.txs} games
                </div>
              )}
              {walletPnlError && (
                <div className="mt-1.5 text-[10px] text-red-400">{walletPnlError}</div>
              )}
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Start date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500"/>
                  <input type="text" placeholder="2026-Jan-13" className="w-full rounded-lg bg-[#1c1c1c] border border-gray-700/60 pl-8 pr-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-gray-600 focus:outline-none" value={formatDateDisplay(startDate)} onChange={e=>setStartDate(parseDateInput(e.target.value))} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-gray-400 mb-1">End date</label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500"/>
                  <input type="text" placeholder="Latest" className="w-full rounded-lg bg-[#1c1c1c] border border-gray-700/60 pl-8 pr-3 py-2.5 text-sm text-gray-100 placeholder-gray-500 focus:border-gray-600 focus:outline-none" value={endDate ? formatDateDisplay(endDate) : ''} onChange={e=>setEndDate(parseDateInput(e.target.value))} />
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-gray-500 mr-1">Presets:</span>
              <button className="rounded-full bg-[#1c1c1c] border border-gray-700/60 px-2.5 py-1 text-[11px] text-gray-300 hover:bg-[#282828] hover:text-white transition-colors" onClick={()=>applyPreset('sincePatch')}>Since last patch</button>
              <button className="rounded-full bg-[#1c1c1c] border border-gray-700/60 px-2.5 py-1 text-[11px] text-gray-300 hover:bg-[#282828] hover:text-white transition-colors" onClick={()=>applyPreset('thisMonth')}>This month</button>
              <button className="rounded-full bg-[#1c1c1c] border border-gray-700/60 px-2.5 py-1 text-[11px] text-gray-300 hover:bg-[#282828] hover:text-white transition-colors" onClick={()=>applyPreset('allTime')}>All time</button>
            </div>

            {/* Removed class and end reason filters per request */}

            <button onClick={() => run()} disabled={loading} className="mt-5 w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 rounded-lg px-4 py-3 text-sm text-white font-semibold uppercase tracking-wide transition-colors disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <Play className="h-4 w-4"/>}
              {loading ? "Loading..." : "Analyze"}
            </button>
            <button
              onClick={() => fetchLatest()}
              disabled={loading || rows.length === 0}
              className="mt-2 w-full inline-flex items-center justify-center gap-2 bg-[#1c1c1c] hover:bg-[#282828] rounded-lg px-4 py-2.5 text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : <ArrowUp className="h-4 w-4"/>}
              Refresh
            </button>
            {rows.length > 0 && (
              <div className="mt-2 text-xs text-gray-500">
                {dataPhase === 'cached' && `Showing cached data through ${cachedThroughLabel}. Fetching today now…`}
                {dataPhase === 'live' && `Updated with today’s matches. Cached through ${cachedThroughLabel}.`}
                {dataPhase === 'idle' && `Showing cached data through ${cachedThroughLabel}.`}
              </div>
            )}
            {error && (
              <div className="rounded-lg bg-red-900/20 border border-red-800/50 p-3 text-xs text-red-400">{error}</div>
            )}
            {warning && !error && (
              <div className="rounded-lg bg-amber-900/20 border border-amber-800/50 p-3 text-xs text-amber-400">{warning}</div>
            )}

            {/* Experience Filter */}
            <div className="mt-4">
              <div className="text-[11px] text-gray-400 mb-2">Player Experience</div>
              {(() => {
                // Pre-compute counts for each filter
                const PRO_THRESHOLD = 25;
                const counts = { all: rows.length, pro: 0, mixed: 0, beginnerVsBeginner: 0 };
                for (const r of rows) {
                  const w = r.winningPlayer?.trim?.().toLowerCase() || '';
                  const l = r.losingPlayer?.trim?.().toLowerCase() || '';
                  const wCount = playerGameCounts[w] || 0;
                  const lCount = playerGameCounts[l] || 0;
                  const wIsPro = wCount >= PRO_THRESHOLD;
                  const lIsPro = lCount >= PRO_THRESHOLD;
                  if (wIsPro && lIsPro) counts.pro++;
                  else if ((wIsPro && !lIsPro) || (!wIsPro && lIsPro)) counts.mixed++;
                  else counts.beginnerVsBeginner++;
                }
                return (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => setExperienceFilter('all')}
                      className={`rounded-lg px-2.5 py-2 text-[11px] transition-colors border ${
                        experienceFilter === 'all'
                          ? 'bg-gray-700 text-white border-gray-600'
                          : 'bg-[#1c1c1c] text-gray-400 hover:bg-[#282828] hover:text-white border-transparent'
                      }`}
                    >
                      All Games <span className="opacity-60">({counts.all})</span>
                    </button>
                    <button
                      onClick={() => setExperienceFilter('pro')}
                      disabled={counts.pro === 0}
                      className={`rounded-lg px-2.5 py-2 text-[11px] transition-colors border ${
                        experienceFilter === 'pro'
                          ? 'bg-blue-900/60 text-blue-300 border-blue-700/50'
                          : counts.pro === 0
                          ? 'bg-[#1c1c1c] text-gray-600 border-transparent cursor-not-allowed'
                          : 'bg-[#1c1c1c] text-gray-400 hover:bg-blue-900/30 hover:text-blue-300 border-transparent'
                      }`}
                    >
                      Pro vs Pro <span className="opacity-60">({counts.pro})</span>
                    </button>
                    <button
                      onClick={() => setExperienceFilter('mixed')}
                      disabled={counts.mixed === 0}
                      className={`rounded-lg px-2.5 py-2 text-[11px] transition-colors border ${
                        experienceFilter === 'mixed'
                          ? 'bg-purple-900/60 text-purple-300 border-purple-700/50'
                          : counts.mixed === 0
                          ? 'bg-[#1c1c1c] text-gray-600 border-transparent cursor-not-allowed'
                          : 'bg-[#1c1c1c] text-gray-400 hover:bg-purple-900/30 hover:text-purple-300 border-transparent'
                      }`}
                    >
                      Pro vs Beginner <span className="opacity-60">({counts.mixed})</span>
                    </button>
                    <button
                      onClick={() => setExperienceFilter('beginnerVsBeginner')}
                      disabled={counts.beginnerVsBeginner === 0}
                      className={`rounded-lg px-2.5 py-2 text-[11px] transition-colors border ${
                        experienceFilter === 'beginnerVsBeginner'
                          ? 'bg-green-900/60 text-green-300 border-green-700/50'
                          : counts.beginnerVsBeginner === 0
                          ? 'bg-[#1c1c1c] text-gray-600 border-transparent cursor-not-allowed'
                          : 'bg-[#1c1c1c] text-gray-400 hover:bg-green-900/30 hover:text-green-300 border-transparent'
                      }`}
                    >
                      Beginner vs Beginner <span className="opacity-60">({counts.beginnerVsBeginner})</span>
                    </button>
                  </div>
                );
              })()}
              <div className="mt-2 text-[10px] text-gray-500 text-center">
                {experienceFilter === 'all' && 'Showing all games regardless of experience'}
                {experienceFilter === 'pro' && 'Both players have 25+ total games'}
                {experienceFilter === 'mixed' && 'One experienced + one newer player'}
                {experienceFilter === 'beginnerVsBeginner' && 'Both players have <25 total games'}
              </div>
            </div>
          </div>

          {/* Top Earners */}
          {showMoneyTables && (
              <div id="top-usdm-profits" className="rounded-lg bg-[#141414] p-4 border border-gray-800/60">
                <div className="flex items-start justify-between mb-4">
                <div>
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Top Earners</div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {usdmUpdatedAt && (() => {
                        const age = Date.now() - usdmUpdatedAt;
                        const mins = Math.floor(age / 60000);
                        const hours = Math.floor(mins / 60);
                        const timeAgo = hours > 0 ? `${hours}h ${mins % 60}m ago` : mins > 0 ? `${mins}m ago` : 'just now';
                        const isStale = mins > 30;
                        return (
                          <span className={isStale ? 'text-amber-500' : ''}>
                            {new Date(usdmUpdatedAt).toLocaleString()} ({timeAgo})
                          </span>
                        );
                      })()}
                </div>
              </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-gray-400">Total Volume</div>
                    <div className="text-2xl font-bold text-red-500 mt-0.5">{formatUsdm(usdmTotalVolume)}</div>
                  </div>
                </div>
                <button
                  onClick={() => fetchUsdmTop(true)}
                  disabled={usdmLoading}
                  className="w-full mb-2 inline-flex items-center justify-center gap-2 bg-red-600/80 hover:bg-red-600 rounded-lg px-3 py-2 text-xs text-white font-medium transition-colors disabled:opacity-40"
                >
                  {usdmLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <ArrowUp className="h-3.5 w-3.5"/>}
                  {usdmLoading ? 'Syncing...' : 'Refresh'}
                </button>
                <div className="flex gap-1 mb-2">
                  {(['weekly', 'monthly', 'all'] as const).map(p => (
                    <button key={p} onClick={() => setUsdmPeriod(p)}
                      className={`flex-1 px-2 py-1.5 rounded text-[10px] font-medium uppercase tracking-wide transition-colors ${
                        usdmPeriod === p
                          ? 'bg-red-600/30 text-red-400 border border-red-700/60'
                          : 'bg-[#1c1c1c] text-gray-500 border border-gray-800/50 hover:text-gray-300'
                      }`}
                    >
                      {p === 'weekly' ? '7 days' : p === 'monthly' ? '30 days' : 'All time'}
                    </button>
                  ))}
                </div>
                {usdmDebug && !usdmError && (
                  <div className="mb-2 text-xs text-yellow-500/80">{usdmDebug}</div>
                )}
                {usdmError && (
                  <div className={`mb-3 rounded-lg p-2.5 text-xs ${activeUsdmRows.length === 0 ? 'bg-red-900/20 border border-red-800/50 text-red-400' : 'bg-amber-900/20 border border-amber-800/50 text-amber-400'}`}>{usdmError}</div>
                )}
                <div className="overflow-hidden rounded-lg border border-gray-800/50">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-[#1c1c1c]">
                      <tr className="text-gray-400 text-[10px] uppercase tracking-wide">
                        <th className="px-3 py-2.5 w-10 text-center">#</th>
                        <th className="px-3 py-2.5">Player <span className="normal-case text-gray-600 font-normal">(top class)</span></th>
                        <th className="px-3 py-2.5 text-green-500">Profit</th>
                        <th className="px-3 py-2.5 text-right whitespace-nowrap">Games</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {(() => {
                        const mergedNickMap = { ...WALLET_TO_NICK, ...dynamicWalletToNick };
                        return activeUsdmRows.map((r, i) => {
                          const netBi = BigInt(r.net || '0');
                          const netAbs = Number((netBi < 0n ? -netBi : netBi) / 1000000000000000000n);
                          const isProfitable = netBi > 0n;
                          const netClass = isProfitable
                            ? netAbs >= 100 ? 'text-green-400 font-bold'
                            : netAbs >= 10 ? 'text-green-400 font-semibold'
                            : 'text-green-400'
                            : netBi < 0n ? 'text-red-400/70' : 'text-gray-400';
                          const dominantClasses = walletDominantClasses[r.player.toLowerCase()];
                          const nick = mergedNickMap[r.player.toLowerCase()];
                          return (
                            <tr key={r.player + i} className="hover:bg-[#1c1c1c] transition-colors">
                              <td className="px-3 py-2.5 text-center text-gray-500">{i + 1}</td>
                              <td className="px-3 py-2.5">
                                {nick && <div className="text-[11px] text-gray-200 font-medium mb-0.5">{nick}</div>}
                                <button className="text-gray-500 hover:text-gray-300 font-mono text-[10px] hover:underline" onClick={() => { setWalletInput(r.player.toLowerCase()); fetchWalletPnl(r.player.toLowerCase()); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>{shortAddr(r.player)}</button>
                                {dominantClasses && (
                                  <div className="text-[10px] text-blue-400/70 mt-0.5" title="Most winning class combo">{dominantClasses}</div>
                                )}
                              </td>
                              <td className={`px-3 py-2.5 tabular-nums ${netClass}`}>{formatUsdm(r.net, true)}</td>
                              <td className="px-3 py-2.5 text-right text-gray-500">{r.txs}</td>
                            </tr>
                          );
                        });
                      })()}
                      {usdmLoading && activeUsdmRows.length === 0 && <SkeletonTableRows rows={5} cols={4} />}
                      {!usdmLoading && activeUsdmRows.length === 0 && !usdmError && (
                        <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={4}>{usdmPeriod === 'all' ? 'No data yet' : `No data for this period`}</td></tr>
                      )}
                    </tbody>
                  </table>
          </div>
                <a className="mt-2 inline-block text-[10px] text-gray-500 hover:text-gray-300 transition-colors" href="https://megaeth.blockscout.com/address/0x7B8DF4195eda5b193304eeCB5107DE18b6557D24?tab=txs" target="_blank" rel="noreferrer">View contract →</a>
        </div>
          )}

          {/* Tournament Winners */}
          {showMoneyTables && (
              <div id="tournament-winners" className="rounded-lg bg-[#141414] p-4 border border-gray-800/60">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-widest text-amber-400">🏆 Tournament Winners</div>
                    <div className="text-[10px] text-gray-500 mt-1">Freeroll prizes</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-gray-400">Total Prizes</div>
                    <div className="text-2xl font-bold text-amber-400 mt-0.5">${TOURNAMENT_TOTAL.toLocaleString()}</div>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-gray-800/50">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-[#1c1c1c]">
                      <tr className="text-gray-400 text-[10px] uppercase tracking-wide">
                        <th className="px-3 py-2.5 w-10 text-center">#</th>
                        <th className="px-3 py-2.5">Player</th>
                        <th className="px-3 py-2.5 text-amber-400">Prize</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {TOURNAMENT_WINNERS.map((w) => {
                        const prizeClass = w.rank === 1 ? 'text-amber-300 font-bold' 
                          : w.rank <= 3 ? 'text-amber-400 font-semibold' 
                          : 'text-amber-400/80';
                        const rankDisplay = w.rank === 1 ? '🥇' : w.rank === 2 ? '🥈' : w.rank === 3 ? '🥉' : w.rank;
                        return (
                          <tr key={w.address} className="hover:bg-[#1c1c1c] transition-colors">
                            <td className="px-3 py-2.5 text-center text-gray-500">{rankDisplay}</td>
                            <td className="px-3 py-2.5 font-mono text-[11px]">
                              <a className="text-gray-300 hover:text-white" href={`https://megaeth.blockscout.com/address/${w.address}`} target="_blank" rel="noreferrer">{shortAddr(w.address)}</a>
                            </td>
                            <td className={`px-3 py-2.5 tabular-nums ${prizeClass}`}>{w.display}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-2 text-[10px] text-gray-500">Manual payouts until smart contract</div>
              </div>
          )}
        </div>

        {/* Stats */}
        <div className="mt-6 rounded-lg bg-[#141414] p-5 border border-gray-800/60">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-lg bg-[#1c1c1c]">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Wins</div>
              {loading && stats.wins === 0 ? (
                <div className="mt-1 h-8 w-16 mx-auto bg-gray-700 rounded animate-pulse" />
              ) : (
                <div className="mt-1 text-2xl font-bold text-green-400">{stats.wins}</div>
              )}
          </div>
            <div className="text-center p-3 rounded-lg bg-[#1c1c1c]">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Losses</div>
              {loading && stats.losses === 0 ? (
                <div className="mt-1 h-8 w-16 mx-auto bg-gray-700 rounded animate-pulse" />
              ) : (
                <div className="mt-1 text-2xl font-bold text-red-400">{stats.losses}</div>
              )}
          </div>
            <div className="text-center p-3 rounded-lg bg-[#1c1c1c]">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Win Rate</div>
              {loading && stats.wins === 0 && stats.losses === 0 ? (
                <div className="mt-1 h-8 w-20 mx-auto bg-gray-700 rounded animate-pulse" />
              ) : (
                <div className="mt-1 text-2xl font-bold text-gray-100">{(stats.winrate*100).toFixed(1)}%</div>
              )}
          </div>
            <div className="text-center p-3 rounded-lg bg-[#1c1c1c]">
              <div className="text-[10px] uppercase tracking-wider text-gray-400">Top Class</div>
              {loading && !stats.dominantClass ? (
                <div className="mt-1 h-6 w-24 mx-auto bg-gray-700 rounded animate-pulse" />
              ) : (
                <>
                  <div className="mt-1 text-sm font-semibold truncate text-gray-100">{stats.dominantClass || '—'}</div>
                  {stats.dominantClass && <div className="text-[10px] text-gray-500">{Math.round((stats.dominantClassPct||0) * 100)}% of wins</div>}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tables navigation */}
        <div className="mt-6 rounded-lg bg-[#141414] p-4 border border-gray-800/60">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Jump to
              </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <a href="#player-class-stats" className="px-3 py-1.5 rounded bg-[#1c1c1c] text-gray-300 hover:bg-[#282828] hover:text-white transition-colors">Player stats</a>
            <a href="#class-vs-class" className="px-3 py-1.5 rounded bg-[#1c1c1c] text-gray-300 hover:bg-[#282828] hover:text-white transition-colors">Class vs Class</a>
            <a href="#player-matches" className="px-3 py-1.5 rounded bg-[#1c1c1c] text-gray-300 hover:bg-[#282828] hover:text-white transition-colors">Matches</a>
            <a href="#global-class-stats" className="px-3 py-1.5 rounded bg-[#1c1c1c] text-gray-300 hover:bg-[#282828] hover:text-white transition-colors">Global stats</a>
            <a href="#top-by-class" className="px-3 py-1.5 rounded bg-[#1c1c1c] text-gray-300 hover:bg-[#282828] hover:text-white transition-colors">Best by class</a>
            <a href="#all-decoded" className="px-3 py-1.5 rounded bg-[#1c1c1c] text-gray-300 hover:bg-[#282828] hover:text-white transition-colors">All games</a>
            {showMoneyTables && (
              <a href="#top-usdm-profits" className="px-3 py-1.5 rounded bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 border border-red-800/50 transition-colors">Top Earners</a>
            )}
          </div>
        </div>

        {/* Player-focused tables */}
        <details id="player-section" className="mt-6" open>
          <summary className="flex items-center gap-3 cursor-pointer list-none text-xs uppercase tracking-widest font-bold text-gray-400">
            <span>Player Analysis</span>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-[11px] normal-case font-normal text-red-500">{player || 'select player'}</span>
          </summary>
          <div className="mt-4">
        {/* Per-class performance (player specific) */}
        <div id="player-class-stats" className="rounded-lg bg-[#141414] p-4 border border-gray-800/60">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-200">
              Class Performance — <span className="text-red-500">{player || '—'}</span>
              {experienceFilter !== 'all' && (
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                    experienceFilter === 'pro' ? 'bg-blue-900/50 text-blue-400' :
                    experienceFilter === 'mixed' ? 'bg-purple-900/50 text-purple-400' :
                    'bg-green-900/50 text-green-400'
                  }`}>
                  {experienceFilter === 'pro' ? 'Pro vs Pro' : experienceFilter === 'mixed' ? 'Pro vs Beginner' : 'Beginner vs Beginner'}
                </span>
              )}
            </div>
            {classStats.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => dl("showdown_class_stats_" + (player||'player') + ".json", classStats)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] border border-gray-700/60 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#282828] transition-colors">
                  <Download className="h-3.5 w-3.5"/> JSON
                </button>
                <button onClick={() => dlCsv("showdown_class_stats_" + (player||'player') + ".csv", classStats)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] border border-gray-700/60 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#282828] transition-colors">
                  <Download className="h-3.5 w-3.5"/> CSV
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-700 bg-[#1c1c1c]">
                  <th className="p-2 w-52 cursor-pointer sticky left-0 bg-[#1c1c1c]" aria-sort={playerClassSort.key==='klass' ? (playerClassSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setPlayerClassSort(s=>({ key:'klass' as any, dir: s.key==='klass' && s.dir==='asc' ? 'desc' : 'asc' }))}>Class {playerClassSort.key==='klass' ? (playerClassSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={playerClassSort.key==='wins' ? (playerClassSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setPlayerClassSort(s=>({ key:'wins' as any, dir: s.key==='wins' && s.dir==='asc' ? 'desc' : 'asc' }))}>Wins {playerClassSort.key==='wins' ? (playerClassSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={playerClassSort.key==='losses' ? (playerClassSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setPlayerClassSort(s=>({ key:'losses' as any, dir: s.key==='losses' && s.dir==='asc' ? 'desc' : 'asc' }))}>Losses {playerClassSort.key==='losses' ? (playerClassSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={playerClassSort.key==='total' ? (playerClassSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setPlayerClassSort(s=>({ key:'total' as any, dir: s.key==='total' && s.dir==='asc' ? 'desc' : 'asc' }))}>Games {playerClassSort.key==='total' ? (playerClassSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-28 cursor-pointer" aria-sort={playerClassSort.key==='winrate' ? (playerClassSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setPlayerClassSort(s=>({ key:'winrate' as any, dir: s.key==='winrate' && s.dir==='asc' ? 'desc' : 'asc' }))}>Win Rate {playerClassSort.key==='winrate' ? (playerClassSort.dir==='asc'?'↑':'↓') : ''}</th>
                </tr>
              </thead>
              <tbody>
                {classStats.map((r, i) => (
                  <tr key={r.klass + i} className="border-b border-gray-800 hover:bg-[#1c1c1c] transition-colors">
                    <td className="p-2 sticky left-0 bg-[#141414]">{r.klass}</td>
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
        <div id="class-vs-class" className="mt-6 rounded-lg bg-[#141414] p-4 border border-gray-800/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="text-sm font-semibold text-gray-200">
              Class vs Class — Win Rates
              {experienceFilter !== 'all' && (
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                    experienceFilter === 'pro' ? 'bg-blue-900/50 text-blue-400' :
                    experienceFilter === 'mixed' ? 'bg-purple-900/50 text-purple-400' :
                    'bg-green-900/50 text-green-400'
                  }`}>
                  {experienceFilter === 'pro' ? 'Pro vs Pro' : experienceFilter === 'mixed' ? 'Pro vs Beginner' : 'Beginner vs Beginner'}
                </span>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-400">
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
                    className={`px-2 py-2 sm:px-4 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      isSelected
                        ? 'bg-red-600 text-white shadow-md ring-2 ring-red-400'
                        : 'bg-[#1c1c1c] text-gray-300 hover:bg-[#282828] hover:scale-105'
                    }`}
                  >
                    {cls}
                  </button>
                );
              })}
            </div>
            {selectedBaseClasses.length === 1 && (
              <div className="mt-2 text-xs text-amber-400">
                Select one more class to see matchups
              </div>
            )}
          </div>

          {/* Show selected dual-class and its matchups */}
          {selectedDualClass && classVsClass.matchups[selectedDualClass] && (
            <div className="mt-5">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs md:text-sm">
                  <thead>
                    <tr className="border-b border-gray-700 bg-[#1c1c1c]">
                      <th 
                        className="p-2 cursor-pointer hover:bg-[#282828] transition-colors"
                        onClick={() => setClassVsClassSort(s => ({ key: 'opponent', dir: s.key === 'opponent' && s.dir === 'asc' ? 'desc' : 'asc' }))}
                      >
                        Opponent {classVsClassSort.key === 'opponent' ? (classVsClassSort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th 
                        className="p-2 text-center cursor-pointer hover:bg-[#282828] transition-colors"
                        onClick={() => setClassVsClassSort(s => ({ key: 'winRate', dir: s.key === 'winRate' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      >
                        <span className="font-bold text-blue-400">{selectedDualClass}</span> WR {classVsClassSort.key === 'winRate' ? (classVsClassSort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th 
                        className="p-2 text-center cursor-pointer hover:bg-[#282828] transition-colors"
                        onClick={() => setClassVsClassSort(s => ({ key: 'wins', dir: s.key === 'wins' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      >
                        Wins {classVsClassSort.key === 'wins' ? (classVsClassSort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th 
                        className="p-2 text-center cursor-pointer hover:bg-[#282828] transition-colors"
                        onClick={() => setClassVsClassSort(s => ({ key: 'losses', dir: s.key === 'losses' && s.dir === 'desc' ? 'asc' : 'desc' }))}
                      >
                        Losses {classVsClassSort.key === 'losses' ? (classVsClassSort.dir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                      <th 
                        className="p-2 text-center cursor-pointer hover:bg-[#282828] transition-colors"
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
                            <tr key={m.opponent} className="border-b border-gray-800 hover:bg-[#1c1c1c] transition-colors">
                              <td className="p-2 font-medium">{m.opponent}</td>
                              <td className="p-2 text-center">
                                <span
                                  className="inline-block rounded-full px-2 py-0.5 text-xs text-white font-medium"
                                  style={{ backgroundColor: `hsl(${hue}, 60%, 45%)` }}
                                >
                                  {(m.winRate * 100).toFixed(0)}%
                                </span>
                              </td>
                              <td className="p-2 text-center tabular-nums text-green-400">{m.wins}</td>
                              <td className="p-2 text-center tabular-nums text-red-400">{m.losses}</td>
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
            <div className="mt-4 p-4 text-center text-gray-500 text-sm border border-dashed rounded-lg border-gray-700">
              No data found for <span className="font-semibold">{selectedDualClass}</span> in the current dataset
            </div>
          )}
          {!selectedDualClass && classVsClass.classes.length > 0 && (
            <div className="mt-4 p-4 text-center text-gray-500 text-sm border border-dashed rounded-lg border-gray-700">
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
        <div id="player-matches" className="mt-6 rounded-lg bg-[#141414] p-4 border border-gray-800/60">
            <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-200">
              Matches — <span className="text-red-500">{player || '—'}</span>
              <span className="ml-2 text-xs text-gray-500">({filtered.length})</span>
              {experienceFilter !== 'all' && (
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                    experienceFilter === 'pro' ? 'bg-blue-900/50 text-blue-400' :
                    experienceFilter === 'mixed' ? 'bg-purple-900/50 text-purple-400' :
                    'bg-green-900/50 text-green-400'
                  }`}>
                  {experienceFilter === 'pro' ? 'Pro vs Pro' : experienceFilter === 'mixed' ? 'Pro vs Beginner' : 'Beginner vs Beginner'}
                </span>
              )}
            </div>
            {filtered.length > 0 && (
                <div className="flex items-center gap-2">
                <button onClick={() => dl("showdown_matches_for_" + (player||'player') + ".json", filtered)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] border border-gray-700/60 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#282828] transition-colors">
                    <Download className="h-4 w-4"/> JSON
                  </button>
                <button onClick={() => dlCsv("showdown_matches_for_" + (player||'player') + ".csv", filtered)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] border border-gray-700/60 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#282828] transition-colors">
                    <Download className="h-4 w-4"/> CSV
                  </button>
                </div>
              )}
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-700 bg-[#1c1c1c]">
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
                      <tr className="border-b border-gray-800 hover:bg-[#1c1c1c] transition-colors cursor-pointer" onClick={()=>toggleExpandedFiltered(r.txHash)}>
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
                        <tr className="border-b border-gray-700 bg-[#1a1a1a]">
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
              <select className="ml-2 rounded border px-2 py-1 bg-[#1c1c1c] border-gray-700/60" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>
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
                className="ml-2 w-16 rounded border px-2 py-1 bg-[#1c1c1c] border-gray-700/60"
                placeholder="Go"
              />
            </div>
          )}
        </div>

          </div>
        </details>

        {/* Global tables */}
        <details id="global-section" className="mt-10" open>
          <summary className="flex items-center gap-3 cursor-pointer list-none text-xs uppercase tracking-widest font-bold text-gray-400">
            <span>Global Meta</span>
            <span className="h-px flex-1 bg-gray-800" />
            <span className="text-[11px] normal-case font-normal text-gray-500">{rangeLabel}</span>
          </summary>
          <div className="mt-4">

        {/* All matches per-class performance (global) */}
        <div id="global-class-stats" className="rounded-lg bg-[#141414] p-4 border border-gray-800/60">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-200">
              Class Performance — All Matches
              <span className="ml-2 text-xs text-gray-500">({rangeLabel})</span>
              {experienceFilter !== 'all' && (
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                    experienceFilter === 'pro' ? 'bg-blue-900/50 text-blue-400' :
                    experienceFilter === 'mixed' ? 'bg-purple-900/50 text-purple-400' :
                    'bg-green-900/50 text-green-400'
                  }`}>
                  {experienceFilter === 'pro' ? 'Pro vs Pro' : experienceFilter === 'mixed' ? 'Pro vs Beginner' : 'Beginner vs Beginner'}
                </span>
              )}
            </div>
            {overallClassStats.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => dl("showdown_class_stats_all.json", overallClassStats)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] border border-gray-700/60 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#282828] transition-colors">
                  <Download className="h-4 w-4"/> JSON
                </button>
                <button onClick={() => dlCsv("showdown_class_stats_all.csv", overallClassStats)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] border border-gray-700/60 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#282828] transition-colors">
                  <Download className="h-4 w-4"/> CSV
                </button>
              </div>
            )}
          </div>
          <div className="mt-1 text-[10px] text-gray-500">{aggUpdatedAt ? `Aggregates last updated ${new Date(aggUpdatedAt).toLocaleString()}` : ''}</div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-700 bg-[#1c1c1c]">
                  <th className="p-2 w-52 cursor-pointer sticky left-0 bg-[#1c1c1c]" aria-sort={overallSort.key==='klass' ? (overallSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setOverallSort(s=>({ key:'klass' as any, dir: s.key==='klass' && s.dir==='asc' ? 'desc' : 'asc' }))}>Class {overallSort.key==='klass' ? (overallSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={overallSort.key==='wins' ? (overallSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setOverallSort(s=>({ key:'wins' as any, dir: s.key==='wins' && s.dir==='asc' ? 'desc' : 'asc' }))}>Wins {overallSort.key==='wins' ? (overallSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={overallSort.key==='losses' ? (overallSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setOverallSort(s=>({ key:'losses' as any, dir: s.key==='losses' && s.dir==='asc' ? 'desc' : 'asc' }))}>Losses {overallSort.key==='losses' ? (overallSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-24 cursor-pointer" aria-sort={overallSort.key==='total' ? (overallSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setOverallSort(s=>({ key:'total' as any, dir: s.key==='total' && s.dir==='asc' ? 'desc' : 'asc' }))}>Games {overallSort.key==='total' ? (overallSort.dir==='asc'?'↑':'↓') : ''}</th>
                  <th className="p-2 w-28 cursor-pointer" aria-sort={overallSort.key==='winrate' ? (overallSort.dir==='asc'?'ascending':'descending') : 'none'} onClick={()=>setOverallSort(s=>({ key:'winrate' as any, dir: s.key==='winrate' && s.dir==='asc' ? 'desc' : 'asc' }))}>Win Rate {overallSort.key==='winrate' ? (overallSort.dir==='asc'?'↑':'↓') : ''}</th>
                </tr>
              </thead>
              <tbody>
                {overallClassStats.map((r, i) => (
                  <tr key={r.klass + i} className="border-b border-gray-800 hover:bg-[#1c1c1c] transition-colors">
                    <td className="p-2 sticky left-0 bg-[#141414]">{r.klass}</td>
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

          {/* Top Player by Class */}
        <div id="top-by-class" className="mt-6 rounded-lg bg-[#141414] p-4 border border-gray-800/60">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-200">
              Best Player by Class
              <span className="ml-2 text-xs text-gray-500">(min 25 games)</span>
              {experienceFilter !== 'all' && (
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                    experienceFilter === 'pro' ? 'bg-blue-900/50 text-blue-400' :
                    experienceFilter === 'mixed' ? 'bg-purple-900/50 text-purple-400' :
                    'bg-green-900/50 text-green-400'
                  }`}>
                  {experienceFilter === 'pro' ? 'Pro vs Pro' : experienceFilter === 'mixed' ? 'Pro vs Beginner' : 'Beginner vs Beginner'}
                </span>
              )}
            </div>
              {topPlayersByClass.length > 0 && (
                <div className="flex items-center gap-2">
                <button onClick={() => dl("showdown_top_by_class.json", topPlayersByClass)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] border border-gray-700/60 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#282828] transition-colors">
                    <Download className="h-4 w-4"/> JSON
                  </button>
          </div>
              )}
            </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead>
                <tr className="border-b border-gray-700 bg-[#1c1c1c]">
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
                    <tr key={row.klass} className="border-b border-gray-800 hover:bg-[#1c1c1c] transition-colors">
                        <td className="p-2 font-medium">{row.klass}</td>
                        <td className="p-2">{row.player}</td>
                        <td className="p-2 text-center tabular-nums">
                        <span className="text-green-400">{row.wins}</span>
                          <span className="text-gray-400 mx-1">/</span>
                        <span className="text-red-400">{row.losses}</span>
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
        <div id="all-decoded" className="mt-6 rounded-lg bg-[#141414] p-4 border border-gray-800/60">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-200">
              All Games
              <span className="ml-2 text-xs text-gray-500">({experienceFilter === 'all' ? rows.length : experienceFilteredRows.length})</span>
              {experienceFilter !== 'all' && (
                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${
                    experienceFilter === 'pro' ? 'bg-blue-900/50 text-blue-400' :
                    experienceFilter === 'mixed' ? 'bg-purple-900/50 text-purple-400' :
                    'bg-green-900/50 text-green-400'
                  }`}>
                  {experienceFilter === 'pro' ? 'Pro vs Pro' : experienceFilter === 'mixed' ? 'Pro vs Beginner' : 'Beginner vs Beginner'}
                </span>
            )}
          </div>
            {rows.length > 0 && (
              <div className="flex items-center gap-2">
                <button onClick={() => dl("showdown_winrate_results.json", rows)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] border border-gray-700/60 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#282828] transition-colors">
                  <Download className="h-4 w-4"/> JSON
                </button>
                <button onClick={() => dlCsv("showdown_winrate_results.csv", rows)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1c1c1c] border border-gray-700/60 px-3 py-1.5 text-xs text-gray-300 hover:bg-[#282828] transition-colors">
                  <Download className="h-4 w-4"/> CSV
                </button>
              </div>
            )}
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs md:text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-gray-700 bg-[#1c1c1c]">
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
                      <tr className="border-b border-gray-800 hover:bg-[#1c1c1c] transition-colors cursor-pointer" onClick={()=>toggleExpandedAll(r.txHash)}>
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
                        <tr className="border-b border-gray-700 bg-[#1a1a1a]">
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
              <select className="ml-2 rounded border px-2 py-1 bg-[#1c1c1c] border-gray-700/60" value={pageSize} onChange={e=>setPageSize(Number(e.target.value))}>
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
                className="ml-2 w-16 rounded border px-2 py-1 bg-[#1c1c1c] border-gray-700/60"
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

        {/* Daily Active Users Chart */}
        {dailyActiveUsers.length > 0 && (() => {
          const maxCount = Math.max(...dailyActiveUsers.map(x => x.count), 1);
          const chartHeight = 160;
          return (
            <div className="mt-6 rounded-lg bg-[#141414] p-3 sm:p-4 border border-gray-800/60">
              <div className="text-sm font-semibold text-gray-200 mb-3 sm:mb-4">
                Daily Active Users
                <span className="ml-2 text-xs text-gray-500">(unique players per day)</span>
              </div>
              <div ref={dauChartRef} className="overflow-x-auto pb-2 -mx-1">
                {(() => {
                  const numDays = dailyActiveUsers.length;
                  // Tighter bars on mobile: min 14px when lots of days
                  const barWidth = numDays <= 7 ? 40 : numDays <= 15 ? 32 : numDays <= 30 ? 24 : numDays <= 60 ? 18 : 14;
                  const gap = barWidth <= 18 ? 1 : 3;
                  const labelEvery = numDays <= 10 ? 1 : numDays <= 20 ? 2 : numDays <= 40 ? 3 : numDays <= 80 ? 5 : 7;
                  const totalWidth = numDays * (barWidth + gap);
                  
                  return (
                    <div className="flex items-end" style={{ height: chartHeight + 40, minWidth: Math.max(totalWidth, 280), gap }}>
                      {dailyActiveUsers.map((d, i) => {
                        const barHeight = Math.max((d.count / maxCount) * chartHeight, 3);
                        const isToday = d.day === new Date().toISOString().slice(0, 10);
                        const showLabel = i % labelEvery === 0 || i === numDays - 1 || isToday;
                        return (
                          <div key={d.day} className="flex flex-col items-center justify-end" style={{ width: barWidth, minWidth: barWidth, height: '100%' }}>
                            <div className="text-[9px] sm:text-[10px] text-gray-300 mb-0.5 font-medium leading-none" style={{ flexShrink: 0 }}>
                              {d.count}
                            </div>
                            <div
                              className={`rounded-t transition-all ${isToday ? 'bg-red-500' : 'bg-blue-500 hover:bg-blue-400'}`}
                              style={{ height: barHeight, width: '80%', flexShrink: 0, minHeight: 3 }}
                              title={`${d.day}: ${d.count} players`}
                            />
                            <div 
                              className={`text-[8px] sm:text-[10px] mt-1 text-gray-400 whitespace-nowrap leading-none ${showLabel ? '' : 'invisible'}`} 
                              style={{ flexShrink: 0 }}
                            >
                              {d.day.slice(5)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs text-gray-500 border-t border-gray-800 pt-2 sm:pt-3">
                <div>Total: {dailyActiveUsers.length}d</div>
                <div>Avg: {(dailyActiveUsers.reduce((s, d) => s + d.count, 0) / dailyActiveUsers.length).toFixed(1)}/day</div>
                <div>Peak: {maxCount}</div>
              </div>
            </div>
          );
        })()}

        {/* Daily Volume Chart */}
        {usdmVolumeSeries.length > 0 && (() => {
          const volData = usdmVolumeSeries.map(v => ({
            day: v.day,
            amount: Number(BigInt(v.volume) / 1000000000000000000n),
          }));
          const maxVol = Math.max(...volData.map(v => v.amount), 1);
          const chartHeight = 160;
          return (
            <div className="mt-6 rounded-lg bg-[#141414] p-3 sm:p-4 border border-gray-800/60">
              <div className="text-sm font-semibold text-gray-200 mb-3 sm:mb-4">
                Daily Volume
                <span className="ml-2 text-xs text-gray-500">(USDM wagered per day)</span>
              </div>
              <div className="overflow-x-auto pb-2 -mx-1" ref={(el) => { if (el) setTimeout(() => el.scrollTo({ left: el.scrollWidth, behavior: 'auto' }), 50); }}>
                {(() => {
                  const numDays = volData.length;
                  const barWidth = numDays <= 7 ? 40 : numDays <= 15 ? 32 : numDays <= 30 ? 24 : numDays <= 60 ? 18 : 14;
                  const gap = barWidth <= 18 ? 1 : 3;
                  const labelEvery = numDays <= 10 ? 1 : numDays <= 20 ? 2 : numDays <= 40 ? 3 : numDays <= 80 ? 5 : 7;
                  const totalWidth = numDays * (barWidth + gap);
                  return (
                    <div className="flex items-end" style={{ height: chartHeight + 40, minWidth: Math.max(totalWidth, 280), gap }}>
                      {volData.map((d, i) => {
                        const barHeight = Math.max((d.amount / maxVol) * chartHeight, 3);
                        const isToday = d.day === new Date().toISOString().slice(0, 10);
                        const showLabel = i % labelEvery === 0 || i === numDays - 1 || isToday;
                        return (
                          <div key={d.day} className="flex flex-col items-center justify-end" style={{ width: barWidth, minWidth: barWidth, height: '100%' }}>
                            <div className="text-[9px] sm:text-[10px] text-gray-300 mb-0.5 font-medium leading-none" style={{ flexShrink: 0 }}>
                              ${d.amount}
                            </div>
                            <div
                              className={`rounded-t transition-all ${isToday ? 'bg-red-500' : 'bg-emerald-500 hover:bg-emerald-400'}`}
                              style={{ height: barHeight, width: '80%', flexShrink: 0, minHeight: 3 }}
                              title={`${d.day}: $${d.amount}`}
                            />
                            <div
                              className={`text-[8px] sm:text-[10px] mt-1 text-gray-400 whitespace-nowrap leading-none ${showLabel ? '' : 'invisible'}`}
                              style={{ flexShrink: 0 }}
                            >
                              {d.day.slice(5)}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs text-gray-500 border-t border-gray-800 pt-2 sm:pt-3">
                <div>Total: {formatUsdm(usdmTotalVolume)}</div>
                <div>Avg: ${volData.length > 0 ? Math.round(volData.reduce((s, d) => s + d.amount, 0) / volData.length) : 0}/day</div>
                <div>Peak: ${maxVol}</div>
              </div>
            </div>
          );
        })()}

        {/* Player P&L Explorer (secret: ?money=1) */}
        {showPlayerExplorer && (
          <div className="mt-6 rounded-lg bg-[#141414] p-4 border border-gray-800/60">
            <div className="text-sm font-semibold text-gray-200 mb-4">
              Player P&L Explorer
              <span className="ml-2 text-xs text-gray-500">(search any player)</span>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={explorerSearch}
                  onChange={e => setExplorerSearch(e.target.value)}
                  placeholder="Search by nickname or wallet..."
                  className="w-full rounded bg-[#1c1c1c] border border-gray-700 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-red-600 focus:outline-none"
                />
                {explorerSearch.trim() && (
                  <div className="absolute z-20 top-full left-0 right-0 mt-1 rounded bg-[#1e1e1e] border border-gray-700 max-h-60 overflow-y-auto shadow-lg">
                    {explorerSearchResults.length === 0 && (
                      <div className="px-3 py-2 text-xs text-gray-500">No players found</div>
                    )}
                    {explorerSearchResults.map(p => (
                      <button
                        key={p.wallet}
                        onClick={() => { setExplorerSearch(''); fetchPlayerPnl(p.wallet, p.nick); }}
                        className="w-full text-left px-3 py-2 hover:bg-[#282828] transition-colors flex items-center gap-2"
                      >
                        <span className="text-sm text-gray-200">{p.nick}</span>
                        <span className="text-[10px] text-gray-500 font-mono">{shortAddr(p.wallet)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {explorerLoading && (
              <div className="text-sm text-gray-400 py-8 text-center">Loading player data...</div>
            )}
            {explorerError && (
              <div className="text-sm text-red-400 py-4 text-center">{explorerError}</div>
            )}

            {explorerData && explorerWallet && (
              <div>
                <div className="flex flex-wrap items-center gap-3 mb-4 pb-3 border-b border-gray-800">
                  <div className="text-base font-semibold text-gray-200">
                    {explorerNick || shortAddr(explorerWallet)}
                  </div>
                  <a className="text-[10px] text-gray-500 font-mono hover:text-gray-300" href={`https://megaeth.blockscout.com/address/${explorerWallet}`} target="_blank" rel="noreferrer">
                    {shortAddr(explorerWallet)}
                  </a>
                  {walletDominantClasses[explorerWallet] && (
                    <span className="text-[10px] text-blue-400/70 bg-blue-900/20 px-2 py-0.5 rounded">{walletDominantClasses[explorerWallet]}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="rounded bg-[#1c1c1c] p-3 border border-gray-800/50">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Won</div>
                    <div className="text-lg font-bold text-green-400">{formatUsdm(explorerData.totals.won)}</div>
                  </div>
                  <div className="rounded bg-[#1c1c1c] p-3 border border-gray-800/50">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Lost</div>
                    <div className="text-lg font-bold text-red-400">{formatUsdm(explorerData.totals.lost)}</div>
                  </div>
                  <div className="rounded bg-[#1c1c1c] p-3 border border-gray-800/50">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Net P&L</div>
                    <div className={`text-lg font-bold ${BigInt(explorerData.totals.net) >= 0n ? 'text-green-400' : 'text-red-400'}`}>
                      {formatUsdm(explorerData.totals.net, true)}
                    </div>
                  </div>
                  <div className="rounded bg-[#1c1c1c] p-3 border border-gray-800/50">
                    <div className="text-[10px] text-gray-500 uppercase tracking-wide">Games</div>
                    <div className="text-lg font-bold text-gray-200">{explorerData.totals.txs}</div>
                  </div>
                </div>

                {explorerData.days.length > 0 && (() => {
                  const maxAbs = Math.max(...explorerData.days.map(d => Math.abs(Number(BigInt(d.net) / 1000000000000000000n))), 1);
                  const chartHeight = 140;
                  const numDays = explorerData.days.length;
                  const barWidth = numDays <= 7 ? 40 : numDays <= 15 ? 32 : numDays <= 30 ? 24 : numDays <= 60 ? 18 : 14;
                  const gap = barWidth <= 18 ? 1 : 3;
                  const labelEvery = numDays <= 10 ? 1 : numDays <= 20 ? 2 : numDays <= 40 ? 3 : numDays <= 80 ? 5 : 7;
                  const totalWidth = numDays * (barWidth + gap);
                  const halfChart = chartHeight / 2;
                  return (
                    <div>
                      <div className="text-xs text-gray-400 mb-2">Daily Net P&L</div>
                      <div ref={explorerChartRef} className="overflow-x-auto pb-2 -mx-1">
                        <div className="relative" style={{ height: chartHeight + 30, minWidth: Math.max(totalWidth, 280) }}>
                          <div className="absolute left-0 right-0 border-t border-gray-700/50" style={{ top: halfChart }} />
                          <div className="flex items-center" style={{ height: chartHeight, minWidth: Math.max(totalWidth, 280), gap }}>
                            {explorerData.days.map((d, i) => {
                              const netDollars = Number(BigInt(d.net) / 1000000000000000000n);
                              const isPositive = netDollars >= 0;
                              const barH = Math.max((Math.abs(netDollars) / maxAbs) * halfChart, 2);
                              const isToday = d.day === new Date().toISOString().slice(0, 10);
                              const showLabel = i % labelEvery === 0 || i === numDays - 1 || isToday;
                              return (
                                <div key={d.day} className="flex flex-col items-center" style={{ width: barWidth, minWidth: barWidth, height: '100%' }}>
                                  {isPositive ? (
                                    <>
                                      <div className="flex-1 flex flex-col items-center justify-end">
                                        <div className="text-[8px] sm:text-[9px] text-green-400 mb-0.5 leading-none" style={{ flexShrink: 0 }}>
                                          {netDollars > 0 ? `+$${netDollars}` : ''}
                                        </div>
                                        <div
                                          className={`rounded-t transition-all ${isToday ? 'bg-red-500' : 'bg-green-500'}`}
                                          style={{ height: barH, width: '75%', flexShrink: 0, minHeight: 2 }}
                                          title={`${d.day}: ${netDollars >= 0 ? '+' : ''}$${netDollars} (${d.txs} games)`}
                                        />
                                      </div>
                                      <div style={{ height: halfChart }} />
                                    </>
                                  ) : (
                                    <>
                                      <div style={{ height: halfChart }} />
                                      <div className="flex-1 flex flex-col items-center justify-start">
                                        <div
                                          className={`rounded-b transition-all ${isToday ? 'bg-red-500' : 'bg-red-500/80'}`}
                                          style={{ height: barH, width: '75%', flexShrink: 0, minHeight: 2 }}
                                          title={`${d.day}: -$${Math.abs(netDollars)} (${d.txs} games)`}
                                        />
                                        <div className="text-[8px] sm:text-[9px] text-red-400 mt-0.5 leading-none" style={{ flexShrink: 0 }}>
                                          {netDollars < 0 ? `-$${Math.abs(netDollars)}` : ''}
                                        </div>
                                      </div>
                                    </>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex" style={{ minWidth: Math.max(totalWidth, 280), gap }}>
                            {explorerData.days.map((d, i) => {
                              const isToday = d.day === new Date().toISOString().slice(0, 10);
                              const showLabel = i % labelEvery === 0 || i === numDays - 1 || isToday;
                              return (
                                <div key={d.day + '-label'} className="text-center" style={{ width: barWidth, minWidth: barWidth }}>
                                  <div className={`text-[8px] sm:text-[10px] text-gray-400 whitespace-nowrap leading-none ${showLabel ? '' : 'invisible'}`}>
                                    {d.day.slice(5)}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs text-gray-500 border-t border-gray-800 pt-2">
                        <div>{numDays} days active</div>
                        <div>Avg: {formatUsdm((BigInt(explorerData.totals.net) / BigInt(Math.max(numDays, 1))).toString(), true)}/day</div>
                        <div>{explorerData.totals.txs} total games</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {!explorerLoading && !explorerData && !explorerError && (
              <div className="text-sm text-gray-500 py-8 text-center">
                Search for a player above to see their money match P&L breakdown
              </div>
            )}
          </div>
        )}
      </div>
      {/* copy toast */}
      {copiedTx && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 rounded-full bg-gray-100 text-gray-900 px-3 py-1 text-xs shadow">
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
      className="fixed bottom-6 right-6 z-20 rounded-full bg-[#1c1c1c] text-white p-3 shadow-lg border border-gray-700/60 hover:bg-[#282828] transition-colors"
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
              <div className="h-3 rounded bg-gray-700"/>
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
