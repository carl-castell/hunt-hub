import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { XIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/** A panel that slides in from the right, over the page (Radix dialog). */
function Sheet(props: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="sheet" {...props} />
}

function SheetContent({ className, children, title, description, ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: React.ReactNode
  description?: React.ReactNode
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-background shadow-xl',
          'data-[state=open]:animate-in data-[state=open]:slide-in-from-right',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <DialogPrimitive.Title className="truncate text-lg font-semibold">{title}</DialogPrimitive.Title>
            {description
              ? <DialogPrimitive.Description className="text-sm text-muted-foreground">{description}</DialogPrimitive.Description>
              : <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close">
            <XIcon className="size-5" />
          </DialogPrimitive.Close>
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export { Sheet, SheetContent }
