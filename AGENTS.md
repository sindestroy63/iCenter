# iCenter Project Instructions

## Project context
- This repository is iCenter, an electronics storefront with an administrative panel.
- Do not mix this project with FOXSTORE or KonstantAuto.
- Inspect package.json and relevant source files to confirm the actual architecture before making changes.
- Follow existing patterns and reuse existing components.

## Local development
- Local development URL: http://localhost:3000
- Next.js runs on Windows through start-dev.ps1 with Hot Reload.
- Local PostgreSQL runs in Docker, accessible at 127.0.0.1:5434.
- The local database is icenter_v2.
- Docker application container icenter-work-local is intentionally stopped to free port 3000.
- Do not start the Docker application container while the dev server uses port 3000.
- Do not stop PostgreSQL or unrelated containers.
- Do not rebuild Docker for ordinary frontend changes.

## Product catalog
- Product variants, inventory, prices, availability and city selection are interconnected.
- Preserve product IDs, slugs, SKUs, canonical keys, inventory and order references.
- Use shared catalog components instead of duplicating product-card logic.
- Keep storage sorting numeric: 256 GB, 512 GB, 1 TB, 2 TB.
- SIM, storage and color must be treated as distinct variant attributes.
- Dual eSIM means two electronic SIMs, not two physical SIMs.
- Never invent official device specifications or color HEX values.

## Database safety
- iPhone variant normalization has already been applied to the local database.
- Do not rerun normalization or imports without a specific reason and approval.
- Do not run Prisma migrations, schema pushes, destructive SQL or bulk updates without explicit permission.
- Prepare a dry-run and backup before approved data modifications.
- Preserve existing orders, prices, inventory, SKUs and identifiers.
- The nameRu color migration is prepared but not applied.

## Workflow and verification
- Make targeted changes only.
- Prefer focused tests and typecheck.
- Run a production build when necessary, not automatically after every small UI change.
- Do not repeat successful tests without relevant changes.
- Do not deploy, push, or modify production without explicit approval.
- Report changed files, verification results and unresolved issues concisely.

## iCenter fast iteration rules
- The Next.js dev server is already running at http://localhost:3000 with Hot Reload.
- Do not start another dev server, stop the existing one, or rebuild Docker for routine changes.
- For CSS, layout, spacing, colors, and visual-only fixes: inspect the relevant component and styles, implement the fix, and rely on Hot Reload. Do not run build or the full test suite.
- For component logic or TypeScript changes: run targeted tests if available and one typecheck when appropriate.
- For API or database-related code: verify only affected endpoints and behavior, expanding checks when necessary.
- Avoid running the entire importer test suite for unrelated catalog UI changes.
- Do not run database integration tests requiring icenter_test:55432 unless the task specifically requires them and the test database is available.
- Do not rerun existing iPhone normalization or import verification unless the task directly concerns those processes.
- Do not run production build unless requested or needed to investigate a production-only issue.
- Avoid repeated HTTP smoke tests when the changed code does not affect API responses.
- Do not modify unrelated failing tests just to make the full suite pass.
- Stop after implementing the requested changes and completing the minimum sufficient verification.

## Code navigation
- When file locations are unclear, consult docs/AI_CONTEXT.md before exploring the repository. Do not read it for every task.
