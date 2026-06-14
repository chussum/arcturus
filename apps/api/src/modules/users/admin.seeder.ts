import { UserRole } from '@arcturus/shared';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { nanoid } from 'nanoid';
import { AppConfig } from '../../common/config/app-config';
import { UsersRepository } from '../../infrastructure/persistence/repositories/users.repository.port';
import { PasswordService } from '../auth/password.service';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PROMPT_ATTEMPTS = 5;

/**
 * First-run bootstrap: when the platform has no accounts yet, create the
 * super-admin. The password comes from ARCTURUS_ADMIN_PASSWORD; otherwise, if
 * we're attached to a terminal, we ask for it interactively. With no terminal
 * we keep the old behaviour: refuse in production, generate-and-print in dev.
 */
@Injectable()
export class AdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeeder.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly passwords: PasswordService,
    private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const existing = await this.users.list();
    if (existing.length > 0) return;

    const { password, source } = await this.resolveSeedPassword();
    await this.users.create({
      username: 'admin',
      passwordHash: await this.passwords.hash(password),
      role: UserRole.Admin,
    });

    if (source === 'generated') {
      // Intentionally loud: this is the only time the generated password is visible.
      this.logger.warn(`Seeded admin account — username: admin / password: ${password}`);
      this.logger.warn('Store this password now; it will not be shown again.');
    } else if (source === 'prompt') {
      this.logger.log('Seeded admin account (password set interactively)');
    } else {
      this.logger.log('Seeded admin account (password from ARCTURUS_ADMIN_PASSWORD)');
    }
  }

  private async resolveSeedPassword(): Promise<{
    password: string;
    source: 'env' | 'prompt' | 'generated';
  }> {
    if (this.config.adminPassword) {
      return { password: this.config.adminPassword, source: 'env' };
    }

    if (process.stdin.isTTY) {
      return { password: await this.promptForPassword(), source: 'prompt' };
    }

    if (this.config.isProduction) {
      throw new Error(
        'ARCTURUS_ADMIN_PASSWORD must be set in production for the initial admin seed. ' +
          'Refusing to generate one and print it to the logs, which may be world-readable.',
      );
    }

    return { password: nanoid(16), source: 'generated' };
  }

  /** Ask for the admin password at the terminal (masked), with confirmation. */
  private async promptForPassword(): Promise<string> {
    process.stdout.write('\nNo admin account yet. / 아직 관리자 계정이 없습니다.\n');

    for (let attempt = 1; attempt <= MAX_PROMPT_ATTEMPTS; attempt++) {
      const password = await readHidden('Set the admin password / 어드민 비밀번호를 설정하세요: ');
      if (password.length < MIN_PASSWORD_LENGTH) {
        process.stdout.write(
          `Password must be at least ${MIN_PASSWORD_LENGTH} characters / 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.\n`,
        );
        continue;
      }
      const confirm = await readHidden('Confirm password / 비밀번호 확인: ');
      if (password !== confirm) {
        process.stdout.write('Passwords do not match / 비밀번호가 일치하지 않습니다.\n');
        continue;
      }
      return password;
    }

    throw new Error('Could not read an admin password from the terminal after several attempts.');
  }
}

/**
 * Read a line from stdin without echoing it, masking each character with `*`.
 * Uses raw mode so the password never lands on screen or in shell history.
 */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    stdout.write(prompt);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let value = '';

    const cleanup = (): void => {
      stdin.setRawMode?.(false);
      stdin.pause();
      stdin.removeListener('data', onData);
    };

    const onData = (chunk: string): void => {
      for (const ch of chunk) {
        if (ch === '\n' || ch === '\r' || ch === '\u0004') {
          // Enter / Ctrl-D (EOT) → submit
          cleanup();
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (ch === '\u0003') {
          // Ctrl-C (ETX) → abort
          cleanup();
          stdout.write('\n');
          reject(new Error('Admin password entry aborted.'));
          return;
        }
        if (ch === '\u007f' || ch === '\b') {
          // Delete / Backspace
          if (value.length > 0) {
            value = value.slice(0, -1);
            stdout.write('\b \b');
          }
          continue;
        }
        if (ch >= ' ') {
          value += ch;
          stdout.write('*');
        }
      }
    };

    stdin.on('data', onData);
  });
}
