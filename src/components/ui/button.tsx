import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-[opacity,transform,background-color,color] duration-[var(--motion-quick)] ease-[var(--ease-smooth-out)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-seal/60 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "bg-ink text-paper hover:opacity-90 active:scale-[0.98]",
        seal: "bg-seal text-paper hover:opacity-90 active:scale-[0.98]",
        outline:
          "border border-border bg-transparent text-ink hover:bg-ink/5 active:scale-[0.98]",
        ghost: "text-ink hover:bg-ink/6 active:scale-[0.98]",
      },
      size: {
        default: "h-11 rounded-[var(--radius-sm)] px-4",
        sm: "h-9 rounded-[var(--radius-xs)] px-3 text-sm",
        lg: "h-12 rounded-[var(--radius-md)] px-5",
        icon: "size-11 rounded-[var(--radius-sm)]",
        "icon-sm": "size-9 rounded-[var(--radius-xs)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean };

function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
