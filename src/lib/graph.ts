export type Entity = Record<string, any>;

// voyager does not return nested json, it returns a flat entity graph. every object in
// included[] has an entityUrn, and relationships are "*" prefixed fields holding urn strings
// that point back into that same array. collections add one more hop, the pointer targets a
// CollectionResponse whose "*elements" array holds the real urns, already in display order.
export class Graph {
  private byUrn = new Map<string, Entity>();

  constructor(included: Entity[] = []) {
    for (const entity of included) {
      if (entity?.entityUrn) this.byUrn.set(entity.entityUrn, entity);
    }
  }

  get(urn: string | null | undefined): Entity | null {
    return urn ? (this.byUrn.get(urn) ?? null) : null;
  }

  // follows a "*" pointer that targets a single entity
  follow(entity: Entity | null, key: string): Entity | null {
    return this.get(entity?.[key]);
  }

  // follows a "*" pointer that targets a CollectionResponse, keeping linkedin's own ordering
  collection(entity: Entity | null, key: string): Entity[] {
    const urns: string[] = this.get(entity?.[key])?.["*elements"] ?? [];
    return urns
      .map((urn) => this.get(urn))
      .filter((e): e is Entity => e !== null);
  }
}

// urn:li:fsd_profile:ACoAAB... -> ACoAAB...
export function idFromUrn(urn: string | null | undefined): string | null {
  if (!urn) return null;
  const parts = urn.split(":");
  return parts.length >= 4 ? parts.slice(3).join(":") : null;
}
