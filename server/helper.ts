import { type StoriesManifestReport, type StoryOutputUser } from "../scripts/lib/types.ts";

export const reportPickerScript = `
document.querySelector('#report-picker')?.addEventListener('change',event=>event.currentTarget.form?.requestSubmit());`;

export const lightboxScript = `
const dialog=document.querySelector('#image-lightbox'),buttons=[...document.querySelectorAll('.story-image-button')];let index=-1;const q=s=>dialog.querySelector(s),image=q('.lightbox-image'),avatar=q('.lightbox-avatar'),username=q('.lightbox-username'),count=q('.lightbox-count'),link=q('.lightbox-story-link'),fields={mediaType:q('.lightbox-detail-media-type'),mediaPk:q('.lightbox-detail-media-pk'),stickers:q('.lightbox-detail-stickers'),locations:q('.lightbox-detail-locations'),igCaption:q('.lightbox-detail-ig-caption'),appleCaption:q('.lightbox-detail-apple-caption'),visionOcr:q('.lightbox-detail-vision-ocr'),visionDescription:q('.lightbox-detail-vision-description')};function openAt(next){if(!buttons.length)return;index=(next+buttons.length)%buttons.length;const data=buttons[index].dataset;image.src=data.fullSrc||'';image.alt=data.fullAlt||'';username.textContent=data.userName||'';count.textContent=(data.userImageIndex||'')+' / '+(data.userImageCount||'');if(data.userAvatar){avatar.src=data.userAvatar;avatar.hidden=false}else avatar.hidden=true;for(const[name,field]of Object.entries(fields))field.textContent=data['story'+name[0].toUpperCase()+name.slice(1)]||'—';if(data.storyUrl){link.href=data.storyUrl;link.hidden=false}else link.hidden=true;q('.lightbox-prev').hidden=q('.lightbox-next').hidden=buttons.length<2;if(!dialog.open)dialog.showModal()}buttons.forEach((button,i)=>button.addEventListener('click',()=>openAt(i)));q('.lightbox-close').addEventListener('click',()=>dialog.close());q('.lightbox-prev').addEventListener('click',()=>openAt(index-1));q('.lightbox-next').addEventListener('click',()=>openAt(index+1));dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});document.addEventListener('keydown',event=>{if(!dialog.open||event.key==='Escape')return;if(event.key==='ArrowLeft')openAt(index-1);if(event.key==='ArrowRight')openAt(index+1)});`;

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
  return fullName && username ? `${fullName} (${username})` : fullName || username;
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
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ user }) => user);
}

export function getStoryUrl(username: string, mediaPk: string): string {
  return `https://www.instagram.com/stories/${encodeURIComponent(username.trim())}/${encodeURIComponent(mediaPk)}/`;
}
