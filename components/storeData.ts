export type StoreVariant = {
  id: string;
  color?: string;
  memory?: string;
  sim?: string;
  ram?: string;
  connectivity?: string;
};

export type StoreProduct = {
  slug: string;
  name: string;
  image: string;
  detail: string;
  category: string;
  brand: string;
  type: string;
  colors?: { label: string; value: string; image: string }[];
  memory?: string[];
  sim?: string[];
  variants: StoreVariant[];
  images: string[];
  description: string;
};
export const storeDataMode = "local-demo" as const;

const iphoneColors = [
  { label: "Натуральный титан", value: "#c9b9ab", image: "/assets/iphone.png" },
  { label: "Чёрный титан", value: "#252525", image: "/assets/iphone-max.png" },
  { label: "Белый титан", value: "#f3f3f3", image: "/assets/iphone.png" },
  { label: "Синий титан", value: "#26374d", image: "/assets/hero.png" },
];

const iphoneVariants: StoreVariant[] = [
  { id: "local-demo:iphone-18-pro-natural-128-esim", color: "Натуральный титан", memory: "128 ГБ", sim: "eSIM" },
  { id: "local-demo:iphone-18-pro-natural-256-esim", color: "Натуральный титан", memory: "256 ГБ", sim: "eSIM" },
  { id: "local-demo:iphone-18-pro-natural-256-dual", color: "Натуральный титан", memory: "256 ГБ", sim: "eSIM + физическая SIM" },
  { id: "local-demo:iphone-18-pro-black-256-esim", color: "Чёрный титан", memory: "256 ГБ", sim: "eSIM" },
  { id: "local-demo:iphone-18-pro-white-512-esim", color: "Белый титан", memory: "512 ГБ", sim: "eSIM" },
  { id: "local-demo:iphone-18-pro-blue-512-dual", color: "Синий титан", memory: "512 ГБ", sim: "eSIM + физическая SIM" },
];

export const products: StoreProduct[] = [
  {
    slug: "iphone-18-pro",
    name: "iPhone 18 Pro",
    image: "/assets/iphone.png",
    detail: "Варианты памяти и SIM",
    category: "Смартфоны",
    brand: "Apple",
    type: "Смартфоны",
    colors: iphoneColors,
    memory: ["128 ГБ", "256 ГБ", "512 ГБ"],
    sim: ["eSIM", "eSIM + физическая SIM"],
    variants: iphoneVariants,
    images: ["/assets/iphone.png", "/assets/hero.png", "/assets/iphone-max.png"],
    description: "Профессиональная камера, титановый корпус и интеллектуальные функции для ежедневных задач.",
  },
  {
    slug: "iphone-18-pro-max",
    name: "iPhone 18 Pro Max",
    image: "/assets/iphone-max.png",
    detail: "Варианты и наличие уточняются",
    category: "Смартфоны",
    brand: "Apple",
    type: "Смартфоны",
    variants: [],
    images: ["/assets/iphone-max.png", "/assets/iphone.png"],
    description: "Информация о характеристиках и доступных комбинациях уточняется для выбранного города.",
  },
  {
    slug: "macbook-air-13",
    name: "MacBook Air 13\"",
    image: "/assets/macbook.png",
    detail: "Типы товаров",
    category: "Ноутбуки",
    brand: "Apple",
    type: "Ноутбуки",
    variants: [],
    images: ["/assets/macbook.png"],
    description: "Доступные конфигурации и цена зависят от наличия в выбранном городе.",
  },
  {
    slug: "ipad-pro-13",
    name: "iPad Pro 13\"",
    image: "/assets/ipad.png",
    detail: "Лучшие предложения",
    category: "Планшеты",
    brand: "Apple",
    type: "Планшет",
    variants: [],
    images: ["/assets/ipad.png"],
    description: "Доступные конфигурации и цена зависят от наличия в выбранном городе.",
  },
  {
    slug: "dyson-v15-detect",
    name: "Dyson V15 Detect",
    image: "/assets/dyson.png",
    detail: "Настройки сайта",
    category: "Бытовая техника",
    brand: "Dyson",
    type: "Пылесос",
    variants: [],
    images: ["/assets/dyson.png"],
    description: "Цена и доступность уточняются для выбранного города.",
  },
  {
    slug: "playstation-5",
    name: "PlayStation 5",
    image: "/assets/ps.png",
    detail: "Открыть сайт",
    category: "Игровые консоли",
    brand: "Sony",
    type: "Игровая консоль",
    variants: [],
    images: ["/assets/ps.png"],
    description: "Цена и доступность уточняются для выбранного города.",
  },
];

export function getProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}

export function getVariant(product: StoreProduct, selection: Partial<StoreVariant> = {}) {
  return product.variants.find((variant) =>
    Object.entries(selection).every(([key, value]) => !value || variant[key as keyof StoreVariant] === value),
  ) ?? product.variants[0];
}

export const cities = [
  { slug: "samara", name: "Самара" },
  { slug: "moscow", name: "Москва" },
  { slug: "saint-petersburg", name: "Санкт-Петербург" },
  { slug: "orenburg", name: "Оренбург" },
] as const;

