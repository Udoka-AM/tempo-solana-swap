import { type ReactNode } from 'react'
import { useDynamicContext, useSwitchWallet, useUserWallets } from '@dynamic-labs/sdk-react-core'
import { SolanaWalletContext, TempoWalletContext } from './wallet-context'

export function TempoWalletBridge({ children }: { children: ReactNode }) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const switchWallet = useSwitchWallet()
  const userWallets = useUserWallets()
  const wallet = (primaryWallet?.chain === 'EVM' ? primaryWallet : userWallets.find((entry) => entry.chain === 'EVM')) ?? null
  return <TempoWalletContext.Provider value={{ wallet, connect: () => setShowAuthFlow(true), activate: () => wallet ? switchWallet(wallet.id) : Promise.resolve() }}>{children}</TempoWalletContext.Provider>
}

export function SolanaWalletBridge({ children }: { children: ReactNode }) {
  const { primaryWallet, setShowAuthFlow } = useDynamicContext()
  const switchWallet = useSwitchWallet()
  const userWallets = useUserWallets()
  const wallet = (primaryWallet?.chain === 'SOL' ? primaryWallet : userWallets.find((entry) => entry.chain === 'SOL')) ?? null
  return <SolanaWalletContext.Provider value={{ wallet, connect: () => setShowAuthFlow(true), activate: () => wallet ? switchWallet(wallet.id) : Promise.resolve() }}>{children}</SolanaWalletContext.Provider>
}
