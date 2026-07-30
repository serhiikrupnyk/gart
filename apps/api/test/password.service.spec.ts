import { PasswordService } from '../src/auth/password.service';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  beforeAll(async () => {
    await passwords.onModuleInit();
  });

  it('produces an argon2id hash with the agreed parameters', async () => {
    const hash = await passwords.hash('correct-horse-battery');

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain('correct-horse-battery');
  });

  it('salts, so the same password never hashes twice the same way', async () => {
    const [first, second] = await Promise.all([passwords.hash('same'), passwords.hash('same')]);

    expect(first).not.toBe(second);
  });

  it('verifies a correct password and rejects a wrong one', async () => {
    const hash = await passwords.hash('correct-horse-battery');

    expect(await passwords.verify(hash, 'correct-horse-battery')).toBe(true);
    expect(await passwords.verify(hash, 'correct-horse-batteru')).toBe(false);
  });

  it('treats an unparseable hash as a failed login rather than an error', async () => {
    await expect(passwords.verify('not-a-hash', 'anything')).resolves.toBe(false);
  });

  it('completes a dummy verification for accounts that do not exist', async () => {
    await expect(passwords.verifyDummy('anything')).resolves.toBeUndefined();
  });
});
