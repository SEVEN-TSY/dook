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
    version: 5,
    name: 'inspirations',
    sql: `
      CREATE TABLE inspirations (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL CHECK(length(trim(description)) > 0)
      ) STRICT;
      CREATE TABLE inspiration_additions (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        inspiration_id TEXT NOT NULL REFERENCES inspirations(id) ON DELETE CASCADE,
        content TEXT NOT NULL CHECK(length(trim(content)) > 0)
      ) STRICT;
      CREATE INDEX inspiration_additions_parent_sequence ON inspiration_additions(inspiration_id, sequence);
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
  },
  {
    version: 7,
    name: 'task_order_and_pin',
    sql: `
      ALTER TABLE tasks ADD COLUMN sort_order INTEGER;
      ALTER TABLE tasks ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1));
    `
  },
  {
    version: 8,
    name: 'skip_habit_task_once',
    sql: `ALTER TABLE tasks ADD COLUMN skipped_on TEXT;`
  },
  {
    version: 9,
    name: 'inspiration_recorded_time',
    sql: `ALTER TABLE inspirations ADD COLUMN created_at TEXT;`
  },
  {
    version: 10,
    name: 'inspiration_topics',
    sql: `
      CREATE TABLE inspiration_topics (sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, name TEXT NOT NULL CHECK(length(trim(name)) > 0)) STRICT;
      CREATE TABLE inspiration_topic_members (inspiration_id TEXT NOT NULL REFERENCES inspirations(id) ON DELETE CASCADE, topic_id TEXT NOT NULL REFERENCES inspiration_topics(id) ON DELETE CASCADE, PRIMARY KEY(inspiration_id, topic_id)) STRICT;
      CREATE INDEX inspiration_topic_members_topic ON inspiration_topic_members(topic_id, inspiration_id);
    `
  },
  {
    version: 11,
    name: 'inspiration_archive',
    sql: `ALTER TABLE inspirations ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1));`
  },
  {
    version: 12,
    name: 'task_archive',
    sql: `ALTER TABLE tasks ADD COLUMN archived_at TEXT;
      CREATE INDEX tasks_archive_order ON tasks(archived_at DESC, sequence DESC);`
  },
  {
    version: 13,
    name: 'habit_archive',
    sql: `ALTER TABLE habits ADD COLUMN archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0, 1));`
  },
  {
    version: 14,
    name: 'task_and_habit_created_time',
    sql: `ALTER TABLE tasks ADD COLUMN created_at TEXT;
      ALTER TABLE habits ADD COLUMN created_at TEXT;`
  },
  {
    version: 15,
    name: 'habit_schedule',
    sql: `ALTER TABLE habits ADD COLUMN schedule TEXT;`
  },
  { version: 16, name: 'task_updated_time', sql: `ALTER TABLE tasks ADD COLUMN updated_at TEXT;` },
  {
    version: 17,
    name: 'subitem_order',
    sql: `ALTER TABLE task_subitems ADD COLUMN sort_order INTEGER;`
  },
  {
    version: 18,
    name: 'inspiration_archived_time',
    sql: `ALTER TABLE inspirations ADD COLUMN archived_at TEXT;`
  },
  {
    version: 19,
    name: 'habit_archived_time',
    sql: `ALTER TABLE habits ADD COLUMN archived_at TEXT;`
  },
  {
    version: 20,
    name: 'dook_schema_metadata',
    sql: `UPDATE app_metadata SET value = 'dook' WHERE key = 'schema';`
  }
] as const
