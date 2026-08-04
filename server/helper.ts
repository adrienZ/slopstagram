import {
  type StoriesManifestReport,
  type StoryOutputUser,
} from "../scripts/lib/types.ts";

export const reportCss = `
:root{color-scheme:light dark;font-family:Inter,ui-sans-serif,system-ui,sans-serif;background:#f6f7f9;color:#1f2933}body{margin:0;background:#f6f7f9;color:#1f2933}main{max-width:1440px;margin:auto;padding:32px 24px 48px}h1{font-size:28px;margin:0 0 28px}h2{font-size:21px;margin:0 0 9px}.user-section{margin:0 0 42px}.user-header{display:flex;align-items:center;gap:18px;margin-bottom:14px}.avatar,.avatar-placeholder{width:96px;height:96px;border-radius:8px;object-fit:cover;background:#d9dee7}.user-summary{max-width:1040px;margin:0 0 18px;font-size:23px;line-height:1.45}.story-images{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 0 14px}.story-slide{flex:none;scroll-snap-align:start}.story-image-button{border:0;padding:0;background:transparent;cursor:zoom-in}.story-preview{width:210px;max-width:calc(55vw - 36px);border-radius:8px;display:block;box-shadow:0 1px 3px #0003}.image-lightbox{width:100%;height:100%;max-width:none;max-height:none;border:0;padding:28px;background:transparent}.image-lightbox::backdrop{background:#080c12d1}.lightbox-content{display:flex;width:min(100%,calc(100vw - 56px));height:min(900px,calc(100vh - 56px));margin:auto;overflow:hidden;border-radius:8px;background:#11161c}.lightbox-preview-panel{flex:0 1 auto;max-width:calc(100% - 320px);display:flex;flex-direction:column}.lightbox-header{display:flex;align-items:center;gap:10px;padding:10px 12px;color:#fff}.lightbox-avatar{width:42px;height:42px;border-radius:8px;object-fit:cover}.lightbox-image{width:auto;height:auto;max-width:100%;max-height:calc(100% - 62px);margin:auto;object-fit:contain}.lightbox-details-panel{flex:1 1 360px;overflow:auto;padding:18px;background:#f6f7f9}.lightbox-details-table{width:100%;border-collapse:collapse;table-layout:fixed;background:#fff}.lightbox-details-table th,.lightbox-details-table td{vertical-align:top;border:1px solid #d8dee7;padding:11px 12px;text-align:left;white-space:pre-wrap;overflow-wrap:anywhere}.lightbox-details-table th{width:128px;background:#eef2f6}.lightbox-close,.lightbox-nav{position:absolute;width:42px;height:42px;border:1px solid #fff6;border-radius:8px;background:#080c12b3;color:#fff;font-size:28px;cursor:pointer}.lightbox-close{top:16px;right:16px}.lightbox-nav{top:50%}.lightbox-prev{left:16px}.lightbox-next{right:16px}.lightbox-story-link{display:inline-block;margin-top:14px;padding:9px 12px;border-radius:8px;background:#1f2933;color:#fff;text-decoration:none}@media(max-width:760px){main{padding:24px 16px}.image-lightbox{padding:12px}.lightbox-content{width:100%;height:100%;flex-direction:column}.lightbox-preview-panel{max-width:none}.lightbox-details-panel{min-height:34%;padding:14px}.lightbox-details-table,.lightbox-details-table tbody,.lightbox-details-table tr,.lightbox-details-table th,.lightbox-details-table td{display:block;width:auto}.lightbox-details-table th,.lightbox-details-table td{border:0;padding:8px 10px}.story-preview{width:72vw;max-width:none}}`;

export const reportHeaderCss = `
.report-page-header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:0 0 30px;padding:16px 18px;border:1px solid #d8dee7;border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(20,30,40,.08)}.report-page-header__eyebrow{margin:0 0 3px;color:#667585;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.report-page-header__title{margin:0;font-size:18px;font-weight:680}.report-picker{display:flex;align-items:center;gap:10px}.report-picker label{font-size:14px;font-weight:650}.report-picker select{min-width:260px;padding:9px 34px 9px 11px;border:1px solid #b9c4d0;border-radius:8px;background:#fff;color:#1f2933;font:inherit}@media(max-width:640px){.report-page-header{align-items:flex-start;flex-direction:column}.report-picker{width:100%;align-items:stretch;flex-direction:column}.report-picker select{width:100%}}`;

export const reportPickerScript = `
document.querySelector('#report-picker')?.addEventListener('change',event=>event.currentTarget.form?.requestSubmit());`;

export const lightboxScript = `
const dialog=document.querySelector('#image-lightbox'),buttons=[...document.querySelectorAll('.story-image-button')];let index=-1;const q=s=>dialog.querySelector(s),image=q('.lightbox-image'),avatar=q('.lightbox-avatar'),username=q('.lightbox-username'),count=q('.lightbox-count'),link=q('.lightbox-story-link'),fields={mediaType:q('.lightbox-detail-media-type'),mediaPk:q('.lightbox-detail-media-pk'),stickers:q('.lightbox-detail-stickers'),locations:q('.lightbox-detail-locations'),igCaption:q('.lightbox-detail-ig-caption'),appleCaption:q('.lightbox-detail-apple-caption'),visionOcr:q('.lightbox-detail-vision-ocr'),visionDescription:q('.lightbox-detail-vision-description')};function openAt(next){if(!buttons.length)return;index=(next+buttons.length)%buttons.length;const data=buttons[index].dataset;image.src=data.fullSrc||'';image.alt=data.fullAlt||'';username.textContent=data.userName||'';count.textContent=(data.userImageIndex||'')+' / '+(data.userImageCount||'');if(data.userAvatar){avatar.src=data.userAvatar;avatar.hidden=false}else avatar.hidden=true;for(const[name,field]of Object.entries(fields))field.textContent=data['story'+name[0].toUpperCase()+name.slice(1)]||'—';if(data.storyUrl){link.href=data.storyUrl;link.hidden=false}else link.hidden=true;q('.lightbox-prev').hidden=q('.lightbox-next').hidden=buttons.length<2;if(!dialog.open)dialog.showModal()}buttons.forEach((button,i)=>button.addEventListener('click',()=>openAt(i)));q('.lightbox-close').addEventListener('click',()=>dialog.close());q('.lightbox-prev').addEventListener('click',()=>openAt(index-1));q('.lightbox-next').addEventListener('click',()=>openAt(index+1));dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close()});document.addEventListener('keydown',event=>{if(!dialog.open||event.key==='Escape')return;if(event.key==='ArrowLeft')openAt(index-1);if(event.key==='ArrowRight')openAt(index+1)});`;

export function formatReportDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fr-FR", {
        day: "numeric", hour: "2-digit", hour12: false, minute: "2-digit",
        month: "long", timeZoneName: "short", year: "numeric",
      }).format(date).replace(",", " à");
}

export function formatUserName(user: StoryOutputUser): string {
  const fullName = user.full_name?.trim();
  const username = user.username?.trim();
  return fullName && username
    ? `${fullName} (${username})`
    : fullName || username || "Utilisateur inconnu";
}

export function getRankedUsers(report: StoriesManifestReport): StoryOutputUser[] {
  const orderByReel = new Map<string, number>();
  for (const user of report.manifest.users) {
    orderByReel.set(user.reel_id, Math.min(orderByReel.get(user.reel_id) ?? Infinity, user.order));
  }
  return report.output.users
    .map((user, index) => ({ index, rank: Math.min(...user.reel_ids.map((id) => orderByReel.get(id) ?? Infinity)), user }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ user }) => user);
}

export function getStoryUrl(username: string | null, mediaPk: string): string | undefined {
  return username?.trim()
    ? `https://www.instagram.com/stories/${encodeURIComponent(username)}/${encodeURIComponent(mediaPk)}/`
    : undefined;
}
