import { MapPinIcon } from "lucide-react";
import { Badge } from "../shadcn/ui/badge.tsx";
import { useState } from "react";
import type { StickerPresentation } from "../sticker-presentation.ts";

const badgeClass = "tw:h-auto tw:max-w-full tw:gap-1 tw:py-1 tw:whitespace-normal";

function MentionAvatar({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? null : (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      width={20}
      height={20}
      loading="lazy"
      className="tw:size-5 tw:shrink-0 tw:rounded-full tw:object-cover"
      onError={() => {
        setFailed(true);
      }}
    />
  );
}

export function MentionSticker({ sticker }: { sticker: StickerPresentation }) {
  const content = (
    <>
      {sticker.avatarUrl !== undefined && (
        <MentionAvatar key={sticker.avatarUrl} src={sticker.avatarUrl} />
      )}
      <span className="tw:wrap-anywhere">{sticker.label}</span>
    </>
  );
  return (
    <Badge asChild variant="secondary" title={sticker.title} className={badgeClass}>
      {sticker.profileUrl === undefined ? (
        <span>{content}</span>
      ) : (
        <a href={sticker.profileUrl} className="tw:underline tw:underline-offset-2">
          {content}
        </a>
      )}
    </Badge>
  );
}

export function LocationSticker({ label, category }: { label: string; category?: string }) {
  return (
    <Badge variant="secondary" title={label} className={badgeClass}>
      <MapPinIcon aria-hidden="true" />
      <span className="tw:flex tw:flex-col">
        <span className="tw:wrap-anywhere">{label}</span>
        {category !== undefined && (
          <span className="tw:text-[0.8em] tw:font-normal tw:text-muted-foreground tw:wrap-anywhere">
            {category}
          </span>
        )}
      </span>
    </Badge>
  );
}

export function HashtagSticker({ label }: { label: string }) {
  return (
    <Badge variant="secondary" title={label} className={badgeClass}>
      <span className="tw:wrap-anywhere">{label}</span>
    </Badge>
  );
}

export function Sticker({ sticker }: { sticker: StickerPresentation }) {
  if (sticker.kind === "mention") {
    return <MentionSticker sticker={sticker} />;
  }
  if (sticker.kind === "location") {
    return <LocationSticker label={sticker.label} category={sticker.category} />;
  }
  if (sticker.kind === "hashtag") {
    return <HashtagSticker label={sticker.label} />;
  }
  return (
    <Badge variant="secondary" title={sticker.title} className={badgeClass}>
      <span className="tw:wrap-anywhere">{sticker.label}</span>
    </Badge>
  );
}
