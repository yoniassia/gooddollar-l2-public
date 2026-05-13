// Mock viem/accounts for unit tests
export const privateKeyToAccount = jest.fn((key: string) => ({
  address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  type: 'local',
}))
