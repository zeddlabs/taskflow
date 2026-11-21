import type { ComponentProps } from "react";
import { Slot } from "@radix-ui/react-slot";

export function Button({
  className = "",
  type = "button",
  asChild = false,
  ...props
}: ComponentProps<"button"> & { asChild?: boolean }) {
  const Component = asChild ? Slot : "button";
  return (
    <Component
      data-slot="button"
      type={asChild ? undefined : type}
      className={"button " + className}
      {...props}
    />
  );
}
