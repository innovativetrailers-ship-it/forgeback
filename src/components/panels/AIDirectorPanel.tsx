'use client'

import { useState } from 'react'
import { toast } from '@/lib/toast'

const STYLES = ['Noir Thriller', 'Epic Action', 'Drama', 'Documentary', 'Sci-Fi', 'Horror', 'Comedy', 'Romantic', 'Western', 'Surreal']

export function AIDirectorPanel() {
  const [brief, setBrief] = useState('')
  const [style, setStyle] = useState('Drama')
  const [loading, setLoading] = useState(false)

  const handleDirect = () => {
    if (!brief.trim()) { toast.error('Enter a creative brief first'); return }
    toast.error('Direct runs inside a project. Open the film and use Direct This Film there.')
  }

  return (
    <div style={{ padding: '12px', color: '#e8edf5', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '10px', color: '#4a5a78', fontWeight: 700, letterSpacing: '0.7px' }}>
        AI DIRECTOR
      </div>

      <div>
        <div style={{ fontSize: '10px', color: '#8a9bbf', marginBottom: '4px' }}>Creative brief</div>
        <textarea
          value={brief}
          onChange={e => setBrief(e.target.value)}
          rows={4}
          placeholder="Genre, tone, characters, premise, mood…"
          style={{
            width: '100%', background: '#1e2636', border: '1px solid #2a3a58',
            borderRadius: '6px', padding: '8px', color: '#e8edf5', fontSize: '12px',
            resize: 'vertical', boxSizing: 'border-box', outline: 'none',
          }}
        />
      </div>

      <div>
        <div style={{ fontSize: '10px', color: '#8a9bbf', marginBottom: '4px' }}>Style</div>
        <select
          value={style}
          onChange={e => setStyle(e.target.value)}
          style={{
            width: '100%', background: '#1e2636', border: '1px solid #2a3a58',
            color: '#e8edf5', borderRadius: '4px', padding: '6px', fontSize: '11px', boxSizing: 'border-box',
          }}
        >
          {STYLES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <button
        onClick={handleDirect}
        disabled={loading}
        style={{
          width: '100%', padding: '9px',
          background: loading ? 'rgba(0,229,200,0.4)' : '#00e5c8',
          color: '#03080e', fontWeight: 700,
          border: 'none', borderRadius: '6px', cursor: loading ? 'not-allowed' : 'pointer', fontSize: '12px',
        }}
      >
        {loading ? 'Directing…' : 'Direct This Film'}
      </button>

      <div style={{ borderTop: '1px solid #2a3a58', paddingTop: '10px' }}>
        <div style={{ fontSize: '10px', color: '#4a5a78', fontWeight: 700, letterSpacing: '0.7px', marginBottom: '6px' }}>
          DIRECTOR NOTES
        </div>
        <div style={{ fontSize: '11px', color: '#4a5a78', lineHeight: 1.6 }}>
          Describe your vision and the AI Director will decompose it into scene-by-scene instructions, shot lists, and model assignments.
        </div>
      </div>
    </div>
  )
}
