const phonePattern = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const aadhaarShapedPattern = /(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g;
const accountNumberPattern = /\b\d{9,18}\b/g;

export interface RedactionResult {
  redacted: string;
  categories: readonly ("PHONE" | "AADHAAR_SHAPED" | "ACCOUNT_NUMBER")[];
}

export function redactIntakeNarrative(raw: string): RedactionResult {
  const categories = new Set<RedactionResult["categories"][number]>();
  let redacted = raw.replace(phonePattern, () => {
    categories.add("PHONE");
    return "[REDACTED_PHONE]";
  });
  redacted = redacted.replace(aadhaarShapedPattern, () => {
    categories.add("AADHAAR_SHAPED");
    return "[REDACTED_ID_NUMBER]";
  });
  redacted = redacted.replace(accountNumberPattern, () => {
    categories.add("ACCOUNT_NUMBER");
    return "[REDACTED_ACCOUNT_NUMBER]";
  });
  return { redacted, categories: [...categories] };
}
