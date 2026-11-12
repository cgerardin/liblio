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

/**
 * Vérifie qu'une URL d'image existe vraiment (Amazon renvoie un GIF 1×1 sinon).
 * Passe par un <img> plutôt que fetch : ça ne dépend ni de CORS ni des bloqueurs de requêtes.
 */
/** Convertit un ISBN-10 en ISBN-13, ou renvoie l'ISBN-13 nettoyé. */
export function toIsbn13(isbn) {
  const s = String(isbn || '').replace(/[^0-9X]/gi, '').toUpperCase();
  if (s.length === 13) return s;
  if (s.length !== 10) return null;
  const core = `978${s.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += (i % 2 ? 3 : 1) * +core[i];
  return core + ((10 - (sum % 10)) % 10);
}

function imageExists(url, { timeout = 10000, portrait = false } = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok) => {
      clearTimeout(t);
      img.onload = img.onerror = null;
      resolve(ok);
    };
    const t = setTimeout(() => done(false), timeout);
    // portrait : écarte les images « couverture non disponible » quasi carrées de certains libraires
    img.onload = () =>
      done(img.naturalWidth > 20 && img.naturalHeight > 20 && (!portrait || img.naturalHeight > img.naturalWidth * 1.2));
    img.onerror = () => done(false);
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

/**
 * Éditions françaises d'un livre d'après le catalogue de la BnF (dépôt légal : quasiment tout y est).
 * Renvoie [{ isbn, label }] — label = « Éditeur, année ».
 */
export async function bnfEditions(title, author) {
  const clean = (s) => String(s).replace(/Я/g, 'R').replace(/["\\]/g, ' ').trim();
  const query = `bib.title all "${clean(title)}" and bib.author all "${clean(author)}"`;
  const url =
    'https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=dublincore&maximumRecords=20' +
    `&query=${q(query)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`BnF ${r.status}`);
  const xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
  const out = [];
  const want = norm(title);
  for (const rec of xml.getElementsByTagNameNS('*', 'dc')) {
    const get = (tag) => [...rec.getElementsByTagNameNS('*', tag)].map((n) => n.textContent.trim());
    // « Labyrinthes / Franck Thilliez » ou « Labyrinthes (Éd. collector…) Franck Thilliez »
    const t = get('title')[0] || '';
    const main = norm(t.split(/\s[\/:(]|\s\[/)[0]);
    if (main !== want) continue;
    const isbns = get('identifier')
      .map((x) => x.match(/^ISBN\s+([0-9Xx-]+)/)?.[1]?.replace(/-/g, ''))
      .filter(Boolean);
    if (!isbns.length) continue;
    const publisher = (get('publisher')[0] || '').replace(/\s*\(.*\)\s*$/, '').replace(/^\[|\]$/g, '');
    const year = (get('date')[0] || '').match(/\d{4}/)?.[0];
    const extra = /collector|gros caract|illustr|luxe|limit/i.test(t) ? t.match(/\(([^)]*)\)/)?.[1]?.replace(/[[\]]/g, '') : null;
    out.push({ isbn: isbns[0], publisher, year: +year || 9999, label: [publisher, year, extra].filter(Boolean).join(', ') });
  }
  // Éditions originales d'abord ; clubs de lecture, gros caractères et livres audio à la fin.
  const secondary = (e) => /loisirs|grand livre du mois|noyelles|libra|audiolib|lizzie|gros caract|feryane|voir de pr/i.test(e.label);
  return out.sort((a, b) => secondary(a) - secondary(b) || a.year - b.year);
}

/**
 * Quatrième de couverture d'après la BnF (zone UNIMARC 330, fournie par les éditeurs).
 * Renvoie { text, publisher, year } ou null. Souvent présente pour les éditions récentes seulement.
 */
export async function bnfBlurb(title, author) {
  const clean = (s) => String(s).replace(/Я/g, 'R').replace(/["\\]/g, ' ').trim();
  const query = `bib.title all "${clean(title)}" and bib.author all "${clean(author)}"`;
  const url =
    'https://catalogue.bnf.fr/api/SRU?version=1.2&operation=searchRetrieve&recordSchema=unimarcxchange&maximumRecords=20' +
    `&query=${q(query)}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`BnF ${r.status}`);
  const xml = new DOMParser().parseFromString(await r.text(), 'application/xml');
  const want = norm(title);
  const found = [];
  for (const rec of xml.getElementsByTagNameNS('*', 'record')) {
    const sub = (tag, code) => {
      for (const f of rec.getElementsByTagNameNS('*', 'datafield')) {
        if (f.getAttribute('tag') !== tag) continue;
        for (const sf of f.getElementsByTagNameNS('*', 'subfield')) if (sf.getAttribute('code') === code) return sf.textContent.trim();
      }
      return '';
    };
    // Retire les mentions commerciales ajoutées en fin de notice (« @ Disponible chez 12-21… »).
    const text = sub('330', 'a')
      .replace(/\s*@?\s*Disponible (chez|en)\b.*$/is, '')
      .replace(/\s+@\s*$/, '')
      .trim();
    if (!text || norm(sub('200', 'a')) !== want) continue;
    const publisher = sub('214', 'c') || sub('210', 'c');
    const year = +((sub('214', 'd') || sub('210', 'd')).match(/\d{4}/)?.[0] || 9999);
    found.push({ text, publisher, year });
  }
  if (!found.length) return null;
  // Édition originale d'abord ; éditions spéciales, clubs et gros caractères en dernier recours.
  const secondary = (e) =>
    /collector|tirage limit|coffret|int[ée]grale/i.test(e.text.slice(0, 80)) ||
    /loisirs|grand livre du mois|noyelles|libra|audiolib|lizzie/i.test(e.publisher);
  found.sort((a, b) => secondary(a) - secondary(b) || a.year - b.year);
  return found[0];
}

/**
 * Cherche des couvertures candidates pour un livre.
 * Renvoie [{ url, thumb, source, label, downloadable, isbn? }]
 */
export async function searchCovers({ title, author, isbn, googleKey, publishers = [] }) {
  const results = [];
  const seen = new Set();
  const push = (c) => {
    if (seen.has(c.url)) return;
    seen.add(c.url);
    results.push(c);
  };
  // ISBN connus ou découverts -> libellé de l'édition
  const isbns = new Map();
  const explicit = isbn ? String(isbn).replace(/[^0-9X]/gi, '').toUpperCase() : null;
  if (explicit) isbns.set(explicit, `ISBN ${explicit}`);
  const addIsbn = (i, label) => {
    const k = String(i).replace(/[^0-9X]/gi, '').toUpperCase();
    const k13 = toIsbn13(k);
    if (!k || [...isbns.keys()].some((x) => x === k || toIsbn13(x) === k13)) return;
    isbns.set(k, label || `ISBN ${k}`);
  };

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
        for (const i of (doc.isbn || []).filter((x) => /^97[89]2|^2/.test(x)).slice(0, 3)) addIsbn(i);
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
        for (const i of [...(ed.isbn_13 || []), ...(ed.isbn_10 || [])].slice(0, 1)) addIsbn(i, [ed.publishers?.[0], ed.publish_date].filter(Boolean).join(', '));
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
        if (/^ISBN/.test(id.type) && (v.language === 'fr' || /^97[89]2/.test(id.identifier))) addIsbn(id.identifier, [v.publisher, v.publishedDate].filter(Boolean).join(', '));
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

  const bnfTask = (async () => {
    for (const e of await bnfEditions(title, author)) addIsbn(e.isbn, e.label);
  })();

  await Promise.allSettled([bnfTask, olTask, googleTask]);

  // Couvertures par ISBN (Amazon, Open Library, Decitre, Place des libraires), vérifiées une à une.
  // Decitre et Place des libraires n'autorisent pas la copie : leurs images sont gardées en lien externe.
  // Les éditions des éditeurs suivis pour cet auteur (colonnes « Fleuve Noir », « Pocket »…) passent devant.
  const words = publishers.flatMap((p) => norm(p).split(' ')).filter((w) => w.length >= 4 && !['grand', 'format', 'poche', 'collector', 'edition', 'editions'].includes(w));
  const preferred = ([k, label]) => k === explicit || words.some((w) => norm(label).includes(w));
  const ranked = [...isbns].sort((a, b) => (a[0] === explicit ? -1 : b[0] === explicit ? 1 : 0) || preferred(b) - preferred(a));
  const byIsbn = [];
  for (const [i, label] of ranked.slice(0, 10)) {
    const i13 = toIsbn13(i);
    const i10 = toIsbn10(i);
    const base = { label, isbn: i13 || i };
    if (i13 && i13.startsWith('978')) {
      byIsbn.push(
        (async () => {
          const url = `https://products-images.di-static.com/image/x/${i13}-475x500-1.jpg`;
          if (await imageExists(url)) return { ...base, url, thumb: url, source: 'Decitre', downloadable: false };
        })(),
        (async () => {
          const thumb = `https://images.epagine.fr/${i13.slice(-3)}/${i13}_1_m.jpg`;
          if (await imageExists(thumb, { portrait: true })) {
            return { ...base, url: `https://images.epagine.fr/${i13.slice(-3)}/${i13}_1_75.jpg`, thumb, source: 'Place des libraires', downloadable: false };
          }
        })(),
      );
    }
    if (i10) {
      byIsbn.push(
        (async () => {
          // Deux domaines Amazon servent les mêmes images : le second sert de secours si le premier est bloqué.
          for (const host of ['images-na.ssl-images-amazon.com', 'm.media-amazon.com']) {
            const url = `https://${host}/images/P/${i10}.01.LZZZZZZZ.jpg`;
            if (await imageExists(url)) return { ...base, url, thumb: url, source: 'Amazon', downloadable: true };
          }
        })(),
      );
    }
    byIsbn.push(
      (async () => {
        const url = `https://covers.openlibrary.org/b/isbn/${i}-L.jpg?default=false`;
        if (await imageExists(url)) return { ...base, url, thumb: `https://covers.openlibrary.org/b/isbn/${i}-M.jpg`, source: 'Open Library', downloadable: true };
      })(),
    );
  }
  // Ordre : édition demandée d'abord, puis par édition (dans l'ordre trouvé), images copiables en premier.
  const order = ranked.map(([k]) => toIsbn13(k) || k);
  const isbnHits = (await Promise.all(byIsbn))
    .filter(Boolean)
    .sort((a, b) => order.indexOf(a.isbn) - order.indexOf(b.isbn) || b.downloadable - a.downloadable);
  const rest = results.splice(0);
  seen.clear();
  const wanted = explicit ? isbnHits.filter((c) => c.isbn === (toIsbn13(explicit) || explicit)) : [];
  for (const c of [...wanted, ...isbnHits.filter((c) => c.downloadable), ...rest.filter((c) => c.downloadable), ...isbnHits, ...rest]) {
    push(c);
  }
  return results;
}

/**
 * Télécharge une image et la ré-encode en JPEG (hauteur max maxH).
 * Renvoie un Uint8Array, ou lève une erreur si l'image est inaccessible (CORS) ou vide.
 */
export async function downloadImageAsJpeg(urlOrBlob, maxH = 900) {
  let blob = urlOrBlob;
  if (typeof urlOrBlob === 'string') {
    let r;
    try {
      // no-store : évite de réutiliser une copie mise en cache par un <img> sans en-têtes CORS.
      r = await fetch(urlOrBlob, { cache: 'no-store', mode: 'cors', referrerPolicy: 'no-referrer' });
    } catch {
      const e = new Error('Le site source bloque le téléchargement de cette image');
      e.code = 'CORS';
      throw e;
    }
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
