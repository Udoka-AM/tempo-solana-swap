import { type ReactNode } from 'react'
import { useDynamicContext } from '@dynamic-labs/sdk-react-core'
import { SolanaWalletContext, TempoWalletContext } from './wallet-context'

export function TempoWalletBridge({ children }: { children: ReactNode }) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  return <TempoWalletContext.Provider value={{ wallet: primaryWallet, connect: () => setShowAuthFlow(true) }}>{children}</TempoWalletContext.Provider>
}

export function SolanaWalletBridge({ children }: { children: ReactNode }) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  return <SolanaWalletContext.Provider value={{ wallet: primaryWallet, connect: () => setShowAuthFlow(true) }}>{children}</SolanaWalletContext.Provider>
}
