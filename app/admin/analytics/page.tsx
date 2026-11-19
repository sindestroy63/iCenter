import { BarChart3, Eye, ShoppingCart, Users } from "lucide-react";
import { requireGlobalAdminSession } from "@/lib/auth";
import { getAnalyticsDashboard } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await requireGlobalAdminSession();
  const data = await getAnalyticsDashboard();
  const maximum = Math.max(1, ...data.days.map((day) => day.visitors));
  const metrics = [
    { label: "Уникальные посетители сегодня", value: data.visitorsToday, icon: Users },
    { label: "Просмотры страниц сегодня", value: data.viewsToday, icon: Eye },
    { label: "Заявки сегодня", value: data.requestsToday, icon: ShoppingCart },
  ];
  return <div className="admin-content analytics-page">
    <header className="admin-page-heading"><div><h1>Аналитика</h1><p>Посещаемость сайта и интерес к товарам</p></div></header>
    {!data.available && <div className="panel analytics-unavailable" role="status"><BarChart3 size={20} /><div><strong>Сбор статистики ещё не включён</strong><p>Примените подготовленную миграцию аналитики в локальной базе.</p></div></div>}
    <div className="analytics-metrics">{metrics.map(({ label,value,icon:Icon }) => <section className="panel analytics-metric" key={label}><span><Icon size={17} />{label}</span><strong>{value.toLocaleString("ru-RU")}</strong></section>)}</div>
    <div className="analytics-grid">
      <section className="panel analytics-chart-panel"><header><h2>Посетители за 7 дней</h2></header>{data.days.length ? <div className="analytics-chart" aria-label="График посетителей за последние семь дней">{data.days.map((day) => <div className="analytics-chart-column" key={day.date}><div className="analytics-chart-value">{day.visitors}</div><div className="analytics-chart-track"><span style={{ height: `${Math.max(day.visitors ? 8 : 0,(day.visitors / maximum) * 100)}%` }} /></div><small>{new Intl.DateTimeFormat("ru-RU",{ weekday:"short",day:"2-digit" }).format(new Date(`${day.date}T12:00:00`))}</small></div>)}</div> : <p className="analytics-empty">Данные появятся после первых согласованных посещений.</p>}</section>
      <section className="panel analytics-products"><header><h2>Популярные товары за 7 дней</h2></header>{data.topProducts.length ? <ol>{data.topProducts.map((product) => <li key={product.id}><span><strong>{product.name}</strong><small>{product.id}</small></span><b>{product.views.toLocaleString("ru-RU")}</b></li>)}</ol> : <p className="analytics-empty">Просмотров карточек товаров пока нет.</p>}</section>
    </div>
  </div>;
}
