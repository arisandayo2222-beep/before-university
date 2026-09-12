"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { SearchIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const CommandDialogCloseContext = React.createContext(true)

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex h-full w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = true,
  returnFocusRef,
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof Dialog> & {
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
  returnFocusRef?: React.RefObject<HTMLElement | null>
}) {
  const [viewport, setViewport] = React.useState({ height: 0, bottom: 0 })

  React.useEffect(() => {
    if (!open) return

    const updateViewport = () => {
      const visualViewport = window.visualViewport
      const height = Math.round(visualViewport?.height ?? window.innerHeight)
      const bottom = Math.max(
        0,
        Math.round(
          window.innerHeight -
            ((visualViewport?.offsetTop ?? 0) + height)
        )
      )
      setViewport({ height, bottom })
    }

    updateViewport()
    window.addEventListener("resize", updateViewport)
    window.visualViewport?.addEventListener("resize", updateViewport)
    window.visualViewport?.addEventListener("scroll", updateViewport)
    return () => {
      window.removeEventListener("resize", updateViewport)
      window.visualViewport?.removeEventListener("resize", updateViewport)
      window.visualViewport?.removeEventListener("scroll", updateViewport)
    }
  }, [open])

  const viewportStyle = viewport.height
    ? ({
        "--command-dialog-viewport-height": `${viewport.height}px`,
        "--command-dialog-keyboard-offset": `${viewport.bottom}px`,
      } as React.CSSProperties)
    : undefined

  return (
    <Dialog open={open} onOpenChange={onOpenChange} {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn(
          "command-dialog flex min-h-0 flex-col gap-0 overflow-hidden p-0",
          className
        )}
        style={viewportStyle}
        showCloseButton={false}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          if (!returnFocusRef?.current) return
          event.preventDefault()
          returnFocusRef.current.focus()
        }}
      >
        <div
          data-slot="command-dialog-handle-region"
          className="flex h-7 shrink-0 items-center justify-center sm:hidden"
          aria-hidden="true"
        >
          <span className="h-[5px] w-9 rounded-full bg-muted-foreground/30" />
        </div>
        <CommandDialogCloseContext.Provider value={showCloseButton}>
          <Command className="h-auto min-h-0 flex-1 rounded-none **:data-[slot=command-input-wrapper]:h-12 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5">
            {children}
          </Command>
        </CommandDialogCloseContext.Provider>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  value,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  const showCloseButton = React.useContext(CommandDialogCloseContext)
  const [internalValue, setInternalValue] = React.useState(
    typeof defaultValue === "string" ? defaultValue : ""
  )
  const currentValue = typeof value === "string" ? value : internalValue
  const updateValue = (nextValue: string) => {
    if (value === undefined) setInternalValue(nextValue)
    onValueChange?.(nextValue)
  }

  return (
    <div className="shrink-0 border-b border-border/45 px-4 pb-3 sm:pt-4">
      <div
        data-slot="command-input-wrapper"
        className="command-search-field flex min-h-12 w-full min-w-0 items-center rounded-2xl border border-input bg-muted/45"
      >
        <span className="grid size-11 shrink-0 place-items-center text-muted-foreground" aria-hidden="true">
          <SearchIcon className="size-5" />
        </span>
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn(
            "command-search-input h-12 min-w-0 flex-1 border-0 bg-transparent px-0 py-3 text-base leading-6 outline-none placeholder:overflow-hidden placeholder:text-ellipsis placeholder:whitespace-nowrap placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          value={currentValue}
          onValueChange={updateValue}
          {...props}
        />
        {currentValue ? (
          <button
            type="button"
            className="command-search-action grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="検索語をクリア"
            onClick={(event) => {
              updateValue("")
              event.currentTarget.parentElement
                ?.querySelector<HTMLInputElement>("input")
                ?.focus()
            }}
          >
            <XIcon className="size-5" />
          </button>
        ) : showCloseButton ? (
          <DialogClose asChild>
            <button
              type="button"
              className="command-search-action grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="検索を閉じる"
            >
              <XIcon className="size-5" />
            </button>
          </DialogClose>
        ) : null}
      </div>
    </div>
  )
}

function CommandList({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "min-h-0 flex-1 scroll-py-1 overflow-x-hidden overflow-y-auto overscroll-contain",
        className
      )}
      {...props}
    />
  )
}

function CommandEmpty({
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className="py-6 text-center text-sm"
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex min-w-0 cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto max-w-[42%] shrink truncate text-xs tracking-normal text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}
