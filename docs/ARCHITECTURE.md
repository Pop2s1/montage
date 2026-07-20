# Montage — Architecture & plan MVP

## Vision

Application web de montage vidéo assisté par IA : l’utilisateur importe des rushes, décrit le résultat souhaité en langage naturel, et obtient une première timeline montée (format court vertical) qu’il peut corriger puis exporter.

## Stack retenue

| Couche | Choix | Pourquoi |
|--------|--------|----------|
| App full-stack | **Next.js 15 (App Router) + TypeScript** | Un seul repo typé, SSR/API routes, DX moderne, déploiement simple |
| UI | **Tailwind CSS 4** + composants locaux | Rapide, cohérent, sans dépendance design-system lourde |
| État éditeur | **Zustand** | Léger, adapté à une timeline interactive (undo/redo) |
| Auth | **Auth.js (NextAuth v5)** credentials + sessions JWT | Sécurisé, sans vendor lock-in pour le MVP |
| Données | **Prisma + SQLite** (dev/MVP) | Zéro infra locale ; schéma prêt pour PostgreSQL en prod |
| Files d’attente | **Table `ProcessingJob` + worker polling** | Asynchrone sans Redis obligatoire ; interface prête pour BullMQ |
| Vidéo | **FFmpeg / FFprobe** | Standard industrie pour probe, coupe, scènes, export |
| Transcription | **Interface `TranscriptionProvider`** + `DemoTranscriptionProvider` | Remplaçable par Whisper/OpenAI dès qu’une clé est dispo |
| Génération montage | **Interface `MontageProvider`** + `DemoMontageProvider` | Heuristiques + LLM optionnel |
| Stockage | **Interface `StorageProvider`** + disque local | Remplaçable par S3/R2 |
| Tests | **Vitest** | Rapide, compatible TS |

### Pourquoi pas X ?

- **Remotion / MoviePy comme moteur principal** : trop lourd pour un MVP découpe/assemble ; FFmpeg suffit.
- **Microservices dès le jour 1** : complexité inutile ; monolithe modulaire + worker séparé.
- **PostgreSQL + Redis obligatoires** : freinent le lancement local ; fournis via `docker-compose` pour la prod.

## Architecture logique

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Next.js UI │────▶│  API Routes      │────▶│  Prisma / SQLite│
│  (éditeur)  │     │  (auth, CRUD)    │     └─────────────────┘
└─────────────┘     └────────┬─────────┘
                             │ enqueue
                             ▼
                    ┌──────────────────┐
                    │ ProcessingJob DB │
                    └────────┬─────────┘
                             │ poll
                             ▼
                    ┌──────────────────┐     ┌──────────────────┐
                    │ Worker (tsx)     │────▶│ Providers        │
                    │ import/analyze/  │     │ transcription,   │
                    │ transcribe/      │     │ montage, storage │
                    │ generate/export  │     └──────────────────┘
                    └────────┬─────────┘
                             ▼
                    ┌──────────────────┐
                    │ FFmpeg + storage │
                    └──────────────────┘
```

## Parcours utilisateur (MVP)

1. Inscription / connexion  
2. Création projet (nom, format, durée cible, ton)  
3. Import multi-vidéos + consigne langage naturel  
4. Traitement asynchrone (import → analyse → transcription → génération)  
5. Ouverture de l’éditeur (preview, timeline, sous-titres)  
6. Ajustements (ordre, durée, textes)  
7. Export + téléchargement  

## Contrats entre composants

- **API → Worker** : jobs `{ type, projectId, payload }` persistés ; le worker met à jour `progress` / `status`.
- **Providers** : interfaces TypeScript stables ; implémentations `demo` vs `openai`/`whisper`/`s3` sélectionnées via env.
- **Timeline** : structure JSON normalisée (segments, cues, overlays) stockée en tables + snapshot pour undo.

## Traitements

| Job | Entrée | Sortie |
|-----|--------|--------|
| `import` | fichier uploadé | métadonnées, miniature, checksum |
| `analyze` | vidéo | silences, coupes de scène, scores |
| `transcribe` | vidéo | mots horodatés |
| `generate` | analyses + prompt | timeline, sous-titres, éditorial |
| `export` | timeline + options | fichier MP4 + URL temporaire |

## Risques techniques

1. **Qualité de la démo transcription** sans Whisper — mitigé par provider pluggable + seed.  
2. **Temps CPU FFmpeg** — files d’attente + progression.  
3. **Gros fichiers** — limites taille/durée + validation MIME.  
4. **Recadrage intelligent** — MVP : crop centre / ratio ; tracking visage en V2.  

## MVP vs futur

**MVP** : auth, projets, import, analyse (silences/scènes), transcription, génération timeline verticale, sous-titres, éditeur basique, export.

**Futur** : Whisper réel, LLM réel, face tracking, variantes multiples, S3, BullMQ, abonnements, publication réseaux, effets avancés.
