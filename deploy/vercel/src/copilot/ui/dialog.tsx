import { Dialog as Primitive } from "@base-ui/react/dialog";
import type { ComponentProps } from "react";
export const Dialog = Primitive.Root;
export const DialogTitle = Primitive.Title;
export const DialogDescription = Primitive.Description;
export function DialogContent({
  children,
  className,
  ...rest
}: ComponentProps<typeof Primitive.Popup> & { showCloseButton?: boolean }) {
  const { showCloseButton: _, ...props } = rest;
  return (
    <Primitive.Portal>
      <Primitive.Backdrop className="cp-overlay" />
      <Primitive.Popup className={`cp-dialog ${className ?? ""}`} {...props}>
        {children}
      </Primitive.Popup>
    </Primitive.Portal>
  );
}
