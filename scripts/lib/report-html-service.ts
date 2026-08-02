import { getReportUserKey } from "./report-user-key-service.ts";
import type { StoriesManifestReport } from "./types.ts";

export type FormatStoriesReportHtmlOptions = {
  ollamaVisionByPreviewUrl?: Map<string, string>;
  profilePicPathByUrl?: Map<string, string>;
  storyPreviewPathByUrl?: Map<string, string>;
  timeZone?: string;
  userSummaryByUserKey?: Map<string, string>;
};

function getDatePart(parts: Intl.DateTimeFormatPart[], type: string): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

function formatReportDate(
  value: string,
  options: FormatStoriesReportHtmlOptions,
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

  const dateParts = new Intl.DateTimeFormat("fr-FR", dateTimeOptions).formatToParts(
    date,
  );
  const timeZoneParts = new Intl.DateTimeFormat(
    "fr-FR",
    timeZoneOptions,
  ).formatToParts(date);
  const month = getDatePart(dateParts, "month");
  const day = getDatePart(dateParts, "day");
  const year = getDatePart(dateParts, "year");
  const hour = getDatePart(dateParts, "hour");
  const minute = getDatePart(dateParts, "minute");
  const timeZoneName = getDatePart(timeZoneParts, "timeZoneName");
  const timeZoneSuffix = timeZoneName ? ` ${timeZoneName}` : "";

  return `${day} ${month} ${year} à ${hour}:${minute}${timeZoneSuffix}`;
}

function formatUserName(fullName: string | null, username: string | null): string {
  const resolvedName = fullName?.trim();
  const resolvedUsername = username?.trim();

  if (resolvedName && resolvedUsername) {
    return `${resolvedName} (${resolvedUsername})`;
  }

  return resolvedName || resolvedUsername || "Utilisateur inconnu";
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatImage(
  source: string,
  alt: string,
  className: string,
  width?: number,
  height?: number,
): string {
  const widthAttribute = width === undefined ? "" : ` width="${width}"`;
  const heightAttribute = height === undefined ? "" : ` height="${height}"`;
  return `<img class="${className}" src="${escapeHtml(source)}" alt="${escapeHtml(alt)}"${widthAttribute}${heightAttribute}>`;
}

function formatPreviewButton(source: string, alt: string): string {
  const escapedSource = escapeHtml(source);
  const escapedAlt = escapeHtml(alt);

  return [
    '<button class="story-image-button" type="button"',
    ` data-full-src="${escapedSource}"`,
    ` data-full-alt="${escapedAlt}"`,
    ` aria-label="Ouvrir ${escapedAlt}">`,
    formatImage(source, alt, "story-preview"),
    "</button>",
  ].join("");
}

export function formatStoriesReportHtml(
  report: StoriesManifestReport,
  options: FormatStoriesReportHtmlOptions = {},
): string {
  const sections: string[] = [];

  for (const [index, user] of report.output.users.entries()) {
    const userName = formatUserName(user.full_name, user.username);
    const userKey = getReportUserKey(user, index);
    const profilePicUrl = user.profile_pic_url?.trim();
    const profileImagePath = profilePicUrl
      ? options.profilePicPathByUrl?.get(profilePicUrl) ?? profilePicUrl
      : null;
    const summary = options.userSummaryByUserKey?.get(userKey)?.trim() ?? "";
    const previews = user.stories
      .map((story) => {
        const previewImageUrl = story.preview_image_url?.trim();
        const previewImagePath = previewImageUrl
          ? options.storyPreviewPathByUrl?.get(previewImageUrl) ?? previewImageUrl
          : null;

        return previewImagePath
          ? formatPreviewButton(previewImagePath, `aperçu ${story.media_pk}`)
          : "";
      })
      .filter(Boolean)
      .join("\n");

    sections.push(
      [
        '<section class="user-section">',
        '<div class="user-header">',
        profileImagePath
          ? formatImage(profileImagePath, `${userName} avatar`, "avatar", 96, 96)
          : '<div class="avatar-placeholder"></div>',
        "<div>",
        `<h2>${escapeHtml(userName)}</h2>`,
        summary ? `<p class="user-summary">${escapeHtml(summary)}</p>` : "",
        "</div>",
        "</div>",
        previews ? `<div class="story-images">${previews}</div>` : "",
        "</section>",
      ].join("\n"),
    );
  }

  return [
    "<!doctype html>",
    '<html lang="fr">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>Rapport Stories ${escapeHtml(formatReportDate(report.metadata.created_at, options))}</title>`,
    "<style>",
    ":root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif;background:#f6f7f9;color:#1f2933}",
    "body{margin:0;background:#f6f7f9;color:#1f2933}",
    "main{max-width:1440px;margin:0 auto;padding:32px 24px 48px}",
    "h1{font-size:28px;line-height:1.2;margin:0 0 28px;font-weight:680}",
    ".user-section{margin:0 0 42px}",
    ".user-header{display:flex;align-items:flex-start;gap:18px;margin:0 0 18px}",
    ".avatar,.avatar-placeholder{width:96px;height:96px;border-radius:8px;object-fit:cover;background:#d9dee7;flex:0 0 auto}",
    "h2{font-size:21px;line-height:1.25;margin:0 0 9px;font-weight:650}",
    ".user-summary{max-width:980px;margin:0;color:#334250;font-size:21px;line-height:1.45;font-weight:420}",
    ".story-images{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}",
    ".story-image-button{appearance:none;border:0;padding:0;margin:0;background:transparent;cursor:zoom-in;border-radius:8px;line-height:0}",
    ".story-image-button:focus-visible{outline:3px solid #4f8cff;outline-offset:3px}",
    ".story-preview{width:180px;max-width:calc(50vw - 36px);height:auto;border-radius:8px;display:block;background:#eef2f6;box-shadow:0 1px 3px rgba(20,30,40,.18)}",
    ".image-lightbox{position:fixed;inset:0;display:none;align-items:center;justify-content:center;padding:28px;background:rgba(8,12,18,.82);z-index:20}",
    ".image-lightbox.is-open{display:flex}",
    ".image-lightbox img{max-width:min(100%,1100px);max-height:92vh;border-radius:8px;box-shadow:0 20px 60px rgba(0,0,0,.35);background:#11161c}",
    ".lightbox-close{position:absolute;top:16px;right:16px;width:42px;height:42px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(8,12,18,.7);color:#fff;font-size:28px;line-height:1;cursor:pointer}",
    "@media (max-width:640px){main{padding:24px 16px 40px}.user-header{gap:12px}.avatar,.avatar-placeholder{width:68px;height:68px}.user-summary{font-size:18px}.story-preview{width:calc(50vw - 22px);max-width:none}}",
    "@media (prefers-color-scheme:dark){:root,body{background:#11161c;color:#e5e9ef}.user-summary{color:#d3dae3}.avatar-placeholder,.story-preview{background:#27313c}}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    `<h1>Rapport du ${escapeHtml(formatReportDate(report.metadata.created_at, options))}</h1>`,
    sections.join("\n"),
    "</main>",
    '<div class="image-lightbox" id="image-lightbox" aria-modal="true" role="dialog" aria-label="Aperçu de l’image">',
    '<button class="lightbox-close" type="button" aria-label="Fermer l’aperçu">&times;</button>',
    '<img alt="">',
    "</div>",
    "<script>",
    "const lightbox=document.getElementById('image-lightbox');",
    "const lightboxImage=lightbox?.querySelector('img');",
    "const closeLightbox=()=>{if(!lightbox||!lightboxImage)return;lightbox.classList.remove('is-open');lightboxImage.removeAttribute('src');lightboxImage.alt='';};",
    "document.querySelectorAll('.story-image-button').forEach((button)=>{button.addEventListener('click',()=>{if(!lightbox||!lightboxImage)return;lightboxImage.src=button.dataset.fullSrc||'';lightboxImage.alt=button.dataset.fullAlt||'';lightbox.classList.add('is-open');});});",
    "lightbox?.addEventListener('click',(event)=>{if(event.target===lightbox)closeLightbox();});",
    "lightbox?.querySelector('.lightbox-close')?.addEventListener('click',closeLightbox);",
    "document.addEventListener('keydown',(event)=>{if(event.key==='Escape')closeLightbox();});",
    "</script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
