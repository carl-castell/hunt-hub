import { createHash } from 'crypto';
import { audit } from '@/services/audit';

export async function isPasswordPwned(
  password: string,
  context?: { userId?: number | null; ip?: string },
): Promise<boolean> {
  const hash = createHash('sha1').update(password).digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  try {
    const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { 'User-Agent': 'hunt-hub' },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      throw new Error(`HIBP responded with status ${res.status}`);
    }

    const text = await res.text();
    return text.split('\r\n').some((line) => line.startsWith(`${suffix}:`));
  } catch (err) {
    await audit({
      event: 'hibp_service_error',
      userId: context?.userId ?? null,
      ip: context?.ip,
      metadata: { error: String(err) },
    });
    return false;
  }
}
