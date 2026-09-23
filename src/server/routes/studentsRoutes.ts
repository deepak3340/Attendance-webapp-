import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { FirebaseService } from '../services/firebaseService.js';
import { AuditService } from '../services/auditService.js';
import { requireAuth, requireRole, getAuditActor } from '../middleware/authMiddleware.js';

export const studentsRouter = Router();

/**
 * GET /api/students
 * Accessible to authenticated principals and teachers
 */
studentsRouter.get('/api/students', requireAuth, async (req: Request, res: Response) => {
  const classId = String(req.query.classId || '').trim();
  const filterName = String(req.query.name || '').trim().toLowerCase();
  const filterRoll = String(req.query.roll || '').trim();
  const filterId = String(req.query.studentId || '').trim().toLowerCase();
  const filterStatus = String(req.query.status || '').trim().toLowerCase();

  const allStudents = await FirebaseService.list_documents('students');
  const allClasses = await FirebaseService.list_documents('classes');
  const classMap = new Map<string, string>();
  for (const c of allClasses) {
    const id = c.classId || c._id;
    if (id) classMap.set(id, c.className || id);
  }

  const filtered = [];
  for (const s of allStudents) {
    const sId = String(s.studentId || s._id || '').toLowerCase();
    const sName = String(s.name || '').toLowerCase();
    const sRoll = String(s.rollNumber || '').trim();
    const sClass = String(s.classId || '').trim();
    const sStatus = String(s.status || 'active').toLowerCase();
    if (String(s._id || s.studentId || '').startsWith('_') || !s.name) continue;

    if (classId && sClass !== classId) continue;
    if (filterStatus && sStatus !== filterStatus) continue;
    if (filterName && !sName.includes(filterName)) continue;
    if (filterRoll && sRoll !== filterRoll) continue;
    if (filterId && !sId.includes(filterId)) continue;

    filtered.push({
      ...s,
      studentId: s.studentId || s._id,
      className: classMap.get(sClass) || sClass
    });
  }

  filtered.sort((a: any, b: any) => {
    const aRoll = parseInt(a.rollNumber, 10);
    const bRoll = parseInt(b.rollNumber, 10);
    if (!isNaN(aRoll) && !isNaN(bRoll)) return aRoll - bRoll;
    return String(a.rollNumber || '').localeCompare(String(b.rollNumber || ''));
  });

  res.json({
    success: true,
    students: filtered,
    count: filtered.length
  });
});

/**
 * POST /api/students
 * Restricted to principal only
 */
studentsRouter.post('/api/students', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const data = req.body || {};
  const name = String(data.name || '').trim();
  const rollNumber = String(data.rollNumber || '').trim();
  const classId = String(data.classId || '').trim();
  const status = String(data.status || 'active').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
  const customId = String(data.studentId || '').trim();

  if (!name || !rollNumber || !classId) {
    res.status(400).json({ success: false, message: 'Name, Roll Number, and Class are required.' });
    return;
  }

  // Check duplicate roll number in class
  const existingInClass = await FirebaseService.list_documents('students');
  for (const s of existingInClass) {
    if (
      String(s.classId || '') === classId &&
      String(s.rollNumber || '').trim() === rollNumber &&
      (s.status || 'active') === 'active'
    ) {
      res.status(409).json({
        success: false,
        message: `Roll Number '${rollNumber}' is already assigned to active student '${s.name}' in this class.`
      });
      return;
    }
  }

  const studentId = customId || `STU_${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const nowStr = new Date().toISOString();

  const studentDoc = {
    studentId,
    name,
    rollNumber,
    classId,
    status,
    createdAt: nowStr,
    updatedAt: nowStr
  };

  await FirebaseService.set_document('students', studentId, studentDoc);

  await AuditService.log(
    'Student Enrolled',
    req.user!.uid,
    req.user!.role,
    'student',
    studentId,
    `${getAuditActor(req)} enrolled student ${name} (Roll: ${rollNumber}) in class ${classId}`
  );

  res.json({
    success: true,
    message: 'Student enrolled successfully.',
    student: studentDoc
  });
});

/**
 * PUT /api/students/:studentId
 * Restricted to principal only
 */
studentsRouter.put('/api/students/:studentId', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const studentId = req.params.studentId;
  const data = req.body || {};

  const existing = await FirebaseService.get_document('students', studentId);
  if (!existing) {
    res.status(404).json({ success: false, message: 'Student not found.' });
    return;
  }

  const name = String(data.name || existing.name).trim();
  const rollNumber = String(data.rollNumber || existing.rollNumber).trim();
  const classId = String(data.classId || existing.classId).trim();
  const status = String(data.status || existing.status || 'active').trim();

  // Check duplicate roll number if changed
  if (rollNumber !== existing.rollNumber || classId !== existing.classId) {
    const allStudents = await FirebaseService.list_documents('students');
    for (const s of allStudents) {
      const sId = s.studentId || s._id;
      if (
        sId !== studentId &&
        String(s.classId || '') === classId &&
        String(s.rollNumber || '').trim() === rollNumber &&
        (s.status || 'active') === 'active'
      ) {
        res.status(409).json({
          success: false,
          message: `Roll Number '${rollNumber}' is already assigned to another student in this class.`
        });
        return;
      }
    }
  }

  const nowStr = new Date().toISOString();
  const updatedDoc = {
    ...existing,
    name,
    rollNumber,
    classId,
    status,
    updatedAt: nowStr
  };

  await FirebaseService.set_document('students', studentId, updatedDoc);

  await AuditService.log(
    'Student Updated',
    req.user!.uid,
    req.user!.role,
    'student',
    studentId,
    `${getAuditActor(req)} updated student record for ${name}`
  );

  res.json({
    success: true,
    message: 'Student updated successfully.',
    student: updatedDoc
  });
});

/**
 * PATCH /api/students/:studentId/status
 * Restricted to principal only
 */
studentsRouter.patch('/api/students/:studentId/status', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const studentId = req.params.studentId;
  const { status } = req.body || {};

  if (!status || !['active', 'inactive'].includes(status)) {
    res.status(400).json({ success: false, message: 'Valid status (active/inactive) is required.' });
    return;
  }

  const existing = await FirebaseService.get_document('students', studentId);
  if (!existing) {
    res.status(404).json({ success: false, message: 'Student not found.' });
    return;
  }

  const nowStr = new Date().toISOString();
  const updatedDoc = {
    ...existing,
    status,
    updatedAt: nowStr
  };

  await FirebaseService.set_document('students', studentId, updatedDoc);

  await AuditService.log(
    'Student Status Changed',
    req.user!.uid,
    req.user!.role,
    'student',
    studentId,
    `${getAuditActor(req)} changed student status to '${status}'`
  );

  res.json({
    success: true,
    message: `Student status updated to ${status}.`,
    student: updatedDoc
  });
});

/**
 * DELETE /api/students/:studentId
 * Restricted to principal only
 */
studentsRouter.delete('/api/students/:studentId', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const studentId = req.params.studentId;

  const existing = await FirebaseService.get_document('students', studentId);
  if (!existing) {
    res.status(404).json({ success: false, message: 'Student not found.' });
    return;
  }

  await FirebaseService.delete_document('students', studentId);

  await AuditService.log(
    'Student Deleted',
    req.user!.uid,
    req.user!.role,
    'student',
    studentId,
    `${getAuditActor(req)} deleted student record ${existing.name}`
  );

  res.json({
    success: true,
    message: 'Student deleted successfully.'
  });
});
