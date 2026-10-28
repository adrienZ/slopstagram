import { SaxesParser } from "saxes";

interface Element {
  name: string;
  attributes: Partial<Record<string, string>>;
  children: Array<Element>;
  text: string;
}

function parseManifest(xml: string): Element | undefined {
  if (xml.length > 1024 * 1024) {
    return undefined;
  }
  const parser = new SaxesParser({ xmlns: true });
  const stack: Array<Element> = [];
  let root: Element | undefined;
  parser.on("doctype", () => {
    throw new Error("DASH does not require a DTD");
  });
  parser.on("opentag", (tag) => {
    if (stack.length > 32 || (tag.uri !== "" && tag.uri !== "urn:mpeg:dash:schema:mpd:2011")) {
      throw new Error("Unsupported DASH structure");
    }
    const element: Element = {
      name: tag.local,
      attributes: Object.fromEntries(
        Object.values(tag.attributes).map((attribute) => [attribute.local, attribute.value]),
      ),
      children: [],
      text: "",
    };
    stack.at(-1)?.children.push(element);
    root ??= element;
    stack.push(element);
  });
  parser.on("text", (text) => {
    const current = stack.at(-1);
    if (current) {
      current.text += text;
    }
  });
  parser.on("cdata", (text) => {
    const current = stack.at(-1);
    if (current) {
      current.text += text;
    }
  });
  parser.on("closetag", () => {
    stack.pop();
  });
  try {
    parser.write(xml).close();
    return root;
  } catch {
    return undefined;
  }
}

function resolveBase(elements: Array<Element>): string | null {
  let base: string | undefined;
  try {
    for (const element of elements) {
      const received = element.children.find(({ name }) => name === "BaseURL")?.text.trim();
      if (received !== undefined && received.length > 0) {
        base = new globalThis.URL(received, base).href;
      }
    }
    if (base === undefined) {
      return null;
    }
    const url = new globalThis.URL(base);
    return url.protocol === "https:" && url.username === "" && url.password === ""
      ? url.href
      : null;
  } catch {
    return null;
  }
}

// Instagram's on-demand MPD points to complete indexed MP4 files, not .mpd endpoints.
// Segmented/live/DRM presentations require a DASH player and are deliberately ignored.
export function dashAudioSource(xml: string) {
  const root = parseManifest(xml);
  if (root?.name !== "MPD" || root.attributes.type === "dynamic") {
    return null;
  }
  const periods = root.children.filter(({ name }) => name === "Period");
  const period = periods.at(0);
  if (periods.length !== 1 || period === undefined) {
    return null;
  }
  const candidates = period.children
    .filter(({ name }) => name === "AdaptationSet")
    .flatMap((adaptation) =>
      adaptation.children
        .filter(({ name }) => name === "Representation")
        .flatMap((representation) => {
          const elements = [root, period, adaptation, representation];
          if (
            elements.some((element) =>
              element.children.some(({ name }) =>
                ["SegmentTemplate", "SegmentList", "ContentProtection"].includes(name),
              ),
            )
          ) {
            return [];
          }
          const attributes = { ...adaptation.attributes, ...representation.attributes };
          const { codecs = "" } = attributes;
          if (
            attributes.contentType === "video" ||
            attributes.mimeType !== "audio/mp4" ||
            !/^mp4a\.40\.(?:2|5|29)$/u.test(codecs)
          ) {
            return [];
          }
          const sourceUrl = resolveBase(elements);
          const bandwidth = Number(attributes.bandwidth);
          return sourceUrl === null
            ? []
            : [
                {
                  sourceUrl,
                  mimeType: "audio/mp4" as const,
                  codecs,
                  bandwidth: Number.isFinite(bandwidth) && bandwidth > 0 ? bandwidth : 0,
                },
              ];
        }),
    );
  const selected = candidates.toSorted((left, right) => right.bandwidth - left.bandwidth).at(0);
  return selected === undefined
    ? null
    : { sourceUrl: selected.sourceUrl, mimeType: selected.mimeType, codecs: selected.codecs };
}
