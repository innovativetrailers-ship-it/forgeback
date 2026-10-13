'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useCredits, CREDIT_PACKS } from '@/hooks/useCredits'
import { Loader2, Zap, Hexagon } from 'lucide-react'

interface CreditPurchaseModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreditPurchaseModal({ open, onOpenChange }: CreditPurchaseModalProps) {
  const { balance, role, purchase, isPurchasing } = useCredits()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg bg-[#0f0f14] border-border/40">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#00e5c8]" />
            Get More Credits
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            Current balance:{' '}
            <span className="text-[#00e5c8] font-semibold">
              {balance.toLocaleString()} credits
            </span>{' '}
            · Plan:{' '}
            <span className="capitalize text-foreground font-medium">
              {role.toLowerCase()}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-2">
          {CREDIT_PACKS.map((pack, i) => (
            <button
              key={i}
              onClick={() => purchase(i)}
              disabled={isPurchasing}
              className={`relative flex flex-col gap-2 p-4 rounded-xl border text-left transition-all
                ${'popular' in pack && pack.popular
                    ? 'border-[#00e5c8]/50 bg-[#00e5c8]/5 hover:bg-[#00e5c8]/10'
                    : 'border-border/40 bg-white/[0.02] hover:bg-white/[0.04]'
                }
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {'popular' in pack && pack.popular && (
                <Badge className="absolute top-3 right-3 bg-[#00e5c8] text-black text-[10px] px-1.5 py-0 font-bold">
                  POPULAR
                </Badge>
              )}

              <div className="flex items-center gap-1.5 text-[#00e5c8]">
                <Hexagon className="w-4 h-4 fill-teal-400/20" />
                <span className="text-lg font-bold">
                  {pack.credits.toLocaleString()}
                </span>
              </div>

              <div>
                <div className="text-sm font-semibold text-foreground">
                  ${pack.priceAud}
                  <span className="text-xs text-muted-foreground font-normal ml-1">
                    AUD
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {pack.description}
                </div>
              </div>

              <div className="text-[10px] text-muted-foreground/60">
                ${((pack.priceAud / pack.credits) * 100).toFixed(1)}¢ per credit
              </div>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-center gap-2 pt-2">
          {isPurchasing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Redirecting to checkout…
            </div>
          )}
        </div>

        <div className="border-t border-border/20 pt-4 text-xs text-muted-foreground/60 text-center">
          Secure checkout via Stripe. Credits are added instantly after payment.
        </div>
      </DialogContent>
    </Dialog>
  )
}
