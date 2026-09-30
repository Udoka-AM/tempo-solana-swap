# Tempo × Solana Swap

Non-custodial, stablecoin-only routes between Tempo (chain `4217`) and Solana mainnet. The browser calls same-origin Cloudflare Pages Functions, which validate the pair and obtain short-lived Across quotes without exposing the Across API credentials.

## Supported release scope

- Tempo: `pathUSD`, `USDC.e`
- Solana: native USDC. SOL is displayed as gas-only.
- Directions: Tempo stablecoin → Solana USDC; Solana USDC → Tempo stablecoin.
- Unsupported or unavailable Across pairs are rejected rather than quoted synthetically.

## Local run

```bash
cp .env.example .env.local
npm install --legacy-peer-deps
npm run dev
```

Set `VITE_DYNAMIC_ENVIRONMENT_ID` from the Dynamic dashboard. Configure Dynamic for connect-only external wallets, Tempo chain `4217`, Solana mainnet, and multi-wallet support.

## Cloudflare Pages

Create a scoped API token with Account Read and Pages Edit; save it outside this repository as `CLOUDFLARE_API_TOKEN`. Do not use a Global API Key.

The GitHub workflow needs these repository secrets:

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `VITE_DYNAMIC_ENVIRONMENT_ID`
- `ACROSS_API_KEY`, `ACROSS_INTEGRATOR_ID`

The production workflow deploys `main`, then writes the two Across values as Pages Function secrets. Pull requests receive preview deployments but never receive production quote credentials.

## Quote API and bridging verification

- `GET /api/health` reports `{ ok, across: 'configured' | 'missing' }`. The header badge and swap card read this on load; `degraded` means the Across secrets are missing on that deployment.
- `GET /api/quote` is the only browser path to Across `/swap/approval`. It enforces the stablecoin allowlist, injects the server-side `integratorId`, times out after 12s, and truncates upstream error detail.
- `GET /api/deposit-status?depositTxnRef=<hash>` (or `originChainId` + `depositId`) proxies Across `/deposit/status`. After submitting, use **Check delivery status** in the success panel to confirm the hop moved `pending` → `filled`.
- Post-deploy QA runs automatically on `main`: the workflow curls `/api/health` (`ok:true`) and `/api/tokens` (`pathUSD` present).
- `GET /api/across-meta?resource=chains|tokens` proxies Across swap metadata (no key exposure). Used to confirm chain 4217 + Solana support and exact token addresses.

## Known upstream limitation (2026-09-30)

Across `/swap/approval` rejects every Tempo ↔ Solana pair with `INVALID_PARAM: "Destination swaps are not supported yet for routes involving Solana."` Verified live for pathUSD/USDC.e ↔ USDC in both directions, with full and minimal parameters. Our pairs require a swap leg (different input/output assets), so no quote can render until Across ships Solana swap support. The UI surfaces the upstream message verbatim (`Across: …`) instead of a generic error.

## Checks

```bash
npm run typecheck
npm test
npm run build
```
