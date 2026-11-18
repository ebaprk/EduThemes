import { cn } from "@eduthemes/ui/lib/utils"

function Skeleton({
  as: Component = "div",
  className,
  ...props
}) {
  return (
    <Component
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted motion-reduce:animate-none", className)}
      {...props}
    />
  )
}

export { Skeleton }
