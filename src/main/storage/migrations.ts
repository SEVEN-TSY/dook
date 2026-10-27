/** 按版本递增追加迁移，已发布的迁移保持不变。此处尚无业务表。 */
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
  }
] as const
