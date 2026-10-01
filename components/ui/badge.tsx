import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full ring-1 px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "ring-brand-blue/15 bg-brand-blue/10 text-brand-blue [a&]:hover:bg-brand-blue/15",
        secondary:
          "ring-brand-cyan/15 bg-brand-cyan/10 text-brand-blue [a&]:hover:bg-brand-cyan/15",
        // Destructive / success / warning use the semantic color tokens
        // (globals.css) so a status badge matches success/warning/destructive
        // text everywhere else — no more teal "success" or raw red/amber.
        destructive:
          "ring-destructive-line bg-destructive-subtle text-destructive-strong [a&]:hover:bg-destructive-subtle/70",
        /* Solid red — white on a filled block. For the one status that should
           stop a recruiter rather than blend into the row: a terminated
           attempt. The subtle `destructive` above stays the default for
           everything else. */
        destructiveSolid:
          "ring-destructive bg-destructive text-white [a&]:hover:bg-destructive/90",
        outline:
          "text-gray-700 ring-gray-200 bg-white [a&]:hover:bg-brand-cyan/[0.04] [a&]:hover:text-brand-blue [a&]:hover:ring-brand-blue/30",
        success:
          "ring-success-line bg-success-subtle text-success-strong [a&]:hover:bg-success-subtle/70",
        warning:
          "ring-warning-line bg-warning-subtle text-warning-strong [a&]:hover:bg-warning-subtle/70",
        info:
          "ring-brand-blue/15 bg-brand-blue/10 text-brand-blue [a&]:hover:bg-brand-blue/15",
        muted:
          "ring-gray-200 bg-gray-100 text-gray-600 [a&]:hover:bg-gray-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
