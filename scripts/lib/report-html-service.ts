import { getReportUserKey } from "./report-user-key-service.ts";
import {
  STORY_MEDIA_TYPES,
  type StoriesManifestReport,
  type StoryOutputUser,
  type StoryMediaType,
} from "./types.ts";

export type FormatStoriesReportHtmlOptions = {
  ollamaVisionByPreviewUrl?: Map<string, string>;
  profilePicPathByUrl?: Map<string, string>;
  storyPreviewPathByUrl?: Map<string, string>;
  timeZone?: string;
  userSummaryByUserKey?: Map<string, string>;
};

type LightboxStoryDetails = {
  appleCaption: string;
  igCaption: string;
  mediaType: StoryMediaType | null;
  mediaPk: string;
  ollamaVision: string;
  stickers: string;
};

type PreviewEntry = LightboxStoryDetails & {
  previewImagePath: string;
  storyUrl: string | null;
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

function getInstagramStoriesUrl(username: string | null): string | null {
  const resolvedUsername = username?.trim();

  return resolvedUsername
    ? `https://www.instagram.com/stories/${encodeURIComponent(resolvedUsername)}/`
    : null;
}

function getInstagramStoryMediaUrl(
  username: string | null,
  mediaPk: string,
): string | null {
  const storiesUrl = getInstagramStoriesUrl(username);

  return storiesUrl ? `${storiesUrl}${encodeURIComponent(mediaPk)}/` : null;
}

function formatStoryMediaType(mediaType: StoryMediaType | null | undefined): string {
  if (mediaType === STORY_MEDIA_TYPES.IMAGE) {
    return "Image";
  }

  if (mediaType === STORY_MEDIA_TYPES.VIDEO) {
    return "Vidéo";
  }

  return "";
}

function getUserManifestOrderByReelId(
  report: StoriesManifestReport,
): Map<string, number> {
  const orderByReelId = new Map<string, number>();

  for (const user of report.manifest.users) {
    const currentOrder = orderByReelId.get(user.reel_id);

    if (currentOrder === undefined || user.order < currentOrder) {
      orderByReelId.set(user.reel_id, user.order);
    }
  }

  return orderByReelId;
}

function getOutputUserRank(
  user: StoryOutputUser,
  orderByReelId: Map<string, number>,
): number {
  const orders = user.reel_ids
    .map((reelId) => orderByReelId.get(reelId))
    .filter((order): order is number => order !== undefined);

  return orders.length > 0 ? Math.min(...orders) : Number.MAX_SAFE_INTEGER;
}

function getRankedOutputUsers(report: StoriesManifestReport): StoryOutputUser[] {
  const orderByReelId = getUserManifestOrderByReelId(report);

  return report.output.users
    .map((user, originalIndex) => ({
      originalIndex,
      rank: getOutputUserRank(user, orderByReelId),
      user,
    }))
    .sort((left, right) => {
      const rankDelta = left.rank - right.rank;

      if (rankDelta !== 0) {
        return rankDelta;
      }

      return left.originalIndex - right.originalIndex;
    })
    .map((entry) => entry.user);
}

function formatPreviewButton(
  source: string,
  alt: string,
  storyUrl: string | null,
  userName: string,
  userAvatar: string | null,
  userImageIndex: number,
  userImageCount: number,
  storyDetails: LightboxStoryDetails,
): string {
  const escapedSource = escapeHtml(source);
  const escapedAlt = escapeHtml(alt);
  const storyUrlAttribute = storyUrl
    ? ` data-story-url="${escapeHtml(storyUrl)}"`
    : "";
  const userAvatarAttribute = userAvatar
    ? ` data-user-avatar="${escapeHtml(userAvatar)}"`
    : "";

  return [
    '<button class="story-image-button" type="button"',
    ` data-full-src="${escapedSource}"`,
    ` data-full-alt="${escapedAlt}"`,
    storyUrlAttribute,
    ` data-user-name="${escapeHtml(userName)}"`,
    userAvatarAttribute,
    ` data-user-image-index="${userImageIndex}"`,
    ` data-user-image-count="${userImageCount}"`,
    ` data-story-media-type="${escapeHtml(formatStoryMediaType(storyDetails.mediaType))}"`,
    ` data-story-media-pk="${escapeHtml(storyDetails.mediaPk)}"`,
    ` data-story-stickers="${escapeHtml(storyDetails.stickers)}"`,
    ` data-story-ig-caption="${escapeHtml(storyDetails.igCaption)}"`,
    ` data-story-apple-caption="${escapeHtml(storyDetails.appleCaption)}"`,
    ` data-story-ollama-vision="${escapeHtml(storyDetails.ollamaVision)}"`,
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
  const rankedUsers = getRankedOutputUsers(report);

  for (const [index, user] of rankedUsers.entries()) {
    const userName = formatUserName(user.full_name, user.username);
    const userKey = getReportUserKey(user, index);
    const profilePicUrl = user.profile_pic_url?.trim();
    const profileImagePath = profilePicUrl
      ? options.profilePicPathByUrl?.get(profilePicUrl) ?? profilePicUrl
      : null;
    const summary = options.userSummaryByUserKey?.get(userKey)?.trim() ?? "";
    const previewEntries = user.stories
      .map((story) => {
        const previewImageUrl = story.preview_image_url?.trim();
        const previewImagePath = previewImageUrl
          ? options.storyPreviewPathByUrl?.get(previewImageUrl) ?? previewImageUrl
          : null;
        const storyUrl = getInstagramStoryMediaUrl(user.username, story.media_pk);
        const ollamaVision = previewImageUrl
          ? options.ollamaVisionByPreviewUrl?.get(previewImageUrl) ?? ""
          : "";

        return previewImagePath
          ? {
              appleCaption: story.apple_caption.trim(),
              igCaption: story.ig_caption.trim(),
              mediaType: story.media_type ?? null,
              mediaPk: story.media_pk,
              ollamaVision: ollamaVision.trim(),
              previewImagePath,
              stickers: story.stickers.join(", "),
              storyUrl,
            }
          : null;
      })
      .filter(
        (
          entry,
        ): entry is PreviewEntry => entry !== null,
      );
    const previews = previewEntries
      .map((entry, previewIndex) =>
        [
          '<div class="story-slide">',
          formatPreviewButton(
            entry.previewImagePath,
            `aperçu ${entry.mediaPk}`,
            entry.storyUrl,
            userName,
            profileImagePath,
            previewIndex + 1,
            previewEntries.length,
            {
              appleCaption: entry.appleCaption,
              igCaption: entry.igCaption,
              mediaType: entry.mediaType,
              mediaPk: entry.mediaPk,
              ollamaVision: entry.ollamaVision,
              stickers: entry.stickers,
            },
          ),
          "</div>",
        ].join("\n"),
      )
      .join("\n");

    sections.push(
      [
        '<section class="user-section">',
        '<div class="user-header">',
        profileImagePath
          ? formatImage(profileImagePath, `${userName} avatar`, "avatar", 96, 96)
          : '<div class="avatar-placeholder"></div>',
        '<div class="user-title">',
        `<h2>${escapeHtml(userName)}</h2>`,
        "</div>",
        "</div>",
        summary ? `<p class="user-summary">${escapeHtml(summary)}</p>` : "",
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
    ".user-header{display:flex;align-items:center;gap:18px;margin:0 0 14px}",
    ".avatar,.avatar-placeholder{width:96px;height:96px;border-radius:8px;object-fit:cover;background:#d9dee7;flex:0 0 auto}",
    ".user-title{display:flex;align-items:center;gap:12px;flex-wrap:wrap}",
    "h2{font-size:21px;line-height:1.25;margin:0 0 9px;font-weight:650}",
    ".lightbox-story-link{display:inline-flex;align-items:center;justify-content:center;min-height:34px;padding:0 12px;border-radius:8px;background:#1f2933;color:#fff;text-decoration:none;font-size:14px;font-weight:620}",
    ".user-summary{max-width:1040px;margin:0 0 18px;color:#334250;font-size:23px;line-height:1.45;font-weight:420}",
    ".story-images{display:flex;gap:12px;align-items:flex-start;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scroll-padding-inline:2px;padding:2px 0 14px}",
    ".story-slide{flex:0 0 auto;scroll-snap-align:start;display:flex;flex-direction:column;gap:8px;align-items:flex-start}",
    ".story-image-button{appearance:none;border:0;padding:0;margin:0;background:transparent;cursor:zoom-in;border-radius:8px;line-height:0}",
    ".story-image-button:focus-visible{outline:3px solid #4f8cff;outline-offset:3px}",
    ".story-preview{width:210px;max-width:calc(55vw - 36px);height:auto;border-radius:8px;display:block;background:#eef2f6;box-shadow:0 1px 3px rgba(20,30,40,.18)}",
    "html.lightbox-open,html.lightbox-open body{overflow:hidden}",
    ".image-lightbox{width:100%;height:100%;max-width:none;max-height:none;border:0;margin:0;padding:28px;background:transparent;color:inherit;overflow:visible}",
    ".image-lightbox:not([open]){display:none}",
    ".image-lightbox[open]{display:flex;align-items:center;justify-content:center}",
    ".image-lightbox::backdrop{background:rgba(8,12,18,.82)}",
    ".lightbox-content{display:flex;align-items:stretch;width:min(100%,calc(100vw - 56px));max-width:1600px;height:min(900px,calc(100vh - 56px));overflow:hidden;border-radius:8px;background:#11161c;box-shadow:0 20px 60px rgba(0,0,0,.35)}",
    ".lightbox-preview-panel,.lightbox-details-panel{box-sizing:border-box;min-width:0;min-height:0}",
    ".lightbox-preview-panel{flex:0 1 auto;max-width:calc(100% - 320px);display:flex;flex-direction:column;background:#11161c}",
    ".lightbox-details-panel{flex:1 1 360px;overflow:auto;padding:18px;background:#f6f7f9;color:#1f2933}",
    ".lightbox-image{display:block;width:auto;height:auto;max-width:100%;max-height:calc(100% - 62px);margin:auto;object-fit:contain;background:#11161c}",
    ".lightbox-header{display:flex;align-items:center;gap:10px;min-height:42px;padding:10px 12px;color:#fff;background:#11161c}",
    ".lightbox-header[hidden]{display:none}",
    ".lightbox-avatar{width:42px;height:42px;border-radius:8px;object-fit:cover;background:#27313c;flex:0 0 auto}",
    ".lightbox-avatar[hidden]{display:none}",
    ".lightbox-user{min-width:0;display:flex;flex-direction:column;gap:2px}",
    ".lightbox-username{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;font-weight:680}",
    ".lightbox-count{color:rgba(255,255,255,.74);font-size:13px;font-weight:600}",
    ".lightbox-story-link{margin:14px 0 0;background:#1f2933;color:#fff}",
    ".lightbox-story-link[hidden]{display:none}",
    ".lightbox-details-title{margin:0 0 14px;font-size:18px;line-height:1.25;font-weight:680}",
    ".lightbox-details-table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff;border:1px solid #d8dee7;border-radius:8px;overflow:hidden}",
    ".lightbox-details-table th,.lightbox-details-table td{vertical-align:top;border-bottom:1px solid #d8dee7;padding:11px 12px;text-align:left;font-size:14px;line-height:1.45}",
    ".lightbox-details-table tr:last-child th,.lightbox-details-table tr:last-child td{border-bottom:0}",
    ".lightbox-details-table th{width:128px;color:#5b6876;background:#eef2f6;font-weight:650}",
    ".lightbox-details-table td{overflow-wrap:anywhere;white-space:pre-wrap}",
    ".lightbox-vision-details{margin:14px 0 0;border:1px solid #d8dee7;border-radius:8px;background:#fff}",
    ".lightbox-vision-details summary{padding:11px 12px;cursor:pointer;font-size:14px;font-weight:650;color:#334250}",
    ".lightbox-vision-text{margin:0;padding:0 12px 12px;color:#1f2933;font-size:14px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}",
    ".lightbox-close,.lightbox-nav{position:absolute;width:42px;height:42px;border-radius:8px;border:1px solid rgba(255,255,255,.35);background:rgba(8,12,18,.7);color:#fff;font-size:28px;line-height:1;cursor:pointer}",
    ".lightbox-close{top:16px;right:16px}",
    ".lightbox-nav{top:50%;transform:translateY(-50%)}",
    ".lightbox-prev{left:16px}",
    ".lightbox-next{right:16px}",
    ".lightbox-nav[hidden]{display:none}",
    "@media (max-width:760px){.image-lightbox[open]{align-items:stretch}.image-lightbox{padding:12px}.lightbox-content{flex-direction:column;width:100%;height:100%;max-height:none}.lightbox-preview-panel{flex:1 1 auto;max-width:none}.lightbox-details-panel{flex:0 1 auto;min-height:34%;padding:14px}.lightbox-image{max-height:calc(100% - 62px)}.lightbox-details-table,.lightbox-details-table tbody,.lightbox-details-table tr,.lightbox-details-table th,.lightbox-details-table td{display:block;width:auto}.lightbox-details-table tr{border-bottom:1px solid #d8dee7}.lightbox-details-table tr:last-child{border-bottom:0}.lightbox-details-table th,.lightbox-details-table td{border-bottom:0;padding:8px 10px}.lightbox-details-table th{background:#eef2f6}.lightbox-details-table td{padding-top:0}.lightbox-close{top:12px;right:12px}.lightbox-prev{left:12px}.lightbox-next{right:12px}}",
    "@media (max-width:640px){main{padding:24px 16px 40px}.user-header{gap:12px}.avatar,.avatar-placeholder{width:68px;height:68px}.user-title{display:block}.user-summary{font-size:19px}.story-preview{width:72vw;max-width:none}}",
    "@media (prefers-color-scheme:dark){:root,body{background:#11161c;color:#e5e9ef}.user-summary{color:#d3dae3}.avatar-placeholder,.story-preview{background:#27313c}.lightbox-details-panel{background:#1b222b;color:#e5e9ef}.lightbox-details-table,.lightbox-vision-details{background:#11161c;border-color:#34404d}.lightbox-details-table th,.lightbox-details-table td{border-color:#34404d}.lightbox-details-table th{background:#27313c;color:#b8c3cf}.lightbox-details-table td,.lightbox-vision-text{color:#e5e9ef}.lightbox-vision-details summary{color:#e5e9ef}}",
    "</style>",
    "</head>",
    "<body>",
    "<main>",
    `<h1>Rapport du ${escapeHtml(formatReportDate(report.metadata.created_at, options))}</h1>`,
    sections.join("\n"),
    "</main>",
    '<dialog class="image-lightbox" id="image-lightbox" aria-label="Aperçu de l’image">',
    '<button class="lightbox-close" type="button" aria-label="Fermer l’aperçu">&times;</button>',
    '<button class="lightbox-nav lightbox-prev" type="button" aria-label="Image précédente" hidden>&lsaquo;</button>',
    '<div class="lightbox-content">',
    '<div class="lightbox-preview-panel">',
    '<div class="lightbox-header" hidden>',
    '<img class="lightbox-avatar" alt="" hidden>',
    '<div class="lightbox-user">',
    '<strong class="lightbox-username"></strong>',
    '<span class="lightbox-count"></span>',
    "</div>",
    "</div>",
    '<img class="lightbox-image" alt="">',
    "</div>",
    '<aside class="lightbox-details-panel" aria-label="Détails de la story">',
    '<h2 class="lightbox-details-title">Détails</h2>',
    '<table class="lightbox-details-table">',
    "<tbody>",
    '<tr><th scope="row">Type</th><td class="lightbox-detail-media-type"></td></tr>',
    '<tr><th scope="row">Story</th><td class="lightbox-detail-media-pk"></td></tr>',
    '<tr><th scope="row">Stickers</th><td class="lightbox-detail-stickers"></td></tr>',
    '<tr><th scope="row">Instagram</th><td class="lightbox-detail-ig-caption"></td></tr>',
    '<tr><th scope="row">Apple</th><td class="lightbox-detail-apple-caption"></td></tr>',
    "</tbody>",
    "</table>",
    '<details class="lightbox-vision-details">',
    "<summary>Résumé vision</summary>",
    '<p class="lightbox-vision-text"></p>',
    "</details>",
    '<a class="lightbox-story-link" href="#" target="_blank" rel="noreferrer" hidden>Voir cette story sur Instagram</a>',
    "</aside>",
    "</div>",
    '<button class="lightbox-nav lightbox-next" type="button" aria-label="Image suivante" hidden>&rsaquo;</button>',
    "</dialog>",
    "<script>",
    "const lightbox=document.getElementById('image-lightbox');",
    "const lightboxImage=lightbox?.querySelector('.lightbox-image');",
    "const lightboxHeader=lightbox?.querySelector('.lightbox-header');",
    "const lightboxAvatar=lightbox?.querySelector('.lightbox-avatar');",
    "const lightboxUsername=lightbox?.querySelector('.lightbox-username');",
    "const lightboxCount=lightbox?.querySelector('.lightbox-count');",
    "const lightboxStoryLink=lightbox?.querySelector('.lightbox-story-link');",
    "const lightboxMediaType=lightbox?.querySelector('.lightbox-detail-media-type');",
    "const lightboxMediaPk=lightbox?.querySelector('.lightbox-detail-media-pk');",
    "const lightboxStickers=lightbox?.querySelector('.lightbox-detail-stickers');",
    "const lightboxIgCaption=lightbox?.querySelector('.lightbox-detail-ig-caption');",
    "const lightboxAppleCaption=lightbox?.querySelector('.lightbox-detail-apple-caption');",
    "const lightboxVisionDetails=lightbox?.querySelector('.lightbox-vision-details');",
    "const lightboxVisionText=lightbox?.querySelector('.lightbox-vision-text');",
    "const lightboxPrev=lightbox?.querySelector('.lightbox-prev');",
    "const lightboxNext=lightbox?.querySelector('.lightbox-next');",
    "const storyImageButtons=Array.from(document.querySelectorAll('.story-image-button'));",
    "let lightboxIndex=-1;",
    "const updateLightboxNav=()=>{const canNavigate=storyImageButtons.length>1;if(lightboxPrev){lightboxPrev.hidden=!canNavigate;}if(lightboxNext){lightboxNext.hidden=!canNavigate;}};",
    "const updateLightboxHeader=(button)=>{if(lightboxHeader){lightboxHeader.hidden=false;}if(lightboxUsername){lightboxUsername.textContent=button.dataset.userName||'';}if(lightboxCount){lightboxCount.textContent=`${button.dataset.userImageIndex||''} / ${button.dataset.userImageCount||''}`.trim();}if(lightboxAvatar){if(button.dataset.userAvatar){lightboxAvatar.src=button.dataset.userAvatar;lightboxAvatar.alt=`${button.dataset.userName||''} avatar`;lightboxAvatar.hidden=false;}else{lightboxAvatar.hidden=true;lightboxAvatar.removeAttribute('src');lightboxAvatar.alt='';}}};",
    "const updateLightboxDetails=(button)=>{if(lightboxMediaType){lightboxMediaType.textContent=button.dataset.storyMediaType||'—';}if(lightboxMediaPk){lightboxMediaPk.textContent=button.dataset.storyMediaPk||'—';}if(lightboxStickers){lightboxStickers.textContent=button.dataset.storyStickers||'—';}if(lightboxIgCaption){lightboxIgCaption.textContent=button.dataset.storyIgCaption||'—';}if(lightboxAppleCaption){lightboxAppleCaption.textContent=button.dataset.storyAppleCaption||'—';}if(lightboxVisionText){lightboxVisionText.textContent=button.dataset.storyOllamaVision||'—';}if(lightboxVisionDetails){lightboxVisionDetails.open=false;}};",
    "const clearLightboxState=()=>{if(!lightboxImage)return;lightboxImage.removeAttribute('src');lightboxImage.alt='';lightboxIndex=-1;document.documentElement.classList.remove('lightbox-open');if(lightboxHeader){lightboxHeader.hidden=true;}if(lightboxAvatar){lightboxAvatar.hidden=true;lightboxAvatar.removeAttribute('src');lightboxAvatar.alt='';}if(lightboxUsername){lightboxUsername.textContent='';}if(lightboxCount){lightboxCount.textContent='';}if(lightboxStoryLink){lightboxStoryLink.setAttribute('hidden','');lightboxStoryLink.removeAttribute('href');}if(lightboxMediaType){lightboxMediaType.textContent='';}if(lightboxMediaPk){lightboxMediaPk.textContent='';}if(lightboxStickers){lightboxStickers.textContent='';}if(lightboxIgCaption){lightboxIgCaption.textContent='';}if(lightboxAppleCaption){lightboxAppleCaption.textContent='';}if(lightboxVisionText){lightboxVisionText.textContent='';}if(lightboxVisionDetails){lightboxVisionDetails.open=false;}};",
    "const openLightboxAt=(index)=>{if(!lightbox||!lightboxImage||storyImageButtons.length===0)return;lightboxIndex=(index+storyImageButtons.length)%storyImageButtons.length;const button=storyImageButtons[lightboxIndex];lightboxImage.src=button.dataset.fullSrc||'';lightboxImage.alt=button.dataset.fullAlt||'';updateLightboxHeader(button);updateLightboxDetails(button);if(lightboxStoryLink){if(button.dataset.storyUrl){lightboxStoryLink.href=button.dataset.storyUrl;lightboxStoryLink.removeAttribute('hidden');}else{lightboxStoryLink.setAttribute('hidden','');lightboxStoryLink.removeAttribute('href');}}updateLightboxNav();document.documentElement.classList.add('lightbox-open');if(!lightbox.open){if(typeof lightbox.showModal==='function'){lightbox.showModal();}else{lightbox.setAttribute('open','');}}};",
    "const closeLightbox=()=>{if(!lightbox)return;if(lightbox.open&&typeof lightbox.close==='function'){lightbox.close();}else{lightbox.removeAttribute('open');clearLightboxState();}};",
    "storyImageButtons.forEach((button,index)=>{button.addEventListener('click',()=>openLightboxAt(index));});",
    "lightbox?.addEventListener('click',(event)=>{if(event.target===lightbox)closeLightbox();});",
    "lightbox?.addEventListener('close',clearLightboxState);",
    "lightbox?.querySelector('.lightbox-close')?.addEventListener('click',closeLightbox);",
    "lightboxPrev?.addEventListener('click',()=>openLightboxAt(lightboxIndex-1));",
    "lightboxNext?.addEventListener('click',()=>openLightboxAt(lightboxIndex+1));",
    "document.addEventListener('keydown',(event)=>{if(!lightbox?.open)return;if(event.key==='Escape')return;if(event.key==='ArrowLeft')openLightboxAt(lightboxIndex-1);if(event.key==='ArrowRight')openLightboxAt(lightboxIndex+1);});",
    "</script>",
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
