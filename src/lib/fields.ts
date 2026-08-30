import { ApiError } from "./errors.js";
import type { Profile } from "./normalize.js";

const SECTIONS: Record<string, (keyof Profile)[]> = {
  basics: [
    "publicIdentifier",
    "profileUrl",
    "profileId",
    "memberId",
    "firstName",
    "lastName",
    "fullName",
    "headline",
    "about",
    "pronouns",
    "location",
    "industry",
    "profilePicture",
    "backgroundPicture",
    "isPremium",
    "isInfluencer",
    "isCreator",
  ],
  experience: ["experience"],
  education: ["education"],
  skills: ["skills"],
  certifications: ["certifications"],
  languages: ["languages"],
  projects: ["projects"],
  volunteer: ["volunteerExperience"],
  honors: ["honors"],
  courses: ["courses"],
  publications: ["publications"],
  organizations: ["organizations"],
};

export const SECTION_NAMES = Object.keys(SECTIONS);

// validating is kept separate from applying so the route can reject a bad section name before
// it spends a linkedin request on a query that was never going to be answerable
export function parseFields(raw: string | undefined): string[] | undefined {
  const fields = raw
    ?.split(",")
    .map((f) => f.trim())
    .filter(Boolean);

  if (!fields || !fields.length) return undefined;

  const unknown = fields.filter((name) => !SECTIONS[name]);
  if (unknown.length) {
    throw new ApiError(
      "INVALID_FIELDS",
      400,
      `Unknown section(s): ${unknown.join(", ")}. Valid sections: ${SECTION_NAMES.join(", ")}`,
    );
  }

  return fields;
}

export function applyFields(
  profile: Profile,
  fields: string[] | undefined,
): Partial<Profile> {
  if (!fields || !fields.length) return profile;

  const picked: Partial<Profile> = {};
  for (const name of fields) {
    for (const key of SECTIONS[name]!) {
      (picked as any)[key] = profile[key];
    }
  }

  return picked;
}
