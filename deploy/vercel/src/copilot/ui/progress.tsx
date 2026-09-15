import type { ComponentProps } from "react";
export function Progress(props: ComponentProps<"progress">) {
  return <progress className="cp-progress" max={100} {...props} />;
}
