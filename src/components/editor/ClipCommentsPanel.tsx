'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useEditorStore } from '@/store/editor'
import { useEditorRecipeView } from '@/lib/timeline/to-editor-recipe'
import { MessageSquare, CheckSquare, CornerDownRight } from 'lucide-react'

interface CommentReply {
  id: string
  authorId: string
  timecode: number
  text: string
  resolved: boolean
  createdAt: string
}

interface Comment extends CommentReply {
  replies: CommentReply[]
}

function parseAtMentions(text: string): (string | React.ReactNode)[] {
  const parts = text.split(/(@\w+)/g)
  return parts.map((p, i) =>
    p.startsWith('@')
      ? <span key={i} className="text-[#00e5c8] font-medium">{p}</span>
      : p,
  )
}

export function ClipCommentsPanel() {
  const { data: session } = useSession()
  const myUserId = (session?.user as { id?: string } | null | undefined)?.id ?? ''

  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const recipe = useEditorRecipeView()

  const projectId = recipe?.id ?? ''

  const [comments, setComments] = useState<Comment[]>([])
  const [draftText, setDraftText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadComments = useCallback(async () => {
    if (!projectId || !selectedClipId) return
    setLoading(true)
    try {
      const res = await fetch(
        `/api/collab/comments?projectId=${encodeURIComponent(projectId)}&clipId=${encodeURIComponent(selectedClipId)}`,
        { headers: { 'x-user-id': myUserId } },
      )
      if (!res.ok) return
      const data = (await res.json()) as { comments: Comment[] }
      setComments(data.comments ?? [])
    } catch (err) {
      console.warn("[caught] src/components/editor/ClipCommentsPanel.tsx:58", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ } finally {
      setLoading(false)
    }
  }, [projectId, selectedClipId, myUserId])

  useEffect(() => {
    void loadComments()
  }, [loadComments])

  const submit = useCallback(async () => {
    if (!draftText.trim() || !selectedClipId || !projectId) return
    setSubmitting(true)
    try {
      await fetch('/api/collab/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-user-id': myUserId },
        body: JSON.stringify({
          projectId,
          clipId: selectedClipId,
          text: draftText.trim(),
          timecode: 0,
          parentId: replyTo ?? undefined,
        }),
      })
      setDraftText('')
      setReplyTo(null)
      void loadComments()
    } catch (err) {
      console.warn("[caught] src/components/editor/ClipCommentsPanel.tsx:85", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* ignore */ } finally {
      setSubmitting(false)
    }
  }, [draftText, selectedClipId, projectId, myUserId, replyTo, loadComments])

  const resolve = useCallback(async (commentId: string, resolved: boolean) => {
    await fetch('/api/collab/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-user-id': myUserId },
      body: JSON.stringify({ commentId, resolved }),
    })
    void loadComments()
  }, [myUserId, loadComments])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void submit()
    }
  }

  if (!selectedClipId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-white/20 p-4">
        <MessageSquare className="w-6 h-6" />
        <p className="text-xs text-center">Select a clip to view and add comments</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-white/6">
        <p className="text-xs font-semibold text-white/60">Clip Comments</p>
        {replyTo && (
          <p className="text-[9px] text-[#00e5c8] mt-0.5">
            Replying to comment <button onClick={() => setReplyTo(null)} className="underline opacity-60 hover:opacity-100">× cancel</button>
          </p>
        )}
      </div>

      {/* Comment list */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/4">
        {loading ? (
          <p className="text-[10px] text-white/30 text-center py-4">Loading…</p>
        ) : comments.length === 0 ? (
          <p className="text-[10px] text-white/20 text-center py-4">No comments yet</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className={`px-3 py-2.5 space-y-1 ${c.resolved ? 'opacity-40' : ''}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[10px] text-white/70 leading-relaxed">
                  {parseAtMentions(c.text)}
                </p>
                <button
                  onClick={() => void resolve(c.id, !c.resolved)}
                  className={`flex-shrink-0 ${c.resolved ? 'text-[#00e5c8]' : 'text-white/20 hover:text-white/50'}`}
                  title={c.resolved ? 'Reopen' : 'Resolve'}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-white/20">
                  {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  onClick={() => { setReplyTo(c.id); textareaRef.current?.focus() }}
                  className="text-[8px] text-white/20 hover:text-[#00e5c8] transition flex items-center gap-0.5"
                >
                  <CornerDownRight className="w-2.5 h-2.5" /> Reply
                </button>
              </div>
              {c.replies.length > 0 && (
                <div className="ml-3 pl-2 border-l border-white/8 space-y-1.5">
                  {c.replies.map((r) => (
                    <div key={r.id} className="space-y-0.5">
                      <p className="text-[10px] text-white/50">{parseAtMentions(r.text)}</p>
                      <p className="text-[8px] text-white/20">
                        {new Date(r.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Compose */}
      <div className="p-2 border-t border-white/6">
        <textarea
          ref={textareaRef}
          value={draftText}
          onChange={(e) => setDraftText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Add a comment… @mention · Enter to send"
          rows={2}
          className="w-full bg-[#0d1117] border border-white/10 rounded px-2 py-1.5 text-[10px] text-white/70 placeholder-white/20 outline-none focus:border-[#00e5c8]/40 resize-none"
        />
        <div className="flex justify-end mt-1">
          <button
            onClick={() => void submit()}
            disabled={!draftText.trim() || submitting}
            className="text-[9px] px-3 py-1 rounded bg-[#00e5c8]/10 border border-[#00e5c8]/30 text-[#00e5c8] disabled:opacity-30 hover:bg-[#00e5c8]/20 transition"
          >
            {submitting ? '…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
