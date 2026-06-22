import React from 'react'
import { cn } from '../../lib/utils'

export function Button({ className, ...props }) {
  return (
    <button
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}
