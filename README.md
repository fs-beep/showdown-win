# Showdown Winrate — Branded (Next.js + Daily Cache)

- Server-side per-day cache + incremental updates for today
- Per-class stats + dominant class
- Class-vs-Class matrix (dual classes only) with toggle (all games vs only matches incl. the selected player), heatmap + sample size
- Newest-first ordering for player matches and all decoded matches
- Top banner credit + link, Showdown logo and banner images

## Dev
```bash
npm i
npm run dev
# http://localhost:3000
```

## Deploy (Vercel)
Push to GitHub → import. Node 20.x. (Optional env overrides: `RPC_URL`, `CONTRACT_ADDRESS`.)

Images are in `/public/images`.
