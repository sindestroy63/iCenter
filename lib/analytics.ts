import "server-only";
import { adminDb } from "@/lib/admin-db";

export type AnalyticsDashboard = {
  available: boolean;
  visitorsToday: number;
  viewsToday: number;
  requestsToday: number;
  days: Array<{ date: string; visitors: number }>;
  topProducts: Array<{ id: string; name: string; views: number }>;
};

const emptyDashboard = (requestsToday = 0): AnalyticsDashboard => ({
  available: false,
  visitorsToday: 0,
  viewsToday: 0,
  requestsToday,
  days: [],
  topProducts: [],
});

export async function getAnalyticsDashboard(): Promise<AnalyticsDashboard> {
  const db = adminDb();
  const table = await db.$queryRaw<Array<{ relation: string | null }>>`SELECT to_regclass('public.analytics_events')::text AS relation`;
  const requests = await db.$queryRaw<Array<{ count: number }>>`
    WITH bounds AS (
      SELECT date_trunc('day', NOW() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow' AS start_at
    )
    SELECT (
      (SELECT COUNT(*) FROM orders,bounds WHERE orders."createdAt" >= bounds.start_at) +
      (SELECT COUNT(*) FROM trade_in_requests,bounds WHERE trade_in_requests."createdAt" >= bounds.start_at)
    )::int AS count
  `;
  const requestsToday = Number(requests[0]?.count ?? 0);
  if (!table[0]?.relation) return emptyDashboard(requestsToday);

  const [today, days, topProducts] = await Promise.all([
    db.$queryRaw<Array<{ visitors: number; views: number }>>`
      WITH bounds AS (
        SELECT date_trunc('day', NOW() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow' AS start_at
      )
      SELECT COUNT(DISTINCT "visitorId")::int AS visitors,COUNT(*)::int AS views
      FROM analytics_events,bounds WHERE "createdAt" >= bounds.start_at
    `,
    db.$queryRaw<Array<{ date: string; visitors: number }>>`
      WITH days AS (
        SELECT generate_series(
          (NOW() AT TIME ZONE 'Europe/Moscow')::date - 6,
          (NOW() AT TIME ZONE 'Europe/Moscow')::date,
          INTERVAL '1 day'
        )::date AS day
      )
      SELECT days.day::text AS date,COUNT(DISTINCT events."visitorId")::int AS visitors
      FROM days LEFT JOIN analytics_events events
        ON (events."createdAt" AT TIME ZONE 'Europe/Moscow')::date=days.day
      GROUP BY days.day ORDER BY days.day
    `,
    db.$queryRaw<Array<{ id: string; name: string; views: number }>>`
      SELECT products.id,products.name,COUNT(*)::int AS views
      FROM analytics_events events JOIN products ON products.id=events."productId"
      WHERE events."createdAt" >= (((NOW() AT TIME ZONE 'Europe/Moscow')::date - 6) AT TIME ZONE 'Europe/Moscow')
      GROUP BY products.id,products.name ORDER BY views DESC,products.name LIMIT 5
    `,
  ]);
  return {
    available: true,
    visitorsToday: Number(today[0]?.visitors ?? 0),
    viewsToday: Number(today[0]?.views ?? 0),
    requestsToday,
    days: days.map((day) => ({ date: day.date, visitors: Number(day.visitors) })),
    topProducts: topProducts.map((product) => ({ ...product, views: Number(product.views) })),
  };
}
