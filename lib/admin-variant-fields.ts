export type AdminVariantFieldCode = "storage" | "ram" | "simType" | "connectivity" | "size" | "material";

export const ADMIN_VARIANT_MAIN_DICTIONARIES = new Set([
  "memory",
  "ram",
  "sim",
  "simType",
  "storage",
  "color",
  "connectivity",
  "size",
  "material",
]);

export type AdditionalVariantOption = {
  dictionary: string;
  isActive: boolean;
};

export type AdditionalVariantAvailability = {
  definitions: AdditionalVariantDefinition[];
  availableDefinitions: AdditionalVariantDefinition[];
  hasActiveValues: boolean;
  allAvailableUsed: boolean;
};

export type AdditionalVariantDefinition = {
  code: string;
  label?: string;
  scope: string;
  source: string;
  isActive?: boolean;
  productTypeIds?: readonly string[];
};

export function getAdditionalVariantAvailability(
  registry: readonly AdditionalVariantDefinition[],
  options: AdditionalVariantOption[],
  usedCodes: Iterable<string>,
  productTypeId?: string,
): AdditionalVariantAvailability {
  const used = new Set(usedCodes);
  const definitions = registry.filter(
    (entry) =>
      entry.scope === "VARIANT" &&
      entry.source === "attribute_options" &&
      (!productTypeId || entry.productTypeIds?.includes(productTypeId) || used.has(entry.code)) &&
      !ADMIN_VARIANT_MAIN_DICTIONARIES.has(entry.code),
  );
  const activeCodes = new Set(
    options.filter((option) => option.isActive).map((option) => option.dictionary),
  );
  const availableDefinitions = definitions.filter(
    (definition) => definition.isActive !== false && activeCodes.has(definition.code) && !used.has(definition.code),
  );
  const hasActiveValues = definitions.some((definition) => definition.isActive !== false && activeCodes.has(definition.code));
  return {
    definitions,
    availableDefinitions,
    hasActiveValues,
    allAvailableUsed: hasActiveValues && availableDefinitions.length === 0,
  };
}
export type ProductTypeCode = "smartphone" | "tablet" | "laptop" | "watch" | "headphones" | "vacuum" | "hairCare" | "console" | "other";

export type AdminVariantFieldSource = {
  brandName?: string | null;
  productName?: string | null;
  typeName?: string | null;
  typeKey?: string | null;
};

export type AdminVariantFieldValues = Partial<Record<AdminVariantFieldCode, unknown>> & {
  attributes?: Record<string, unknown> | null;
  dictionaryOptionIds?: Record<string, string | null> | null;
  dictionaryOptionLabels?: Record<string, string | null> | null;
};

const FIELD_LABELS: Record<AdminVariantFieldCode, string> = {
  storage: "Память",
  ram: "Оперативная память (RAM)",
  simType: "SIM",
  connectivity: "Подключение",
  size: "Размер",
  material: "Материал",
};

function classifyAdminProductType(value: string): ProductTypeCode {
  const normalized=value.toLowerCase();
  if (/smartphone|smartphones|phone|телефон|смартфон/.test(normalized)) return "smartphone";
  if (/tablet|tablets|ipad|планшет/.test(normalized)) return "tablet";
  if (/laptop|laptops|macbook|ноутбук/.test(normalized)) return "laptop";
  if (/watch|часы/.test(normalized)) return "watch";
  if (/headphone|airpods|наушник/.test(normalized)) return "headphones";
  if (/vacuum|пылесос/.test(normalized)) return "vacuum";
  if (/hair|supersonic|airwrap|фен|стайлер/.test(normalized)) return "hairCare";
  if (/console|playstation|xbox|консоль/.test(normalized)) return "console";
  return "other";
}

export function adminVariantType(source: AdminVariantFieldSource): ProductTypeCode {
  const candidates = [source.typeKey?.split(":").pop(),source.typeName,source.productName].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const type = classifyAdminProductType(candidate);
    if (type !== "other") return type;
  }
  return "other";
}

export function adminVariantFieldCodes(source: AdminVariantFieldSource): AdminVariantFieldCode[] {
  const type = adminVariantType(source);
  const brand = (source.brandName ?? "").toLowerCase();
  const product = `${source.productName ?? ""} ${source.typeName ?? ""}`.toLowerCase();

  if (type === "smartphone") {
    return brand.includes("apple") || product.includes("iphone")
      ? ["storage", "simType"]
      : ["storage", "ram", "simType"];
  }
  if (type === "tablet") {
    return product.includes("ipad") || brand.includes("apple")
      ? ["storage", "connectivity"]
      : ["storage", "ram", "simType", "connectivity"];
  }
  if (type === "laptop") return ["storage", "ram"];
  if (type === "watch") return ["size", "material"];
  if (type === "headphones") return ["connectivity"];
  if (type === "vacuum" || type === "hairCare") return ["connectivity", "material"];
  if (type === "console") return ["storage", "connectivity"];
  return [];
}

export function adminVariantFieldLabel(code: AdminVariantFieldCode): string {
  return FIELD_LABELS[code];
}

export function adminVariantFieldValue(variant: AdminVariantFieldValues, code: AdminVariantFieldCode): string {
  const direct = variant[code];
  if (typeof direct === "string" && direct.trim()) return direct;
  const attributes = variant.attributes;
  const aliases: Record<AdminVariantFieldCode, string[]> = {
    storage: ["storage", "memory"],
    ram: ["ram"],
    simType: ["simType", "sim"],
    connectivity: ["connectivity"],
    size: ["size"],
    material: ["material"],
  };
  for (const key of aliases[code]) {
    const value = attributes?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const dictionary = { storage: "memory", ram: "ram", simType: "sim", connectivity: "connectivity", size: "size", material: "material" }[code];
  const relationLabel = variant.dictionaryOptionLabels?.[dictionary];
  if (typeof relationLabel === "string" && relationLabel.trim()) return relationLabel;
  return "";
}

export const ADMIN_VARIANT_FIELD_CODES = ["storage", "ram", "simType", "connectivity", "size", "material"] as const;
