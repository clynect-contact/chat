import { Checkbox as Primitive } from "@base-ui/react/checkbox";
import type { ComponentProps } from "react";
export function Checkbox(props: ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root className="cp-checkbox" data-slot="checkbox" {...props}>
      <Primitive.Indicator>✓</Primitive.Indicator>
    </Primitive.Root>
  );
}
