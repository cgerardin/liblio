// Interface de Liblio : consultation publique + gestion (après connexion).

import {
  S, init, change, isDirty, login, saveVault, logout, publish, repoInfo, readVault,
  imgSrc, rawUrl, storeImage, dropImage,
  authorById, bookById, booksOf, authorStats, seriesOf, ownedCount, cmpBooks,
  addAuthor, addBook, deleteBook, deleteAuthor, newEditionId, normalizeImport, previewImport, applyImport,
} from './store.js';
import { searchCovers, downloadImageAsJpeg, wikipediaAuthor, bnfBlurb } from './sources.js';
import { esc, norm, seriesColor, initials, plural, BOOK_TYPES, EDITION_KINDS, editionKind } from './util.js';

const DEFAULT_MODEL = 'claude-opus-5-5';
const root = document.getElementById('app');

const UI = {
  filter: 'all',
  series: '*',
  view: safeGet('liblio-view') || (window.matchMedia('(max-width: 720px)').matches ? 'grid' : 'table'),
  q: '',
};

function safeGet(k) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function safeSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

// ------------------------------------------------------------------ icônes

const icon = (d, extra = '') => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
const I = {
  lock: icon('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  spark: icon('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  image: icon('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="M21 15l-5-5L5 21"/>'),
  edit: icon('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: icon('<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>'),
  check: icon('<path d="M20 6L9 17l-5-5"/>'),
  table: icon('<path d="M3 5h18M3 12h18M3 19h18"/>'),
  grid: icon('<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="9" rx="1"/><rect x="3" y="15" width="7" height="6" rx="1"/><rect x="14" y="15" width="7" height="6" rx="1"/>'),
  search: icon('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  download: icon('<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 20h16"/>'),
  upload: icon('<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 20h16"/>'),
  cog: icon('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  out: icon('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>'),
  cloud: icon('<path d="M12 13v8M8 17l4-4 4 4"/><path d="M20 16.6A5 5 0 0 0 18 7h-1.3A8 8 0 1 0 4 15.3"/>'),
  back: icon('<path d="M15 18l-6-6 6-6"/>'),
  book: icon('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>'),
  star: icon('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>'),
  heart: icon('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>'),
  heartFull: icon('<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>', 'data-fill'),
  gift: icon('<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>'),
  up: icon('<path d="M18 15l-6-6-6 6"/>'),
  ext: icon('<path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>'),
  link: icon('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'),
};

// ------------------------------------------------------------------ éléments communs

const ownerName = () => (S.lib.settings?.ownerName || '').trim();
const wished = (b) => !!b.wish && ownedCount(b) === 0;

/** Liste des envies : la plus récemment mise en avant en premier. */
function wishList() {
  return S.lib.books.filter(wished).sort((x, y) => (y.wishedAt || '').localeCompare(x.wishedAt || ''));
}

function giftLinks(b) {
  const a = authorById(b.authorId);
  const qs = encodeURIComponent(`${b.title} ${a?.name || ''}`.trim());
  const links = [
    ['Vinted', 'vinted', `https://www.vinted.fr/catalog?search_text=${qs}`],
    ['Amazon', 'amazon', `https://www.amazon.fr/s?k=${qs}&i=stripbooks`],
  ];
  return links
    .map(
      ([name, cls, url]) =>
        `<a class="btn gift ${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer" title="Chercher « ${esc(b.title)} » sur ${name} (nouvel onglet)"><span>Trouver sur ${name}</span>${I.ext}</a>`,
    )
    .join('');
}

function wishBadge(b) {
  return wished(b) ? `<span class="badge wish" title="Souhaité">${I.heartFull}Souhaité</span>` : '';
}

function setWish(b, on) {
  if (on) {
    b.wish = true;
    b.wishedAt = new Date().toISOString();
  } else {
    delete b.wish;
    delete b.wishedAt;
  }
  change(`${on ? 'envie' : 'retrait des envies'} : « ${b.title} »`);
}

/** Un livre acheté n'est plus « souhaité ». */
function clearWishIfOwned(b) {
  if (ownedCount(b) > 0 && b.wish) {
    delete b.wish;
    delete b.wishedAt;
  }
}

function coverHtml(b, cls = '') {
  if (b.cover) {
    return `<img class="cover ${cls}" src="${esc(imgSrc(b.cover))}" data-path="${esc(b.cover)}" alt="Couverture de ${esc(b.title)}" loading="lazy">`;
  }
  const c = b.series ? seriesColor(b.series) : '#06477f';
  return `<div class="cover ph ${cls}" style="--c:${c}" aria-hidden="true"><span>${esc(b.title)}</span></div>`;
}

function avatarHtml(a, cls = '') {
  if (a.photo) {
    return `<img class="avatar ${cls}" src="${esc(imgSrc(a.photo))}" data-path="${esc(a.photo)}" alt="${esc(a.name)}" loading="lazy">`;
  }
  return `<div class="avatar ph ${cls}" aria-hidden="true">${esc(initials(a.name))}</div>`;
}

/** Libellé d'une édition : son nom, et son type quand le nom est différent (« Fleuve Noir · grand format »). */
function editionTag(e) {
  const k = editionKind(e.kind);
  return `<span class="ed-dot" style="--c:${k.color}" title="${esc(k.label)}"></span>${esc(e.label)}`;
}

function editionBadge(e, n) {
  const k = editionKind(e.kind);
  const sub = norm(e.label) !== norm(k.label) ? ` <small>${esc(k.label.toLowerCase())}</small>` : '';
  return `<span class="badge ed" style="--c:${k.color}">${I.check}${esc(e.label)}${sub}${n > 1 ? ` ×${n}` : ''}</span>`;
}

function seriesBadge(b) {
  if (!b.series) return '';
  const full = `${b.series}${b.seriesIndex ? ` n°${b.seriesIndex}` : ''}`;
  return `<span class="badge series" style="--c:${seriesColor(b.series)}" title="Cycle ${esc(full)}"><span class="sn">${esc(b.series)}</span>${b.seriesIndex ? `<b>${b.seriesIndex}</b>` : ''}</span>`;
}

function stars(n) {
  if (!n) return '';
  return `<span class="stars" title="${n}/5">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
}

function progress(st) {
  const pOwned = st.total ? Math.round((st.owned / st.total) * 100) : 0;
  const pRead = st.total ? Math.round((st.read / st.total) * 100) : 0;
  return `<div class="bars" title="${pOwned} % possédés · ${pRead} % lus">
    <div class="bar"><i style="width:${pOwned}%"></i></div>
    <div class="bar read"><i style="width:${pRead}%"></i></div>
  </div>`;
}

// ------------------------------------------------------------------ rendu

function header() {
  const route = location.hash || '#/';
  const n = S.changes.length + S.pending.size;
  const nav = (href, label) =>
    `<a href="${href}" class="${route === href || (href !== '#/' && route.startsWith(href)) ? 'on' : ''}">${label}</a>`;
  return `<header class="topbar">
    <div class="wrap topbar-in">
      <a href="#/" class="brand" aria-label="Liblio${ownerName() ? ` de ${esc(ownerName())}` : ''}, accueil"><picture><source srcset="assets/logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="assets/logo.svg" alt="Liblio"></picture>${ownerName() ? `<span class="brand-owner">de ${esc(ownerName())}</span>` : ''}</a>
      <nav class="nav">${nav('#/', 'Auteurs')}${nav('#/manquants', 'À acheter')}</nav>
      <div class="spacer"></div>
      ${
        S.admin
          ? `<button class="btn ${isDirty() ? 'primary pulse' : 'ghost'}" data-act="publish" ${isDirty() ? '' : 'disabled'} title="Enregistrer les modifications dans le dépôt">
               ${I.cloud}<span>${isDirty() ? `Publier <span class="count">${n || ''}</span>` : 'À jour'}</span></button>
             <button class="btn ghost icon-only" data-act="settings" title="Réglages" aria-label="Réglages">${I.cog}</button>
             <button class="btn ghost icon-only" data-act="logout" title="Se déconnecter" aria-label="Se déconnecter">${I.out}</button>`
          : `<button class="btn ghost" data-act="login">${I.lock}<span>Gérer</span></button>`
      }
    </div>
    ${S.admin && S.local ? '<div class="devbar">Mode local — les publications sont écrites directement sur le disque</div>' : ''}
  </header>`;
}

function viewHome() {
  const all = S.lib.books;
  const owned = all.filter((b) => ownedCount(b) > 0).length;
  const read = all.filter((b) => b.read).length;
  const authors = S.lib.authors;
  return `<section class="hero wrap">
    <div>
      <h1>${ownerName() ? `La bibliothèque de ${esc(ownerName())}` : 'Ma bibliothèque'}</h1>
      <p class="stats">${plural(authors.length, 'auteur', 'auteurs')} · ${plural(all.length, 'livre', 'livres')} · <b>${owned}</b> possédés · <b>${read}</b> lus</p>
    </div>
    <label class="search">${I.search}<input id="q" type="search" placeholder="Rechercher un titre, un auteur, un cycle…" value="${esc(UI.q)}" autocomplete="off"></label>
  </section>
  <section class="wrap" id="results">${searchResults()}</section>
  <section class="wrap">
    <div class="section-head"><h2>Auteurs</h2>
      ${
        S.admin
          ? `<div class="head-actions">
              <label class="btn" title="Importer une bibliothèque au format JSON">${I.upload}<span>Importer</span><input type="file" accept=".json,application/json" data-change="import-file" hidden></label>
              <button class="btn" data-act="export" title="Télécharger la collection au format JSON">${I.download}<span>Exporter</span></button>
              <button class="btn primary" data-act="add-author">${I.plus}<span>Ajouter un auteur</span></button>
            </div>`
          : ''
      }
    </div>
    ${
      authors.length
        ? `<div class="authors">${authors.map(authorCard).join('')}</div>`
        : `<div class="empty">${I.book}<p>La collection est vide.</p>${S.admin ? '' : '<p class="muted">Connectez-vous pour ajouter des auteurs.</p>'}</div>`
    }
  </section>`;
}

function authorCard(a) {
  const st = authorStats(a.id);
  const covers = booksOf(a.id).filter((b) => b.cover).slice(-3).reverse();
  return `<a class="author-card" href="#/a/${esc(a.id)}">
    ${avatarHtml(a)}
    <div class="ac-body">
      <h3>${esc(a.name)}</h3>
      <p class="muted">${plural(st.total, 'livre', 'livres')} · ${st.owned} possédés · ${st.read} lus</p>
      ${progress(st)}
    </div>
    <div class="ac-covers">${covers.map((b) => coverHtml(b, 'xs')).join('')}</div>
  </a>`;
}

function searchResults() {
  const q = norm(UI.q);
  if (q.length < 2) return '';
  const words = q.split(' ');
  const hits = S.lib.books
    .filter((b) => {
      const a = authorById(b.authorId);
      const hay = norm(`${b.title} ${a?.name} ${b.series || ''} ${b.year || ''}`);
      return words.every((w) => hay.includes(w));
    })
    .sort(cmpBooks)
    .slice(0, 40);
  if (!hits.length) return `<p class="muted search-empty">Aucun résultat pour « ${esc(UI.q)} ».</p>`;
  return `<div class="hits">${hits.map((b) => bookRowCompact(b)).join('')}</div>`;
}

function bookRowCompact(b, { showAuthor = true } = {}) {
  const a = authorById(b.authorId);
  const own = ownedCount(b);
  const badges = [
    seriesBadge(b),
    wishBadge(b),
    own ? `<span class="badge ok">${I.check}Possédé</span>` : '',
    b.read ? '<span class="badge read">Lu</span>' : '',
  ].join('');
  return `<button class="hit" data-act="open-book" data-id="${esc(b.id)}">
    ${coverHtml(b, 'xs')}
    <span class="hit-main">
      <b class="hit-title">${esc(b.title)}</b>
      <span class="muted">${showAuthor ? `${esc(a?.name)} · ` : ''}${b.year ?? ''}</span>
      ${badges.trim() ? `<span class="hit-badges">${badges}</span>` : ''}
    </span>
  </button>`;
}

function filteredBooks(aid) {
  return booksOf(aid).filter((b) => {
    if (UI.series === '-' && b.series) return false;
    if (UI.series !== '*' && UI.series !== '-' && b.series !== UI.series) return false;
    switch (UI.filter) {
      case 'owned': return ownedCount(b) > 0;
      case 'missing': return ownedCount(b) === 0;
      case 'read': return b.read;
      case 'unread': return !b.read;
      case 'wish': return wished(b);
      default: return true;
    }
  });
}

function viewAuthor(id) {
  const a = authorById(id);
  if (!a) return `<div class="wrap empty"><p>Auteur introuvable.</p><a href="#/" class="btn">Retour</a></div>`;
  const st = authorStats(a.id);
  const series = seriesOf(a.id);
  if (UI.series !== '*' && UI.series !== '-' && !series.includes(UI.series)) UI.series = '*';
  const books = filteredBooks(a.id);
  const seg = (k, label) => `<button class="${UI.filter === k ? 'on' : ''}" data-act="filter" data-v="${k}">${label}</button>`;
  const meta = [a.birthYear && `né en ${a.birthYear}`, a.nationality].filter(Boolean).join(' · ');

  return `<section class="author-head wrap">
    <a href="#/" class="back">${I.back}Auteurs</a>
    <div class="ah">
      ${avatarHtml(a, 'lg')}
      <div class="ah-body">
        <h1>${esc(a.name)}</h1>
        ${meta ? `<p class="muted">${esc(meta)}</p>` : ''}
        ${a.bio ? `<p class="bio">${esc(a.bio)}</p>` : ''}
        ${a.wikipedia ? `<a class="link" href="${esc(a.wikipedia)}" target="_blank" rel="noopener">${I.link}Wikipédia</a>` : ''}
        <div class="ah-stats">
          <div><b>${st.total}</b><span>livres</span></div>
          <div><b>${st.owned}</b><span>possédés</span></div>
          <div><b>${st.read}</b><span>lus</span></div>
          <div><b>${st.total - st.owned}</b><span>manquants</span></div>
        </div>
      </div>
    </div>
    ${
      S.admin
        ? `<div class="admin-actions">
            <button class="btn primary" data-act="bibliography" data-id="${esc(a.id)}">${I.spark}<span>Mettre à jour la bibliographie</span></button>
            <button class="btn" data-act="auto-covers" data-id="${esc(a.id)}">${I.image}<span>Couvertures manquantes</span></button>
            <button class="btn" data-act="auto-blurbs" data-id="${esc(a.id)}">${I.book}<span>4es de couverture</span></button>
            <button class="btn" data-act="new-book" data-id="${esc(a.id)}">${I.plus}<span>Livre</span></button>
            <button class="btn" data-act="edit-author" data-id="${esc(a.id)}">${I.edit}<span>Auteur</span></button>
          </div>`
        : ''
    }
  </section>
  <section class="wrap">
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Filtrer">
        ${seg('all', 'Tous')}${seg('owned', 'Possédés')}${seg('missing', 'Manquants')}${seg('read', 'Lus')}${seg('unread', 'À lire')}${booksOf(a.id).some(wished) ? seg('wish', 'Souhaités') : ''}
      </div>
      ${
        series.length
          ? `<select data-change="series" aria-label="Cycle">
              <option value="*">Tous les cycles</option>
              ${series.map((s) => `<option value="${esc(s)}" ${UI.series === s ? 'selected' : ''}>Cycle ${esc(s)}</option>`).join('')}
              <option value="-" ${UI.series === '-' ? 'selected' : ''}>Hors cycle</option>
            </select>`
          : ''
      }
      <div class="spacer"></div>
      <div class="seg icons" role="group" aria-label="Affichage">
        <button class="${UI.view === 'table' ? 'on' : ''}" data-act="view" data-v="table" title="Tableau" aria-label="Tableau">${I.table}</button>
        <button class="${UI.view === 'grid' ? 'on' : ''}" data-act="view" data-v="grid" title="Couvertures" aria-label="Couvertures">${I.grid}</button>
      </div>
    </div>
    ${
      !booksOf(a.id).length
        ? `<div class="empty">${I.book}<p>Aucun livre pour l'instant.</p>${S.admin ? `<button class="btn primary" data-act="bibliography" data-id="${esc(a.id)}">${I.spark}<span>Récupérer la bibliographie avec Claude</span></button>` : ''}</div>`
        : !books.length
          ? '<p class="muted empty-filter">Aucun livre ne correspond à ce filtre.</p>'
          : UI.view === 'grid'
            ? bookGrid(books)
            : bookTable(a, books)
    }
  </section>`;
}

function bookTable(a, books) {
  const cols = a.editions || [];
  const ownCell = (b, e) => {
    const n = +b.owned?.[e.id] || 0;
    const marks = n
      ? `<span class="own" style="--c:${editionKind(e.kind).color}">${I.check}${n > 1 ? `<sup>×${n}</sup>` : ''}</span>`
      : '<span class="none">—</span>';
    return S.admin
      ? `<td class="c"><button class="cell-btn" data-act="own" data-id="${esc(b.id)}" data-ed="${esc(e.id)}" title="${esc(e.label)} : ${n} exemplaire(s) — cliquer pour changer">${marks}</button></td>`
      : `<td class="c" title="${esc(e.label)}">${marks}</td>`;
  };
  const readCell = (b) => {
    const m = b.read ? `<span class="own read">${I.check}</span>` : '<span class="none">—</span>';
    return S.admin
      ? `<td class="c"><button class="cell-btn" data-act="read" data-id="${esc(b.id)}" title="Marquer comme ${b.read ? 'non lu' : 'lu'}">${m}</button></td>`
      : `<td class="c">${m}</td>`;
  };

  return `<div class="table-wrap"><table class="books">
    <thead>
      <tr>
        <th class="cv"></th><th>Titre</th><th class="c">Année</th><th>Cycle</th>
        ${cols.length ? `<th class="c group" colspan="${cols.length}">Éditions possédées</th>` : ''}
        ${S.admin ? '<th class="c add"></th>' : ''}
        <th class="c">Lu</th>
      </tr>
      <tr class="sub">
        <th class="cv"></th><th></th><th></th><th></th>
        ${cols
          .map((e) =>
            S.admin
              ? `<th class="c"><button class="pub-btn" draggable="true" data-drag-ed="${esc(e.id)}" data-act="edit-edition" data-id="${esc(a.id)}" data-ed="${esc(e.id)}" title="${esc(editionKind(e.kind).label)} — cliquer pour modifier, glisser pour déplacer">${editionTag(e)}</button></th>`
              : `<th class="c" title="${esc(editionKind(e.kind).label)}">${editionTag(e)}</th>`,
          )
          .join('')}
        ${S.admin ? `<th class="c add"><button class="pub-btn add" data-act="add-edition" data-id="${esc(a.id)}" title="Ajouter une édition (grand format, poche, collector…)">${I.plus}</button></th>` : ''}
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${books
        .map(
          (b) => `<tr class="${b.series ? 'in-series' : ''} ${ownedCount(b) ? 'is-owned' : ''}" style="${b.series ? `--c:${seriesColor(b.series)}` : ''}">
          <td class="cv"><button class="cv-btn" data-act="open-book" data-id="${esc(b.id)}" tabindex="-1" aria-hidden="true">${coverHtml(b, 'xs')}</button></td>
          <td class="title"><button class="link-btn" data-act="open-book" data-id="${esc(b.id)}">${esc(b.title)}</button>
            ${wished(b) ? `<span class="wish-ic" title="Souhaité">${I.heartFull}</span>` : ''}
            ${b.type && b.type !== 'Roman' ? `<span class="type">${esc(b.type)}</span>` : ''} ${stars(b.rating)}</td>
          <td class="c year">${b.year ?? ''}</td>
          <td>${seriesBadge(b)}</td>
          ${cols.map((p) => ownCell(b, p)).join('')}
          ${S.admin ? '<td></td>' : ''}
          ${readCell(b)}
        </tr>`,
        )
        .join('')}
    </tbody>
  </table></div>`;
}

function bookGrid(books) {
  return `<div class="grid">${books
    .map(
      (b) => `<button class="card ${ownedCount(b) ? '' : 'not-owned'}" data-act="open-book" data-id="${esc(b.id)}">
        <div class="card-cover">${coverHtml(b)}
          ${b.read ? '<span class="corner read">Lu</span>' : ''}
          ${ownedCount(b) ? `<span class="corner own" title="Possédé">${I.check}</span>` : ''}
          ${wished(b) ? `<span class="corner wish" title="Souhaité">${I.heartFull}</span>` : ''}
        </div>
        <span class="card-title">${esc(b.title)}</span>
        <span class="card-meta">${b.year ?? ''} ${seriesBadge(b)}</span>
      </button>`,
    )
    .join('')}</div>`;
}

function missingRow(b, { showAuthor = false, inWishList = false } = {}) {
  const a = authorById(b.authorId);
  let actions = '';
  if (S.admin) {
    actions = `<div class="row-actions">
      ${inWishList ? `<button class="btn small icon-only" data-act="wish-top" data-id="${esc(b.id)}" title="Remonter en tête des envies" aria-label="Remonter en tête">${I.up}</button>` : ''}
      <button class="btn small icon-only wish-btn ${wished(b) ? 'on' : ''}" data-act="wish" data-id="${esc(b.id)}" title="${wished(b) ? 'Retirer des envies' : 'Marquer comme souhaité'}" aria-pressed="${wished(b)}">${wished(b) ? I.heartFull : I.heart}</button>
      ${(a?.editions || [])
        .map((e) => `<button class="btn small" data-act="bought" data-id="${esc(b.id)}" data-ed="${esc(e.id)}" title="J'ai acheté cette édition">${I.plus}${editionTag(e)}</button>`)
        .join('')}
    </div>`;
  } else {
    actions = `<div class="row-actions gifts"><span class="gifts-label">${I.gift} M'offrir</span>${giftLinks(b)}</div>`;
  }
  return `<div class="hit-row">${bookRowCompact(b, { showAuthor })}${actions}</div>`;
}

function viewMissing() {
  const wishes = wishList();
  const groups = S.lib.authors
    .map((a) => ({ a, books: booksOf(a.id).filter((b) => ownedCount(b) === 0 && !wished(b)) }))
    .filter((g) => g.books.length);
  const total = S.lib.books.filter((b) => ownedCount(b) === 0).length;
  const owner = ownerName();
  return `<section class="hero wrap"><div>
      <h1>À acheter</h1>
      <p class="stats">${plural(total, 'livre manquant', 'livres manquants')} dans la collection${wishes.length ? ` · <b>${wishes.length}</b> souhaité${wishes.length > 1 ? 's' : ''}` : ''}</p>
      ${!S.admin && total ? `<p class="muted gift-intro">${I.gift} Envie de faire plaisir${owner ? ` à ${esc(owner)}` : ''} ? Chaque livre a ses liens de recherche Vinted et Amazon.</p>` : ''}
    </div></section>
    <section class="wrap">
    ${
      wishes.length
        ? `<div class="missing-group wishes">
            <h2>${I.heartFull} ${owner ? `Les envies de ${esc(owner)}` : 'Envies prioritaires'} <span class="muted">${wishes.length}</span></h2>
            <div class="hits">${wishes.map((b) => missingRow(b, { showAuthor: true, inWishList: true })).join('')}</div>
          </div>`
        : S.admin && total
          ? `<p class="muted small wish-hint">${I.heart} Marquez des livres comme « souhaités » pour les mettre en avant ici, quel que soit l'auteur.</p>`
          : ''
    }
    ${
      groups.length
        ? groups
            .map(
              ({ a, books }) => `<div class="missing-group">
          <h2><a href="#/a/${esc(a.id)}">${esc(a.name)}</a> <span class="muted">${books.length}</span></h2>
          <div class="hits">${books.map((b) => missingRow(b)).join('')}</div>
        </div>`,
            )
            .join('')
        : !wishes.length
          ? `<div class="empty">${I.check}<p>Rien à acheter : la collection est complète !</p></div>`
          : ''
    }
    </section>`;
}

function footer() {
  const d = S.lib.updatedAt ? new Date(S.lib.updatedAt).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : null;
  return `<footer class="wrap foot">
    <picture><source srcset="assets/logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="assets/logo.svg" alt="" width="80"></picture>
    <span class="muted">${d ? `Mis à jour le ${d}` : ''}</span>
  </footer>`;
}

let lastRoute = '';
function render() {
  const route = location.hash || '#/';
  const sameRoute = route === lastRoute;
  const y = window.scrollY;
  const focusId = document.activeElement?.id;
  const sel = document.activeElement?.selectionStart;

  let main;
  const m = route.match(/^#\/a\/(.+)$/);
  if (m) main = viewAuthor(decodeURIComponent(m[1]));
  else if (route === '#/manquants') main = viewMissing();
  else main = viewHome();

  root.innerHTML = `${header()}<main>${main}</main>${footer()}`;
  document.title = ownerName() ? `Liblio de ${ownerName()}` : 'Liblio';
  if (sameRoute) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
  lastRoute = route;
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (sel != null && el.setSelectionRange) el.setSelectionRange(sel, sel);
    }
  }
}

// ------------------------------------------------------------------ toasts & modales

function toast(msg, { type = '', timeout = 3500 } = {}) {
  let box = document.querySelector('.toasts');
  if (!box) {
    box = document.createElement('div');
    box.className = 'toasts';
    box.setAttribute('role', 'status');
    document.body.append(box);
  }
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = msg;
  box.append(t);
  const api = {
    set(m) {
      t.innerHTML = m;
    },
    close(after = 0) {
      setTimeout(() => {
        t.classList.add('out');
        setTimeout(() => t.remove(), 250);
      }, after);
    },
  };
  if (timeout) api.close(timeout);
  return api;
}

function openModal(html, { wide = false } = {}) {
  closeModal();
  const bd = document.createElement('div');
  bd.className = 'modal-backdrop';
  bd.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <button class="modal-x" data-act="close-modal" aria-label="Fermer">×</button>
    <div class="modal-body">${html}</div></div>`;
  bd.addEventListener('mousedown', (e) => {
    if (e.target === bd) closeModal();
  });
  document.body.append(bd);
  document.body.classList.add('no-scroll');
  const first = bd.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 30);
  return bd.querySelector('.modal-body');
}

function closeModal() {
  document.querySelector('.modal-backdrop')?.remove();
  document.body.classList.remove('no-scroll');
}

function askText(title, { label = '', value = '', hint = '', danger = null } = {}) {
  return new Promise((resolve) => {
    const m = openModal(`<h2>${esc(title)}</h2>
      <form class="form" data-form="ask">
        <label>${esc(label)}<input name="v" value="${esc(value)}" autofocus></label>
        ${hint ? `<p class="muted small">${esc(hint)}</p>` : ''}
        <div class="actions">
          ${danger ? `<button type="button" class="btn danger" data-x="danger">${esc(danger)}</button>` : ''}
          <span class="spacer"></span>
          <button type="button" class="btn" data-x="cancel">Annuler</button>
          <button class="btn primary">Valider</button>
        </div>
      </form>`);
    const form = m.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      closeModal();
      resolve(form.v.value.trim());
    });
    m.querySelector('[data-x="cancel"]').onclick = () => {
      closeModal();
      resolve(null);
    };
    const d = m.querySelector('[data-x="danger"]');
    if (d) d.onclick = () => {
      closeModal();
      resolve({ danger: true });
    };
  });
}

function confirmBox(title, text, okLabel = 'Confirmer', danger = true) {
  return new Promise((resolve) => {
    const m = openModal(`<h2>${esc(title)}</h2><p>${text}</p>
      <div class="actions"><span class="spacer"></span>
        <button class="btn" data-x="no">Annuler</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-x="yes" autofocus>${esc(okLabel)}</button></div>`);
    m.querySelector('[data-x="no"]').onclick = () => {
      closeModal();
      resolve(false);
    };
    m.querySelector('[data-x="yes"]').onclick = () => {
      closeModal();
      resolve(true);
    };
  });
}

// ------------------------------------------------------------------ fiche livre

function openBook(id) {
  const b = bookById(id);
  if (!b) return;
  const a = authorById(b.authorId);
  const owned = (a?.editions || []).map((e) => [e, +b.owned?.[e.id] || 0]).filter(([, n]) => n > 0);
  openModal(
    `<div class="book-detail">
      <div class="bd-cover">${coverHtml(b, 'lg')}</div>
      <div class="bd-body">
        <a class="eyebrow" href="#/a/${esc(a?.id)}" data-act="close-modal">${esc(a?.name)}</a>
        <h2>${esc(b.title)}</h2>
        <p class="muted">${[b.year, b.type, b.coAuthors && `avec ${b.coAuthors}`, b.firstPublisher].filter(Boolean).map(esc).join(' · ')}</p>
        <div class="chips">
          ${seriesBadge(b)}
          ${owned.length ? owned.map(([e, n]) => editionBadge(e, n)).join('') : '<span class="badge missing">Pas dans la collection</span>'}
          ${wishBadge(b)}
          ${b.read ? '<span class="badge read">Lu</span>' : '<span class="badge">Pas encore lu</span>'}
          ${stars(b.rating)}
        </div>
        ${
          b.blurb
            ? `<div class="blurb"><h4>Quatrième de couverture</h4><p>${esc(b.blurb)}</p>
                <span class="blurb-src">${esc(BLURB_SOURCES[b.blurbSource] || '')}</span>
                ${S.admin ? `<button class="link-btn small muted" data-act="fetch-blurb" data-id="${esc(b.id)}" data-force="1">Remplacer…</button>` : ''}</div>`
            : `${b.summary ? `<p class="summary">${esc(b.summary)}</p>` : ''}
               ${S.admin ? `<button class="btn small" data-act="fetch-blurb" data-id="${esc(b.id)}">${I.book}<span>Récupérer la 4e de couverture</span></button>` : ''}`
        }
        ${b.notes ? `<div class="notes"><h4>Notes</h4><p>${esc(b.notes)}</p></div>` : ''}
        ${b.isbn ? `<p class="muted small">ISBN ${esc(b.isbn)}</p>` : ''}
        ${
          !S.admin && !owned.length
            ? `<div class="gift-box"><span>${I.gift} M'offrir ce livre</span><div class="gift-links">${giftLinks(b)}</div></div>`
            : ''
        }
        ${
          S.admin
            ? `<div class="actions">
                ${!owned.length ? `<button class="btn wish-btn ${wished(b) ? 'on' : ''}" data-act="wish" data-id="${esc(b.id)}" data-reopen="1" aria-pressed="${wished(b)}">${wished(b) ? I.heartFull : I.heart}<span>${wished(b) ? 'Souhaité' : 'Souhaiter'}</span></button>` : ''}
                <button class="btn primary" data-act="edit-book" data-id="${esc(b.id)}">${I.edit}<span>Modifier</span></button></div>`
            : ''
        }
      </div>
    </div>`,
    { wide: true },
  );
}

function bookForm(b, authorId) {
  const isNew = !b;
  const a = authorById(b?.authorId || authorId);
  const v = b || { title: '', year: '', type: 'Roman', owned: {}, read: false };
  const series = seriesOf(a.id);
  const m = openModal(
    `<h2>${isNew ? `Nouveau livre — ${esc(a.name)}` : 'Modifier le livre'}</h2>
    <form class="form book-form" data-form="book">
      <div class="bf-cover">
        <div class="cover-slot">${isNew ? coverHtml({ title: 'Nouveau livre' }, 'lg') : coverHtml(v, 'lg')}</div>
        ${
          isNew
            ? '<p class="muted small">La couverture pourra être ajoutée après création.</p>'
            : `<button type="button" class="btn small" data-act="pick-cover" data-id="${esc(v.id)}">${I.search}<span>Chercher</span></button>
               <label class="btn small file">${I.upload}<span>Fichier…</span><input type="file" accept="image/*" data-change="cover-file" data-id="${esc(v.id)}" hidden></label>
               ${v.cover ? `<button type="button" class="btn small ghost" data-act="remove-cover" data-id="${esc(v.id)}">${I.trash}<span>Retirer</span></button>` : ''}`
        }
      </div>
      <div class="bf-fields">
        <label class="full">Titre<input name="title" required value="${esc(v.title)}" autofocus></label>
        <label>Année<input name="year" type="number" min="1000" max="2100" value="${esc(v.year ?? '')}"></label>
        <label>Type<select name="type">${BOOK_TYPES.map((t) => `<option ${v.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Cycle<input name="series" list="series-list" value="${esc(v.series ?? '')}" placeholder="Aucun">
          <datalist id="series-list">${series.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></label>
        <label>N° dans le cycle<input name="seriesIndex" type="number" min="0" value="${esc(v.seriesIndex ?? '')}"></label>
        <fieldset class="full owned">
          <legend>Exemplaires possédés</legend>
          ${a.editions.map((e) => `<label class="inline">${editionTag(e)}<input type="number" min="0" max="20" name="own:${esc(e.id)}" value="${+v.owned?.[e.id] || 0}"></label>`).join('')}
          <span class="muted small">Les éditions se gèrent avec le <b>+</b> en tête du tableau.</span>
        </fieldset>
        <label class="check"><input type="checkbox" name="read" ${v.read ? 'checked' : ''}> Lu</label>
        <label>Note<select name="rating"><option value="">—</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${+v.rating === n ? 'selected' : ''}>${'★'.repeat(n)}</option>`).join('')}</select></label>
        <label>ISBN<input name="isbn" value="${esc(v.isbn ?? '')}"></label>
        <label class="full">Résumé court<textarea name="summary" rows="2">${esc(v.summary ?? '')}</textarea></label>
        <label class="full">Quatrième de couverture<textarea name="blurb" rows="5">${esc(v.blurb ?? '')}</textarea></label>
        <label class="full">Notes personnelles<textarea name="notes" rows="2">${esc(v.notes ?? '')}</textarea></label>
      </div>
      <div class="actions full">
        ${isNew ? '' : `<button type="button" class="btn danger ghost" data-act="delete-book" data-id="${esc(v.id)}">${I.trash}<span>Supprimer</span></button>`}
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="close-modal">Annuler</button>
        <button class="btn primary">${isNew ? 'Créer' : 'Enregistrer'}</button>
      </div>
    </form>`,
    { wide: true },
  );

  m.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const owned = {};
    for (const [k, val] of f.entries()) {
      if (k.startsWith('own:') && +val > 0) owned[k.slice(4)] = +val;
    }
    const num = (k) => (f.get(k) === '' || f.get(k) == null ? null : +f.get(k));
    const data = {
      title: String(f.get('title')).trim(),
      year: num('year'),
      type: f.get('type'),
      series: String(f.get('series') || '').trim() || null,
      seriesIndex: num('seriesIndex'),
      owned,
      read: f.get('read') === 'on',
      rating: num('rating'),
      isbn: String(f.get('isbn') || '').trim() || null,
      summary: String(f.get('summary') || '').trim() || null,
      blurb: String(f.get('blurb') || '').trim() || null,
      notes: String(f.get('notes') || '').trim() || null,
    };
    data.blurbSource = !data.blurb ? null : data.blurb === v.blurb ? v.blurbSource || null : 'manual';
    if (Object.keys(owned).length && v.wish) {
      data.wish = undefined;
      data.wishedAt = undefined;
    }
    if (isNew) {
      const nb = addBook(a.id, data);
      closeModal();
      bookForm(nb); // pour ajouter la couverture
    } else {
      Object.assign(b, data);
      change(`modification de « ${b.title} »`);
      closeModal();
      openBook(b.id);
    }
  });
}

function refreshCoverSlot(b) {
  const slot = document.querySelector('.modal .cover-slot');
  if (slot) slot.innerHTML = coverHtml(b, 'lg');
}

async function setCoverFrom(b, source) {
  const t = toast('Téléchargement de la couverture…', { timeout: 0 });
  // Retient l'ISBN de l'édition choisie (trouvé via la BnF, Open Library…) s'il manquait.
  const keepIsbn = () => {
    if (source?.isbn && !b.isbn) b.isbn = source.isbn;
  };
  try {
    if (typeof source === 'object' && source.downloadable === false) {
      dropImage(b.cover);
      b.cover = source.url; // lien externe (pas de CORS chez Google Books)
    } else {
      try {
        const bytes = await downloadImageAsJpeg(source.url ?? source);
        b.cover = storeImage('data/covers', b.id, bytes, b.cover);
      } catch (err) {
        // Image visible mais non téléchargeable (CORS, bloqueur) : on garde un lien vers l'image d'origine.
        if (err.code !== 'CORS' || !source.url) throw err;
        dropImage(b.cover);
        b.cover = source.url;
        keepIsbn();
        change(`couverture de « ${b.title} »`);
        t.set("Couverture ajoutée en lien externe (le site source bloque la copie de l'image).");
        t.close(4000);
        return true;
      }
    }
    keepIsbn();
    change(`couverture de « ${b.title} »`);
    t.set('Couverture ajoutée');
    t.close(1500);
    return true;
  } catch (e) {
    t.set(`Impossible de récupérer l'image : ${esc(e.message)}`);
    t.close(4000);
    return false;
  }
}

async function pickCover(id) {
  const b = bookById(id);
  const a = authorById(b.authorId);
  const m = openModal(
    `<h2>Couverture — ${esc(b.title)}</h2>
    <form class="cover-search" data-form="cover-search">
      <input name="title" value="${esc(b.title)}" aria-label="Titre">
      <input name="isbn" value="${esc(b.isbn ?? '')}" placeholder="ISBN (optionnel)" aria-label="ISBN">
      <button class="btn">${I.search}<span>Chercher</span></button>
    </form>
    <div class="cover-results"><div class="loading"><div class="spinner"></div>Recherche…</div></div>
    <div class="actions">
      <label class="btn file">${I.upload}<span>Importer un fichier</span><input type="file" accept="image/*" hidden></label>
      <button class="btn" data-x="url">${I.link}<span>Depuis une URL</span></button>
      <span class="spacer"></span>
      <button class="btn" data-x="back">Retour</button>
    </div>`,
    { wide: true },
  );
  const results = m.querySelector('.cover-results');
  let cands = [];
  const run = async (title, isbn) => {
    results.innerHTML = '<div class="loading"><div class="spinner"></div>Recherche…</div>';
    cands = await searchCovers({ title, author: a.name, isbn, googleKey: S.secrets?.googleBooksKey, publishers: a.editions.map((e) => e.label) });
    results.innerHTML = cands.length
      ? `<div class="cover-grid">${cands
          .map(
            (c, i) => `<button class="cand" data-i="${i}" title="${esc(c.label)}">
            <img src="${esc(c.thumb)}" alt="" loading="lazy" onerror="this.closest('.cand').remove()">
            <span>${esc(c.source)}${c.downloadable ? '' : ' (lien)'}</span><small>${esc(c.label)}</small></button>`,
          )
          .join('')}</div>`
      : '<p class="muted">Aucune couverture trouvée. Essayez avec un autre titre ou un ISBN (celui de l’édition que vous possédez), importez une image, ou collez l’adresse d’une image trouvée sur le web (« Depuis une URL »).</p>';
  };
  run(b.title, b.isbn);
  m.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    run(e.target.title.value, e.target.isbn.value);
  });
  results.addEventListener('click', async (e) => {
    const c = e.target.closest('.cand');
    if (!c) return;
    results.classList.add('busy');
    if (await setCoverFrom(b, cands[+c.dataset.i])) bookForm(b);
    results.classList.remove('busy');
  });
  m.querySelector('input[type=file]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file && (await setCoverFrom(b, file))) bookForm(b);
  });
  m.querySelector('[data-x="url"]').onclick = async () => {
    const url = await askText('Couverture depuis une URL', { label: "Adresse de l'image" });
    if (url && typeof url === 'string') {
      const ok = await setCoverFrom(b, url);
      if (!ok) {
        // Le site source bloque le téléchargement : on garde un lien externe.
        dropImage(b.cover);
        b.cover = url;
        change(`couverture de « ${b.title} »`);
      }
    }
    bookForm(b);
  };
  m.querySelector('[data-x="back"]').onclick = () => bookForm(b);
}

async function autoCovers(aid) {
  const a = authorById(aid);
  const todo = booksOf(aid).filter((b) => !b.cover);
  if (!todo.length) return toast('Tous les livres ont déjà une couverture.');
  const t = toast(`Couvertures : 0 / ${todo.length}`, { timeout: 0 });
  let found = 0;
  for (const [i, b] of todo.entries()) {
    t.set(`Couvertures : ${i + 1} / ${todo.length} — <i>${esc(b.title)}</i>`);
    try {
      const cands = await searchCovers({ title: b.title, author: a.name, isbn: b.isbn, googleKey: S.secrets?.googleBooksKey, publishers: a.editions.map((e) => e.label) });
      let fallback = null;
      for (const c of cands.filter((x) => x.downloadable)) {
        try {
          const bytes = await downloadImageAsJpeg(c.url);
          b.cover = storeImage('data/covers', b.id, bytes, b.cover);
          if (c.isbn && !b.isbn) b.isbn = c.isbn;
          found++;
          fallback = null;
          break;
        } catch (err) {
          if (err.code === 'CORS' && !fallback) fallback = c.url;
        }
      }
      // Aucune image copiable : on garde un lien vers la première trouvée (Decitre, Place des libraires…).
      fallback ||= cands.find((x) => !x.downloadable)?.url;
      if (fallback && !b.cover) {
        b.cover = fallback;
        const c = cands.find((x) => x.url === fallback);
        if (c?.isbn && !b.isbn) b.isbn = c.isbn;
        found++;
      }
    } catch {}
    if (found) render();
  }
  if (found) change(`couvertures pour ${a.name}`);
  t.set(`${found} couverture(s) trouvée(s) sur ${todo.length}. Vérifiez-les et changez celles qui ne conviennent pas.`);
  t.close(6000);
}

// ------------------------------------------------------------------ quatrièmes de couverture

const BLURB_SOURCES = {
  bnf: "Texte de l'éditeur, via la BnF",
  claude: 'Résumé rédigé par Claude',
  manual: 'Texte saisi à la main',
};

/** BnF d'abord (texte de l'éditeur) ; Claude en secours si une clé est configurée. */
async function findBlurb(b, { useClaude = true, onProgress = () => {} } = {}) {
  const a = authorById(b.authorId);
  onProgress('Recherche dans le catalogue de la BnF…');
  const bnf = await bnfBlurb(b.title, a.name).catch(() => null);
  if (bnf) return { text: bnf.text, source: 'bnf' };
  if (!useClaude || !S.secrets?.anthropicKey) return null;
  const { fetchBlurb } = await import('./claude.js');
  const text = await fetchBlurb({
    apiKey: S.secrets.anthropicKey,
    model: S.secrets.model || DEFAULT_MODEL,
    title: b.title,
    author: a.name,
    year: b.year,
    series: b.series,
    onProgress,
  });
  return { text, source: 'claude' };
}

async function fetchOneBlurb(b, { force = false } = {}) {
  if (force && !(await confirmBox('Remplacer la 4e de couverture ?', 'Le texte actuel sera remplacé par celui de la BnF ou, à défaut, par un résumé rédigé par Claude.', 'Remplacer', false))) {
    return openBook(b.id);
  }
  const t = toast('Recherche de la 4e de couverture…', { timeout: 0 });
  try {
    const res = await findBlurb(b, { onProgress: (m) => t.set(m) });
    if (!res) {
      t.set(
        S.secrets?.anthropicKey
          ? 'Aucun texte trouvé.'
          : 'Pas de texte à la BnF pour ce livre. Ajoutez une clé API Claude dans les réglages pour en faire rédiger un.',
      );
      t.close(6000);
      return;
    }
    b.blurb = res.text;
    b.blurbSource = res.source;
    change(`4e de couverture de « ${b.title} »`);
    t.set(res.source === 'bnf' ? "4e de couverture de l'éditeur ajoutée (BnF)." : '4e de couverture rédigée par Claude.');
    t.close(3000);
    if (document.querySelector('.modal')) openBook(b.id);
  } catch (e) {
    t.set(`4e de couverture : ${esc(e.message)}`);
    t.close(8000);
  }
}

async function autoBlurbs(aid) {
  const a = authorById(aid);
  const todo = booksOf(aid).filter((b) => !b.blurb);
  if (!todo.length) return toast('Tous les livres ont déjà une 4e de couverture.');
  const t = toast(`BnF : 0 / ${todo.length}`, { timeout: 0 });
  let bnf = 0;
  for (const [i, b] of todo.entries()) {
    t.set(`BnF : ${i + 1} / ${todo.length} — <i>${esc(b.title)}</i>`);
    const res = await findBlurb(b, { useClaude: false }).catch(() => null);
    if (res) {
      b.blurb = res.text;
      b.blurbSource = res.source;
      bnf++;
    }
  }
  if (bnf) change(`4es de couverture pour ${a.name} (BnF)`);
  const left = todo.filter((b) => !b.blurb);
  t.set(`${bnf} texte(s) d'éditeur trouvé(s) à la BnF.`);
  t.close(3000);
  if (!left.length) return;
  if (!S.secrets?.anthropicKey) {
    return toast(`${left.length} livre(s) restent sans 4e de couverture : ajoutez une clé API Claude pour les faire rédiger.`, { timeout: 7000 });
  }
  const ok = await confirmBox(
    'Faire rédiger les autres par Claude ?',
    `${left.length} livre(s) n'ont pas de texte à la BnF. Claude peut rédiger un résumé façon 4e de couverture pour chacun, après une courte recherche web (comptez quelques centimes par livre).`,
    'Rédiger',
    false,
  );
  if (!ok) return;
  const t2 = toast(`Claude : 0 / ${left.length}`, { timeout: 0 });
  let done = 0;
  for (const [i, b] of left.entries()) {
    t2.set(`Claude : ${i + 1} / ${left.length} — <i>${esc(b.title)}</i>`);
    try {
      const res = await findBlurb(b);
      if (res) {
        b.blurb = res.text;
        b.blurbSource = res.source;
        done++;
        change(`4es de couverture pour ${a.name} (Claude)`);
      }
    } catch (e) {
      t2.set(`Arrêt : ${esc(e.message)}`);
      t2.close(8000);
      return;
    }
  }
  t2.set(`${done} 4e(s) de couverture rédigée(s) par Claude.`);
  t2.close(4000);
}

// ------------------------------------------------------------------ auteurs

function addAuthorForm() {
  const hasKey = !!S.secrets?.anthropicKey;
  const m = openModal(`<h2>Ajouter un auteur</h2>
    <form class="form" data-form="add-author">
      <label>Nom de l'auteur<input name="name" required autofocus placeholder="ex. Fred Vargas"></label>
      <label class="check"><input type="checkbox" name="wiki" checked> Récupérer la photo et la biographie (Wikipédia)</label>
      <label class="check"><input type="checkbox" name="claude" ${hasKey ? 'checked' : 'disabled'}> Récupérer la bibliographie avec Claude ${hasKey ? '' : '<span class="muted">(ajoutez une clé API dans les réglages)</span>'}</label>
      ${includeFieldset()}
      <div class="actions"><span class="spacer"></span>
        <button type="button" class="btn" data-act="close-modal">Annuler</button>
        <button class="btn primary">${I.plus}<span>Ajouter</span></button></div>
    </form>`);
  m.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = String(f.get('name')).trim();
    const existing = S.lib.authors.find((x) => norm(x.name) === norm(name));
    if (existing) {
      closeModal();
      location.hash = `#/a/${existing.id}`;
      return toast('Cet auteur est déjà dans la collection.');
    }
    const a = addAuthor({ name });
    closeModal();
    location.hash = `#/a/${a.id}`;
    if (f.get('wiki')) await fillFromWikipedia(a);
    if (f.get('claude')) runBibliography(a, f.getAll('include'));
  });
}

function includeFieldset(selected = []) {
  const opts = ['nouvelles', 'BD', 'ouvrages jeunesse', 'essais', 'collectifs', 'théâtre'];
  return `<fieldset class="include"><legend>Inclure en plus des romans</legend>
    ${opts.map((o) => `<label class="check"><input type="checkbox" name="include" value="${o}" ${selected.includes(o) ? 'checked' : ''}> ${o}</label>`).join('')}
  </fieldset>`;
}

async function fillFromWikipedia(a) {
  const t = toast('Recherche sur Wikipédia…', { timeout: 0 });
  const w = await wikipediaAuthor(a.name);
  if (!w) {
    t.set('Pas de page Wikipédia trouvée.');
    return t.close(2500);
  }
  if (w.extract) a.bio = w.extract;
  if (w.url) a.wikipedia = w.url;
  if (w.photo) {
    try {
      a.photo = storeImage('data/authors', a.id, await downloadImageAsJpeg(w.photo, 500), a.photo);
    } catch {}
  }
  change(`fiche de l'auteur ${a.name}`);
  t.set('Fiche Wikipédia récupérée');
  t.close(1500);
}

function editAuthorForm(id) {
  const a = authorById(id);
  const m = openModal(`<h2>Modifier l'auteur</h2>
    <form class="form" data-form="author">
      <div class="author-edit">
        <div class="ae-photo">${avatarHtml(a, 'lg')}
          <button type="button" class="btn small" data-x="wiki">${I.search}<span>Wikipédia</span></button>
          <label class="btn small file">${I.upload}<span>Photo…</span><input type="file" accept="image/*" hidden></label>
        </div>
        <div class="bf-fields">
          <label class="full">Nom<input name="name" required value="${esc(a.name)}"></label>
          <label>Année de naissance<input name="birthYear" type="number" value="${esc(a.birthYear ?? '')}"></label>
          <label>Nationalité<input name="nationality" value="${esc(a.nationality ?? '')}"></label>
          <label class="full">Biographie<textarea name="bio" rows="4">${esc(a.bio ?? '')}</textarea></label>
          <label class="full">Page Wikipédia<input name="wikipedia" type="url" value="${esc(a.wikipedia ?? '')}"></label>
          <div class="full"><span class="lbl">Éditions suivies</span>
            <div class="ed-list">${a.editions.map((e) => `<span class="badge ed" style="--c:${editionKind(e.kind).color}">${esc(e.label)} <small>${esc(editionKind(e.kind).label.toLowerCase())}</small></span>`).join('')}</div>
            <p class="muted small">Pour ajouter, renommer ou retirer une édition, utilisez les en-têtes du tableau.</p></div>
        </div>
      </div>
      <div class="actions">
        <button type="button" class="btn danger ghost" data-x="delete">${I.trash}<span>Supprimer l'auteur</span></button>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="close-modal">Annuler</button>
        <button class="btn primary">Enregistrer</button>
      </div>
    </form>`, { wide: true });
  const form = m.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(form);
    a.name = String(f.get('name')).trim();
    a.birthYear = f.get('birthYear') ? +f.get('birthYear') : null;
    a.nationality = String(f.get('nationality') || '').trim() || null;
    a.bio = String(f.get('bio') || '').trim() || null;
    a.wikipedia = String(f.get('wikipedia') || '').trim() || null;
    change(`fiche de l'auteur ${a.name}`);
    closeModal();
  });
  m.querySelector('[data-x="wiki"]').onclick = async () => {
    await fillFromWikipedia(a);
    editAuthorForm(a.id);
  };
  m.querySelector('input[type=file]').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    a.photo = storeImage('data/authors', a.id, await downloadImageAsJpeg(file, 500), a.photo);
    change(`photo de ${a.name}`);
    editAuthorForm(a.id);
  });
  m.querySelector('[data-x="delete"]').onclick = async () => {
    const n = booksOf(a.id).length;
    if (await confirmBox("Supprimer l'auteur ?", `<b>${esc(a.name)}</b> et ses ${n} livre(s) seront retirés de la collection.`, 'Supprimer')) {
      deleteAuthor(a);
      location.hash = '#/';
    } else editAuthorForm(a.id);
  };
}

// ------------------------------------------------------------------ éditions (grand format, poche…)

function moveEdition(a, id, to) {
  const from = a.editions.findIndex((e) => e.id === id);
  if (from < 0 || to < 0 || to >= a.editions.length || from === to) return;
  const [e] = a.editions.splice(from, 1);
  a.editions.splice(to, 0, e);
  change(`ordre des éditions de ${a.name}`);
}

function editionDialog(a, ed = null) {
  const used = ed ? booksOf(a.id).filter((b) => +b.owned?.[ed.id] > 0).length : 0;
  const pos = ed ? a.editions.indexOf(ed) : -1;
  const m = openModal(`<h2>${ed ? "Modifier l'édition" : 'Ajouter une édition'} — ${esc(a.name)}</h2>
    <form class="form">
      <div class="kinds" role="radiogroup" aria-label="Type d'édition">
        ${EDITION_KINDS.map((k, i) => `<label class="kind" style="--c:${k.color}">
          <input type="radio" name="kind" value="${k.id}" ${(ed ? ed.kind === k.id : i === (a.editions.some((e) => e.kind === 'collector') ? 3 : 2)) ? 'checked' : ''}>
          <span>${esc(k.label)}</span></label>`).join('')}
      </div>
      <label>Nom affiché pour cet auteur
        <input name="label" value="${esc(ed?.label ?? '')}" placeholder="ex. Fleuve Noir, Pocket, Collector Bragelonne…" autofocus></label>
      <p class="muted small">Le type sert aux couleurs et aux regroupements ; le nom est libre (laisser vide pour utiliser le nom du type).</p>
      ${
        ed && a.editions.length > 1
          ? `<div class="move-row"><span class="lbl">Position de la colonne</span>
              <button type="button" class="btn small" data-x="left" ${pos === 0 ? 'disabled' : ''}>◀ Gauche</button>
              <span class="muted small">${pos + 1} / ${a.editions.length}</span>
              <button type="button" class="btn small" data-x="right" ${pos === a.editions.length - 1 ? 'disabled' : ''}>Droite ▶</button></div>`
          : ''
      }
      <div class="actions">
        ${ed ? `<button type="button" class="btn danger ghost" data-x="remove">${I.trash}<span>Retirer</span></button>` : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="close-modal">Annuler</button>
        <button class="btn primary">${ed ? 'Enregistrer' : 'Ajouter'}</button>
      </div>
    </form>`);
  const form = m.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const kind = form.kind.value;
    const label = form.label.value.trim() || editionKind(kind).label;
    if (ed) {
      Object.assign(ed, { kind, label });
      change(`édition ${label} pour ${a.name}`);
    } else {
      a.editions.push({ id: newEditionId(a, kind), kind, label });
      change(`ajout de l'édition ${label} pour ${a.name}`);
    }
    closeModal();
  });
  for (const [x, d] of [['left', -1], ['right', 1]]) {
    m.querySelector(`[data-x="${x}"]`)?.addEventListener('click', () => {
      moveEdition(a, ed.id, pos + d);
      editionDialog(a, ed);
    });
  }
  m.querySelector('[data-x="remove"]')?.addEventListener('click', async () => {
    if (used && !(await confirmBox("Retirer l'édition ?", `${used} livre(s) sont marqués comme possédés en <b>${esc(ed.label)}</b>. Ces exemplaires seront oubliés.`, 'Retirer'))) return editionDialog(a, ed);
    a.editions = a.editions.filter((x) => x !== ed);
    for (const b of booksOf(a.id)) delete b.owned[ed.id];
    change(`édition ${ed.label} retirée pour ${a.name}`);
    closeModal();
  });
}

// ------------------------------------------------------------------ bibliographie (Claude)

function bibliographyDialog(aid) {
  const a = authorById(aid);
  if (!S.secrets?.anthropicKey) {
    toast("Ajoutez d'abord une clé API Claude dans les réglages.", { type: 'warn' });
    return openSettings();
  }
  const m = openModal(`<h2>${I.spark} Bibliographie de ${esc(a.name)}</h2>
    <p class="muted">Claude cherche sur le web la liste des œuvres, triée par date, avec les cycles. Vous pourrez relire la liste avant de l'importer : rien n'est supprimé, seuls des livres sont ajoutés ou complétés.</p>
    <form class="form">${includeFieldset()}
      <div class="actions"><span class="spacer"></span>
        <button type="button" class="btn" data-act="close-modal">Annuler</button>
        <button class="btn primary">${I.spark}<span>Lancer la recherche</span></button></div>
    </form>`);
  m.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    runBibliography(a, new FormData(e.target).getAll('include'));
  });
}

async function runBibliography(a, include = []) {
  const m = openModal(`<h2>${I.spark} Bibliographie de ${esc(a.name)}</h2>
    <div class="loading big"><div class="spinner"></div><p id="bib-progress">Connexion à Claude…</p>
    <p class="muted small">Cela prend en général une à deux minutes.</p></div>`, { wide: true });
  try {
    const { fetchBibliography } = await import('./claude.js');
    const known = booksOf(a.id).map((b) => b.title);
    const data = await fetchBibliography({
      apiKey: S.secrets.anthropicKey,
      model: S.secrets.model || DEFAULT_MODEL,
      author: a.name,
      include,
      known,
      knownSeries: seriesOf(a.id),
      onProgress: (t) => {
        const p = m.querySelector('#bib-progress');
        if (p) p.textContent = t;
      },
    });
    reviewBibliography(a, data);
  } catch (e) {
    console.error(e);
    if (!document.body.contains(m)) return toast(`Bibliographie : ${esc(e.message)}`, { type: 'error', timeout: 8000 });
    m.innerHTML = `<h2>Échec de la récupération</h2><p class="error">${esc(e.message)}</p>
      <div class="actions"><span class="spacer"></span><button class="btn" data-act="close-modal">Fermer</button></div>`;
  }
}

function reviewBibliography(a, data) {
  const existing = booksOf(a.id);
  const byTitle = new Map(existing.map((b) => [norm(b.title), b]));
  const matched = new Set();
  const rows = data.livres
    .map((l) => ({
      titre: l.titre,
      annee: l.annee,
      type: l.type,
      cycle: l.cycle || null,
      numero: l.numero_cycle ?? null,
      coauteurs: l.coauteurs,
      editeur: l.editeur,
      isbn: l.isbn || null,
      resume: l.resume,
    }))
    .sort((x, y) => (x.annee ?? 9999) - (y.annee ?? 9999))
    .map((r) => {
      const m = byTitle.get(norm(r.titre));
      if (m) matched.add(m);
      const diffs = [];
      if (m) {
        if (r.annee && m.year !== r.annee) diffs.push(['year', 'année', m.year, r.annee]);
        if (r.cycle && m.series !== r.cycle) diffs.push(['series', 'cycle', m.series, r.cycle]);
        if (r.numero != null && m.seriesIndex !== r.numero) diffs.push(['seriesIndex', 'n°', m.seriesIndex, r.numero]);
        if (r.type && m.type !== r.type) diffs.push(['type', 'type', m.type, r.type]);
      }
      return { ...r, match: m, diffs, status: !m ? 'new' : diffs.length ? 'update' : 'same' };
    });
  const absent = existing.filter((b) => !matched.has(b));
  const nNew = rows.filter((r) => r.status === 'new').length;
  const nUpd = rows.filter((r) => r.status === 'update').length;

  const m = openModal(`<h2>${I.spark} Bibliographie de ${esc(a.name)}</h2>
    <p class="muted">${rows.length} œuvres trouvées · <b>${nNew}</b> nouvelles · <b>${nUpd}</b> à compléter · ${rows.length - nNew - nUpd} déjà à jour</p>
    <form class="form">
    <div class="table-wrap review"><table class="books">
      <thead><tr><th class="c"><input type="checkbox" data-x="all" checked aria-label="Tout sélectionner"></th><th>Titre</th><th class="c">Année</th><th>Cycle</th><th>Type</th><th>État</th></tr></thead>
      <tbody>${rows
        .map(
          (r, i) => `<tr class="st-${r.status}">
          <td class="c">${r.status === 'same' ? '' : `<input type="checkbox" name="pick" value="${i}" checked>`}</td>
          <td class="title"><b>${esc(r.titre)}</b>${r.resume ? `<div class="muted small">${esc(r.resume)}</div>` : ''}</td>
          <td class="c">${r.annee ?? ''}</td>
          <td>${r.cycle ? `<span class="badge series" style="--c:${seriesColor(r.cycle)}">${esc(r.cycle)}${r.numero ? ` <b>${r.numero}</b>` : ''}</span>` : ''}</td>
          <td class="small">${esc(r.type)}</td>
          <td class="small">${
            r.status === 'new'
              ? '<span class="badge new">Nouveau</span>'
              : r.status === 'update'
                ? `<span class="badge upd">À compléter</span><div class="muted">${r.diffs.map(([, l, o, n]) => `${l} : ${esc(o ?? '—')} → <b>${esc(n)}</b>`).join('<br>')}</div>`
                : '<span class="badge">Déjà présent</span>'
          }</td></tr>`,
        )
        .join('')}</tbody>
    </table></div>
    ${absent.length ? `<p class="muted small">Dans votre liste mais pas dans celle de Claude (conservés) : ${absent.map((b) => `« ${esc(b.title)} »`).join(', ')}</p>` : ''}
    <label class="check"><input type="checkbox" name="covers" checked> Chercher ensuite les couvertures manquantes</label>
    ${!a.bio && data.auteur?.bio ? '<label class="check"><input type="checkbox" name="bio" checked> Utiliser la biographie proposée par Claude</label>' : ''}
    <div class="actions"><span class="spacer"></span>
      <button type="button" class="btn" data-act="close-modal">Annuler</button>
      <button class="btn primary">${I.check}<span>Importer la sélection</span></button></div>
    </form>`, { wide: true });

  m.querySelector('[data-x="all"]').addEventListener('change', (e) => {
    m.querySelectorAll('input[name="pick"]').forEach((c) => (c.checked = e.target.checked));
  });
  m.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    let added = 0;
    let updated = 0;
    for (const i of f.getAll('pick')) {
      const r = rows[+i];
      if (r.status === 'new') {
        addBook(a.id, {
          title: r.titre,
          year: r.annee,
          type: r.type || 'Roman',
          series: r.cycle,
          seriesIndex: r.numero,
          summary: r.resume || null,
          coAuthors: r.coauteurs || null,
          firstPublisher: r.editeur || null,
          isbn: r.isbn,
        }, { silent: true });
        added++;
      } else if (r.match) {
        for (const [k, , , n] of r.diffs) r.match[k] = n;
        if (!r.match.summary && r.resume) r.match.summary = r.resume;
        if (!r.match.firstPublisher && r.editeur) r.match.firstPublisher = r.editeur;
        if (!r.match.isbn && r.isbn) r.match.isbn = r.isbn;
        updated++;
      }
    }
    // Compléter les résumés des livres déjà à jour
    for (const r of rows) {
      if (r.status === 'same' && r.match && !r.match.summary && r.resume) r.match.summary = r.resume;
      if (r.status === 'same' && r.match && !r.match.isbn && r.isbn) r.match.isbn = r.isbn;
    }
    const au = data.auteur || {};
    if (f.get('bio') && au.bio) a.bio = au.bio;
    if (!a.birthYear && au.naissance) a.birthYear = au.naissance;
    if (!a.nationality && au.nationalite) a.nationality = au.nationalite;
    change(`bibliographie de ${a.name} : ${added} ajout(s), ${updated} mise(s) à jour`);
    closeModal();
    toast(`${added} livre(s) ajouté(s), ${updated} complété(s).`);
    if (f.get('covers')) autoCovers(a.id);
  });
}

// ------------------------------------------------------------------ import / export JSON

function exportLibrary() {
  const blob = new Blob([`${JSON.stringify(S.lib, null, 1)}\n`], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `liblio-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importFile(file) {
  let inc;
  try {
    inc = normalizeImport(JSON.parse(await file.text()));
  } catch (e) {
    return toast(`Import impossible : ${esc(e.message)}`, { type: 'error', timeout: 8000 });
  }
  const m = openModal(`<h2>${I.upload} Importer « ${esc(file.name)} »</h2>
    <form class="form">
      <div class="kinds two" role="radiogroup" aria-label="Mode d'import">
        <label class="kind" style="--c:var(--teal)"><input type="radio" name="mode" value="merge" checked><span>Fusionner<small>Ajoute et complète, ne supprime rien</small></span></label>
        <label class="kind" style="--c:var(--red)"><input type="radio" name="mode" value="replace"><span>Remplacer<small>Remplace toute la collection</small></span></label>
      </div>
      <div class="import-summary"></div>
      <label class="check"><input type="checkbox" name="wiki" checked> Photo et biographie Wikipédia pour les nouveaux auteurs</label>
      <label class="check"><input type="checkbox" name="covers" checked> Chercher les couvertures manquantes des auteurs importés</label>
      <div class="actions"><span class="spacer"></span>
        <button type="button" class="btn" data-act="close-modal">Annuler</button>
        <button class="btn primary">${I.check}<span>Importer</span></button></div>
    </form>`, { wide: true });
  const form = m.querySelector('form');
  const summary = m.querySelector('.import-summary');
  const refresh = () => {
    const replace = form.mode.value === 'replace';
    const p = previewImport(inc, { replace });
    summary.innerHTML = `<ul class="summary-list">
      <li><b>${p.authors}</b> auteur(s) dans le fichier, dont <b>${p.newAuthors}</b> nouveau(x)</li>
      <li><b>${p.books}</b> livre(s) : <b>${p.newBooks}</b> à ajouter${replace ? '' : `, <b>${p.existingBooks}</b> déjà présent(s) qui seront complétés (exemplaires, « lu », infos manquantes)`}</li>
      ${replace ? `<li class="error">Les ${S.lib.books.length} livres et ${S.lib.authors.length} auteurs actuels seront remplacés.</li>` : ''}
    </ul>`;
  };
  refresh();
  form.addEventListener('change', (e) => {
    if (e.target.name === 'mode') refresh();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const replace = form.mode.value === 'replace';
    if (replace && S.lib.books.length && !(await confirmBox('Remplacer la collection ?', 'Toute la collection actuelle sera remplacée par le contenu du fichier (rien n’est publié tant que vous ne cliquez pas sur « Publier »).', 'Remplacer'))) return;
    const wiki = form.wiki.checked;
    const covers = form.covers.checked;
    const res = applyImport(inc, { replace });
    closeModal();
    toast(`Import terminé : ${res.newBooks} livre(s) ajouté(s), ${res.updatedBooks} complété(s).`);
    for (const a of res.authors) {
      if (wiki && !a.photo && !a.bio) await fillFromWikipedia(a);
      if (covers) await autoCovers(a.id);
    }
  });
}

// ------------------------------------------------------------------ connexion & réglages

async function openLogin() {
  const m = openModal(`<div class="loading"><div class="spinner"></div>Chargement…</div>`);
  let vault = null;
  try {
    vault = await readVault();
  } catch {}
  if (!vault) return openSetup();
  m.innerHTML = `<h2>${I.lock} Connexion</h2>
    <form class="form">
      <label>Mot de passe<input type="password" name="pw" required autofocus autocomplete="current-password"></label>
      <p class="error" hidden></p>
      <div class="actions"><span class="spacer"></span>
        <button type="button" class="btn" data-act="close-modal">Annuler</button>
        <button class="btn primary">Se connecter</button></div>
    </form>`;
  m.querySelector('input').focus();
  m.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('.btn.primary');
    const err = e.target.querySelector('.error');
    btn.disabled = true;
    btn.textContent = 'Déchiffrement…';
    try {
      await login(e.target.pw.value);
      closeModal();
      toast('Connecté. Les modifications sont publiées quand vous cliquez sur « Publier ».');
      const s = S.secrets;
      if (!S.local && !s.githubToken) openSettings();
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = 'Se connecter';
    }
  });
}

function secretsFields(s = {}, { first = false } = {}) {
  const { owner, repo } = repoInfo(s);
  const needRepo = !S.local && !(S.cfg.owner && S.cfg.repo);
  return `
    ${
      S.local
        ? '<p class="note">Mode local : le jeton GitHub est facultatif ici (les fichiers sont écrits sur le disque), mais sera nécessaire sur le site en ligne.</p>'
        : `<p class="note">Créez un <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">jeton GitHub « fine-grained »</a> limité à ce seul dépôt, avec la permission <b>Contents : Read and write</b>.</p>`
    }
    ${
      needRepo
        ? `<div class="row2"><label>Propriétaire du dépôt<input name="owner" value="${esc(owner)}" required></label>
           <label>Nom du dépôt<input name="repo" value="${esc(repo)}" required></label></div>`
        : `<p class="muted small">Dépôt : <b>${esc(owner || '(local)')}/${esc(repo || '')}</b> · branche ${esc(S.cfg.branch)}</p>`
    }
    <label>Jeton GitHub<input type="password" name="githubToken" ${first || !s.githubToken ? '' : 'placeholder="•••••• (inchangé)"'} ${!S.local && first ? 'required' : ''} autocomplete="off"></label>
    <label>Clé API Claude <span class="muted">(facultatif — pour la bibliographie automatique)</span>
      <input type="password" name="anthropicKey" ${s.anthropicKey ? 'placeholder="•••••• (inchangée)"' : 'placeholder="sk-ant-…"'} autocomplete="off"></label>
    <div class="row2">
      <label>Modèle Claude<input name="model" value="${esc(s.model || DEFAULT_MODEL)}"></label>
      <label>Clé Google Books <span class="muted">(facultatif)</span><input type="password" name="googleBooksKey" ${s.googleBooksKey ? 'placeholder="•••••• (inchangée)"' : ''} autocomplete="off"></label>
    </div>`;
}

function openSetup() {
  const m = openModal(`<h2>${I.lock} Première configuration</h2>
    <p>Les secrets ci-dessous sont chiffrés avec votre mot de passe puis enregistrés dans le dépôt (<code>data/vault.json</code>). Sans le mot de passe, ils sont illisibles.</p>
    <form class="form">
      ${secretsFields({}, { first: true })}
      <div class="row2">
        <label>Mot de passe<input type="password" name="pw" required minlength="12" autocomplete="new-password"></label>
        <label>Confirmation<input type="password" name="pw2" required autocomplete="new-password"></label>
      </div>
      <p class="muted small">Le coffre étant public, choisissez une phrase de passe longue (12 caractères minimum, idéalement plusieurs mots).</p>
      <p class="error" hidden></p>
      <div class="actions"><span class="spacer"></span>
        <button type="button" class="btn" data-act="close-modal">Annuler</button>
        <button class="btn primary">Enregistrer et se connecter</button></div>
    </form>`, { wide: true });
  m.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = f.querySelector('.error');
    if (f.pw.value !== f.pw2.value) {
      err.hidden = false;
      err.textContent = 'Les mots de passe ne correspondent pas.';
      return;
    }
    const secrets = {
      githubToken: f.githubToken.value.trim() || null,
      anthropicKey: f.anthropicKey.value.trim() || null,
      model: f.model.value.trim() || DEFAULT_MODEL,
      googleBooksKey: f.googleBooksKey.value.trim() || null,
      owner: f.owner?.value.trim() || undefined,
      repo: f.repo?.value.trim() || undefined,
    };
    const btn = f.querySelector('.btn.primary');
    btn.disabled = true;
    btn.textContent = 'Enregistrement…';
    try {
      await saveVault(secrets, f.pw.value);
      closeModal();
      toast('Coffre créé, vous êtes connecté.');
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = 'Enregistrer et se connecter';
    }
  });
}

function openSettings() {
  const s = S.secrets || {};
  const m = openModal(`<h2>${I.cog} Réglages</h2>
    <form class="form owner-form">
      <h3>Personnalisation</h3>
      <div class="inline-row">
        <label>Nom affiché <span class="muted">(« Liblio de … »)</span><input name="ownerName" value="${esc(ownerName())}" placeholder="ex. Christophe" maxlength="40"></label>
        <button class="btn">Appliquer</button>
      </div>
      <p class="muted small">Publié avec les autres modifications de la collection.</p>
    </form>
    <hr class="sep">
    <form class="form secrets-form">
      <h3>Accès et clés</h3>
      ${secretsFields(s)}
      <label>Mot de passe <span class="muted">(actuel ou nouveau — nécessaire pour rechiffrer le coffre)</span>
        <input type="password" name="pw" required minlength="12" autocomplete="new-password"></label>
      <p class="error" hidden></p>
      <div class="actions">
        <label class="btn ghost" title="Importer une bibliothèque au format JSON">${I.upload}<span>Importer (JSON)</span><input type="file" accept=".json,application/json" data-change="import-file" hidden></label>
        <button type="button" class="btn ghost" data-x="export">${I.download}<span>Exporter (JSON)</span></button>
        <span class="spacer"></span>
        <button type="button" class="btn" data-act="close-modal">Fermer</button>
        <button class="btn primary">Enregistrer</button></div>
    </form>`, { wide: true });
  m.querySelector('[data-x="export"]').onclick = exportLibrary;
  m.querySelector('.owner-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = e.target.ownerName.value.trim();
    S.lib.settings = { ...(S.lib.settings || {}), ownerName: name || undefined };
    change(name ? `nom affiché : ${name}` : 'nom affiché retiré');
    toast(name ? `Le site s'appellera « Liblio de ${esc(name)} » une fois publié.` : 'Nom retiré.');
  });
  m.querySelector('.secrets-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const err = f.querySelector('.error');
    const next = {
      ...s,
      githubToken: f.githubToken.value.trim() || s.githubToken || null,
      anthropicKey: f.anthropicKey.value.trim() || s.anthropicKey || null,
      model: f.model.value.trim() || DEFAULT_MODEL,
      googleBooksKey: f.googleBooksKey.value.trim() || s.googleBooksKey || null,
    };
    if (f.owner) next.owner = f.owner.value.trim();
    if (f.repo) next.repo = f.repo.value.trim();
    const btn = f.querySelector('.btn.primary');
    btn.disabled = true;
    try {
      await saveVault(next, f.pw.value);
      closeModal();
      toast('Réglages enregistrés.');
    } catch (ex) {
      err.hidden = false;
      err.textContent = ex.message;
      btn.disabled = false;
    }
  });
}

async function doPublish(force = false) {
  const t = toast('Publication en cours…', { timeout: 0 });
  try {
    await publish({ force });
    t.set(S.local ? 'Enregistré sur le disque.' : 'Publié ! Le site public sera à jour d’ici une minute environ.');
    t.close(4000);
  } catch (e) {
    t.close();
    if (e.code === 'CONFLICT') {
      if (await confirmBox('Conflit', `${esc(e.message)}<br>Écraser la version en ligne avec la vôtre ?`, 'Écraser')) doPublish(true);
    } else {
      toast(`Échec de la publication : ${esc(e.message)}`, { type: 'error', timeout: 8000 });
    }
  }
}

// ------------------------------------------------------------------ événements

const actions = {
  'close-modal': () => closeModal(),
  login: () => openLogin(),
  logout: async () => {
    if (isDirty() && !(await confirmBox('Se déconnecter ?', 'Des modifications ne sont pas publiées et seront perdues.', 'Se déconnecter'))) return;
    window.onbeforeunload = null;
    logout();
  },
  settings: () => openSettings(),
  publish: () => doPublish(),
  filter: (el) => {
    UI.filter = el.dataset.v;
    render();
  },
  view: (el) => {
    UI.view = el.dataset.v;
    safeSet('liblio-view', UI.view);
    render();
  },
  'open-book': (el) => openBook(el.dataset.id),
  'edit-book': (el) => bookForm(bookById(el.dataset.id)),
  'new-book': (el) => bookForm(null, el.dataset.id),
  'delete-book': async (el) => {
    const b = bookById(el.dataset.id);
    if (await confirmBox('Supprimer ce livre ?', `« ${esc(b.title)} » sera retiré de la collection.`, 'Supprimer')) deleteBook(b);
    else bookForm(b);
  },
  'pick-cover': (el) => pickCover(el.dataset.id),
  'remove-cover': (el) => {
    const b = bookById(el.dataset.id);
    dropImage(b.cover);
    b.cover = null;
    change(`couverture retirée de « ${b.title} »`);
    bookForm(b);
  },
  own: (el) => {
    const b = bookById(el.dataset.id);
    const k = el.dataset.ed;
    const n = ((+b.owned[k] || 0) + 1) % 3;
    if (n) b.owned[k] = n;
    else delete b.owned[k];
    clearWishIfOwned(b);
    change(`exemplaires de « ${b.title} »`);
  },
  read: (el) => {
    const b = bookById(el.dataset.id);
    b.read = !b.read;
    change(`« ${b.title} » ${b.read ? 'lu' : 'non lu'}`);
  },
  bought: (el) => {
    const b = bookById(el.dataset.id);
    b.owned[el.dataset.ed] = (+b.owned[el.dataset.ed] || 0) + 1;
    clearWishIfOwned(b);
    change(`achat de « ${b.title} »`);
    toast(`« ${esc(b.title)} » ajouté à la collection.`);
  },
  wish: (el) => {
    const b = bookById(el.dataset.id);
    setWish(b, !wished(b));
    if (el.dataset.reopen) openBook(b.id);
  },
  'wish-top': (el) => {
    const b = bookById(el.dataset.id);
    b.wishedAt = new Date().toISOString();
    change(`priorité des envies : « ${b.title} »`);
  },
  'add-edition': (el) => editionDialog(authorById(el.dataset.id)),
  'edit-edition': (el) => {
    const a = authorById(el.dataset.id);
    editionDialog(a, a.editions.find((e) => e.id === el.dataset.ed));
  },
  'add-author': () => addAuthorForm(),
  export: () => exportLibrary(),
  'edit-author': (el) => editAuthorForm(el.dataset.id),
  bibliography: (el) => bibliographyDialog(el.dataset.id),
  'auto-covers': (el) => autoCovers(el.dataset.id),
  'auto-blurbs': (el) => autoBlurbs(el.dataset.id),
  'fetch-blurb': (el) => fetchOneBlurb(bookById(el.dataset.id), { force: !!el.dataset.force }),
};

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || !actions[el.dataset.act]) return;
  if (el.tagName !== 'A') e.preventDefault();
  if (el.tagName === 'A' && el.dataset.act === 'close-modal') {
    closeModal();
    return;
  }
  actions[el.dataset.act](el, e);
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.change === 'series') {
    UI.series = el.value;
    render();
  } else if (el.dataset.change === 'import-file') {
    const file = el.files[0];
    el.value = '';
    if (file) {
      closeModal();
      importFile(file);
    }
  } else if (el.dataset.change === 'cover-file') {
    const b = bookById(el.dataset.id);
    const file = el.files[0];
    if (file && (await setCoverFrom(b, file))) refreshCoverSlot(b);
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') {
    UI.q = e.target.value;
    const r = document.getElementById('results');
    if (r) r.innerHTML = searchResults();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.querySelector('.modal-backdrop')) closeModal();
  if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) {
    const q = document.getElementById('q');
    if (q) {
      e.preventDefault();
      q.focus();
    }
  }
});

// Image pas encore servie par GitHub Pages (juste publiée) : on tente la version brute du dépôt.
document.addEventListener(
  'error',
  (e) => {
    const img = e.target;
    if (img.tagName !== 'IMG' || !img.dataset.path || img.dataset.fallback) return;
    img.dataset.fallback = '1';
    const raw = rawUrl(img.dataset.path);
    if (raw && raw !== img.getAttribute('src')) img.src = raw;
  },
  true,
);

// Glisser-déposer des colonnes d'éditions
let dragEd = null;
document.addEventListener('dragstart', (e) => {
  const el = e.target.closest?.('[data-drag-ed]');
  if (!el) return;
  dragEd = { id: el.dataset.dragEd, author: el.dataset.id };
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragEd.id);
  el.classList.add('dragging');
});
document.addEventListener('dragover', (e) => {
  const el = e.target.closest?.('[data-drag-ed]');
  if (!dragEd || !el || el.dataset.id !== dragEd.author) return;
  e.preventDefault();
  document.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target'));
  if (el.dataset.dragEd !== dragEd.id) el.classList.add('drop-target');
});
document.addEventListener('drop', (e) => {
  const el = e.target.closest?.('[data-drag-ed]');
  if (!dragEd || !el) return;
  e.preventDefault();
  const a = authorById(dragEd.author);
  moveEdition(a, dragEd.id, a.editions.findIndex((x) => x.id === el.dataset.dragEd));
});
document.addEventListener('dragend', () => {
  dragEd = null;
  document.querySelectorAll('.dragging, .drop-target').forEach((x) => x.classList.remove('dragging', 'drop-target'));
});

window.addEventListener('hashchange', () => {
  closeModal();
  UI.filter = 'all';
  UI.series = '*';
  render();
});

window.addEventListener('beforeunload', (e) => {
  if (S.admin && isDirty()) {
    e.preventDefault();
    e.returnValue = '';
  }
});

S.listeners.add(render);

(async () => {
  root.innerHTML = '<div class="boot"><picture><source srcset="assets/logo-dark.svg" media="(prefers-color-scheme: dark)"><img src="assets/logo.svg" alt="Liblio" width="220"></picture><div class="spinner"></div></div>';
  try {
    await init();
  } catch (e) {
    console.error(e);
  }
  render();
})();
