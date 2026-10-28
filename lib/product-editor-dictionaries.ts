export type DictionarySelectionMap = Record<string, string | null>;

export function restoreDictionarySelections(value: unknown): DictionarySelectionMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].length > 0));
}

export function updateDictionarySelection(current: DictionarySelectionMap, code: string, optionId: string): DictionarySelectionMap {
  return { ...current, [code]: optionId || null };
}

export function validateProductEditorRequiredFields(value: { name: string; brandId: string; productTypeId: string; categoryId: string; slug: string; variantCount: number }): string | null {
  if (!value.name.trim() || !value.brandId || !value.productTypeId || !value.categoryId || !value.slug.trim()) return "Заполните название, slug, бренд, тип и категорию.";
  if (value.variantCount < 1) return "Добавьте хотя бы один вариант товара.";
  return null;
}

export function canManageDictionaries(role: string): boolean {
  return role === "OWNER" || role === "ADMIN" || role === "DEVELOPER";
}
