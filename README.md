# avis-google-api

Backend Railway pour le module Avis Google live du Cabinet Endodontie Louise.

Expose les avis Google Business Profile et les endpoints de reponse au frontend post-traitement existant.

## Architecture

Voir [ADR-020](https://github.com/Hugoendobxl/alfred-workspace/blob/main/decisions/020-module-avis-google-live.md) pour la decision architecturale complete.

## Setup

```bash
cp .env.example .env
# Remplir les variables
npm install
node src/db/init.js   # Initialiser le schema PostgreSQL
npm start
```

## Endpoints

- `GET /health` — healthcheck (monitore par UptimeRobot)
- Endpoints metier a venir (cf ADR-020 scope V1)
