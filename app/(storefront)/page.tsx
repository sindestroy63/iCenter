import HomeCatalog from "@/components/HomeCatalog";

const brands = [
  { name: "Apple", desc: "iPhone, iPad и Mac", filter: "Apple", tone: "apple", placement: "home_brand_apple" as const },
  { name: "Samsung", desc: "Galaxy и планшеты", filter: "Samsung", tone: "samsung", placement: "home_brand_samsung" as const },
  { name: "Dyson", desc: "Техника для дома", filter: "Dyson", tone: "dyson", placement: "home_brand_dyson" as const },
  { name: "PlayStation", desc: "Консоли и игры", filter: "Sony", tone: "playstation", placement: "home_brand_playstation" as const },
];

export default function Home() {
  return <div className="layout-container home-content">
    <HomeCatalog brands={brands} />
  </div>;
}
