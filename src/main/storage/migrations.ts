/** 按版本递增追加迁移，已发布的迁移保持不变。 */
export const migrations = [
  {
    version: 1,
    name: 'infrastructure_metadata',
    sql: `
      CREATE TABLE app_metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      ) STRICT;
      INSERT INTO app_metadata (key, value) VALUES ('schema', 'mytodo');
    `
  },
  {
    version: 2,
    name: 'today_tasks',
    sql: `
      CREATE TABLE tasks (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL CHECK(length(trim(description)) > 0),
        date TEXT NOT NULL,
        completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
      ) STRICT;
      CREATE INDEX tasks_date_sequence ON tasks(date, sequence);
    `
  }
] as const
