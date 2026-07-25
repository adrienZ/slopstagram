export const STORY_MEDIA_TYPES = {
  IMAGE: "image",
  VIDEO: "video",
} as const;

export type StoryMediaType =
  (typeof STORY_MEDIA_TYPES)[keyof typeof STORY_MEDIA_TYPES];

export type StoryTrayUser = {
  full_name?: string;
  username?: string;
};

export type StoryTrayEntry = {
  id: string;
  media_ids?: string[];
  ranked_position?: number;
  seen_ranked_position?: number;
  user?: StoryTrayUser;
};

export type StoriesReport = {
  xdt_api__v1__feed__reels_tray?: {
    tray?: StoryTrayEntry[];
  };
};

export type ParsedStoryTrayItem = {
  media_ids: string[];
};

export type ParsedStoryTrayUser = {
  items: ParsedStoryTrayItem[];
  username: string | null;
};

export type StoryVersion = {
  height?: number;
  url?: string;
  width?: number;
};

export type StoryVideoVersion = StoryVersion & {
  type?: number;
};

export type StoryItem = {
  image_versions2?: {
    candidates?: StoryVersion[];
  };
  media_type?: number;
  original_height?: number;
  original_width?: number;
  pk: string;
  story_bloks_stickers?: unknown[] | null;
  story_music_stickers?: unknown[] | null;
  video_versions?: StoryVideoVersion[] | null;
};

export type StoriesMediaReport = {
  data?: {
    xdt_api__v1__feed__reels_media__connection?: {
      edges?: Array<{
        node?: {
          items?: StoryItem[];
        };
      }>;
    };
  };
};

export type ParsedStory = {
  height: number | null;
  media_type: StoryMediaType;
  pk: string;
  story_bloks_stickers: unknown[] | null;
  story_music_stickers: unknown[] | null;
  url: string | null;
  width: number | null;
};
