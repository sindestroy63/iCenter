"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, ShoppingCart, Package, FolderTree, Tags, Circle, MapPin, Image, Star, Users, Settings, Files, Search, Menu, ExternalLink, ChevronDown, X, LogOut, UserRound } from "lucide-react";

type Role = "OWNER" | "ADMIN" | "DEVELOPER" | "CITY_MANAGER";
type City = { id?: string; slug: string; name: string };
export type SessionUser = { id: string; email: string; name: string | null; firstName: string | null; lastName: string | null; avatarMediaId: string | null; avatarUrl: string | null; role: Role; cities: City[] };
export const AdminUserContext = React.createContext<{ user: SessionUser | null; setUser: React.Dispatch<React.SetStateAction<SessionUser | null>> } | null>(null);

const nav = [["Главная", LayoutDashboard, "/admin"], ["Заявки", ShoppingCart, "/admin/requests"], ["Товары", Package, "/admin/products"], ["Категории", FolderTree, "/admin/categories"], ["Бренды", Tags, "/admin/brands"], ["Справочник", Circle, "/admin/dictionaries"], ["Типы товаров", Package, "/admin/product-types"], ["Города", MapPin, "/admin/cities"], ["Баннеры", Image, "/admin/banners"], ["Лучшие предложения", Star, "/admin/best-offers"], ["Сотрудники", Users, "/admin/employees"], ["Настройки сайта", Settings, "/admin/settings"], ["Медиа", Files, "/admin/media"]] as const;

function csrfToken() {
  const raw = document.cookie.split("; ").find((part) => part.startsWith("icenter_csrf="))?.slice("icenter_csrf=".length) ?? "";
  return decodeURIComponent(raw);
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [user, setUser] = React.useState<SessionUser | null>(null);
  const [city, setCity] = React.useState("");
  const [loggingOut, setLoggingOut] = React.useState(false);
  const [logoutError, setLogoutError] = React.useState("");
  const currentNav = nav.filter(([, , href]) => href !== "/admin/brands" && href !== "/admin/product-types");
  const isNavActive = (href: string) => pathname === href || (href !== "/admin" && pathname.startsWith(`${href}/`));
  const visibleNav = user?.role === "CITY_MANAGER" || !user
    ? currentNav.filter(([, , href]) => href === "/admin" || href === "/admin/requests" || href === "/admin/products")
    : currentNav;
  const active = visibleNav.find(([, , href]) => isNavActive(href)) ?? visibleNav[0];
  const activeTitle = pathname === "/admin/profile" ? "Мой профиль" : active[0];

  React.useEffect(() => {
    let activeRequest = true;
    fetch("/api/auth/session", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const payload = await response.json() as { user?: SessionUser };
      if (!activeRequest || !payload.user) return;
      setUser(payload.user);
      setCity((current) => current || payload.user?.cities[0]?.slug || "");
    }).catch(() => undefined);
    return () => { activeRequest = false; };
  }, []);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError("");
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", headers: { "x-csrf-token": csrfToken() } });
      if (!response.ok) throw new Error("Не удалось завершить сеанс. Повторите попытку.");
      router.replace("/admin/login");
      router.refresh();
    } catch (error) { setLogoutError(error instanceof Error ? error.message : "Не удалось завершить сеанс."); }
    finally { setLoggingOut(false); }
  }

  const cities = user?.cities ?? [];
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(" ") || user?.name || user?.email || "Сотрудник";
  return <AdminUserContext.Provider value={{ user, setUser }}><div className="admin-layout">
    <button className="admin-mobile-toggle" onClick={() => setOpen(true)} aria-label="Открыть меню"><Menu size={21} /></button>
    <aside className={`admin-side ${open ? "open" : ""}`}>
      <div className="admin-brand"><strong>iCenter</strong><span>Панель управления</span></div>
      <nav className="admin-nav">{visibleNav.map(([label, Icon, href]) => <Link className={isNavActive(href) ? "active" : ""} href={href} key={href} onClick={() => setOpen(false)}><Icon size={19} /><span>{href === "/admin/dictionaries" ? "Справочники" : label}</span></Link>)}</nav>
      <Link className="admin-site-link" href="/"><ExternalLink size={17} />Открыть сайт</Link>
    </aside>
    {open && <button className="admin-overlay" onClick={() => setOpen(false)} aria-label="Закрыть меню"><X size={22} /></button>}
    <div className="admin-main">
      <header className="admin-topbar">
        <div className="admin-top-title">{activeTitle}</div>
        <label className="search admin-search"><Search size={18} /><input placeholder="Поиск по товарам, заявкам, категориям..." /></label>
        {cities.length > 0 && <label className="admin-city"><MapPin size={14} /><select value={city} onChange={(event) => setCity(event.target.value)} aria-label="Город"><option value="">Все города</option>{cities.map((item) => <option value={item.slug} key={item.slug}>{item.name}</option>)}</select></label>}
        <details className="admin-user-menu"><summary className="admin-user-summary"><span className="admin-user-avatar">{user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : displayName.slice(0, 1).toUpperCase()}</span><span className="admin-user-meta"><strong>{displayName}</strong><small>{user?.role ?? ""}</small></span><ChevronDown size={15} /></summary><div className="admin-user-popover"><Link href="/admin/profile" onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}><UserRound size={16} />Мой профиль</Link><button type="button" disabled={loggingOut} onClick={logout}><LogOut size={16} />{loggingOut ? "Выход…" : "Выйти"}</button></div></details>
      </header>
      {logoutError && <p className="form-error" role="alert">{logoutError}</p>}
      {children}
    </div>
  </div></AdminUserContext.Provider>;
}
