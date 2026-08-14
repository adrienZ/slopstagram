import { AppleVisionRepository } from "../entities/apple-vision.ts";
import { InstagramUserRepository } from "../entities/instagram-user.ts";
import { UserSummaryRepository } from "../entities/user-summary.ts";
import { VisionRepository } from "../entities/vision.ts";
import { useDrizzle } from "../database/client.ts";

const database = useDrizzle();

export const appleVisionRepository = new AppleVisionRepository(database);
export const instagramUserRepository = new InstagramUserRepository(database);
export const userSummaryRepository = new UserSummaryRepository(database);
export const visionRepository = new VisionRepository(database);
