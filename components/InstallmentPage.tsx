"use client";

import { BadgeRussianRuble } from "lucide-react";
import LeadRequestForm from "@/components/LeadRequestForm";

export default function InstallmentPage() {
  return <main className="layout-container lead-page installment-page"><header className="lead-page-hero"><span>Рассрочка iCenter</span><h1>Рассрочка на технику в iCenter</h1><p>Выберите интересующее устройство и оставьте заявку. Мы свяжемся с вами, расскажем об актуальных условиях и поможем разобраться с дальнейшим оформлением.</p></header><section className="lead-page-steps"><div><span>Как это работает</span><h2>Консультация перед оформлением</h2></div><ol><li><b>1</b><div><strong>Укажите товар</strong><p>Название или конфигурацию, которую планируете приобрести.</p></div></li><li><b>2</b><div><strong>Узнайте актуальные условия</strong><p>Менеджер расскажет о доступных на момент обращения вариантах и необходимых документах.</p></div></li><li><b>3</b><div><strong>Примите решение</strong><p>Заявка нужна для консультации и не является одобрением или обязательством оформить покупку.</p></div></li></ol></section><section className="lead-page-form-section"><header><BadgeRussianRuble /><div><h2>Узнать условия рассрочки</h2><p>Оставьте имя и номер телефона. Если уже выбрали устройство, укажите его — так нам будет проще подготовить информацию для вас.</p></div></header><LeadRequestForm mode="installment" /></section></main>;
}
