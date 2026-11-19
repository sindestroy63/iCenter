import StoreInfoPage from "@/components/StoreInfoPage";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageMetadata as buildPageMetadata } from "@/lib/page-metadata";

const pageMetadata: Record<string, { title: string; description: string }> = {
  about: { title: "О магазине", description: "Информация о магазине iCenter и его работе." },
  delivery: { title: "Доставка и получение", description: "Информация о способах получения и согласовании доставки товаров iCenter." },
  installment: { title: "Рассрочка", description: "Информация о заявке на рассрочку и уточнении условий у менеджера iCenter." },
  payment: { title: "Оплата", description: "Информация об оплате и согласовании условий покупки в iCenter." },
  privacy: { title: "Политика обработки персональных данных", description: "Условия обработки и хранения персональных данных в iCenter." },
  "personal-data-consent": { title: "Согласие на обработку персональных данных", description: "Условия согласия на обработку персональных данных при отправке заявки в iCenter." },
  "seller-info": { title: "Информация о продавце", description: "Сведения о продавце и контакты iCenter." },
  terms: { title: "Условия использования", description: "Правовая информация и условия использования сайта iCenter." },
  "trade-in": { title: "Trade-in", description: "Информация о заявке Trade-in и согласовании оценки устройства в iCenter." },
  warranty: { title: "Гарантия и поддержка", description: "Информация о гарантии и порядке обращения за поддержкой iCenter." },
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = pageMetadata[slug];
  return page ? buildPageMetadata(`/${slug}`, page.title, page.description) : { title: "Страница не найдена", robots: { index: false, follow: false } };
}

export default async function StoreInfoRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!pageMetadata[slug]) notFound();
  return <StoreInfoPage slug={slug} />;
}
