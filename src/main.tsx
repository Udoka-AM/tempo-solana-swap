import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import { SolanaWalletConnectors } from '@dynamic-labs/solana'
import './index.css'
import App from './App'

const environmentId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID

function Root() {
  if (!environmentId) return <main className="configuration-error"><strong>Wallet connection is not configured.</strong><span>Set VITE_DYNAMIC_ENVIRONMENT_ID in the Pages environment.</span></main>
  return <DynamicContextProvider settings={{ environmentId, appName: 'Tempo × Solana Swap', enableConnectOnlyFallback: true, networkValidationMode: 'never', walletConnectors: [EthereumWalletConnectors, SolanaWalletConnectors] }}><App /></DynamicContextProvider>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Root /></StrictMode>)
