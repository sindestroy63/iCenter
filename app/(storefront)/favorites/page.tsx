import FavoritesView from "@/components/FavoritesView";

export default function FavoritesPage() {
  return <FavoritesView />;
}
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Избранное", robots: { index: false, follow: false } };
