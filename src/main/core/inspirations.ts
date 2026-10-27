import type { Inspiration } from '../../shared/contracts'

export interface InspirationStore {
  list(): Inspiration[]
  create(description: string): Inspiration
  update(id: string, description: string): Inspiration
  append(id: string, content: string, additionId?: string): Inspiration
}
