// mono-jsx embeds signal values in a script without escaping HTML delimiters.
// Carry escaped JSON as a string signal, then parse it in the browser.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This serializer accepts typed internal signal values, not external input that needs parsing.
export function serializeSignalData(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
