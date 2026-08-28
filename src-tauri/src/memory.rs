use rusqlite::{params, Connection};

/// Section 12's memory system, scoped down to the one piece that actually
/// changes behavior today: which interaction kind the user engages with
/// most. Real Section 12 also wants favorite toys, food preferences, and
/// "important pet events" — those need UI surfaces (a toy system, a food
/// preference signal) that don't exist yet, so this is the honest subset:
/// a single counter table, incremented on every interaction, queried for
/// its max.
pub fn record_interaction(conn: &Connection, kind: &str) {
    conn.execute(
        "INSERT INTO memory_stats (kind, count) VALUES (?1, 1)
         ON CONFLICT(kind) DO UPDATE SET count = count + 1",
        params![kind],
    )
    .expect("failed to record interaction in memory_stats");
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MemoryStat {
    pub kind: String,
    pub count: i64,
}

pub fn get_stats(conn: &Connection) -> Vec<MemoryStat> {
    let mut stmt = conn
        .prepare("SELECT kind, count FROM memory_stats ORDER BY count DESC")
        .unwrap();
    stmt.query_map([], |row| {
        Ok(MemoryStat {
            kind: row.get(0)?,
            count: row.get(1)?,
        })
    })
    .unwrap()
    .flatten()
    .collect()
}
