import nextEnv from "@next/env";
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";

nextEnv.loadEnvConfig(process.cwd());

const MODE = process.argv.includes("--apply") ? "apply" : process.argv.includes("--verify") ? "verify" : "dry-run";
const unexpectedArgs = process.argv.slice(2).filter((argument) => !["--apply", "--verify"].includes(argument));
if (unexpectedArgs.length || (process.argv.includes("--apply") && process.argv.includes("--verify"))) {
  process.stderr.write("Usage: node scripts/import-apple-2026-models.mjs [--apply|--verify]\n");
  process.exit(2);
}

const PRO_SOURCE = "https://www.apple.com/iphone-18-pro/specs/";
const DUO_SOURCE = "https://www.apple.com/iphone-duo/specs/";
const SOURCE_CHECKED_AT = "2026-10-28";
const SIM_LABEL = "Dual eSIM";
const CONNECTIVITY_LABEL = "5G, Wi-Fi 7, Bluetooth 6";

const STORAGE_OPTIONS = [
  { gigabytes: 256, label: "256 ГБ", canonicalKey: "memory:256gb", sku: "256" },
  { gigabytes: 512, label: "512 ГБ", canonicalKey: "memory:512gb", sku: "512" },
  { gigabytes: 1024, label: "1 ТБ", canonicalKey: "memory:1024gb", sku: "1TB" },
  { gigabytes: 2048, label: "2 ТБ", canonicalKey: "memory:2048gb", sku: "2TB" },
];

const COLOR_SPECS = {
  black: { name: "Black", slug: "black", sku: "BLK" },
  silver: { name: "Silver", slug: "silver", sku: "SLV" },
  glacier: { name: "Glacier", slug: "glacier", sku: "GLC" },
  burgundy: { name: "Burgundy", slug: "burgundy", sku: "BRG" },
  "night-sky": { name: "Night Sky", slug: "night-sky", sku: "NSK" },
  "star-white": { name: "Star White", slug: "star-white", sku: "SWT" },
};

const sharedProSpecifications = {
  source: { url: PRO_SOURCE, checkedAt: SOURCE_CHECKED_AT },
  processor: {
    name: "A20 Pro",
    cpu: "6-core CPU (2 super cores and 4 efficiency cores)",
    gpu: "7-core GPU with Neural Accelerators",
    neuralEngine: "Dual 16-core Neural Engine",
    rayTracing: "Hardware-accelerated ray tracing",
  },
  displayCommon: {
    type: "Super Retina XDR all-screen OLED",
    features: ["Dynamic Island", "Always-On display", "ProMotion up to 120Hz", "HDR", "True Tone", "Wide color (P3)"],
    brightness: "1000 nits typical; 1600 nits HDR peak; 3000 nits outdoor peak; 1 nit minimum",
  },
  rearCameras: {
    system: "48MP Pro Fusion camera system",
    main: "48MP Fusion Main, 24 mm, variable aperture ƒ/1.48, ƒ/1.8, ƒ/2.8, ƒ/4.0",
    ultraWide: "48MP Fusion Ultra Wide, 13 mm, ƒ/2.2, 120° field of view",
    telephoto: "48MP Fusion Telephoto, 100 mm (4x), ƒ/2.8; also enables 12MP optical-quality 8x Telephoto",
    zoom: "16x optical-quality zoom range; digital zoom up to 40x",
  },
  frontCamera: "18MP Center Stage camera, ƒ/1.9, autofocus with Focus Pixels",
  video: {
    main: "4K Dolby Vision up to 120 fps; ProRes up to 4K at 120 fps with external recording; ProRes RAW; Apple Log 2",
    features: ["Cinematic mode up to 4K Dolby Vision at 60 fps", "Action mode up to 2.8K Dolby Vision at 60 fps", "Dual Capture up to 4K Dolby Vision at 30 fps", "Spatial Audio and stereo recording"],
  },
  body: {
    material: "Aluminum unibody",
    front: "Ceramic Shield 2",
    back: "Ceramic Shield",
  },
  waterResistance: "IP68 under IEC 60529; maximum depth of 6 meters up to 30 minutes",
  wireless: ["5G (sub-6 GHz and mmWave) with 4x4 MIMO", "Wi-Fi 7 (802.11be) with 2x2 MIMO", "Bluetooth 6", "Thread", "second-generation Ultra Wideband", "NFC with reader mode"],
  connector: "USB-C with charging, DisplayPort, and USB 3 up to 10Gb/s",
  charging: {
    wired: "Up to 50% in around 15 minutes with a 60W-capable or higher AVS adapter and USB-C cable",
    magsafe: "Up to 25W; up to 50% in 30 minutes with a 35W or higher adapter",
    qi2: "Up to 25W",
  },
  sim: "Dual eSIM; two active eSIMs; stores eight or more eSIMs; no physical SIM support",
  operatingSystem: "iOS 27",
  biometrics: "Face ID",
};

const PRODUCTS = [
  {
    key: "iphone-18-pro",
    slug: "iphone-18-pro",
    name: "iPhone 18 Pro",
    nameAliases: ["apple iphone 18 pro", "iphone 18 pro"],
    modelName: "iPhone 18 Pro",
    generation: "iPhone 18",
    displaySize: "6.3″",
    skuPrefix: "APL-IP18P",
    material: "Aluminum",
    colors: ["black", "silver", "glacier", "burgundy"],
    description: "Apple iPhone 18 Pro с дисплеем Super Retina XDR OLED 6,3 дюйма, чипом A20 Pro, системой камер 48MP Pro Fusion, записью 4K Dolby Vision до 120 кадров/с, Dual eSIM, USB-C и iOS 27.",
    specifications: {
      ...sharedProSpecifications,
      display: { diagonal: "6.3 inches", resolution: "2622 by 1206 pixels", density: "460 ppi" },
      battery: { typicalUse: "Up to 24 hours", videoPlayback: "Up to 36 hours", streamedVideoPlayback: "Up to 33 hours", type: "Built-in rechargeable lithium-ion battery" },
      dimensions: { widthMm: 71.9, heightMm: 150.0, depthMm: 8.75, weightGrams: 211 },
    },
  },
  {
    key: "iphone-18-pro-max",
    slug: "iphone-18-pro-max",
    name: "iPhone 18 Pro Max",
    nameAliases: ["apple iphone 18 pro max", "iphone 18 pro max"],
    modelName: "iPhone 18 Pro Max",
    generation: "iPhone 18",
    displaySize: "6.9″",
    skuPrefix: "APL-IP18PM",
    material: "Aluminum",
    colors: ["black", "silver", "glacier", "burgundy"],
    description: "Apple iPhone 18 Pro Max с дисплеем Super Retina XDR OLED 6,9 дюйма, чипом A20 Pro, системой камер 48MP Pro Fusion, записью 4K Dolby Vision до 120 кадров/с, Dual eSIM, USB-C и iOS 27.",
    specifications: {
      ...sharedProSpecifications,
      display: { diagonal: "6.9 inches", resolution: "2868 by 1320 pixels", density: "460 ppi" },
      battery: { typicalUse: "Up to 30 hours", videoPlayback: "Up to 45 hours", streamedVideoPlayback: "Up to 40 hours", type: "Built-in rechargeable lithium-ion battery" },
      dimensions: { widthMm: 78.0, heightMm: 163.4, depthMm: 8.75, weightGrams: 249 },
    },
  },
  {
    key: "iphone-duo",
    slug: "iphone-duo",
    name: "iPhone Duo",
    nameAliases: ["apple iphone duo", "iphone duo"],
    modelName: "iPhone Duo",
    generation: "iPhone Duo",
    displaySize: "7.6″ / 5.4″",
    skuPrefix: "APL-IPDUO",
    material: "Titanium",
    colors: ["night-sky", "star-white"],
    description: "Складной Apple iPhone Duo с внутренним OLED-дисплеем Super Retina XDR 7,6 дюйма и внешним OLED-дисплеем 5,4 дюйма, чипом A20 Pro, камерой 48MP Dual Fusion, Dual eSIM, USB-C и iOS 27.",
    specifications: {
      source: { url: DUO_SOURCE, checkedAt: SOURCE_CHECKED_AT },
      processor: {
        name: "A20 Pro",
        cpu: "6-core CPU (2 super cores and 4 efficiency cores)",
        gpu: "7-core GPU with Neural Accelerators",
        neuralEngine: "Dual 16-core Neural Engine",
        rayTracing: "Hardware-accelerated ray tracing",
      },
      displays: {
        inner: { type: "Super Retina XDR all-screen OLED folding display", diagonal: "7.6 inches", resolution: "1878 by 2670 pixels", density: "430 ppi", features: ["Nano-texture finish", "Wide-angle OLEDs"] },
        outer: { type: "Super Retina XDR all-screen OLED display", diagonal: "5.4 inches", resolution: "1398 by 2034 pixels", density: "460 ppi" },
        common: ["Dynamic Island", "Always-On display", "ProMotion up to 120Hz", "HDR", "True Tone", "Wide color (P3)", "Apple Pencil (USB-C) support"],
        brightness: "1000 nits typical; 1600 nits HDR peak; 3000 nits outdoor peak; 1 nit minimum",
      },
      rearCameras: {
        system: "48MP Dual Fusion camera system",
        main: "48MP Fusion Main, 26 mm, ƒ/1.6",
        ultraWide: "48MP Fusion Ultra Wide, 13 mm, ƒ/2.2, 120° field of view",
        zoom: "4x optical-quality zoom range; digital zoom up to 10x",
      },
      frontCameras: {
        outer: "12MP Center Stage camera, ƒ/2.2",
        inner: "Under-display FaceTime camera, ƒ/1.8, 1080p video at 30 or 60 fps",
      },
      video: {
        main: "4K Dolby Vision up to 120 fps",
        features: ["Cinematic mode up to 4K Dolby Vision at 60 fps", "Action mode up to 2.8K Dolby Vision at 60 fps", "Dual Capture up to 4K Dolby Vision at 30 fps", "Spatial Audio and stereo recording"],
      },
      battery: {
        typicalUse: "Up to 24 hours",
        videoPlaybackOuter: "Up to 44 hours",
        videoPlaybackInner: "Up to 31 hours",
        streamedVideoPlaybackOuter: "Up to 37 hours",
        streamedVideoPlaybackInner: "Up to 26 hours",
        type: "Dual built-in rechargeable lithium-ion batteries",
      },
      charging: {
        wired: "Up to 50% in around 20 minutes with a 60W-capable or higher adapter and USB-C cable",
        magsafe: "Up to 25W; up to 50% in around 30 minutes with a 35W or higher adapter",
        qi2: "Up to 25W",
      },
      dimensions: {
        open: { widthMm: 164.6, heightMm: 117.8, depthMm: 5.2 },
        folded: { widthMm: 84.1, heightMm: 117.8, depthMm: 11.3 },
        weightGrams: 254,
      },
      body: { material: "Titanium foldable design", front: "Ceramic Shield 2", back: "Ceramic Shield" },
      waterResistance: "IP68 under IEC 60529; maximum depth of 6 meters up to 30 minutes",
      wireless: ["5G (sub-6 GHz and mmWave) with 4x4 MIMO", "Wi-Fi 7 (802.11be) with 2x2 MIMO", "Bluetooth 6", "Thread", "second-generation Ultra Wideband", "NFC with reader mode"],
      connector: "USB-C with charging, DisplayPort, and USB 3 up to 10Gb/s",
      sim: "Dual eSIM; two active eSIMs; stores eight or more eSIMs; no physical SIM support",
      operatingSystem: "iOS 27",
      biometrics: "Touch ID in the side button",
    },
  },
];

const REQUIRED_TABLES = [
  "brands", "product_types", "categories", "colors", "products", "product_variants",
  "inventory", "global_product_types", "legacy_product_type_mappings", "product_lines",
  "product_models", "attribute_definitions", "attribute_options", "product_type_attributes",
  "product_attribute_values", "product_variant_attribute_values",
];

const prisma = new PrismaClient({ log: [] });

function fail(message) {
  throw new Error(message);
}

function stableId(prefix, key) {
  return `${prefix}_${createHash("sha256").update(key).digest("hex").slice(0, 20)}`;
}

function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function normalizeName(value) {
  return String(value ?? "").trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9а-яё]+/giu, " ").trim();
}

function capacityInGb(value) {
  const normalized = String(value ?? "").trim().toLocaleLowerCase("ru-RU").replace(/,/g, ".");
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(tb|тб|t|gb|гб|g)?$/iu);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2]?.toLocaleLowerCase("ru-RU");
  const gigabytes = amount * (["tb", "тб", "t"].includes(unit) ? 1024 : 1);
  return Number.isInteger(gigabytes) ? gigabytes : null;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function sortedObject(value) {
  if (Array.isArray(value)) return value.map(sortedObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, sortedObject(item)]));
}

function variantCanonicalKey(variant) {
  return createHash("sha256").update(JSON.stringify([
    variant.colorId ?? null,
    variant.storage ?? null,
    variant.ram ?? null,
    variant.simType ?? null,
    variant.connectivity ?? null,
    variant.size ?? null,
    variant.material ?? null,
    sortedObject(variant.attributes ?? {}),
  ])).digest("hex");
}

function validateLocalDatabaseUrl() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) fail("LOCAL_DATABASE_REQUIRED: DATABASE_URL is missing");
  const url = new URL(connectionString);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (url.protocol !== "postgresql:") fail("LOCAL_DATABASE_REQUIRED: PostgreSQL URL expected");
  if (!["127.0.0.1", "localhost", "::1"].includes(url.hostname)) fail("LOCAL_DATABASE_REQUIRED: DATABASE_URL host is not loopback");
  if (database !== "icenter_v2") fail(`LOCAL_DATABASE_REQUIRED: expected icenter_v2, got ${database || "<empty>"}`);
  return { host: url.hostname, port: url.port || "5432", database };
}

async function queryFingerprint(tx, targetProductIds) {
  const inventory = await tx.$queryRaw`
    SELECT id, "variantId", "cityId", price::text, "oldPrice"::text, stock,
           availability::text, "allowPreorder", "deliveryTime", "isActive",
           "createdAt", "updatedAt"
    FROM inventory
    ORDER BY id
  `;
  const otherCatalog = targetProductIds.length
    ? await tx.$queryRaw(Prisma.sql`
        SELECT product.id AS "productId", product.name, product.slug, product."brandId",
               product."productTypeId", product."categoryId", product.model, product.generation,
               product.chip, product."displaySize", product."releaseYear", product.description,
               product.specifications, product."isNew", product.status::text,
               variant.id AS "variantId", variant.sku, variant.label, variant."canonicalKey",
               variant."colorId", variant.storage, variant.ram, variant."simType",
               variant.connectivity, variant.size, variant.material, variant.attributes,
               variant."isActive" AS "variantActive"
        FROM products product
        LEFT JOIN product_variants variant ON variant."productId" = product.id
        WHERE product.id NOT IN (${Prisma.join(targetProductIds)})
        ORDER BY product.id, variant.id
      `)
    : await tx.$queryRaw`
        SELECT product.id AS "productId", product.name, product.slug, product."brandId",
               product."productTypeId", product."categoryId", product.model, product.generation,
               product.chip, product."displaySize", product."releaseYear", product.description,
               product.specifications, product."isNew", product.status::text,
               variant.id AS "variantId", variant.sku, variant.label, variant."canonicalKey",
               variant."colorId", variant.storage, variant.ram, variant."simType",
               variant.connectivity, variant.size, variant.material, variant.attributes,
               variant."isActive" AS "variantActive"
        FROM products product
        LEFT JOIN product_variants variant ON variant."productId" = product.id
        ORDER BY product.id, variant.id
      `;
  return { inventory: fingerprint(inventory), otherCatalog: fingerprint(otherCatalog) };
}

async function loadState(tx) {
  const [identity] = await tx.$queryRaw`
    SELECT current_database() AS database, current_user AS username,
           inet_server_addr()::text AS host, inet_server_port() AS port
  `;
  if (identity.database !== "icenter_v2") fail("DATABASE_IDENTITY_MISMATCH");

  const tableRows = await tx.$queryRaw`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN (${Prisma.join(REQUIRED_TABLES)})
  `;
  const foundTables = new Set(tableRows.map((row) => row.table_name));
  const missingTables = REQUIRED_TABLES.filter((table) => !foundTables.has(table));
  if (missingTables.length) fail(`SCHEMA_MISMATCH: missing ${missingTables.join(", ")}`);

  const brands = await tx.$queryRaw`SELECT id, name, slug, "isActive" FROM brands WHERE slug = 'apple'`;
  if (brands.length !== 1 || !brands[0].isActive) fail("APPLE_BRAND_NOT_FOUND_OR_INACTIVE");
  const brand = brands[0];

  const productTypes = await tx.$queryRaw`
    SELECT id, name, slug, "brandId", "isActive"
    FROM product_types
    WHERE slug = 'iphone' AND "brandId" = ${brand.id}
  `;
  if (productTypes.length !== 1 || !productTypes[0].isActive) fail("IPHONE_PRODUCT_TYPE_NOT_FOUND_OR_INACTIVE");
  const productType = productTypes[0];

  const categories = await tx.$queryRaw`
    SELECT id, name, slug, "isActive"
    FROM categories
    WHERE slug = 'smartphones'
  `;
  if (categories.length !== 1 || !categories[0].isActive) fail("SMARTPHONE_CATEGORY_NOT_FOUND_OR_INACTIVE");
  const category = categories[0];

  const mappings = await tx.$queryRaw`
    SELECT mapping."globalProductTypeId", global_type."canonicalKey", global_type."isActive"
    FROM legacy_product_type_mappings mapping
    JOIN global_product_types global_type ON global_type.id = mapping."globalProductTypeId"
    WHERE mapping."legacyProductTypeId" = ${productType.id}
  `;
  if (mappings.length !== 1 || mappings[0].canonicalKey !== "product_type:smartphone" || !mappings[0].isActive) fail("SMARTPHONE_TYPE_MAPPING_INVALID");
  const globalProductTypeId = mappings[0].globalProductTypeId;

  const productLines = await tx.$queryRaw`
    SELECT id, name, "brandId", "canonicalKey", "isActive"
    FROM product_lines
    WHERE "brandId" = ${brand.id} AND "canonicalKey" = 'iphone'
  `;
  if (productLines.length !== 1 || !productLines[0].isActive) fail("IPHONE_PRODUCT_LINE_NOT_FOUND_OR_INACTIVE");
  const productLine = productLines[0];

  const definitions = await tx.$queryRaw`
    SELECT definition.id, definition.code, definition.scope, definition."isActive",
           applicability."isRequired"
    FROM attribute_definitions definition
    JOIN product_type_attributes applicability
      ON applicability."definitionId" = definition.id
     AND applicability."productTypeId" = ${productType.id}
    WHERE definition.code IN ('memory', 'sim', 'chip')
  `;
  const definitionByCode = new Map(definitions.map((row) => [row.code, row]));
  for (const [code, scope] of [["memory", "VARIANT"], ["sim", "VARIANT"], ["chip", "PRODUCT"]]) {
    const definition = definitionByCode.get(code);
    if (!definition || definition.scope !== scope || !definition.isActive) fail(`ATTRIBUTE_DEFINITION_INVALID: ${code}`);
  }

  const colors = await tx.$queryRaw`
    SELECT id, name, slug, "hexPrimary", "hexSecondary", "isActive"
    FROM colors
    ORDER BY id
  `;
  const attributeOptions = await tx.$queryRaw`
    SELECT id, "definitionId", "canonicalKey", label, "sortOrder", "isActive"
    FROM attribute_options
    WHERE "definitionId" IN (${Prisma.join(Array.from(definitionByCode.values()).map((row) => row.id))})
    ORDER BY id
  `;
  const productModels = await tx.$queryRaw`
    SELECT id, name, "brandId", "globalProductTypeId", "isActive"
    FROM product_models
    WHERE "brandId" = ${brand.id} AND "globalProductTypeId" = ${globalProductTypeId}
    ORDER BY id
  `;
  const products = await tx.$queryRaw`
    SELECT id, name, slug, "brandId", "productTypeId", "categoryId", "productLineId",
           "modelId", model, generation, chip, "displaySize", "releaseYear",
           description, specifications, "isNew", status::text, "createdAt", "updatedAt"
    FROM products
    WHERE slug IN (${Prisma.join(PRODUCTS.map((product) => product.slug))})
       OR lower(name) IN (${Prisma.join(PRODUCTS.flatMap((product) => product.nameAliases))})
    ORDER BY id
  `;

  return {
    identity,
    brand,
    productType,
    category,
    globalProductTypeId,
    productLine,
    definitionByCode,
    colors,
    attributeOptions,
    productModels,
    products,
  };
}

async function buildPlan(tx, state) {
  const plan = {
    colors: [],
    options: [],
    models: [],
    products: [],
    variants: [],
    preservedLegacyVariants: [],
  };

  const colorByKey = new Map();
  for (const [key, desired] of Object.entries(COLOR_SPECS)) {
    const matches = state.colors.filter((color) => color.slug.toLocaleLowerCase("en-US") === desired.slug || normalizeName(color.name) === normalizeName(desired.name));
    if (matches.length > 1) fail(`AMBIGUOUS_COLOR: ${desired.name}`);
    const existing = matches[0];
    const item = existing
      ? { action: "reuse", id: existing.id, name: existing.name, officialName: desired.name, slug: existing.slug, reactivate: !existing.isActive }
      : { action: "create", id: stableId("imp_color", desired.slug), name: desired.name, officialName: desired.name, slug: desired.slug, hexPrimary: null, hexSecondary: null };
    colorByKey.set(key, item);
    plan.colors.push(item);
  }

  const optionByCanonicalKey = new Map();
  const optionDefinitions = [
    ...STORAGE_OPTIONS.map((storage) => ({
      definition: "memory",
      canonicalKey: storage.canonicalKey,
      id: storage.gigabytes === 2048 ? "ao_memory_2048gb" : null,
      label: storage.label,
      sortOrder: storage.gigabytes,
    })),
    { definition: "sim", canonicalKey: "sim:dual-esim", id: "ao_sim_dual_esim", label: SIM_LABEL, sortOrder: 40 },
    { definition: "chip", canonicalKey: "chip:a20-pro", id: "ao_chip_a20pro", label: "A20 Pro", sortOrder: 40 },
  ];
  for (const desired of optionDefinitions) {
    const definition = state.definitionByCode.get(desired.definition);
    const matches = state.attributeOptions.filter((option) => option.definitionId === definition.id && option.canonicalKey === desired.canonicalKey);
    if (matches.length > 1) fail(`AMBIGUOUS_ATTRIBUTE_OPTION: ${desired.canonicalKey}`);
    const existing = matches[0];
    if (!existing && !desired.id) fail(`REQUIRED_ATTRIBUTE_OPTION_MISSING: ${desired.canonicalKey}`);
    const item = existing
      ? { action: "reuse", ...desired, id: existing.id, definitionId: definition.id, label: existing.label, reactivate: !existing.isActive }
      : { action: "create", ...desired, definitionId: definition.id };
    optionByCanonicalKey.set(desired.canonicalKey, item);
    plan.options.push(item);
  }

  const productByKey = new Map();
  for (const desired of PRODUCTS) {
    const aliases = new Set(desired.nameAliases.map(normalizeName));
    const matches = state.products.filter((product) => product.slug === desired.slug || aliases.has(normalizeName(product.name)));
    const uniqueMatches = Array.from(new Map(matches.map((product) => [product.id, product])).values());
    if (uniqueMatches.length > 1) fail(`AMBIGUOUS_PRODUCT: ${desired.name}`);
    const existing = uniqueMatches[0];
    const product = {
      ...desired,
      action: existing ? "update" : "create",
      id: existing?.id ?? stableId("imp_product", desired.slug),
      existing,
      slug: existing?.slug ?? desired.slug,
      status: existing?.status ?? "DRAFT",
      isNew: existing?.isNew ?? true,
    };
    productByKey.set(desired.key, product);
    plan.products.push(product);

    const modelMatches = state.productModels.filter((model) => normalizeName(model.name) === normalizeName(desired.modelName));
    if (modelMatches.length > 1) fail(`AMBIGUOUS_PRODUCT_MODEL: ${desired.modelName}`);
    const existingModel = modelMatches[0];
    plan.models.push(existingModel
      ? { action: "reuse", id: existingModel.id, name: existingModel.name, reactivate: !existingModel.isActive, productKey: desired.key }
      : { action: "create", id: stableId("imp_model", desired.slug), name: desired.modelName, productKey: desired.key });
  }

  const targetProductIds = plan.products.map((product) => product.id);
  const existingVariants = targetProductIds.length
    ? await tx.$queryRaw(Prisma.sql`
        SELECT variant.id, variant."productId", variant.sku, variant.barcode, variant.label,
               variant."canonicalKey", variant."colorId", variant.storage, variant.ram,
               variant."simType", variant.connectivity, variant.size, variant.material,
               variant.attributes, variant."isActive",
               (SELECT count(*)::int FROM inventory inventory_row WHERE inventory_row."variantId" = variant.id) AS "inventoryRows"
        FROM product_variants variant
        WHERE variant."productId" IN (${Prisma.join(targetProductIds)})
        ORDER BY variant."productId", variant.id
      `)
    : [];

  const modelByProductKey = new Map(plan.models.map((model) => [model.productKey, model]));
  for (const product of plan.products) {
    product.modelId = modelByProductKey.get(product.key).id;
    const existingForProduct = existingVariants.filter((variant) => variant.productId === product.id);
    const matchedVariantIds = new Set();
    for (const storage of STORAGE_OPTIONS) {
      for (const colorKey of product.colors) {
        const color = colorByKey.get(colorKey);
        const officialColor = COLOR_SPECS[colorKey];
        const matches = existingForProduct.filter((variant) => variant.colorId === color.id && capacityInGb(variant.storage) === storage.gigabytes);
        if (matches.length > 1) fail(`DUPLICATE_VARIANT_COMBINATION: ${product.name} / ${storage.label} / ${officialColor.name}`);
        const existing = matches[0];
        if (existing) matchedVariantIds.add(existing.id);
        const legacyAttributes = objectValue(existing?.attributes);
        delete legacyAttributes.color;
        delete legacyAttributes.memory;
        delete legacyAttributes.sim;
        delete legacyAttributes.connectivity;
        delete legacyAttributes.material;
        const attributes = sortedObject(legacyAttributes);
        const variant = {
          action: existing ? "update" : "create",
          id: existing?.id ?? stableId("imp_variant", `${product.key}:${storage.gigabytes}:${colorKey}`),
          productId: product.id,
          productKey: product.key,
          sku: existing?.sku ?? `${product.skuPrefix}-${storage.sku}-${officialColor.sku}`,
          label: `${storage.label} · ${officialColor.name} · ${SIM_LABEL}`,
          colorId: color.id,
          colorName: officialColor.name,
          colorKey,
          storage: storage.label,
          storageGb: storage.gigabytes,
          memoryOptionId: optionByCanonicalKey.get(storage.canonicalKey).id,
          simType: SIM_LABEL,
          simOptionId: optionByCanonicalKey.get("sim:dual-esim").id,
          ram: existing?.ram ?? null,
          connectivity: null,
          size: null,
          material: null,
          attributes,
          isActive: existing?.isActive ?? false,
          existing,
        };
        variant.canonicalKey = variantCanonicalKey(variant);
        plan.variants.push(variant);
      }
    }
    for (const variant of existingForProduct) {
      if (!matchedVariantIds.has(variant.id)) plan.preservedLegacyVariants.push({
        id: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        storage: variant.storage,
        colorId: variant.colorId,
        inventoryRows: variant.inventoryRows,
      });
    }
  }

  const plannedIds = [
    ...plan.colors.filter((item) => item.action === "create").map((item) => item.id),
    ...plan.options.filter((item) => item.action === "create").map((item) => item.id),
    ...plan.models.filter((item) => item.action === "create").map((item) => item.id),
    ...plan.products.filter((item) => item.action === "create").map((item) => item.id),
    ...plan.variants.filter((item) => item.action === "create").map((item) => item.id),
  ];
  if (new Set(plannedIds).size !== plannedIds.length) fail("PLANNED_ID_COLLISION");

  const newSkus = plan.variants.filter((variant) => variant.action === "create").map((variant) => variant.sku);
  if (newSkus.length) {
    const skuConflicts = await tx.$queryRaw(Prisma.sql`
      SELECT id, "productId", sku
      FROM product_variants
      WHERE sku IN (${Prisma.join(newSkus)})
    `);
    if (skuConflicts.length) fail(`SKU_COLLISION: ${skuConflicts.map((row) => row.sku).join(", ")}`);
  }

  const targetCombinationKeys = plan.variants.map((variant) => `${variant.productId}:${variant.storageGb}:${variant.colorId}`);
  if (new Set(targetCombinationKeys).size !== 40 || plan.variants.length !== 40) fail("TARGET_MATRIX_NOT_40_UNIQUE_COMBINATIONS");
  return plan;
}

async function applyPlan(tx, state, plan) {
  for (const color of plan.colors) {
    if (color.action === "create") {
      await tx.$executeRaw`
        INSERT INTO colors (id, name, slug, "hexPrimary", "hexSecondary", "sortOrder", "isActive", "updatedAt")
        VALUES (${color.id}, ${color.name}, ${color.slug}, NULL, NULL, 0, TRUE, NOW())
      `;
    } else if (color.reactivate) {
      await tx.$executeRaw`UPDATE colors SET "isActive" = TRUE, "updatedAt" = NOW() WHERE id = ${color.id}`;
    }
  }

  for (const option of plan.options) {
    if (option.action === "create") {
      await tx.$executeRaw`
        INSERT INTO attribute_options (id, "definitionId", "canonicalKey", label, "sortOrder", "isActive", "updatedAt")
        VALUES (${option.id}, ${option.definitionId}, ${option.canonicalKey}, ${option.label}, ${option.sortOrder}, TRUE, NOW())
      `;
    } else if (option.reactivate) {
      await tx.$executeRaw`UPDATE attribute_options SET "isActive" = TRUE, "updatedAt" = NOW() WHERE id = ${option.id}`;
    }
  }

  for (const model of plan.models) {
    if (model.action === "create") {
      await tx.$executeRaw`
        INSERT INTO product_models (id, name, "brandId", "globalProductTypeId", "isActive", "updatedAt")
        VALUES (${model.id}, ${model.name}, ${state.brand.id}, ${state.globalProductTypeId}, TRUE, NOW())
      `;
    } else if (model.reactivate) {
      await tx.$executeRaw`UPDATE product_models SET "isActive" = TRUE, "updatedAt" = NOW() WHERE id = ${model.id}`;
    }
  }

  for (const product of plan.products) {
    const specifications = sortedObject(product.specifications);
    if (product.action === "create") {
      await tx.$executeRaw`
        INSERT INTO products (
          id, name, slug, "brandId", "productTypeId", "productLineId", "categoryId",
          "modelId", model, generation, chip, "displaySize", "releaseYear", description,
          specifications, "isNew", status, "updatedAt"
        ) VALUES (
          ${product.id}, ${product.name}, ${product.slug}, ${state.brand.id}, ${state.productType.id},
          ${state.productLine.id}, ${state.category.id}, ${product.modelId}, ${product.modelName},
          ${product.generation}, ${"A20 Pro"}, ${product.displaySize}, NULL,
          ${JSON.stringify({ text: product.description })}::jsonb,
          ${JSON.stringify(specifications)}::jsonb, ${product.isNew}, ${product.status}::"ProductStatus", NOW()
        )
      `;
    } else {
      await tx.$executeRaw`
        UPDATE products
        SET name = ${product.name},
            "brandId" = ${state.brand.id},
            "productTypeId" = ${state.productType.id},
            "productLineId" = ${state.productLine.id},
            "categoryId" = ${state.category.id},
            "modelId" = ${product.modelId},
            model = ${product.modelName},
            generation = ${product.generation},
            chip = ${"A20 Pro"},
            "displaySize" = ${product.displaySize},
            description = ${JSON.stringify({ text: product.description })}::jsonb,
            specifications = ${JSON.stringify(specifications)}::jsonb,
            "updatedAt" = NOW()
        WHERE id = ${product.id}
      `;
    }
    await tx.$executeRaw`
      INSERT INTO product_attribute_values ("productId", "definitionId", "optionId")
      VALUES (${product.id}, ${state.definitionByCode.get("chip").id}, ${plan.options.find((option) => option.canonicalKey === "chip:a20-pro").id})
      ON CONFLICT ("productId", "definitionId") DO UPDATE
      SET "optionId" = EXCLUDED."optionId", "updatedAt" = NOW()
    `;
  }

  for (const variant of plan.variants) {
    if (variant.action === "create") {
      await tx.$executeRaw`
        INSERT INTO product_variants (
          id, "productId", sku, label, "canonicalKey", "colorId", storage, ram,
          "simType", connectivity, size, material, attributes, "isActive", "updatedAt"
        ) VALUES (
          ${variant.id}, ${variant.productId}, ${variant.sku}, ${variant.label}, ${variant.canonicalKey},
          ${variant.colorId}, ${variant.storage}, ${variant.ram}, ${variant.simType},
          ${variant.connectivity}, ${variant.size}, ${variant.material},
          ${JSON.stringify(variant.attributes)}::jsonb, FALSE, NOW()
        )
      `;
    } else {
      await tx.$executeRaw`
        UPDATE product_variants
        SET label = ${variant.label},
            "canonicalKey" = ${variant.canonicalKey},
            "colorId" = ${variant.colorId},
            storage = ${variant.storage},
            "simType" = ${variant.simType},
            connectivity = NULL,
            size = NULL,
            material = NULL,
            attributes = ${JSON.stringify(variant.attributes)}::jsonb,
            "updatedAt" = NOW()
        WHERE id = ${variant.id} AND "productId" = ${variant.productId}
      `;
    }
    await tx.$executeRaw`
      INSERT INTO product_variant_attribute_values ("variantId", "definitionId", "optionId")
      VALUES (${variant.id}, ${state.definitionByCode.get("memory").id}, ${variant.memoryOptionId})
      ON CONFLICT ("variantId", "definitionId") DO UPDATE
      SET "optionId" = EXCLUDED."optionId", "updatedAt" = NOW()
    `;
    await tx.$executeRaw`
      INSERT INTO product_variant_attribute_values ("variantId", "definitionId", "optionId")
      VALUES (${variant.id}, ${state.definitionByCode.get("sim").id}, ${variant.simOptionId})
      ON CONFLICT ("variantId", "definitionId") DO UPDATE
      SET "optionId" = EXCLUDED."optionId", "updatedAt" = NOW()
    `;
  }
}

async function verify(tx, expectedProductIds = null) {
  const products = expectedProductIds
    ? await tx.$queryRaw(Prisma.sql`
        SELECT id, name, slug, "brandId", "productTypeId", "categoryId", "productLineId",
               "modelId", model, generation, chip, "displaySize", "releaseYear",
               specifications, status::text
        FROM products
        WHERE id IN (${Prisma.join(expectedProductIds)})
        ORDER BY slug
      `)
    : await tx.$queryRaw`
        SELECT id, name, slug, "brandId", "productTypeId", "categoryId", "productLineId",
               "modelId", model, generation, chip, "displaySize", "releaseYear",
               specifications, status::text
        FROM products
        WHERE slug IN ('iphone-18-pro', 'iphone-18-pro-max', 'iphone-duo')
        ORDER BY slug
      `;
  if (products.length !== 3) fail(`VERIFY_PRODUCTS_EXPECTED_3_GOT_${products.length}`);

  const variants = await tx.$queryRaw(Prisma.sql`
    SELECT variant.id, variant."productId", variant.sku, variant.label, variant."canonicalKey",
           variant."colorId", color.slug AS "colorSlug", color.name AS "colorName",
           variant.storage, variant."simType", variant.connectivity, variant.material, variant.attributes, variant."isActive",
           (SELECT count(*)::int FROM inventory inventory_row WHERE inventory_row."variantId" = variant.id) AS "inventoryRows",
           memory_option."canonicalKey" AS "memoryCanonicalKey",
           sim_option."canonicalKey" AS "simCanonicalKey"
    FROM product_variants variant
    JOIN colors color ON color.id = variant."colorId"
    LEFT JOIN product_variant_attribute_values memory_value
      ON memory_value."variantId" = variant.id
     AND memory_value."definitionId" = 'ad_memory'
    LEFT JOIN attribute_options memory_option ON memory_option.id = memory_value."optionId"
    LEFT JOIN product_variant_attribute_values sim_value
      ON sim_value."variantId" = variant.id
     AND sim_value."definitionId" = 'ad_sim'
    LEFT JOIN attribute_options sim_option ON sim_option.id = sim_value."optionId"
    WHERE variant."productId" IN (${Prisma.join(products.map((product) => product.id))})
    ORDER BY variant."productId", variant.id
  `);

  const productBySlug = new Map(products.map((product) => [product.slug, product]));
  const targetVariants = [];
  const extras = [];
  for (const desired of PRODUCTS) {
    const product = productBySlug.get(desired.slug);
    if (!product) fail(`VERIFY_PRODUCT_SLUG_MISSING: ${desired.slug}`);
    const desiredColorSlugs = new Set(desired.colors.map((key) => COLOR_SPECS[key].slug));
    const rows = variants.filter((variant) => variant.productId === product.id);
    for (const row of rows) {
      const storageGb = capacityInGb(row.storage);
      if (desiredColorSlugs.has(row.colorSlug) && STORAGE_OPTIONS.some((storage) => storage.gigabytes === storageGb)) targetVariants.push({ ...row, storageGb });
      else extras.push(row);
    }
  }
  const combinationKeys = targetVariants.map((variant) => `${variant.productId}:${variant.storageGb}:${variant.colorId}`);
  if (targetVariants.length !== 40 || new Set(combinationKeys).size !== 40) fail(`VERIFY_TARGET_MATRIX_INVALID: rows=${targetVariants.length} unique=${new Set(combinationKeys).size}`);
  const expectedCounts = new Map([
    ["iphone-18-pro", 16],
    ["iphone-18-pro-max", 16],
    ["iphone-duo", 8],
  ]);
  const targetVariantsByProduct = products.map((product) => ({
    slug: product.slug,
    count: targetVariants.filter((variant) => variant.productId === product.id).length,
  }));
  for (const entry of targetVariantsByProduct) {
    if (entry.count !== expectedCounts.get(entry.slug)) fail(`VERIFY_PRODUCT_MATRIX_INVALID: ${entry.slug}=${entry.count}`);
  }
  if (targetVariants.some((variant) => !variant.sku || !variant.label || !variant.canonicalKey)) fail("VERIFY_VARIANT_IDENTIFIERS_INCOMPLETE");
  if (new Set(targetVariants.map((variant) => variant.sku)).size !== 40) fail("VERIFY_DUPLICATE_TARGET_SKU");
  if (new Set(targetVariants.map((variant) => `${variant.productId}:${variant.canonicalKey}`)).size !== 40) fail("VERIFY_DUPLICATE_TARGET_CANONICAL_KEY");
  if (targetVariants.some((variant) => variant.simType !== SIM_LABEL || variant.simCanonicalKey !== "sim:dual-esim" || !variant.memoryCanonicalKey || variant.connectivity !== null || variant.material !== null || Object.keys(objectValue(variant.attributes)).some((key) => ["color", "memory", "sim", "connectivity", "material"].includes(key)))) fail("VERIFY_NORMALIZED_ATTRIBUTES_INCOMPLETE");

  const newTargetVariants = targetVariants.filter((variant) => !variant.isActive);
  if (newTargetVariants.some((variant) => variant.inventoryRows !== 0)) fail("VERIFY_INACTIVE_VARIANT_HAS_INVENTORY");

  const duplicateRows = await tx.$queryRaw(Prisma.sql`
    SELECT "productId", "canonicalKey", count(*)::int AS count
    FROM product_variants
    WHERE "productId" IN (${Prisma.join(products.map((product) => product.id))})
    GROUP BY "productId", "canonicalKey"
    HAVING count(*) > 1
  `);
  if (duplicateRows.length) fail("VERIFY_DUPLICATE_CANONICAL_KEYS_IN_DATABASE");

  return {
    products: products.map((product) => ({ id: product.id, name: product.name, slug: product.slug, status: product.status })),
    targetCombinationCount: targetVariants.length,
    uniqueTargetCombinationCount: new Set(combinationKeys).size,
    targetVariantsByProduct,
    inactiveTargetVariantsWithoutInventory: newTargetVariants.length,
    preservedLegacyVariants: extras.map((variant) => ({ id: variant.id, productId: variant.productId, sku: variant.sku, storage: variant.storage, color: variant.colorName, inventoryRows: variant.inventoryRows })),
  };
}

function summarizePlan(plan, identity, safety = null, verification = null) {
  return {
    mode: MODE,
    database: { name: identity.database, user: identity.username, serverHost: identity.host, serverPort: identity.port },
    products: {
      create: plan.products.filter((item) => item.action === "create").map((item) => item.name),
      update: plan.products.filter((item) => item.action === "update").map((item) => item.name),
    },
    colors: {
      create: plan.colors.filter((item) => item.action === "create").map((item) => ({ name: item.name, slug: item.slug, hex: null })),
      reuse: plan.colors.filter((item) => item.action === "reuse").map((item) => ({ existingName: item.name, officialName: item.officialName, slug: item.slug })),
    },
    variants: {
      create: plan.variants.filter((item) => item.action === "create").length,
      update: plan.variants.filter((item) => item.action === "update").length,
      targetCombinations: plan.variants.length,
      newVariantsActive: false,
      newInventoryRows: 0,
    },
    dictionaries: {
      create: plan.options.filter((item) => item.action === "create").map((item) => item.canonicalKey),
      reuse: plan.options.filter((item) => item.action === "reuse").map((item) => item.canonicalKey),
    },
    preservedLegacyVariants: plan.preservedLegacyVariants,
    specifications: [
      "A20 Pro processor",
      "display diagonal/type/resolution and display features",
      "rear/front cameras and video",
      "battery life and wired/MagSafe/Qi2 charging",
      "dimensions and weight (including Duo open/folded sizes)",
      "body materials and Ceramic Shield",
      "5G/Wi-Fi 7/Bluetooth 6/UWB/NFC",
      "IP68 water and dust resistance",
      "iOS 27, biometrics, USB-C, Dual eSIM",
    ],
    unconfirmedOrIntentionallyOmitted: [
      "Exact finish HEX values are not published on the cited Apple specification pages; new colors use NULL HEX fields.",
      "Apple US prices were not imported.",
      "Release year is not explicitly listed in the cited specification tables; releaseYear remains unchanged for existing products and NULL for new products.",
      "RAM capacity is not stated on the cited pages and was not invented.",
    ],
    safety,
    verification,
  };
}

async function run() {
  const urlIdentity = validateLocalDatabaseUrl();
  if (MODE === "verify") {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      return verify(tx);
    }, { maxWait: 5000, timeout: 20000 });
    process.stdout.write(`${JSON.stringify({ mode: MODE, urlIdentity, verification: result }, null, 2)}\n`);
    return;
  }

  if (MODE === "dry-run") {
    const report = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const state = await loadState(tx);
      const plan = await buildPlan(tx, state);
      return summarizePlan(plan, state.identity, { databaseWrites: 0 });
    }, { maxWait: 5000, timeout: 30000 });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const report = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('import-apple-2026-models'))");
    const state = await loadState(tx);
    const plan = await buildPlan(tx, state);
    const targetProductIds = plan.products.map((product) => product.id);
    const before = await queryFingerprint(tx, targetProductIds);
    await applyPlan(tx, state, plan);
    const after = await queryFingerprint(tx, targetProductIds);
    if (before.inventory !== after.inventory) fail("SAFETY_CHECK_FAILED: inventory changed");
    if (before.otherCatalog !== after.otherCatalog) fail("SAFETY_CHECK_FAILED: another product changed");
    const verification = await verify(tx, targetProductIds);
    return summarizePlan(plan, state.identity, {
      inventoryUnchanged: true,
      otherProductsUnchanged: true,
      productionTouched: false,
    }, verification);
  }, { maxWait: 10000, timeout: 60000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

try {
  await run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`APPLE_IMPORT_FAILED ${message}\n`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
