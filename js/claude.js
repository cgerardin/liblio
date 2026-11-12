// Récupération automatique de la bibliographie d'un auteur avec Claude
// (recherche web côté Anthropic + sortie structurée via un outil strict).
// La clé API n'est jamais publique : elle vit dans le coffre chiffré et n'est
// déchiffrée que dans le navigateur de l'administrateur.

// SDK officiel @anthropic-ai/sdk 1.3.0, compilé en un seul fichier (voir scripts/build-sdk.sh).
import Anthropic from './vendor/anthropic-sdk-1.3.0.mjs';
import { BOOK_TYPES } from './util.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';

const SAVE_TOOL = {
  name: 'enregistrer_bibliographie',
  description:
    "Enregistre la bibliographie finale et vérifiée de l'auteur. À appeler une seule fois, quand les recherches sont terminées.",
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['auteur', 'livres'],
    properties: {
      auteur: {
        type: 'object',
        additionalProperties: false,
        required: ['nom', 'naissance', 'nationalite', 'bio'],
        properties: {
          nom: { type: 'string', description: "Nom usuel de l'auteur" },
          naissance: { type: ['integer', 'null'], description: 'Année de naissance' },
          nationalite: { type: ['string', 'null'] },
          bio: { type: 'string', description: 'Biographie en 2 ou 3 phrases, en français' },
        },
      },
      livres: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['titre', 'annee', 'type', 'cycle', 'numero_cycle', 'coauteurs', 'editeur', 'isbn', 'resume'],
          properties: {
            titre: { type: 'string', description: "Titre exact de l'édition française originale" },
            annee: { type: ['integer', 'null'], description: 'Année de première publication' },
            type: { type: 'string', enum: BOOK_TYPES },
            cycle: { type: ['string', 'null'], description: 'Nom court du cycle / de la série (ex : "Sharko"), sinon null' },
            numero_cycle: { type: ['integer', 'null'], description: 'Position dans le cycle' },
            coauteurs: { type: ['string', 'null'] },
            editeur: { type: ['string', 'null'], description: 'Éditeur de la première édition' },
            isbn: { type: ['string', 'null'], description: "ISBN-13 d'une édition française courante (poche de préférence) si tu l'as trouvé, sinon null" },
            resume: { type: 'string', description: 'Résumé en une phrase, en français' },
          },
        },
      },
    },
  },
};

const SYSTEM = `Tu es un bibliothécaire expert qui établit des bibliographies exactes.
Utilise la recherche web pour vérifier (Wikipédia, site de l'auteur, de l'éditeur, BnF, Babelio, Noosfere…).
Règles :
- Uniquement les œuvres publiées (pas les projets annoncés sans date), en édition française originale.
- Une seule entrée par œuvre : pas de traductions, rééditions, éditions poche, intégrales ou coffrets.
- Titres exacts avec majuscules et accents de l'édition originale.
- Indique le cycle/la série et le numéro quand l'œuvre en fait partie (ordre de lecture de la série).
- Trie par année de première publication.
Quand tu as terminé, appelle l'outil enregistrer_bibliographie. N'écris pas la liste en texte.`;

/**
 * @param {object} p
 * @param {string} p.apiKey
 * @param {string} p.author      Nom de l'auteur
 * @param {string[]} p.include   Types à inclure en plus des romans
 * @param {string[]} p.known     Titres déjà présents dans la collection (pour aider l'alignement)
 * @param {(msg:string)=>void} p.onProgress
 */
export async function fetchBibliography({ apiKey, model = DEFAULT_MODEL, author, include = [], known = [], knownSeries = [], onProgress = () => {} }) {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });

  let ask = `Établis la bibliographie complète de l'auteur « ${author} ».
Inclure : romans${include.length ? `, ${include.join(', ')}` : ''}.
${include.length ? '' : "Exclure les nouvelles isolées, collectifs, BD, ouvrages jeunesse et essais.\n"}`;
  if (known.length) {
    ask += `\nLe lecteur possède déjà ces titres dans sa liste (réutilise exactement la même orthographe s'il s'agit de la même œuvre) :\n${known.map((t) => `- ${t}`).join('\n')}\n`;
  }

  if (knownSeries.length) {
    ask += `\nNoms de cycles déjà utilisés dans sa liste (réutilise-les tels quels) : ${knownSeries.join(', ')}.\n`;
  }

  const messages = [{ role: 'user', content: ask }];

  for (let turn = 0; turn < 8; turn++) {
    onProgress(turn === 0 ? 'Claude recherche la bibliographie…' : 'Claude poursuit ses recherches…');
    let resp;
    try {
      resp = await client.beta.messages.create({
        model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: SYSTEM,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 10 }, SAVE_TOOL],
        messages,
      });
    } catch (e) {
      const detail = e.error?.error?.message || e.message;
      if (e.status === 401) throw new Error('Clé API Claude invalide (vérifiez-la dans les réglages).');
      if (e.status === 403) throw new Error(`Accès refusé par l'API Claude : ${detail}`);
      if (e.status === 429) throw new Error('Limite de requêtes Claude atteinte, réessayez dans une minute.');
      if (e.status === 529 || e.status >= 500) throw new Error('Le service Claude est momentanément indisponible, réessayez plus tard.');
      if (e.status === 400) throw new Error(`Requête refusée par l'API Claude : ${detail}`);
      throw e;
    }

    if (resp.stop_reason === 'refusal') throw new Error('Claude a refusé la requête.');

    const searches = resp.content.filter((b) => b.type === 'server_tool_use').length;
    if (searches) onProgress(`Claude a effectué ${searches} recherche(s) web…`);

    const call = resp.content.find((b) => b.type === 'tool_use' && b.name === SAVE_TOOL.name);
    if (call) {
      const data = typeof call.input === 'string' ? JSON.parse(call.input) : call.input;
      if (!Array.isArray(data?.livres)) throw new Error('Réponse de Claude invalide.');
      return data;
    }

    messages.push({ role: 'assistant', content: resp.content });
    if (resp.stop_reason === 'pause_turn') continue; // le serveur reprend tout seul
    if (resp.stop_reason === 'max_tokens') throw new Error('Réponse trop longue, réessayez en réduisant les types inclus.');
    messages.push({ role: 'user', content: 'Appelle maintenant l’outil enregistrer_bibliographie avec la liste complète.' });
  }
  throw new Error("Claude n'a pas pu terminer la bibliographie.");
}
