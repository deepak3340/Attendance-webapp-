import { FirebaseService } from './firebaseService.js';
import { AuditService } from './auditService.js';

export class AttendanceService {
  static getSessionId(dateStr: string, classId: string, subjectId: string, period: string): string {
    const safeDate = dateStr.trim();
    const safeClass = classId.trim();
    const safeSubject = subjectId.trim();
    const safePeriod = period.trim().replace(/\s+/g, '');
    return `${safeDate}_${safeClass}_${safeSubject}_${safePeriod}`;
  }

  static getLockId(dateStr: string, classId: string, subjectId: string, period: string): string {
    return AttendanceService.getSessionId(dateStr, classId, subjectId, period);
  }

  static async isSessionLocked(dateStr: string, classId: string, subjectId: string, period: string): Promise<[boolean, any]> {
    const sessionId = AttendanceService.getSessionId(dateStr, classId, subjectId, period);

    // 1. Primary check in attendanceSessions collection
    const sessionDoc = await FirebaseService.get_document('attendanceSessions', sessionId);
    if (sessionDoc && sessionDoc.locked === true) {
      return [true, sessionDoc];
    }

    // 2. Compatibility check in attendanceLocks
    const lockDoc = await FirebaseService.get_document('attendanceLocks', sessionId);
    if (lockDoc && (lockDoc.locked === true || lockDoc.isLocked === true)) {
      return [true, lockDoc];
    }

    return [false, sessionDoc || lockDoc || null];
  }

  /**
   * Optimized lock session: updates session state and matching attendance records concurrently
   */
  static async lockSession(
    dateStr: string,
    classId: string,
    subjectId: string,
    period: string,
    principalUid: string,
    actorDisplay = 'Principal'
  ): Promise<any> {
    const sessionId = AttendanceService.getSessionId(dateStr, classId, subjectId, period);
    const nowStr = new Date().toISOString();

    const existingSession = (await FirebaseService.get_document('attendanceSessions', sessionId)) || {};
    const sessionData = {
      ...existingSession,
      sessionId,
      date: dateStr,
      classId,
      subjectId,
      period,
      teacherUid: existingSession.teacherUid || 'teacher',
      locked: true,
      lockedBy: principalUid,
      lockedAt: nowStr,
      updatedAt: nowStr,
      createdAt: existingSession.createdAt || nowStr
    };

    const res = await FirebaseService.set_document('attendanceSessions', sessionId, sessionData);

    // Sync to attendanceLocks
    await FirebaseService.set_document('attendanceLocks', sessionId, {
      sessionKey: sessionId,
      lockId: sessionId,
      date: dateStr,
      classId,
      subjectId,
      period,
      locked: true,
      isLocked: true,
      lockedBy: principalUid,
      lockedAt: nowStr
    });

    // Update locked flag on student attendance records in parallel
    const records = await FirebaseService.list_documents('studentAttendance');
    const updatePromises = [];
    for (const rec of records) {
      if (
        rec.date === dateStr &&
        rec.classId === classId &&
        rec.subjectId === subjectId &&
        rec.period === period
      ) {
        updatePromises.push(
          FirebaseService.set_document('studentAttendance', rec.attendanceId || rec._id, {
            ...rec,
            locked: true,
            updatedAt: nowStr
          })
        );
      }
    }
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    await AuditService.log(
      'Attendance Locked',
      principalUid,
      'principal',
      'attendanceSessions',
      sessionId,
      `${actorDisplay} locked attendance session for ${dateStr} (${classId} - ${subjectId} - ${period})`
    );

    return res;
  }

  /**
   * Optimized unlock session: updates session state and matching attendance records concurrently
   */
  static async unlockSession(
    dateStr: string,
    classId: string,
    subjectId: string,
    period: string,
    principalUid: string,
    actorDisplay = 'Principal'
  ): Promise<any> {
    const sessionId = AttendanceService.getSessionId(dateStr, classId, subjectId, period);
    const nowStr = new Date().toISOString();

    const existingSession = (await FirebaseService.get_document('attendanceSessions', sessionId)) || {};
    const sessionData = {
      ...existingSession,
      sessionId,
      date: dateStr,
      classId,
      subjectId,
      period,
      teacherUid: existingSession.teacherUid || 'teacher',
      locked: false,
      lockedBy: null,
      lockedAt: null,
      updatedAt: nowStr,
      createdAt: existingSession.createdAt || nowStr
    };

    const res = await FirebaseService.set_document('attendanceSessions', sessionId, sessionData);

    // Sync to attendanceLocks
    await FirebaseService.set_document('attendanceLocks', sessionId, {
      sessionKey: sessionId,
      lockId: sessionId,
      date: dateStr,
      classId,
      subjectId,
      period,
      locked: false,
      isLocked: false,
      unlockedBy: principalUid,
      unlockedAt: nowStr
    });

    // Unlock records in parallel
    const records = await FirebaseService.list_documents('studentAttendance');
    const updatePromises = [];
    for (const rec of records) {
      if (
        rec.date === dateStr &&
        rec.classId === classId &&
        rec.subjectId === subjectId &&
        rec.period === period
      ) {
        updatePromises.push(
          FirebaseService.set_document('studentAttendance', rec.attendanceId || rec._id, {
            ...rec,
            locked: false,
            updatedAt: nowStr
          })
        );
      }
    }
    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    await AuditService.log(
      'Attendance Unlocked',
      principalUid,
      'principal',
      'attendanceSessions',
      sessionId,
      `${actorDisplay} unlocked attendance session for ${dateStr} (${classId} - ${subjectId} - ${period})`
    );

    return res;
  }

  static getAttendanceId(sessionId: string, studentId: string): string {
    return `${sessionId}_${studentId}`;
  }

  static async verifyTeacherAssignment(teacherUid: string, classId: string, subjectId: string): Promise<boolean> {
    const assignments = await FirebaseService.list_documents('teacherAssignments');
    const cleanUid = String(teacherUid).replace(/^teacher_/, '').trim();
    for (const a of assignments) {
      const aUid = String(a.teacherUid || '').replace(/^teacher_/, '').trim();
      const aCode = String(a.teacherCode || '').trim();
      if (
        (aUid === cleanUid || aCode === cleanUid || a.teacherUid === teacherUid) &&
        a.classId === classId &&
        a.subjectId === subjectId &&
        (a.status || 'active') === 'active'
      ) {
        return true;
      }
    }
    return false;
  }
}
