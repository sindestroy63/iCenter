export type CatalogColor = {
  slug?: string | null;
  name?: string | null;
  nameRu?: string | null;
  hex?: string | null;
};

// Values mirror the current product-page swatches for finishes whose DB rows
// were imported without HEX. Stored HEX always takes precedence.
const COLOR_HEX_BY_SLUG: Record<string, string> = {
  burgundy: "#5A141D",
  glacier: "#A4C4CB",
  silver: "#E5E5E7",
  "night-sky": "#3C4042",
  "star-white": "#FAFAFA",
};

const COLOR_RU_BY_SLUG: Record<string, string> = {
  black: "Черный",
  "black-titanium": "Черный титан",
  blue: "Синий",
  "blue-titanium": "Синий титан",
  burgundy: "Бордовый",
  glacier: "Ледниковый",
  "natural-titanium": "Натуральный титан",
  pink: "Розовый",
  purple: "Фиолетовый",
  silver: "Серебристый",
  "night-sky": "Ночное небо",
  "star-white": "Звездный белый",
  titanium: "Титановый",
  white: "Белый",
  "white-titanium": "Белый титан",
};

const COLOR_EN_BY_SLUG: Record<string, string> = {
  black: "Black",
  "black-titanium": "Black Titanium",
  blue: "Blue",
  "blue-titanium": "Blue Titanium",
  burgundy: "Burgundy",
  glacier: "Glacier",
  "natural-titanium": "Natural Titanium",
  pink: "Pink",
  purple: "Purple",
  silver: "Silver",
  "night-sky": "Night Sky",
  "star-white": "Star White",
  titanium: "Titanium",
  white: "White",
  "white-titanium": "White Titanium",
};

function colorSlug(color: CatalogColor) {
  return (color.slug || color.name || "")
    .trim()
    .toLocaleLowerCase("en-US")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function catalogColorHex(color: CatalogColor): string | null {
  const stored = color.hex?.trim();
  if (stored && /^#[0-9a-f]{6}$/i.test(stored)) return stored.toUpperCase();
  return COLOR_HEX_BY_SLUG[colorSlug(color)] ?? null;
}

export function catalogColorNames(color: CatalogColor): { primary: string; secondary: string | null } {
  const slug = colorSlug(color);
  const storedName = color.name?.trim() ?? "";
  const translated = color.nameRu?.trim() || COLOR_RU_BY_SLUG[slug] || "";
  const original = storedName && storedName.localeCompare(translated, "ru", { sensitivity: "accent" }) !== 0 ? storedName : COLOR_EN_BY_SLUG[slug] || storedName;
  const primary = original || translated || "Цвет не указан";
  const secondary = original && translated && original.localeCompare(translated, "ru", { sensitivity: "accent" }) !== 0 ? translated : null;
  return { primary, secondary };
}

export function catalogColorLabel(color: CatalogColor): string {
  const { primary, secondary } = catalogColorNames(color);
  return secondary ? `${primary} ${secondary}` : primary;
}

export function catalogColorDetails(color: CatalogColor): string {
  const { primary, secondary } = catalogColorNames(color);
  return secondary ? `${primary}\n${secondary}` : primary;
}
