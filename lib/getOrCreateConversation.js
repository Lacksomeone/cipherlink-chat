/**
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number} aId
 * @param {number} bId
 * @returns {number} conversation id
 */
function getOrCreateConversation(db, aId, bId) {
  const low = Math.min(aId, bId);
  const high = Math.max(aId, bId);
  let row = db
    .prepare(
      `SELECT id FROM conversations WHERE user_low_id = ? AND user_high_id = ?`
    )
    .get(low, high);
  if (row) return row.id;
  try {
    const info = db
      .prepare(
        `INSERT INTO conversations (user_low_id, user_high_id) VALUES (?, ?)`
      )
      .run(low, high);
    return Number(info.lastInsertRowid);
  } catch (e) {
    // Handle race condition
    row = db
      .prepare(
        `SELECT id FROM conversations WHERE user_low_id = ? AND user_high_id = ?`
      )
      .get(low, high);
    if (row) return row.id;
    throw e;
  }
}

module.exports = { getOrCreateConversation };
