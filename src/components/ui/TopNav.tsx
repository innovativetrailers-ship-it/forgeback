'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useSession, signOut } from 'next-auth/react'
import { useCredits } from '@/hooks/useCredits'
import { CreditPurchaseModal } from './CreditPurchaseModal'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { Hexagon, LogOut, Settings, CreditCard, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { JobProgressBadge } from './JobProgressBadge'
import { useStudioStore, type AppMode, type OutcomeTier } from '@/store/editor'

const MODES: Array<{ label: string; href: string; mode: AppMode }> = [
  { label: 'Simple',   href: '/simple',   mode: 'simple' },
  { label: 'Advanced', href: '/advanced', mode: 'advanced' },
  { label: 'Ultimate', href: '/ultimate', mode: 'ultimate' },
]

const TIERS: Array<{ label: string; value: OutcomeTier; description: string }> = [
  { label: 'Draft',       value: 'Draft',       description: 'Fast & cheap' },
  { label: 'Studio',      value: 'Studio',      description: 'Balanced' },
  { label: 'Blockbuster', value: 'Blockbuster', description: 'Max quality' },
]

export function TopNav() {
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const { balance, isLoading: creditsLoading } = useCredits()
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const { mode, setMode, activeTier, setTier } = useStudioStore()

  // Keep store mode in sync with the current route
  useEffect(() => {
    const matched = MODES.find((m) => pathname.startsWith(m.href))
    if (matched && matched.mode !== mode) setMode(matched.mode)
  }, [pathname, mode, setMode])

  const user = session?.user
  const initials = user?.name
    ? user.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?'

  return (
    <>
      <header className="h-11 shrink-0 border-b border-border/30 bg-[#0c0c10]/95 backdrop-blur-sm flex items-center px-4 gap-4 z-50">
        {/* Logo */}
        <Link
          href="/simple"
          className="text-sm font-bold tracking-[0.15em] text-foreground hover:text-[#00e5c8] transition-colors shrink-0"
        >
          CINÉMA
        </Link>

        {/* Mode switcher */}
        <nav className="flex items-center gap-0.5 flex-1 justify-center">
          {MODES.map((m) => {
            const active = mode === m.mode
            return (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setMode(m.mode)}
                className={cn(
                  'relative px-4 py-1.5 rounded-md text-xs font-medium transition-all',
                  active
                    ? 'text-foreground bg-white/[0.06]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
                )}
              >
                {m.label}
                {active && (
                  <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] rounded-full bg-[#00f0d5]" />
                )}
              </Link>
            )
          })}

          {/* Tier selector — only visible in advanced/ultimate */}
          {(mode === 'advanced' || mode === 'ultimate') && (
            <div className="flex items-center gap-0.5 ml-3 pl-3 border-l border-border/30">
              {TIERS.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTier(t.value)}
                  title={t.description}
                  className={cn(
                    'relative px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                    activeTier === t.value
                      ? 'text-[#00e5c8] bg-[#00e5c8]/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.03]'
                  )}
                >
                  {t.label}
                  {activeTier === t.value && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-[2px] rounded-full bg-[#00f0d5]" />
                  )}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Job progress */}
          <JobProgressBadge />

          {/* Credit balance */}
          {status === 'authenticated' && (
            <button
              onClick={() => setPurchaseOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#00e5c8]/10 border border-[#00e5c8]/20 hover:bg-[#00e5c8]/15 transition-colors"
            >
              <Hexagon className="w-3.5 h-3.5 text-[#00e5c8] fill-teal-400/20" />
              {creditsLoading ? (
                <Loader2 className="w-3 h-3 animate-spin text-[#00e5c8]" />
              ) : (
                <span className="text-xs font-semibold text-[#00e5c8] tabular-nums">
                  {balance.toLocaleString()}
                </span>
              )}
            </button>
          )}

          {/* User avatar dropdown */}
          {status === 'authenticated' && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-full ring-1 ring-border/40 hover:ring-[#00e5c8]/20 transition-all outline-none">
                <Avatar className="w-7 h-7">
                  {user.image && <AvatarImage src={user.image} alt={user.name ?? ''} />}
                  <AvatarFallback className="bg-[#00e5c8]/10 text-[#00e5c8] text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-56 bg-[#0f0f14] border-border/40"
              >
                <div className="px-3 py-2 space-y-0.5">
                  <p className="text-sm font-medium text-foreground truncate">
                    {user.name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 mt-1 border-[#00e5c8]/30 text-[#00e5c8]">
                    {(user as { role?: string }).role ?? 'FREE'}
                  </Badge>
                </div>
                <DropdownMenuSeparator className="bg-border/30" />
                <DropdownMenuItem
                  onClick={() => setPurchaseOpen(true)}
                  className="gap-2 text-sm cursor-pointer"
                >
                  <CreditCard className="w-4 h-4" />
                  Buy credits
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 text-sm cursor-pointer">
                  <Settings className="w-4 h-4" />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border/30" />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: '/login' })}
                  className="gap-2 text-sm text-destructive cursor-pointer focus:text-destructive"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : status === 'unauthenticated' ? (
            <Link
              href="/login"
              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </Link>
          ) : null}
        </div>
      </header>

      <CreditPurchaseModal open={purchaseOpen} onOpenChange={setPurchaseOpen} />
    </>
  )
}
