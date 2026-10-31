export function formatRussianPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const local = (digits.length === 11 && /^[78]/.test(digits) ? digits.slice(1) : digits).slice(0, 10);
  let formatted = "+7";
  if (local.length) formatted += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) formatted += ")";
  if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`;
  return formatted;
}

export function isValidRussianPhone(value: string) {
  return /^7\d{10}$/.test(value.replace(/\D/g, ""));
}
