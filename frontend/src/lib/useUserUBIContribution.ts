'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { formatUnits } from 'viem'

// Types for user UBI tracking
interface UserUBIContribution {
  totalUBIContributed: number
  platformBreakdown: {
    predict: number
    stocks: number
  } | null
  monthlyContribution: {
    amount: number
    changePercent: number
  }
  expertValidationCount: number
  impactRanking: number
  isLoading: boolean
  error: string | null
}

interface UBIEvent {
  amount: bigint
  platform: 'predict' | 'stocks'
  timestamp: number
  txHash: string
}

// Contract addresses - these should match deployment addresses
const PREDICT_UBI_SPLITTER = '0x...' // TODO: Add deployed address
const STOCKS_UBI_SPLITTER = '0x...'  // TODO: Add deployed address

// Simulated data for development - replace with actual contract calls
const MOCK_USER_DATA = {
  '0x1234567890123456789012345678901234567890': {
    totalPredictUBI: 1250.75,
    totalStocksUBI: 890.25,
    monthlyPredictUBI: 320.50,
    monthlyStocksUBI: 180.25,
    expertValidations: 3,
    ranking: 47
  },
  '0x0987654321098765432109876543210987654321': {
    totalPredictUBI: 2100.50,
    totalStocksUBI: 1450.75,
    monthlyPredictUBI: 450.25,
    monthlyStocksUBI: 320.50,
    expertValidations: 7,
    ranking: 23
  }
}

/**
 * Hook to track user-specific UBI contributions across platforms
 * @param userAddress - User wallet address
 * @param platform - Platform filter ('predict', 'stocks', or 'all')
 * @returns User UBI contribution data and loading states
 */
export function useUserUBIContribution(
  userAddress: string | undefined,
  platform: 'predict' | 'stocks' | 'all' = 'all'
): UserUBIContribution {
  const [ubiEvents, setUbiEvents] = useState<UBIEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // TODO: Replace with actual contract reads when deployed
  const { data: predictUBITotal } = useReadContract({
    address: PREDICT_UBI_SPLITTER as `0x${string}`,
    abi: [
      {
        name: 'getUserUBIContribution',
        type: 'function',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ name: 'amount', type: 'uint256' }],
        stateMutability: 'view'
      }
    ],
    functionName: 'getUserUBIContribution',
    args: userAddress ? [userAddress as `0x${string}`] : undefined,
    query: { enabled: !!userAddress }
  })

  const { data: stocksUBITotal } = useReadContract({
    address: STOCKS_UBI_SPLITTER as `0x${string}`,
    abi: [
      {
        name: 'getUserUBIContribution',
        type: 'function',
        inputs: [{ name: 'user', type: 'address' }],
        outputs: [{ name: 'amount', type: 'uint256' }],
        stateMutability: 'view'
      }
    ],
    functionName: 'getUserUBIContribution',
    args: userAddress ? [userAddress as `0x${string}`] : undefined,
    query: { enabled: !!userAddress }
  })

  // Fetch user UBI contribution data
  useEffect(() => {
    if (!userAddress) {
      setUbiEvents([])
      return
    }

    setIsLoading(true)
    setError(null)

    // TODO: Replace with actual event fetching from contracts or subgraph
    // For now, simulate API call delay
    const fetchUserUBIData = async () => {
      try {
        await new Promise(resolve => setTimeout(resolve, 500))

        // Mock data lookup
        const userData = MOCK_USER_DATA[userAddress as keyof typeof MOCK_USER_DATA]
        if (!userData) {
          setUbiEvents([])
          setIsLoading(false)
          return
        }

        // Simulate events for the last 30 days
        const mockEvents: UBIEvent[] = []
        const now = Date.now()
        const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000)

        // Generate realistic event pattern
        for (let i = 0; i < 15; i++) {
          const timestamp = thirtyDaysAgo + Math.random() * (now - thirtyDaysAgo)
          const isPredictEvent = Math.random() > 0.4
          const amount = isPredictEvent
            ? BigInt(Math.floor(Math.random() * 50 * 1e18)) // Predict: 0-50 G$
            : BigInt(Math.floor(Math.random() * 20 * 1e18)) // Stocks: 0-20 G$

          mockEvents.push({
            amount,
            platform: isPredictEvent ? 'predict' : 'stocks',
            timestamp: Math.floor(timestamp / 1000),
            txHash: `0x${Math.random().toString(16).substr(2, 64)}`
          })
        }

        mockEvents.sort((a, b) => b.timestamp - a.timestamp)
        setUbiEvents(mockEvents)
      } catch (err) {
        setError('Failed to fetch UBI contribution data')
        console.error('Error fetching user UBI data:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserUBIData()
  }, [userAddress])

  // Calculate aggregated statistics
  const statistics = useMemo(() => {
    if (!userAddress) {
      return {
        totalUBIContributed: 0,
        platformBreakdown: null,
        monthlyContribution: { amount: 0, changePercent: 0 },
        expertValidationCount: 0,
        impactRanking: 0
      }
    }

    // Use mock data for development
    const userData = MOCK_USER_DATA[userAddress as keyof typeof MOCK_USER_DATA]
    if (!userData) {
      return {
        totalUBIContributed: 0,
        platformBreakdown: null,
        monthlyContribution: { amount: 0, changePercent: 0 },
        expertValidationCount: 0,
        impactRanking: 0
      }
    }

    // Calculate totals based on platform filter
    let totalUBIContributed = 0
    let platformBreakdown = null
    let monthlyAmount = 0

    if (platform === 'predict') {
      totalUBIContributed = userData.totalPredictUBI
      monthlyAmount = userData.monthlyPredictUBI
    } else if (platform === 'stocks') {
      totalUBIContributed = userData.totalStocksUBI
      monthlyAmount = userData.monthlyStocksUBI
    } else {
      totalUBIContributed = userData.totalPredictUBI + userData.totalStocksUBI
      monthlyAmount = userData.monthlyPredictUBI + userData.monthlyStocksUBI
      platformBreakdown = {
        predict: userData.totalPredictUBI,
        stocks: userData.totalStocksUBI
      }
    }

    // Calculate monthly change (simulate growth)
    const changePercent = Math.random() * 40 - 5 // -5% to +35%

    return {
      totalUBIContributed,
      platformBreakdown,
      monthlyContribution: {
        amount: monthlyAmount,
        changePercent
      },
      expertValidationCount: userData.expertValidations,
      impactRanking: userData.ranking
    }
  }, [userAddress, platform])

  return {
    ...statistics,
    isLoading,
    error
  }
}

/**
 * Hook to get expert validation status for a specific market
 * @param marketId - Market identifier
 * @returns Expert validation data
 */
export function useExpertValidation(marketId: string) {
  const [validationData, setValidationData] = useState({
    isValidated: false,
    validatorCount: 0,
    validatorAddresses: [] as string[],
    consensusReached: false,
    isLoading: true
  })

  useEffect(() => {
    if (!marketId) return

    // TODO: Replace with actual contract call
    // const fetchValidationData = async () => {
    //   try {
    //     const data = await readContract({
    //       address: PREDICT_UBI_SPLITTER,
    //       abi: predictUBISplitterABI,
    //       functionName: 'getMarketValidation',
    //       args: [marketId]
    //     })
    //     setValidationData(data)
    //   } catch (error) {
    //     console.error('Error fetching validation data:', error)
    //   }
    // }

    // Mock validation data
    setTimeout(() => {
      setValidationData({
        isValidated: Math.random() > 0.6, // 40% of markets are validated
        validatorCount: Math.floor(Math.random() * 5) + 1,
        validatorAddresses: [
          '0x1234567890123456789012345678901234567890',
          '0x0987654321098765432109876543210987654321'
        ],
        consensusReached: Math.random() > 0.3,
        isLoading: false
      })
    }, 300)
  }, [marketId])

  return validationData
}

/**
 * Hook to get impact partnership information
 * @returns Partnership data for current UBI contributions
 */
export function useImpactPartnerships() {
  const [partnerships, setPartnerships] = useState([
    {
      id: '1',
      name: 'GiveDirectly',
      description: 'Direct cash transfers to people in extreme poverty',
      impactShare: 15, // 15% of UBI goes to this partnership
      website: 'https://givedirectly.org',
      verified: true
    },
    {
      id: '2',
      name: 'Grameen Foundation',
      description: 'Financial services for the world\'s poorest families',
      impactShare: 10,
      website: 'https://grameenfoundation.org',
      verified: true
    },
    {
      id: '3',
      name: 'Against Malaria Foundation',
      description: 'Preventing deaths from malaria through net distribution',
      impactShare: 8,
      website: 'https://againstmalaria.com',
      verified: true
    }
  ])

  return {
    partnerships,
    totalPartnershipShare: partnerships.reduce((sum, p) => sum + p.impactShare, 0),
    isLoading: false
  }
}