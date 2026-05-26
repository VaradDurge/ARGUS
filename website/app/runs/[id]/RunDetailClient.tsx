'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RunDetailRedirectClient({ id }: { id: string }) {
  const router = useRouter()

  useEffect(() => {
    if (id && id !== '_') {
      router.replace(`/?run=${id}`)
    } else {
      router.replace('/')
    }
  }, [id, router])

  return (
    <div className="py-24 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
      Redirecting...
    </div>
  )
}
