import type { Network } from '../../shared/assets'

const EVM_PATTERN = /^0x[0-9a-fA-F]{40}$/
const SOLANA_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/

export function isEvmAddress(value: string) {
  return EVM_PATTERN.test(value.trim())
}

export function isSolanaAddress(value: string) {
  return SOLANA_PATTERN.test(value.trim())
}

export function validateAddressFor(network: Network, value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return 'Enter a destination address.'
  if (network === 'tempo') {
    return isEvmAddress(trimmed) ? undefined : 'Enter a valid EVM address (0x followed by 40 hex characters).'
  }
  return isSolanaAddress(trimmed) ? undefined : 'Enter a valid Solana address (base58, usually 44 characters).'
}

const STORAGE_PREFIX = 'tempo-swap:dest:'

export function loadSavedDestination(network: Network): string {
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${network}`) ?? ''
  } catch {
    return ''
  }
}

export function saveDestination(network: Network, address: string) {
  try {
    if (address.trim()) window.localStorage.setItem(`${STORAGE_PREFIX}${network}`, address.trim())
    else window.localStorage.removeItem(`${STORAGE_PREFIX}${network}`)
  } catch {
    // Private mode etc. — saving is best-effort.
  }
}
