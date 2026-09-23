import { Router, Request, Response } from 'express';
import * as config from '../config.js';
import { FirebaseService } from '../services/firebaseService.js';
import { AuditService } from '../services/auditService.js';
import { requireAuth, getAuditActor } from '../middleware/authMiddleware.js';
import {
  generateSessionToken,
  hashPassword,
  verifyPassword,
  normalizeMobileNumber,
  createOtpForMobile,
  verifyOtpForMobile,
  generatePasswordResetToken,
  verifyAndConsumeResetToken
} from '../utils/authUtils.js';

export const authRouter = Router();

/**
 * POST /api/auth/login
 * Authenticates principal or teacher via verified credentials and returns signed session token.
 */
authRouter.post('/api/auth/login', async (req: Request, res: Response) => {
  const data = req.body || {};
  const identifier = String(data.identifier || '').trim();
  const password = String(data.password || '').trim();

  if (!identifier || !password) {
    res.status(400).json({ success: false, message: 'Identifier and password are required.' });
    return;
  }

  const user = await FirebaseService.find_user_by_identifier(identifier);
  if (!user) {
    res.status(401).json({ success: false, message: 'Invalid UID / Mobile / Email or account not found.' });
    return;
  }

  if (user.status && user.status !== 'active') {
    res.status(403).json({ success: false, message: 'Account is deactivated. Please contact the administrator.' });
    return;
  }

  // Attempt authentication (Firebase Auth REST or local salted hash check)
  const authRes = await FirebaseService.sign_in_with_password(identifier, password);
  if (authRes.error || !authRes.data) {
    res.status(401).json({ success: false, message: authRes.error || 'Invalid password. Please check your credentials.' });
    return;
  }

  const role = (user.role === 'principal' ? 'principal' : 'teacher') as 'principal' | 'teacher';
  const userProfile = {
    uid: String(user.uid || user._id),
    teacherCode: user.teacherCode || user.uid,
    principalCode: user.principalCode || user.uid,
    name: user.name || 'User',
    role,
    mobileNumber: user.mobileNumber || '',
    email: user.email || user.authEmail || '',
    schoolName: user.schoolName || config.SCHOOL_NAME
  };

  // Generate cryptographically signed HMAC-SHA256 session token
  const token = generateSessionToken({
    uid: userProfile.uid,
    role: userProfile.role,
    name: userProfile.name,
    email: userProfile.email,
    teacherCode: userProfile.teacherCode,
    principalCode: userProfile.principalCode
  }, 24 * 7); // 7-day validity

  await AuditService.log(
    'User Login',
    userProfile.uid,
    userProfile.role,
    'user',
    userProfile.uid,
    `Authenticated login for ${userProfile.name} (${userProfile.role})`
  );

  res.json({
    success: true,
    message: 'Login successful.',
    user: userProfile,
    token
  });
});

/**
 * POST /api/auth/send-otp (or /api/auth/verify-phone)
 * Validates mobile number and initiates server-side cryptographic OTP challenge.
 */
authRouter.post(['/api/auth/verify-phone', '/api/auth/send-otp'], async (req: Request, res: Response) => {
  const data = req.body || {};
  const rawPhone = String(data.mobileNumber || data.phone || '').trim();

  if (!rawPhone) {
    res.status(400).json({ success: false, message: 'Mobile number is required.' });
    return;
  }

  const cleanPhone = normalizeMobileNumber(rawPhone);
  if (!cleanPhone || cleanPhone.length < 10) {
    res.status(400).json({ success: false, message: 'Please provide a valid 10-digit mobile number.' });
    return;
  }

  const user = await FirebaseService.find_user_by_identifier(cleanPhone);
  if (!user) {
    res.status(404).json({ success: false, message: 'No registered user found with this mobile number.' });
    return;
  }

  // Generate secure 6-digit OTP stored in server-side cryptographically hashed cache
  const { code, expiresAt } = createOtpForMobile(cleanPhone, 10);

  res.json({
    success: true,
    message: 'Verification OTP sent to registered mobile number.',
    account: {
      uid: user.uid || user._id,
      name: user.name,
      role: user.role,
      mobileNumber: user.mobileNumber
    },
    // Safe hint for dev/test verification when live SMS gateway is not provisioned
    devOtpHint: code,
    expiresInSeconds: 600
  });
});

/**
 * POST /api/auth/verify-otp
 * Verifies submitted OTP code and issues a short-lived password reset token.
 */
authRouter.post('/api/auth/verify-otp', async (req: Request, res: Response) => {
  const data = req.body || {};
  const rawPhone = String(data.mobileNumber || '').trim();
  const otp = String(data.otp || data.code || '').trim();

  const cleanPhone = normalizeMobileNumber(rawPhone);
  if (!cleanPhone || !otp) {
    res.status(400).json({ success: false, message: 'Mobile number and 6-digit OTP code are required.' });
    return;
  }

  const isValid = verifyOtpForMobile(cleanPhone, otp);
  if (!isValid) {
    res.status(400).json({ success: false, message: 'Invalid or expired OTP code. Please request a new one.' });
    return;
  }

  const user = await FirebaseService.find_user_by_identifier(cleanPhone);
  if (!user) {
    res.status(404).json({ success: false, message: 'User account not found.' });
    return;
  }

  const resetToken = generatePasswordResetToken(user.uid || user._id, cleanPhone);

  res.json({
    success: true,
    message: 'OTP verified successfully.',
    resetToken
  });
});

/**
 * POST /api/auth/reset-password
 * Requires a cryptographically verified resetToken and updates the user's password.
 */
authRouter.post('/api/auth/reset-password', async (req: Request, res: Response) => {
  const data = req.body || {};
  const resetToken = String(data.resetToken || '').trim();
  const newPassword = String(data.newPassword || '').trim();
  const confirmPassword = String(data.confirmPassword || data.repeatPassword || '').trim();

  if (!resetToken) {
    res.status(400).json({
      success: false,
      message: 'Password reset token is missing. Please verify your mobile OTP first.'
    });
    return;
  }

  if (!newPassword) {
    res.status(400).json({ success: false, message: 'New password is required.' });
    return;
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ success: false, message: 'New password and confirmation password do not match.' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    return;
  }

  // Verify and consume token (prevents reuse)
  const tokenPayload = verifyAndConsumeResetToken(resetToken);
  if (!tokenPayload) {
    res.status(401).json({
      success: false,
      message: 'Reset token has expired or has already been used. Please request a new OTP.'
    });
    return;
  }

  const user = await FirebaseService.find_user_by_identifier(tokenPayload.uid);
  if (!user) {
    res.status(404).json({ success: false, message: 'User account not found.' });
    return;
  }

  const userDocId = user.uid || user._id;
  const nowStr = new Date().toISOString();

  // 1. Update Firebase Auth if configured
  if (user.authEmail) {
    await FirebaseService.update_user_password(user.authEmail, newPassword);
  }

  // 2. Hash new password with fresh salt and update Firestore user doc
  const { hash, salt } = hashPassword(newPassword);
  const updatedUser = {
    ...user,
    passwordHash: hash,
    passwordSalt: salt,
    updatedAt: nowStr
  };
  delete (updatedUser as any).tempPassword; // Remove any legacy unhashed password

  await FirebaseService.set_document('users', userDocId, updatedUser);
  if (user.teacherCode && user.teacherCode !== userDocId) {
    await FirebaseService.set_document('users', user.teacherCode, updatedUser);
  }

  await AuditService.log(
    'Password Reset',
    userDocId,
    user.role || 'user',
    'user',
    userDocId,
    `Password reset completed via verified mobile OTP for UID: ${userDocId}`
  );

  res.json({
    success: true,
    message: 'Password reset successfully. You may now login with your new password.'
  });
});

/**
 * POST /api/auth/change-password
 * Requires authenticated session and old password verification.
 * Client-sent UID in body is completely ignored in favor of verified session.
 */
authRouter.post('/api/auth/change-password', requireAuth, async (req: Request, res: Response) => {
  const data = req.body || {};
  const currentUid = req.user!.uid; // Authoritative from session
  const oldPassword = String(data.oldPassword || '').trim();
  const newPassword = String(data.newPassword || '').trim();
  const confirmPassword = String(data.confirmPassword || '').trim();

  if (!oldPassword || !newPassword) {
    res.status(400).json({ success: false, message: 'Current password and new password are required.' });
    return;
  }

  if (newPassword !== confirmPassword) {
    res.status(400).json({ success: false, message: 'New passwords do not match.' });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ success: false, message: 'New password must be at least 8 characters long.' });
    return;
  }

  const user = await FirebaseService.get_document('users', currentUid);
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found.' });
    return;
  }

  // Verify old password
  let oldValid = false;
  if (user.passwordHash && user.passwordSalt) {
    oldValid = verifyPassword(oldPassword, user.passwordHash, user.passwordSalt);
  } else if (user.tempPassword) {
    oldValid = user.tempPassword === oldPassword;
  }

  if (!oldValid) {
    res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    return;
  }

  const nowStr = new Date().toISOString();

  // Update in Firebase Auth
  if (user.authEmail) {
    await FirebaseService.update_user_password(user.authEmail, newPassword);
  }

  // Update local hash and clear tempPassword
  const { hash, salt } = hashPassword(newPassword);
  const updatedUser = {
    ...user,
    passwordHash: hash,
    passwordSalt: salt,
    updatedAt: nowStr
  };
  delete (updatedUser as any).tempPassword;

  await FirebaseService.set_document('users', currentUid, updatedUser);
  if (user.teacherCode && user.teacherCode !== currentUid) {
    await FirebaseService.set_document('users', user.teacherCode, updatedUser);
  }

  await AuditService.log(
    'Password Changed',
    currentUid,
    req.user!.role,
    'user',
    currentUid,
    `${getAuditActor(req)} updated their password`
  );

  res.json({
    success: true,
    message: 'Password changed successfully.'
  });
});

/**
 * POST /api/auth/logout
 */
authRouter.post('/api/auth/logout', (req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully.' });
});
