/**
 * AI draft generation for Google review responses.
 * Uses Anthropic Claude API directly (no googleapis dependency needed).
 *
 * Per ADR-012 note: LLMClient abstraction is in IDEES-EN-ATTENTE.md,
 * not yet implemented. Direct Anthropic calls for now.
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// FEW-SHOT EXAMPLES HUGO — placeholders until Hugo provides his real examples
const FEW_SHOT_EXAMPLES = [
  {
    rating: 5,
    comment: "Excellente expérience, le Dr Setbon est très professionnel et rassurant.",
    reply: "Merci beaucoup pour votre retour chaleureux. Nous sommes ravis que votre expérience au cabinet ait été positive. Toute l'équipe met un point d'honneur à vous accompagner avec professionnalisme et bienveillance. Au plaisir de vous revoir. L'équipe du Cabinet Endodontie Louise."
  },
  {
    rating: 5,
    comment: "Très bon cabinet, personnel accueillant et compétent.",
    reply: "Un grand merci pour ce témoignage qui nous touche sincèrement. L'accueil et la compétence de notre équipe sont au cœur de nos priorités. Nous sommes heureux que cela se ressente. L'équipe du Cabinet Endodontie Louise."
  },
  {
    rating: 4,
    comment: "Bon traitement mais l'attente était un peu longue.",
    reply: "Merci pour votre retour. Nous sommes heureux que le traitement se soit bien passé. Nous prenons note de votre remarque concernant l'attente et travaillons continuellement à optimiser notre organisation. N'hésitez pas à nous contacter si besoin. L'équipe du Cabinet Endodontie Louise."
  }
];

function buildSystemPrompt(rating) {
  let tonGuidance;
  if (rating >= 5) {
    tonGuidance = 'Ton chaleureux et reconnaissant. Remercie sincèrement le patient pour son avis positif.';
  } else if (rating >= 4) {
    tonGuidance = 'Ton chaleureux avec remerciements. Montre de la gratitude pour le retour positif.';
  } else if (rating >= 3) {
    tonGuidance = 'Ton nuancé, professionnel et empathique. Remercie pour le retour, montre que les remarques sont prises en compte.';
  } else {
    tonGuidance = 'Ton professionnel, rassurant et empathique. Ne pas être défensif. Montrer de la compréhension et proposer un dialogue privé si nécessaire.';
  }

  const examples = FEW_SHOT_EXAMPLES.map(ex =>
    `[Avis ${ex.rating}★] "${ex.comment}"\n[Réponse] "${ex.reply}"`
  ).join('\n\n');

  return `Tu es l'assistant de communication du Cabinet Endodontie Louise (cabinet spécialisé en endodontie à Bruxelles).
Tu rédiges des réponses aux avis Google de patients.

Règles STRICTES :
- Signe au nom de "L'équipe du Cabinet Endodontie Louise"
- Ne JAMAIS révéler d'information médicale, même si l'avis en contient (RGPD)
- Ne JAMAIS mentionner de diagnostic, traitement ou détail clinique
- Rester sobre, professionnel et bienveillant
- Réponse courte (3-5 phrases max)
- En français
- ${tonGuidance}

Voici des exemples de réponses validées par le cabinet :

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

  const userPrompt = `Rédige 3 variantes de réponse à cet avis Google (séparées par ---) :

Auteur : ${author_name || 'Anonyme'}${firstName ? ` (prénom : ${firstName})` : ''}
Note : ${rating}/5 étoiles
Commentaire : ${comment || '(aucun commentaire)'}

Écris uniquement les 3 réponses séparées par ---, sans numérotation ni guillemets ni préfixe.`;

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
