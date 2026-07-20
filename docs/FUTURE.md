# Améliorations futures

## Priorité haute
- Brancher Whisper / OpenAI Audio en production (`TRANSCRIPTION_PROVIDER=openai`)
- Diarisation (qui parle) et détection de visages pour le recadrage vertical
- File BullMQ + Redis pour scaler les workers
- Stockage objet S3/R2 avec URLs signées

## Produit
- Génération multi-variantes en un clic (dynamique / émotionnelle / courte…)
- Styles de sous-titres karaoke avec highlight mot à mot dans le preview
- Preview d’export sans attendre le rendu final (proxy basse résolution)
- Collaboration / partage de projet en lecture seule

## Plateforme
- PostgreSQL obligatoire en prod + migrations continue
- Observabilité (OpenTelemetry, métriques coûts AI)
- Billing / abonnements (Stripe) branché sur `AccountLimit`
- Publication assistée Instagram / TikTok / YouTube (validation explicite obligatoire)

## Éditeur
- Transitions, musique de fond, B-roll library
- Remplacement intelligent d’extrait (recherche sémantique)
- Undo/redo persistant serveur multi-onglets
