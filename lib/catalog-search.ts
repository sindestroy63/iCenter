const synonymGroups = [
  ["айфон", "айфоны", "iphone", "iphones", "телефон", "телефоны", "смартфон", "смартфоны"],
  ["самсунг", "samsung", "galaxy", "галакси"],
  ["макбук", "макбуки", "macbook", "mac book", "ноутбук", "ноутбуки", "laptop"],
  ["айпад", "ipad", "планшет", "планшеты"],
  ["аирподс", "эйрподс", "airpods", "наушники"],
  ["эпл вотч", "эплвотч", "apple watch", "watch", "часы", "смарт часы", "smartwatch", "smart watch"],
  ["pro", "про"],
  ["max", "макс"],
  ["esim", "e sim", "е сим", "есим"],
];

export function normalizeCatalogSearchQuery(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/(\d+(?:[.,]\d+)?)\s*(tb|тб|t)(?![a-zа-я])/gi, (_, amount: string) => `${Math.round(Number(amount.replace(",", ".")) * 1024)}gb`)
    .replace(/(\d+(?:[.,]\d+)?)\s*(gb|гб|g)(?![a-zа-я])/gi, (_, amount: string) => `${Number(amount.replace(",", "."))}gb`)
    .replace(/\bmac\s+book\b/g, "macbook")
    .replace(/\be\s+sim\b/g, "esim")
    .replace(/(^|\s)е\s+сим(?=\s|$)/g, "$1есим")
    .replace(/[^a-z0-9а-я]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function capacityAliases(token: string) {
  const match = token.match(/^(\d+)gb$/);
  if (!match) return [];
  const gigabytes = Number(match[1]);
  const aliases = [token, `${gigabytes} gb`, `${gigabytes}gb`, `${gigabytes}гб`, `${gigabytes} гб`];
  if (gigabytes % 1024 === 0) {
    const terabytes = gigabytes / 1024;
    aliases.push(`${terabytes} tb`, `${terabytes}tb`, `${terabytes}тб`, `${terabytes} тб`);
  }
  return aliases;
}

export function catalogSearchTokenGroups(value: string) {
  const normalized = normalizeCatalogSearchQuery(value);
  if (!normalized) return [];
  return normalized.split(" ").map((token) => {
    const aliases = new Set([token, ...capacityAliases(token)]);
    for (const group of synonymGroups) {
      const normalizedAliases = group.map(normalizeCatalogSearchQuery);
      if (!normalizedAliases.includes(token)) continue;
      for (const alias of normalizedAliases) aliases.add(alias);
    }
    return Array.from(aliases);
  });
}

const modelFamilies = new Set([
  "iphone", "айфон", "samsung", "самсунг", "galaxy", "галакси", "macbook", "макбук",
  "ipad", "айпад", "airpods", "аирподс", "эйрподс", "watch", "playstation", "dyson", "marshall",
]);
const modelQualifiers = new Set(["pro", "про", "max", "макс", "plus", "ultra", "air", "mini", "lite", "fe"]);

export function catalogSearchModelTokenGroups(value: string) {
  const normalized = normalizeCatalogSearchQuery(value);
  if (!normalized) return [];
  const tokens = normalized.split(" ");
  const hasFamily = tokens.some((token) => modelFamilies.has(token));
  const hasQualifier = tokens.some((token) => modelQualifiers.has(token));
  const hasModelNumber = tokens.some((token) => /^\d{2,4}$/.test(token));
  const hasModelCode = tokens.some((token) => /^[a-zа-я]{1,3}\d{1,4}$/i.test(token) && !/^a\d+$/i.test(token));
  if (!hasFamily && !(hasQualifier && (hasModelNumber || hasModelCode))) return [];
  return catalogSearchTokenGroups(normalized).filter((_group, index) => {
    const token = tokens[index];
    return modelFamilies.has(token) || modelQualifiers.has(token) || /^\d{2,4}$/.test(token) || /^[a-zа-я]{1,3}\d{1,4}$/i.test(token);
  });
}

export function catalogSearchProductIdentityMatches(text: string, query: string) {
  const groups = catalogSearchModelTokenGroups(query);
  if (!groups.length) return true;
  const padded = ` ${normalizeCatalogSearchQuery(text)} `;
  return groups.every((aliases) => aliases.some((alias) => padded.includes(` ${normalizeCatalogSearchQuery(alias)} `)));
}

export function catalogSearchTextMatches(text: string, query: string) {
  const haystack = normalizeCatalogSearchQuery(text);
  return catalogSearchTokenGroups(query).every((aliases) =>
    aliases.some((alias) => haystack.includes(normalizeCatalogSearchQuery(alias))),
  );
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
