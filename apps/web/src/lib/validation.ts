/**
 * Client-side checks exist only to give immediate feedback. The API validates
 * every field again — this is convenience, never enforcement.
 */
export const PASSWORD_MIN_LENGTH = 8;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(email: string): string | undefined {
  return EMAIL_PATTERN.test(email.trim()) ? undefined : 'Введіть коректну email-адресу';
}

export function validatePassword(password: string): string | undefined {
  return password.length >= PASSWORD_MIN_LENGTH
    ? undefined
    : `Пароль має містити щонайменше ${PASSWORD_MIN_LENGTH} символів`;
}
