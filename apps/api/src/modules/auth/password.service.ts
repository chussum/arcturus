import { Injectable } from '@nestjs/common';

/** Wraps Bun's built-in argon2id hashing so callers never touch the runtime API directly. */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return Bun.password.hash(plain, { algorithm: 'argon2id' });
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return Bun.password.verify(plain, hash);
  }
}
