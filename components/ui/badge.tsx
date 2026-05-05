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
        destructive:
          "ring-red-200 bg-red-50 text-red-700 [a&]:hover:bg-red-100",
        outline:
          "text-gray-700 ring-gray-200 bg-white [a&]:hover:bg-brand-cyan/[0.04] [a&]:hover:text-brand-blue [a&]:hover:ring-brand-blue/30",
        // Brand-aligned semantic variants
        success:
          "ring-brand-teal/15 bg-brand-teal/10 text-brand-teal [a&]:hover:bg-brand-teal/15",
        warning:
          "ring-amber-200 bg-amber-50 text-amber-700 [a&]:hover:bg-amber-100",
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
