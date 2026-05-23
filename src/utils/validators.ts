export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[\d\s\-()\\.]{7,15}$/.test(phone);
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function isNonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

export function isWithinLength(value: string, max: number): boolean {
  return value.length <= max;
}
