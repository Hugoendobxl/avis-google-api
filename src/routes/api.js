/**
 * REST API routes — avis-google-api
 * Endpoints: GET /api/reviews, POST /api/reviews/sync, POST /api/reviews/:id/draft,
 *            POST /api/reviews/:id/send, GET /api/stats
 */
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { generateDrafts } = require('../ai/draft');
const { publishReply } = require('../google/reviews');
const { syncReviews } = require('../cron/sync');

// ══════════════════════════════════════
// GET /api/reviews — list reviews from DB
// ══════════════════════════════════════
router.get('/reviews', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM reviews ORDER BY created_at_google DESC'
    );

    const total = rows.length;
    const sum = rows.reduce((s, r) => s + (r.rating || 0), 0);
    const average = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    rows.forEach(r => {
      if (r.rating >= 1 && r.rating <= 5) distribution[r.rating]++;
    });

    // Pending count (new + seen, not responded)
    const pending = rows.filter(r => r.status !== 'responded').length;

    res.json({ reviews: rows, total, average, distribution, pending });
  } catch (err) {
    console.error('[api] GET /reviews error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════
// POST /api/reviews/sync — force sync
// ══════════════════════════════════════
router.post('/reviews/sync', async (req, res) => {
  try {
    const result = await syncReviews();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[api] POST /reviews/sync error:', err.message);
    res.status(500).json({ error: 'Erreur de synchronisation: ' + err.message });
  }
});

// ══════════════════════════════════════
// POST /api/reviews/:id/draft — generate AI draft(s)
// ══════════════════════════════════════
router.post('/reviews/:id/draft', async (req, res) => {
  const { id } = req.params;

  try {
    // Get review from DB
    const { rows } = await pool.query('SELECT * FROM reviews WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Avis non trouvé' });

    const review = rows[0];
    const requiresHugoValidation = review.rating <= 3;

    const { drafts, usage } = await generateDrafts({
      rating: review.rating,
      comment: review.comment,
      author_name: review.author_name,
    });

    // Store first draft in DB
    await pool.query(
      `INSERT INTO drafts (review_id, content, source, created_by, requires_hugo_validation)
       VALUES ($1, $2, 'ai', 'system', $3)`,
      [id, drafts[0], requiresHugoValidation]
    );

    // Mark review as seen if still new
    if (review.status === 'new') {
      await pool.query(`UPDATE reviews SET status = 'seen', seen_at = NOW() WHERE id = $1`, [id]);
    }

    res.json({
      drafts,
      requires_hugo_validation: requiresHugoValidation,
      usage,
    });
  } catch (err) {
    console.error('[api] POST /reviews/:id/draft error:', err.message);
    res.status(500).json({ error: 'Erreur IA: ' + err.message });
  }
});

// ══════════════════════════════════════
// POST /api/reviews/:id/send — publish reply to Google
// ══════════════════════════════════════
router.post('/reviews/:id/send', async (req, res) => {
  const { id } = req.params;
  const { reply_text, sent_by } = req.body;

  if (!reply_text || !reply_text.trim()) {
    return res.status(400).json({ error: 'reply_text requis' });
  }

  try {
    // Get review
    const { rows } = await pool.query('SELECT * FROM reviews WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Avis non trouvé' });

    const review = rows[0];

    // Moderation check for 1-3★ reviews
    if (review.rating <= 3) {
      // Check if there's a validated draft (by Hugo)
      const { rows: draftRows } = await pool.query(
        `SELECT * FROM drafts WHERE review_id = $1 AND requires_hugo_validation = TRUE
         ORDER BY created_at DESC LIMIT 1`,
        [id]
      );

      if (draftRows.length > 0) {
        const draft = draftRows[0];

        // Must be validated by Hugo
        if (!draft.validated_by) {
          return res.status(403).json({
            error: 'Cet avis nécessite la validation de Hugo avant publication.',
            requires_hugo_validation: true,
          });
        }

        // Cooldown 24h check: draft must be at least 24h old
        const draftAge = Date.now() - new Date(draft.created_at).getTime();
        const COOLDOWN_MS = 24 * 60 * 60 * 1000;
        if (draftAge < COOLDOWN_MS) {
          const remainingH = Math.ceil((COOLDOWN_MS - draftAge) / 3600000);
          return res.status(403).json({
            error: `Cooldown 24h actif. Publication possible dans ~${remainingH}h.`,
            cooldown_remaining_hours: remainingH,
          });
        }
      }
    }

    // Publish to Google
    await publishReply(id, reply_text.trim());

    // Update review status
    await pool.query(
      `UPDATE reviews SET status = 'responded' WHERE id = $1`,
      [id]
    );

    // Store in response_history
    await pool.query(
      `INSERT INTO response_history (review_id, response_content, sent_by, status)
       VALUES ($1, $2, $3, 'sent')`,
      [id, reply_text.trim(), sent_by || 'team']
    );

    res.json({ ok: true });
  } catch (err) {
    // Retry logic: if first attempt fails, store as failed for manual retry
    console.error('[api] POST /reviews/:id/send error:', err.message);

    await pool.query(
      `INSERT INTO response_history (review_id, response_content, sent_by, status)
       VALUES ($1, $2, $3, 'failed')`,
      [id, reply_text.trim(), sent_by || 'team']
    ).catch(() => {});

    res.status(500).json({ error: 'Erreur de publication: ' + err.message });
  }
});

// ══════════════════════════════════════
// POST /api/reviews/:id/validate — Hugo validates a moderated draft
// ══════════════════════════════════════
router.post('/reviews/:id/validate', async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `UPDATE drafts SET validated_by = 'hugo', validated_at = NOW()
       WHERE review_id = $1 AND requires_hugo_validation = TRUE AND validated_by IS NULL
       RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Aucun brouillon en attente de validation' });
    }

    res.json({ ok: true, draft: result.rows[0] });
  } catch (err) {
    console.error('[api] POST /reviews/:id/validate error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ══════════════════════════════════════
// GET /api/stats — statistics
// ══════════════════════════════════════
router.get('/stats', async (req, res) => {
  try {
    const { rows: allReviews } = await pool.query('SELECT rating, status, created_at_google FROM reviews');

    const total = allReviews.length;
    const sum = allReviews.reduce((s, r) => s + (r.rating || 0), 0);
    const average = total > 0 ? Math.round((sum / total) * 10) / 10 : 0;
    const responded = allReviews.filter(r => r.status === 'responded').length;
    const responseRate = total > 0 ? Math.round((responded / total) * 100) : 0;

    // New this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const newThisMonth = allReviews.filter(r =>
      r.created_at_google && new Date(r.created_at_google) >= startOfMonth
    ).length;

    // Last sync
    const { rows: syncRows } = await pool.query(
      `SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 1`
    );

    res.json({
      total,
      average,
      responded,
      response_rate: responseRate,
      new_this_month: newThisMonth,
      pending: total - responded,
      last_sync: syncRows[0] || null,
    });
  } catch (err) {
    console.error('[api] GET /stats error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
