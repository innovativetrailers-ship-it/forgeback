import {
  Film, Layers, Wand2, Music, Users, Globe,
  Sparkles, Zap, Shield, MonitorPlay,
} from 'lucide-react'

const FEATURES = [
  {
    icon: Sparkles,
    title: 'Multi-Engine Generation',
    description: 'One prompt can be sent to more than one engine and cut into a single clip.',
  },
  {
    icon: Film,
    title: 'Full Film Production',
    description: 'Fountain script parser, AI Director, continuity checker, and DCP export for cinema delivery.',
  },
  {
    icon: Layers,
    title: 'Pro Timeline Editor',
    description: 'Multi-track editing, trim handles, razor cuts, transitions, and frame-accurate repaint.',
  },
  {
    icon: Users,
    title: 'Character Vault',
    description: 'Upload face references — we train a LoRA and lock the character across every scene.',
  },
  {
    icon: Wand2,
    title: 'VFX & CGI',
    description: 'Green screen compositing, depth-based CGI insertion, IC-Light relighting, and a 25-node compositor.',
  },
  {
    icon: Music,
    title: 'Audio Pipeline',
    description: 'AI music, voice cloning, ElevenLabs TTS, foley generation, and Dolby Atmos prep.',
  },
  {
    icon: Globe,
    title: 'Auto Translation',
    description: '29-language auto-dub and subtitle with lip-sync matching and Overdub word-level edit.',
  },
  {
    icon: MonitorPlay,
    title: 'Social Publishing',
    description: 'Auto-reframe for vertical, square, and widescreen. Schedule and publish from one place.',
  },
  {
    icon: Shield,
    title: 'Knowledge Firewall',
    description: 'All prompts sanitised through domain-specific databases — no model leakage, no hallucinations.',
  },
  {
    icon: Zap,
    title: 'Smart Processing',
    description: 'Omnichannel processing engines select the best model for every segment of every clip.',
  },
]

export function FeaturesSection() {
  return (
    <section className="py-24 px-6 bg-[#0d1117]">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Everything in one forge
          </h2>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Replace 6 subscriptions with one platform that does it all, better.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {FEATURES.map((feat) => {
            const Icon = feat.icon
            return (
              <div
                key={feat.title}
                className="p-5 rounded-xl bg-[#0f1520] border border-[#1a2030] hover:border-[#00e5c8]/20 transition-colors group"
              >
                <div className="w-9 h-9 rounded-lg bg-[#00e5c8]/10 flex items-center justify-center mb-4 group-hover:bg-[#00e5c8]/15 transition-colors">
                  <Icon size={18} className="text-[#00e5c8]" />
                </div>
                <h3 className="text-white font-semibold text-sm mb-2">{feat.title}</h3>
                <p className="text-gray-500 text-xs leading-relaxed">{feat.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
