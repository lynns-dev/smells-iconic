import { BRAND } from "./email/brand";
export const BIRTHDAY_CONSENT_VERSION = "birthday-program-v1";
export const BIRTHDAY_CONSENT_TEXT = `I agree to ${BRAND.name} saving my email and birthday month and day for its optional birthday program. This does not subscribe me to general marketing emails or texts.`;
export const BIRTHDAY_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
export function birthdayInput(body) {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("Please complete the birthday form.");
  if (body.consent !== true || body.consentVersion !== BIRTHDAY_CONSENT_VERSION)
    throw new Error("Please choose the birthday-program consent box to join.");
  if (
    ["year", "birthYear", "birthDate", "dateOfBirth", "dob"].some(
      (key) => body[key] != null,
    )
  )
    throw new Error(
      "Please share only your birthday month and day, without a year.",
    );
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Please enter a valid email address.");
  const number = (value) =>
    ["string", "number"].includes(typeof value) &&
    /^\d{1,2}$/.test(String(value))
      ? Number(value)
      : 0;
  const month = number(body.month),
    day = number(body.day);
  // February 29 is a valid birthday; a birth year is never needed or stored.
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  )
    throw new Error("Please choose a valid birthday month and day.");
  return { email, month, day };
}
