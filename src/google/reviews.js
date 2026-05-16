/**
 * Google Business Profile Reviews API (v4 — still current for reviews as of May 2026).
 * See docs/GOOGLE-BUSINESS-PROFILE-API-NOTES.md for rationale.
 */
const { getAccessToken } = require('./oauth');

const LOCATION_ID = process.env.GOOGLE_BUSINESS_LOCATION_ID;

function starRatingToNumber(starRating) {
  const map = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return map[starRating] || 0;
}

/**
 * Fetch all reviews from Google Business Profile API (paginated).
 */
async function fetchAllReviews() {
  if (!LOCATION_ID) throw new Error('GOOGLE_BUSINESS_LOCATION_ID not configured');

  const token = await getAccessToken();
  const reviews = [];
  let pageToken = null;

  do {
    let url = `https://mybusiness.googleapis.com/v4/${LOCATION_ID}/reviews?pageSize=50`;
    if (pageToken) url += `&pageToken=${pageToken}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Reviews API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    if (data.reviews) {
      for (const r of data.reviews) {
        reviews.push({
          id: r.reviewId,
          author_name: r.reviewer?.displayName || 'Anonyme',
          author_avatar_url: r.reviewer?.profilePhotoUrl || null,
          rating: starRatingToNumber(r.starRating),
          comment: r.comment || '',
          language: r.comment ? null : null, // API doesn't reliably provide language
          created_at_google: r.createTime,
          reply_text: r.reviewReply?.comment || null,
          reply_updated_at: r.reviewReply?.updateTime || null,
        });
      }
    }
    pageToken = data.nextPageToken || null;
  } while (pageToken);

  return reviews;
}

/**
 * Publish a reply to a specific review on Google.
 */
async function publishReply(reviewId, replyText) {
  if (!LOCATION_ID) throw new Error('GOOGLE_BUSINESS_LOCATION_ID not configured');

  const token = await getAccessToken();
  const url = `https://mybusiness.googleapis.com/v4/${LOCATION_ID}/reviews/${reviewId}/reply`;

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ comment: replyText }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google reply error (${res.status}): ${err}`);
  }

  return await res.json();
}

module.exports = { fetchAllReviews, publishReply };
