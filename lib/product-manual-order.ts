export const PRODUCT_ORDER_LOCK_KEY = 1937042211;

export type ProductOrderValidation =
  | { ok: true }
  | { ok: false; reason: "CONFLICT" | "INVALID_ORDER" };

function uniqueIds(ids: readonly string[]) {
  return ids.length === new Set(ids).size && ids.every((id) => typeof id === "string" && id.length > 0);
}

export function validateProductOrder(
  currentIds: readonly string[],
  expectedIds: readonly string[],
  orderedIds: readonly string[],
): ProductOrderValidation {
  if (!uniqueIds(expectedIds) || currentIds.length !== expectedIds.length)
    return { ok: false, reason: "CONFLICT" };
  if (currentIds.some((id, index) => id !== expectedIds[index]))
    return { ok: false, reason: "CONFLICT" };
  if (!uniqueIds(orderedIds) || orderedIds.length !== currentIds.length)
    return { ok: false, reason: "INVALID_ORDER" };
  const current = new Set(currentIds);
  return orderedIds.every((id) => current.has(id))
    ? { ok: true }
    : { ok: false, reason: "INVALID_ORDER" };
}

export function moveProductOrder(ids: readonly string[], productId: string, targetIndex: number) {
  const sourceIndex = ids.indexOf(productId);
  if (sourceIndex < 0 || !Number.isInteger(targetIndex)) return [...ids];
  const next = [...ids];
  const [item] = next.splice(sourceIndex, 1);
  next.splice(Math.max(0, Math.min(targetIndex, next.length)), 0, item);
  return next;
}

export function productOrderChanged(currentIds: readonly string[], savedIds: readonly string[]) {
  return currentIds.length !== savedIds.length || currentIds.some((id, index) => id !== savedIds[index]);
}

export function productOrderSaveErrorMessage(status: number, response: { code?: unknown; error?: unknown }) {
  if (status === 409 || response.code === "ORDER_CONFLICT")
    return "Порядок изменился параллельно. Список обновлён; проверьте его и повторите изменение.";
  if (status === 401 || response.code === "AUTH_REQUIRED") return "Сессия истекла. Войдите снова.";
  if (status === 403 || response.code === "ACCESS_DENIED")
    return "Недостаточно прав для изменения порядка товаров.";
  if (status >= 500 || response.code === "ORDER_SAVE_FAILED")
    return "Сервер не смог сохранить порядок. Порядок товаров не изменён.";
  return typeof response.error === "string" && response.error
    ? response.error
    : `Не удалось сохранить порядок (${status}).`;
}
