import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-[transform,background-color,box-shadow,opacity,color] duration-150 ease-out active:not-disabled:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 select-none",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground shadow-border hover:bg-accent",
        ghost: "text-foreground hover:bg-secondary",
        outline: "shadow-border hover:bg-secondary text-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        subtle: "text-muted-foreground hover:text-foreground hover:bg-secondary",
      },
      size: {
        default: "h-11 px-4 rounded-xl text-sm",
        sm: "h-9 px-3 rounded-xl text-sm",
        lg: "h-12 px-5 rounded-xl text-base",
        icon: "size-11 rounded-xl",
        "icon-sm": "size-9 rounded-xl",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn("talkai-button", buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { buttonVariants };
