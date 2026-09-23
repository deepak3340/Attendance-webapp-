import { Router, Request, Response } from 'express';
import * as config from '../config.js';
import { FirebaseService } from '../services/firebaseService.js';
import { ExcelService } from '../services/excelService.js';
import { AuditService } from '../services/auditService.js';
import { requireAuth, requireRole, getAuditActor } from '../middleware/authMiddleware.js';

export const reportsRouter = Router();

/**
 * POST /api/reports/students/excel
 * Restricted to principal only
 */
reportsRouter.post('/api/reports/students/excel', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const data = req.body || {};
  const currentYear = new Date().getFullYear();
  const year = String(data.year || currentYear).trim();
  const month = String(data.month || '').trim();
  const classId = String(data.classId || '').trim();
  const subjectId = String(data.subjectId || '').trim();
  const studentId = String(data.studentId || '').trim();

  const allStudents = await FirebaseService.list_documents('students');
  const allClasses = await FirebaseService.list_documents('classes');
  const allSubjects = await FirebaseService.list_documents('subjects');
  const allTeachers = await FirebaseService.list_documents('teachers');

  const studentMap = new Map<string, any>();
  for (const s of allStudents) {
    const id = s.studentId || s._id;
    if (id) studentMap.set(id, s);
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

  const teacherMap = new Map<string, string>();
  for (const t of allTeachers) {
    const id = t.uid || t._id;
    if (id) teacherMap.set(id, t.name || 'Teacher');
  }

  const monthNames: Record<string, string> = {
    '1': 'January', '2': 'February', '3': 'March', '4': 'April',
    '5': 'May', '6': 'June', '7': 'July', '8': 'August',
    '9': 'September', '10': 'October', '11': 'November', '12': 'December'
  };
  const monthLabel = month ? (monthNames[month] || `Month_${month}`) : 'Full_Year';
  const classLabel = (classMap.get(classId) || 'All_Classes').replace(/\s+/g, '');

  const allAttendance = await FirebaseService.list_documents('studentAttendance');
  const matchedRecords = [];

  for (const att of allAttendance) {
    const recDate = att.date;
    if (!recDate) continue;

    const parts = recDate.split('-');
    if (parts.length < 3) continue;
    const rYear = parts[0];
    const rMonth = String(parseInt(parts[1], 10));

    if (rYear !== year) continue;
    if (month && rMonth !== month) continue;

    if (classId && att.classId !== classId) continue;
    if (subjectId && att.subjectId !== subjectId) continue;
    if (studentId && att.studentId !== studentId) continue;

    const stId = att.studentId;
    const stObj = studentMap.get(stId) || {};
    const tName = teacherMap.get(att.teacherUid) || 'Teacher';

    matchedRecords.push({
      rollNumber: stObj.rollNumber || '-',
      studentName: stObj.name || 'Unknown',
      classId: att.classId,
      className: classMap.get(att.classId) || att.classId,
      subjectId: att.subjectId,
      subjectName: subjectMap.get(att.subjectId) || att.subjectId,
      date: recDate,
      period: att.period || '-',
      status: att.status || 'Present',
      teacherName: tName
    });
  }

  matchedRecords.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const aRoll = parseInt(a.rollNumber, 10);
    const bRoll = parseInt(b.rollNumber, 10);
    if (!isNaN(aRoll) && !isNaN(bRoll)) return aRoll - bRoll;
    return String(a.rollNumber || '').localeCompare(String(b.rollNumber || ''));
  });

  const filename = `Attendance_Students_${classLabel}_${monthLabel}_${year}.xlsx`;
  const filterDesc = `Year: ${year} | Month: ${monthLabel} | Class: ${classMap.get(classId) || 'All'} | Subject: ${subjectMap.get(subjectId) || 'All'}`;

  const excelBuffer = await ExcelService.createStudentReport(
    matchedRecords,
    config.SCHOOL_NAME,
    { filter_desc: filterDesc }
  );

  await AuditService.log(
    'Student Report Downloaded',
    req.user!.uid,
    req.user!.role,
    'report',
    filename,
    `${getAuditActor(req)} generated Excel report with ${matchedRecords.length} records (${filterDesc})`
  );

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(excelBuffer);
});

/**
 * POST /api/reports/teachers/excel
 * Restricted to principal only
 */
reportsRouter.post('/api/reports/teachers/excel', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
  const data = req.body || {};
  const currentYear = new Date().getFullYear();
  const year = String(data.year || currentYear).trim();
  const month = String(data.month || '').trim();
  const teacherUid = String(data.teacherUid || '').trim();

  const allTeachers = await FirebaseService.list_documents('teachers');
  const teacherMap = new Map<string, any>();
  for (const t of allTeachers) {
    const id = t.uid || t._id;
    if (id) teacherMap.set(id, t);
    if (t.teacherCode) teacherMap.set(t.teacherCode, t);
  }

  const monthNames: Record<string, string> = {
    '1': 'January', '2': 'February', '3': 'March', '4': 'April',
    '5': 'May', '6': 'June', '7': 'July', '8': 'August',
    '9': 'September', '10': 'October', '11': 'November', '12': 'December'
  };
  const monthLabel = month ? (monthNames[month] || `Month_${month}`) : 'Full_Year';

  const allAttendance = await FirebaseService.list_documents('teacherAttendance');
  const matchedRecords = [];

  for (const att of allAttendance) {
    const recDate = att.date;
    if (!recDate) continue;

    const parts = recDate.split('-');
    if (parts.length < 3) continue;
    const rYear = parts[0];
    const rMonth = String(parseInt(parts[1], 10));

    if (rYear !== year) continue;
    if (month && rMonth !== month) continue;

    const tId = att.teacherUid;
    if (teacherUid && tId !== teacherUid) continue;

    const tInfo = teacherMap.get(tId) || {};
    matchedRecords.push({
      teacherUid: tId,
      teacherCode: tInfo.teacherCode || tId || '-',
      teacherName: tInfo.name || 'Unknown',
      date: recDate,
      status: att.status || 'Present',
      markedBy: att.markedBy || 'Principal'
    });
  }

  matchedRecords.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return String(a.teacherName || '').localeCompare(String(b.teacherName || ''));
  });

  const selectedTeacher = teacherUid ? teacherMap.get(teacherUid) : null;
  const teacherLabel = selectedTeacher ? selectedTeacher.name : 'All Teachers';
  const filename = `Attendance_Teachers_${monthLabel}_${year}.xlsx`;
  const filterDesc = `Year: ${year} | Month: ${monthLabel} | Teachers: ${teacherLabel}`;

  const excelBuffer = await ExcelService.createTeacherReport(
    matchedRecords,
    config.SCHOOL_NAME,
    { filter_desc: filterDesc }
  );

  await AuditService.log(
    'Teacher Report Downloaded',
    req.user!.uid,
    req.user!.role,
    'report',
    filename,
    `${getAuditActor(req)} generated Teacher Excel report with ${matchedRecords.length} records`
  );

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(excelBuffer);
});
