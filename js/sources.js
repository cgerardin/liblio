// Sources externes gratuites, appelables directement depuis le navigateur :
//  - Open Library : couvertures (téléchargeables, CORS ouvert)
//  - Google Books : couvertures en secours (lien externe seulement, pas de CORS)
//  - Wikipédia : photo et courte biographie des auteurs

import { norm } from './util.js';

const q = encodeURIComponent;

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/**
 * Cherche des couvertures candidates pour un livre.
 * Renvoie [{ url, thumb, source, label, downloadable }]
 */
/** Convertit un ISBN-13 (978…) en ISBN-10, ou renvoie l'ISBN-10 nettoyé. */
export function toIsbn10(isbn) {
  const s = String(isbn || '').replace(/[^0-9X]/gi, '').toUpperCase();
  if (s.length === 10) return s;
  if (s.length !== 13 || !s.startsWith('978')) return null;
  const core = s.slice(3, 12);
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += (10 - i) * +core[i];
  const c = (11 - (sum % 11)) % 11;
  return core + (c === 10 ? 'X' : String(c));
}

/** Vérifie qu'une URL d'image existe vraiment (Amazon renvoie un GIF 1×1 sinon). */
async function imageExists(url) {
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    return (await r.blob()).size > 1500;
  } catch {
    return false;
  }
}

/**
 * Cherche des couvertures candidates pour un livre.
 * Renvoie [{ url, thumb, source, label, downloadable }]
 */
export async function searchCovers({ title, author, isbn, googleKey }) {
  const results = [];
  const seen = new Set();
  const push = (c) => {
    if (seen.has(c.url)) return;
    seen.add(c.url);
    results.push(c);
  };
  const isbns = new Set();
  if (isbn) isbns.add(String(isbn).replace(/[^0-9X]/gi, ''));

  const olTask = (async () => {
    const fields = 'key,title,cover_i,first_publish_year,language,isbn';
    const d = await getJSON(
      `https://openlibrary.org/search.json?title=${q(title)}&author=${q(author)}&fields=${fields}&limit=12`,
    );
    // Les éditions françaises d'abord
    const docs = (d.docs || []).sort(
      (a, b) => (b.language?.includes('fre') ? 1 : 0) - (a.language?.includes('fre') ? 1 : 0),
    );
    for (const doc of docs) {
      if (doc.language?.includes('fre') || !doc.language) {
        for (const i of (doc.isbn || []).filter((x) => /^97[89]2|^2/.test(x)).slice(0, 3)) isbns.add(i);
      }
      if (!doc.cover_i) continue;
      push({
        url: `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
        thumb: `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`,
        source: 'Open Library',
        label: `${doc.title}${doc.first_publish_year ? ` (${doc.first_publish_year})` : ''}`,
        downloadable: true,
      });
    }
    // Quelques couvertures d'éditions françaises en plus (souvent la version poche)
    const work = docs.find((x) => norm(x.title) === norm(title)) || docs[0];
    if (work?.key) {
      const eds = await getJSON(`https://openlibrary.org${work.key}/editions.json?limit=40`);
      for (const ed of eds.entries || []) {
        const isFr = (ed.languages || []).some((l) => l.key === '/languages/fre');
        if (!isFr) continue;
        for (const i of [...(ed.isbn_13 || []), ...(ed.isbn_10 || [])].slice(0, 1)) isbns.add(i);
        if (!ed.covers?.length || ed.covers[0] < 0) continue;
        push({
          url: `https://covers.openlibrary.org/b/id/${ed.covers[0]}-L.jpg`,
          thumb: `https://covers.openlibrary.org/b/id/${ed.covers[0]}-M.jpg`,
          source: 'Open Library',
          label: [ed.publishers?.[0], ed.publish_date].filter(Boolean).join(', '),
          downloadable: true,
        });
      }
    }
  })();

  const googleTask = (async () => {
    const d = await getJSON(
      `https://www.googleapis.com/books/v1/volumes?q=${q(`intitle:${title} inauthor:${author}`)}&maxResults=10&printType=books${googleKey ? `&key=${q(googleKey)}` : ''}`,
    );
    for (const it of d.items || []) {
      const v = it.volumeInfo || {};
      for (const id of v.industryIdentifiers || []) {
        if (/^ISBN/.test(id.type) && (v.language === 'fr' || /^97[89]2/.test(id.identifier))) isbns.add(id.identifier);
      }
      const img = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
      if (!img) continue;
      const url = img.replace(/^http:/, 'https:').replace('&edge=curl', '');
      push({
        url,
        thumb: url,
        source: 'Google Books',
        label: [v.publisher, v.publishedDate].filter(Boolean).join(', '),
        downloadable: false,
      });
    }
  })();

  await Promise.allSettled([olTask, googleTask]);

  // Couvertures par ISBN (Amazon et Open Library), vérifiées une à une.
  const byIsbn = [];
  for (const i of [...isbns].slice(0, 8)) {
    const i10 = toIsbn10(i);
    if (i10) {
      byIsbn.push(
        (async () => {
          const url = `https://images-na.ssl-images-amazon.com/images/P/${i10}.01.LZZZZZZZ.jpg`;
          if (await imageExists(url)) return { url, thumb: url, source: 'Amazon', label: `ISBN ${i}`, downloadable: true };
        })(),
      );
    }
    byIsbn.push(
      (async () => {
        const url = `https://covers.openlibrary.org/b/isbn/${i}-L.jpg?default=false`;
        if (await imageExists(url)) return { url, thumb: `https://covers.openlibrary.org/b/isbn/${i}-M.jpg`, source: 'Open Library', label: `ISBN ${i}`, downloadable: true };
      })(),
    );
  }
  const isbnHits = (await Promise.all(byIsbn)).filter(Boolean);
  // L'ISBN fourni explicitement passe en premier
  const front = isbnHits.filter((c) => isbn && c.label.includes(String(isbn).replace(/[^0-9X]/gi, '')));
  const rest = results.splice(0);
  seen.clear();
  for (const c of [...front, ...rest.filter((c) => c.downloadable), ...isbnHits, ...rest]) push(c);
  return results;
}

/**
 * Télécharge une image et la ré-encode en JPEG (hauteur max maxH).
 * Renvoie un Uint8Array, ou lève une erreur si l'image est inaccessible (CORS) ou vide.
 */
export async function downloadImageAsJpeg(urlOrBlob, maxH = 900) {
  let blob = urlOrBlob;
  if (typeof urlOrBlob === 'string') {
    const r = await fetch(urlOrBlob);
    if (!r.ok) throw new Error(`Image introuvable (${r.status})`);
    blob = await r.blob();
  }
  const bmp = await createImageBitmap(blob);
  if (bmp.width < 40 || bmp.height < 40) throw new Error('Image vide ou trop petite');
  const scale = Math.min(1, maxH / bmp.height);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  const out = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.86));
  return new Uint8Array(await out.arrayBuffer());
}

/** Photo + résumé Wikipédia d'un auteur. Renvoie { extract, photo, url } ou null. */
export async function wikipediaAuthor(name, lang = 'fr') {
  const summary = async (title) => {
    const r = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${q(title.replace(/ /g, '_'))}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (d.type === 'disambiguation') return null;
    return {
      extract: d.extract,
      photo: d.thumbnail?.source || null,
      url: d.content_urls?.desktop?.page,
    };
  };
  try {
    let s = await summary(name);
    if (!s) {
      const d = await getJSON(
        `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${q(`${name} écrivain`)}&format=json&origin=*&srlimit=1`,
      );
      const t = d.query?.search?.[0]?.title;
      if (t) s = await summary(t);
    }
    return s;
  } catch {
    return null;
  }
}
