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
Push to GitHub → import. Node 20.x.

### Optional env overrides
- `RPC_URL`
- `CONTRACT_ADDRESS`

### Caching with Vercel KV (recommended)
This app persistently caches per-day decoded results in Vercel KV, making repeated queries nearly instant and reducing RPC load. If KV is not configured, it falls back to an in-memory LRU of recent days within the serverless runtime (which is ephemeral and cold‑start dependent).

1. In Vercel, add the KV integration to your project.
2. Add these environment variables (automatically created by the integration):
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`
   - `KV_URL` (optional)
3. Redeploy.

Notes:
- Keys are stored as `day:<unix_day_index>`.
- Today’s bucket is incrementally extended and written back to KV on each request.
- Historical days are immutable; they’re fetched once and cached.

No schema or migrations are required.

Images are in `/public/images`.
