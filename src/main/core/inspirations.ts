import type { Inspiration, InspirationPage } from '../../shared/contracts'

export interface InspirationStore {
  list(): Inspiration[]
  page(offset: number, limit: number): InspirationPage
  create(description: string, createdAt: string): Inspiration
  update(id: string, description: string): Inspiration
  append(id: string, content: string, additionId?: string): Inspiration
}
