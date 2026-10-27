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
  },
  {
    version: 3,
    name: 'multi_day_tasks',
    sql: `
      ALTER TABLE tasks ADD COLUMN kind TEXT NOT NULL DEFAULT 'today' CHECK(kind IN ('today', 'multi-day'));
      ALTER TABLE tasks ADD COLUMN progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100);
      ALTER TABLE tasks ADD COLUMN completed_on TEXT;
      CREATE INDEX tasks_kind_completion ON tasks(kind, completed, completed_on, sequence);
    `
  },
  {
    version: 4,
    name: 'habits_and_daily_generations',
    sql: `
      CREATE TABLE habits (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL CHECK(length(trim(description)) > 0)
      ) STRICT;
      ALTER TABLE tasks ADD COLUMN habit_id TEXT;
      CREATE TABLE habit_generations (
        habit_id TEXT NOT NULL,
        date TEXT NOT NULL,
        task_id TEXT NOT NULL,
        PRIMARY KEY (habit_id, date)
      ) STRICT;
    `
  },
  {
    version: 6,
    name: 'task_subitems',
    sql: `
      CREATE TABLE task_subitems (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        description TEXT NOT NULL CHECK(length(trim(description)) > 0),
        completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0, 1))
      ) STRICT;
      CREATE INDEX task_subitems_task_sequence ON task_subitems(task_id, sequence);
    `
  }
] as const
