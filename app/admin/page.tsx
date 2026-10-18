"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Image, Package, Plus, ShoppingCart, Tag, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const metrics: [LucideIcon, string, string, string][] = [[ShoppingCart, "Всего заявок", "24", "96"], [Package, "Товаров", "1 248", "1 248"], [Users, "Сотрудников", "8", "8"]];
const demoRequests = [["IC-DEMO-001", "Демо-клиент", "Самара", "iPhone 18 Pro", "Уточнить цену", "14.10.2026"], ["IC-DEMO-002", "Демо-клиент", "Москва", "AirPods Pro 3", "Уточнить цену", "14.10.2026"], ["IC-DEMO-003", "Демо-клиент", "Оренбург", "Apple Watch", "Уточнить цену", "13.10.2026"]];

export default function Admin() {
  const [period, setPeriod] = useState("7");
  const points = period === "30" ? "M0 150 L110 120 L220 132 L330 86 L440 112 L550 66 L660 84 L800 30" : "M0 160 L110 130 L220 140 L330 95 L440 120 L550 70 L660 95 L800 35";
  return <div className="admin-content"><div className="admin-heading"><h1>Панель управления</h1><p>Демонстрационные показатели · данные не подключены</p></div>
    <div className="metrics">{metrics.map(([Icon, label, value7, value30]) => <div className="metric" key={label}><Icon color="#1677f2" /><div className="metric-label">{label}</div><div className="metric-value">{period === "30" ? value30 : value7}</div><span>демо · не реальные данные</span></div>)}</div>
    <div className="admin-grid"><section className="panel chart-panel"><div className="panel-heading"><div><h2>Заявки</h2><small>Демонстрационная динамика по дням</small></div><select aria-label="Период графика" value={period} onChange={e => setPeriod(e.target.value)}><option value="7">За 7 дней</option><option value="30">За 30 дней</option></select></div><div className="chart"><svg viewBox="0 0 800 220" preserveAspectRatio="none"><path d={`${points} L800 220 L0 220Z`} fill="#dcecff"/><path d={points} fill="none" stroke="#1677f2" strokeWidth="3"/></svg></div><small className="admin-note">График и цифры показаны только для демонстрации.</small></section>
      <section className="panel"><h2>Быстрые действия</h2><div className="quick-list"><Link className="quick" href="/admin/products"><span><Plus size={17}/>Добавить товар</span><ArrowRight size={18}/></Link><Link className="quick" href="/admin/categories"><span><Tag size={17}/>Добавить категорию</span><ArrowRight size={18}/></Link><Link className="quick" href="/admin/banners"><span><Image size={17}/>Изменить баннер</span><ArrowRight size={18}/></Link><Link className="quick" href="/"><span>Открыть сайт</span><ArrowRight size={18}/></Link></div></section>
      <section className="panel recent-panel"><div className="panel-heading"><h2>Последние заявки</h2><Link href="/admin/requests">Все заявки <ArrowRight size={15}/></Link></div><div className="admin-demo-note">Ниже приведены демонстрационные строки.</div><table className="table"><thead><tr><th>№ заявки</th><th>Клиент</th><th>Город</th><th>Товары</th><th>Сумма</th><th>Дата</th></tr></thead><tbody>{demoRequests.map(row=><tr key={row[0]}>{row.map((cell,index)=><td key={index}>{cell}</td>)}</tr>)}</tbody></table></section>
      <section className="panel"><div className="panel-heading"><h2>Заявки по товарам</h2><Link href="/admin/products">Все товары <ArrowRight size={15}/></Link></div><div className="quick-list">{["iPhone 18 Pro","AirPods Pro 3","Чехол Silicone Case","Apple Watch Series 11","Зарядное устройство"].map((name,index)=><div className="quick" key={name}><span><b>{index+1}</b>{name}</span><strong>{8-index}<small>заявок · demo</small></strong></div>)}</div></section>
    </div>
  </div>;
}
