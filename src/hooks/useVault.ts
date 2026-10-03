'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { VaultCharacter } from '@/store/vault'

export function useVault(projectId: string | null) {
  const queryClient = useQueryClient()

  const { data: characters, isLoading } = useQuery<VaultCharacter[]>({
    queryKey: ['vault', 'characters', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/vault/character/list?projectId=${projectId}`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to fetch characters')
      return res.json() as Promise<VaultCharacter[]>
    },
    enabled: !!projectId,
  })

  const createCharacter = useMutation({
    mutationFn: async (data: FormData) => {
      const res = await fetch('/api/vault/character/create', {
        method: 'POST',
        body: data,
      })
      if (!res.ok) throw new Error('Failed to create character')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vault', 'characters', projectId] })
    },
  })

  return {
    characters: characters ?? [],
    isLoading,
    createCharacter: createCharacter.mutate,
    isCreating: createCharacter.isPending,
  }
}
