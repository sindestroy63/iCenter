const HIDDEN_PUBLIC_VARIANT_ATTRIBUTES = new Set([
  "region",
  "model",
  "productModel",
  "productLine",
  "displaySize",
  "screenSize",
  "diagonal",
  "диагональ",
]);

const PUBLIC_ATTRIBUTE_KEYS: Record<string, string> = {
  memory: "storage",
  sim: "simType",
};

export type PublicVariantDictionaryValue = { code: string; label: string; name?: string };

export function publicVariantAttributeKey(code: string): string {
  return PUBLIC_ATTRIBUTE_KEYS[code] ?? code;
}

export function buildPublicVariantAttributes(
  rawAttributes: unknown,
  specialized: Record<string, string | null | undefined>,
  dictionaryValues: readonly PublicVariantDictionaryValue[] = [],
): Record<string, unknown> {
  const attributes = rawAttributes && typeof rawAttributes === "object" && !Array.isArray(rawAttributes)
    ? { ...(rawAttributes as Record<string, unknown>) }
    : {};

  for (const key of Object.keys(attributes)) {
    if (HIDDEN_PUBLIC_VARIANT_ATTRIBUTES.has(key)) delete attributes[key];
  }
  for (const [key, value] of Object.entries(specialized)) {
    if (value) attributes[key] = value;
  }
  for (const entry of dictionaryValues) {
    if (entry.code === "color" || entry.code === "region") continue;
    attributes[publicVariantAttributeKey(entry.code)] = entry.label;
  }
  return attributes;
}

export function buildPublicVariantAttributeLabels(
  dictionaryValues: readonly PublicVariantDictionaryValue[] = [],
): Record<string, string> {
  return Object.fromEntries(
    dictionaryValues
      .filter((entry) => entry.name && entry.code !== "color" && entry.code !== "region")
      .map((entry) => [publicVariantAttributeKey(entry.code), entry.name!]),
  );
}
