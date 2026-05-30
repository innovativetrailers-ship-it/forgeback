/**
 * Social Publisher — direct publishing to TikTok, Instagram, YouTube.
 * Handles OAuth token retrieval from DB and platform-specific APIs.
 */

import { db } from '@/lib/db'

export type SocialPlatform = 'tiktok' | 'instagram' | 'youtube'

export interface PublishParams {
  userId:      string
  videoUrl:    string
  title:       string
  description: string
  hashtags?:   string[]
  platforms:   SocialPlatform[]
  scheduleAt?: Date   // undefined = publish immediately
}

export interface PlatformResult {
  platform:   SocialPlatform
  success:    boolean
  postId?:    string
  postUrl?:   string
  error?:     string
}

export interface PublishResult {
  results:    PlatformResult[]
  succeeded:  number
  failed:     number
}

/** Look up stored OAuth token for a user + platform */
async function getToken(userId: string, platform: SocialPlatform): Promise<string | null> {
  const conn = await db.socialConnection.findFirst({
    where: { userId, platform, active: true },
    orderBy: { updatedAt: 'desc' },
  })
  return conn?.accessToken ?? null
}

async function publishToTikTok(params: {
  token:       string
  videoUrl:    string
  title:       string
  description: string
  hashtags:    string[]
}): Promise<PlatformResult> {
  const caption = [
    params.description,
    ...params.hashtags.map(h => (h.startsWith('#') ? h : `#${h}`)),
  ].join(' ')

  // TikTok Creator API v2 — direct_post
  const res = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
    method:  'POST',
    headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json; charset=UTF-8' },
    body:    JSON.stringify({
      post_info: { title: params.title, privacy_level: 'PUBLIC_TO_EVERYONE', disable_comment: false },
      source_info: { source: 'PULL_FROM_URL', video_url: params.videoUrl },
    }),
  })

  const data = await res.json() as { data?: { publish_id: string }; error?: { message: string } }

  if (!res.ok || data.error) {
    return { platform: 'tiktok', success: false, error: data.error?.message ?? 'TikTok publish failed' }
  }

  return {
    platform: 'tiktok',
    success:  true,
    postId:   data.data?.publish_id,
    postUrl:  `https://www.tiktok.com/@me/video/${data.data?.publish_id}`,
  }
}

async function publishToInstagram(params: {
  token:       string
  videoUrl:    string
  caption:     string
}): Promise<PlatformResult> {
  // Step 1: Create media container
  const containerRes = await fetch(
    `https://graph.instagram.com/v19.0/me/media?video_url=${encodeURIComponent(params.videoUrl)}&caption=${encodeURIComponent(params.caption)}&media_type=REELS&access_token=${params.token}`,
    { method: 'POST' },
  )
  const container = await containerRes.json() as { id?: string; error?: { message: string } }
  if (!containerRes.ok || !container.id) {
    return { platform: 'instagram', success: false, error: container.error?.message ?? 'IG container failed' }
  }

  // Step 2: Publish
  const publishRes = await fetch(
    `https://graph.instagram.com/v19.0/me/media_publish?creation_id=${container.id}&access_token=${params.token}`,
    { method: 'POST' },
  )
  const published = await publishRes.json() as { id?: string; error?: { message: string } }

  if (!publishRes.ok || !published.id) {
    return { platform: 'instagram', success: false, error: published.error?.message ?? 'IG publish failed' }
  }

  return { platform: 'instagram', success: true, postId: published.id }
}

async function publishToYouTube(params: {
  token:       string
  videoUrl:    string
  title:       string
  description: string
}): Promise<PlatformResult> {
  // YouTube Data API v3 — resumable upload
  // For URL-based videos, we first need to fetch and re-upload
  const metadataRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method:  'POST',
    headers: { Authorization: `Bearer ${params.token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      snippet: { title: params.title, description: params.description, categoryId: '22' },
      status:  { privacyStatus: 'public' },
    }),
  })

  if (!metadataRes.ok) {
    const err = await metadataRes.text()
    return { platform: 'youtube', success: false, error: `YouTube upload init failed: ${err}` }
  }

  const uploadUrl = metadataRes.headers.get('Location')
  if (!uploadUrl) return { platform: 'youtube', success: false, error: 'No upload URL from YouTube' }

  // Fetch video and stream to YouTube
  const videoRes = await fetch(params.videoUrl)
  const videoBuffer = await videoRes.arrayBuffer()

  const uploadRes = await fetch(uploadUrl, {
    method:  'PUT',
    headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(videoBuffer.byteLength) },
    body:    videoBuffer,
  })

  const uploaded = await uploadRes.json() as { id?: string; error?: { message: string } }

  if (!uploadRes.ok || !uploaded.id) {
    return { platform: 'youtube', success: false, error: uploaded.error?.message ?? 'YT upload failed' }
  }

  return {
    platform: 'youtube',
    success:  true,
    postId:   uploaded.id,
    postUrl:  `https://www.youtube.com/watch?v=${uploaded.id}`,
  }
}

export async function publishToSocial(params: PublishParams): Promise<PublishResult> {
  const { userId, videoUrl, title, description, hashtags = [], platforms } = params
  const results: PlatformResult[] = []

  for (const platform of platforms) {
    const token = await getToken(userId, platform)

    if (!token) {
      results.push({ platform, success: false, error: `${platform} not connected` })
      continue
    }

    try {
      let result: PlatformResult

      if (platform === 'tiktok') {
        result = await publishToTikTok({ token, videoUrl, title, description, hashtags })
      } else if (platform === 'instagram') {
        const caption = [description, ...hashtags.map(h => `#${h}`)].join(' ')
        result = await publishToInstagram({ token, videoUrl, caption })
      } else {
        result = await publishToYouTube({ token, videoUrl, title, description })
      }

      results.push(result)
    } catch (err) {
      results.push({ platform, success: false, error: err instanceof Error ? err.message : 'Unknown error' })
    }
  }

  return {
    results,
    succeeded: results.filter(r => r.success).length,
    failed:    results.filter(r => !r.success).length,
  }
}
