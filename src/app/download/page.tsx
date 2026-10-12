'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Monitor, Apple, Lock, Cpu, Palette, Music, Layers,
  Users, Star, Zap, Shield, Globe, Film,
} from 'lucide-react'
import { useUserTier } from '@/hooks/useUserTier'
import { UpgradeModal } from '@/components/ui/UpgradeModal'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { TopBar } from '@/components/layout/TopBar'
interface ReleaseApiResponse {
  version: string | null
  available: boolean
  macNotarized?: boolean
  windowsSigned?: boolean
  verifiedAt?: string | null
  message?: string
  downloads: {
    mac_arm: string
    mac_intel: string
    windows: string
  }
}

const BLOG_FEATURES = [
  {
    icon: <Film className="w-5 h-5" />,
    title: 'Professional timeline editor',
    desc: 'Unlimited tracks, proxy workflows, and import for MP4, MOV, WebM, MXF, HEVC, and AV1.',
  },
  {
    icon: <Palette className="w-5 h-5" />,
    title: 'Colour suite',
    desc: 'Node-based grading with ACES/OCIO, qualifiers, windows, shot match, and HDR nit targeting up to 10,000 nits.',
  },
  {
    icon: <Layers className="w-5 h-5" />,
    title: 'Node compositor',
    desc: '28 blend modes, rotoscoping, planar tracking, grade effects, and text-to-effect generation.',
  },
  {
    icon: <Music className="w-5 h-5" />,
    title: 'Studio audio mixer',
    desc: 'Unlimited tracks, stem separation, surround layouts, a spectrum EQ, and a mastering chain.',
  },
  {
    icon: <Users className="w-5 h-5" />,
    title: 'ForgeFlow production tracking',
    desc: 'Shot management, scheduling, budget reports, and bidirectional timeline linking.',
  },
  {
    icon: <Globe className="w-5 h-5" />,
    title: 'ForgeReview',
    desc: 'Timestamped annotations, approval workflows, and client portal links.',
  },
  {
    icon: <Zap className="w-5 h-5" />,
    title: 'AI Generation Studio — 21 Models + Cognitive Director',
    desc: 'Full model pool with intent modeling, Reflexion critique, and character consistency pipeline.',
  },
  {
    icon: <Shield className="w-5 h-5" />,
    title: 'Offline-First. Enterprise Secure.',
    desc: 'Projects in local SQLite .cfp files. API keys in OS keychain. Edit without internet.',
  },
  {
    icon: <Cpu className="w-5 h-5" />,
    title: 'Native Desktop Performance',
    desc: 'Electron 34 + WebGPU. Local FFmpeg export on your hardware — no cloud queue.',
  },
]

function detectPlatform(): 'mac' | 'windows' | 'unknown' {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent.toLowerCase()
  if (ua.includes('mac')) return 'mac'
  if (ua.includes('win')) return 'windows'
  return 'unknown'
}

export default function DownloadPage() {
  const { canDownload } = useUserTier()
  const [platform, setPlatform] = useState<'mac' | 'windows' | 'unknown'>('unknown')
  const [releaseInfo, setReleaseInfo] = useState<ReleaseApiResponse | null>(null)

  useEffect(() => { setPlatform(detectPlatform()) }, [])

  useEffect(() => {
    let cancelled = false
    void fetch('/api/desktop/releases', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ReleaseApiResponse | null) => {
        if (!cancelled && data) setReleaseInfo(data)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen bg-[#070d1a] text-white flex flex-col">
      <TopBar />
      <div className="flex-1 overflow-y-auto">
      <div className="border-b border-white/8">
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <BrandLogo size={96} showWordmark={false} className="justify-center mb-4" />
          <h1 className="text-4xl font-bold mb-1">Cinematic Forge</h1>
          <p className="text-sm uppercase tracking-[0.2em] text-[#00e5c8]/80 mb-3">Forge Extreme Desktop</p>
          <p className="text-xl text-gray-400 mb-2">The Professional Desktop Studio</p>
          <p className="text-sm text-gray-500 max-w-2xl mx-auto mb-8">
            Professional timeline editing, a full colour suite, node compositing, and studio audio — one desktop app. Included with Ultimate.
          </p>

          {canDownload ? (
            releaseInfo && !releaseInfo.available ? (
              <div className="max-w-lg mx-auto rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-100/90">
                <p className="font-semibold text-amber-200 mb-1">Installers not published yet</p>
                <p className="text-amber-100/70 leading-relaxed">
                  {releaseInfo.message ?? 'Desktop builds are being prepared. Check back soon or contact support.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                {(platform === 'mac' || platform === 'unknown') && releaseInfo?.macNotarized && (
                  <>
                    <a
                      href={releaseInfo.downloads.mac_arm}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[#00e5c8] text-black font-bold hover:bg-[#00f0d5] transition"
                    >
                      <Apple className="w-5 h-5" />
                      Download for Mac — Apple Silicon
                    </a>
                    <a
                      href={releaseInfo.downloads.mac_intel}
                      className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 hover:bg-white/5 transition"
                    >
                      <Apple className="w-5 h-5" />
                      Mac — Intel
                    </a>
                  </>
                )}
                {(platform === 'windows' || platform === 'unknown') && releaseInfo?.windowsSigned && (
                  <a
                    href={releaseInfo.downloads.windows}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl border border-white/20 hover:bg-white/5 transition"
                  >
                    <Monitor className="w-5 h-5" />
                    Download for Windows
                  </a>
                )}
                {!releaseInfo && (
                  <p className="text-sm text-gray-500">Checking release availability…</p>
                )}
                {releaseInfo && !releaseInfo.macNotarized && (platform === 'mac' || platform === 'unknown') && (
                  <p className="text-sm text-gray-400">The Mac app is being prepared — signed builds are coming. Use the web app meanwhile.</p>
                )}
                {releaseInfo && !releaseInfo.windowsSigned && (platform === 'windows' || platform === 'unknown') && (
                  <p className="text-sm text-gray-400">The Windows app is being prepared — signed builds are coming. Use the web app meanwhile.</p>
                )}
              </div>
            )
          ) : (
            <div className="flex flex-col items-center gap-4">
              <div className="flex items-center gap-2 text-gray-500">
                <Lock className="w-5 h-5" />
                <span>Download requires Ultimate subscription or Dev Account</span>
              </div>
              <Link
                href="/upgrade"
                className="px-8 py-3 rounded-xl bg-[#00e5c8] text-black font-bold hover:bg-[#00f0d5] transition"
              >
                Upgrade to Ultimate
              </Link>
            </div>
          )}

          {canDownload && releaseInfo?.available && releaseInfo.version && (
            <p className="text-[11px] text-gray-600 mt-4">
              Version {releaseInfo.version} · macOS 13+ · Windows 10/11 x64
            </p>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <h2 className="text-2xl font-bold mb-2">What&apos;s inside Forge Extreme</h2>
        <p className="text-gray-400 text-sm mb-10">Every tool a professional production needs.</p>
        <div className="space-y-10">
          {BLOG_FEATURES.map((f) => (
            <div key={f.title} className="flex gap-5">
              <div className="w-10 h-10 rounded-xl bg-[#00e5c8]/10 border border-[#00e5c8]/20 flex items-center justify-center flex-shrink-0 text-[#00e5c8]">
                {f.icon}
              </div>
              <div>
                <h3 className="font-bold text-base mb-2">{f.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10 border-t border-white/8">
        <h2 className="text-lg font-bold mb-4">System Requirements</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div>
            <p className="font-semibold text-[#00e5c8] mb-2 flex items-center gap-2">
              <Apple className="w-4 h-4" /> macOS
            </p>
            <ul className="space-y-1 text-gray-400">
              <li>macOS 13 Ventura or later</li>
              <li>Apple Silicon (arm64) recommended</li>
              <li>Intel (x86_64) supported</li>
              <li>16GB RAM recommended</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-[#00e5c8] mb-2 flex items-center gap-2">
              <Monitor className="w-4 h-4" /> Windows
            </p>
            <ul className="space-y-1 text-gray-400">
              <li>Windows 10 or 11</li>
              <li>x64 architecture</li>
              <li>DirectX 12 compatible GPU</li>
              <li>16GB RAM recommended</li>
            </ul>
          </div>
        </div>
      </div>

      {!canDownload && (
        <div className="border-t border-white/8">
          <div className="max-w-4xl mx-auto px-6 py-12 text-center">
            <h2 className="text-2xl font-bold mb-3">Get Forge Extreme with Ultimate</h2>
            <p className="text-gray-400 mb-6">One subscription. Replace $6,000+ in annual software costs.</p>
            <Link
              href="/upgrade"
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-[#00e5c8] text-black font-bold hover:bg-[#00f0d5] transition"
            >
              <Star className="w-4 h-4" />
              Upgrade to Ultimate — $99/mo
            </Link>
          </div>
        </div>
      )}

      <UpgradeModal />
      </div>
    </div>
  )
}
