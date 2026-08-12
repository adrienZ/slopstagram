import { type StoriesManifestReport, type StoryOutputUser } from "../sdk/lib/types.ts";

export const reportPickerScript = `
document.querySelector("#report-picker")?.addEventListener("change", (event) => {
  event.currentTarget.form?.requestSubmit();
});
`;

export const lightboxScript = `
const dialog = document.querySelector("#image-lightbox");
const buttons = [...document.querySelectorAll(".story-image-button")];
const openParam = "story";

if (dialog) {
  let index = -1;
  const q = (selector) => dialog.querySelector(selector);
  const image = q(".lightbox-image");
  const avatar = q(".lightbox-avatar");
  const username = q(".lightbox-username");
  const count = q(".lightbox-count");
  const link = q(".lightbox-story-link");
  const previousButton = q(".lightbox-prev");
  const nextButton = q(".lightbox-next");
  const fields = {
    mediaType: q(".lightbox-detail-media-type"),
    mediaPk: q(".lightbox-detail-media-pk"),
    stickers: q(".lightbox-detail-stickers"),
    locations: q(".lightbox-detail-locations"),
    igCaption: q(".lightbox-detail-ig-caption"),
    appleCaption: q(".lightbox-detail-apple-caption"),
    visionOcr: q(".lightbox-detail-vision-ocr"),
    visionDescription: q(".lightbox-detail-vision-description"),
  };

  function updateOpenParam(value) {
    if (!value) return;

    const url = new URL(location.href);
    if (url.searchParams.get(openParam) === value) return;

    url.searchParams.set(openParam, value);
    history.replaceState(null, "", url);
  }

  function clearOpenParam() {
    const url = new URL(location.href);
    if (!url.searchParams.has(openParam)) return;

    url.searchParams.delete(openParam);
    history.replaceState(null, "", url);
  }

  function openAt(next) {
    if (!buttons.length) return;

    index = (next + buttons.length) % buttons.length;
    const data = buttons[index].dataset;
    image.src = data.fullSrc || "";
    image.alt = data.fullAlt || "";
    username.textContent = data.userName || "";
    count.textContent = (data.userImageIndex || "") + " / " + (data.userImageCount || "");

    if (data.userAvatar) {
      avatar.src = data.userAvatar;
      avatar.hidden = false;
    } else {
      avatar.hidden = true;
    }

    for (const [name, field] of Object.entries(fields)) {
      field.textContent = data["story" + name[0].toUpperCase() + name.slice(1)] || "—";
    }

    if (data.storyUrl) {
      link.href = data.storyUrl;
      link.hidden = false;
    } else {
      link.hidden = true;
    }

    previousButton.hidden = buttons.length < 2;
    nextButton.hidden = buttons.length < 2;
    updateOpenParam(data.storyMediaPk);

    if (!dialog.open) {
      dialog.showModal();
    }
  }

  buttons.forEach((button, i) => {
    button.addEventListener("click", () => openAt(i));
  });

  q(".lightbox-close").addEventListener("click", () => dialog.close());
  previousButton.addEventListener("click", () => openAt(index - 1));
  nextButton.addEventListener("click", () => openAt(index + 1));

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", clearOpenParam);

  document.addEventListener("keydown", (event) => {
    if (!dialog.open || event.key === "Escape") return;
    if (event.key === "ArrowLeft") openAt(index - 1);
    if (event.key === "ArrowRight") openAt(index + 1);
  });

  const initialStory = new URL(location.href).searchParams.get(openParam);
  if (initialStory) {
    const initialIndex = buttons.findIndex((button) => button.dataset.storyMediaPk === initialStory);
    if (initialIndex >= 0) openAt(initialIndex);
  }
}
`;

export function formatReportDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        hour: "2-digit",
        hour12: false,
        minute: "2-digit",
        month: "long",
        timeZone: "Europe/Paris",
        timeZoneName: "short",
        year: "numeric",
      })
        .format(date)
        .replace(",", " à");
}

export function formatUserName(user: StoryOutputUser): string {
  const fullName = user.full_name?.trim();
  const username = user.username.trim();
  if (fullName !== undefined && fullName.length > 0 && username.length > 0) {
    return `${fullName} (${username})`;
  }

  return fullName !== undefined && fullName.length > 0 ? fullName : username;
}

export function getRankedUsers(report: StoriesManifestReport): StoryOutputUser[] {
  const orderByReel = new Map<string, number>();
  for (const user of report.manifest.users) {
    orderByReel.set(user.reel_id, Math.min(orderByReel.get(user.reel_id) ?? Infinity, user.order));
  }
  return report.output.users
    .map((user, index) => ({
      index,
      rank: Math.min(...user.reel_ids.map((id) => orderByReel.get(id) ?? Infinity)),
      user,
    }))
    .toSorted((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ user }) => user);
}

export function getStoryUrl(username: string, mediaPk: string): string {
  return `https://www.instagram.com/stories/${encodeURIComponent(username.trim())}/${encodeURIComponent(mediaPk)}/`;
}
