import type { components, paths } from './schema'

/** A response or request body schema from the backend OpenAPI document, e.g. `Schema<'NoteDto'>`. */
export type Schema<Name extends keyof components['schemas']> = components['schemas'][Name]

export type ApiPath = keyof paths

/** Opaque keyset pagination shared by every list route. */
export type Page<Item> = { items: Item[]; nextCursor: string | null }
