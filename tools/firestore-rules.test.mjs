/**
 * Firestore security rules tests.
 *
 *   npm run test:rules
 *
 * Runs against the Firestore emulator (started for you by `firebase emulators:exec`,
 * see the npm script). No real project is touched and no login is needed.
 *
 * Covers every path found in the recon of index.html:
 *   users/{uid}
 *   users/{uid}/uploads/{dealId}
 *   users/{uid}/deals/{dealId}
 * plus the deny-by-default floor for anything else.
 */

import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} from '@firebase/rules-unit-testing';
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, orderBy
} from 'firebase/firestore';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

let testEnv;
let passCount = 0;
let failCount = 0;
const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push({ name, status: 'PASS' });
    passCount++;
    console.log(`✓ ${name}`);
  } catch (err) {
    results.push({ name, status: 'FAIL', error: err.message });
    failCount++;
    console.error(`✗ ${name}: ${err.message}`);
  }
}

// --- identities -------------------------------------------------------------
// Google sign-in supplies email; email_verified is deliberately not relied on.
const REP_A = { sub: 'repA', email: 'repa@futurimedia.com', email_verified: true };
const REP_B = { sub: 'repB', email: 'repb@futurimedia.com', email_verified: true };
const ADMIN = { sub: 'adminU', email: 'danwise@futurimedia.com', email_verified: true };
const SUPER = { sub: 'superU', email: 'sabrinacarlo@futurimedia.com', email_verified: true };
const ANSTANDIG = { sub: 'anst', email: 'someone@anstandig.com', email_verified: true };
const OUTSIDER = { sub: 'outsider', email: 'someone@gmail.com', email_verified: true };
const UNVERIFIED = { sub: 'unver', email: 'unver@futurimedia.com', email_verified: false };

function ctx(token) {
  return testEnv.authenticatedContext(token.sub, token);
}
function db(token) {
  return ctx(token).firestore();
}
function anonDb() {
  return testEnv.unauthenticatedContext().firestore();
}

function profile(uid, email, role) {
  return { uid, email, name: 'Test', role, permOverrides: {}, createdAt: new Date() };
}

async function main() {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-futuri-rules',
    firestore: {
      rules: readFileSync(join(ROOT, 'firestore.rules'), 'utf8'),
      host: '127.0.0.1',
      port: 8080
    }
  });

  // Seed profiles and one deal per rep, bypassing rules.
  await testEnv.withSecurityRulesDisabled(async (c) => {
    const d = c.firestore();
    await setDoc(doc(d, 'users', 'repA'), profile('repA', REP_A.email, 'staff'));
    await setDoc(doc(d, 'users', 'repB'), profile('repB', REP_B.email, 'staff'));
    await setDoc(doc(d, 'users', 'adminU'), profile('adminU', ADMIN.email, 'admin'));
    await setDoc(doc(d, 'users', 'superU'), profile('superU', SUPER.email, 'superadmin'));
    await setDoc(doc(d, 'users', 'anst'), profile('anst', ANSTANDIG.email, 'staff'));
    await setDoc(doc(d, 'users', 'legacyView'), profile('legacyView', 'legacy@futurimedia.com', 'view'));
    // A profile saved before `role` existed. ensureUserDoc backfills
    // uid/email/name/createdAt on next sign-in and must not be blocked.
    await setDoc(doc(d, 'users', 'noRole'), { email: 'norole@futurimedia.com' });
    for (const uid of ['repA', 'repB']) {
      await setDoc(doc(d, 'users', uid, 'uploads', 'deal1'), { name: `${uid} deal`, createdAt: new Date() });
      await setDoc(doc(d, 'users', uid, 'deals', 'legacy1'), { name: `${uid} legacy`, createdAt: new Date() });
    }
  });

  // === rep reads and writes their OWN deals ================================

  await test('rep A reads own profile', async () => {
    await assertSucceeds(getDoc(doc(db(REP_A), 'users', 'repA')));
  });

  await test('rep A reads own deal', async () => {
    await assertSucceeds(getDoc(doc(db(REP_A), 'users', 'repA', 'uploads', 'deal1')));
  });

  await test('rep A lists own deals', async () => {
    await assertSucceeds(getDocs(collection(db(REP_A), 'users', 'repA', 'uploads')));
  });

  await test('rep A saves a new deal (addDoc to own uploads)', async () => {
    await assertSucceeds(
      addDoc(collection(db(REP_A), 'users', 'repA', 'uploads'), { name: 'new', createdAt: new Date() })
    );
  });

  await test('rep A updates and deletes own deal', async () => {
    const ref = doc(db(REP_A), 'users', 'repA', 'uploads', 'deal1');
    await assertSucceeds(updateDoc(ref, { name: 'renamed' }));
    await assertSucceeds(deleteDoc(doc(db(REP_A), 'users', 'repA', 'uploads', 'deal1')));
  });

  await test('rep A reads own legacy deals collection', async () => {
    await assertSucceeds(getDoc(doc(db(REP_A), 'users', 'repA', 'deals', 'legacy1')));
  });

  await test('rep A cannot WRITE the legacy deals collection', async () => {
    await assertFails(
      setDoc(doc(db(REP_A), 'users', 'repA', 'deals', 'legacy1'), { name: 'nope' })
    );
  });

  await test('rep A updates own profile (permOverrides)', async () => {
    await assertSucceeds(
      updateDoc(doc(db(REP_A), 'users', 'repA'), { permOverrides: { pricing_override: true } })
    );
  });

  await test('rep A cannot change their OWN role', async () => {
    await assertFails(updateDoc(doc(db(REP_A), 'users', 'repA'), { role: 'superadmin' }));
    await assertFails(updateDoc(doc(db(REP_A), 'users', 'repA'), { role: 'admin' }));
  });

  // === rep A against rep B =================================================

  await test("rep A cannot read rep B's profile", async () => {
    await assertFails(getDoc(doc(db(REP_A), 'users', 'repB')));
  });

  await test("rep A cannot read rep B's deals", async () => {
    await assertFails(getDoc(doc(db(REP_A), 'users', 'repB', 'uploads', 'deal1')));
    await assertFails(getDocs(collection(db(REP_A), 'users', 'repB', 'uploads')));
  });

  await test("rep A cannot write rep B's deals", async () => {
    await assertFails(
      setDoc(doc(db(REP_A), 'users', 'repB', 'uploads', 'injected'), { name: 'nope' })
    );
    await assertFails(
      addDoc(collection(db(REP_A), 'users', 'repB', 'uploads'), { name: 'nope' })
    );
  });

  await test("rep A cannot write rep B's profile", async () => {
    await assertFails(updateDoc(doc(db(REP_A), 'users', 'repB'), { role: 'staff' }));
    await assertFails(updateDoc(doc(db(REP_A), 'users', 'repB'), { name: 'hacked' }));
  });

  await test('rep A cannot list the users collection', async () => {
    await assertFails(getDocs(collection(db(REP_A), 'users')));
  });

  // === admin reads everything, writes nothing but roles ====================

  await test("admin reads rep B's profile and deals", async () => {
    await assertSucceeds(getDoc(doc(db(ADMIN), 'users', 'repB')));
    await assertSucceeds(getDoc(doc(db(ADMIN), 'users', 'repB', 'uploads', 'deal1')));
    await assertSucceeds(getDoc(doc(db(ADMIN), 'users', 'repB', 'deals', 'legacy1')));
  });

  await test("admin lists rep B's deals", async () => {
    await assertSucceeds(getDocs(collection(db(ADMIN), 'users', 'repB', 'uploads')));
  });

  await test('admin lists the users collection (ordered, as the app does)', async () => {
    await assertSucceeds(getDocs(collection(db(ADMIN), 'users')));
    await assertSucceeds(getDocs(query(collection(db(ADMIN), 'users'), orderBy('createdAt', 'desc'))));
  });

  await test("admin cannot WRITE rep B's deals", async () => {
    await assertFails(
      setDoc(doc(db(ADMIN), 'users', 'repB', 'uploads', 'deal1'), { name: 'admin edit' })
    );
    await assertFails(deleteDoc(doc(db(ADMIN), 'users', 'repB', 'uploads', 'deal1')));
  });

  await test("admin (role 'admin') cannot change roles -- manage_roles is superadmin only", async () => {
    await assertFails(updateDoc(doc(db(ADMIN), 'users', 'repB'), { role: 'admin' }));
  });

  await test("superadmin CAN change another rep's role", async () => {
    await assertSucceeds(updateDoc(doc(db(SUPER), 'users', 'repB'), { role: 'admin' }));
  });

  await test('superadmin cannot change anything else on another profile', async () => {
    await assertFails(updateDoc(doc(db(SUPER), 'users', 'repB'), { name: 'renamed by super' }));
    await assertFails(
      updateDoc(doc(db(SUPER), 'users', 'repB'), { role: 'staff', name: 'both' })
    );
  });

  await test('superadmin cannot change their OWN role', async () => {
    await assertFails(updateDoc(doc(db(SUPER), 'users', 'superU'), { role: 'staff' }));
  });

  await test('a role may only be set to a known value', async () => {
    await assertFails(updateDoc(doc(db(SUPER), 'users', 'repB'), { role: 'owner' }));
  });

  await test("superadmin cannot write rep B's deals either", async () => {
    await assertFails(
      setDoc(doc(db(SUPER), 'users', 'repB', 'uploads', 'deal1'), { name: 'nope' })
    );
  });

  // === first-login document creation =======================================

  await test("new rep creates their own profile as 'staff'", async () => {
    const t = { sub: 'newRep', email: 'newrep@futurimedia.com', email_verified: true };
    await assertSucceeds(
      setDoc(doc(db(t), 'users', 'newRep'), profile('newRep', t.email, 'staff'))
    );
  });

  await test('new rep cannot create themselves as admin or superadmin', async () => {
    const t = { sub: 'sneak', email: 'sneak@futurimedia.com', email_verified: true };
    await assertFails(
      setDoc(doc(db(t), 'users', 'sneak'), profile('sneak', t.email, 'superadmin'))
    );
    await assertFails(
      setDoc(doc(db(t), 'users', 'sneak'), profile('sneak', t.email, 'admin'))
    );
  });

  await test("new rep cannot create a profile for someone else's uid", async () => {
    const t = { sub: 'imposter', email: 'imposter@futurimedia.com', email_verified: true };
    await assertFails(
      setDoc(doc(db(t), 'users', 'repB'), profile('repB', t.email, 'staff'))
    );
  });

  await test('profile create must carry the caller\'s own uid and email', async () => {
    const t = { sub: 'mismatch', email: 'mismatch@futurimedia.com', email_verified: true };
    await assertFails(
      setDoc(doc(db(t), 'users', 'mismatch'), profile('somebodyElse', t.email, 'staff'))
    );
    await assertFails(
      setDoc(doc(db(t), 'users', 'mismatch'), profile('mismatch', 'other@futurimedia.com', 'staff'))
    );
  });

  await test('a legacy profile with NO role field can still be backfilled', async () => {
    // Regression: roleUnchanged() used request.resource.data.role, which THROWS
    // when the field is absent. A rule that errors denies, so the backfill was
    // silently rejected for any profile predating the role field.
    const t = { sub: 'noRole', email: 'norole@futurimedia.com', email_verified: true };
    await assertSucceeds(
      updateDoc(doc(db(t), 'users', 'noRole'), { uid: 'noRole', name: 'Backfilled' })
    );
  });

  await test('a legacy profile with no role still cannot grant itself one', async () => {
    const t = { sub: 'noRole', email: 'norole@futurimedia.com', email_verified: true };
    await assertFails(updateDoc(doc(db(t), 'users', 'noRole'), { role: 'superadmin' }));
    await assertFails(updateDoc(doc(db(t), 'users', 'noRole'), { role: 'admin' }));
  });

  await test('a profile with no role is treated as a plain rep, not an admin', async () => {
    const t = { sub: 'noRole', email: 'norole@futurimedia.com', email_verified: true };
    await assertFails(getDoc(doc(db(t), 'users', 'repB')));
    await assertFails(getDocs(collection(db(t), 'users')));
  });

  await test("legacy 'view' account self-migrates to 'staff' (a de-escalation)", async () => {
    const t = { sub: 'legacyView', email: 'legacy@futurimedia.com', email_verified: true };
    await assertSucceeds(updateDoc(doc(db(t), 'users', 'legacyView'), { role: 'staff' }));
  });

  // === domain and sign-in ==================================================

  await test('anstandig.com account works like any other rep', async () => {
    await assertSucceeds(getDoc(doc(db(ANSTANDIG), 'users', 'anst')));
    await assertSucceeds(
      addDoc(collection(db(ANSTANDIG), 'users', 'anst', 'uploads'), { name: 'ok', createdAt: new Date() })
    );
    await assertFails(getDoc(doc(db(ANSTANDIG), 'users', 'repB')));
  });

  await test('outside domain is denied everywhere', async () => {
    await assertFails(getDoc(doc(db(OUTSIDER), 'users', 'outsider')));
    await assertFails(
      setDoc(doc(db(OUTSIDER), 'users', 'outsider'), profile('outsider', OUTSIDER.email, 'staff'))
    );
    await assertFails(getDoc(doc(db(OUTSIDER), 'users', 'repA', 'uploads', 'deal1')));
    await assertFails(getDocs(collection(db(OUTSIDER), 'users')));
  });

  await test('a lookalike domain does not pass (futurimedia.com.evil.com)', async () => {
    const t = { sub: 'evil', email: 'x@futurimedia.com.evil.com', email_verified: true };
    await assertFails(setDoc(doc(db(t), 'users', 'evil'), profile('evil', t.email, 'staff')));
  });

  await test('unverified futurimedia address is still allowed (Google verifies at sign-in)', async () => {
    await assertSucceeds(
      setDoc(doc(db(UNVERIFIED), 'users', 'unver'), profile('unver', UNVERIFIED.email, 'staff'))
    );
  });

  await test('signed out is denied everywhere', async () => {
    await assertFails(getDoc(doc(anonDb(), 'users', 'repA')));
    await assertFails(getDoc(doc(anonDb(), 'users', 'repA', 'uploads', 'deal1')));
    await assertFails(getDocs(collection(anonDb(), 'users')));
    await assertFails(setDoc(doc(anonDb(), 'users', 'repA'), { role: 'superadmin' }));
    await assertFails(addDoc(collection(anonDb(), 'users', 'repA', 'uploads'), { name: 'nope' }));
  });

  // === anything not in the rules ===========================================

  await test('a path not in the rules is denied, signed in or not', async () => {
    await assertFails(getDoc(doc(db(REP_A), 'config', 'anything')));
    await assertFails(setDoc(doc(db(REP_A), 'config', 'anything'), { a: 1 }));
    await assertFails(getDoc(doc(db(SUPER), 'rateCards', 'current')));
    await assertFails(setDoc(doc(db(SUPER), 'rateCards', 'current'), { a: 1 }));
    await assertFails(getDoc(doc(anonDb(), 'config', 'anything')));
    // an unexpected subcollection under a user is denied too
    await assertFails(getDoc(doc(db(REP_A), 'users', 'repA', 'secrets', 'x')));
    await assertFails(setDoc(doc(db(REP_A), 'users', 'repA', 'secrets', 'x'), { a: 1 }));
  });

  await testEnv.cleanup();

  console.log('\n=== Firestore Rules Test Results ===\n');
  console.log(`Total: ${passCount + failCount} | Passed: ${passCount} | Failed: ${failCount}\n`);
  if (failCount > 0) process.exitCode = 1;
}

main().catch(err => {
  console.error('Rules test run failed:', err);
  process.exitCode = 1;
});
