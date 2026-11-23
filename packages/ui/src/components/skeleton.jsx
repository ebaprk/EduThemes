import { cn } from "@eduthemes/ui/lib/utils"

function Skeleton({
  as: Component = "div",
  variant = "surface",
  className,
  children,
  ...props
}) {
  return (
    <Component
      data-slot="skeleton"
      data-variant={variant}
      className={cn("ui-skeleton rounded-md bg-muted", className)}
      {...props}
    >
      {variant === "activity" ? <><span className="ui-skeleton__dot" /><span className="ui-skeleton__dot" /><span className="ui-skeleton__dot" /></> : children}
    </Component>
  )
}

export { Skeleton }
