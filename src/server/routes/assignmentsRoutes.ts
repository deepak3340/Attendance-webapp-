import { Router, Request, Response } from 'express';
import { FirebaseService } from '../services/firebaseService.js';
import { AuditService } from '../services/auditService.js';
import { requireAuth, requireRole, getAuditActor } from '../middleware/authMiddleware.js';

export const assignmentsRouter = Router();

/**
 * GET /api/assignments
 * Accessible to authenticated users
 */
assignmentsRouter.get('/api/assignments', requireAuth, async (req: Request, res: Response) => {
  let teacherUid = String(req.query.teacherUid || '').trim();
  const classId = String(req.query.classId || '').trim();
  const status = String(req.query.status || 'active').trim().toLowerCase();

  // If requester is teacher, restrict to their own assignments
  if (req.user!.role === 'teacher') {
    teacherUid = req.user!.uid;
  }

  const allAssignments = await FirebaseService.list_documents('teacherAssignments');
  const allTeachers = await FirebaseService.list_documents('teachers');
  const allClasses = await FirebaseService.list_documents('classes');
  const allSubjects = await FirebaseService.list_documents('subjects');

  const teacherMap = new Map<string, any>();
  for (const t of allTeachers) {
    if (t.uid) teacherMap.set(t.uid, t);
    if (t.teacherCode) teacherMap.set(t.teacherCode, t);
  }

  const classMap = new Map<string, string>();
  for (const c of allClasses) {
    const id = c.classId || c._id;
    if (id) classMap.set(id, c.className || id);
  }

  const subjectMap = new Map<string, string>();
  for (const s of allSubjects) {
    const id = s.subjectId || s._id;
    if (id) subjectMap.set(id, s.subjectName || id);
  }

  const cleanTeacherUid = teacherUid.replace(/^teacher_/, '');

  const filtered = [];
  for (const a of allAssignments) {
    const aTeacher = String(a.teacherUid || '').replace(/^teacher_/, '');
    const aCode = String(a.teacherCode || '');
    const aClass = String(a.classId || '');
    const aStatus = String(a.status || 'active').toLowerCase();
    if (String(a._id || a.assignmentId || '').startsWith('_') || !a.classId) continue;

    if (status && aStatus !== status) continue;
    if (classId && aClass !== classId) continue;
    if (teacherUid && aTeacher !== cleanTeacherUid && aCode !== cleanTeacherUid && a.teacherUid !== teacherUid) continue;

    const tObj = teacherMap.get(a.teacherUid) || teacherMap.get(a.teacherCode) || {};

    filtered.push({
      ...a,
      assignmentId: a.assignmentId || a._id,
      teacherName: tObj.name || a.teacherName || 'Teacher',
      teacherCode: tObj.teacherCode || a.teacherCode || a.teacherUid,
      className: classMap.get(a.classId) || a.classId,
      subjectName: subjectMap.get(a.subjectId) || a.subjectId
    });
  }

  filtered.sort((a, b) => String(a.className || '').localeCompare(String(b.className || '')));

  res.json({
    success: true,
    assignments: filtered,
    count: filtered.length
  });
});

/**
 * POST /api/assignments
 * Restricted to principal only
 */
assignmentsRouter.post('/api/assignments', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const data = req.body || {};
  let teacherUid = String(data.teacherUid || '').trim();
  const classId = String(data.classId || '').trim();
  const subjectId = String(data.subjectId || '').trim();

  if (!teacherUid || !classId || !subjectId) {
    res.status(400).json({ success: false, message: 'Teacher, Class, and Subject are all required.' });
    return;
  }

  const teacher = (await FirebaseService.get_document('teachers', teacherUid)) ||
                  (await FirebaseService.find_user_by_identifier(teacherUid));
  if (!teacher) {
    res.status(404).json({ success: false, message: 'Teacher not found.' });
    return;
  }

  const parentClass = await FirebaseService.get_document('classes', classId);
  if (!parentClass) {
    res.status(404).json({ success: false, message: 'Class not found.' });
    return;
  }

  const subject = await FirebaseService.get_document('subjects', subjectId);
  if (!subject) {
    res.status(404).json({ success: false, message: 'Subject not found.' });
    return;
  }

  const tCode = teacher.teacherCode || teacherUid;
  const canonicalTeacherUid = teacher.uid || teacherUid;

  // Check if this assignment already exists and is active
  const allAssignments = await FirebaseService.list_documents('teacherAssignments');
  for (const a of allAssignments) {
    const aUid = a.teacherUid;
    const aCode = a.teacherCode;
    if (
      (aUid === canonicalTeacherUid || aCode === tCode) &&
      a.classId === classId &&
      a.subjectId === subjectId &&
      (a.status || 'active') === 'active'
    ) {
      res.status(409).json({
        success: false,
        message: `${teacher.name} is already assigned to ${parentClass.className} - ${subject.subjectName}.`
      });
      return;
    }
  }

  const assignmentId = `asgn_${tCode}_${classId}_${subjectId}`;
  const nowStr = new Date().toISOString();

  const assignmentDoc = {
    assignmentId,
    teacherUid: canonicalTeacherUid,
    teacherCode: tCode,
    teacherName: teacher.name,
    classId,
    className: parentClass.className,
    subjectId,
    subjectName: subject.subjectName,
    status: 'active',
    assignedBy: req.user!.uid,
    assignedAt: nowStr,
    createdAt: nowStr,
    updatedAt: nowStr
  };

  await FirebaseService.set_document('teacherAssignments', assignmentId, assignmentDoc);

  await AuditService.log(
    'Teacher Assignment Created',
    req.user!.uid,
    req.user!.role,
    'assignment',
    assignmentId,
    `${getAuditActor(req)} assigned teacher ${teacher.name} to ${parentClass.className} (${subject.subjectName})`
  );

  res.json({
    success: true,
    message: `Assigned ${teacher.name} to ${parentClass.className} - ${subject.subjectName}.`,
    assignment: assignmentDoc
  });
});

/**
 * DELETE /api/assignments/:assignmentId
 * Restricted to principal only
 */
assignmentsRouter.delete('/api/assignments/:assignmentId', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const { assignmentId } = req.params;

  const existing = await FirebaseService.get_document('teacherAssignments', assignmentId);
  if (!existing) {
    res.status(404).json({ success: false, message: 'Assignment not found.' });
    return;
  }

  const nowStr = new Date().toISOString();
  await FirebaseService.set_document('teacherAssignments', assignmentId, {
    ...existing,
    status: 'inactive',
    removedAt: nowStr,
    updatedAt: nowStr
  });

  await AuditService.log(
    'Teacher Assignment Deactivated',
    req.user!.uid,
    req.user!.role,
    'assignment',
    assignmentId,
    `${getAuditActor(req)} deactivated assignment ${assignmentId}`
  );

  res.json({
    success: true,
    message: 'Teacher assignment deactivated successfully.'
  });
});

/**
 * PATCH /api/assignments/:assignmentId
 * Restricted to principal only
 */
assignmentsRouter.patch('/api/assignments/:assignmentId', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const { assignmentId } = req.params;
  const data = req.body || {};
  const status = String(data.status || 'active').trim().toLowerCase();

  const existing = await FirebaseService.get_document('teacherAssignments', assignmentId);
  if (!existing) {
    res.status(404).json({ success: false, message: 'Assignment not found.' });
    return;
  }

  const nowStr = new Date().toISOString();
  const updatedDoc = {
    ...existing,
    status,
    updatedAt: nowStr
  };

  await FirebaseService.set_document('teacherAssignments', assignmentId, updatedDoc);

  await AuditService.log(
    'Teacher Assignment Updated',
    req.user!.uid,
    req.user!.role,
    'assignment',
    assignmentId,
    `${getAuditActor(req)} updated assignment status to '${status}'`
  );

  res.json({
    success: true,
    message: `Assignment marked as ${status}.`,
    assignment: updatedDoc
  });
});
