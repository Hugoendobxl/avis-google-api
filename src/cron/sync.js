/**
 * Cron sync — polls Google Business Profile API and stores reviews in DB.
 * Runs daily at 06:00 UTC (configurable via SYNC_CRON env var).
 */
const cron = require('node-cron');
const pool = require('../db/pool');
const { fetchAllReviews } = require('../google/reviews');

async function syncReviews() {
  const logRes = await pool.query(
    `INSERT INTO sync_log (status) VALUES ('running') RETURNING id`
  );
  const logId = logRes.rows[0].id;

  try {
    console.log('[sync] Starting Google Reviews sync...');
    const reviews = await fetchAllReviews();

    let newCount = 0;

    for (const r of reviews) {
      const { rows } = await pool.query(
        'SELECT id, status FROM reviews WHERE id = $1',
        [r.id]
      );

      if (rows.length === 0) {
        // New review
        const status = r.reply_text ? 'responded' : 'new';
        await pool.query(
          `INSERT INTO reviews (id, author_name, author_avatar_url, rating, comment, language, created_at_google, fetched_at, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8)`,
          [r.id, r.author_name, r.author_avatar_url, r.rating, r.comment, r.language, r.created_at_google, status]
        );

        // If already replied on Google, store in response_history
        if (r.reply_text) {
          await pool.query(
            `INSERT INTO response_history (review_id, response_content, sent_by, sent_at, status)
             VALUES ($1, $2, 'google-direct', $3, 'sent')
             ON CONFLICT DO NOTHING`,
            [r.id, r.reply_text, r.reply_updated_at || new Date()]
          );
        }
        newCount++;
      } else {
        // Existing review — check if reply appeared externally
        const existing = rows[0];
        if ((existing.status === 'new' || existing.status === 'seen') && r.reply_text) {
          await pool.query(
            `UPDATE reviews SET status = 'responded' WHERE id = $1`,
            [r.id]
          );
          await pool.query(
            `INSERT INTO response_history (review_id, response_content, sent_by, sent_at, status)
             VALUES ($1, $2, 'google-direct', $3, 'sent')
             ON CONFLICT DO NOTHING`,
            [r.id, r.reply_text, r.reply_updated_at || new Date()]
          );
        }
      }
    }

    await pool.query(
      `UPDATE sync_log SET finished_at = NOW(), total_fetched = $1, new_reviews = $2, status = 'success' WHERE id = $3`,
      [reviews.length, newCount, logId]
    );

    console.log(`[sync] Done: ${reviews.length} fetched, ${newCount} new`);
    return { total: reviews.length, new: newCount };
  } catch (err) {
    await pool.query(
      `UPDATE sync_log SET finished_at = NOW(), status = 'error', error = $1 WHERE id = $2`,
      [err.message, logId]
    );
    console.error('[sync] Error:', err.message);
    throw err;
  }
}

function startCronSync() {
  const schedule = process.env.SYNC_CRON || '0 6 * * *'; // Default: daily 06:00 UTC
  console.log(`[cron] Reviews sync scheduled: ${schedule}`);

  cron.schedule(schedule, async () => {
    try {
      await syncReviews();
    } catch (err) {
      console.error('[cron] Sync failed:', err.message);
    }
  });
}

module.exports = { syncReviews, startCronSync };
