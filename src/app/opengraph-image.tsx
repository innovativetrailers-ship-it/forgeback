import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'CINÉMA — AI Film Production Platform'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #0a0a0a 0%, #1a0a2e 50%, #0a0a1a 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          position: 'relative',
        }}
      >
        {/* Decorative glow */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 600,
            height: 400,
            background: 'radial-gradient(ellipse, rgba(147,51,234,0.3) 0%, transparent 70%)',
            borderRadius: '50%',
          }}
        />

        {/* Film strip accent */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 40,
          }}
        >
          {[...Array(7)].map((_, i) => (
            <div
              key={i}
              style={{
                width: 24,
                height: 24,
                background: 'rgba(147,51,234,0.6)',
                borderRadius: 4,
              }}
            />
          ))}
        </div>

        {/* Brand */}
        <div
          style={{
            fontSize: 96,
            fontWeight: 700,
            color: 'white',
            letterSpacing: '-0.04em',
            marginBottom: 16,
            textShadow: '0 0 80px rgba(147,51,234,0.8)',
          }}
        >
          CINÉMA
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 28,
            color: 'rgba(200,160,255,0.9)',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: 48,
          }}
        >
          AI Film Production Platform
        </div>

        {/* Model badges */}
        <div style={{ display: 'flex', gap: 12 }}>
          {['Script', 'Timeline', 'Cast', 'Sound', 'Export'].map((model) => (
            <div
              key={model}
              style={{
                background: 'rgba(147,51,234,0.2)',
                border: '1px solid rgba(147,51,234,0.4)',
                borderRadius: 20,
                padding: '8px 20px',
                color: 'rgba(220,180,255,0.9)',
                fontSize: 18,
              }}
            >
              {model}
            </div>
          ))}
        </div>

        {/* URL */}
        <div
          style={{
            position: 'absolute',
            bottom: 40,
            color: 'rgba(255,255,255,0.4)',
            fontSize: 18,
            letterSpacing: '0.1em',
          }}
        >
          cinema.growthengine.ai
        </div>
      </div>
    ),
    { ...size }
  )
}
