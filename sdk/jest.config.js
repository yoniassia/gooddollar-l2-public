module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      diagnostics: false,
    }],
  },
  moduleNameMapper: {
    '^viem$': '<rootDir>/src/__mocks__/viem.ts',
    '^viem/accounts$': '<rootDir>/src/__mocks__/viem-accounts.ts',
  },
}
