import cx from "clsx";
import { css } from "mono-jsx/jsx-runtime";

export const lightboxStyles = css`
  .image-lightbox {
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    border: 0;
    padding: 28px;
    background: transparent;
  }

  .image-lightbox::backdrop {
    background: #080c12d1;
  }

  .lightbox-close,
  .lightbox-nav {
    position: absolute;
    width: 42px;
    height: 42px;
    border: 1px solid #fff6;
    border-radius: 8px;
    background: #080c12b3;
    color: #fff;
    font-size: 28px;
    cursor: pointer;
  }

  .lightbox-close {
    top: 16px;
    right: 16px;
  }

  .lightbox-nav {
    top: 50%;
  }

  .lightbox-prev {
    left: 16px;
  }

  .lightbox-next {
    right: 16px;
  }

  .lightbox-content {
    display: flex;
    width: min(100%, calc(100vw - 56px));
    height: min(900px, calc(100vh - 56px));
    margin: auto;
    overflow: hidden;
    border-radius: 8px;
    background: #11161c;
  }

  .lightbox-preview-panel {
    flex: 0 1 auto;
    max-width: calc(100% - 320px);
    display: flex;
    flex-direction: column;
  }

  .lightbox-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    color: #fff;
  }

  .lightbox-avatar {
    width: 42px;
    height: 42px;
    border-radius: 8px;
    object-fit: cover;
  }

  .lightbox-image {
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: calc(100% - 62px);
    margin: auto;
    object-fit: contain;
  }

  .lightbox-details-panel {
    flex: 1 1 360px;
    overflow: auto;
    padding: 18px;
    background: #f6f7f9;
    color: #1f2933;
  }

  .lightbox-details-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    background: #fff;
    color: #1f2933;
  }

  .lightbox-details-table th,
  .lightbox-details-table td {
    vertical-align: top;
    border: 1px solid #d8dee7;
    padding: 11px 12px;
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .lightbox-details-table th {
    width: 128px;
    background: #eef2f6;
  }

  .lightbox-story-link {
    display: inline-block;
    margin-top: 14px;
    padding: 9px 12px;
    border-radius: 8px;
    background: #1f2933;
    color: #fff;
    text-decoration: none;
  }

  @media (max-width: 760px) {
    .image-lightbox {
      padding: 12px;
    }

    .lightbox-content {
      width: 100%;
      height: 100%;
      flex-direction: column;
    }

    .lightbox-preview-panel {
      max-width: none;
    }

    .lightbox-details-panel {
      min-height: 34%;
      padding: 14px;
    }

    .lightbox-details-table,
    .lightbox-details-table tbody,
    .lightbox-details-table tr,
    .lightbox-details-table th,
    .lightbox-details-table td {
      display: block;
      width: auto;
    }

    .lightbox-details-table th,
    .lightbox-details-table td {
      border: 0;
      padding: 8px 10px;
    }
  }
`;

export function LightboxStyles() {
  return <style>{lightboxStyles}</style>;
}

export function Lightbox() {
  return (
    <dialog class={cx("image-lightbox")} id="image-lightbox" aria-label="Aperçu de l’image">
      <button class={cx("lightbox-close")} type="button" aria-label="Fermer l’aperçu">
        ×
      </button>
      <button
        class={cx("lightbox-nav", "lightbox-prev")}
        type="button"
        aria-label="Image précédente"
        hidden
      >
        ‹
      </button>
      <div class={cx("lightbox-content")}>
        <div class={cx("lightbox-preview-panel")}>
          <div class={cx("lightbox-header")}>
            <img class={cx("lightbox-avatar")} alt="" hidden />
            <div>
              <strong class="lightbox-username" />
              <span class="lightbox-count" />
            </div>
          </div>
          <img class={cx("lightbox-image")} alt="" />
        </div>
        <aside class={cx("lightbox-details-panel")} aria-label="Détails de la story">
          <h2>Détails</h2>
          <table class={cx("lightbox-details-table")}>
            <tbody>
              <tr>
                <th>Type</th>
                <td class="lightbox-detail-media-type" />
              </tr>
              <tr>
                <th>Story</th>
                <td class="lightbox-detail-media-pk" />
              </tr>
              <tr>
                <th>Stickers</th>
                <td class="lightbox-detail-stickers" />
              </tr>
              <tr>
                <th>Lieux</th>
                <td class="lightbox-detail-locations" />
              </tr>
              <tr>
                <th>Instagram</th>
                <td class="lightbox-detail-ig-caption" />
              </tr>
              <tr>
                <th>Apple OCR</th>
                <td class="lightbox-detail-apple-caption" />
              </tr>
              <tr>
                <th>Vision OCR</th>
                <td class="lightbox-detail-vision-ocr" />
              </tr>
              <tr>
                <th>Vision description</th>
                <td class="lightbox-detail-vision-description" />
              </tr>
            </tbody>
          </table>
          <a class={cx("lightbox-story-link")} target="_blank" rel="noreferrer" hidden>
            Voir cette story sur Instagram
          </a>
        </aside>
      </div>
      <button
        class={cx("lightbox-nav", "lightbox-next")}
        type="button"
        aria-label="Image suivante"
        hidden
      >
        ›
      </button>
    </dialog>
  );
}
