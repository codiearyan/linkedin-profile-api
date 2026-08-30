import { Graph, idFromUrn, type Entity } from "./graph.js";
import { ApiError } from "./errors.js";

export type Profile = ReturnType<typeof normalizeProfile>;

const pad = (n: number) => String(n).padStart(2, "0");

// linkedin dates are { year, month } with no day most of the time
function toDate(raw: any) {
  if (!raw?.year) return null;

  const { year, month = null, day = null } = raw;
  const text = [String(year), month ? pad(month) : null, day ? pad(day) : null]
    .filter(Boolean)
    .join("-");

  return { year, month, day, text };
}

function toDateRange(raw: any) {
  if (!raw) return null;

  const start = toDate(raw.start);
  const end = toDate(raw.end);
  if (!start && !end) return null;

  return {
    start,
    end,
    isCurrent: Boolean(start) && !end,
    durationMonths: monthsBetween(start, end),
  };
}

function monthsBetween(start: any, end: any): number | null {
  if (!start) return null;

  const now = new Date();
  const to = end ?? { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  const months =
    (to.year - start.year) * 12 + ((to.month ?? 1) - (start.month ?? 1));

  return months >= 0 ? months + 1 : null;
}

// images come as a rootUrl plus artifacts[] holding a path segment per rendered size.
// the segment is signed and carries an expiry, so these urls do not last forever.
function toImage(container: any) {
  const vector = findVectorImage(container);
  const artifacts = vector?.artifacts;
  if (!vector?.rootUrl || !Array.isArray(artifacts) || !artifacts.length) {
    return null;
  }

  const sizes = artifacts
    .filter((a: any) => a?.fileIdentifyingUrlPathSegment)
    .map((a: any) => ({
      url: vector.rootUrl + a.fileIdentifyingUrlPathSegment,
      width: a.width ?? null,
      height: a.height ?? null,
    }))
    .sort((a: any, b: any) => (a.width ?? 0) - (b.width ?? 0));

  if (!sizes.length) return null;

  const largest = sizes[sizes.length - 1];
  const expiresAt =
    artifacts.map((a: any) => a?.expiresAt).find((e: any) => typeof e === "number") ??
    null;

  return { ...largest, expiresAt, sizes };
}

function findVectorImage(node: any, depth = 0): any {
  if (!node || typeof node !== "object" || depth > 4) return null;
  if (node.rootUrl && node.artifacts) return node;
  if (node.vectorImage) return findVectorImage(node.vectorImage, depth + 1);
  if (node.displayImageReference) {
    return findVectorImage(node.displayImageReference, depth + 1);
  }
  return null;
}

// turns one raw voyager response into the flat object this api returns
export function normalizeProfile(payload: any) {
  const graph = new Graph(payload?.included ?? []);
  const profile = graph.get(payload?.data?.["*elements"]?.[0]);

  if (!profile) {
    throw new ApiError(
      "PROFILE_NOT_FOUND",
      404,
      "No profile in response, it may be private or unavailable",
    );
  }

  const publicIdentifier = profile.publicIdentifier ?? null;

  return {
    publicIdentifier,
    profileUrl: publicIdentifier
      ? `https://www.linkedin.com/in/${publicIdentifier}`
      : null,
    profileId: idFromUrn(profile.entityUrn),
    memberId: idFromUrn(profile.objectUrn),

    firstName: profile.firstName ?? null,
    lastName: profile.lastName ?? null,
    fullName:
      [profile.firstName, profile.lastName].filter(Boolean).join(" ") || null,
    headline: profile.headline ?? null,
    about: profile.summary ?? null,
    pronouns: profile.pronounUnion?.standardizedPronoun ?? null,

    location: location(graph, profile),
    industry: graph.follow(profile, "*industry")?.name ?? null,

    profilePicture: toImage(profile.profilePicture),
    backgroundPicture: toImage(profile.backgroundPicture),

    isPremium: profile.premium ?? false,
    isInfluencer: profile.influencer ?? false,
    isCreator: profile.creator ?? false,

    experience: experience(graph, profile),
    education: education(graph, profile),
    skills: graph
      .collection(profile, "*profileSkills")
      .map((s) => s.name)
      .filter(Boolean),
    certifications: certifications(graph, profile),
    languages: graph.collection(profile, "*profileLanguages").map((l) => ({
      name: l.name ?? null,
      proficiency: l.proficiency ?? null,
    })),
    projects: graph.collection(profile, "*profileProjects").map((p) => ({
      title: p.title ?? null,
      description: p.description ?? null,
      url: p.url ?? null,
      dateRange: toDateRange(p.dateRange),
    })),
    volunteerExperience: graph
      .collection(profile, "*profileVolunteerExperiences")
      .map((v) => ({
        role: v.role ?? null,
        organization: v.companyName ?? null,
        cause: v.cause ?? null,
        description: v.description ?? null,
        dateRange: toDateRange(v.dateRange),
      })),
    honors: graph.collection(profile, "*profileHonors").map((h) => ({
      title: h.title ?? null,
      issuer: h.issuer ?? null,
      description: h.description ?? null,
      issuedOn: toDate(h.issuedOn),
    })),
    courses: graph.collection(profile, "*profileCourses").map((c) => ({
      name: c.name ?? null,
      number: c.number ?? null,
    })),
    publications: graph.collection(profile, "*profilePublications").map((p) => ({
      name: p.name ?? null,
      publisher: p.publisher ?? null,
      description: p.description ?? null,
      url: p.url ?? null,
      publishedOn: toDate(p.publishedOn),
    })),
    organizations: graph
      .collection(profile, "*profileOrganizations")
      .map((o) => ({
        name: o.name ?? null,
        position: o.position ?? null,
        description: o.description ?? null,
        dateRange: toDateRange(o.dateRange),
      })),
  };
}

// locationName on the profile is almost always null, the real one is behind the geo urn
function location(graph: Graph, profile: Entity) {
  const geo = graph.follow(profile.geoLocation, "*geo");

  return {
    full: geo?.defaultLocalizedName ?? profile.locationName ?? null,
    short: geo?.defaultLocalizedNameWithoutCountryName ?? null,
    countryCode: profile.location?.countryCode ?? null,
  };
}

// experience arrives as position groups, one per company, each wrapping its own positions.
// a group with several positions is a promotion history at one employer, so the roles stay
// nested instead of being flattened into what would look like separate jobs.
function experience(graph: Graph, profile: Entity) {
  return graph.collection(profile, "*profilePositionGroups").map((group) => {
    const company = graph.follow(group, "*company");

    return {
      company: group.companyName ?? null,
      companyUrl: company?.url ?? null,
      companyLogo: toImage(company?.logo),
      companyId: idFromUrn(group.companyUrn),
      dateRange: toDateRange(group.dateRange),
      roles: graph
        .collection(group, "*profilePositionInPositionGroup")
        .map((position) => ({
          title: position.title ?? null,
          employmentType: graph.follow(position, "*employmentType")?.name ?? null,
          location: position.geoLocationName ?? position.locationName ?? null,
          description: position.description ?? null,
          dateRange: toDateRange(position.dateRange),
        })),
    };
  });
}

function education(graph: Graph, profile: Entity) {
  return graph.collection(profile, "*profileEducations").map((edu) => ({
    school: edu.schoolName ?? null,
    schoolLogo: toImage(graph.follow(edu, "*school")?.logo),
    degree: edu.degreeName ?? null,
    fieldOfStudy: edu.fieldOfStudy ?? null,
    grade: edu.grade ?? null,
    activities: edu.activities ?? null,
    description: edu.description ?? null,
    dateRange: toDateRange(edu.dateRange),
  }));
}

// a certification's dateRange is issued -> expires, not a duration, so it is split in two
function certifications(graph: Graph, profile: Entity) {
  return graph.collection(profile, "*profileCertifications").map((cert) => ({
    name: cert.name ?? null,
    authority: cert.authority ?? null,
    authorityLogo: toImage(graph.follow(cert, "*company")?.logo),
    licenseNumber: cert.licenseNumber ?? null,
    url: cert.url ?? null,
    issuedOn: toDate(cert.dateRange?.start),
    expiresOn: toDate(cert.dateRange?.end),
  }));
}
