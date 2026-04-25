export interface BaseEntity {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  createdById?: string;
}

export function createBaseEntity(createdById?: string): BaseEntity {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...(createdById ? { createdById } : {})
  };
}
