export type DictionaryCode =
  | "brand"
  | "productType"
  | "productModel"
  | "color"
  | "memory"
  | "ram"
  | "sim"
  | "connectivity"
  | "size"
  | "material"
  | "chip"
  | "region"
  | "condition"
  | "bundle"
  | "productLine";

export type AttributeScope = "PRODUCT" | "VARIANT";
export type DictionarySource = "brands" | "product_types" | "colors" | "products" | "product_lines" | "attribute_options";

export interface DictionaryOption {
  id: string;
  dictionary: DictionaryCode;
  canonicalKey: string;
  label: string;
  aliases: readonly string[];
  sortOrder: number;
  isActive: boolean;
}

export interface CanonicalizedDictionaryValue {
  dictionary: "memory" | "ram" | "sim";
  canonicalKey: string;
  label: string;
  aliases: readonly string[];
  sortOrder: number;
}

export interface DictionaryDefinition {
  code: DictionaryCode;
  label: string;
  source: DictionarySource;
  scope: AttributeScope | "ENTITY";
  filterOrder: number | null;
  applicableTypes: readonly ProductTypeCode[] | "ALL";
  normalizedUnit?: "storage" | "ram";
}

export type ProductTypeCode =
  | "smartphone"
  | "tablet"
  | "laptop"
  | "watch"
  | "headphones"
  | "vacuum"
  | "hairCare"
  | "console"
  | "other";

export interface ProductTypeAttributeRule {
  type: ProductTypeCode;
  attributes: readonly DictionaryCode[];
}

export interface CanonicalOptionInput {
  dictionary: DictionaryCode;
  canonicalKey: string;
  label: string;
  aliases?: readonly string[];
}

export interface ExistingOptionKey {
  dictionary: DictionaryCode;
  key: string;
  optionId: string;
}

export interface ValidationIssue {
  code: "INVALID_CANONICAL_KEY" | "EMPTY_LABEL" | "DUPLICATE_KEY" | "DUPLICATE_ALIAS";
  value: string;
  conflictsWith?: string;
}

export const DICTIONARY_REGISTRY: readonly DictionaryDefinition[] = [
  { code: "brand", label: "Бренд", source: "brands", scope: "ENTITY", filterOrder: 0, applicableTypes: "ALL" },
  { code: "productType", label: "Тип товара", source: "product_types", scope: "ENTITY", filterOrder: 1, applicableTypes: "ALL" },
  { code: "productModel", label: "Модель", source: "products", scope: "ENTITY", filterOrder: 2, applicableTypes: "ALL" },
  { code: "color", label: "Цвет", source: "colors", scope: "VARIANT", filterOrder: 3, applicableTypes: "ALL" },
  { code: "memory", label: "Память", source: "attribute_options", scope: "VARIANT", filterOrder: 4, applicableTypes: ["smartphone", "tablet", "laptop", "console"], normalizedUnit: "storage" },
  { code: "ram", label: "Оперативная память (RAM)", source: "attribute_options", scope: "VARIANT", filterOrder: 5, applicableTypes: ["smartphone", "tablet", "laptop"], normalizedUnit: "ram" },
  { code: "sim", label: "SIM", source: "attribute_options", scope: "VARIANT", filterOrder: 6, applicableTypes: ["smartphone", "tablet" ] },
  { code: "connectivity", label: "Подключение", source: "attribute_options", scope: "VARIANT", filterOrder: 7, applicableTypes: ["smartphone", "tablet", "laptop", "watch", "headphones", "vacuum", "hairCare", "console"] },
  { code: "size", label: "Размер", source: "attribute_options", scope: "VARIANT", filterOrder: null, applicableTypes: ["watch"] },
  { code: "material", label: "Материал", source: "attribute_options", scope: "VARIANT", filterOrder: null, applicableTypes: ["watch", "vacuum", "hairCare"] },
  { code: "chip", label: "Процессор / чип", source: "attribute_options", scope: "PRODUCT", filterOrder: null, applicableTypes: ["smartphone", "tablet", "laptop", "console"] },
  { code: "region", label: "Регион / версия", source: "attribute_options", scope: "VARIANT", filterOrder: null, applicableTypes: "ALL" },
  { code: "condition", label: "Состояние", source: "attribute_options", scope: "PRODUCT", filterOrder: null, applicableTypes: "ALL" },
  { code: "bundle", label: "Комплектация", source: "attribute_options", scope: "VARIANT", filterOrder: null, applicableTypes: ["vacuum", "hairCare", "console"] },
  { code: "productLine", label: "Линейка товара", source: "product_lines", scope: "ENTITY", filterOrder: null, applicableTypes: "ALL" },
] as const;

const HIDDEN_LEGACY_DICTIONARIES = new Set<DictionaryCode>(["productModel", "productLine", "region"]);

export const ADMIN_DICTIONARY_REGISTRY = DICTIONARY_REGISTRY.filter(
  (definition) => !HIDDEN_LEGACY_DICTIONARIES.has(definition.code),
);

export const PUBLIC_FILTER_ORDER = ["brand", "productType", "color", "memory", "ram", "sim", "connectivity"] as const satisfies readonly DictionaryCode[];

export const PRODUCT_TYPE_ATTRIBUTE_RULES: readonly ProductTypeAttributeRule[] = [
  { type: "smartphone", attributes: ["brand", "productType", "color", "memory", "ram", "sim", "connectivity", "chip", "condition", "bundle"] },
  { type: "tablet", attributes: ["brand", "productType", "color", "memory", "ram", "sim", "connectivity", "chip", "condition", "bundle"] },
  { type: "laptop", attributes: ["brand", "productType", "color", "memory", "ram", "connectivity", "chip", "condition", "bundle"] },
  { type: "watch", attributes: ["brand", "productType", "color", "sim", "connectivity", "size", "material", "condition", "bundle"] },
  { type: "headphones", attributes: ["brand", "productType", "color", "connectivity", "material", "condition", "bundle"] },
  { type: "vacuum", attributes: ["brand", "productType", "color", "connectivity", "material", "condition", "bundle"] },
  { type: "hairCare", attributes: ["brand", "productType", "color", "connectivity", "material", "condition", "bundle"] },
  { type: "console", attributes: ["brand", "productType", "color", "memory", "connectivity", "chip", "condition", "bundle"] },
  { type: "other", attributes: ["brand", "productType", "color", "condition"] },
] as const;

const registryByCode = new Map(DICTIONARY_REGISTRY.map((entry) => [entry.code, entry]));
const attributeRuleByType = new Map(PRODUCT_TYPE_ATTRIBUTE_RULES.map((rule) => [rule.type, new Set(rule.attributes)]));

export function getDictionaryDefinition(code: DictionaryCode): DictionaryDefinition {
  const definition = registryByCode.get(code);
  if (!definition) throw new Error(`Unknown product dictionary: ${code}`);
  return definition;
}

export function getPublicFilterDefinitions(): readonly DictionaryDefinition[] {
  return PUBLIC_FILTER_ORDER.map(getDictionaryDefinition);
}

export function isAttributeApplicable(type: ProductTypeCode, code: DictionaryCode): boolean {
  return attributeRuleByType.get(type)?.has(code) ?? false;
}

export function classifyProductType(value: string): ProductTypeCode {
  const normalized = normalizeText(value);
  if (/смартфон|smartphone|телефон/.test(normalized)) return "smartphone";
  if (/планшет|tablet|ipad/.test(normalized)) return "tablet";
  if (/ноутбук|laptop|macbook/.test(normalized)) return "laptop";
  if (/час|watch/.test(normalized)) return "watch";
  if (/наушник|headphone|airpods/.test(normalized)) return "headphones";
  if (/пылесос|vacuum/.test(normalized)) return "vacuum";
  if (/фен|стайлер|hair.?care|supersonic|airwrap/.test(normalized)) return "hairCare";
  if (/консол|playstation|xbox/.test(normalized)) return "console";
  return "other";
}

export function normalizeMemory(value: string): CanonicalizedDictionaryValue | null {
  return normalizeCapacity(value, "memory");
}

export function normalizeRam(value: string): CanonicalizedDictionaryValue | null {
  return normalizeCapacity(value, "ram");
}

export function normalizeSim(value: string): CanonicalizedDictionaryValue | null {
  const normalized = normalizeText(value).replace(/[+]/g, " + ").replace(/\s+/g, " ");
  const options: Record<string, { canonicalKey: string; label: string }> = {
    sim: { canonicalKey: "sim:sim", label: "SIM" },
    esim: { canonicalKey: "sim:esim", label: "eSIM" },
    "physical sim": { canonicalKey: "sim:physical-sim", label: "Physical SIM" },
    "физическая sim": { canonicalKey: "sim:physical-sim", label: "Physical SIM" },
    "esim + физическая sim": { canonicalKey: "sim:esim-physical-sim", label: "SIM + eSIM" },
    "физическая sim + esim": { canonicalKey: "sim:esim-physical-sim", label: "SIM + eSIM" },
    "sim + esim": { canonicalKey: "sim:esim-physical-sim", label: "SIM + eSIM" },
    "dual physical sim": { canonicalKey: "sim:dual-physical-sim", label: "Dual Physical SIM" },
    "2 sim": { canonicalKey: "sim:dual-physical-sim", label: "Dual Physical SIM" },
    "dual esim": { canonicalKey: "sim:dual-esim", label: "Dual eSIM" },
    "2 esim": { canonicalKey: "sim:dual-esim", label: "Dual eSIM" },
  };
  const option = options[normalized];
  if (!option) return null;
  return { dictionary: "sim", ...option, aliases: value.trim() === option.label ? [] : [value.trim()], sortOrder: Object.keys(options).indexOf(normalized) };
}

export function canonicalDictionaryValueKey(dictionary: "memory" | "ram" | "sim", value: string): string {
  const normalized = dictionary === "memory" ? normalizeMemory(value) : dictionary === "ram" ? normalizeRam(value) : normalizeSim(value);
  return normalized?.canonicalKey ?? `${dictionary}:raw:${normalizeText(value)}`;
}

export function dictionaryValuesMatch(dictionary: "memory" | "ram" | "sim", left: string, right: string): boolean {
  return canonicalDictionaryValueKey(dictionary, left) === canonicalDictionaryValueKey(dictionary, right);
}

function normalizeCapacity(value: string, dictionary: "memory" | "ram"): CanonicalizedDictionaryValue | null {
  const cleaned = normalizeText(value).replace(/,/g, ".");
  const match = cleaned.match(/^(\d+(?:\.\d+)?)\s*(tb|тб|t|gb|гб|g)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unit = match[2]?.toLowerCase();
  if (dictionary === "ram" && (unit === "tb" || unit === "тб" || unit === "t")) return null;
  const factor = unit === "tb" || unit === "тб" || unit === "t" ? 1024 : 1;
  const gigabytes = amount * factor;
  if (!Number.isInteger(gigabytes)) return null;
  const label = dictionary === "memory" && gigabytes >= 1024 && gigabytes % 1024 === 0
    ? `${gigabytes / 1024} ТБ`
    : `${gigabytes} ГБ`;
  return {
    dictionary,
    canonicalKey: `${dictionary}:${gigabytes}gb`,
    label,
    aliases: Array.from(new Set([value.trim(), `${gigabytes}GB`, `${gigabytes} GB`, `${gigabytes} ГБ`, label].filter((alias) => alias !== label))),
    sortOrder: gigabytes,
  };
}

export function prepareExistingValueAlias(dictionary: "memory" | "ram" | "sim", rawValue: string): { canonicalKey: string; alias: string } | null {
  const option = dictionary === "memory" ? normalizeMemory(rawValue) : dictionary === "ram" ? normalizeRam(rawValue) : normalizeSim(rawValue);
  return option ? { canonicalKey: option.canonicalKey, alias: rawValue.trim() } : null;
}

export function validateCanonicalKey(value: string): boolean {
  return /^[a-z][a-z0-9_]*(?::[a-z0-9]+(?:-[a-z0-9]+)*)+$/.test(value);
}

export function validateOptionInput(input: CanonicalOptionInput, existing: readonly ExistingOptionKey[] = []): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!validateCanonicalKey(input.canonicalKey)) issues.push({ code: "INVALID_CANONICAL_KEY", value: input.canonicalKey });
  if (!input.label.trim()) issues.push({ code: "EMPTY_LABEL", value: input.label });
  const keys = [input.canonicalKey, ...(input.aliases ?? []).map((alias) => normalizeAliasKey(input.dictionary, alias)).filter((key): key is string => Boolean(key) && key !== input.canonicalKey)];
  const localKeys = new Set<string>();
  for (const key of keys) {
    if (localKeys.has(key)) {
      issues.push({ code: "DUPLICATE_ALIAS", value: key, conflictsWith: input.canonicalKey });
      continue;
    }
    localKeys.add(key);
    const conflict = existing.find((item) => item.dictionary === input.dictionary && item.key === key);
    if (conflict) issues.push({ code: key === input.canonicalKey ? "DUPLICATE_KEY" : "DUPLICATE_ALIAS", value: key, conflictsWith: conflict.optionId });
  }
  return issues;
}

export function compareDictionaryOptions(dictionary: DictionaryCode, left: DictionaryOption, right: DictionaryOption): number {
  if (dictionary === "memory" || dictionary === "ram") return capacityValue(left) - capacityValue(right) || left.label.localeCompare(right.label, "ru");
  return left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, "ru");
}

export function memoryCapacityGb(value: string | null | undefined): number {
  const raw = String(value ?? "").trim().replace(",", ".");
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(tb|тб|t|gb|гб|g)?/i);
  if (!match) return Number.MAX_SAFE_INTEGER;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return Number.MAX_SAFE_INTEGER;
  return Math.round(amount * (["tb", "тб", "t"].includes((match[2] ?? "gb").toLowerCase()) ? 1024 : 1));
}

export function compareMemoryValues(left: string, right: string): number {
  return memoryCapacityGb(left) - memoryCapacityGb(right) || left.localeCompare(right, "ru");
}

export function sortDictionaryOptions(dictionary: DictionaryCode, options: readonly DictionaryOption[]): DictionaryOption[] {
  return [...options].sort((left, right) => compareDictionaryOptions(dictionary, left, right));
}

function capacityValue(option: DictionaryOption): number {
  const canonical = option.canonicalKey.match(/:(\d+)gb$/);
  if (canonical) return Number(canonical[1]);
  return memoryCapacityGb(option.label);
}

function normalizeAliasKey(dictionary: DictionaryCode, value: string): string | null {
  if (dictionary === "memory" || dictionary === "ram") {
    const canonical = dictionary === "memory" ? normalizeMemory(value) : normalizeRam(value);
    const raw = normalizeText(value).replace(/\s+/g, "").replace(/,/g, ".").match(/^(\d+(?:\.\d+)?)(tb|тб|t|gb|гб|g)?$/i);
    return canonical && raw ? `${dictionary}:${raw[1]}${raw[2] ?? ""}` : null;
  }
  const normalized = normalizeText(value).replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "");
  return normalized ? `${dictionary}:${normalized}` : null;
}

function normalizeText(value: string): string {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ");
}
