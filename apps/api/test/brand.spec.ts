import { BRAND_LOGO_RULES, BRAND_NAME_MAX_LENGTH, type BrandSettings } from '@gart/shared';
import request from 'supertest';

import {
  createAcceptedClient,
  createHarness,
  createClient,
  type Harness,
  registerTrainer,
  resetDatabase,
  secondRegistration,
  trainerIdFor,
  tokenFromInviteUrl,
  validRegistration,
} from './app-harness';
import { MAGIC_FIXTURES } from './fake-storage';

let harness: Harness;

beforeAll(async () => {
  process.env.AUTH_THROTTLE_LIMIT = '1000';
  harness = await createHarness();
});

afterAll(async () => {
  await harness.close();
});

beforeEach(async () => {
  await resetDatabase(harness.prisma);
  harness.storage.objects.clear();
  harness.storage.deletedKeys.length = 0;
  harness.storage.presignedPuts.length = 0;
});

const server = () => harness.app.getHttpServer();

/** Supertest has no parser for images, so the raw bytes are collected here. */
function binaryParser(
  res: import('http').IncomingMessage,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];

  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => {
    callback(null, Buffer.concat(chunks));
  });
}

/** Walks the real presign → upload → finalize path and returns the new brand. */
async function uploadLogo(
  cookie: string,
  options: { contentType?: string; magic?: Buffer; sizeBytes?: number } = {},
): Promise<BrandSettings> {
  const contentType = options.contentType ?? 'image/png';

  const presigned = await request(server())
    .post('/trainer/brand/logo/presign')
    .set('Cookie', cookie)
    .send({ contentType, sizeBytes: 4096 })
    .expect(201);

  const { key } = presigned.body as { key: string };

  // The browser's direct-to-storage PUT, which never touches the API.
  harness.storage.putObject(
    key,
    contentType,
    options.magic ?? MAGIC_FIXTURES.png,
    options.sizeBytes ?? 4096,
  );

  const finalized = await request(server())
    .post('/trainer/brand/logo/finalize')
    .set('Cookie', cookie)
    .send({ key })
    .expect(200);

  return finalized.body as BrandSettings;
}

describe('brand settings', () => {
  it('round-trips a name and a colour, and clears them again', async () => {
    const cookie = await registerTrainer(harness);

    const initial = await request(server()).get('/trainer/brand').set('Cookie', cookie).expect(200);
    expect(initial.body).toEqual({
      displayName: validRegistration.displayName,
      brandName: null,
      brandLogoUrl: null,
      brandColor: null,
    });

    const saved = await request(server())
      .patch('/trainer/brand')
      .set('Cookie', cookie)
      .send({ brandName: 'Кузня Сили', brandColor: '#2E86DE' })
      .expect(200);

    expect(saved.body).toMatchObject({ brandName: 'Кузня Сили', brandColor: '#2E86DE' });

    const cleared = await request(server())
      .patch('/trainer/brand')
      .set('Cookie', cookie)
      .send({ brandName: null, brandColor: null })
      .expect(200);

    expect(cleared.body).toMatchObject({ brandName: null, brandColor: null });
  });

  it('treats an emptied field as a clear, not as a blank name', async () => {
    const cookie = await registerTrainer(harness);

    await request(server())
      .patch('/trainer/brand')
      .set('Cookie', cookie)
      .send({ brandName: 'Кузня' })
      .expect(200);

    const cleared = await request(server())
      .patch('/trainer/brand')
      .set('Cookie', cookie)
      .send({ brandName: '   ' })
      .expect(200);

    expect((cleared.body as BrandSettings).brandName).toBeNull();
  });

  it('leaves an omitted field alone, so one control can save without the others', async () => {
    const cookie = await registerTrainer(harness);

    await request(server())
      .patch('/trainer/brand')
      .set('Cookie', cookie)
      .send({ brandName: 'Кузня', brandColor: '#123456' })
      .expect(200);

    const partial = await request(server())
      .patch('/trainer/brand')
      .set('Cookie', cookie)
      .send({ brandColor: '#abcdef' })
      .expect(200);

    expect(partial.body).toMatchObject({ brandName: 'Кузня', brandColor: '#abcdef' });
  });

  it('accepts only #RRGGBB, because the value ends up in CSS', async () => {
    const cookie = await registerTrainer(harness);

    for (const brandColor of [
      'rgb(255, 0, 0)',
      'red',
      '#fff',
      '#GGGGGG',
      '#ff5b32; background-image: url(https://evil.test/x)',
      'var(--color-danger)',
      'transparent',
      '#ff5b3',
    ]) {
      await request(server())
        .patch('/trainer/brand')
        .set('Cookie', cookie)
        .send({ brandColor })
        .expect(400);
    }

    // Nothing was stored on the way to refusing.
    const brand = await request(server()).get('/trainer/brand').set('Cookie', cookie).expect(200);
    expect((brand.body as BrandSettings).brandColor).toBeNull();
  });

  it('refuses a name longer than the limit', async () => {
    const cookie = await registerTrainer(harness);

    await request(server())
      .patch('/trainer/brand')
      .set('Cookie', cookie)
      .send({ brandName: 'я'.repeat(BRAND_NAME_MAX_LENGTH + 1) })
      .expect(400);
  });

  it('is closed to a client session and to no session at all', async () => {
    const trainerCookie = await registerTrainer(harness);
    const { clientCookie } = await createAcceptedClient(harness, trainerCookie);

    await request(server()).get('/trainer/brand').set('Cookie', clientCookie).expect(401);
    await request(server())
      .patch('/trainer/brand')
      .set('Cookie', clientCookie)
      .send({ brandName: 'Чуже' })
      .expect(401);
    await request(server()).get('/trainer/brand').expect(401);
    await request(server()).post('/trainer/brand/logo/presign').expect(401);
  });

  it("never touches another trainer's brand", async () => {
    const first = await registerTrainer(harness);
    const second = await registerTrainer(harness, secondRegistration);

    await request(server())
      .patch('/trainer/brand')
      .set('Cookie', first)
      .send({ brandName: 'Перший' })
      .expect(200);

    const other = await request(server()).get('/trainer/brand').set('Cookie', second).expect(200);
    expect((other.body as BrandSettings).brandName).toBeNull();
  });
});

describe('the logo upload', () => {
  it('travels the Step 8 path and lands on a Gart URL, never a foreign host', async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);

    const brand = await uploadLogo(cookie);

    expect(brand.brandLogoUrl).toMatch(
      new RegExp(`^/brand/${trainerId}/logo/[A-Za-z0-9_-]+\\.png$`),
    );

    // The key is server-generated under this trainer's own prefix.
    const [presigned] = harness.storage.presignedPuts;
    expect(presigned?.key.startsWith(`brand/${trainerId}/`)).toBe(true);
  });

  it('rejects every type that is not an allowlisted raster image', async () => {
    const cookie = await registerTrainer(harness);

    for (const contentType of [
      // SVG is the one that matters most: it carries script, and this is the
      // one image Gart serves from its OWN origin.
      'image/svg+xml',
      'image/gif',
      'application/pdf',
      'text/html',
      'video/mp4',
    ]) {
      await request(server())
        .post('/trainer/brand/logo/presign')
        .set('Cookie', cookie)
        .send({ contentType, sizeBytes: 1024 })
        .expect(400);
    }

    expect(harness.storage.presignedPuts).toHaveLength(0);
  });

  it('rejects a file over the cap', async () => {
    const cookie = await registerTrainer(harness);

    await request(server())
      .post('/trainer/brand/logo/presign')
      .set('Cookie', cookie)
      .send({ contentType: 'image/png', sizeBytes: BRAND_LOGO_RULES.maxSizeBytes + 1 })
      .expect(400);
  });

  it('rejects bytes that do not match their declared type, and deletes them', async () => {
    const cookie = await registerTrainer(harness);

    const presigned = await request(server())
      .post('/trainer/brand/logo/presign')
      .set('Cookie', cookie)
      .send({ contentType: 'image/png', sizeBytes: 2048 })
      .expect(201);
    const { key } = presigned.body as { key: string };

    // Declared PNG, actually something else entirely — the case a content-type
    // check alone would wave through.
    harness.storage.putObject(key, 'image/png', MAGIC_FIXTURES.garbage, 2048);

    await request(server())
      .post('/trainer/brand/logo/finalize')
      .set('Cookie', cookie)
      .send({ key })
      .expect(400);

    expect(harness.storage.deletedKeys).toContain(key);

    const brand = await request(server()).get('/trainer/brand').set('Cookie', cookie).expect(200);
    expect((brand.body as BrandSettings).brandLogoUrl).toBeNull();
  });

  it('rejects an object that exceeds the cap once it has actually landed', async () => {
    const cookie = await registerTrainer(harness);

    const presigned = await request(server())
      .post('/trainer/brand/logo/presign')
      .set('Cookie', cookie)
      .send({ contentType: 'image/png', sizeBytes: 1024 })
      .expect(201);
    const { key } = presigned.body as { key: string };

    harness.storage.putObject(
      key,
      'image/png',
      MAGIC_FIXTURES.png,
      BRAND_LOGO_RULES.maxSizeBytes + 1,
    );

    await request(server())
      .post('/trainer/brand/logo/finalize')
      .set('Cookie', cookie)
      .send({ key })
      .expect(400);
    expect(harness.storage.deletedKeys).toContain(key);
  });

  it("refuses a key from another trainer's prefix", async () => {
    const first = await registerTrainer(harness);
    const second = await registerTrainer(harness, secondRegistration);
    const otherId = await trainerIdFor(harness, secondRegistration.email);

    const presigned = await request(server())
      .post('/trainer/brand/logo/presign')
      .set('Cookie', second)
      .send({ contentType: 'image/png', sizeBytes: 1024 })
      .expect(201);
    const { key } = presigned.body as { key: string };

    harness.storage.putObject(key, 'image/png', MAGIC_FIXTURES.png, 1024);
    expect(key.startsWith(`brand/${otherId}/`)).toBe(true);

    // The first trainer tries to adopt an object that is not theirs.
    await request(server())
      .post('/trainer/brand/logo/finalize')
      .set('Cookie', first)
      .send({ key })
      .expect(400);
  });

  it('deletes the superseded object when a logo is replaced or removed', async () => {
    const cookie = await registerTrainer(harness);

    const first = await uploadLogo(cookie);
    const firstUrl = first.brandLogoUrl ?? '';

    const second = await uploadLogo(cookie, {
      contentType: 'image/webp',
      magic: MAGIC_FIXTURES.webp,
    });
    expect(second.brandLogoUrl).not.toBe(firstUrl);
    expect(harness.storage.deletedKeys).toHaveLength(1);

    const removed = await request(server())
      .delete('/trainer/brand/logo')
      .set('Cookie', cookie)
      .expect(200);

    expect((removed.body as BrandSettings).brandLogoUrl).toBeNull();
    expect(harness.storage.deletedKeys).toHaveLength(2);
  });
});

describe('the logo serving route', () => {
  it('serves the bytes with immutable caching and no sniffing', async () => {
    const cookie = await registerTrainer(harness);
    const brand = await uploadLogo(cookie);

    // Unauthenticated on purpose: the invite page shows it before anyone has
    // an account at all.
    const response = await request(server())
      .get(brand.brandLogoUrl ?? '')
      .buffer(true)
      .parse(binaryParser as unknown as (str: string) => unknown)
      .expect(200);

    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    // The API and the web app are separate origins, and helmet defaults every
    // response to `same-origin` — which would block this image from rendering
    // in the client app at all.
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(Buffer.from(response.body as Buffer).equals(MAGIC_FIXTURES.png)).toBe(true);
    // The verified content type is stored, so serving costs one storage call.
    const row = await harness.prisma.trainer.findFirstOrThrow();
    expect(row.brandLogoType).toBe('image/png');
  });

  it('is a logo route, not an object reader — a progress photo is not reachable', async () => {
    const cookie = await registerTrainer(harness);
    const { client } = await createClient(harness, cookie);
    const trainerId = await trainerIdFor(harness, validRegistration.email);

    const presigned = await request(server())
      .post(`/clients/${client.id}/progress/photos/presign`)
      .set('Cookie', cookie)
      .send({ contentType: 'image/png', sizeBytes: 1024 })
      .expect(201);
    const { key } = presigned.body as { key: string };

    harness.storage.putObject(key, 'image/png', MAGIC_FIXTURES.png, 1024);

    // Spelled through the logo route however it can be: the key must match some
    // trainer's OWN brandLogoKey, and a photo key never will.
    const fileName = key.split('/').at(-1) ?? '';
    await request(server()).get(`/brand/${trainerId}/logo/${fileName}`).expect(404);
  });

  it('serves only the CURRENT logo, never anything else in the prefix', async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);

    const first = await uploadLogo(cookie);
    const firstUrl = first.brandLogoUrl ?? '';

    // An object sitting under this trainer's own brand prefix that no trainer
    // references — a superseded logo whose delete failed, say. Reconstructing
    // the key from the path is not enough on its own to keep it unreachable;
    // matching a trainer's OWN brandLogoKey is what does that.
    harness.storage.putObject(
      `brand/${trainerId}/orphan.png`,
      'image/png',
      MAGIC_FIXTURES.png,
      1024,
    );
    await request(server()).get(`/brand/${trainerId}/logo/orphan.png`).expect(404);

    // And a replaced logo stops being served even if its bytes linger.
    const replaced = await uploadLogo(cookie, {
      contentType: 'image/webp',
      magic: MAGIC_FIXTURES.webp,
    });
    harness.storage.putObject(
      `brand/${trainerId}/${firstUrl.split('/').at(-1) ?? ''}`,
      'image/png',
      MAGIC_FIXTURES.png,
      1024,
    );

    await request(server()).get(firstUrl).expect(404);
    await request(server())
      .get(replaced.brandLogoUrl ?? '')
      .expect(200);
  });

  it('answers a malformed filename with the same 404, never a 500', async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);
    await uploadLogo(cookie);

    // A NUL byte reaches Postgres as a value it refuses outright, which turned
    // the promised uniform 404 into a 500 — an answer that says «this input was
    // different from the others».
    for (const fileName of ['%00', 'x%00.png', 'no-extension', 'logo.svg', '..%2Fx.png']) {
      const response = await request(server()).get(`/brand/${trainerId}/logo/${fileName}`);

      expect(response.status).toBe(404);
    }
  });

  it('never lets a miss be cached', async () => {
    const trainerId = 'clzzzzzzzzzzzzzzzzzzzzzz';

    const miss = await request(server()).get(`/brand/${trainerId}/logo/aaaaaaaa.png`).expect(404);

    // A 404 is heuristically cacheable by default, and this is the one URL that
    // must not be remembered as missing — the bytes may arrive a second later.
    expect(miss.headers['cache-control']).toBe('no-store');
  });

  it('cannot be turned into an enumeration oracle', async () => {
    const first = await registerTrainer(harness);
    await registerTrainer(harness, secondRegistration);

    const withLogo = await trainerIdFor(harness, validRegistration.email);
    const withoutLogo = await trainerIdFor(harness, secondRegistration.email);
    const brand = await uploadLogo(first);
    const realFile = (brand.brandLogoUrl ?? '').split('/').at(-1) ?? '';

    // Four different kinds of miss. If any of them answered differently, the
    // route would tell a caller which trainers exist and which have uploaded.
    const misses = await Promise.all([
      // A real trainer with no logo.
      request(server()).get(`/brand/${withoutLogo}/logo/${realFile}`),
      // A real trainer, a well-formed but wrong file.
      request(server()).get(`/brand/${withLogo}/logo/aaaaaaaaaaaaaaaaaaaaaa.png`),
      // A trainer id that does not exist.
      request(server()).get(`/brand/clzzzzzzzzzzzzzzzzzzzzzz/logo/${realFile}`),
      // Another trainer's id paired with this trainer's real file.
      request(server()).get(`/brand/${withoutLogo}/logo/${realFile}`),
    ]);

    for (const miss of misses) {
      expect(miss.status).toBe(404);
    }

    // Identical in shape, not merely in status: a differing body would be the
    // oracle all over again.
    const [reference, ...rest] = misses;
    for (const miss of rest) {
      expect(miss.body).toEqual(reference?.body);
    }
  });

  it('refuses to walk out of the brand prefix', async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);
    await uploadLogo(cookie);

    for (const attempt of ['..%2F..%2Fsecret.png', '%2E%2E%2Fother.png', 'a%2Fb.png']) {
      const response = await request(server()).get(`/brand/${trainerId}/logo/${attempt}`);

      expect(response.status).toBe(404);
    }
  });
});

describe("a client's view of their trainer's brand", () => {
  it('carries the brand into the session, as a Gart URL', async () => {
    const trainerCookie = await registerTrainer(harness);
    await request(server())
      .patch('/trainer/brand')
      .set('Cookie', trainerCookie)
      .send({ brandName: 'Кузня Сили', brandColor: '#2E86DE' })
      .expect(200);
    const brand = await uploadLogo(trainerCookie);

    const { clientCookie } = await createAcceptedClient(harness, trainerCookie);

    const session = await request(server())
      .get('/auth/client/me')
      .set('Cookie', clientCookie)
      .expect(200);

    expect(session.body).toMatchObject({
      trainer: {
        displayName: validRegistration.displayName,
        brandName: 'Кузня Сили',
        brandColor: '#2E86DE',
        brandLogoUrl: brand.brandLogoUrl,
      },
    });
  });

  it("never shows one trainer's brand to another trainer's client", async () => {
    const firstTrainer = await registerTrainer(harness);
    const secondTrainer = await registerTrainer(harness, secondRegistration);

    await request(server())
      .patch('/trainer/brand')
      .set('Cookie', firstTrainer)
      .send({ brandName: 'Перший бренд', brandColor: '#111111' })
      .expect(200);
    await request(server())
      .patch('/trainer/brand')
      .set('Cookie', secondTrainer)
      .send({ brandName: 'Другий бренд', brandColor: '#222222' })
      .expect(200);

    const first = await createAcceptedClient(harness, firstTrainer);
    const second = await createAcceptedClient(harness, secondTrainer, {
      email: 'other-client@example.com',
    });

    const firstSession = await request(server())
      .get('/auth/client/me')
      .set('Cookie', first.clientCookie)
      .expect(200);
    const secondSession = await request(server())
      .get('/auth/client/me')
      .set('Cookie', second.clientCookie)
      .expect(200);

    expect(firstSession.body).toMatchObject({
      trainer: { brandName: 'Перший бренд', brandColor: '#111111' },
    });
    expect(secondSession.body).toMatchObject({
      trainer: { brandName: 'Другий бренд', brandColor: '#222222' },
    });
  });

  it('brands the invite page — the first screen a client ever sees', async () => {
    const trainerCookie = await registerTrainer(harness);
    await request(server())
      .patch('/trainer/brand')
      .set('Cookie', trainerCookie)
      .send({ brandName: 'Кузня Сили', brandColor: '#2E86DE' })
      .expect(200);
    const brand = await uploadLogo(trainerCookie);

    const { inviteUrl } = await createClient(harness, trainerCookie);
    const token = tokenFromInviteUrl(inviteUrl);

    const preview = await request(server()).get(`/invites/${token}`).expect(200);

    expect(preview.body).toEqual({
      trainerName: 'Кузня Сили',
      clientFullName: 'Марія Бондаренко',
      brandLogoUrl: brand.brandLogoUrl,
      brandColor: '#2E86DE',
    });
  });

  it('says nothing about the trainer beyond the brand', async () => {
    const trainerCookie = await registerTrainer(harness);
    const { clientCookie } = await createAcceptedClient(harness, trainerCookie);

    const session = await request(server())
      .get('/auth/client/me')
      .set('Cookie', clientCookie)
      .expect(200);

    const trainer = (session.body as { trainer: Record<string, unknown> }).trainer;
    expect(Object.keys(trainer).sort()).toEqual([
      'brandColor',
      'brandLogoUrl',
      'brandName',
      'displayName',
    ]);
  });
});

describe('a lapsed trainer', () => {
  it('cannot change their brand, but their clients keep seeing it', async () => {
    const trainerCookie = await registerTrainer(harness);
    await request(server())
      .patch('/trainer/brand')
      .set('Cookie', trainerCookie)
      .send({ brandName: 'Кузня Сили' })
      .expect(200);

    const { clientCookie } = await createAcceptedClient(harness, trainerCookie);
    const trainerId = await trainerIdFor(harness, validRegistration.email);
    const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    await harness.prisma.subscription.update({
      where: { trainerId },
      data: { status: 'ENDED', accessUntil: past, endedAt: past, nextChargeAt: null },
    });

    // Read-only, like every other write in the workspace.
    await request(server())
      .patch('/trainer/brand')
      .set('Cookie', trainerCookie)
      .send({ brandName: 'Нова назва' })
      .expect(402);
    await request(server())
      .post('/trainer/brand/logo/presign')
      .set('Cookie', trainerCookie)
      .send({ contentType: 'image/png', sizeBytes: 1024 })
      .expect(402);

    // They can still see it, and so can their client — a client is never
    // punished for their trainer's billing.
    await request(server()).get('/trainer/brand').set('Cookie', trainerCookie).expect(200);

    const session = await request(server())
      .get('/auth/client/me')
      .set('Cookie', clientCookie)
      .expect(200);
    expect(session.body).toMatchObject({ trainer: { brandName: 'Кузня Сили' } });
  });
});

describe('a logo miss', () => {
  it('is never cached — a transient 404 must not stick for a year', async () => {
    const cookie = await registerTrainer(harness);
    const trainerId = await trainerIdFor(harness, validRegistration.email);
    await uploadLogo(cookie);

    const miss = await request(server())
      .get(`/brand/${trainerId}/logo/nothing-here.png`)
      .expect(404);

    // The success path tells browsers the bytes are immutable for a year. If a
    // 404 inherited that, one storage hiccup would hide a trainer's logo from
    // that client for a year with no way to invalidate it.
    expect(miss.headers['cache-control'] ?? '').not.toContain('immutable');
    expect(miss.headers['cache-control'] ?? '').not.toContain('max-age=31536000');
  });
});
