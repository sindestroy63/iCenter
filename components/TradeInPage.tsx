"use client";

import { ArrowDown, CheckCircle2, Repeat2, SearchCheck, Smartphone } from "lucide-react";
import LeadRequestForm from "@/components/LeadRequestForm";

export default function TradeInPage() {
  return <main className="layout-container lead-page trade-in-page">
    <header className="lead-page-hero"><span>Trade-in iCenter</span><h1>Обменяйте старое устройство на новое</h1><p>Расскажите об устройстве, приложите фотографии при необходимости — менеджер уточнит детали и организует проверку. Финальная стоимость определяется после осмотра.</p><a className="dark-button" href="#trade-in-form">Получить оценку <ArrowDown size={18} /></a></header>
    <section className="lead-page-benefits" aria-label="Преимущества Trade-in"><div><Repeat2 /><strong>Удобный обмен</strong><span>Оценку можно зачесть при покупке нового устройства.</span></div><div><SearchCheck /><strong>Понятная проверка</strong><span>Условия подтверждаются после осмотра модели и состояния.</span></div><div><CheckCircle2 /><strong>Без обязательств</strong><span>Заявка помогает начать оценку и не обязывает к обмену.</span></div></section>
    <section className="lead-page-steps"><div><span>Как проходит обмен</span><h2>Три последовательных шага</h2></div><ol><li><b>1</b><div><strong>Опишите устройство</strong><p>Укажите модель, конфигурацию, состояние, комплектность и дефекты.</p></div></li><li><b>2</b><div><strong>Дождитесь звонка</strong><p>Менеджер уточнит сведения и согласует место и время проверки.</p></div></li><li><b>3</b><div><strong>Получите итоговую оценку</strong><p>После осмотра вы решите, использовать ли стоимость устройства для новой покупки.</p></div></li></ol></section>
    <section className="lead-page-form-section" id="trade-in-form"><header><Smartphone /><div><h2>Заявка на Trade-in</h2><p>Поля со звёздочкой обязательны. Введённые данные сохраняются в форме при ошибке отправки.</p></div></header><LeadRequestForm mode="trade_in" /></section>
  </main>;
}
