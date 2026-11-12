# Liblio

Mini-site pour gérer ma collection de livres, hébergé gratuitement sur **GitHub Pages**.

- **Consultation publique** : auteurs, bibliographies triées par date, cycles, couvertures, exemplaires possédés, livres lus, liste « À acheter ».
- **Gestion protégée par mot de passe** : ajout d'auteurs et de livres, cases « possédé chez… » et « lu » cliquables comme dans un tableur, notes, résumés.
- **Bibliographie automatique** avec Claude (recherche web), relue avant import.
- **Couvertures automatiques** (Open Library, Amazon par ISBN, Google Books) et **photo + bio des auteurs** (Wikipédia).

## Comment ça marche

Pas de serveur ni de base de données : tout est dans le dépôt.

| Fichier | Contenu |
| --- | --- |
| `data/library.json` | La collection (auteurs + livres) |
| `data/covers/`, `data/authors/` | Couvertures et photos (JPEG) |
| `data/vault.json` | Coffre **chiffré** : jeton GitHub + clé API Claude |

Quand on se connecte, le mot de passe déchiffre le coffre **dans le navigateur** (AES-GCM, clé dérivée par PBKDF2 à 600 000 itérations).
Le jeton GitHub sert ensuite à enregistrer les modifications directement dans le dépôt : chaque clic sur **Publier** crée un commit
(historique complet, retour arrière possible). GitHub Pages republie le site en une minute environ.

La clé Claude n'est jamais exposée aux visiteurs : elle ne sort du coffre que dans le navigateur de l'administrateur,
qui appelle l'API Anthropic directement.

> ⚠️ Le coffre est public (dépôt public) : sa sécurité repose sur le mot de passe. Utilisez une **phrase de passe longue**
> (plusieurs mots) et un jeton GitHub limité à ce seul dépôt.

## Mise en ligne

1. Créez un dépôt GitHub (par ex. `liblio`) et poussez-y ce dossier sur la branche `main`.
2. Dans **Settings → Pages**, choisissez *Deploy from a branch*, branche `main`, dossier `/ (root)`.
3. Créez un [jeton fine-grained](https://github.com/settings/personal-access-tokens/new) :
   - *Repository access* : **Only select repositories** → `liblio`
   - *Permissions* : **Contents → Read and write**
4. (Facultatif) Créez une clé API sur [console.anthropic.com](https://console.anthropic.com/) pour la bibliographie automatique.
5. Ouvrez `https://<votre-compte>.github.io/liblio/`, cliquez sur **Gérer** : la première fois, un formulaire demande
   le jeton, la clé Claude et le mot de passe, puis crée le coffre.

Le propriétaire et le nom du dépôt sont déduits de l'adresse `*.github.io`. Pour un domaine personnalisé,
renseignez-les dans `config.json`.

### Reprendre ce dépôt pour sa propre collection

Tout ce qui est personnel est dans `data/` ; le reste est le code du site.

1. Forkez ou copiez le dépôt, puis videz `data/` : supprimez `library.json`, `vault.json` et le contenu de
   `data/covers/` et `data/authors/`.
2. Activez GitHub Pages (étape 2 ci-dessus) et créez votre jeton (étape 3).
3. Ouvrez le site, cliquez sur **Gérer** : la configuration du coffre se lance, puis la collection démarre vide
   (ou importez un fichier JSON).

## Utilisation

- **Ajouter un auteur** : page d'accueil → *Ajouter un auteur*. Photo et biographie viennent de Wikipédia, la bibliographie de Claude.
- **Mettre à jour la bibliographie** (page auteur) : Claude renvoie la liste des œuvres ; un écran de relecture indique ce qui est
  nouveau, ce qui est à compléter (année, cycle…) et ce qui est déjà présent. Rien n'est jamais supprimé automatiquement.
- **Couvertures manquantes** : cherche et télécharge une couverture pour chaque livre qui n'en a pas. Pour en changer une,
  ouvrez le livre → *Modifier* → *Chercher* (ou importez un fichier).
- **Éditions possédées** : chaque auteur a ses colonnes d'éditions, chacune d'un type commun — *Grand format*, *Poche*,
  *Collector* ou *Autre* — et d'un nom libre propre à l'auteur (ex. pour Thilliez : « Fleuve Noir » = grand format,
  « Pocket » = poche ; pour Gemmell : « Collector Bragelonne »). Un nouvel auteur démarre avec *Grand format* et *Poche*.
  Un clic sur une case passe de 0 à 1 puis 2 exemplaires. Le `+` en tête du tableau ajoute une édition ; un clic sur son nom
  permet de la renommer, d'en changer le type ou de la retirer.
- **Importer / Exporter** (accueil, en mode gestion) : sauvegarde de la collection en JSON, ou import d'un fichier.
  *Fusionner* ajoute les nouveaux auteurs et livres et complète ceux qui existent déjà (reconnus par nom et titre) sans
  rien supprimer ; *Remplacer* remplace toute la collection. Un aperçu s'affiche avant l'import. Format simplifié accepté :
  `{"authors": [{"name": "…", "editions": [{"id": "poche", "kind": "poche", "label": "Milady"}], "books": [{"title": "…", "year": 1984, "owned": {"poche": 1}, "read": true}]}]}`
- **Nom du propriétaire** (⚙ Réglages → Personnalisation) : le site devient « Liblio de … ».
- **Envies** : en mode gestion, le cœur ♡ d'un livre manquant le marque comme souhaité. Les livres souhaités sont
  regroupés en tête de « À acheter », tous auteurs confondus (▲ pour en remonter un), et signalés par un cœur ailleurs.
  Un livre acheté sort automatiquement des envies.
- **M'offrir ce livre** : les visiteurs trouvent des liens de recherche Vinted et Amazon dans la fiche de chaque livre manquant, et directement dans la liste pour les livres souhaités.
- **Publier** : les modifications restent locales jusqu'au clic sur *Publier* (un seul commit pour tout).
- Dans « À acheter », les autres livres manquants sont regroupés par auteur, en blocs repliables (repliés par défaut ; le navigateur se souvient de ceux que vous ouvrez).
- Sur la page d'un auteur, le champ « Rechercher un titre… » filtre ses livres (accents et majuscules ignorés), en plus des filtres et du cycle.
- Raccourci : `/` place le curseur dans la recherche (celle de l'accueil ou celle de l'auteur).

### Coût de la bibliographie automatique

Chaque recherche utilise Claude Opus 5.5 avec la recherche web (dix recherches au plus) : comptez de l'ordre de
0,10 à 0,50 $ par auteur selon la taille de la bibliographie. Le modèle se change dans les réglages (⚙).

## Développement local

```bash
node scripts/dev-server.mjs
```

Ouvre `http://localhost:8080`. En local, le bouton **Publier** écrit directement les fichiers sur le disque
(aucun appel à GitHub) ; le coffre est créé dans `data/vault.json`. Aucune dépendance à installer.

## Structure

```
index.html            page unique
assets/               logo, icône, styles
js/app.js             interface
js/store.js           état, connexion, publication
js/backends.js        GitHub (API Git Data) / disque local
js/vault.js           chiffrement du coffre
js/sources.js         Open Library, Amazon, Google Books, Wikipédia
js/claude.js          bibliographie via l'API Claude (SDK @anthropic-ai/sdk)
scripts/dev-server.mjs serveur local
```
