export function Lightbox() {
  return (
    <dialog class="image-lightbox" id="image-lightbox" aria-label="Aperçu de l’image">
      <button class="lightbox-close" type="button" aria-label="Fermer l’aperçu">×</button>
      <button class="lightbox-nav lightbox-prev" type="button" aria-label="Image précédente" hidden>‹</button>
      <div class="lightbox-content">
        <div class="lightbox-preview-panel">
          <div class="lightbox-header"><img class="lightbox-avatar" alt="" hidden /><div><strong class="lightbox-username" /><span class="lightbox-count" /></div></div>
          <img class="lightbox-image" alt="" />
        </div>
        <aside class="lightbox-details-panel" aria-label="Détails de la story">
          <h2>Détails</h2>
          <table class="lightbox-details-table"><tbody>
            <tr><th>Type</th><td class="lightbox-detail-media-type" /></tr>
            <tr><th>Story</th><td class="lightbox-detail-media-pk" /></tr>
            <tr><th>Stickers</th><td class="lightbox-detail-stickers" /></tr>
            <tr><th>Lieux</th><td class="lightbox-detail-locations" /></tr>
            <tr><th>Instagram</th><td class="lightbox-detail-ig-caption" /></tr>
            <tr><th>Apple OCR</th><td class="lightbox-detail-apple-caption" /></tr>
            <tr><th>Vision OCR</th><td class="lightbox-detail-vision-ocr" /></tr>
            <tr><th>Vision description</th><td class="lightbox-detail-vision-description" /></tr>
          </tbody></table>
          <a class="lightbox-story-link" target="_blank" rel="noreferrer" hidden>Voir cette story sur Instagram</a>
        </aside>
      </div>
      <button class="lightbox-nav lightbox-next" type="button" aria-label="Image suivante" hidden>›</button>
    </dialog>
  );
}
