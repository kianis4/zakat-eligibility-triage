import type { QuotaLimits } from "./quota";

/**
 * Every reason a check can come back refused, as a code and the words the app shows for it.
 *
 * Only the code travels in the link back to the paste form. The page looks the words up here,
 * so a crafted link can name a refusal but can never put its own text on the page.
 */
export const CHECK_ERRORS = {
  "title-missing": "A campaign needs a title.",
  "title-too-long": "That title is longer than 300 characters. Paste the campaign's title only.",
  "story-missing": "There is nothing to check without the story.",
  "story-too-long":
    "That story is longer than 20,000 characters. Paste the campaign's story only.",
  "category-too-long": "That category is longer than 100 characters.",
  "goal-invalid":
    "The stated goal is an amount greater than zero and less than a trillion, to the cent.",
  "currency-too-long": "That currency is longer than 10 characters.",
  invalid: "The submission could not be read.",
  "no-database": "This deployment has no database configured, so no campaign can be checked.",
  "no-secret":
    "This deployment has no IP_HASH_SECRET configured, so it cannot keep its usage limits and runs no checks.",
  "no-address":
    "The request did not say where it came from, so it cannot be counted against a limit.",
  "visitor-limit": "You have used today's limit of checks. It resets at midnight UTC.",
  "site-limit":
    "This site has used today's limit of checks for everyone. It resets at midnight UTC.",
  "not-stored": "The campaign could not be stored, so it was not checked. Try again later.",
  unreadable: "The campaign could not be checked: the agent could not read it. Try again later.",
} as const;

export type CheckErrorCode = keyof typeof CHECK_ERRORS;

export function isCheckErrorCode(code: string): code is CheckErrorCode {
  return Object.hasOwn(CHECK_ERRORS, code);
}

/** The words for a code, or null for anything the app did not write, which shows nothing. */
export function checkErrorMessage(code: string, limits: QuotaLimits): string | null {
  if (!isCheckErrorCode(code)) {
    return null;
  }

  return code === "visitor-limit"
    ? `You have used today's limit of ${limits.perIp} checks. It resets at midnight UTC.`
    : CHECK_ERRORS[code];
}
