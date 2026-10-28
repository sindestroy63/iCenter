import { catalogColorNames, type CatalogColor } from "@/lib/catalog-colors";

export default function ColorName({ color, compact = false, className = "" }: { color: CatalogColor; compact?: boolean; className?: string }) {
  const names = catalogColorNames(color);
  return <span className={`color-name${compact ? " color-name-compact" : ""}${className ? ` ${className}` : ""}`}>
    <span className="color-name-primary">{names.primary}</span>
    {names.secondary && <span className="color-name-secondary">{names.secondary}</span>}
  </span>;
}
