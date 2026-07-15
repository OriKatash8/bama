export type PasswordRule = { key: string; met: boolean };

export type PasswordValidation = {
  valid: boolean;
  errors: string[];
  rules: PasswordRule[];
};

export function validatePassword(pw: string): PasswordValidation {
  const rules: PasswordRule[] = [
    { key: 'auth.pw_length', met: pw.length >= 8 },
    { key: 'auth.pw_uppercase', met: /[A-Z]/.test(pw) },
    { key: 'auth.pw_number', met: /[0-9]/.test(pw) },
  ];
  const errors = rules.filter((r) => !r.met).map((r) => r.key);
  return { valid: errors.length === 0, errors, rules };
}
