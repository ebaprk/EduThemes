import { FieldContext } from "../lib/field-context";
import * as React from "react"
import { cn } from "@eduthemes/ui/lib/utils"
import { Label as LabelPrimitive } from "radix-ui"

function Label({
  className,
  ...props
}) {
  const fieldId = React.useContext(FieldContext);
  return (
    <LabelPrimitive.Root
      data-slot="label"
      htmlFor={props.htmlFor ?? fieldId}
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { Label }
