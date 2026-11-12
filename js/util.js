// Petites fonctions utilitaires partagées.

export const enc = new TextEncoder();
export const dec = new TextDecoder();

export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

export function unb64(s) {
  return Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0));
}

/** Échappe une valeur pour l'insérer dans du HTML. */
export function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Normalise un texte pour la recherche / comparaison (minuscules, sans accents ni ponctuation). */
export function norm(s) {
  return String(s ?? '')
    .replace(/[’']/g, ' ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function slugify(s) {
  return norm(String(s).replace(/Я/g, 'r')).replace(/ /g, '-') || 'x';
}

export function uniqueId(base, existing) {
  let id = base;
  let i = 2;
  while (existing.has(id)) id = `${base}-${i++}`;
  return id;
}

export function shortRand() {
  return Math.random().toString(36).slice(2, 8);
}

/** Couleur stable pour un nom de cycle (palette du logo). */
const SERIES_COLORS = ['#1477be', '#11a89f', '#f5a12d', '#7a5cc4', '#d6457a', '#3d8b37', '#c0712b'];
export function seriesColor(name) {
  let h = 0;
  for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return SERIES_COLORS[h % SERIES_COLORS.length];
}

export function initials(name) {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function plural(n, one, many) {
  return `${n} ${n > 1 ? many : one}`;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export const BOOK_TYPES = ['Roman', 'Recueil de nouvelles', 'Nouvelle', 'BD', 'Jeunesse', 'Essai', 'Théâtre', 'Collectif', 'Autre'];

/** Types d'édition communs à tous les auteurs ; chaque auteur nomme ses éditions comme il veut. */
export const EDITION_KINDS = [
  { id: 'grand-format', label: 'Grand format', color: '#1477be' },
  { id: 'poche', label: 'Poche', color: '#11a89f' },
  { id: 'collector', label: 'Collector', color: '#f5a12d' },
  { id: 'autre', label: 'Autre', color: '#7a5cc4' },
];

export const editionKind = (id) => EDITION_KINDS.find((k) => k.id === id) || EDITION_KINDS[3];

/** Devine le type d'une édition à partir de son nom (pour la reprise des anciennes données). */
export function guessEditionKind(name) {
  const n = norm(name);
  if (/collector|luxe|prestige|illustre|limite|integrale/.test(n)) return 'collector';
  if (/poche|pocket|folio|j ai lu|points|10 18|babel|milady|bragelonne poche|le livre de poche/.test(n)) return 'poche';
  return 'grand-format';
}
