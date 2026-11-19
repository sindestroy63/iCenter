import StoreInfoPage from "@/components/StoreInfoPage";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata } from "@/lib/page-metadata";

const legalPages: Record<string, { title: string; description: string }> = {
  privacy: { title: "Политика обработки персональных данных", description: "Правила обработки персональных данных iCenter." },
  "personal-data-consent": { title: "Согласие на обработку персональных данных", description: "Условия согласия на обработку персональных данных в iCenter." },
  terms: { title: "Условия использования", description: "Условия использования сайта iCenter." },
};

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const page = legalPages[params.slug];
  return page ? pageMetadata(`/${params.slug}`, page.title, page.description) : { title: "Документ не найден", robots: { index: false, follow: false } };
}

export default function LegalPage({ params }: { params: { slug: string } }) {
  if (!legalPages[params.slug]) notFound();
  return <StoreInfoPage slug={params.slug} />;
}
