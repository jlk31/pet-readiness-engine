import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { parseScenario, parseCredentials, normalisePostcode, isUuid, parseProductUrl } from './validate.ts';
import { isBlockedIp, safeLookup, safeFetch, BlockedAddress } from './fetch-safe.ts';
import { encrypt, decrypt } from './crypto.ts';

const good = {
  name: '  My flat plan ', postcode: 'se17pb', region: 'London', species_ids: ['indoor-adult-cat'],
  lifestyle: { housing: 'flat', has_garden: false, renting: true, lives_alone: true, allergies: false, hours_out_per_day: 9, noise_tolerance: 3, holiday_nights_per_year: 7 },
  what_ifs: { emergency: true, emergency_year: 3 },
  assumptions: { startAge: 1, generalInflation: 0.03, medicalInflation: 0.06 },
  user_id: '22222222-2222-2222-2222-222222222222', // tampering attempt
};

test('parseScenario: normalises, strips unknown fields', () => {
  const r = parseScenario(good);
  assert.ok(r.ok);
  assert.equal(r.value.name, 'My flat plan');
  assert.equal(r.value.postcode, 'SE1 7PB');
  assert.equal('user_id' in r.value, false);
  const extra = parseScenario({ ...good, lifestyle: { ...good.lifestyle, role: 'admin' } });
  assert.ok(extra.ok && !('role' in extra.value.lifestyle));
});

test('parseScenario: rejects bad input', () => {
  const bad: Record<string, unknown>[] = [
    { name: '' }, { name: 'x'.repeat(81) }, { postcode: 'NOTAPOSTCODE' }, { region: 'Narnia' },
    { species_ids: [] }, { species_ids: ['a', 'b', 'c', 'd'] }, { species_ids: ['dragon'] }, { species_ids: ['medium-dog', 'medium-dog'] },
    { lifestyle: { ...good.lifestyle, hours_out_per_day: 99 } }, { lifestyle: { ...good.lifestyle, housing: 'castle' } },
    { lifestyle: { ...good.lifestyle, renting: 'yes' } }, { what_ifs: { emergency_year: 1.5 } },
    { assumptions: { ...good.assumptions, medicalInflation: Infinity } }, { lifestyle: null },
  ];
  for (const b of bad) assert.equal(parseScenario({ ...good, ...b }).ok, false, JSON.stringify(b));
  assert.equal(parseScenario(null).ok, false);
  assert.equal(parseScenario([]).ok, false);
});

test('credentials, postcode, uuid', () => {
  const f = (email: string, password: string) => { const d = new FormData(); d.set('email', email); d.set('password', password); return d; };
  assert.ok(parseCredentials(f(' A@Example.com ', 'correct horse battery')).ok);
  assert.equal(parseCredentials(f('nope', 'correct horse battery')).ok, false);
  assert.equal(parseCredentials(f('a@b.co', 'short')).ok, false);
  assert.equal(parseCredentials(f('a@b.co', 'x'.repeat(73))).ok, false);
  assert.equal(normalisePostcode('ec1a1bb'), 'EC1A 1BB');
  assert.ok(isUuid('11111111-1111-1111-1111-111111111111'));
  assert.equal(isUuid("1' or '1'='1"), false);
});

test('encrypt/decrypt: round trip, random IV, tamper and owner checks', () => {
  process.env.SCENARIO_ENCRYPTION_KEY = randomBytes(32).toString('base64');
  const a = encrypt('SE1 7PB', 'user-a');
  assert.equal(decrypt(a, 'user-a'), 'SE1 7PB');
  assert.notEqual(encrypt('SE1 7PB', 'user-a'), a);
  assert.ok(!a.includes('SE1'));
  assert.throws(() => decrypt(a, 'user-b'));
  const parts = a.split('.');
  parts[3] = Buffer.from('XXXXXXX').toString('base64');
  assert.throws(() => decrypt(parts.join('.'), 'user-a'));
  process.env.SCENARIO_ENCRYPTION_KEY = 'short';
  assert.throws(() => encrypt('x', 'y'), /32 random bytes/);
});

test('isBlockedIp: private, loopback, link-local, CGNAT, ULA and mapped forms are blocked; public allowed', () => {
  for (const ip of ['127.0.0.1', '0.0.0.0', '10.1.2.3', '172.20.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '224.0.0.1', '::', '::1', 'fd00::1', 'fc00::1', 'fe80::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '64:ff9b::7f00:1', '2002:7f00:1::1', 'not-an-ip']) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '172.32.0.1', '100.128.0.1', '2a00:1450::1', '::ffff:8.8.8.8', '2606:4700::1111']) assert.equal(isBlockedIp(ip), false, ip);
});

test('safeLookup: refuses names that resolve to a private address, including when only one answer is private', async () => {
  const fake = (addrs: string[]) => (_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
    cb(null, addrs.map((address) => ({ address, family: address.includes(':') ? 6 : 4 })));
  const run = (addrs: string[], all: boolean) =>
    new Promise<unknown>((res) => (safeLookup(fake(addrs) as never) as Function)('shop.example.com', { all }, (e: unknown, a: unknown) => res(e ?? a)));
  assert.ok((await run(['127.0.0.1'], true)) instanceof BlockedAddress);
  assert.ok((await run(['8.8.8.8', '10.0.0.5'], false)) instanceof BlockedAddress); // rebinding-style mixed answer
  assert.deepEqual(await run(['8.8.8.8'], true), [{ address: '8.8.8.8', family: 4 }]);
});

test('safeFetch: a hostname that really resolves to loopback is refused before any connection', async () => {
  // "localhost" is rejected by parseProductUrl, so call the lookup directly with the real resolver, then safeFetch with a mapped name.
  const lookup = safeLookup();
  const err = await new Promise<unknown>((res) => (lookup as Function)('localhost', { all: true }, (e: unknown) => res(e)));
  assert.ok(err instanceof BlockedAddress);
  await assert.rejects(safeFetch('https://localhost.localdomain/', { maxBytes: 1000, timeoutMs: 2000, accept: '*/*', lookup: safeLookup(((_h: string, _o: unknown, cb: Function) => cb(null, [{ address: '127.0.0.1', family: 4 }])) as never) }), BlockedAddress);
});

test('parseProductUrl: https shop links only', () => {
  assert.deepEqual(parseProductUrl(' https://www.shop.co.uk/p/bed?id=1#reviews '), { ok: true, value: 'https://www.shop.co.uk/p/bed?id=1' });
  for (const bad of ['http://shop.co.uk/', 'https://127.0.0.1/', 'https://2130706433/', 'https://[::1]/', 'https://10.0.0.1/x', 'https://localhost/', 'https://foo.localhost/', 'https://nas.local/', 'https://user:pw@shop.co.uk/',
    'https://shop.co.uk:8443/', 'https://shop.co.uk./', 'ftp://shop.co.uk/', 'javascript:alert(1)', 'shop.co.uk', '', null, 42, `https://shop.co.uk/${'a'.repeat(2048)}`]) {
    assert.equal(parseProductUrl(bad).ok, false, String(bad).slice(0, 40));
  }
});
