import Link from "next/link";

export default function NotFound() {
  return (
    <main className="not-found-page">
      <h1 className="not-found-visually-hidden">404. Страница не найдена</h1>
      <p className="not-found-visually-hidden">
        Похоже, вы перешли по неверной ссылке или страница была перемещена.
      </p>
      <div className="not-found-content">
        <div className="not-found-art">
          <img src="/images/icenter-original-404.png" alt="" draggable={false} />
          <Link className="not-found-hotspot not-found-hotspot-home" href="/" aria-label="Перейти на главную" />
          <Link className="not-found-hotspot not-found-hotspot-catalog" href="/catalog" aria-label="Каталог" />
        </div>
        <nav className="not-found-mobile-actions" aria-label="Навигация со страницы ошибки">
          <Link href="/">Перейти на главную</Link>
          <Link href="/catalog">Каталог</Link>
        </nav>
      </div>
    </main>
  );
}
