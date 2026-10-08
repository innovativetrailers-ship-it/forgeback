'use client'

import Link from 'next/link'

export function HeroSection() {
  return (
    <section className="relative h-screen flex items-center justify-center overflow-hidden bg-[#0d1117]">
      {/* Ambient glows */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-[#00e5c8]/6 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-violet-500/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(0,229,200,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,200,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Content */}
      <div className="relative z-10 text-center px-6 max-w-4xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#00e5c8]/20 bg-[#00e5c8]/5 mb-8">
          <span className="w-1.5 h-1.5 rounded-full bg-[#00e5c8] animate-pulse" />
          <span className="text-[#00e5c8] text-xs font-medium tracking-wider uppercase">Professional AI Film Production</span>
        </div>

        <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-white mb-4 leading-none">
          Cinematic<br />
          <span className="text-[#00e5c8]">Forge</span>
        </h1>

        <p className="text-sm text-[#00e5c8]/70 font-medium tracking-[0.3em] uppercase mb-6">
          by INNOVATIVE
        </p>

        <p className="text-lg md:text-xl text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed">
          Professional timeline editing, a full colour suite, node compositing, and studio audio — one app.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="px-8 py-3.5 rounded-lg bg-[#00e5c8] text-[#0d1117] font-bold text-sm hover:bg-[#00e5c8]/90 transition-all hover:shadow-[0_0_30px_rgba(0,229,200,0.3)]"
          >
            Start Free Trial
          </Link>
          <Link
            href="/login"
            className="px-8 py-3.5 rounded-lg border border-[#00e5c8]/40 text-[#00e5c8] font-semibold text-sm hover:bg-[#00e5c8]/8 hover:border-[#00e5c8]/70 transition-all"
          >
            Sign In
          </Link>
        </div>

        <p className="mt-6 text-xs text-gray-600">
          No credit card required for free trial &middot; 50 credits included
        </p>

        {/* Mode badges */}
        <div className="flex items-center justify-center gap-3 mt-12">
          {['Simple Mode', 'Advanced Mode', 'Ultimate Mode'].map((m) => (
            <span key={m} className="px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-400">
              {m}
            </span>
          ))}
        </div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-[#0d1117] to-transparent pointer-events-none" />
    </section>
  )
}
