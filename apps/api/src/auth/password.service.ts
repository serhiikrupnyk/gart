import { randomBytes } from 'node:crypto';

import { Injectable, type OnModuleInit } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

import { ARGON2_OPTIONS } from './argon2-options';

@Injectable()
export class PasswordService implements OnModuleInit {
  /** A real hash of a value nobody knows, used to keep failed logins constant-time. */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomBytes(32).toString('base64'));
  }

  async hash(plainPassword: string): Promise<string> {
    return hash(plainPassword, ARGON2_OPTIONS);
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plainPassword, ARGON2_OPTIONS);
    } catch {
      // A malformed or unrecognised hash is a failed login, not a server error.
      return false;
    }
  }

  /**
   * Spends the same work a real verify would when no account matched, so that
   * response time cannot be used to discover which emails are registered.
   */
  async verifyDummy(plainPassword: string): Promise<void> {
    await this.verify(this.dummyHash, plainPassword);
  }
}
