import { MapPinIcon } from "lucide-react";
import { Badge } from "../shadcn/ui/badge.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "../shadcn/ui/avatar.tsx";
import type { StickerPresentation } from "../sticker-presentation.ts";

const badgeClass = "tw:h-auto tw:max-w-full tw:gap-1 tw:py-1 tw:whitespace-normal";

export function MentionSticker({ sticker }: { sticker: StickerPresentation }) {
  const content = (
    <>
      <Avatar className="tw:size-5 tw:shrink-0" aria-hidden="true">
        <AvatarImage src={sticker.avatarUrl} alt="" />
        <AvatarFallback>
          {sticker.label.replace(/^@/u, "").slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
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

export function LocationSticker({ label }: { label: string }) {
  return (
    <Badge variant="secondary" title={label} className={badgeClass}>
      <MapPinIcon aria-hidden="true" />
      <span className="tw:wrap-anywhere">{label}</span>
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
    return <LocationSticker label={sticker.label} />;
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
