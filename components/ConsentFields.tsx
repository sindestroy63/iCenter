"use client";

import Link from "next/link";
import { PERSONAL_DATA_CONSENT_PATH, PRIVACY_POLICY_PATH } from "@/lib/consent-evidence";

export type ConsentState = { personalDataConsent: boolean; privacyConsent: boolean };

export default function ConsentFields({ value, onChange, className = "request-consents" }: { value: ConsentState; onChange: (value: ConsentState) => void; className?: string }) {
  return <fieldset className={className}>
    <legend className="sr-only">Обязательные согласия</legend>
    <label><input type="checkbox" required checked={value.personalDataConsent} onChange={(event) => onChange({ ...value, personalDataConsent: event.target.checked })} /><span>Согласен на <Link href={PERSONAL_DATA_CONSENT_PATH} target="_blank">обработку персональных данных</Link>.</span></label>
    <label><input type="checkbox" required checked={value.privacyConsent} onChange={(event) => onChange({ ...value, privacyConsent: event.target.checked })} /><span>Согласен с <Link href={PRIVACY_POLICY_PATH} target="_blank">политикой конфиденциальности</Link>.</span></label>
  </fieldset>;
}
