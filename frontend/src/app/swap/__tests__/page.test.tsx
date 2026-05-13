import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

describe('SwapPage', () => {
  it('redirects to the homepage', async () => {
    const { redirect } = await import('next/navigation')
    const { default: SwapPage } = await import('../page')

    try {
      SwapPage()
    } catch {
      // redirect throws in test environment
    }

    expect(redirect).toHaveBeenCalledWith('/')
  })
})
