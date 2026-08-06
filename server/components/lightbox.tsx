import { css, cx } from "hono/css";

const dialogClass = css`
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  border: 0;
  padding: 28px;
  background: transparent;

  &::backdrop {
    background: #080c12d1;
  }

  @media (max-width: 760px) {
    padding: 12px;
  }
`;

const closeClass = css`
  position: absolute;
  top: 16px;
  right: 16px;
  width: 42px;
  height: 42px;
  border: 1px solid #fff6;
  border-radius: 8px;
  background: #080c12b3;
  color: #fff;
  font-size: 28px;
  cursor: pointer;
`;

const navClass = css`
  position: absolute;
  top: 50%;
  width: 42px;
  height: 42px;
  border: 1px solid #fff6;
  border-radius: 8px;
  background: #080c12b3;
  color: #fff;
  font-size: 28px;
  cursor: pointer;
`;

const prevClass = css`
  left: 16px;
`;

const nextClass = css`
  right: 16px;
`;

const contentClass = css`
  display: flex;
  width: min(100%, calc(100vw - 56px));
  height: min(900px, calc(100vh - 56px));
  margin: auto;
  overflow: hidden;
  border-radius: 8px;
  background: #11161c;

  @media (max-width: 760px) {
    width: 100%;
    height: 100%;
    flex-direction: column;
  }
`;

const previewPanelClass = css`
  flex: 0 1 auto;
  max-width: calc(100% - 320px);
  display: flex;
  flex-direction: column;

  @media (max-width: 760px) {
    max-width: none;
  }
`;

const headerClass = css`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  color: #fff;
`;

const avatarClass = css`
  width: 42px;
  height: 42px;
  border-radius: 8px;
  object-fit: cover;
`;

const imageClass = css`
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: calc(100% - 62px);
  margin: auto;
  object-fit: contain;
`;

const detailsPanelClass = css`
  flex: 1 1 360px;
  overflow: auto;
  padding: 18px;
  background: #f6f7f9;

  @media (max-width: 760px) {
    min-height: 34%;
    padding: 14px;
  }
`;

const detailsTableClass = css`
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  background: #fff;

  th,
  td {
    vertical-align: top;
    border: 1px solid #d8dee7;
    padding: 11px 12px;
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  th {
    width: 128px;
    background: #eef2f6;
  }

  @media (max-width: 760px) {
    &,
    tbody,
    tr,
    th,
    td {
      display: block;
      width: auto;
    }

    th,
    td {
      border: 0;
      padding: 8px 10px;
    }
  }
`;

const storyLinkClass = css`
  display: inline-block;
  margin-top: 14px;
  padding: 9px 12px;
  border-radius: 8px;
  background: #1f2933;
  color: #fff;
  text-decoration: none;
`;

export function Lightbox() {
  return (
    <dialog class={cx("image-lightbox", dialogClass)} id="image-lightbox" aria-label="Aperçu de l’image">
      <button class={cx("lightbox-close", closeClass)} type="button" aria-label="Fermer l’aperçu">×</button>
      <button class={cx("lightbox-nav lightbox-prev", navClass, prevClass)} type="button" aria-label="Image précédente" hidden>‹</button>
      <div class={cx("lightbox-content", contentClass)}>
        <div class={cx("lightbox-preview-panel", previewPanelClass)}>
          <div class={cx("lightbox-header", headerClass)}><img class={cx("lightbox-avatar", avatarClass)} alt="" hidden /><div><strong class="lightbox-username" /><span class="lightbox-count" /></div></div>
          <img class={cx("lightbox-image", imageClass)} alt="" />
        </div>
        <aside class={cx("lightbox-details-panel", detailsPanelClass)} aria-label="Détails de la story">
          <h2>Détails</h2>
          <table class={cx("lightbox-details-table", detailsTableClass)}><tbody>
            <tr><th>Type</th><td class="lightbox-detail-media-type" /></tr>
            <tr><th>Story</th><td class="lightbox-detail-media-pk" /></tr>
            <tr><th>Stickers</th><td class="lightbox-detail-stickers" /></tr>
            <tr><th>Lieux</th><td class="lightbox-detail-locations" /></tr>
            <tr><th>Instagram</th><td class="lightbox-detail-ig-caption" /></tr>
            <tr><th>Apple OCR</th><td class="lightbox-detail-apple-caption" /></tr>
            <tr><th>Vision OCR</th><td class="lightbox-detail-vision-ocr" /></tr>
            <tr><th>Vision description</th><td class="lightbox-detail-vision-description" /></tr>
          </tbody></table>
          <a class={cx("lightbox-story-link", storyLinkClass)} target="_blank" rel="noreferrer" hidden>Voir cette story sur Instagram</a>
        </aside>
      </div>
      <button class={cx("lightbox-nav lightbox-next", navClass, nextClass)} type="button" aria-label="Image suivante" hidden>›</button>
    </dialog>
  );
}
