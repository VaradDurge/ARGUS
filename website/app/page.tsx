'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useRunList } from '@/lib/hooks'
import { useSplitPanel } from '@/lib/use-split-panel'
import RunListPanel from '@/components/RunListPanel'
import RunDetailPanel from '@/components/RunDetailPanel'

function useIsMobile(breakpoint = 1024) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    setIsMobile(mq.matches)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [breakpoint])

  return isMobile
}

function RunListPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const selectedRunId = searchParams.get('run')
  const previousRunId = searchParams.get('from')
  const { runs, loading, isLocal, user } = useRunList()
  const { containerRef, listWidth, detailWidth, handleMouseDown } = useSplitPanel()
  const isMobile = useIsMobile()

  useEffect(() => {
    if (!loading && isLocal === false && !user) {
      router.replace('/login')
    }
  }, [loading, isLocal, user, router])

  const handleSelectRun = (id: string) => {
    router.replace(`/?run=${id}`, { scroll: false })
  }

  const handleCloseDetail = () => {
    router.replace('/', { scroll: false })
  }

  if (loading && !runs.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</span>
      </div>
    )
  }

  /* ── Mobile: full-width list, detail as overlay ───────────── */
  if (isMobile) {
    return (
      <div className="h-full relative">
        <div className="h-full overflow-hidden">
          <RunListPanel
            runs={runs}
            selectedRunId={selectedRunId}
            onSelectRun={handleSelectRun}
            loading={loading}
          />
        </div>

        {selectedRunId && (
          <>
            {/* Backdrop */}
            <div
              className="detail-overlay-backdrop"
              onClick={handleCloseDetail}
            />
            {/* Overlay panel */}
            <div className="detail-overlay-panel">
              <RunDetailPanel
                runId={selectedRunId}
                previousRunId={previousRunId}
                onClose={handleCloseDetail}
                allRuns={runs}
                isOverlay
              />
            </div>
          </>
        )}
      </div>
    )
  }

  /* ── Desktop: split panel ─────────────────────────────────── */
  return (
    <div ref={containerRef} className="flex h-full">
      {/* Left: Run list */}
      <div className="shrink-0 overflow-hidden" style={{ width: listWidth }}>
        <RunListPanel
          runs={runs}
          selectedRunId={selectedRunId}
          onSelectRun={handleSelectRun}
          loading={loading}
        />
      </div>

      {/* Draggable divider */}
      <div
        className="shrink-0 split-divider"
        onMouseDown={handleMouseDown}
      />

      {/* Right: Detail panel */}
      <div className="overflow-hidden" style={{ width: detailWidth }}>
        <RunDetailPanel
          runId={selectedRunId}
          previousRunId={previousRunId}
          onClose={handleCloseDetail}
          allRuns={runs}
        />
      </div>
    </div>
  )
}

export default function RunListPage() {
  return (
    <Suspense fallback={
      <div className="h-full flex items-center justify-center">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading...</span>
      </div>
    }>
      <RunListPageInner />
    </Suspense>
  )
}
