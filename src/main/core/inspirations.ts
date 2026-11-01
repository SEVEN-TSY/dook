import type {
  Inspiration,
  InspirationPage,
  InspirationTopic,
  InspirationGroup
} from '../../shared/contracts'

export interface InspirationStore {
  listTopics(): InspirationTopic[]
  createTopic(name: string, inspirationId?: string): InspirationTopic
  topicDetails(id: string): { name: string; count: number }
  deleteTopic(id: string): void
  renameTopic(id: string, name: string): void
  setTopic(inspirationId: string, topicId: string, included: boolean): void
  archive(id: string): void
  restore(id: string): void
  deleteArchived(id: string): void
  list(): Inspiration[]
  page(offset: number, limit: number, group?: InspirationGroup): InspirationPage
  create(description: string, createdAt: string, topicId?: string, creationId?: string): Inspiration
  update(id: string, description: string): Inspiration
  append(id: string, content: string, additionId?: string): Inspiration
}
