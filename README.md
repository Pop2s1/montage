# Montage — montage vidéo assisté par IA

Application web MVP pour importer des rushes, décrire le résultat en langage naturel, générer automatiquement une timeline verticale sous-titrée, la peaufiner dans un éditeur simple, puis exporter un MP4.

## Architecture (résumé)

Voir [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) pour le détail.

- **Next.js 15** (App Router) + TypeScript + Tailwind
- **Auth.js** (credentials)
- **Prisma + SQLite** (PostgreSQL prêt via Docker Compose)
- **Worker** polling sur table `ProcessingJob` (sans Redis obligatoire)
- **FFmpeg** : probe, silences, scènes, découpe, export
- **Providers plugables** : transcription / montage / stockage (`demo` par défaut)

```
UI → API Routes → Prisma
              ↓
        ProcessingJob queue
              ↓
     Worker (import → analyze → transcribe → generate → export)
              ↓
     FFmpeg + Storage local
```

## Prérequis

- Node.js 20+
- pnpm 9+
- FFmpeg + FFprobe (`ffmpeg` dans le PATH)

## Installation locale

```bash
pnpm install
cp .env.example .env
pnpm db:migrate
pnpm db:seed
```

Compte démo créé par le seed :

- email : `demo@montage.app`
- mot de passe : `demo12345`

## Lancement

Dans un terminal :

```bash
pnpm dev
```

Cela démarre :

- l’app web sur [http://localhost:3000](http://localhost:3000)
- le worker de traitements asynchrones

Commandes séparées :

```bash
pnpm dev:web
pnpm worker
```

## Parcours MVP

1. Créer un compte / se connecter
2. Créer un projet (format Reel/TikTok/Short, durée, ton, consigne)
3. Importer une ou plusieurs vidéos (mp4/webm/mov)
4. Lancer l’analyse & génération
5. Suivre la progression (import → analyse → transcription → génération)
6. Ouvrir l’éditeur : lecture, trim, reorder, split, sous-titres, accroche/CTA
7. Exporter et télécharger via un lien temporaire

## Variables d’environnement

Voir [`.env.example`](.env.example).

| Variable | Rôle |
|----------|------|
| `DATABASE_URL` | SQLite local ou Postgres |
| `AUTH_SECRET` | Secret Auth.js (≥ 16 caractères) |
| `TRANSCRIPTION_PROVIDER` | `demo` ou `openai` |
| `MONTAGE_PROVIDER` | `demo` ou `openai` |
| `OPENAI_API_KEY` | Optionnel, pour providers réels |
| `STORAGE_DRIVER` | `local` (S3 prévu) |
| `MAX_UPLOAD_BYTES` | Limite d’upload |

Les providers `demo` sont clairement isolés dans `src/lib/providers/**` et remplacables sans toucher au pipeline.

## Scripts

| Commande | Description |
|----------|-------------|
| `pnpm dev` | Web + worker |
| `pnpm build` | Build production |
| `pnpm test` | Tests Vitest |
| `pnpm db:migrate` | Migrations |
| `pnpm db:seed` | Données démo |
| `pnpm lint` | ESLint |

## Structure

```
src/
  app/                 # Pages + API routes
  components/editor/   # Store Zustand de l’éditeur
  lib/
    auth/              # Auth.js + gardes
    providers/         # transcription, montage, storage
    queue/             # Jobs DB
    services/          # Pipeline + sous-titres
    video/             # FFmpeg helpers
  workers/             # Processus de traitements
prisma/                # Schéma + migrations + seed
docs/ARCHITECTURE.md
tests/
```

## Modèle de données

Utilisateurs, limites, projets, assets vidéo, analyses, transcriptions, scènes, variantes, timelines, pistes, segments, sous-titres, textes, contenu éditorial, exports, jobs, usage — voir `prisma/schema.prisma`.

## Sécurité (MVP)

- Auth session JWT
- Isolation stricte `project.userId`
- Validation MIME + magic bytes
- Limites taille / durée / rate-limit
- Secrets uniquement côté serveur
- Liens de téléchargement à token + expiration
- Suppression des fichiers à la suppression de projet

## Production (évolution)

```bash
docker compose up -d   # Postgres + Redis
# Puis DATABASE_URL postgres://... et adapter le worker vers BullMQ si besoin
```

## Améliorations futures

- Whisper / diarisation réelle, détection de visages & speaker tracking
- Recadrage intelligent vertical (suivi du sujet)
- Génération multi-variantes en un clic
- Stockage S3/R2 + CDN
- File BullMQ/Redis, scaling horizontal workers
- Abonnements / billing
- Publication réseaux (jamais auto sans validation)
- Effets / transitions avancées
- Éditeur temps réel collaboratif

## Tests

```bash
pnpm test
```

Couvre parsers FFmpeg, construction des sous-titres, providers demo et génération de timeline.
