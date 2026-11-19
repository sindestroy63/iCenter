import StoreInfoPage from "@/components/StoreInfoPage";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/page-metadata";

const legalPages: Record<string, { title: string; description: string }> = {
  privacy: { title: "Политика обработки персональных данных", description: "Правила обработки персональных данных iCenter." },
  "personal-data-consent": { title: "Согласие на обработку персональных данных", description: "Условия согласия на обработку персональных данных в iCenter." },
  terms: { title: "Условия использования", description: "Условия использования сайта iCenter." },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = legalPages[slug];
  return page ? pageMetadata(`/${slug}`, page.title, page.description) : { title: "Документ не найден", robots: { index: false, follow: false } };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!legalPages[slug]) notFound();
  return <StoreInfoPage slug={slug} />;
}
