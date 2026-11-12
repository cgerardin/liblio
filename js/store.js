// État de l'application, chargement, connexion admin et publication.

import { GitHubBackend, LocalBackend, isLocalDevServer } from './backends.js';
import { openVault, sealVault } from './vault.js';
import { slugify, uniqueId, shortRand, EDITION_KINDS, guessEditionKind } from './util.js';

const SESSION_KEY = 'liblio-session';

export const S = {
  cfg: {},
  lib: { version: 1, authors: [], books: [] },
  libSha: null,
  local: false, // servi par scripts/dev-server.mjs
  admin: false,
  secrets: null,
  backend: null,
  pending: new Map(), // chemin -> Uint8Array (images à publier)
  deletions: new Set(), // chemins à supprimer au prochain commit
  committed: new Set(), // images déjà présentes dans le dépôt
  blobUrls: new Map(), // aperçu local des images non publiées
  changes: [], // journal des modifications (message de commit)
  listeners: new Set(),
};

export const emit = () => S.listeners.forEach((f) => f());

export function change(desc) {
  if (desc && !S.changes.includes(desc)) S.changes.push(desc);
  S.lib.updatedAt = new Date().toISOString();
  emit();
}

export const isDirty = () => S.changes.length > 0 || S.pending.size > 0 || S.deletions.size > 0;

// ---------------------------------------------------------------- chargement

async function loadConfig() {
  let cfg = {};
  try {
    const r = await fetch(`config.json?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) cfg = await r.json();
  } catch {}
  const host = location.hostname;
  if ((!cfg.owner || !cfg.repo) && host.endsWith('.github.io')) {
    const seg = location.pathname.split('/').filter((s) => s && !s.endsWith('.html'))[0];
    cfg.owner ||= host.split('.')[0];
    cfg.repo ||= seg || host;
  }
  cfg.branch ||= 'main';
  return cfg;
}

function parseLib(text) {
  const lib = JSON.parse(text);
  lib.authors ||= [];
  lib.books ||= [];
  for (const b of lib.books) b.owned ||= {};
  for (const a of lib.authors) migrateEditions(a, lib.books.filter((b) => b.authorId === a.id));
  return lib;
}

export const defaultEditions = () => [
  { id: 'grand-format', kind: 'grand-format', label: 'Grand format' },
  { id: 'poche', kind: 'poche', label: 'Poche' },
];

export function newEditionId(a, kind) {
  return uniqueId(kind, new Set((a.editions || []).map((e) => e.id)));
}

/**
 * Anciennes données : a.publishers = ["Fleuve Noir", "Pocket"], owned indexé par nom d'éditeur.
 * Nouveau format : a.editions = [{ id, kind, label }], owned indexé par id d'édition.
 */
function migrateEditions(a, books) {
  if (!a.editions) {
    a.editions = [];
    const map = new Map();
    const names = [...new Set([...(a.publishers || []), ...books.flatMap((b) => Object.keys(b.owned))])];
    for (const name of names) {
      const kind = guessEditionKind(name);
      const e = { id: newEditionId(a, kind), kind, label: name };
      a.editions.push(e);
      map.set(name, e.id);
    }
    for (const b of books) {
      const owned = {};
      for (const [k, n] of Object.entries(b.owned)) owned[map.get(k) || k] = n;
      b.owned = owned;
    }
    if (!a.editions.length) a.editions = defaultEditions();
  }
  delete a.publishers;
  // Exemplaires rattachés à une édition inconnue : on crée l'édition plutôt que de les perdre.
  const ids = new Set(a.editions.map((e) => e.id));
  for (const b of books) {
    for (const k of Object.keys(b.owned)) {
      if (!ids.has(k)) {
        a.editions.push({ id: k, kind: EDITION_KINDS.some((x) => x.id === k) ? k : 'autre', label: k });
        ids.add(k);
      }
    }
  }
}

function indexCommitted() {
  S.committed = new Set(
    [...S.lib.books.map((b) => b.cover), ...S.lib.authors.map((a) => a.photo)].filter(
      (p) => p && !/^https?:/.test(p),
    ),
  );
}

export async function init() {
  S.cfg = await loadConfig();
  S.local = await isLocalDevServer();
  const saved = sessionStorage.getItem(SESSION_KEY);
  if (saved) {
    try {
      await enterAdmin(JSON.parse(saved));
      return;
    } catch (e) {
      console.warn('Session admin expirée', e);
      sessionStorage.removeItem(SESSION_KEY);
    }
  }
  const r = await fetch(`data/library.json?t=${Date.now()}`, { cache: 'no-store' });
  if (r.ok) S.lib = parseLib(await r.text());
  indexCommitted();
}

// ---------------------------------------------------------------- admin

export function repoInfo(secrets = S.secrets) {
  return { owner: S.cfg.owner || secrets?.owner || '', repo: S.cfg.repo || secrets?.repo || '' };
}

function makeBackend(secrets) {
  if (S.local) return new LocalBackend();
  const { owner, repo } = repoInfo(secrets);
  if (!owner || !repo) throw new Error('Dépôt GitHub inconnu : renseignez le propriétaire et le nom du dépôt.');
  if (!secrets.githubToken) throw new Error('Aucun jeton GitHub enregistré.');
  return new GitHubBackend({ owner, repo, branch: S.cfg.branch, token: secrets.githubToken });
}

async function enterAdmin(secrets) {
  const backend = makeBackend(secrets);
  await backend.check();
  const f = await backend.readFile('data/library.json');
  S.lib = f ? parseLib(f.text) : { version: 1, authors: [], books: [] };
  S.libSha = f?.sha ?? null;
  S.backend = backend;
  S.secrets = secrets;
  S.admin = true;
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(secrets));
  indexCommitted();
  emit();
}

export async function readVault() {
  const tryFetch = async (url) => {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };
  let v = await tryFetch(`data/vault.json?t=${Date.now()}`);
  const { owner, repo } = repoInfo();
  // Juste après la configuration, GitHub Pages n'a peut-être pas encore republié le site.
  if (!v && !S.local && owner && repo) {
    v = await tryFetch(`https://raw.githubusercontent.com/${owner}/${repo}/${S.cfg.branch}/data/vault.json?t=${Date.now()}`);
  }
  return v;
}

export async function login(password) {
  const vault = await readVault();
  if (!vault) {
    const e = new Error('Aucun coffre configuré');
    e.code = 'NO_VAULT';
    throw e;
  }
  const secrets = await openVault(vault, password);
  await enterAdmin(secrets);
}

/** Crée ou remplace le coffre chiffré (secrets + mot de passe), puis entre en mode admin. */
export async function saveVault(secrets, password) {
  const backend = makeBackend(secrets);
  await backend.check();
  const vault = await sealVault(secrets, password);
  await backend.commit(
    [{ path: 'data/vault.json', content: `${JSON.stringify(vault, null, 1)}\n` }],
    'Liblio : mise à jour du coffre administrateur',
  );
  if (S.admin) {
    S.secrets = secrets;
    S.backend = backend;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(secrets));
    emit();
  } else {
    await enterAdmin(secrets);
  }
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
  location.reload();
}

/** Publie toutes les modifications en un seul commit. */
export async function publish({ force = false } = {}) {
  if (!force && S.backend.kind === 'github' && S.libSha) {
    const cur = await S.backend.readFile('data/library.json');
    if (cur && cur.sha !== S.libSha) {
      const e = new Error('La collection a été modifiée ailleurs depuis le chargement.');
      e.code = 'CONFLICT';
      throw e;
    }
  }
  const files = [{ path: 'data/library.json', content: `${JSON.stringify(S.lib, null, 1)}\n` }];
  for (const [path, bytes] of S.pending) files.push({ path, content: bytes });
  for (const path of S.deletions) files.push({ path, content: null });

  const n = S.changes.length;
  const title = n === 1 ? S.changes[0] : `mise à jour de la collection (${n || 1} modifications)`;
  const body = n > 1 ? `\n\n${S.changes.map((c) => `- ${c}`).join('\n')}` : '';
  await S.backend.commit(files, `Liblio : ${title}${body}`);

  const f = await S.backend.readFile('data/library.json');
  S.libSha = f?.sha ?? null;
  for (const p of S.pending.keys()) S.committed.add(p);
  for (const p of S.deletions) S.committed.delete(p);
  S.pending.clear();
  S.deletions.clear();
  S.changes = [];
  emit();
}

// ---------------------------------------------------------------- images

export function imgSrc(path) {
  if (!path) return '';
  if (/^https?:/.test(path)) return path;
  return S.blobUrls.get(path) || path;
}

export function rawUrl(path) {
  if (!path || /^https?:/.test(path)) return null;
  if (S.backend) return S.backend.rawUrl(path);
  const { owner, repo } = repoInfo();
  return owner && repo ? `https://raw.githubusercontent.com/${owner}/${repo}/${S.cfg.branch}/${path}` : null;
}

/** Remplace l'image `oldPath` par de nouveaux octets JPEG ; renvoie le nouveau chemin. */
export function storeImage(dir, id, bytes, oldPath) {
  dropImage(oldPath);
  const path = `${dir}/${id}-${shortRand()}.jpg`;
  S.pending.set(path, bytes);
  S.blobUrls.set(path, URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })));
  return path;
}

export function dropImage(path) {
  if (!path || /^https?:/.test(path)) return;
  S.pending.delete(path);
  if (S.committed.has(path)) S.deletions.add(path);
}

// ---------------------------------------------------------------- données

export const authorById = (id) => S.lib.authors.find((a) => a.id === id);
export const bookById = (id) => S.lib.books.find((b) => b.id === id);
export const ownedCount = (b) => Object.values(b.owned || {}).reduce((s, n) => s + (+n || 0), 0);

export function cmpBooks(a, b) {
  return (
    (a.year ?? 9999) - (b.year ?? 9999) ||
    (a.series || '').localeCompare(b.series || '', 'fr') ||
    (a.seriesIndex ?? 0) - (b.seriesIndex ?? 0) ||
    a.title.localeCompare(b.title, 'fr')
  );
}

export const booksOf = (aid) => S.lib.books.filter((b) => b.authorId === aid).sort(cmpBooks);

export function authorStats(aid) {
  const bs = booksOf(aid);
  return {
    total: bs.length,
    owned: bs.filter((b) => ownedCount(b) > 0).length,
    read: bs.filter((b) => b.read).length,
  };
}

export function seriesOf(aid) {
  return [...new Set(booksOf(aid).map((b) => b.series).filter(Boolean))];
}

export function addAuthor(data) {
  const id = uniqueId(slugify(data.name), new Set(S.lib.authors.map((a) => a.id)));
  const a = { id, editions: defaultEditions(), ...data, id };
  S.lib.authors.push(a);
  S.lib.authors.sort((x, y) => x.name.localeCompare(y.name, 'fr'));
  change(`ajout de l'auteur ${a.name}`);
  return a;
}

export function addBook(authorId, data, { silent = false } = {}) {
  const id = uniqueId(`${authorId}-${slugify(data.title)}`, new Set(S.lib.books.map((b) => b.id)));
  const b = {
    title: '',
    year: null,
    type: 'Roman',
    series: null,
    seriesIndex: null,
    owned: {},
    read: false,
    ...data,
    id,
    authorId,
  };
  S.lib.books.push(b);
  if (!silent) change(`ajout de « ${b.title} »`);
  return b;
}

export function deleteBook(b) {
  dropImage(b.cover);
  S.lib.books = S.lib.books.filter((x) => x !== b);
  change(`suppression de « ${b.title} »`);
}

export function deleteAuthor(a) {
  for (const b of booksOf(a.id)) dropImage(b.cover);
  dropImage(a.photo);
  S.lib.books = S.lib.books.filter((b) => b.authorId !== a.id);
  S.lib.authors = S.lib.authors.filter((x) => x !== a);
  change(`suppression de l'auteur ${a.name}`);
}
