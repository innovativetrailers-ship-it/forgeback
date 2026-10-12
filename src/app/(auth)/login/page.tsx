import { LoginForm } from '@/components/auth/LoginForm'
import { Suspense } from 'react'

export default function LoginPage() {
  return (
    <div className="min-h-screen flex">
      {/* Left panel — branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gradient-to-br from-[#0c0c10] via-[#111118] to-[#0c0c10] items-center justify-center overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#00e5c8]/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 px-16 space-y-8 max-w-lg">
          <div className="space-y-4">
            <div className="text-5xl font-bold tracking-tight">
              <span className="text-foreground">CINÉMA</span>
            </div>
            <p className="text-xl text-muted-foreground leading-relaxed">
              The world&apos;s most advanced AI film &amp; video production platform.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: '⚡', text: 'Generate cinematic video from a single prompt' },
              { icon: '🎬', text: 'Multi-track timeline editor with AI assistance' },
              { icon: '🎨', text: 'Film-grade colour science and VFX compositor' },
              { icon: '🤖', text: 'AI Director that writes and produces full films' },
            ].map((feature) => (
              <div key={feature.text} className="flex items-start gap-3">
                <span className="text-lg shrink-0 mt-0.5">{feature.icon}</span>
                <span className="text-sm text-muted-foreground">{feature.text}</span>
              </div>
            ))}
          </div>

          <div className="pt-4 border-t border-border/20">
            <p className="text-xs text-muted-foreground/60">
              Trusted by filmmakers, creators and studios worldwide
            </p>
          </div>
        </div>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-black">
        <div className="w-full max-w-md">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
