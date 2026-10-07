"use client"

import type React from "react"
import * as Dialog from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-night/70" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[92vh] w-[min(94vw,560px)] -translate-x-1/2 -translate-y-1/2 flex-col border-2 border-ink bg-paper shadow-hard-lg outline-none",
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b-2 border-ink bg-white px-5 py-4">
            <div>
              <Dialog.Title className="display text-[26px]">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-1.5 text-[14px] text-ink-2">{description}</Dialog.Description>
              )}
            </div>
            <Dialog.Close className="btn-ghost btn-icon -mr-1 shrink-0" aria-label="Cerrar">
              <X className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <div className="scrollbar-thin overflow-y-auto px-5 py-5">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2.5 border-t-2 border-ink bg-white px-5 py-3.5">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
