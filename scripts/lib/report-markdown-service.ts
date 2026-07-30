import {
  NO_ACCESSIBILITY_CAPTION,
  NO_APPLE_CAPTION,
} from "./report-constants.ts";
import type { StoriesManifestReport } from "./types.ts";

export type FormatStoriesReportMarkdownOptions = {
  profilePicPathByUrl?: Map<string, string>;
  storyPreviewPathByUrl?: Map<string, string>;
  timeZone?: string;
};

function getDatePart(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function formatReportDate(
  value: string,
  options: FormatStoriesReportMarkdownOptions,
): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const dateTimeOptions: Intl.DateTimeFormatOptions = {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "long",
    year: "numeric",
  };
  const timeZoneOptions: Intl.DateTimeFormatOptions = {
    timeZoneName: "short",
  };

  if (options.timeZone) {
    dateTimeOptions.timeZone = options.timeZone;
    timeZoneOptions.timeZone = options.timeZone;
  }

  const dateParts = new Intl.DateTimeFormat("en-US", dateTimeOptions).formatToParts(
    date,
  );
  const timeZoneParts = new Intl.DateTimeFormat(
    "en-GB",
    timeZoneOptions,
  ).formatToParts(date);
  const month = getDatePart(dateParts, "month");
  const day = getDatePart(dateParts, "day");
  const year = getDatePart(dateParts, "year");
  const hour = getDatePart(dateParts, "hour");
  const minute = getDatePart(dateParts, "minute");
  const timeZoneName = getDatePart(timeZoneParts, "timeZoneName");
  const timeZoneSuffix = timeZoneName ? ` ${timeZoneName}` : "";

  return `${month} ${day}, ${year} at ${hour}:${minute}${timeZoneSuffix}`;
}

function formatUserName(fullName: string | null, username: string | null): string {
  const resolvedName = fullName?.trim();
  const resolvedUsername = username?.trim();

  if (resolvedName && resolvedUsername) {
    return `${resolvedName} (${resolvedUsername})`;
  }

  return resolvedName || resolvedUsername || "Unknown user";
}

const AUTHOR_DATE_PREFIX_PATTERN =
  /^(?:Photo|Video) by .+? on [A-Z][a-z]+ \d{1,2}, \d{4}\.\s*/u;
const AUTHOR_LOCATION_PREFIX_PATTERN = /^(?:Photo|Video) by .+? in ([^.]+)\.\s*/u;

function formatIgCaption(caption: string): string {
  const trimmedCaption = caption
    .normalize("NFC")
    .replace(AUTHOR_DATE_PREFIX_PATTERN, "")
    .replace(AUTHOR_LOCATION_PREFIX_PATTERN, "In $1. ")
    .trim();

  return trimmedCaption.length > 0 ? trimmedCaption : NO_ACCESSIBILITY_CAPTION;
}

function formatAppleCaption(caption: string): string {
  const trimmedCaption = caption.normalize("NFC").trim();
  return trimmedCaption.length > 0 ? trimmedCaption : NO_APPLE_CAPTION;
}

function formatStickers(stickers: string[]): string {
  return stickers.map((sticker) => sticker.normalize("NFC").trim()).filter(Boolean).join("\n");
}

function escapeTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatImage(
  source: string,
  alt: string,
  width: number,
  height?: number,
): string {
  const heightAttribute = height === undefined ? "" : ` height="${height}"`;
  return `<img src="${escapeHtmlAttribute(source)}" alt="${escapeHtmlAttribute(alt)}" width="${width}"${heightAttribute}>`;
}

export function formatStoriesReportMarkdown(
  report: StoriesManifestReport,
  options: FormatStoriesReportMarkdownOptions = {},
): string {
  const lines = [`# Report ${formatReportDate(report.metadata.created_at, options)}`];

  for (const user of report.output.users) {
    const userName = formatUserName(user.full_name, user.username);
    lines.push("", `## ${userName}`, "");

    const profilePicUrl = user.profile_pic_url?.trim();
    if (profilePicUrl) {
      const imagePath = options.profilePicPathByUrl?.get(profilePicUrl) ?? profilePicUrl;
      lines.push(
        formatImage(imagePath, `${userName} avatar`, 96, 96),
        "",
      );
    }

    lines.push(
      "| Preview | Story | stickers | ig_caption | apple_caption |",
      "| --- | --- | --- | --- | --- |",
    );

    for (const story of user.stories) {
      const previewImageUrl = story.preview_image_url?.trim();
      const previewImagePath = previewImageUrl
        ? options.storyPreviewPathByUrl?.get(previewImageUrl) ?? previewImageUrl
        : null;
      const preview = previewImagePath
        ? formatImage(previewImagePath, `${story.media_pk} preview`, 120)
        : "";

      lines.push(
        `| ${preview} | \`${escapeTableCell(story.media_pk)}\` | ${escapeTableCell(formatStickers(story.stickers))} | ${escapeTableCell(formatIgCaption(story.ig_caption))} | ${escapeTableCell(formatAppleCaption(story.apple_caption))} |`,
      );
    }
  }

  lines.push("");

  return lines.join("\n");
}
