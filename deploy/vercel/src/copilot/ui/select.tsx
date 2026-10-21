import { Select as Primitive } from "@base-ui/react/select";
import type { ComponentProps } from "react";
export const Select = Primitive.Root;
export const SelectValue = Primitive.Value;
export function SelectTrigger(props: ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger className="cp-select-trigger" {...props} />;
}
export function SelectContent({
  children,
  ...props
}: ComponentProps<typeof Primitive.Popup>) {
  return (
    <Primitive.Portal>
      <Primitive.Positioner className="cp-select-positioner">
        <Primitive.Popup className="cp-select-popup" {...props}>
          <Primitive.List>{children}</Primitive.List>
        </Primitive.Popup>
      </Primitive.Positioner>
    </Primitive.Portal>
  );
}
export function SelectItem({
  children,
  ...props
}: ComponentProps<typeof Primitive.Item>) {
  return (
    <Primitive.Item className="cp-select-item" {...props}>
      <Primitive.ItemText>{children}</Primitive.ItemText>
    </Primitive.Item>
  );
}
