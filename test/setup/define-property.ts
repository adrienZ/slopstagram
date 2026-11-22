import { onTestFinished } from "vitest";

// Installs what an environment lacks (jsdom has no layout, `matchMedia` or media playback).
// It stays installed for the whole run.
export function defineJsdomPolyfill(
  // oxlint-disable-next-line anti-slop/no-object-parameters -- The owner is any host object: globalThis, a prototype, process.
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
) {
  Object.defineProperty(target, key, { configurable: true, ...descriptor });
}

// Replaces a property for the current test and puts the original back when it finishes.
export function mockJsdomPolyfillValue(
  // oxlint-disable-next-line anti-slop/no-object-parameters -- The owner is any host object: globalThis, a prototype, process.
  target: object,
  key: PropertyKey,
  descriptor: PropertyDescriptor,
) {
  const original = Object.getOwnPropertyDescriptor(target, key);

  defineJsdomPolyfill(target, key, descriptor);
  onTestFinished(() => {
    if (original === undefined) {
      Reflect.deleteProperty(target, key);
    } else {
      Object.defineProperty(target, key, original);
    }
  });
}
