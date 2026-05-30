/**
 * C2PA (Coalition for Content Provenance and Authenticity) metadata injection.
 * Injects C2PA manifest into exported video files via FFmpeg -metadata.
 * Visible in Adobe Content Authenticity Inspect tool.
 */

export interface C2PAManifest {
  creator:    string   // user display name or email
  tool:       string   // "Cinematic Forge by INNOVATIVE"
  timestamp:  string   // ISO 8601
  contentId?: string   // unique content identifier
  aiGenerated: boolean
  modelTypes:  string[]   // ["image-to-video", "text-to-video"] etc.
}

/** Build FFmpeg -metadata args for C2PA injection */
export function buildC2PAMetadata(manifest: C2PAManifest): Record<string, string> {
  return {
    'comment':            JSON.stringify({
      '@context':         'https://c2pa.org/statements/1.0',
      'c2pa:claim': {
        'c2pa:assertions': [{
          'label':    'c2pa.ai.generative',
          'data':     {
            'ai_generated':   manifest.aiGenerated,
            'model_types':    manifest.modelTypes,
            'tool':           manifest.tool,
            'creator':        manifest.creator,
          },
        }],
        'c2pa:claim_generator': manifest.tool,
        'dc:created':           manifest.timestamp,
        'dc:creator':           manifest.creator,
      },
    }),
    'creation_time':      manifest.timestamp,
    'encoded_by':         manifest.tool,
    'DESCRIPTION':        `AI-generated content created with ${manifest.tool}`,
  }
}

/** Build FFmpeg command args string for metadata injection */
export function buildFFmpegMetadataArgs(manifest: C2PAManifest): string {
  const meta = buildC2PAMetadata(manifest)
  return Object.entries(meta)
    .map(([k, v]) => `-metadata "${k}=${v.replace(/"/g, '\\"')}"`)
    .join(' ')
}
