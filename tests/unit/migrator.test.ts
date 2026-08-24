import { describe, it, expect } from 'vitest';
import { splitSqlStatements } from '../../server/db/migrator';

describe('Migrator SQL Statement Parser Tests', () => {
  it('correctly splits SQL statements separated by semicolons', () => {
    const sql = `
      CREATE TABLE users (id INT);
      INSERT INTO users VALUES (1);
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('CREATE TABLE users');
    expect(statements[1]).toContain('INSERT INTO users');
  });

  it('ignores semicolons inside single or double quotes', () => {
    const sql = `
      INSERT INTO users (name) VALUES ('hello; world');
      SELECT * FROM users;
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('hello; world');
  });

  it('ignores single-line and block comments', () => {
    const sql = `
      -- First comment
      CREATE TABLE test (id INT);
      /* Block comment with ; inside */
      ALTER TABLE test ADD COLUMN name VARCHAR(50);
    `;
    const statements = splitSqlStatements(sql);
    expect(statements).toHaveLength(2);
    expect(statements[0]).toContain('CREATE TABLE test');
    expect(statements[1]).toContain('ALTER TABLE test ADD COLUMN');
  });
});
