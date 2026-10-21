// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

const root = globalThis.document.querySelector("#app");
if (root !== null) {
  mount(() => <StartClient />, root);
}
