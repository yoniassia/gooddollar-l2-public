// Mock viem for unit tests (avoids ESM import issues)
export const createPublicClient = jest.fn(() => ({
  getBalance: jest.fn(),
  readContract: jest.fn(),
  waitForTransactionReceipt: jest.fn(),
}))

export const createWalletClient = jest.fn(() => ({
  writeContract: jest.fn(),
}))

export const http = jest.fn((url: string) => ({ url }))

export const parseEther = (val: string) => BigInt(Math.round(parseFloat(val) * 1e18))
export const formatEther = (val: bigint) => (Number(val) / 1e18).toString()
export const formatUnits = (val: bigint, decimals: number) => (Number(val) / 10 ** decimals).toString()

export type PublicClient = ReturnType<typeof createPublicClient>
export type WalletClient = ReturnType<typeof createWalletClient>
export type Transport = any
export type Chain = any
export type Account = { address: string }
export type Address = string
