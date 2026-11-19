import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "iCenter",
    short_name: "iCenter",
    description: "Каталог техники и аксессуаров iCenter",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#101820",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
