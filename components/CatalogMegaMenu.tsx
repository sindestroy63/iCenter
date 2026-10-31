"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, LayoutGrid } from "lucide-react";
import { useStoreState } from "./StoreState";

type MenuItem = { id: string; title: string; description: string; href: string | null; children: MenuItem[]; banner?: { enabled: boolean; alt: string; description: string; imageUrl: string | null } | null };

function useCatalogMenu() {
  const { city } = useStoreState();
  const [items, setItems] = useState<MenuItem[]>([]);
  useEffect(() => { const controller = new AbortController(); fetch(`/api/catalog/menu?city=${encodeURIComponent(city)}`, { signal: controller.signal, cache: "no-store" }).then((response) => response.ok ? response.json() : Promise.reject()).then((body) => setItems(Array.isArray(body.data) ? body.data : [])).catch(() => undefined); return () => controller.abort(); }, [city]);
  return items;
}

function MenuCardVisual({ item, mobile = false }: { item: MenuItem; mobile?: boolean }) {
  const image = item.banner?.enabled && item.banner.imageUrl ? item.banner.imageUrl : null;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [image]);
  return <>{image && !imageFailed ? <img className={mobile ? "mobile-catalog-card-image" : "catalog-mega-card-image"} src={image} alt={item.banner?.alt ?? ""} onError={() => setImageFailed(true)} /> : <span className={mobile ? "mobile-catalog-card-fallback" : "catalog-mega-card-fallback"} aria-hidden="true" />}<span className={mobile ? "mobile-catalog-card-overlay" : "catalog-mega-card-overlay"} /><span className={mobile ? "mobile-catalog-card-title" : "catalog-mega-card-title"}>{item.title}</span>{item.children.length > 0 && <ChevronRight className={mobile ? "mobile-catalog-card-arrow" : "catalog-mega-card-arrow"} size={mobile ? 19 : 18} aria-hidden="true" />}</>;
}

function MenuChild({ item, close }: { item: MenuItem; close: () => void }) {
  if (item.href) return <Link role="menuitem" className="catalog-mega-card-child" href={item.href} onClick={close}>{item.title}<ChevronRight size={15} aria-hidden="true" /></Link>;
  return <span role="menuitem" aria-disabled="true" className="catalog-mega-card-child is-disabled">{item.title}<small>Нет товаров</small></span>;
}

function DesktopMenuCard({ item, active, activate, close }: { item: MenuItem; active: boolean; activate: () => void; close: () => void }) {
  const content = <MenuCardVisual item={item} />;
  const card = item.href ? <Link role="menuitem" className="catalog-mega-card" href={item.href} aria-haspopup={item.children.length > 0 ? "menu" : undefined} aria-expanded={item.children.length > 0 ? active : undefined} onMouseEnter={activate} onFocus={activate} onClick={close}>{content}</Link> : <button type="button" role="menuitem" className="catalog-mega-card" aria-disabled={item.children.length === 0} aria-haspopup={item.children.length > 0 ? "menu" : undefined} aria-expanded={item.children.length > 0 ? active : undefined} onMouseEnter={activate} onFocus={activate} onClick={activate}>{content}</button>;
  return <div className={`catalog-mega-card-shell${active ? " is-active" : ""}`} onMouseEnter={activate} onFocusCapture={activate}>{card}{item.children.length > 0 && <div className="catalog-mega-card-popover" role="menu" aria-label={`Подразделы ${item.title}`}>{item.href && <Link role="menuitem" className="catalog-mega-card-all" href={item.href} onClick={close}>Все товары раздела<ChevronRight size={15} aria-hidden="true" /></Link>}<nav>{item.children.map((child) => <MenuChild key={child.id} item={child} close={close} />)}</nav></div>}</div>;
}

export function DesktopCatalogMegaMenu() {
  const items = useCatalogMenu(); const [open, setOpen] = useState(false); const [active, setActive] = useState(""); const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null); const triggerRef = useRef<HTMLButtonElement>(null); const suppressFocusOpen = useRef(false);
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => { setOpen(false); setActive(""); }, 180); };
  useEffect(() => () => cancelClose(), []);
  useEffect(() => { if (!open) return; const close = (event: KeyboardEvent) => { if (event.key !== "Escape") return; suppressFocusOpen.current = true; setOpen(false); setActive(""); triggerRef.current?.focus(); window.setTimeout(() => { suppressFocusOpen.current = false; }, 0); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [open]);
  return <div className="catalog-mega-anchor" onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={scheduleClose} onFocusCapture={() => { if (!suppressFocusOpen.current) setOpen(true); }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleClose(); }}><button ref={triggerRef} type="button" className="catalog-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => { cancelClose(); setOpen(true); setActive(""); }}><LayoutGrid size={18} />Каталог<ChevronDown size={15} /></button>{open && <div className="catalog-mega-menu" role="menu" aria-label="Каталог товаров">{items.map((item) => <DesktopMenuCard key={item.id} item={item} active={active === item.id} activate={() => { cancelClose(); setActive(item.id); }} close={() => { setOpen(false); setActive(""); }} />)}</div>}</div>;
}

function MobileMenuCard({ item, expanded, toggle, close }: { item: MenuItem; expanded: boolean; toggle: () => void; close: () => void }) {
  const hasChildren = item.children.length > 0; const cardContent = <MenuCardVisual item={item} mobile />;
  return <article className={`mobile-catalog-card-shell${expanded ? " is-expanded" : ""}`}>{hasChildren ? <button type="button" className="mobile-catalog-card" aria-expanded={expanded} onClick={toggle}>{cardContent}</button> : item.href ? <Link className="mobile-catalog-card" href={item.href} onClick={close}>{cardContent}</Link> : <span className="mobile-catalog-card" aria-disabled="true">{cardContent}</span>}{hasChildren && expanded && <div className="mobile-catalog-card-panel">{item.href && <Link className="mobile-catalog-card-all" href={item.href} onClick={close}>Все товары раздела<ChevronRight size={16} aria-hidden="true" /></Link>}<nav aria-label={`Подразделы ${item.title}`}>{item.children.map((child) => child.href ? <Link key={child.id} href={child.href} onClick={close}>{child.title}<ChevronRight size={15} aria-hidden="true" /></Link> : <span key={child.id} aria-disabled="true">{child.title}<small>Нет товаров</small></span>)}</nav></div>}</article>;
}

export function MobileCatalogMenu({ close }: { close: () => void }) {
  const items = useCatalogMenu(); const [expanded, setExpanded] = useState("");
  return <div className="mobile-catalog-menu"><div className="mobile-catalog-heading"><LayoutGrid size={18} /><strong>Каталог</strong></div><div className="mobile-catalog-card-list">{items.map((item) => <MobileMenuCard key={item.id} item={item} expanded={expanded === item.id} toggle={() => setExpanded((value) => value === item.id ? "" : item.id)} close={close} />)}</div></div>;
}
