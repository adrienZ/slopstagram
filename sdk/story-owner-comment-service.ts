import { z } from "zod";
import type { StoryOwnerComment } from "./entities/story-owner-comment.ts";
import type { InstagramClient, StoryItem } from "./instagram-types.ts";
import type { Logger } from "./lib/logging-service.ts";
import type { StoryRepository } from "./repositories/story-repository.ts";

type OwnerCommentRepository = Partial<Pick<StoryRepository, "recordOwnerComments">>;

// Instagram returns comment identifiers as strings on one endpoint and numbers on another.
const OwnerCommentWireSchema = z.looseObject({
  created_at: z.number().int(),
  is_created_by_media_owner: z.boolean().nullish(),
  pk: z.union([z.string(), z.number()]).transform(String),
  text: z.string().min(1),
});

const CommentsResponseSchema = z.looseObject({ comments: z.array(z.unknown()) });

function parseOwnerComments(comments: ReadonlyArray<unknown>): Array<StoryOwnerComment> {
  return comments.flatMap((comment) => {
    const parsed = OwnerCommentWireSchema.safeParse(comment);
    return parsed.success && parsed.data.is_created_by_media_owner === true
      ? [{ commentPk: parsed.data.pk, createdAt: parsed.data.created_at, text: parsed.data.text }]
      : [];
  });
}

function readInlineOwnerComments(item: StoryItem | undefined): Array<StoryOwnerComment> {
  const inline = z.array(z.unknown()).safeParse(item?.story_comments);
  return inline.success ? parseOwnerComments(inline.data) : [];
}

function isAuthenticationOrRateLimit(status: number) {
  return status === 429 || status === 401 || status === 403;
}

/**
 * Stores the story owner's own comments. The reels media query carries them inline for some
 * stories; for the rest, the comments endpoint is asked once per story saved in this run.
 */
export async function collectOwnerComments(
  client: Pick<InstagramClient, "getStoryComments">,
  savedMediaPks: Iterable<string>,
  items: ReadonlyMap<string, StoryItem>,
  repository: OwnerCommentRepository | undefined,
  logger: Pick<Logger, "warn">,
) {
  if (repository?.recordOwnerComments === undefined) {
    return;
  }
  for (const mediaPk of savedMediaPks) {
    let comments = readInlineOwnerComments(items.get(mediaPk));
    if (comments.length === 0 && client.getStoryComments !== undefined) {
      try {
        // oxlint-disable-next-line no-await-in-loop -- Keep requests sequential and stop on rate limits.
        const response = await client.getStoryComments(mediaPk);
        if (isAuthenticationOrRateLimit(response.status)) {
          logger.warn(`owner comment lookup stopped after Instagram HTTP ${response.status}`);
          return;
        }
        if (response.ok) {
          comments = parseOwnerComments(CommentsResponseSchema.parse(response.json()).comments);
        }
      } catch {
        logger.warn("owner comment lookup failed; continuing story ingestion");
      }
    }
    if (comments.length > 0) {
      try {
        repository.recordOwnerComments(mediaPk, comments);
      } catch {
        logger.warn("owner comments could not be recorded; continuing story ingestion");
      }
    }
  }
}
