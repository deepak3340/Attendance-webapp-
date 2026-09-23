import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();

// Load firebase-applet-config.json
const firebaseConfigPath = path.resolve(rootDir, 'firebase-applet-config.json');
let firebaseConfig: Record<string, any> = {};
if (fs.existsSync(firebaseConfigPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf-8'));
  } catch (err) {
    console.warn('Error reading firebase-applet-config.json:', err);
  }
}

export const PROJECT_ID = firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || 'attendance-web-app01';
export const API_KEY = firebaseConfig.apiKey || process.env.FIREBASE_API_KEY || '';
export const AUTH_DOMAIN = firebaseConfig.authDomain || `${PROJECT_ID}.firebaseapp.com`;
export const FIRESTORE_DATABASE_ID = firebaseConfig.firestoreDatabaseId || '(default)';
export const STORAGE_BUCKET = firebaseConfig.storageBucket || `${PROJECT_ID}.firebasestorage.app`;
export const MESSAGING_SENDER_ID = firebaseConfig.messagingSenderId || '';
export const APP_ID = firebaseConfig.appId || '';
export const MEASUREMENT_ID = firebaseConfig.measurementId || 'G-DJ3E49BBM1';

// School Information
export const SCHOOL_NAME = process.env.SCHOOL_NAME || 'संस्कार हाई स्कूल, गरोडा';
export const SCHOOL_LOCATION = process.env.SCHOOL_LOCATION || 'गरोडा';

// Default Institutional Administrator Credentials (Configurable via Environment)
export const DEFAULT_PRINCIPAL_UID = process.env.DEFAULT_PRINCIPAL_UID || '375613';
export const DEFAULT_PRINCIPAL_MOBILE = process.env.DEFAULT_PRINCIPAL_MOBILE || '+919826613340';
export const DEFAULT_PRINCIPAL_PASSWORD = process.env.DEFAULT_PRINCIPAL_PASSWORD || 'Principal@2026!';
export const DEFAULT_PRINCIPAL_NAME = process.env.DEFAULT_PRINCIPAL_NAME || 'दीपक गहलोत';
export const DEFAULT_PRINCIPAL_EMAIL = process.env.DEFAULT_PRINCIPAL_EMAIL || 'principal@garoda.school';

// Cryptographic Secret for Session Signing and Token Verification
export const SECRET_KEY = process.env.SECRET_KEY || 'ams-production-signing-secret-key-2026-garoda-secure';
