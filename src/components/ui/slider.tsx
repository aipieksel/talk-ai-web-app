import * as SliderPrimitive from "@radix-ui/react-slider";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Slider({ className, ...props }: ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "talkai-slider relative flex w-full touch-none select-none items-center",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="talkai-slider__track relative h-1.5 w-full grow overflow-hidden rounded-full bg-secondary shadow-border">
        <SliderPrimitive.Range className="talkai-slider__range absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="talkai-slider__thumb block size-5 rounded-full bg-primary shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
    </SliderPrimitive.Root>
  );
}
