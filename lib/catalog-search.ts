const synonymGroups = [
  ["айфон", "айфоны", "iphone", "iphones", "телефон", "телефоны", "смартфон", "смартфоны"],
  ["самсунг", "samsung", "galaxy", "галакси"],
  ["макбук", "макбуки", "macbook", "mac book", "ноутбук", "ноутбуки", "laptop"],
  ["айпад", "ipad", "планшет", "планшеты"],
  ["аирподс", "эйрподс", "airpods", "наушники"],
  ["эпл вотч", "эплвотч", "apple watch", "watch", "часы", "смарт часы", "smartwatch", "smart watch"],
];

export function normalizeCatalogSearchQuery(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^a-z0-9а-я]+/g, " ").trim().replace(/\s+/g, " ");
}

export function expandCatalogSearchQuery(value: string) {
  const normalized = normalizeCatalogSearchQuery(value);
  if (!normalized) return [];
  const queries = new Set([normalized]);
  for (const group of synonymGroups) {
    for (const candidate of Array.from(queries)) {
      for (const alias of group) {
        const padded = ` ${candidate} `;
        if (!padded.includes(` ${alias} `)) continue;
        for (const synonym of group) {
          queries.add(padded.replace(` ${alias} `, ` ${synonym} `).trim());
          if (queries.size >= 40) break;
        }
        if (queries.size >= 40) break;
      }
      if (queries.size >= 40) break;
    }
    if (queries.size >= 40) break;
  }
  return Array.from(queries);
}
