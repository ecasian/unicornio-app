import { hash, verify } from 'argon2';

const options = {
  type: 2 as const,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, options);
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    return await verify(encoded, password);
  } catch {
    return false;
  }
}

export async function burnPasswordCheck(password: string): Promise<void> {
  await hash(password, options);
}
