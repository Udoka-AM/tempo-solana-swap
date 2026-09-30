import { describe, expect, it, vi } from 'vitest'
import { executeEvmQuote } from './transactions'

describe('EVM execution sequencing', () => {
  it('switches to Tempo, sends approvals, then submits Across calldata', async () => {
    const sendTransaction = vi.fn(async () => '0xhash' as const)
    const wallet = { switchNetwork: vi.fn(async () => undefined), connector: { getSigner: async () => ({ sendTransaction }) } }
    const progress = vi.fn()
    await executeEvmQuote(wallet, { approvalTxns: [{ to: '0x0000000000000000000000000000000000000001', data: '0x01' }], swapTx: { to: '0x0000000000000000000000000000000000000002', data: '0x02' } }, progress)
    expect(wallet.switchNetwork).toHaveBeenCalledWith(4217)
    expect(sendTransaction).toHaveBeenNthCalledWith(1, { to: '0x0000000000000000000000000000000000000001', data: '0x01', value: undefined })
    expect(sendTransaction).toHaveBeenNthCalledWith(2, { to: '0x0000000000000000000000000000000000000002', data: '0x02', value: undefined })
  })
})
