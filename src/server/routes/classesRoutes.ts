import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { FirebaseService } from '../services/firebaseService.js';
import { AuditService } from '../services/auditService.js';
import { requireAuth, requireRole, getAuditActor } from '../middleware/authMiddleware.js';

export const classesRouter = Router();

/**
 * GET /api/classes
 * Accessible to authenticated users
 */
classesRouter.get('/api/classes', requireAuth, async (req: Request, res: Response) => {
  const all = await FirebaseService.list_documents('classes');
  const activeClasses = all
    .filter(c => c.className && (c.status || 'active') === 'active' && !String(c._id || c.classId || '').startsWith('_'))
    .sort((a, b) => String(a.className || '').localeCompare(String(b.className || '')));

  res.json({
    success: true,
    classes: activeClasses,
    count: activeClasses.length
  });
});

/**
 * POST /api/classes
 * Restricted to principal only
 */
classesRouter.post('/api/classes', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const data = req.body || {};
  const className = String(data.className || '').trim();

  if (!className) {
    res.status(400).json({ success: false, message: 'Class name is required.' });
    return;
  }

  // Check duplicate
  const existingClasses = await FirebaseService.list_documents('classes');
  for (const c of existingClasses) {
    if (
      String(c.className || '').trim().toLowerCase() === className.toLowerCase() &&
      (c.status || 'active') === 'active'
    ) {
      res.status(409).json({ success: false, message: `Class '${className}' already exists.` });
      return;
    }
  }

  const slug = className.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const classId = `class_${slug || crypto.randomUUID().slice(0, 6)}`;
  const nowStr = new Date().toISOString();

  const classDoc = {
    classId,
    className,
    status: 'active',
    createdAt: nowStr,
    updatedAt: nowStr
  };

  await FirebaseService.set_document('classes', classId, classDoc);

  await AuditService.log(
    'Class Created',
    req.user!.uid,
    req.user!.role,
    'class',
    classId,
    `${getAuditActor(req)} created class '${className}'`
  );

  res.json({
    success: true,
    message: `Class '${className}' created successfully.`,
    class: classDoc
  });
});

/**
 * GET /api/classes/:classId/subjects
 * Accessible to authenticated users
 */
classesRouter.get('/api/classes/:classId/subjects', requireAuth, async (req: Request, res: Response) => {
  const { classId } = req.params;
  const all = await FirebaseService.list_documents('subjects');

  const filtered = all
    .filter(s => s.subjectName && s.classId === classId && (s.status || 'active') === 'active' && !String(s._id || s.subjectId || '').startsWith('_'))
    .sort((a, b) => String(a.subjectName || '').localeCompare(String(b.subjectName || '')));

  res.json({
    success: true,
    classId,
    subjects: filtered,
    count: filtered.length
  });
});

/**
 * POST /api/classes/:classId/subjects
 * Restricted to principal only
 */
classesRouter.post('/api/classes/:classId/subjects', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const { classId } = req.params;
  const data = req.body || {};
  const subjectName = String(data.subjectName || '').trim();

  if (!subjectName) {
    res.status(400).json({ success: false, message: 'Subject name is required.' });
    return;
  }

  const parentClass = await FirebaseService.get_document('classes', classId);
  if (!parentClass) {
    res.status(404).json({ success: false, message: 'Class not found.' });
    return;
  }

  // Check duplicate subject in this class
  const existingSubjects = await FirebaseService.list_documents('subjects');
  for (const s of existingSubjects) {
    if (
      s.classId === classId &&
      String(s.subjectName || '').trim().toLowerCase() === subjectName.toLowerCase() &&
      (s.status || 'active') === 'active'
    ) {
      res.status(409).json({
        success: false,
        message: `Subject '${subjectName}' already exists for ${parentClass.className || classId}.`
      });
      return;
    }
  }

  const slug = subjectName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const subjectId = `sub_${classId}_${slug || crypto.randomUUID().slice(0, 6)}`;
  const nowStr = new Date().toISOString();

  const subjectDoc = {
    subjectId,
    subjectName,
    classId,
    status: 'active',
    createdAt: nowStr,
    updatedAt: nowStr
  };

  await FirebaseService.set_document('subjects', subjectId, subjectDoc);

  await AuditService.log(
    'Subject Created',
    req.user!.uid,
    req.user!.role,
    'subject',
    subjectId,
    `${getAuditActor(req)} added subject '${subjectName}' to class '${parentClass.className || classId}'`
  );

  res.json({
    success: true,
    message: `Subject '${subjectName}' added to ${parentClass.className || classId}.`,
    subject: subjectDoc
  });
});

/**
 * GET /api/classes-and-subjects
 * Accessible to authenticated users
 */
classesRouter.get('/api/classes-and-subjects', requireAuth, async (req: Request, res: Response) => {
  const allClasses = await FirebaseService.list_documents('classes');
  const allSubjects = await FirebaseService.list_documents('subjects');

  const subjectsByClass = new Map<string, Array<Record<string, any>>>();
  for (const s of allSubjects) {
    if ((s.status || 'active') === 'active') {
      const cId = s.classId;
      if (!subjectsByClass.has(cId)) {
        subjectsByClass.set(cId, []);
      }
      subjectsByClass.get(cId)!.push(s);
    }
  }

  const result = [];
  for (const c of allClasses) {
    if ((c.status || 'active') === 'active') {
      const cId = c.classId || c._id;
      const subs = subjectsByClass.get(cId) || [];
      subs.sort((a, b) => String(a.subjectName || '').localeCompare(String(b.subjectName || '')));
      result.push({
        ...c,
        subjects: subs
      });
    }
  }

  result.sort((a: any, b: any) => String(a.className || '').localeCompare(String(b.className || '')));

  res.json({
    success: true,
    classes: result
  });
});
