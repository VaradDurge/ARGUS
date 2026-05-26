'use client'

import GuideContent from './guide-content'

export default function GuidePage() {
  return (
    <div className="max-w-6xl mx-auto px-8 py-10 overflow-auto h-full">
      <div className="max-w-3xl">
        <GuideContent />
      </div>
    </div>
  )
}
