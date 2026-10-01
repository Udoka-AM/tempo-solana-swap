import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import { SolanaWalletConnectors } from '@dynamic-labs/solana'
import App from './App'
import { SolanaWalletBridge, TempoWalletBridge } from './components/WalletContexts'

const environmentId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID

export default function Root() {
  if (!environmentId) return <main className="configuration-error"><strong>Wallet connection is not configured.</strong><span>Set VITE_DYNAMIC_ENVIRONMENT_ID in the Pages environment.</span></main>
  return (
    <DynamicContextProvider settings={{ environmentId, appName: 'Tempo ⇌ Solana', localStorageSuffix: 'tempo-solana', enableConnectOnlyFallback: true, networkValidationMode: 'never', overrides: { multiWallet: true }, walletConnectors: [EthereumWalletConnectors, SolanaWalletConnectors] }}>
      <TempoWalletBridge>
        <SolanaWalletBridge>
          <App />
        </SolanaWalletBridge>
      </TempoWalletBridge>
    </DynamicContextProvider>
  )
}
