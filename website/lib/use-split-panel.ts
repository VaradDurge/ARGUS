'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'argus-split-ratio'
const MIN_RATIO = 0.25  // list panel minimum 25%
const MAX_RATIO = 0.92  // list panel maximum 92% (detail always >=8%)
const DEFAULT_RATIO = 0.4

function loadRatio(): number {
  if (typeof window === 'undefined') return DEFAULT_RATIO
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    const n = parseFloat(saved)
    if (!isNaN(n) && n >= MIN_RATIO && n <= MAX_RATIO) return n
  }
  return DEFAULT_RATIO
}

export function useSplitPanel() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = useState(DEFAULT_RATIO)
  const dragging = useRef(false)

  // Load saved ratio on mount
  useEffect(() => {
    setRatio(loadRatio())
  }, [])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (me: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      let newRatio = (me.clientX - rect.left) / rect.width
      newRatio = Math.max(MIN_RATIO, Math.min(MAX_RATIO, newRatio))
      setRatio(newRatio)
    }

    const onMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      // Persist
      setRatio((r) => {
        localStorage.setItem(STORAGE_KEY, String(r))
        return r
      })
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  return {
    containerRef,
    listWidth: `${(ratio * 100).toFixed(2)}%`,
    detailWidth: `${((1 - ratio) * 100).toFixed(2)}%`,
    handleMouseDown,
  }
}
