export const CASH_PRICE_NOTICE = "Цена указана за наличный расчёт со скидкой для выбранного города и варианта.";
export const APPLE_RUSTORE_NOTICE = "Товар имеет недостаток в виде невозможности предустановки RuStore.";

export function requiresRuStoreNotice(brand: { slug?: string | null; name?: string | null }) {
  const values = [brand.slug, brand.name].map((value) => value?.trim().toLocaleLowerCase("ru-RU") ?? "");
  return values.some((value) => value === "apple" || value === "iphone" || value === "samsung");
}

export default function ProductPriceNotice({ brand }: { brand: { slug?: string | null; name?: string | null } }) {
  return <div className="product-price-notices"><p>{CASH_PRICE_NOTICE}</p>{requiresRuStoreNotice(brand) && <p className="apple-rustore-notice">{APPLE_RUSTORE_NOTICE}</p>}</div>;
}
