import { db } from '../server/db/mysql';

async function main() {
  try {
    await db.init();
    const columns = await db.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ?
       ORDER BY ordinal_position`,
      ['jami_action_proposals']
    );
    const rows = await db.query<any>(
      `SELECT p.action_type, p.status, p.payload_json, p.result_json,
              p.error_code, p.error_message
       FROM jami_action_proposals p
       JOIN jami_messages m ON m.proposal_id = p.id
       WHERE m.id = ?
       LIMIT 1`,
      ['msg_3de6da430f814c3eaa0c9c21']
    );
    const row = rows[0] || {};
    const parseJson = (value: unknown) => {
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    };

    console.log(JSON.stringify({
      columns: columns.map((column) => column.column_name),
      proposal: {
        actionType: row.action_type,
        status: row.status,
        payload: parseJson(row.payload_json),
        result: parseJson(row.result_json),
        errorCode: row.error_code,
        errorMessage: row.error_message,
      },
    }, null, 2));
  } finally {
    process.exit(0);
  }
}

void main();
