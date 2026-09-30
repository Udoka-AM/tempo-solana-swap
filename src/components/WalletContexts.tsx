import { type ReactNode } from 'react'
import { useDynamicContext, useUserWallets } from '@dynamic-labs/sdk-react-core'
import { SolanaWalletContext, TempoWalletContext } from './wallet-context'

export function TempoWalletBridge({ children }: { children: ReactNode }) {
  const { setShowAuthFlow } = useDynamicContext()
  const wallet = useUserWallets().find((entry) => entry.chain === 'EVM') ?? null
  return <TempoWalletContext.Provider value={{ wallet, connect: () => setShowAuthFlow(true) }}>{children}</TempoWalletContext.Provider>
}

export function SolanaWalletBridge({ children }: { children: ReactNode }) {
  const { setShowAuthFlow } = useDynamicContext()
  const wallet = useUserWallets().find((entry) => entry.chain === 'SOL') ?? null
  return <SolanaWalletContext.Provider value={{ wallet, connect: () => setShowAuthFlow(true) }}>{children}</SolanaWalletContext.Provider>
}
