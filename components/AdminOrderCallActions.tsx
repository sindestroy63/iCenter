"use client";

import { Check, Copy, Phone } from "lucide-react";
import { useState } from "react";

function telTarget(phone: string) {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  return `${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

async function copyPhone(phone: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(phone);
    return;
  }
  const input = document.createElement("textarea");
  input.value = phone;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("COPY_FAILED");
}

export default function AdminOrderCallActions({ phone }: { phone: string }) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const target = telTarget(phone);

  async function copy() {
    try {
      await copyPhone(phone);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  return <>
    <div className="admin-order-call-actions">
      <a className="admin-primary" href={`tel:${target}`}><Phone size={17} aria-hidden="true" />Позвонить</a>
      <button className="admin-secondary" type="button" onClick={() => void copy()}>
        {copyState === "copied" ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}
        {copyState === "copied" ? "Скопировано" : "Скопировать номер"}
      </button>
    </div>
    <p className="admin-order-call-note" role={copyState === "failed" ? "alert" : undefined}>
      {copyState === "failed" ? "Не удалось скопировать автоматически. Выделите номер выше и скопируйте вручную." : "На компьютере используйте копирование, если приложение для звонков не настроено."}
    </p>
  </>;
}
