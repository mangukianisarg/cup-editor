import React from 'react'
import { cn } from '../../lib/utils'

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:ring-2 focus:ring-primary',
        className,
      )}
      {...props}
    />
  )
}
