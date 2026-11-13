# MCX Options Simulator

Build MCX option strategies from manual assumptions or Eureka market quotes. React renders the simulator; a local Node server authenticates with Eureka and fetches market data. No orders are submitted.

## Local setup

Use Node.js 22.12 or later. From this directory:

```sh
npm install
```

If `.env.local` does not exist, copy `.env.example` to `.env.local`. Fill in these server settings locally:

```dotenv
EUREKA_BASE_URL=https://algo.eurekasecurities.net
EUREKA_APP_KEY=your_binary_marketdata_app_key
EUREKA_SECRET_KEY=your_binary_marketdata_app_secret
MARKET_DATA_PORT=3001

# Supabase account login and cloud strategy storage
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

The checked-in example contains empty credentials. `.env.local` is ignored by Git. Never use a `VITE_` prefix for a secret: those variables can enter the browser bundle. The API key, secret and session token are used only by the Node server, with credentials sent to the configured Eureka endpoint. For this direct endpoint, use credentials issued for Symphony's **Binary Marketdata API** subscription. The separate Interactive package described by some broker-platform guides is for trading integrations.

```sh
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`. This command starts both servers and shuts down both on Ctrl+C. Restart after editing credentials. Manual simulation works without credentials; when valid Eureka credentials are configured, the app connects automatically and starts the live market board.

### Login and saved strategies

The app now restores the account flow from GitHub: email sign-up, sign-in, password reset and sign-out are handled by Supabase. Add the two `VITE_SUPABASE_*` values to `.env.local`, then run [`supabase/schema.sql`](supabase/schema.sql) once in the Supabase SQL editor. The schema creates the named `strategies` table plus one private `strategy_drafts` row per account, with row-level security on both. The browser receives only the Supabase URL and anon key; keep the Eureka app key/secret server-only and never commit either file.

If the Supabase values are absent, the app shows a setup screen instead of silently bypassing authentication. This is why an older local checkout opened directly: it was on commit `87aa4c9`, before the remote auth commit `95b770f` was integrated.

For a built local app:

```sh
npm run build
npm start
```

Open `http://127.0.0.1:3001` (or your configured port). `npm run preview` serves only the frontend and does not provide the market API. Both app servers bind to loopback. Hosting this app publicly requires authenticated server deployment and appropriate broker data permissions; uploading only `dist` cannot provide the credentialed API.

## Market workflow

1. The configured server connects automatically. Choose a non-agricultural commodity, option expiry, call/put and strike. Only unexpired MCX options appear. The future must resolve through its explicit instrument-master reference; the app does not guess a nearby future.
2. Set lots and review the editable Entry price / LTP field. It defaults to the live last traded price, but you can replace it with the price you actually bought or sold at before adding BUY or SELL.
3. Add up to 20 legs sharing the same underlying future and option expiry. Manual legs and other expiries require a separate strategy.
4. Model futures price, IV and remaining expiry time update together from a complete valid set of quotes. **Freeze snapshot** or edit an input to explore a scenario. **Follow quotes** resumes updates. Historical entry-premium edits never recalibrate live IV.
5. **Market P&L estimate** values every leg at the bid/ask midpoint, falling back to last trade. **Model P&L** uses Black-76 with the displayed scenario inputs. Neither includes fees or slippage. Signed-in users save strategies to Supabase; the persistence hook retains a local-storage fallback for offline/legacy use.

Drafts autosave after about one second of inactivity. They are stored locally first, then upserted as one cloud draft row when Supabase is available. Reloading offers Restore or Discard; pressing Save strategy creates the named strategy and clears the draft. Autosave never creates duplicate named strategies.

The app polls the selected future, option and strategy legs in batches of up to 50 IDs every five seconds. This is REST polling, not a tick-by-tick WebSocket stream. A quote is usable for 15 seconds after retrieval. Missing or stale quotes suppress the market total; incomplete or invalid quotes leave the last complete model snapshot in place with its timestamp. Reconnect/reload restores the contract selector; a saved contract must match the current master before live valuation resumes.

### Vercel deployment

The local `server/index.mjs` process is not available inside a static Vercel frontend. The repository now includes authenticated Vercel functions at `/api/market/status`, `/api/market/contracts`, and `/api/market/quotes`. Add these Vercel environment variables for the Production environment, then redeploy:

```dotenv
EUREKA_BASE_URL=https://algo.eurekasecurities.net
EUREKA_APP_KEY=your_binary_marketdata_app_key
EUREKA_SECRET_KEY=your_binary_marketdata_app_secret
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

`EUREKA_APP_KEY` and `EUREKA_SECRET_KEY` must be server-only Vercel variables. The browser sends the signed-in Supabase access token to the market functions; unauthenticated requests are rejected. Do not put Eureka credentials in any `VITE_*` variable. If the Vercel project uses a separate market-data host, set `VITE_MARKET_DATA_API_URL` to that host's `/api/market` base path instead.

## Data flow and assumptions

```text
Browser → local /api/market endpoints → Eureka /apimarketdata
                                       ├─ POST /auth/login
                                       ├─ POST /instruments/master (MCXFO)
                                       └─ POST /instruments/quotes (1502, JSON)
```

Local endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/market/status` | Reports configuration/session status without initiating login |
| `GET /api/market/contracts` | Authenticates as needed and returns normalized contracts |
| `POST /api/market/quotes` | Accepts `{ "instrumentIds": [123] }`, up to 50 known MCX IDs |

The adapter caches the session, retries authentication once after session failure, caches the master for six hours and quotes for two seconds, and spaces broker quote calls at least one second apart. It applies request timeouts and returns sanitized errors. Tokens and raw authentication responses are never returned to the browser. The local adapter rejects external origins and non-local Host headers.

- Cash exposure per one-point premium move per lot is `LotSize × Multiplier × PriceNumerator / PriceDenominator`, using broker metadata. Live calculations use this effective scale rather than the manual commodity defaults. Missing conversion metadata makes a contract unavailable.
- `Retrieved` means the server received the quote, not that a trade just occurred. Numeric XTS trade timestamps have an ambiguous epoch and are left unavailable; a last-trade fallback can reflect an older trade even after successful retrieval.
- Naive expiry timestamps are interpreted in IST. Date-only expiries use 23:30 IST as an end-of-day approximation. Exact exchange settlement times and Eureka's account-specific master format should be confirmed on the first authenticated session.
- Probability of profit is an expiry estimate under a zero-drift lognormal futures model, with quantity-weighted RMS IV. It is unavailable for mixed futures/expiries. It is not inferred from the chart's displayed price range.
- Margin is an approximation, not a broker SPAN/exposure-margin response. This integration retrieves market data only; it does not retrieve positions, account balances or order execution.

Protocol references: [XTS market-data API](https://symphonyfintech.com/xts-market-data-front-end-api-v2/) and [XTS monetary conversion example](https://symphonyfintech.com/xts-trading-front-end-api-v2/). Eureka access, subscribed exchanges and exact response formats still require verification with your own credentials.

## Validation

```sh
npm run check
```

This runs ESLint, frontend calculation/persistence tests, offline backend tests, TypeScript and the production build. Tests mock broker requests; they do not use credentials or authenticate with Eureka. They cover authentication retry, normalization, expiry/lot conversion, cache/freshness handling, immutable entries, complete model snapshots, pricing/IV/Greeks and saved-strategy validation.
