<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Mise en production : seulement par la CI

- Ne jamais lancer `vercel deploy` (ni `vercel --prod`) depuis un dossier local. GitHub est la seule source : on pousse une branche, la CI (`.github/workflows/ci.yml`) la vérifie.
- Un push sur `main` ne déploie rien. La mise en production se lance à la main, avec l’accord de l’utilisateur : « Run workflow » sur `main`, ou `gh workflow run CI --ref main`. La CI refait alors toutes les vérifications sur la tête de `main`, puis déploie.
- Avant de pousser : `npm run check` (types, lint, migrations, tests), puis `npm run e2e:build && npm run e2e` si l’appli a changé.
