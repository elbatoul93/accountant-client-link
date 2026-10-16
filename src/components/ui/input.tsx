import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, dir, ...props }, ref) => {
    // Emails, phone numbers and amounts are always Latin: keep them left-to-right in Arabic
    // (so "a@b.com" and "+213 …" don't reorder) but align them with the rest of the form.
    const latin = type === "email" || type === "tel" || type === "url" || type === "number";
    return (
      <input
        type={type}
        dir={dir ?? (latin ? "ltr" : undefined)}
        className={cn(
          latin && "rtl:text-right",
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
