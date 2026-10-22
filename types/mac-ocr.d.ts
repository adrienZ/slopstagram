// typescript declaration for non MacOS machines
declare module "mac-ocr" {
  export function ocr(input: Uint8Array): Promise<{ text: string }>;
}
