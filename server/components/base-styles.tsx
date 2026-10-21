import { css } from "mono-jsx/jsx-runtime";

export function BaseStyles() {
  return (
    <style>{css`
      @import url("/css/base.css");
    `}</style>
  );
}
