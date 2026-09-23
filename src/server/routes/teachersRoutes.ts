import { Router, Request, Response } from 'express';
import * as config from '../config.js';
import { FirebaseService } from '../services/firebaseService.js';
import { AuditService } from '../services/auditService.js';
import { requireAuth, requireRole, getAuditActor } from '../middleware/authMiddleware.js';
import { hashPassword, normalizeMobileNumber } from '../utils/authUtils.js';

export const teachersRouter = Router();

/**
 * GET /api/teachers/generate-uid
 * Generate a 6-digit unique teacher code
 */
teachersRouter.get('/api/teachers/generate-uid', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const code = await FirebaseService.generate_unique_teacher_code();
  res.json({ success: true, teacherCode: code });
});

/**
 * GET /api/teachers
 * Accessible to authenticated users (Principal / Teachers)
 */
teachersRouter.get('/api/teachers', requireAuth, async (req: Request, res: Response) => {
  let filterStatus = String(req.query.status || '').trim().toLowerCase();
  if (filterStatus.includes('?')) {
    filterStatus = filterStatus.split('?')[0].trim();
  }
  const filterQ = String(req.query.q || '').trim().toLowerCase();

  const allTeachers = await FirebaseService.list_documents('teachers');
  const allUsers = await FirebaseService.list_documents('users');
  const userMap = new Map<string, any>();
  for (const u of allUsers) {
    if (u.teacherCode) userMap.set(u.teacherCode, u);
    if (u.uid) userMap.set(u.uid, u);
  }

  const results = [];
  for (const t of allTeachers) {
    const code = String(t.teacherCode || '').trim();
    const name = String(t.name || '').trim();
    const mobile = String(t.mobileNumber || '').trim();
    const status = String(t.status || 'active').toLowerCase();
    if (String(t._id || t.uid || '').startsWith('_') || !t.name) continue;

    if (filterStatus && status !== filterStatus) continue;
    if (filterQ) {
      const matchCode = code.toLowerCase().includes(filterQ);
      const matchName = name.toLowerCase().includes(filterQ);
      const matchMobile = mobile.includes(filterQ);
      if (!matchCode && !matchName && !matchMobile) continue;
    }

    const u = userMap.get(t.uid) || userMap.get(code) || {};
    results.push({
      uid: t.uid || t._id,
      teacherCode: code,
      name,
      mobileNumber: mobile,
      email: t.email || u.email || `teacher_${code}@school.internal`,
      status: t.status || 'active',
      createdAt: t.createdAt || u.createdAt
    });
  }

  results.sort((a, b) => a.name.localeCompare(b.name));

  res.json({
    success: true,
    teachers: results,
    count: results.length
  });
});

/**
 * POST /api/teachers
 * Restricted to principal only
 */
teachersRouter.post('/api/teachers', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const data = req.body || {};
  const name = String(data.name || '').trim();
  const mobileNumber = String(data.mobileNumber || '').trim();
  const customCode = String(data.teacherCode || '').trim();
  const email = String(data.email || '').trim().toLowerCase();
  const password = String(data.password || '').trim();
  const status = String(data.status || 'active').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';

  if (!name || !mobileNumber || !password) {
    res.status(400).json({ success: false, message: 'Teacher name, mobile number, and initial password are required.' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    return;
  }

  const teacherCode = customCode || (await FirebaseService.generate_unique_teacher_code());

  // Check code uniqueness
  const existingByCode = await FirebaseService.get_document('users', teacherCode);
  if (existingByCode) {
    res.status(409).json({ success: false, message: `Teacher code '${teacherCode}' is already in use.` });
    return;
  }

  // Check mobile uniqueness strictly (10-digit normalized)
  const cleanMobile = normalizeMobileNumber(mobileNumber);
  const existingUsers = await FirebaseService.list_documents('users');
  for (const u of existingUsers) {
    const uMob = normalizeMobileNumber(u.mobileNumber || '');
    if (uMob && uMob === cleanMobile) {
      res.status(409).json({ success: false, message: `Mobile number '${mobileNumber}' is already registered.` });
      return;
    }
  }

  const authEmail = email || `teacher_${teacherCode}@school.internal`;
  const authRes = await FirebaseService.create_auth_user(authEmail, password, name, mobileNumber);
  const teacherUid = authRes.data?.localId || `teacher_${teacherCode}`;
  const nowStr = new Date().toISOString();

  // Salt and hash the password securely - NEVER store plaintext tempPassword
  const { hash: pHash, salt: pSalt } = hashPassword(password);

  const teacherDoc = {
    uid: teacherUid,
    teacherCode,
    name,
    mobileNumber,
    email: authEmail,
    authEmail,
    role: 'teacher',
    status,
    passwordHash: pHash,
    passwordSalt: pSalt,
    schoolName: config.SCHOOL_NAME,
    createdAt: nowStr,
    updatedAt: nowStr
  };

  await FirebaseService.set_document('users', teacherUid, teacherDoc);
  await FirebaseService.set_document('users', teacherCode, teacherDoc);

  await FirebaseService.set_document('teachers', teacherUid, {
    uid: teacherUid,
    teacherCode,
    name,
    mobileNumber,
    email: authEmail,
    status,
    createdAt: nowStr,
    updatedAt: nowStr
  });

  await AuditService.log(
    'Teacher Created',
    req.user!.uid,
    req.user!.role,
    'teacher',
    teacherUid,
    `${getAuditActor(req)} created teacher ${name} (UID: ${teacherCode}, Mobile: ${mobileNumber})`
  );

  res.json({
    success: true,
    message: 'Teacher account created successfully.',
    teacher: {
      uid: teacherUid,
      teacherCode,
      name,
      mobileNumber,
      email: authEmail,
      status
    }
  });
});

/**
 * PUT /api/teachers/:uid
 * Restricted to principal only
 */
teachersRouter.put('/api/teachers/:uid', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const uid = req.params.uid;
  const data = req.body || {};

  const existing = (await FirebaseService.get_document('teachers', uid)) || (await FirebaseService.get_document('users', uid));
  if (!existing) {
    res.status(404).json({ success: false, message: 'Teacher not found.' });
    return;
  }

  const name = String(data.name || existing.name).trim();
  const mobileNumber = String(data.mobileNumber || existing.mobileNumber).trim();
  const status = String(data.status || existing.status || 'active').trim();
  const teacherCode = existing.teacherCode;

  // Check mobile collision
  const cleanMobile = normalizeMobileNumber(mobileNumber);
  const existingUsers = await FirebaseService.list_documents('users');
  for (const u of existingUsers) {
    const uUid = u.uid || u._id;
    if (uUid !== uid && u.teacherCode !== teacherCode) {
      const uMob = normalizeMobileNumber(u.mobileNumber || '');
      if (uMob && uMob === cleanMobile) {
        res.status(409).json({ success: false, message: `Mobile number '${mobileNumber}' is already in use by another user.` });
        return;
      }
    }
  }

  const nowStr = new Date().toISOString();
  const updatedTeacher = {
    ...existing,
    name,
    mobileNumber,
    status,
    updatedAt: nowStr
  };

  await FirebaseService.set_document('teachers', uid, updatedTeacher);

  // Update user documents
  const userDoc = (await FirebaseService.get_document('users', uid)) || {};
  const updatedUserDoc = {
    ...userDoc,
    name,
    mobileNumber,
    status,
    updatedAt: nowStr
  };
  await FirebaseService.set_document('users', uid, updatedUserDoc);
  if (teacherCode && teacherCode !== uid) {
    await FirebaseService.set_document('users', teacherCode, updatedUserDoc);
  }

  await AuditService.log(
    'Teacher Updated',
    req.user!.uid,
    req.user!.role,
    'teacher',
    uid,
    `${getAuditActor(req)} updated details for teacher ${name}`
  );

  res.json({
    success: true,
    message: 'Teacher updated successfully.',
    teacher: updatedTeacher
  });
});

/**
 * PATCH /api/teachers/:uid/status
 * Restricted to principal only
 */
teachersRouter.patch('/api/teachers/:uid/status', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const uid = req.params.uid;
  const { status } = req.body || {};

  if (!status || !['active', 'inactive'].includes(status)) {
    res.status(400).json({ success: false, message: 'Valid status (active/inactive) is required.' });
    return;
  }

  const existing = (await FirebaseService.get_document('teachers', uid)) || (await FirebaseService.get_document('users', uid));
  if (!existing) {
    res.status(404).json({ success: false, message: 'Teacher not found.' });
    return;
  }

  const nowStr = new Date().toISOString();
  const updatedDoc = { ...existing, status, updatedAt: nowStr };

  await FirebaseService.set_document('teachers', uid, updatedDoc);

  const userDoc = (await FirebaseService.get_document('users', uid)) || {};
  const updatedUser = { ...userDoc, status, updatedAt: nowStr };
  await FirebaseService.set_document('users', uid, updatedUser);
  if (existing.teacherCode && existing.teacherCode !== uid) {
    await FirebaseService.set_document('users', existing.teacherCode, updatedUser);
  }

  await AuditService.log(
    'Teacher Status Changed',
    req.user!.uid,
    req.user!.role,
    'teacher',
    uid,
    `${getAuditActor(req)} updated status of teacher ${existing.name} to '${status}'`
  );

  res.json({
    success: true,
    message: `Teacher marked as ${status}.`,
    teacher: updatedDoc
  });
});

/**
 * POST /api/teachers/:uid/reset-password
 * Restricted to principal only - sets new password with secure salt & hash
 */
teachersRouter.post('/api/teachers/:uid/reset-password', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const uid = req.params.uid;
  const data = req.body || {};
  const newPassword = String(data.newPassword || '').trim();

  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
    return;
  }

  const user = (await FirebaseService.get_document('users', uid)) || (await FirebaseService.get_document('teachers', uid));
  if (!user) {
    res.status(404).json({ success: false, message: 'Teacher account not found.' });
    return;
  }

  const nowStr = new Date().toISOString();

  // Update Firebase Auth if configured
  if (user.authEmail) {
    await FirebaseService.update_user_password(user.authEmail, newPassword);
  }

  // Hash new password securely and remove any plaintext tempPassword
  const { hash: pHash, salt: pSalt } = hashPassword(newPassword);
  const updatedUser = {
    ...user,
    passwordHash: pHash,
    passwordSalt: pSalt,
    updatedAt: nowStr
  };
  delete (updatedUser as any).tempPassword;

  await FirebaseService.set_document('users', uid, updatedUser);
  if (user.teacherCode && user.teacherCode !== uid) {
    await FirebaseService.set_document('users', user.teacherCode, updatedUser);
  }

  await AuditService.log(
    'Teacher Password Reset by Principal',
    req.user!.uid,
    req.user!.role,
    'teacher',
    uid,
    `${getAuditActor(req)} reset password for teacher ${user.name}`
  );

  res.json({
    success: true,
    message: `Password reset successfully for teacher ${user.name}.`
  });
});
