import Link from "next/link";
import { ArrowRight, Image, Package, Plus, ShoppingCart, Tag } from "lucide-react";
import { requireRequestSession } from "@/lib/auth";
import { getRequestDashboard } from "@/lib/request-service";

const statusLabels: Record<string, string> = {
  NEW: "Новая",
  PROCESSING: "В обработке",
  CONFIRMED: "Подтверждена",
  SHIPPING: "Доставка",
  COMPLETED: "Завершена",
  CANCELLED: "Отменена",
};

export default async function Admin() {
  const session = await requireRequestSession();
  const isCityManager = session.role === "CITY_MANAGER";
  const dashboard = await getRequestDashboard({ userId: session.userId, role: session.role });
  const money = (amount: number) => `${amount.toLocaleString("ru-RU")} ₽`;
  const metrics = [
    ["Всего заявок", dashboard.total],
    ["Новые заявки", dashboard.newCount],
    ["Заявки в работе", dashboard.inProgress],
    ["Завершённые заявки", dashboard.completed],
    ["Сумма заявок", money(dashboard.amount)],
  ] as const;

  return <div className="admin-content">
    <div className="admin-heading"><h1>Панель управления</h1><p>Данные каталога и заявок</p></div>
    <div className="metrics">
      {metrics.map(([label, value]) => <section className="metric" key={label}><span className="metric-label">{label}</span><div className="metric-value">{value}</div></section>)}
    </div>
    <div className="admin-grid">
      <section className="panel">
        <div className="panel-heading"><h2>Последние заявки</h2><Link className="all-requests-link" href="/admin/requests"><span>Все заявки</span><ArrowRight size={15}/></Link></div>
        {dashboard.recent.length ? <div className="workspace-table"><table className="table"><thead><tr><th>Номер</th><th>Дата</th><th>Клиент</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>
          {dashboard.recent.map((request) => <tr key={request.id}>
            <td><Link href={`/admin/requests?request=${encodeURIComponent(request.id)}`}>{request.id}</Link></td>
            <td>{new Date(request.createdAt).toLocaleString("ru-RU")}</td>
            <td>{request.name || "Не указано"}</td>
            <td>{money(request.total)}</td>
            <td><span className="request-status-badge" data-status={request.status}>{statusLabels[request.status] ?? request.status}</span></td>
          </tr>)}
        </tbody></table></div> : <p>Заявок пока нет.</p>}
      </section>
      <section className="panel"><h2>Быстрые действия</h2><div className="quick-list">
        {!isCityManager && <Link className="quick" href="/admin/products"><span><Plus size={17}/>Добавить товар</span><ArrowRight size={18}/></Link>}
        {!isCityManager && <Link className="quick" href="/admin/categories"><span><Tag size={17}/>Категории</span><ArrowRight size={18}/></Link>}
        {!isCityManager && <Link className="quick" href="/admin/banners"><span><Image size={17}/>Баннеры</span><ArrowRight size={18}/></Link>}
        <Link className="quick" href="/admin/requests"><span><ShoppingCart size={17}/>Заявки</span><ArrowRight size={18}/></Link>
        {!isCityManager && <Link className="quick" href="/admin/products"><span><Package size={17}/>Каталог товаров</span><ArrowRight size={18}/></Link>}
      </div></section>
    </div>
  </div>;
}
