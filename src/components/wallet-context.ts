import { createContext, useContext } from 'react'
import type { useDynamicContext } from '@dynamic-labs/sdk-react-core'

export type DynamicWallet = NonNullable<ReturnType<typeof useDynamicContext>['primaryWallet']>

export type WalletContextValue = {
  wallet: DynamicWallet | null
  connect: () => void
}

export const TempoWalletContext = createContext<WalletContextValue | null>(null)
export const SolanaWalletContext = createContext<WalletContextValue | null>(null)

export function useTempoWallet() {
  const value = useContext(TempoWalletContext)
  if (!value) throw new Error('useTempoWallet must be used inside a Tempo wallet provider')
  return value
}

export function useSolanaWallet() {
  const value = useContext(SolanaWalletContext)
  if (!value) throw new Error('useSolanaWallet must be used inside a Solana wallet provider')
  return value
}
