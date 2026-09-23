import { Router, Request, Response } from 'express';
import { FirebaseService } from '../services/firebaseService.js';
import { requireAuth } from '../middleware/authMiddleware.js';

export const dashboardRouter = Router();

dashboardRouter.get('/api/dashboard/stats', requireAuth, async (req: Request, res: Response) => {
  const todayStr = new Date().toISOString().split('T')[0];

  const allStudents = await FirebaseService.list_documents('students');
  const activeStudents = allStudents.filter(s => (s.status || 'active') === 'active');

  const allTeachers = await FirebaseService.list_documents('teachers');
  const activeTeachers = allTeachers.filter(t => (t.status || 'active') === 'active');

  const allClasses = await FirebaseService.list_documents('classes');
  const activeClasses = allClasses.filter(c => (c.status || 'active') === 'active');

  // Today's student attendance
  const allStudentAtt = await FirebaseService.list_documents('studentAttendance');
  const todayStudentAtt = allStudentAtt.filter(a => a.date === todayStr);
  const todayStudentPresent = todayStudentAtt.filter(a => (a.status || 'Present') === 'Present');

  // Today's teacher attendance
  const allTeacherAtt = await FirebaseService.list_documents('teacherAttendance');
  const todayTeacherAtt = allTeacherAtt.filter(a => a.date === todayStr);
  const todayTeacherPresent = todayTeacherAtt.filter(a => (a.status || 'Present') === 'Present');

  // Audits (Principal only)
  let recentAudits: any[] = [];
  if (req.user!.role === 'principal') {
    const allAudits = await FirebaseService.list_documents('auditLogs');
    allAudits.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    recentAudits = allAudits.slice(0, 8);
  }

  res.json({
    success: true,
    stats: {
      totalStudents: activeStudents.length,
      totalTeachers: activeTeachers.length,
      totalClasses: activeClasses.length,
      todayDate: todayStr,
      todayStudentAttendance: {
        totalMarked: todayStudentAtt.length,
        present: todayStudentPresent.length,
        absent: todayStudentAtt.length - todayStudentPresent.length
      },
      todayTeacherAttendance: {
        totalMarked: todayTeacherAtt.length,
        present: todayTeacherPresent.length,
        absent: todayTeacherAtt.length - todayTeacherPresent.length
      }
    },
    recentAudits
  });
});

dashboardRouter.get('/api/dashboard/teacher-stats', requireAuth, async (req: Request, res: Response) => {
  // If teacher, strictly use session uid
  const teacherUid = req.user!.role === 'teacher' ? req.user!.uid : String(req.query.teacherUid || req.user!.uid).trim();
  const todayStr = new Date().toISOString().split('T')[0];
  const cleanUid = teacherUid.replace(/^teacher_/, '');

  const assignments = await FirebaseService.list_documents('teacherAssignments');
  const myAssignments = assignments.filter(a => {
    const aTeacher = String(a.teacherUid || '').replace(/^teacher_/, '');
    const aCode = String(a.teacherCode || '');
    return (
      (aTeacher === cleanUid || aCode === cleanUid || a.teacherUid === teacherUid) &&
      (a.status || 'active') === 'active'
    );
  });

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

  const assignedDetails = [];
  const uniqueClasses = new Set<string>();

  for (const a of myAssignments) {
    const cId = a.classId;
    const sId = a.subjectId;
    uniqueClasses.add(cId);
    assignedDetails.push({
      classId: cId,
      className: classMap.get(cId) || cId,
      subjectId: sId,
      subjectName: subjectMap.get(sId) || sId
    });
  }

  // Today's attendance marked by this teacher
  const allStudentAtt = await FirebaseService.list_documents('studentAttendance');
  const todayMarked = allStudentAtt.filter(a => {
    const aTeacher = String(a.teacherUid || '').replace(/^teacher_/, '');
    return a.date === todayStr && (aTeacher === cleanUid || a.teacherUid === teacherUid);
  });

  // Teacher's own attendance status today
  const teacherAtt = await FirebaseService.list_documents('teacherAttendance');
  const myTodayAtt = teacherAtt.find(a => {
    const aTeacher = String(a.teacherUid || '').replace(/^teacher_/, '');
    return a.date === todayStr && (aTeacher === cleanUid || a.teacherUid === teacherUid);
  });

  res.json({
    success: true,
    teacherUid,
    assignedCount: myAssignments.length,
    classesCount: uniqueClasses.size,
    assignments: assignedDetails,
    todayMarkedCount: todayMarked.length,
    myAttendanceToday: myTodayAtt ? myTodayAtt.status : 'Not Marked Yet',
    todayDate: todayStr
  });
});
