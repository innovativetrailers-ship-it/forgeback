'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { toast } from 'sonner'

export interface CreditBalance {
  balance: number
  role: string
}

export const CREDIT_PACKS = [
  { credits: 100, priceUsd: 5, label: '100 Credits', description: 'Great for trying out' },
  {
    credits: 500,
    priceUsd: 20,
    label: '500 Credits',
    description: 'For regular creators',
    popular: true,
  },
  { credits: 2000, priceUsd: 65, label: '2,000 Credits', description: 'Power users' },
  {
    credits: 10000,
    priceUsd: 250,
    label: '10,000 Credits',
    description: 'Studios & teams',
  },
] as const

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

  return {
    balance: data?.balance ?? 0,
    role: data?.role ?? 'FREE',
    isLoading,
    purchase: purchaseMutation.mutate,
    isPurchasing: purchaseMutation.isPending,
    refetchBalance,
  }
}
