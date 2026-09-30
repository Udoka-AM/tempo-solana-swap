# Tempo × Solana Swap

Non-custodial, stablecoin-only routes between Tempo (chain `4217`) and Solana mainnet. The browser composes two Across legs through Base (`8453`) because Across does not support a direct Tempo ↔ Solana route. Same-origin Cloudflare Pages Functions validate each leg and obtain short-lived quotes without exposing the Across API credentials.

## Supported release scope

- Tempo: `pathUSD`, `USDC.e`
- Solana: native USDC. SOL is displayed as gas-only.
- Directions: Tempo stablecoin → Base USDC → Solana USDC; Solana USDC → Base USDC → Tempo stablecoin.
- Solana recipients must have a USDC associated token account. The app checks this before signing and can initialize it when the recipient wallet is connected.
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

## Route architecture

The app never requests a direct Tempo ↔ Solana quote. Each swap is quoted as two independent Across legs: Tempo ↔ Base USDC, then Base USDC ↔ Solana USDC. Tempo → Solana needs the sending Tempo wallet plus a Solana recipient address; if that recipient has no USDC account, the recipient wallet can initialize it once. Solana → Tempo also needs an EVM settlement signer for the Base → Tempo leg, while the final Tempo recipient may be pasted separately.

## Checks

```bash
npm run typecheck
npm test
npm run build
```
