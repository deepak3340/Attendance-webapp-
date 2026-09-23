import datetime
from services.firebase_service import FirebaseService
from services.audit_service import AuditService

class AttendanceService:
    @staticmethod
    def get_session_id(date_str: str, class_id: str, subject_id: str, period: str):
        safe_date = date_str.strip()
        safe_class = class_id.strip()
        safe_subject = subject_id.strip()
        safe_period = period.strip().replace(" ", "")
        return f"{safe_date}_{safe_class}_{safe_subject}_{safe_period}"

    @staticmethod
    def get_lock_id(date_str: str, class_id: str, subject_id: str, period: str):
        return AttendanceService.get_session_id(date_str, class_id, subject_id, period)

    @staticmethod
    def is_session_locked(date_str: str, class_id: str, subject_id: str, period: str):
        session_id = AttendanceService.get_session_id(date_str, class_id, subject_id, period)
        # 1. Primary check in attendanceSessions collection
        session_doc = FirebaseService.get_document("attendanceSessions", session_id)
        if session_doc and session_doc.get("locked") is True:
            return True, session_doc
        
        # 2. Backward compatibility check in attendanceLocks
        lock_doc = FirebaseService.get_document("attendanceLocks", session_id)
        if lock_doc and lock_doc.get("locked") is True:
            return True, lock_doc
            
        return False, session_doc or lock_doc

    @staticmethod
    def lock_session(date_str: str, class_id: str, subject_id: str, period: str, principal_uid: str):
        session_id = AttendanceService.get_session_id(date_str, class_id, subject_id, period)
        now_str = datetime.datetime.utcnow().isoformat() + "Z"
        
        existing_session = FirebaseService.get_document("attendanceSessions", session_id) or {}
        session_data = {
            **existing_session,
            "sessionId": session_id,
            "date": date_str,
            "classId": class_id,
            "subjectId": subject_id,
            "period": period,
            "teacherUid": existing_session.get("teacherUid", "482731"),
            "locked": True,
            "lockedBy": principal_uid,
            "lockedAt": now_str,
            "updatedAt": now_str,
            "createdAt": existing_session.get("createdAt", now_str)
        }
        # Save to primary attendanceSessions collection
        res = FirebaseService.set_document("attendanceSessions", session_id, session_data)
        
        # Also sync to attendanceLocks for complete compatibility
        FirebaseService.set_document("attendanceLocks", session_id, {
            "sessionKey": session_id,
            "lockId": session_id,
            "date": date_str,
            "classId": class_id,
            "subjectId": subject_id,
            "period": period,
            "locked": True,
            "lockedBy": principal_uid,
            "lockedAt": now_str
        })
        
        # Update locked flag on student attendance records
        records = FirebaseService.list_documents("studentAttendance")
        for rec in records:
            if (rec.get("date") == date_str and rec.get("classId") == class_id and 
                rec.get("subjectId") == subject_id and rec.get("period") == period):
                FirebaseService.set_document("studentAttendance", rec.get("attendanceId") or rec.get("_id"), {
                    **rec,
                    "locked": True,
                    "updatedAt": now_str
                })

        AuditService.log(
            action="Attendance Locked",
            performed_by=principal_uid,
            role="principal",
            target_type="attendanceSessions",
            target_id=session_id,
            details={"action": "Attendance Locked", "classId": class_id, "subjectId": subject_id, "date": date_str, "period": period}
        )
        return res

    @staticmethod
    def unlock_session(date_str: str, class_id: str, subject_id: str, period: str, principal_uid: str):
        session_id = AttendanceService.get_session_id(date_str, class_id, subject_id, period)
        now_str = datetime.datetime.utcnow().isoformat() + "Z"
        
        existing_session = FirebaseService.get_document("attendanceSessions", session_id) or {}
        session_data = {
            **existing_session,
            "sessionId": session_id,
            "date": date_str,
            "classId": class_id,
            "subjectId": subject_id,
            "period": period,
            "teacherUid": existing_session.get("teacherUid", "482731"),
            "locked": False,
            "lockedBy": None,
            "lockedAt": None,
            "updatedAt": now_str,
            "createdAt": existing_session.get("createdAt", now_str)
        }
        res = FirebaseService.set_document("attendanceSessions", session_id, session_data)

        # Also sync to attendanceLocks
        FirebaseService.set_document("attendanceLocks", session_id, {
            "sessionKey": session_id,
            "lockId": session_id,
            "date": date_str,
            "classId": class_id,
            "subjectId": subject_id,
            "period": period,
            "locked": False,
            "unlockedBy": principal_uid,
            "unlockedAt": now_str
        })

        # Unlock records
        records = FirebaseService.list_documents("studentAttendance")
        for rec in records:
            if (rec.get("date") == date_str and rec.get("classId") == class_id and 
                rec.get("subjectId") == subject_id and rec.get("period") == period):
                FirebaseService.set_document("studentAttendance", rec.get("attendanceId") or rec.get("_id"), {
                    **rec,
                    "locked": False,
                    "updatedAt": now_str
                })

        AuditService.log(
            action="Attendance Unlocked",
            performed_by=principal_uid,
            role="principal",
            target_type="attendanceSessions",
            target_id=session_id,
            details={"action": "Attendance Unlocked", "classId": class_id, "subjectId": subject_id, "date": date_str, "period": period}
        )
        return res

    @staticmethod
    def get_attendance_id(session_id: str, student_id: str):
        # Deterministic document ID: sessionId_studentId
        return f"{session_id}_{student_id}"

    @staticmethod
    def verify_teacher_assignment(teacher_uid: str, class_id: str, subject_id: str):
        assignments = FirebaseService.list_documents("teacherAssignments")
        clean_uid = str(teacher_uid).replace("teacher_", "").strip()
        for a in assignments:
            a_uid = str(a.get("teacherUid", "")).replace("teacher_", "").strip()
            a_code = str(a.get("teacherCode", "")).strip()
            if ((a_uid == clean_uid or a_code == clean_uid or a.get("teacherUid") == teacher_uid) and 
                a.get("classId") == class_id and 
                a.get("subjectId") == subject_id and 
                a.get("status", "active") == "active"):
                return True
        return False
