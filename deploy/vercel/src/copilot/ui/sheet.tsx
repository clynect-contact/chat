import { Dialog as Primitive } from "@base-ui/react/dialog";
import type { ComponentProps } from "react";
export const Sheet = Primitive.Root;
export const SheetTitle = Primitive.Title;
export const SheetDescription = Primitive.Description;
export function SheetContent({
  children,
  className,
  ...rest
}: ComponentProps<typeof Primitive.Popup> & { showCloseButton?: boolean }) {
  const { showCloseButton: _, ...props } = rest;
  return (
    <Primitive.Portal>
      <Primitive.Backdrop className="cp-overlay" />
      <Primitive.Popup className={`cp-sheet ${className ?? ""}`} {...props}>
        {children}
      </Primitive.Popup>
    </Primitive.Portal>
  );
}
