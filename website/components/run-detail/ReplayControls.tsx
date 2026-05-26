'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { NodeEvent, RunRecord } from '@/lib/types'

type ReplayPhase = 'idle' | 'submitting' | 'polling' | 'done' | 'error' | 'no_factory' | 'node_done'

interface ReplayState {
  phase: ReplayPhase
  jobId?: string
  newRunId?: string
  message?: string
  mode?: 'full' | 'node'
  nodeName?: string
}

export interface NodeDiffData {
  originalStep: NodeEvent
  replayStep: NodeEvent
  nodeName: string
}

export default function ReplayControls({
  runId,
  run,
  children,
}: {
  runId: string
  run: RunRecord
  children: (
    handleReplay: (node: string) => void,
    handleReplayNode: (node: string) => void,
    replayNodeState: { replayingNode: string | null; nodeDiff: NodeDiffData | null; dismissDiff: () => void },
  ) => React.ReactNode
}) {
  const router = useRouter()
  const [replayState, setReplayState] = useState<ReplayState>({ phase: 'idle' })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [appFactory, setAppFactory] = useState('')
  const [factorySaved, setFactorySaved] = useState(false)
  const factoryInputRef = useRef<HTMLInputElement>(null)
  const [pendingNode, setPendingNode] = useState<string | null>(null)
  const [nodeDiff, setNodeDiff] = useState<NodeDiffData | null>(null)
  const [replayingNode, setReplayingNode] = useState<string | null>(null)

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  async function saveFactory(value: string) {
    if (!value.trim()) return
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: value.trim() }),
    }).catch(() => {})
    setFactorySaved(true)
    setTimeout(() => setFactorySaved(false), 1500)
  }

  async function submitReplay(nodeName: string, mode: 'full' | 'node' = 'full') {
    if (pollRef.current) clearInterval(pollRef.current)
    setReplayState({ phase: 'submitting', mode, nodeName })
    setNodeDiff(null)
    if (mode === 'node') setReplayingNode(nodeName)

    let resp: Response
    try {
      resp = await fetch('/api/replay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: runId, from_step: nodeName, mode }),
      })
    } catch {
      setReplayState({ phase: 'error', message: 'Network error' })
      setReplayingNode(null)
      return
    }

    if (resp.status === 422) {
      const body = await resp.json().catch(() => ({})) as { error?: string }
      if (body.error === 'no_node_ref') {
        setReplayState({ phase: 'error', message: `No stored function ref for '${nodeName}'. Re-record with latest argus.` })
        setReplayingNode(null)
        return
      }
      setPendingNode(nodeName)
      setReplayState({ phase: 'no_factory' })
      setReplayingNode(null)
      setTimeout(() => factoryInputRef.current?.focus(), 50)
      return
    }
    if (!resp.ok) {
      const body = await resp.json().catch(() => ({}))
      setReplayState({ phase: 'error', message: (body as { error?: string }).error ?? `HTTP ${resp.status}` })
      setReplayingNode(null)
      return
    }

    const { job_id } = await resp.json() as { job_id: string }
    setReplayState({ phase: 'polling', jobId: job_id, mode, nodeName })

    const deadline = Date.now() + 5 * 60 * 1000
    pollRef.current = setInterval(async () => {
      if (Date.now() > deadline) {
        clearInterval(pollRef.current!)
        setReplayState({ phase: 'error', message: 'Timed out waiting for replay' })
        setReplayingNode(null)
        return
      }
      try {
        const pr = await fetch(`/api/replay/status/${job_id}`)
        const pdata = await pr.json() as { status: string; run_id?: string; message?: string }
        if (pdata.status === 'done') {
          clearInterval(pollRef.current!)
          if (mode === 'node' && pdata.run_id && nodeName) {
            try {
              const newRunResp = await fetch(`/api/runs/${pdata.run_id}`)
              const newRun = await newRunResp.json() as RunRecord
              const originalStep = run.steps.find(s => s.node_name === nodeName)
              const replayStep = newRun.steps?.find((s: NodeEvent) => s.node_name === nodeName)
              if (originalStep && replayStep) {
                setNodeDiff({ originalStep, replayStep, nodeName })
              }
            } catch {
              // ignore
            }
            setReplayingNode(null)
            setReplayState({ phase: 'node_done', newRunId: pdata.run_id, mode, nodeName })
          } else {
            setReplayingNode(null)
            setReplayState({ phase: 'done', newRunId: pdata.run_id })
            router.push(`/?run=${pdata.run_id}`)
          }
        } else if (pdata.status === 'error') {
          clearInterval(pollRef.current!)
          setReplayingNode(null)
          setReplayState({ phase: 'error', message: pdata.message ?? 'Replay failed' })
        }
      } catch {
        // transient - keep polling
      }
    }, 2000)
  }

  function handleReplay(nodeName: string) {
    submitReplay(nodeName, 'full')
  }

  function handleReplayNode(nodeName: string) {
    submitReplay(nodeName, 'node')
  }

  function dismissDiff() {
    setNodeDiff(null)
    setReplayState({ phase: 'idle' })
  }

  async function handleFactorySubmit() {
    if (!appFactory.trim()) return
    await saveFactory(appFactory)
    if (pendingNode) {
      submitReplay(pendingNode)
    }
  }

  return (
    <>
      {/* Factory input - only shown when auto-detection failed */}
      {replayState.phase === 'no_factory' && (
        <div
          className="px-3 py-2 rounded-lg text-[13px] flex items-center gap-2"
          style={{ background: 'var(--bg-elevated)', border: '1px solid #f59e0b' }}
        >
          <span className="text-[12px] shrink-0" style={{ color: '#f59e0b' }}>
            app factory needed:
          </span>
          <form
            onSubmit={(e) => { e.preventDefault(); handleFactorySubmit() }}
            className="flex items-center gap-1"
          >
            <input
              ref={factoryInputRef}
              type="text"
              value={appFactory}
              onChange={(e) => setAppFactory(e.target.value)}
              placeholder="module:build_graph"
              className="font-mono text-[10px] px-2 py-1 rounded-md outline-none w-[180px] transition-colors"
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid #f59e0b',
                color: appFactory ? 'var(--text-primary)' : '#3a3a40',
              }}
            />
            <button
              type="submit"
              className="font-mono text-[10px] px-2 py-1 rounded-md transition-colors"
              style={{ background: '#f59e0b', color: '#000' }}
            >
              retry
            </button>
            {factorySaved && (
              <span className="text-[10px] font-mono text-green-400">saved</span>
            )}
          </form>
        </div>
      )}

      {/* Full replay status banner */}
      {replayState.phase !== 'idle' && replayState.phase !== 'no_factory' && replayState.phase !== 'node_done' && replayState.mode !== 'node' && (
        <div
          className="px-3 py-2 rounded-lg text-[13px] flex items-center gap-2"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          {replayState.phase === 'submitting' && (
            <span className="font-mono text-[12px]" style={{ color: '#f59e0b' }}>submitting replay...</span>
          )}
          {replayState.phase === 'polling' && (
            <span className="font-mono text-[12px]" style={{ color: '#f59e0b' }}>
              replay running<span className="animate-pulse">...</span>
            </span>
          )}
          {replayState.phase === 'done' && (
            <>
              <span className="font-mono text-[12px]" style={{ color: '#22c55e' }}>replay complete</span>
              {replayState.newRunId && (
                <a
                  href={`/?run=${replayState.newRunId}`}
                  className="ml-2 hover:underline font-mono text-[12px]"
                  style={{ color: '#22c55e' }}
                >
                  view run
                </a>
              )}
            </>
          )}
          {replayState.phase === 'error' && (
            <span className="font-mono text-[12px]" style={{ color: '#ef4444' }}>replay failed: {replayState.message}</span>
          )}
        </div>
      )}

      {/* Node replay error banner */}
      {replayState.phase === 'error' && replayState.mode === 'node' && (
        <div
          className="px-3 py-2 rounded-lg text-[13px] flex items-center gap-2"
          style={{ background: 'var(--bg-elevated)', border: '1px solid #ef4444' }}
        >
          <span className="font-mono text-[12px]" style={{ color: '#ef4444' }}>
            node replay failed: {replayState.message}
          </span>
        </div>
      )}

      {/* Pass diff state down to children so it renders inline */}
      {children(handleReplay, handleReplayNode, { replayingNode, nodeDiff, dismissDiff })}
    </>
  )
}
