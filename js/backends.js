// Stockage : le dépôt GitHub (production) ou le disque via le serveur de dev (local).

import { enc, dec, b64, unb64 } from './util.js';

const toBytes = (c) => (typeof c === 'string' ? enc.encode(c) : c);

export class GitHubBackend {
  constructor({ owner, repo, branch, token }) {
    this.kind = 'github';
    this.owner = owner;
    this.repo = repo;
    this.branch = branch;
    this.token = token;
    this.api = `https://api.github.com/repos/${owner}/${repo}`;
  }

  async req(path, opts = {}) {
    const r = await fetch(this.api + path, {
      ...opts,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    if (!r.ok) {
      let msg = '';
      try {
        msg = (await r.json()).message;
      } catch {}
      const err = new Error(`GitHub ${r.status}${msg ? ` : ${msg}` : ''}`);
      err.status = r.status;
      throw err;
    }
    return r.status === 204 ? null : r.json();
  }

  async check() {
    await this.req('');
  }

  /** Lit un fichier texte du dépôt. Renvoie { text, sha } ou null s'il n'existe pas. */
  async readFile(path) {
    try {
      const r = await this.req(`/contents/${path}?ref=${encodeURIComponent(this.branch)}`);
      let content = r.content;
      if (!content) content = (await this.req(`/git/blobs/${r.sha}`)).content; // fichiers > 1 Mo
      return { text: dec.decode(unb64(content)), sha: r.sha };
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  /**
   * Crée UN commit contenant tous les fichiers donnés.
   * files : [{ path, content: string | Uint8Array | null (suppression) }]
   */
  async commit(files, message) {
    const ref = await this.req(`/git/ref/heads/${encodeURIComponent(this.branch)}`);
    const head = ref.object.sha;
    const headCommit = await this.req(`/git/commits/${head}`);
    const tree = [];
    for (const f of files) {
      if (f.content == null) {
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const blob = await this.req('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: b64(toBytes(f.content)), encoding: 'base64' }),
      });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await this.req('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
    });
    const commit = await this.req('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [head] }),
    });
    await this.req(`/git/refs/heads/${encodeURIComponent(this.branch)}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha }),
    });
    return commit.sha;
  }

  /** URL directe d'un fichier, utile tant que GitHub Pages n'a pas fini de republier. */
  rawUrl(path) {
    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${this.branch}/${path}`;
  }
}

export class LocalBackend {
  constructor() {
    this.kind = 'local';
  }

  async check() {}

  async readFile(path) {
    const r = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`Lecture ${path} : ${r.status}`);
    return { text: await r.text(), sha: null };
  }

  async commit(files, message) {
    const r = await fetch('/__dev/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        files: files.map((f) => ({ path: f.path, content: f.content == null ? null : b64(toBytes(f.content)) })),
      }),
    });
    if (!r.ok) throw new Error(await r.text());
  }

  rawUrl(path) {
    return path;
  }
}

export async function isLocalDevServer() {
  if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) return false;
  try {
    const r = await fetch('/__dev/ping', { cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}
