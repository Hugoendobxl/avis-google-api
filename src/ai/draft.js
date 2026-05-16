/**
 * AI draft generation for Google review responses.
 * Uses Anthropic Claude API directly (no googleapis dependency needed).
 *
 * Per ADR-012 note: LLMClient abstraction is in IDEES-EN-ATTENTE.md,
 * not yet implemented. Direct Anthropic calls for now.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Few-shot examples valides par Hugo (2026-05-16)
// Tonalite : courte, chaleureuse, sincere, sans formules pompeuses.
// Pas d'emoji, pas de signature (Google ajoute deja le nom du business).
const FEW_SHOT_EXAMPLES = [
  {
    rating: 5,
    comment: "Super expérience, équipe au top, je recommande !",
    reply: "Merci beaucoup pour ce gentil message !"
  },
  {
    rating: 5,
    comment: "Le Dr Anne-Sophie Deroo a été d'une douceur et d'un professionnalisme exceptionnels. Soin parfait, aucune douleur. Merci !",
    reply: "Merci d'avoir partagé votre expérience avec nous ! Cela fait plaisir à lire."
  },
  {
    rating: 4,
    comment: "Excellent soin, mais salle d'attente un peu bondée à mon arrivée. Sinon parfait.",
    reply: "Merci d'avoir pris le temps de partager votre expérience. Nous sommes contents que le soin se soit bien déroulé. Merci également pour votre remarque : on va essayer de s'améliorer !"
  }
];

function buildSystemPrompt(rating) {
  let tonGuidance;
  if (rating >= 5) {
    tonGuidance = 'Ton chaleureux et reconnaissant. 1 a 2 phrases courtes suffisent.';
  } else if (rating >= 4) {
    tonGuidance = 'Ton chaleureux avec remerciements. Si le patient mentionne une nuance, la reconnaitre avec humilite ("on va essayer de s\'ameliorer"). 2 a 3 phrases courtes.';
  } else if (rating >= 3) {
    tonGuidance = 'Ton nuance, professionnel et empathique. Reconnaitre la remarque avec humilite, sans promesse precise irrealiste. 2 a 3 phrases courtes.';
  } else {
    tonGuidance = 'Ton professionnel, rassurant et empathique. Ne pas etre defensif. Montrer de la comprehension. Proposer un dialogue prive si pertinent ("n\'hesitez pas a nous contacter"). 2 a 3 phrases courtes.';
  }

  const examples = FEW_SHOT_EXAMPLES.map(ex =>
    `[Avis ${ex.rating}★] "${ex.comment}"\n[Réponse] "${ex.reply}"`
  ).join('\n\n');

  return `Tu es l'assistant de communication du Cabinet Endodontie Louise (cabinet specialise en endodontie a Bruxelles).
Tu rediges des reponses aux avis Google de patients.

Regles STRICTES :
- Reponse COURTE : 1 a 3 phrases maximum, comme dans les exemples ci-dessous
- Pas de "Cher patient", "Madame/Monsieur" ou formule d'ouverture pompeuse
- Pas d'emoji
- Pas de signature (Google ajoute deja le nom du business automatiquement)
- Mentionner le praticien UNIQUEMENT si le patient le mentionne dans son avis
- Ne JAMAIS reveler d'information medicale, meme si l'avis en contient (RGPD)
- Ne JAMAIS mentionner de diagnostic, traitement ou detail clinique
- Ne JAMAIS mentionner le nom d'un patient
- Pas de promesse precise irrealiste (rester sur des engagements generaux)
- En francais
- ${tonGuidance}

Voici 3 exemples de reponses validees par Hugo (proprietaire du cabinet) — reproduis ce style :

${examples}`;
}

/**
 * Generate 3 draft variants for a review response.
 */
async function generateDrafts({ rating, comment, author_name }) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not configured');
  }

  const firstName = (author_name || '').split(' ')[0] || '';
  const systemPrompt = buildSystemPrompt(rating);

  const userPrompt = `Redige 3 variantes de reponse a cet avis Google (separees par ---) :

Auteur : ${author_name || 'Anonyme'}${firstName ? ` (prenom : ${firstName})` : ''}
Note : ${rating}/5 etoiles
Commentaire : ${comment || '(aucun commentaire)'}

Ecris uniquement les 3 reponses separees par ---, sans numerotation ni guillemets ni prefixe.`;

  const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!apiRes.ok) {
    const err = await apiRes.text();
    throw new Error(`Anthropic API error: ${err}`);
  }

  const data = await apiRes.json();
  const rawText = data.content?.[0]?.text || '';
  const drafts = rawText.split('---').map(d => d.trim()).filter(Boolean);

  return {
    drafts: drafts.length > 0 ? drafts : [rawText.trim()],
    usage: {
      input_tokens: data.usage?.input_tokens || 0,
      output_tokens: data.usage?.output_tokens || 0,
    },
  };
}

module.exports = { generateDrafts };
