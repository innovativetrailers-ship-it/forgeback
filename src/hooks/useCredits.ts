'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'
import { CREDIT_PACKS as PACK_CATALOG } from '@cinema/core'

export interface CreditBalance {
  credits:            number
  balance:            number   // alias for credits — kept for backwards compatibility
  role:               string
  isAdmin:            boolean
  unlimited:          boolean
  subscriptionStatus: string
  tier:               string
}

export const CREDIT_PACKS = PACK_CATALOG.map((pack) => ({
  ...pack,
  priceAud: pack.priceAudCents / 100,
  description: pack.popular ? 'Most chosen' : 'Credit pack',
}))

export function useCredits() {
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<CreditBalance>({
    queryKey: ['credits', 'balance'],
    queryFn: async () => {
      const res = await fetch('/api/credits/balance', { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch balance')
      return res.json()
    },
    enabled: !!session?.user,
    refetchInterval: 30_000,
    retry: false,
  })

  const purchaseMutation = useMutation({
    mutationFn: async (packIndex: number) => {
      const res = await fetch('/api/credits/purchase', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packIndex }),
      })
      if (!res.ok) throw new Error('Failed to create checkout session')
      const { url } = await res.json()
      return url as string
    },
    onSuccess: (url) => {
      window.location.href = url
    },
    onError: () => {
      toast.error('Failed to start purchase. Please try again.')
    },
  })

  function refetchBalance() {
    queryClient.invalidateQueries({ queryKey: ['credits', 'balance'] })
  }

  const credits = data?.credits ?? data?.balance ?? 0

  return {
    balance:            credits,
    credits,
    isAdmin:            data?.isAdmin    ?? false,
    unlimited:          data?.unlimited  ?? false,
    subscriptionStatus: data?.subscriptionStatus ?? 'free',
    tier:               data?.tier       ?? 'free',
    role:               data?.role       ?? 'FREE',
    isLoading,
    purchase:           purchaseMutation.mutate,
    isPurchasing:       purchaseMutation.isPending,
    refetchBalance,
  }
}
