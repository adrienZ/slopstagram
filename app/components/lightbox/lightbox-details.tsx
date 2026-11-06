import { cn } from "cn";
import type { ReactNode } from "react";
import type { StoryCardData } from "../../utils/story-cards.ts";
import { MusicSticker } from "../music-sticker.tsx";
import { Sticker } from "../sticker.tsx";
import { VisionLabel } from "./vision-label.tsx";

const detailsCellClassName =
  "tw:border tw:border-border tw:px-3 tw:py-2.75 tw:text-left tw:text-xs tw:align-top tw:wrap-anywhere tw:whitespace-pre-wrap tw:max-[760px]:block tw:max-[760px]:w-auto tw:max-[760px]:border-0 tw:max-[760px]:px-2.5 tw:max-[760px]:py-2";

function LightboxDetailsRow(props: { label: ReactNode; value: ReactNode }) {
  return (
    <tr className="tw:max-[760px]:block">
      <th className={cn(detailsCellClassName, "tw:w-32 tw:bg-muted")} scope="row">
        {props.label}
      </th>
      <td className={detailsCellClassName}>{props.value ?? "—"}</td>
    </tr>
  );
}

/** The side panel of the lightbox: what is known about a story, and a link to it on Instagram. */
export function LightboxDetails({ story }: { story: StoryCardData }) {
  return (
    <aside
      className="tw:flex-[1_1_360px] tw:overflow-auto tw:bg-muted tw:p-4.5 tw:text-foreground tw:max-[760px]:min-h-[34%] tw:max-[760px]:min-w-0 tw:max-[760px]:flex-[1_1_34%] tw:max-[760px]:p-3.5"
      aria-label="Détails de la story"
    >
      <h2 className="tw:my-5 tw:text-2xl tw:leading-normal tw:font-bold">Détails</h2>
      <table className="tw:w-full tw:table-fixed tw:border-collapse tw:bg-card tw:text-card-foreground tw:max-[760px]:block tw:max-[760px]:w-auto">
        <tbody className="tw:max-[760px]:block">
          <LightboxDetailsRow label="Type" value={story.mediaType} />
          <LightboxDetailsRow
            label="Stickers"
            value={
              story.stickerDetails === undefined ? (
                story.stickers
              ) : (
                <>
                  {story.stickerDetails.text}
                  <div className="tw:flex tw:flex-wrap tw:items-start tw:gap-1.5">
                    {story.stickerDetails.stickers?.map((sticker, index) => (
                      <Sticker key={`${sticker.kind}:${index}`} sticker={sticker} />
                    ))}
                    {story.stickerDetails.music.map(({ key, label, preview }) => (
                      <MusicSticker key={key} label={label} preview={preview} />
                    ))}
                  </div>
                </>
              )
            }
          />
          <LightboxDetailsRow label="Lieux" value={story.locations} />
          <LightboxDetailsRow label="Instagram" value={story.igCaption} />
          <LightboxDetailsRow label="Apple OCR" value={story.appleCaption} />
          <LightboxDetailsRow
            label={<VisionLabel label="Vision OCR" outdated={story.visionOutdated} />}
            value={story.visionOcr}
          />
          <LightboxDetailsRow
            label={<VisionLabel label="Vision description" outdated={story.visionOutdated} />}
            value={story.visionDescription}
          />
        </tbody>
      </table>
      <a
        className="tw:mt-3.5 tw:inline-block tw:rounded-lg tw:bg-primary tw:px-3 tw:py-2.25 tw:text-primary-foreground tw:no-underline"
        target="_blank"
        rel="noreferrer"
        href={story.url}
      >
        Voir cette story sur Instagram
      </a>
    </aside>
  );
}
