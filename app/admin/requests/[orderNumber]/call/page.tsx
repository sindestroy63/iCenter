import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import AdminOrderCallActions from "@/components/AdminOrderCallActions";
import { requireRequestSession } from "@/lib/auth";
import { getRequest, RequestError } from "@/lib/request-service";

export const dynamic = "force-dynamic";

export default async function AdminOrderCallPage({ params }: { params: { orderNumber: string } }) {
  const session = await requireRequestSession();
  let order: Awaited<ReturnType<typeof getRequest>>;
  try {
    order = await getRequest({ userId: session.userId, role: session.role }, params.orderNumber);
  } catch (error) {
    if (error instanceof RequestError && (error.status === 403 || error.status === 404)) notFound();
    throw error;
  }

  return <section className="admin-content admin-order-call-page">
    <Link className="admin-order-call-back" href={`/admin/requests?request=${encodeURIComponent(order.id)}`}>
      <ArrowLeft size={16} aria-hidden="true" />К заявке
    </Link>
    <article className="panel admin-order-call-card">
      <header>
        <span>Заявка {order.id}</span>
        <h1>Связаться с клиентом</h1>
        <p>{order.name || "Имя не указано"} · {order.city}</p>
      </header>
      <code>{order.phone}</code>
      <AdminOrderCallActions phone={order.phone} />
    </article>
  </section>;
}
