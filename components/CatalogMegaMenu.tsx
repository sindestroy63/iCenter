"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, LayoutGrid } from "lucide-react";
import { useStoreState } from "./StoreState";

type MenuItem = { id: string; title: string; description: string; href: string | null; children: MenuItem[]; banner?: { enabled: boolean; alt: string; description: string; imageUrl: string | null } | null; promoBanner?: { enabled: boolean; alt: string; description: string; imageUrl: string | null } | null };

function useCatalogMenu() {
  const { city } = useStoreState();
  const [items, setItems] = useState<MenuItem[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/catalog/menu?city=${encodeURIComponent(city)}`, { signal: controller.signal, cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((body) => setItems(Array.isArray(body.data) ? body.data : []))
      .catch(() => undefined);
    return () => controller.abort();
  }, [city]);
  return items;
}

function MenuCardVisual({ item, mobile = false }: { item: MenuItem; mobile?: boolean }) {
  const imageSource = item.promoBanner?.enabled && item.promoBanner.imageUrl ? item.promoBanner : item.banner;
  const image = imageSource?.enabled && imageSource.imageUrl ? imageSource.imageUrl : null;
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [image]);
  return <>{image && !imageFailed ? <img className={mobile ? "mobile-catalog-card-image" : "catalog-mega-card-image"} src={image} alt={imageSource?.alt ?? ""} onError={() => setImageFailed(true)} /> : <span className={mobile ? "mobile-catalog-card-fallback" : "catalog-mega-card-fallback"} aria-hidden="true" />}<span className={mobile ? "mobile-catalog-card-overlay" : "catalog-mega-card-overlay"} /><span className={mobile ? "mobile-catalog-card-title" : "catalog-mega-card-title"}>{item.title}</span>{item.children.length > 0 && <ChevronRight className={mobile ? "mobile-catalog-card-arrow" : "catalog-mega-card-arrow"} size={mobile ? 19 : 18} aria-hidden="true" />}</>;
}

function DesktopChild({ item, selected, select, close }: { item: MenuItem; selected: boolean; select: () => void; close: () => void }) {
  if (item.children.length > 0 && item.href) return <div className={`catalog-mega-card-child-row${selected ? " is-selected" : ""}`} onMouseEnter={() => { if (!selected) select(); }} onFocusCapture={() => { if (!selected) select(); }}>
    <Link role="menuitem" className="catalog-mega-card-child" href={item.href} onClick={close}>{item.title}</Link>
    <button type="button" className="catalog-mega-card-child-toggle" aria-label={`Показать подразделы: ${item.title}`} aria-haspopup="menu" aria-expanded={selected} onClick={select}><ChevronRight size={15} aria-hidden="true" /></button>
  </div>;
  if (item.children.length > 0) return <button type="button" role="menuitem" className={`catalog-mega-card-child catalog-mega-card-child-button${selected ? " is-selected" : ""}`} aria-haspopup="menu" aria-expanded={selected} onClick={select}>{item.title}<ChevronRight size={15} aria-hidden="true" /></button>;
  return item.href ? <Link role="menuitem" className="catalog-mega-card-child" href={item.href} onClick={close}>{item.title}<ChevronRight size={15} aria-hidden="true" /></Link> : <span role="menuitem" aria-disabled="true" className="catalog-mega-card-child is-disabled">{item.title}<small>Нет товаров</small></span>;
}

function DesktopMenuCard({ item, active, selectedChild, activate, hover, selectChild, close }: { item: MenuItem; active: boolean; selectedChild: string; activate: () => void; hover: () => void; selectChild: (id: string) => void; close: () => void }) {
  const content = <MenuCardVisual item={item} />;
  const card = item.href ? <Link role="menuitem" className="catalog-mega-card" href={item.href} aria-haspopup={item.children.length ? "menu" : undefined} aria-expanded={item.children.length ? active : undefined} onClick={close}>{content}</Link> : item.children.length > 0 ? <button type="button" role="menuitem" className="catalog-mega-card" aria-haspopup="menu" aria-expanded={active} onClick={activate}>{content}</button> : <button type="button" role="menuitem" className="catalog-mega-card" aria-disabled="true" disabled>{content}</button>;
  return <div className={`catalog-mega-card-shell${active ? " is-active" : ""}`} onMouseEnter={hover} onFocusCapture={(event) => { if (event.target === event.currentTarget.firstElementChild) hover(); }}>
    {card}
    {item.children.length > 0 && <div className={`catalog-mega-card-popover${selectedChild ? " has-tertiary" : ""}`} role="menu" aria-label={`Подразделы ${item.title}`}>
      <div className="catalog-mega-card-level">
        {item.href && <Link role="menuitem" className="catalog-mega-card-all" href={item.href} onClick={close}>Все товары раздела<ChevronRight size={15} aria-hidden="true" /></Link>}
        <nav>{item.children.map((child) => <DesktopChild key={child.id} item={child} selected={selectedChild === child.id} select={() => selectChild(child.id)} close={close} />)}</nav>
      </div>
      {selectedChild && (() => { const child = item.children.find((entry) => entry.id === selectedChild); if (!child) return null; return <div className="catalog-mega-card-level catalog-mega-card-tertiary" role="menu" aria-label={child.title}>
        {child.href && <Link role="menuitem" className="catalog-mega-card-all" href={child.href} onClick={close}>Все товары: {child.title}<ChevronRight size={15} aria-hidden="true" /></Link>}
        <nav>{child.children.map((model) => model.href ? <Link key={model.id} role="menuitem" className="catalog-mega-card-child" href={model.href} onClick={close}>{model.title}<ChevronRight size={15} aria-hidden="true" /></Link> : <span key={model.id} role="menuitem" aria-disabled="true" className="catalog-mega-card-child is-disabled">{model.title}<small>Нет товаров</small></span>)}</nav>
      </div>; })()}
    </div>}
  </div>;
}

export function DesktopCatalogMegaMenu() {
  const items = useCatalogMenu();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");
  const [selectedChild, setSelectedChild] = useState("");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const suppressFocusOpen = useRef(false);
  const cancelClose = () => { if (closeTimer.current) clearTimeout(closeTimer.current); };
  const scheduleClose = () => { cancelClose(); closeTimer.current = setTimeout(() => { setOpen(false); setActive(""); setSelectedChild(""); }, 260); };
  useEffect(() => () => cancelClose(), []);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key !== "Escape") return; suppressFocusOpen.current = true; setOpen(false); setActive(""); setSelectedChild(""); triggerRef.current?.focus(); window.setTimeout(() => { suppressFocusOpen.current = false; }, 0); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return <div className="catalog-mega-anchor" onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={scheduleClose} onFocusCapture={() => { cancelClose(); if (!suppressFocusOpen.current) setOpen(true); }} onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleClose(); }}>
    <button ref={triggerRef} type="button" className="catalog-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => { cancelClose(); setOpen(true); setActive(""); setSelectedChild(""); }}><LayoutGrid size={18} />Каталог<ChevronDown size={15} /></button>
    {open && <div className="catalog-mega-menu" role="menu" aria-label="Каталог товаров">{items.map((item) => <DesktopMenuCard key={item.id} item={item} active={active === item.id} selectedChild={active === item.id ? selectedChild : ""} hover={() => { cancelClose(); if (item.children.length) { setActive(item.id); setSelectedChild(""); } else { setActive(""); setSelectedChild(""); } }} activate={() => { cancelClose(); setActive((value) => { const next = value === item.id ? "" : item.id; if (next !== value) setSelectedChild(""); return next; }); }} selectChild={(id) => { cancelClose(); setSelectedChild((value) => value === id ? "" : id); }} close={() => { setOpen(false); setActive(""); setSelectedChild(""); }} />)}</div>}
  </div>;
}

function MobileBranch({ item, close }: { item: MenuItem; close: () => void }) {
  const [expanded, setExpanded] = useState(false);
  if (!item.children.length) return item.href ? <Link href={item.href} onClick={close}>{item.title}<ChevronRight size={15} aria-hidden="true" /></Link> : <span aria-disabled="true">{item.title}<small>Нет товаров</small></span>;
  return <div className={`mobile-catalog-nested${expanded ? " is-expanded" : ""}`}>
    <div className="mobile-catalog-nested-row">
      {item.href ? <Link href={item.href} onClick={close}>{item.title}</Link> : <span>{item.title}</span>}
      <button type="button" aria-label={`Показать подразделы: ${item.title}`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><ChevronDown size={15} aria-hidden="true" /></button>
    </div>
    {expanded && <div className="mobile-catalog-nested-panel">
      <nav aria-label={item.title}>{item.children.map((child) => <MobileBranch key={child.id} item={child} close={close} />)}</nav>
    </div>}
  </div>;
}

function MobileMenuCard({ item, expanded, toggle, close }: { item: MenuItem; expanded: boolean; toggle: () => void; close: () => void }) {
  const hasChildren = item.children.length > 0;
  const cardContent = <MenuCardVisual item={item} mobile />;
  return <article className={`mobile-catalog-card-shell${expanded ? " is-expanded" : ""}`}>
    {item.href ? <Link className="mobile-catalog-card" href={item.href} onClick={close}>{cardContent}</Link> : hasChildren ? <button type="button" className="mobile-catalog-card" aria-expanded={expanded} onClick={toggle}>{cardContent}</button> : <span className="mobile-catalog-card" aria-disabled="true">{cardContent}</span>}
    {hasChildren && item.href && <button type="button" className="mobile-catalog-card-toggle" aria-label={`Показать подразделы: ${item.title}`} aria-expanded={expanded} onClick={toggle}><ChevronRight size={19} aria-hidden="true" /></button>}
    {hasChildren && expanded && <div className="mobile-catalog-card-panel">
      <nav aria-label={`Подразделы ${item.title}`}>{item.children.map((child) => <MobileBranch key={child.id} item={child} close={close} />)}</nav>
    </div>}
  </article>;
}

export function MobileCatalogMenu({ close }: { close: () => void }) {
  const items = useCatalogMenu();
  const [expanded, setExpanded] = useState("");
  return <div className="mobile-catalog-menu"><div className="mobile-catalog-heading"><LayoutGrid size={18} /><strong>Каталог</strong></div><div className="mobile-catalog-card-list">{items.map((item) => <MobileMenuCard key={item.id} item={item} expanded={expanded === item.id} toggle={() => setExpanded((value) => value === item.id ? "" : item.id)} close={close} />)}</div></div>;
}
