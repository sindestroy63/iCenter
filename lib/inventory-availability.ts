export const APPROVED_AVAILABILITY = {
  IN_STOCK: "В наличии",
  EXPECTED_1_2: "Ожидается поступление 1-2 дня",
  PREORDER_1_2: "Под заказ 1-2 дня",
  PREORDER_2_4: "Под заказ 2-4 дня",
  CHECK_AVAILABILITY: "Наличие уточняйте",
} as const;

export type ApprovedAvailability = keyof typeof APPROVED_AVAILABILITY;

export type InventoryAvailabilityTuple = {
  availability: string | null;
  allowPreorder: boolean | null;
  deliveryTime: string | null;
};

export const APPROVED_AVAILABILITY_OPTIONS = Object.entries(APPROVED_AVAILABILITY) as Array<[ApprovedAvailability, string]>;

export function inventoryTupleForAvailability(value: ApprovedAvailability): { availability: string; allowPreorder: boolean; deliveryTime: string | null } {
  if (value === "IN_STOCK") return { availability: "IN_STOCK", allowPreorder: false, deliveryTime: null };
  if (value === "EXPECTED_1_2") return { availability: "PREORDER", allowPreorder: true, deliveryTime: APPROVED_AVAILABILITY.EXPECTED_1_2 };
  if (value === "PREORDER_1_2") return { availability: "PREORDER", allowPreorder: true, deliveryTime: APPROVED_AVAILABILITY.PREORDER_1_2 };
  if (value === "PREORDER_2_4") return { availability: "PREORDER", allowPreorder: true, deliveryTime: APPROVED_AVAILABILITY.PREORDER_2_4 };
  return { availability: "UNSPECIFIED", allowPreorder: false, deliveryTime: null };
}

export function approvedAvailability(value: InventoryAvailabilityTuple): ApprovedAvailability | null {
  if (value.availability === "IN_STOCK") return "IN_STOCK";
  if (value.availability === "UNSPECIFIED" && !value.allowPreorder) return "CHECK_AVAILABILITY";
  if (value.availability === "PREORDER" || value.allowPreorder) {
    if (value.deliveryTime === APPROVED_AVAILABILITY.EXPECTED_1_2) return "EXPECTED_1_2";
    if (value.deliveryTime === APPROVED_AVAILABILITY.PREORDER_1_2) return "PREORDER_1_2";
    if (value.deliveryTime === APPROVED_AVAILABILITY.PREORDER_2_4) return "PREORDER_2_4";
  }
  return null;
}

export function availabilitySnapshot(value: InventoryAvailabilityTuple): string {
  const approved = approvedAvailability(value);
  if (approved) return approved;
  if (value.availability === "OUT_OF_STOCK") return "LEGACY_OUT_OF_STOCK";
  if (value.availability === "PREORDER" || value.allowPreorder) return `LEGACY_PREORDER:${value.deliveryTime ?? ""}`;
  return `LEGACY:${value.availability ?? ""}:${value.allowPreorder ? "1" : "0"}:${value.deliveryTime ?? ""}`;
}

export function availabilityLabel(value: InventoryAvailabilityTuple): string {
  const approved = approvedAvailability(value);
  if (approved) return APPROVED_AVAILABILITY[approved];
  if (value.availability === "OUT_OF_STOCK") return "Недоступен";
  if (value.availability === "PREORDER" || value.allowPreorder) {
    return value.deliveryTime ? `Под заказ · ${value.deliveryTime}` : "Под заказ";
  }
  return "Наличие уточняйте";
}

export function availabilityLabelFromSnapshot(snapshot: string | null): string {
  if (snapshot && snapshot in APPROVED_AVAILABILITY) return APPROVED_AVAILABILITY[snapshot as ApprovedAvailability];
  if (snapshot === "LEGACY_OUT_OF_STOCK") return "Недоступен";
  if (snapshot?.startsWith("LEGACY_PREORDER:")) {
    const deliveryTime = snapshot.slice("LEGACY_PREORDER:".length);
    return deliveryTime ? `Под заказ · ${deliveryTime}` : "Под заказ";
  }
  return snapshot ? "Прежнее значение" : "";
}

export function isPurchasableAvailability(value: InventoryAvailabilityTuple): boolean {
  return value.availability === "IN_STOCK" || value.availability === "PREORDER" || value.allowPreorder === true;
}
