import { Router, Request, Response } from 'express';
import { FirebaseService } from '../services/firebaseService.js';
import { AttendanceService } from '../services/attendanceService.js';
import { AuditService } from '../services/auditService.js';
import { requireAuth, requireRole, getAuditActor } from '../middleware/authMiddleware.js';

export const attendanceRouter = Router();

/**
 * GET /api/attendance/session
 * Loads attendance marking state for a specific date, class, subject, period
 */
attendanceRouter.get('/api/attendance/session', requireAuth, async (req: Request, res: Response) => {
  const classId = String(req.query.classId || '').trim();
  const subjectId = String(req.query.subjectId || '').trim();
  const dateStr = String(req.query.date || '').trim();
  const period = String(req.query.period || '').trim();

  if (!classId || !subjectId || !dateStr || !period) {
    res.status(400).json({
      success: false,
      message: 'Missing required parameters: classId, subjectId, date, period.'
    });
    return;
  }

  // Teacher authorization check: teacher must be assigned to this class & subject
  if (req.user!.role === 'teacher') {
    const isAssigned = await AttendanceService.verifyTeacherAssignment(req.user!.uid, classId, subjectId);
    if (!isAssigned) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized: You are not assigned to take attendance for this Class and Subject.'
      });
      return;
    }
  }

  const sessionId = AttendanceService.getSessionId(dateStr, classId, subjectId, period);
  const [isLocked, lockDoc] = await AttendanceService.isSessionLocked(dateStr, classId, subjectId, period);

  // Load students for this class
  const allStudents = await FirebaseService.list_documents('students');
  const classStudents = allStudents
    .filter(s => s.classId === classId && (s.status || 'active') === 'active')
    .sort((a, b) => {
      const aRoll = parseInt(a.rollNumber, 10);
      const bRoll = parseInt(b.rollNumber, 10);
      if (!isNaN(aRoll) && !isNaN(bRoll)) return aRoll - bRoll;
      return String(a.rollNumber || '').localeCompare(String(b.rollNumber || ''));
    });

  // Load existing records for this session
  const allAttendance = await FirebaseService.list_documents('studentAttendance');
  const existingMarks = new Map<string, any>();
  for (const a of allAttendance) {
    if (
      a.date === dateStr &&
      a.classId === classId &&
      a.subjectId === subjectId &&
      a.period === period
    ) {
      existingMarks.set(a.studentId, a);
    }
  }

  const studentList = classStudents.map(s => {
    const sId = s.studentId || s._id;
    const existing = existingMarks.get(sId);
    return {
      studentId: sId,
      name: s.name,
      rollNumber: s.rollNumber,
      status: existing ? existing.status : 'Present',
      attendanceId: existing ? (existing.attendanceId || existing._id) : null,
      markedAt: existing ? existing.markedAt : null
    };
  });

  res.json({
    success: true,
    sessionId,
    isLocked,
    lockedBy: lockDoc?.lockedBy || null,
    lockedAt: lockDoc?.lockedAt || null,
    students: studentList,
    totalStudents: studentList.length,
    hasExistingData: existingMarks.size > 0
  });
});

/**
 * POST /api/attendance/student
 * Save student attendance marks for a class session
 */
attendanceRouter.post('/api/attendance/student', requireAuth, async (req: Request, res: Response) => {
  const data = req.body || {};
  const classId = String(data.classId || '').trim();
  const subjectId = String(data.subjectId || '').trim();
  const dateStr = String(data.date || '').trim();
  const period = String(data.period || '').trim();
  const records = Array.isArray(data.records) ? data.records : [];

  if (!classId || !subjectId || !dateStr || !period || records.length === 0) {
    res.status(400).json({
      success: false,
      message: 'Missing required session parameters or empty records list.'
    });
    return;
  }

  // Teacher authorization check
  if (req.user!.role === 'teacher') {
    const isAssigned = await AttendanceService.verifyTeacherAssignment(req.user!.uid, classId, subjectId);
    if (!isAssigned) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized: You are not assigned to record attendance for this Class and Subject.'
      });
      return;
    }
  }

  // Session lock verification: teacher cannot edit locked session
  const [isLocked] = await AttendanceService.isSessionLocked(dateStr, classId, subjectId, period);
  if (isLocked && req.user!.role !== 'principal') {
    res.status(403).json({
      success: false,
      message: 'This attendance session has been locked by the Principal and cannot be modified.'
    });
    return;
  }

  const sessionId = AttendanceService.getSessionId(dateStr, classId, subjectId, period);
  const nowStr = new Date().toISOString();

  // Create/update session doc
  const sessionDoc = {
    sessionId,
    classId,
    subjectId,
    date: dateStr,
    period,
    teacherUid: req.user!.uid,
    teacherName: req.user!.name,
    locked: isLocked,
    totalStudents: records.length,
    presentCount: records.filter((r: any) => r.status === 'Present').length,
    absentCount: records.filter((r: any) => r.status === 'Absent').length,
    updatedAt: nowStr,
    createdAt: nowStr
  };
  await FirebaseService.set_document('attendanceSessions', sessionId, sessionDoc);

  // Write attendance for each student in parallel
  const studentMap = new Map<string, any>();
  const allStudents = await FirebaseService.list_documents('students');
  for (const s of allStudents) {
    const sId = s.studentId || s._id;
    if (sId) studentMap.set(sId, s);
  }

  const saveOps = records.map(async (rec: any) => {
    const studentId = String(rec.studentId || '').trim();
    if (!studentId) return;

    const sInfo = studentMap.get(studentId) || {};
    const status = rec.status === 'Absent' ? 'Absent' : 'Present';
    const attendanceId = AttendanceService.getAttendanceId(sessionId, studentId);

    const doc = {
      attendanceId,
      sessionId,
      studentId,
      studentName: sInfo.name || rec.name || 'Student',
      rollNumber: sInfo.rollNumber || rec.rollNumber || '',
      classId,
      subjectId,
      date: dateStr,
      period,
      status,
      markedBy: req.user!.uid,
      teacherUid: req.user!.uid,
      locked: isLocked,
      markedAt: nowStr,
      updatedAt: nowStr,
      createdAt: nowStr
    };

    return FirebaseService.set_document('studentAttendance', attendanceId, doc);
  });

  await Promise.all(saveOps);

  await AuditService.log(
    'Student Attendance Marked',
    req.user!.uid,
    req.user!.role,
    'attendance',
    sessionId,
    `${getAuditActor(req)} submitted attendance for ${dateStr} (${classId} - ${subjectId} - ${period})`
  );

  res.json({
    success: true,
    message: 'Attendance saved successfully.',
    sessionId,
    savedCount: records.length
  });
});

/**
 * POST /api/attendance/lock
 * Restricted to principal only
 */
attendanceRouter.post('/api/attendance/lock', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const data = req.body || {};
  const classId = String(data.classId || '').trim();
  const subjectId = String(data.subjectId || '').trim();
  const dateStr = String(data.date || '').trim();
  const period = String(data.period || '').trim();

  if (!classId || !subjectId || !dateStr || !period) {
    res.status(400).json({ success: false, message: 'All fields (Class, Subject, Date, Period) are required.' });
    return;
  }

  await AttendanceService.lockSession(dateStr, classId, subjectId, period, req.user!.uid, getAuditActor(req));

  res.json({
    success: true,
    message: `Attendance locked successfully for ${dateStr} (${period}).`,
    isLocked: true
  });
});

/**
 * POST /api/attendance/unlock
 * Restricted to principal only
 */
attendanceRouter.post('/api/attendance/unlock', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const data = req.body || {};
  const classId = String(data.classId || '').trim();
  const subjectId = String(data.subjectId || '').trim();
  const dateStr = String(data.date || '').trim();
  const period = String(data.period || '').trim();

  if (!classId || !subjectId || !dateStr || !period) {
    res.status(400).json({ success: false, message: 'All fields (Class, Subject, Date, Period) are required.' });
    return;
  }

  await AttendanceService.unlockSession(dateStr, classId, subjectId, period, req.user!.uid, getAuditActor(req));

  res.json({
    success: true,
    message: `Attendance unlocked successfully for ${dateStr} (${period}).`,
    isLocked: false
  });
});

/**
 * GET /api/attendance/student-records
 * Accessible to authenticated users (Teachers only see their assigned classes)
 */
attendanceRouter.get('/api/attendance/student-records', requireAuth, async (req: Request, res: Response) => {
  const filterClass = String(req.query.classId || '').trim();
  const filterSubject = String(req.query.subjectId || '').trim();
  const filterStudent = String(req.query.studentName || '').trim().toLowerCase();
  const filterDateFrom = String(req.query.dateFrom || '').trim();
  const filterDateTo = String(req.query.dateTo || '').trim();
  const filterStatus = String(req.query.status || '').trim();

  // If teacher, fetch their assignments
  let teacherAllowedClasses: Set<string> | null = null;
  if (req.user!.role === 'teacher') {
    const assignments = await FirebaseService.list_documents('teacherAssignments');
    teacherAllowedClasses = new Set<string>();
    const cleanUid = req.user!.uid.replace(/^teacher_/, '');
    for (const a of assignments) {
      const aTeacher = String(a.teacherUid || '').replace(/^teacher_/, '');
      const aCode = String(a.teacherCode || '');
      if (
        (aTeacher === cleanUid || aCode === cleanUid || a.teacherUid === req.user!.uid) &&
        (a.status || 'active') === 'active'
      ) {
        teacherAllowedClasses.add(`${a.classId}_${a.subjectId}`);
      }
    }
  }

  const allRecords = await FirebaseService.list_documents('studentAttendance');
  const allClasses = await FirebaseService.list_documents('classes');
  const allSubjects = await FirebaseService.list_documents('subjects');

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

  const filtered: any[] = [];
  for (const r of allRecords) {
    const rDate = r.date || '';
    const rClass = r.classId || '';
    const rSubject = r.subjectId || '';
    const rStatus = r.status || 'Present';
    const rName = String(r.studentName || '').toLowerCase();

    // Teacher isolation check
    if (teacherAllowedClasses && !teacherAllowedClasses.has(`${rClass}_${rSubject}`)) {
      continue;
    }

    if (filterClass && rClass !== filterClass) continue;
    if (filterSubject && rSubject !== filterSubject) continue;
    if (filterStatus && rStatus.toLowerCase() !== filterStatus.toLowerCase()) continue;
    if (filterDateFrom && rDate < filterDateFrom) continue;
    if (filterDateTo && rDate > filterDateTo) continue;
    if (filterStudent && !rName.includes(filterStudent)) continue;

    filtered.push({
      ...r,
      attendanceId: r.attendanceId || r._id,
      className: classMap.get(rClass) || rClass,
      subjectName: subjectMap.get(rSubject) || rSubject
    });
  }

  filtered.sort((a: any, b: any) => String(b.date || '').localeCompare(String(a.date || '')));

  res.json({
    success: true,
    records: filtered,
    count: filtered.length
  });
});

/**
 * GET /api/attendance/teacher-records and /api/attendance/teacher
 * Accessible to authenticated users (Teacher sees only own; Principal sees all)
 */
const getTeacherAttendanceHandler = async (req: Request, res: Response) => {
  const filterStatus = String(req.query.status || '').trim().toLowerCase();
  const filterDateFrom = String(req.query.dateFrom || '').trim();
  const filterDateTo = String(req.query.dateTo || '').trim();
  const filterName = String(req.query.teacherName || '').trim().toLowerCase();
  let filterUid = String(req.query.teacherUid || '').trim();

  // If requester is teacher, restrict to their own records
  if (req.user!.role === 'teacher') {
    filterUid = req.user!.uid;
  }

  const allRecords = await FirebaseService.list_documents('teacherAttendance');
  const allTeachers = await FirebaseService.list_documents('teachers');
  const teacherMap = new Map<string, any>();
  for (const t of allTeachers) {
    if (t.uid) teacherMap.set(t.uid, t);
    if (t.teacherCode) teacherMap.set(t.teacherCode, t);
  }

  const filtered = [];
  for (const rec of allRecords) {
    const tId = rec.teacherUid;
    const recDate = rec.date || '';
    const statusVal = rec.status || 'Present';

    if (filterStatus && statusVal.toLowerCase() !== filterStatus) continue;
    if (filterDateFrom && recDate < filterDateFrom) continue;
    if (filterDateTo && recDate > filterDateTo) continue;

    const tInfo = teacherMap.get(tId) || {};
    const tName = tInfo.name || 'Unknown';
    const tCode = String(tInfo.teacherCode || tId || '-');

    if (filterName && !tName.toLowerCase().includes(filterName)) continue;
    if (filterUid && filterUid !== tCode && filterUid !== tId) continue;

    filtered.push({
      attendanceId: rec.attendanceId || rec._id,
      teacherUid: tId,
      teacherCode: tCode,
      teacherName: tName,
      date: recDate,
      status: statusVal,
      markedBy: rec.markedBy || 'Principal',
      createdAt: rec.createdAt
    });
  }

  filtered.sort((a, b) => b.date.localeCompare(a.date));

  res.json({
    success: true,
    records: filtered,
    count: filtered.length
  });
};

attendanceRouter.get('/api/attendance/teacher-records', requireAuth, getTeacherAttendanceHandler);
attendanceRouter.get('/api/attendance/teacher', requireAuth, getTeacherAttendanceHandler);

/**
 * POST /api/attendance/teacher
 * Restricted to principal only
 */
attendanceRouter.post('/api/attendance/teacher', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const data = req.body || {};
  const teacherUid = String(data.teacherUid || '').trim();
  const dateStr = String(data.date || '').trim();
  let statusVal = String(data.status || 'Present').trim();

  if (!teacherUid || !dateStr) {
    res.status(400).json({ success: false, message: 'Teacher and Date are required.' });
    return;
  }

  statusVal = statusVal.toLowerCase() === 'absent' ? 'Absent' : 'Present';

  const teacher = (await FirebaseService.get_document('teachers', teacherUid)) ||
                  (await FirebaseService.find_user_by_identifier(teacherUid));
  if (!teacher) {
    res.status(404).json({ success: false, message: 'Teacher not found.' });
    return;
  }

  const attendanceId = `t_att_${teacher.teacherCode || teacherUid}_${dateStr}`;
  const nowStr = new Date().toISOString();

  const record = {
    attendanceId,
    teacherUid: teacher.uid || teacherUid,
    teacherCode: teacher.teacherCode || teacherUid,
    teacherName: teacher.name,
    date: dateStr,
    status: statusVal,
    markedBy: req.user!.uid,
    createdAt: nowStr,
    updatedAt: nowStr
  };

  await FirebaseService.set_document('teacherAttendance', attendanceId, record);

  await AuditService.log(
    'Teacher Attendance Marked',
    req.user!.uid,
    req.user!.role,
    'attendance',
    attendanceId,
    `${getAuditActor(req)} marked teacher ${teacher.name} as ${statusVal} on ${dateStr}`
  );

  res.json({
    success: true,
    message: `Marked ${teacher.name} as ${statusVal} on ${dateStr}.`,
    record
  });
});
