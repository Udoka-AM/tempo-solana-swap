import { Connection, PublicKey, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token'
import { findAsset } from '../../shared/assets'

export const SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com'

const usdcMint = new PublicKey(findAsset('solana', 'USDC')!.address)

export function solanaUsdcAta(owner: string) {
  return getAssociatedTokenAddressSync(usdcMint, new PublicKey(owner), false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID)
}

export async function hasSolanaUsdcAta(owner: string, connection = new Connection(SOLANA_RPC_URL, 'confirmed')) {
  return Boolean(await connection.getAccountInfo(solanaUsdcAta(owner), 'confirmed'))
}

export async function buildSolanaUsdcAtaTransaction(
  payer: string,
  owner: string,
  connection = new Connection(SOLANA_RPC_URL, 'confirmed'),
) {
  const payerKey = new PublicKey(payer)
  const ownerKey = new PublicKey(owner)
  const ata = solanaUsdcAta(owner)
  const { blockhash } = await connection.getLatestBlockhash('confirmed')
  const instruction = createAssociatedTokenAccountIdempotentInstruction(
    payerKey,
    ata,
    ownerKey,
    usdcMint,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  )
  const message = new TransactionMessage({
    payerKey,
    recentBlockhash: blockhash,
    instructions: [instruction],
  }).compileToV0Message()
  return new VersionedTransaction(message)
}
