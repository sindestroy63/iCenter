export type CityAccessRole = "OWNER" | "ADMIN" | "DEVELOPER" | "CITY_MANAGER" | string;

export type CityAccessState = {
  role: CityAccessRole;
  isActive: boolean;
  allCities: boolean;
  hasCityGrant: boolean;
  grantCanManagePrices?: boolean;
  grantCanManageStock?: boolean;
  allCitiesCanManagePrices?: boolean;
  allCitiesCanManageStock?: boolean;
};

export function evaluateCityAccess(state: CityAccessState) {
  if (!state.isActive) return { allowed: false, canManagePrices: false, canManageStock: false };
  if (state.role === "OWNER" || state.role === "ADMIN" || state.role === "DEVELOPER") {
    return { allowed: true, canManagePrices: true, canManageStock: true };
  }
  if (state.role !== "CITY_MANAGER") return { allowed: false, canManagePrices: false, canManageStock: false };

  // allCities is an exclusive mode: explicit city grants do not override it.
  const allowed = state.allCities || state.hasCityGrant;
  const usesCityGrant = !state.allCities;
  return {
    allowed,
    canManagePrices: allowed && (usesCityGrant ? Boolean(state.grantCanManagePrices) : Boolean(state.allCitiesCanManagePrices)),
    canManageStock: allowed && (usesCityGrant ? Boolean(state.grantCanManageStock) : Boolean(state.allCitiesCanManageStock)),
  };
}
