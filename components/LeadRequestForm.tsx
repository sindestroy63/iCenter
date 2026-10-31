"use client";
import { useState, type FormEvent } from "react";
import { Check, ImagePlus, X } from "lucide-react";
import ConsentFields, { type ConsentState } from "@/components/ConsentFields";
import { useStoreState } from "@/components/StoreState";
import { formatRussianPhone, isValidRussianPhone } from "@/lib/phone";

type Mode = "trade_in" | "installment";
type Props = {
  mode: Mode;
  productId?: string;
  productSlug?: string;
  desiredDevice?: string;
  compact?: boolean;
  onSuccess?: () => void;
};
const conditions = [
  "Отличное",
  "Хорошее",
  "Есть заметные следы использования",
  "Не включается или повреждено",
];
const equipmentOptions = [
  "Коробка",
  "Кабель",
  "Зарядный адаптер",
  "Документы",
  "Другое",
];
const blankConsents: ConsentState = {
  personalDataConsent: false,
  privacyConsent: false,
};

export default function LeadRequestForm({
  mode,
  productId,
  productSlug,
  desiredDevice = "",
  compact = false,
  onSuccess,
}: Props) {
  const { city } = useStoreState();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [brand, setBrand] = useState("");
  const [deviceType, setDeviceType] = useState("");
  const [model, setModel] = useState("");
  const [configuration, setConfiguration] = useState("");
  const [color, setColor] = useState("");
  const [battery, setBattery] = useState("");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [condition, setCondition] = useState("");
  const [comment, setComment] = useState("");
  const [desired, setDesired] = useState(desiredDevice);
  const [files, setFiles] = useState<File[]>([]);
  const [consents, setConsents] = useState(blankConsents);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [requestNumber, setRequestNumber] = useState("");
  const [idempotencyKey] = useState(
    () =>
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    if (
      next.length > 5 ||
      next.some(
        (file) =>
          !["image/jpeg", "image/png", "image/webp", "image/avif"].includes(
            file.type,
          ) || file.size > 10 * 1024 * 1024,
      )
    )
      return setError(
        "Допустимы до 5 изображений JPG, PNG, WebP или AVIF до 10 МБ.",
      );
    setError("");
    setFiles(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    const batteryValue = battery === "" ? null : Number(battery);
    if (!name.trim()) return setError("Укажите имя.");
    if (!isValidRussianPhone(phone))
      return setError("Укажите корректный российский номер телефона.");
    if (
      batteryValue !== null &&
      (!Number.isInteger(batteryValue) ||
        batteryValue < 0 ||
        batteryValue > 100)
    )
      return setError(
        "Ёмкость аккумулятора должна быть целым числом от 0 до 100.",
      );
    if (!consents.personalDataConsent || !consents.privacyConsent)
      return setError("Подтвердите оба обязательных согласия.");
    setSending(true);
    setError("");
    try {
      const form = new FormData();
      const values: Record<string, string> = {
        name: name.trim(),
        phone,
        city,
        personalDataConsent: "true",
        privacyConsent: "true",
      };
      const optional: Record<string, string> = {
        brand,
        deviceType,
        device: model,
        configuration,
        color,
        batteryHealth: battery,
        condition,
        comment,
        desiredDevice: desired,
      };
      for (const [key, value] of Object.entries(optional))
        if (value.trim()) values[key] = value.trim();
      if (productId) values.productId = productId;
      if (productSlug) values.productSlug = productSlug;
      Object.entries(values).forEach(([key, value]) => form.set(key, value));
      equipment.forEach((value) => form.append("equipment", value));
      files.forEach((value) => form.append("photos", value));
      const response = await fetch(
        mode === "trade_in" ? "/api/trade-in" : "/api/installment",
        {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey },
          body: form,
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.requestNumber !== "string")
        throw new Error(body.error ?? "REQUEST_FAILED");
      setRequestNumber(body.requestNumber);
      onSuccess?.();
    } catch {
      setError(
        "Не удалось отправить заявку. Проверьте соединение и повторите попытку.",
      );
    } finally {
      setSending(false);
    }
  }
  if (requestNumber)
    return (
      <div className="lead-form-success" role="status">
        <span>
          <Check size={22} />
        </span>
        <h2>Заявка отправлена</h2>
        <p>
          {mode === "installment" ? (
            "Мы свяжемся с вами по указанному номеру телефона."
          ) : (
            <>
              Номер заявки: <strong>{requestNumber}</strong>.
            </>
          )}
        </p>
      </div>
    );
  return (
    <form
      className={`lead-request-form${compact ? " is-compact" : ""}`}
      onSubmit={submit}
      noValidate
    >
      <div className="lead-form-grid">
        <label>
          Имя <sup>*</sup>
          <input
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          Телефон <sup>*</sup>
          <input
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+7 (___) ___-__-__"
            value={phone}
            onChange={(e) => setPhone(formatRussianPhone(e.target.value))}
          />
        </label>
        {mode === "trade_in" && (
          <>
            <div className="lead-form-wide lead-device-source">
              <div>
                <strong>Устройство для оценки</strong>
                <span>Заполните только те характеристики, которые знаете.</span>
              </div>
            </div>
            <label>
              Бренд
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Например, Apple"
              />
            </label>
            <label>
              Линейка / тип
              <input
                value={deviceType}
                onChange={(e) => setDeviceType(e.target.value)}
                placeholder="Например, смартфон"
              />
            </label>
            <label>
              Модель
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Например, 14 Pro+"
              />
            </label>
            <label>
              Объём памяти / конфигурация
              <input
                value={configuration}
                onChange={(e) => setConfiguration(e.target.value)}
                placeholder="Например, 256 ГБ"
              />
            </label>
            <label>
              Цвет
              <input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="Например, чёрный"
              />
            </label>
            <label>
              Ёмкость аккумулятора, %
              <input
                type="number"
                min={0}
                max={100}
                step={1}
                value={battery}
                onChange={(e) => setBattery(e.target.value)}
              />
            </label>
            <label>
              Состояние устройства
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
              >
                <option value="">Не указано</option>
                {conditions.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <fieldset className="lead-form-wide lead-equipment">
              <legend>Комплектация</legend>
              {equipmentOptions.map((value) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={equipment.includes(value)}
                    onChange={() =>
                      setEquipment((current) =>
                        current.includes(value)
                          ? current.filter((item) => item !== value)
                          : [...current, value],
                      )
                    }
                  />
                  <span>{value}</span>
                </label>
              ))}
            </fieldset>
          </>
        )}
        <label className="lead-form-wide">
          Желаемое устройство
          <input value={desired} onChange={(e) => setDesired(e.target.value)} />
        </label>
        <label className="lead-form-wide">
          {mode === "installment" ? "Комментарий (необязательно)" : "Дефекты, особенности работы и комментарий"}
          <textarea
            rows={4}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={mode === "installment" ? "Укажите интересующую модель или задайте вопрос об условиях рассрочки" : undefined}
          />
        </label>
      </div>
      {mode === "trade_in" && (
        <div className="lead-photo-field">
          <span>
            Фотографии устройства{" "}
            <small>необязательно, до 5 файлов по 10 МБ</small>
          </span>
          <label className="lead-photo-button">
            <ImagePlus size={18} />
            Прикрепить фотографии
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
          </label>
          {files.length > 0 && (
            <ul>
              {files.map((file, index) => (
                <li key={`${file.name}-${file.lastModified}-${index}`}>
                  <span>{file.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setFiles((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    aria-label={`Убрать ${file.name}`}
                  >
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ConsentFields value={consents} onChange={setConsents} />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button
        className="dark-button lead-submit"
        type="submit"
        disabled={sending}
      >
        {sending
          ? "Отправляем…"
          : mode === "trade_in"
            ? "Отправить заявку"
            : "Отправить заявку на рассрочку"}
      </button>
    </form>
  );
}
