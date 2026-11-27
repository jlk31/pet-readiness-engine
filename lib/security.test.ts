import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { parseScenario, parseCredentials, normalisePostcode, isUuid } from './validate.ts';
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
