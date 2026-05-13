import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import RegisterAgentPage from '../agents/register/page'

const { mockWriteContract } = vi.hoisted(() => ({
  mockWriteContract: vi.fn(),
}))

// Mock wagmi hooks
vi.mock('wagmi', () => ({
  useWriteContract: vi.fn().mockReturnValue({
    writeContract: mockWriteContract,
    data: undefined,
    isPending: false,
    error: null,
  }),
  useWaitForTransactionReceipt: vi.fn().mockReturnValue({
    isLoading: false,
    isSuccess: false,
  }),
  useAccount: vi.fn().mockReturnValue({
    address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    isConnected: true,
  }),
  useReadContract: vi.fn().mockReturnValue({
    data: false,
    isLoading: false,
  }),
}))

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}))

describe('RegisterAgentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the registration form', () => {
    render(<RegisterAgentPage />)
    expect(screen.getByText('🤖 Register Your Agent')).toBeDefined()
    expect(screen.getByPlaceholderText(/AlphaBot/)).toBeDefined()
    expect(screen.getByText('Momentum Trading')).toBeDefined()
    expect(screen.getByText('Arbitrage')).toBeDefined()
  })

  it('shows connected wallet address', () => {
    render(<RegisterAgentPage />)
    expect(screen.getByText('0xf39F…2266')).toBeDefined()
  })

  it('shows "use my wallet" checkbox checked by default', () => {
    render(<RegisterAgentPage />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).toBeDefined()
    expect((checkbox as HTMLInputElement).checked).toBe(true)
  })

  it('shows separate agent address input when unchecked', () => {
    render(<RegisterAgentPage />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(screen.getByPlaceholderText('0x...')).toBeDefined()
  })

  it('disables submit without a name', () => {
    render(<RegisterAgentPage />)
    const button = screen.getByRole('button', { name: /Register Agent/i })
    expect(button).toBeDefined()
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables submit when name is filled in', () => {
    render(<RegisterAgentPage />)
    const input = screen.getByPlaceholderText(/AlphaBot/)
    fireEvent.change(input, { target: { value: 'TestBot' } })
    const button = screen.getByRole('button', { name: /Register Agent/i })
    expect((button as HTMLButtonElement).disabled).toBe(false)
  })

  it('calls writeContract on submit', () => {
    render(<RegisterAgentPage />)
    const input = screen.getByPlaceholderText(/AlphaBot/)
    fireEvent.change(input, { target: { value: 'TestBot' } })
    const button = screen.getByRole('button', { name: /Register Agent/i })
    fireEvent.click(button)
    expect(mockWriteContract).toHaveBeenCalledTimes(1)
    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: 'registerAgent',
        args: expect.arrayContaining(['TestBot']),
      })
    )
  })

  it('shows strategy presets and allows selection', () => {
    render(<RegisterAgentPage />)
    const arbButton = screen.getByText('Arbitrage')
    fireEvent.click(arbButton)
    // Submit with the new strategy
    const input = screen.getByPlaceholderText(/AlphaBot/)
    fireEvent.change(input, { target: { value: 'ArbBot' } })
    const button = screen.getByRole('button', { name: /Register Agent/i })
    fireEvent.click(button)
    expect(mockWriteContract).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining(['arbitrage']),
      })
    )
  })

  it('shows custom strategy input when Custom is selected', () => {
    render(<RegisterAgentPage />)
    const customBtn = screen.getByText('Custom')
    fireEvent.click(customBtn)
    expect(screen.getByPlaceholderText(/custom strategy/i)).toBeDefined()
  })

  it('shows already registered warning', async () => {
    const wagmi = await import('wagmi')
    ;(wagmi.useReadContract as any).mockReturnValue({
      data: true, // isRegistered = true
      isLoading: false,
    })
    render(<RegisterAgentPage />)
    expect(screen.getByText(/This address is already registered/i)).toBeDefined()
  })

  it('shows not connected message when wallet disconnected', async () => {
    const wagmi = await import('wagmi')
    ;(wagmi.useAccount as any).mockReturnValue({
      address: undefined,
      isConnected: false,
    })
    ;(wagmi.useReadContract as any).mockReturnValue({ data: false, isLoading: false })
    render(<RegisterAgentPage />)
    expect(screen.getByText(/Not connected/)).toBeDefined()
  })

  it('shows how it works section', () => {
    render(<RegisterAgentPage />)
    expect(screen.getByText('How it works')).toBeDefined()
    expect(screen.getByText(/33% goes to fund UBI/)).toBeDefined()
  })

  it('links back to leaderboard', () => {
    render(<RegisterAgentPage />)
    const backLink = screen.getByText('← Back to Leaderboard')
    expect(backLink.getAttribute('href')).toBe('/agents')
  })
})
