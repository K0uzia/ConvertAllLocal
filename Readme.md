[![Licence MIT](https://img.shields.io/github/license/K0uzia/ConvertAllLocal)](./LICENSE)
[![Open Source](https://img.shields.io/badge/Open%20Source-Oui-2ea043)](https://github.com/K0uzia/ConvertAllLocal)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-339933?logo=node.js&logoColor=white)](./package.json)
[![pnpm](https://img.shields.io/badge/pnpm-10+-F69220?logo=pnpm&logoColor=white)](./package.json)
[![100 % local](https://img.shields.io/badge/Traitement-100%25%20local-0ea5e9)](./Readme.md)
[![Stack](https://img.shields.io/badge/Stack-Astro-BC52EE?logo=astro&logoColor=white)](./src/)
[![Desktop](https://img.shields.io/badge/Desktop-Linux%20%7C%20Windows-1793D2?logo=linux&logoColor=white)](./Readme.md#formats-convertibles)
[![Netlify Status](https://api.netlify.com/api/v1/badges/bc7023de-fe4f-4e53-b38a-fa330e1e8b5e/deploy-status)](https://app.netlify.com/projects/convertalllocal/deploys)

# ConvertAllLocal - FR

[EN_Readme.md](./EN_Readme.md)

ConvertAllLocal est un outil **gratuit et open source** (MIT) de conversion locale pour les formats vidéo, image et icônes les plus utilisés sur le web et en développement d'applications, **sans envoi de fichiers vers un serveur**.

## Même service, deux environnements

| | **Site (navigateur)** | **Application (à venir)** |
|---|------------------------|---------------------------|
| Accès | Convertir sur le site | Téléchargement (Tauri, Linux/Windows) |
| Données | Restent dans le navigateur | Restent sur votre machine |
| Limites | Images, audio, docs, PDF léger : lot 24 Mo, fichier 16 Mo (texte 8 Mo) | Vidéo, Office, OCR, gros fichiers |

Les limites sur le web ne sont **pas** une version d'essai ou un modèle payant : c'est le **même outil**, avec les contraintes techniques du navigateur.

## État du projet

- **Fait** : site Astro, architecture modulaire (composants + CSS par module), Font Awesome en local (npm, hors ligne)
- **Fait (web)** : convertisseur navigateur (images, audio, documents, PDF), file d'attente locale
- **En cours** : application desktop Tauri (vidéo, Office, OCR)
- **Prévu** : application desktop Tauri 2 (léger, sans Electron)

## Installation en mode développement (local)

Guide pour cloner le dépôt, installer les outils requis et lancer le site en local.

### 1. Prérequis

| Outil | Version | Vérification |
|-------|---------|--------------|
| [Git](https://git-scm.com/) | récent | `git --version` |
| [Node.js](https://nodejs.org/) | ≥ 22.12 | `node -v` |
| [pnpm](https://pnpm.io/installation) | 10.x | `pnpm -v` |

`npm` est inclus avec Node.js. **pnpm** est recommandé (`packageManager` dans `package.json`).

### 2. Cloner le dépôt

```bash
git clone https://github.com/K0uzia/ConvertAllLocal.git
cd ConvertAllLocal
```

Fork ou branche personnelle : adaptez l'URL de `git clone`.

### 3. Installer pnpm (si la commande est introuvable)

```bash
node -v    # doit afficher v22.12 ou plus
pnpm -v    # si « commande introuvable », continuer ci-dessous
```

**Linux / macOS (avec sudo)** :

Via npm (si Node.js est déjà installé) :

```bash
sudo npm install -g pnpm@10.12.1
pnpm -v
```

Via le script officiel (télécharge et installe pnpm) :

```bash
curl -fsSL https://get.pnpm.io/install.sh | sudo sh -
source ~/.bashrc   # ou rouvrir le terminal
pnpm -v
```

**Windows (PowerShell)** :

```powershell
npm install -g pnpm@10.12.1
pnpm -v
```

Autres méthodes : [documentation officielle pnpm](https://pnpm.io/installation).

**Alternative sans installation globale** : utiliser `npm run dev:npx` (pnpm invoqué via `npx`).

### 4. Installer les dépendances du projet

À la racine du dépôt cloné :

```bash
pnpm install
```

### 5. Lancer le site en développement

```bash
pnpm dev
```

Sans pnpm global :

```bash
npm run dev:npx
```

Ouvrir [http://localhost:4321](http://localhost:4321) (port par défaut d'Astro).

### 6. Autres commandes utiles

```bash
pnpm build          # build de production (sortie dans dist/)
pnpm preview        # prévisualiser le build
```

Équivalent sans pnpm global : `npm run build:npx`.

### Dépannage

- **`pnpm: command not found`** : refaire l'étape 3 ou utiliser `npm run …:npx`.
- **Version Node trop ancienne** : installer Node 22 LTS ([nvm](https://github.com/nvm-sh/nvm) ou installeur officiel).
- **Erreurs après un pull** : `pnpm install` pour resynchroniser le lockfile.

Pour contribuer (conventions, structure) : [CONTRIBUTING.md](./CONTRIBUTING.md).

## Architecture

Détail des dossiers : [src/ARCHITECTURE.md](./src/ARCHITECTURE.md).

```
src/
  components/     # Header, Footer, Icon… (un .css par composant)
  layouts/        # Layout global
  pages/          # Routes Astro
  styles/         # global, tokens, fontawesome, pages/*.css
public/
```

**Icônes** : package npm `@fortawesome/fontawesome-free`, importé dans `src/styles/fontawesome.css` (aucun CDN, fonctionne offline après build).

## Fonctionnalités (vision)

- **Conversion 100 % locale** : FFmpeg (vidéo), outils images/icônes (à intégrer)
- **Interface** : drag & drop, choix du format de sortie, file d'attente
- **Batch** : application desktop
- **Offline** : après installation de l'app ; le site utilise des assets bundlés (dont Font Awesome)

## Formats convertibles

**Site (navigateur)** : images, audio, documents texte et PDF limité, **24 Mo max par lot** (16 Mo par fichier image/audio/PDF, 8 Mo pour le texte), traitement local sans upload. Détail sur le site : [Documentations](https://k0uzia.github.io/ConvertAllLocal/documentation/) (Web → [Conversions navigateur](https://k0uzia.github.io/ConvertAllLocal/documentation/web/conversions/)).  
**Application** : vidéo, Office, icônes, sans limite navigateur (moteurs à intégrer). Voir [Application desktop](https://k0uzia.github.io/ConvertAllLocal/documentation/application/apercu/).

### Vidéo

| Format | Usage principal | Avantages | Site (navigateur) | Application |
|--------|-----------------|-----------|-------------------|-------------|
| MP4 (H.264) | Web, YouTube, apps mobiles | Universel, streaming fluide | ❌ | ✅ |
| WebM (VP9/AV1) | Sites open-source (Chrome/Firefox) | Bande passante faible | ❌ | ✅ |
| MOV | iOS / macOS | Natif Apple | ❌ | ✅ |
| MKV | Apps multi-pistes | Sous-titres / audio flexibles | ❌ | ✅ |
| AVI / FLV | Anciens fichiers | Compatibilité legacy | ❌ | ✅ |

### Images et icônes

| Format | Usage principal | Site (navigateur) | Application |
|--------|-------------------|-------------------|-------------|
| **JPEG** | Photos | ✅ (lot 24 Mo) | ✅ |
| **PNG** | Logos, graphismes, icônes | ✅ (lot 24 Mo) | ✅ |
| **WebP** | Moderne optimisé | ✅ (lot 24 Mo) | ✅ |
| **AVIF** | Standard moderne | ✅ (lot 24 Mo) | ✅ |
| **GIF** | Animations courtes | ✅ (lot 24 Mo) | ✅ |
| **SVG** | UI responsive, icônes | ✅ (lot 24 Mo) | ✅ |
| **ICO** | Favicons, apps Windows | ✅ (lot 24 Mo) | ✅ |
| **ICNS** | Icônes apps macOS | ❌ | ✅ |
| **PNG 256×256** | Icônes apps Linux | ❌ | ✅ |

**Présets suggérés** : WebP 80 %, MP4 H.264, ICO (Windows), ICNS (macOS), PNG 256×256 (Linux).

## Licence

MIT. Voir [LICENSE](./LICENSE). Dépendances tierces : [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
