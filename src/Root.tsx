import { DynamicContextProvider } from '@dynamic-labs/sdk-react-core'
import { EthereumWalletConnectors } from '@dynamic-labs/ethereum'
import { SolanaWalletConnectors } from '@dynamic-labs/solana'
import App from './App'
import { SolanaWalletBridge, TempoWalletBridge } from './components/WalletContexts'

const environmentId = import.meta.env.VITE_DYNAMIC_ENVIRONMENT_ID

export default function Root() {
  if (!environmentId) return <main className="configuration-error"><strong>Wallet connection is not configured.</strong><span>Set VITE_DYNAMIC_ENVIRONMENT_ID in the Pages environment.</span></main>
  return (
    <DynamicContextProvider settings={{ environmentId, appName: 'Tempo × Solana Swap · Tempo', localStorageSuffix: 'tempo-evm', enableConnectOnlyFallback: true, networkValidationMode: 'never', walletConnectors: [EthereumWalletConnectors] }}>
      <TempoWalletBridge>
        <DynamicContextProvider settings={{ environmentId, appName: 'Tempo × Solana Swap · Solana', localStorageSuffix: 'solana-svm', enableConnectOnlyFallback: true, networkValidationMode: 'never', walletConnectors: [SolanaWalletConnectors] }}>
          <SolanaWalletBridge>
            <App />
          </SolanaWalletBridge>
        </DynamicContextProvider>
      </TempoWalletBridge>
    </DynamicContextProvider>
  )
}
