export const PERSONAL_DATA_CONSENT_VERSION = "personal-data-v2";
export const PERSONAL_DATA_CONSENT_PATH = "/personal-data-consent";
export const PRIVACY_POLICY_PATH = "/privacy";

export type ConsentEvidence = {
  personalData: { accepted: true; document: typeof PERSONAL_DATA_CONSENT_PATH; version: typeof PERSONAL_DATA_CONSENT_VERSION };
  privacyPolicy: { accepted: true; document: typeof PRIVACY_POLICY_PATH };
};

export function dualConsentEvidence(): ConsentEvidence {
  return {
    personalData: { accepted: true, document: PERSONAL_DATA_CONSENT_PATH, version: PERSONAL_DATA_CONSENT_VERSION },
    privacyPolicy: { accepted: true, document: PRIVACY_POLICY_PATH },
  };
}
