import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface BrandLogoProps {
  size?: number
  showWordmark?: boolean
  wordmark?: string
  href?: string
  className?: string
  /** Solid black plate behind the mark — use on auth pages so transparent PNG edges blend. */
  onBlack?: boolean
}

export const BrandLogo = ({
  size = 36,
  showWordmark = true,
  wordmark = 'Cinematic Forge',
  href,
  className,
  onBlack = false,
}: BrandLogoProps) => {
  const image = (
    <Image
      src="/brand/logo.png"
      alt="Cinematic Forge"
      width={size}
      height={size}
      className={cn(
        'object-contain h-auto w-full',
        onBlack ? 'bg-black' : 'drop-shadow-[0_0_20px_rgba(255,120,40,0.3)]',
      )}
      style={{ maxWidth: size, height: 'auto' }}
      priority
    />
  )

  const content = (
    <div className={cn('flex items-center gap-2.5', className)}>
      {onBlack ? (
        <div
          className="inline-flex w-full items-center justify-center rounded-2xl bg-black p-1"
          style={{ maxWidth: size }}
        >
          {image}
        </div>
      ) : (
        image
      )}
      {showWordmark && (
        <span className="text-sm font-bold tracking-[0.12em] text-[var(--teal-bright,#00e5c8)]">
          {wordmark}
        </span>
      )}
    </div>
  )

  if (href) {
    return (
      <Link href={href} className="hover:opacity-90 transition-opacity shrink-0">
        {content}
      </Link>
    )
  }

  return content
}
