const transliteration: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function productSlugBase(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/[а-яё]/g, (char) => transliteration[char] ?? "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "product";
}

export function productSlugCandidate(base: string, index: number) {
  return index === 0 ? base : `${base}-${index + 1}`;
}

export async function allocateProductSlug(name: string, reserveIfAvailable: (candidate: string) => Promise<boolean>) {
  const base = productSlugBase(name);
  for (let index = 0; index < 10000; index += 1) {
    const candidate = productSlugCandidate(base, index);
    if (await reserveIfAvailable(candidate)) return candidate;
  }
  throw new Error("DUPLICATE_SLUG");
}

export type SlugAlias = { slug: string; productId: string };

export function parseSlugAliases(value: unknown): SlugAlias[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const aliases = (value as { aliases?: unknown }).aliases;
  if (!Array.isArray(aliases)) return [];
  return aliases.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const alias = entry as Record<string, unknown>;
    return typeof alias.slug === "string" && /^[a-z0-9][a-z0-9-]{0,159}$/.test(alias.slug) && typeof alias.productId === "string" ? [{ slug: alias.slug, productId: alias.productId }] : [];
  });
}
