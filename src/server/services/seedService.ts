import * as config from '../config.js';
import { FirebaseService } from './firebaseService.js';
import { hashPassword } from '../utils/authUtils.js';

export async function seedInitialSchoolData(): Promise<void> {
  const principal = await FirebaseService.find_user_by_identifier(config.DEFAULT_PRINCIPAL_UID);
  const nowStr = new Date().toISOString();

  if (!principal) {
    console.log('Initializing principal data in Firestore/store with secure salted hash...');
    const principalEmail = config.DEFAULT_PRINCIPAL_EMAIL;
    const authRes = await FirebaseService.create_auth_user(
      principalEmail,
      config.DEFAULT_PRINCIPAL_PASSWORD,
      config.DEFAULT_PRINCIPAL_NAME,
      config.DEFAULT_PRINCIPAL_MOBILE
    );
    const principalUid = authRes.data?.localId || config.DEFAULT_PRINCIPAL_UID;
    const { hash: pHash, salt: pSalt } = hashPassword(config.DEFAULT_PRINCIPAL_PASSWORD);

    const principalDoc: Record<string, any> = {
      uid: principalUid,
      principalCode: config.DEFAULT_PRINCIPAL_UID,
      name: config.DEFAULT_PRINCIPAL_NAME,
      mobileNumber: config.DEFAULT_PRINCIPAL_MOBILE,
      email: config.DEFAULT_PRINCIPAL_EMAIL,
      authEmail: config.DEFAULT_PRINCIPAL_EMAIL,
      role: 'principal',
      status: 'active',
      schoolName: config.SCHOOL_NAME,
      schoolLocation: config.SCHOOL_LOCATION,
      passwordHash: pHash,
      passwordSalt: pSalt,
      createdAt: nowStr,
      updatedAt: nowStr
    };
    await FirebaseService.set_document('users', principalUid, principalDoc);
    await FirebaseService.set_document('users', config.DEFAULT_PRINCIPAL_UID, principalDoc);

    // School Settings
    await FirebaseService.set_document('schoolSettings', 'school', {
      schoolName: config.SCHOOL_NAME,
      schoolAddress: config.SCHOOL_LOCATION,
      principalUid,
      principalName: config.DEFAULT_PRINCIPAL_NAME,
      principalMobile: config.DEFAULT_PRINCIPAL_MOBILE,
      principalEmail: config.DEFAULT_PRINCIPAL_EMAIL,
      createdAt: nowStr,
      updatedAt: nowStr
    });
  } else if (!principal.passwordHash || principal.tempPassword) {
    // Migrate existing principal to salted hash & remove plaintext tempPassword
    const { hash: pHash, salt: pSalt } = hashPassword(config.DEFAULT_PRINCIPAL_PASSWORD);
    const updated = { ...principal, passwordHash: pHash, passwordSalt: pSalt };
    delete (updated as any).tempPassword;
    await FirebaseService.set_document('users', principal.uid || config.DEFAULT_PRINCIPAL_UID, updated);
    await FirebaseService.set_document('users', config.DEFAULT_PRINCIPAL_UID, updated);
  }

  // Demo data seeding has been completely removed.
  // The system starts with a clean slate ready for real classes, teachers, and students.
  console.log('✅ School database ready with clean slate (no demo records).');
}
