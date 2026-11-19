export function formatRussianPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const isCountryPrefix = /^\s*\+7/.test(value) || (digits.length === 11 && /^[78]/.test(digits));
  const local = (isCountryPrefix ? digits.slice(1) : digits).slice(0, 10);
  let formatted = "+7";
  if (local.length) formatted += ` (${local.slice(0, 3)}`;
  if (local.length >= 3) formatted += ")";
  if (local.length > 3) formatted += ` ${local.slice(3, 6)}`;
  if (local.length > 6) formatted += `-${local.slice(6, 8)}`;
  if (local.length > 8) formatted += `-${local.slice(8, 10)}`;
  return formatted;
}

export function formatRussianPhoneInput(value: string, cursor: number | null) {
  const caret = Math.max(0, Math.min(cursor ?? value.length, value.length));
  const digits = value.replace(/\D/g, "");
  const beforeCaret = value.slice(0, caret).replace(/\D/g, "").length;
  const explicitPrefix = /^\s*\+7/.test(value);
  const pastedPrefix = digits.length === 11 && /^[78]/.test(digits);
  let prefixLength = explicitPrefix || pastedPrefix ? 1 : 0;
  let localDigits = prefixLength ? digits.slice(1) : digits;
  const extraNationalPrefix = localDigits.length > 10 && /^[78]/.test(localDigits);
  if (extraNationalPrefix) {
    localDigits = localDigits.slice(1);
    prefixLength += 1;
  }
  const local = localDigits.slice(0, 10);
  const formatted = formatRussianPhone(local);
  const localBeforeCaret = Math.max(0, Math.min(local.length, beforeCaret - Math.min(prefixLength, beforeCaret)));
  if (localBeforeCaret === 0) return { value: formatted, cursor: 2 };
  let digitCount = 0;
  for (let index = 2; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) {
      digitCount += 1;
      if (digitCount === localBeforeCaret) return { value: formatted, cursor: index + 1 };
    }
  }
  return { value: formatted, cursor: formatted.length };
}

export function removeAdjacentRussianPhoneDigit(value: string, cursor: number, direction: "backward" | "forward") {
  const selection = Math.max(0, Math.min(cursor, value.length));
  let index = direction === "backward" ? selection - 1 : selection;
  while (index >= 2 && index < value.length && !/\d/.test(value[index])) index += direction === "backward" ? -1 : 1;
  if (index < 2 || index >= value.length || !/\d/.test(value[index])) return null;
  return formatRussianPhoneInput(value.slice(0, index) + value.slice(index + 1), index);
}

export function isValidRussianPhone(value: string) {
  return /^7\d{10}$/.test(value.replace(/\D/g, ""));
}
