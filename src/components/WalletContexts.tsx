import { type ReactNode } from 'react'
import { useDynamicContext, useSwitchWallet, useUserWallets } from '@dynamic-labs/sdk-react-core'
import { SolanaWalletContext, TempoWalletContext } from './wallet-context'

export function TempoWalletBridge({ children }: { children: ReactNode }) {
  const { primaryWallet, setShowAuthFlow, removeWallet } = useDynamicContext()
  const switchWallet = useSwitchWallet()
  const userWallets = useUserWallets()
  const wallets = userWallets.filter((entry) => entry.chain === 'EVM')
  const wallet = (primaryWallet?.chain === 'EVM' ? primaryWallet : wallets[0]) ?? null
  return <TempoWalletContext.Provider value={{ wallet, wallets, connect: () => setShowAuthFlow(true), activate: () => wallet ? switchWallet(wallet.id) : Promise.resolve(), select: switchWallet, disconnect: removeWallet }}>{children}</TempoWalletContext.Provider>
}

export function SolanaWalletBridge({ children }: { children: ReactNode }) {
  const { primaryWallet, setShowAuthFlow, removeWallet } = useDynamicContext()
  const switchWallet = useSwitchWallet()
  const userWallets = useUserWallets()
  const wallets = userWallets.filter((entry) => entry.chain === 'SOL')
  const wallet = (primaryWallet?.chain === 'SOL' ? primaryWallet : wallets[0]) ?? null
  return <SolanaWalletContext.Provider value={{ wallet, wallets, connect: () => setShowAuthFlow(true), activate: () => wallet ? switchWallet(wallet.id) : Promise.resolve(), select: switchWallet, disconnect: removeWallet }}>{children}</SolanaWalletContext.Provider>
}
