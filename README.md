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

## Checks

```bash
npm run typecheck
npm test
npm run build
```
