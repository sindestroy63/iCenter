# iCenter — Quick Code Map

Use this map only when locating code relevant to the current task.
Verify actual implementation before editing. Do not read unrelated files.

## Storefront
- Catalog page: app/(storefront)/catalog/page.tsx
- Category and product routes: app/(storefront)/catalog/[...slug]/page.tsx
- Shared product card: components/CatalogProductCard.tsx
- Catalog view and filters: components/CatalogView.tsx
- Homepage catalog: components/HomeCatalog.tsx
- Store layout and interactions: components/StoreShell.tsx
- Catalog client: components/catalogClient.ts

## Administration
- Product administration: components/AdminProductsBackend.tsx
- City inventory administration: components/AdminCityInventory.tsx
- Admin products API: app/api/admin/products/route.ts
- Admin city inventory API: app/api/admin/city-inventory/route.ts

## Catalog API
- Product list: app/api/catalog/products/route.ts
- Product details: app/api/catalog/products/[slug]/route.ts
- Related products: app/api/catalog/products/[slug]/related/route.ts
- Brands, categories, cities and product types: app/api/catalog/

## Data and business logic
- Prisma schema: prisma/schema.prisma
- Product dictionaries and sorting: lib/product-dictionaries.ts
- Catalog API helpers: lib/catalog-api.ts
- Catalog DTO: lib/catalog-dto.ts
- Catalog search: lib/catalog-search.ts

## Sensitive operations
- iPhone normalization: scripts/normalize-iphone-variants.mjs
- Dictionary SQL: prisma/manual-product-dictionaries-stage2.sql
- Never run data modification scripts, migrations or schema push without explicit approval.

## Development
- Hot Reload: http://localhost:3000
- PostgreSQL: localhost:5434
- Prefer targeted checks.
- No full build or Docker rebuild for routine UI changes.

## Design reference
- Approved requirements: iCenter_2_0_APPROVED_ONLY/MANIFEST.md
- Read only relevant sections when the task concerns approved design or behavior.
- Design screenshots are references, not proof of implemented functionality.
