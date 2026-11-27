/** Shared client/server validation for newly chosen passwords; existing logins stay compatible. */
export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_LENGTH = 128;
export const PASSWORD_REQUIREMENTS = "Use 15–128 characters, including uppercase and lowercase letters, a number and a symbol.";
export function passwordPolicyError(password: string): string | null {
  return [...password].length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH || !/\p{Lu}/u.test(password) || !/\p{Ll}/u.test(password) || !/[0-9]/.test(password) || !/[^\p{L}\p{N}\s]/u.test(password) ? PASSWORD_REQUIREMENTS : null;
}
