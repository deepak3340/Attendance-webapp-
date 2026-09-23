import datetime
from flask import Blueprint, request, jsonify
from services.firebase_service import FirebaseService
from services.attendance_service import AttendanceService
from services.audit_service import AuditService

attendance_bp = Blueprint("attendance", __name__)

@attendance_bp.route("/api/attendance/session", methods=["GET"])
def get_session_attendance():
    """
    Loads students and existing attendance marks for:
    classId, subjectId, date, period.
    Also returns whether the session is currently locked by Principal.
    """
    class_id = request.args.get("classId", "").strip()
    subject_id = request.args.get("subjectId", "").strip()
    date_str = request.args.get("date", "").strip()
    period = request.args.get("period", "").strip()
    user_role = request.args.get("role", "teacher").strip()
    user_uid = request.args.get("uid", "").strip()

    if not class_id or not subject_id or not date_str or not period:
        return jsonify({"success": False, "message": "Class, Subject, Date, and Period are required."}), 400

    # If teacher, verify assignment
    if user_role == "teacher":
        is_assigned = AttendanceService.verify_teacher_assignment(user_uid, class_id, subject_id)
        if not is_assigned:
            return jsonify({"success": False, "message": "You are not assigned to this Class and Subject."}), 403

    # Check lock status
    is_locked, lock_info = AttendanceService.is_session_locked(date_str, class_id, subject_id, period)

    # Fetch active students for this class
    all_students = FirebaseService.list_documents("students")
    class_students = [
        s for s in all_students 
        if str(s.get("classId", "")).strip() == class_id and s.get("status", "active") == "active"
    ]
    def sort_key(x):
        try:
            return (0, int(x.get("rollNumber", 0)))
        except Exception:
            return (1, str(x.get("name", "")))
    class_students.sort(key=sort_key)

    # Fetch existing attendance marks for this session
    all_attendance = FirebaseService.list_documents("studentAttendance")
    existing_marks = {}
    for att in all_attendance:
        if (att.get("classId") == class_id and 
            att.get("subjectId") == subject_id and 
            att.get("date") == date_str and 
            att.get("period") == period):
            existing_marks[att.get("studentId")] = {
                "attendanceId": att.get("attendanceId") or att.get("_id"),
                "status": att.get("status", "Present"),
                "locked": att.get("locked", False)
            }

    students_with_status = []
    for s in class_students:
        s_id = s.get("studentId") or s.get("_id")
        existing_mark = existing_marks.get(s_id)
        current_status = existing_mark["status"] if existing_mark else "Present" # default Present
        is_rec_locked = is_locked or (existing_mark.get("locked") if existing_mark else False)
        students_with_status.append({
            "studentId": s_id,
            "rollNumber": s.get("rollNumber"),
            "name": s.get("name"),
            "status": current_status,
            "hasExisting": bool(existing_mark),
            "locked": is_rec_locked
        })

    return jsonify({
        "success": True,
        "classId": class_id,
        "subjectId": subject_id,
        "date": date_str,
        "period": period,
        "isLocked": is_locked,
        "lockDetails": lock_info,
        "students": students_with_status,
        "totalStudents": len(students_with_status)
    })

@attendance_bp.route("/api/attendance/student", methods=["POST"])
def save_student_attendance():
    data = request.get_json() or {}
    class_id = str(data.get("classId", "")).strip()
    subject_id = str(data.get("subjectId", "")).strip()
    date_str = str(data.get("date", "")).strip()
    period = str(data.get("period", "")).strip()
    attendance_records = data.get("attendance", []) # list of {studentId, status}
    teacher_uid = str(data.get("teacherUid", "")).strip()
    user_role = str(data.get("role", "teacher")).strip()

    if not class_id or not subject_id or not date_str or not period:
        return jsonify({"success": False, "message": "Class, Subject, Date, and Period are required."}), 400

    if not attendance_records:
        return jsonify({"success": False, "message": "No student attendance records provided."}), 400

    # Authorization checks
    if user_role == "teacher":
        # 1. Check teacher is assigned
        if not AttendanceService.verify_teacher_assignment(teacher_uid, class_id, subject_id):
            return jsonify({"success": False, "message": "Teacher is not authorized for this class and subject."}), 403

        # 2. Check if session is locked
        is_locked, _ = AttendanceService.is_session_locked(date_str, class_id, subject_id, period)
        if is_locked:
            return jsonify({"success": False, "message": "Attendance is locked by Principal. Modification not allowed."}), 403

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    saved_count = 0
    session_id = AttendanceService.get_session_id(date_str, class_id, subject_id, period)

    # 1. Maintain attendanceSessions document
    session_doc = FirebaseService.get_document("attendanceSessions", session_id)
    if not session_doc:
        FirebaseService.set_document("attendanceSessions", session_id, {
            "sessionId": session_id,
            "date": date_str,
            "classId": class_id,
            "subjectId": subject_id,
            "period": period,
            "teacherUid": teacher_uid,
            "locked": False,
            "lockedBy": None,
            "lockedAt": None,
            "createdAt": now_str,
            "updatedAt": now_str
        })
    else:
        FirebaseService.set_document("attendanceSessions", session_id, {
            **session_doc,
            "teacherUid": teacher_uid,
            "updatedAt": now_str
        })

    # 2. Save individual student attendance records
    for item in attendance_records:
        s_id = str(item.get("studentId", "")).strip()
        status_val = str(item.get("status", "Present")).strip().capitalize()
        if status_val not in ("Present", "Absent"):
            status_val = "Present"

        # Deterministic record ID: sessionId_studentId prevents duplicate attendance
        attendance_id = AttendanceService.get_attendance_id(session_id, s_id)

        record_data = {
            "attendanceId": attendance_id,
            "sessionId": session_id,
            "studentId": s_id,
            "classId": class_id,
            "subjectId": subject_id,
            "teacherUid": teacher_uid,
            "date": date_str,
            "period": period,
            "status": status_val,
            "markedBy": teacher_uid,
            "updatedAt": now_str
        }

        # Check existing to preserve markedAt
        existing = FirebaseService.get_document("studentAttendance", attendance_id)
        if not existing:
            record_data["markedAt"] = now_str
        else:
            record_data["markedAt"] = existing.get("markedAt", existing.get("createdAt", now_str))

        FirebaseService.set_document("studentAttendance", attendance_id, record_data)
        saved_count += 1

    AuditService.log(
        action="Student Attendance Saved",
        performed_by=teacher_uid,
        role=user_role,
        target_type="attendanceSessions",
        target_id=session_id,
        details={
            "action": "Student Attendance Saved",
            "classId": class_id,
            "subjectId": subject_id,
            "date": date_str,
            "period": period,
            "savedCount": saved_count
        }
    )

    return jsonify({
        "success": True,
        "message": f"Attendance saved successfully for {saved_count} students.",
        "savedCount": saved_count
    })

@attendance_bp.route("/api/attendance/lock", methods=["POST"])
def lock_attendance():
    """
    Principal locks attendance for: date, classId, subjectId, period.
    Only Principal can call this.
    """
    data = request.get_json() or {}
    class_id = str(data.get("classId", "")).strip()
    subject_id = str(data.get("subjectId", "")).strip()
    date_str = str(data.get("date", "")).strip()
    period = str(data.get("period", "")).strip()
    principal_uid = str(data.get("principalUid", "PRIN001")).strip()
    user_role = str(data.get("role", "")).strip().lower()

    if user_role != "principal":
        return jsonify({"success": False, "message": "Only Principal can lock attendance."}), 403

    if not class_id or not subject_id or not date_str or not period:
        return jsonify({"success": False, "message": "All fields (Class, Subject, Date, Period) are required."}), 400

    AttendanceService.lock_session(date_str, class_id, subject_id, period, principal_uid)

    return jsonify({
        "success": True,
        "message": f"Attendance locked successfully for {date_str} ({period}).",
        "isLocked": True
    })

@attendance_bp.route("/api/attendance/unlock", methods=["POST"])
def unlock_attendance():
    """
    Principal unlocks attendance for: date, classId, subjectId, period.
    Only Principal can call this.
    """
    data = request.get_json() or {}
    class_id = str(data.get("classId", "")).strip()
    subject_id = str(data.get("subjectId", "")).strip()
    date_str = str(data.get("date", "")).strip()
    period = str(data.get("period", "")).strip()
    principal_uid = str(data.get("principalUid", "PRIN001")).strip()
    user_role = str(data.get("role", "")).strip().lower()

    if user_role != "principal":
        return jsonify({"success": False, "message": "Only Principal can unlock attendance."}), 403

    if not class_id or not subject_id or not date_str or not period:
        return jsonify({"success": False, "message": "All fields (Class, Subject, Date, Period) are required."}), 400

    AttendanceService.unlock_session(date_str, class_id, subject_id, period, principal_uid)

    return jsonify({
        "success": True,
        "message": f"Attendance unlocked successfully for {date_str} ({period}).",
        "isLocked": False
    })

@attendance_bp.route("/api/attendance/student-records", methods=["GET"])
def get_student_attendance_records():
    """
    Search and filter attendance records.
    Used by Principal (all records) and Teacher (only authorized records).
    """
    user_role = request.args.get("role", "teacher").strip()
    user_uid = request.args.get("uid", "").strip()
    filter_class = request.args.get("classId", "").strip()
    filter_subject = request.args.get("subjectId", "").strip()
    filter_student = request.args.get("studentName", "").strip().lower()
    filter_roll = request.args.get("rollNumber", "").strip()
    filter_date_from = request.args.get("dateFrom", "").strip()
    filter_date_to = request.args.get("dateTo", "").strip()
    filter_status = request.args.get("status", "").strip().capitalize()

    # Preload entities for enrichment
    all_students = {s.get("studentId") or s.get("_id"): s for s in FirebaseService.list_documents("students")}
    all_classes = {c.get("classId") or c.get("_id"): c.get("className") for c in FirebaseService.list_documents("classes")}
    all_subjects = {s.get("subjectId") or s.get("_id"): s.get("subjectName") for s in FirebaseService.list_documents("subjects")}
    all_teachers = {t.get("uid") or t.get("_id"): t.get("name") for t in FirebaseService.list_documents("teachers")}

    # If teacher, get their assigned classes/subjects
    teacher_assignments = set()
    if user_role == "teacher":
        assignments = FirebaseService.list_documents("teacherAssignments")
        for a in assignments:
            if a.get("teacherUid") == user_uid and a.get("status") == "active":
                teacher_assignments.add((a.get("classId"), a.get("subjectId")))

    all_attendance = FirebaseService.list_documents("studentAttendance")
    filtered = []

    for att in all_attendance:
        c_id = att.get("classId", "")
        s_id = att.get("subjectId", "")
        st_id = att.get("studentId", "")
        rec_date = att.get("date", "")
        st_status = att.get("status", "Present")

        # Teacher authorization boundary: only authorized classes/subjects
        if user_role == "teacher":
            if (c_id, s_id) not in teacher_assignments and att.get("teacherUid") != user_uid:
                continue

        if filter_class and c_id != filter_class:
            continue
        if filter_subject and s_id != filter_subject:
            continue
        if filter_status and st_status != filter_status:
            continue
        if filter_date_from and rec_date < filter_date_from:
            continue
        if filter_date_to and rec_date > filter_date_to:
            continue

        student_obj = all_students.get(st_id, {})
        student_name = student_obj.get("name", "Unknown")
        student_roll = str(student_obj.get("rollNumber", "-"))

        if filter_student and filter_student not in student_name.lower():
            continue
        if filter_roll and filter_roll != student_roll:
            continue

        filtered.append({
            "attendanceId": att.get("attendanceId") or att.get("_id"),
            "date": rec_date,
            "period": att.get("period", "-"),
            "studentId": st_id,
            "studentName": student_name,
            "rollNumber": student_roll,
            "classId": c_id,
            "className": all_classes.get(c_id, c_id),
            "subjectId": s_id,
            "subjectName": all_subjects.get(s_id, s_id),
            "status": st_status,
            "locked": att.get("locked", False),
            "teacherUid": att.get("teacherUid", ""),
            "teacherName": all_teachers.get(att.get("teacherUid"), "Teacher")
        })

    filtered.sort(key=lambda x: (x.get("date", ""), str(x.get("rollNumber", ""))), reverse=True)
    return jsonify({"success": True, "records": filtered, "count": len(filtered)})

# ================= TEACHER ATTENDANCE (Principal Marks) ================= #

@attendance_bp.route("/api/attendance/teacher", methods=["GET"])
def get_teacher_attendance():
    filter_name = request.args.get("name", "").strip().lower()
    filter_uid = request.args.get("teacherCode", "").strip()
    filter_date_from = request.args.get("dateFrom", "").strip()
    filter_date_to = request.args.get("dateTo", "").strip()
    filter_status = request.args.get("status", "").strip().capitalize()

    teachers = {t.get("uid") or t.get("_id"): t for t in FirebaseService.list_documents("teachers")}
    all_records = FirebaseService.list_documents("teacherAttendance")

    filtered = []
    for rec in all_records:
        t_id = rec.get("teacherUid")
        rec_date = rec.get("date", "")
        status_val = rec.get("status", "Present")

        if filter_status and status_val != filter_status:
            continue
        if filter_date_from and rec_date < filter_date_from:
            continue
        if filter_date_to and rec_date > filter_date_to:
            continue

        t_info = teachers.get(t_id, {})
        t_name = t_info.get("name", "Unknown")
        t_code = str(t_info.get("teacherCode", "-"))

        if filter_name and filter_name not in t_name.lower():
            continue
        if filter_uid and filter_uid != t_code:
            continue

        filtered.append({
            "attendanceId": rec.get("attendanceId") or rec.get("_id"),
            "teacherUid": t_id,
            "teacherCode": t_code,
            "teacherName": t_name,
            "date": rec_date,
            "status": status_val,
            "markedBy": rec.get("markedBy", "Principal"),
            "createdAt": rec.get("createdAt")
        })

    filtered.sort(key=lambda x: x.get("date", ""), reverse=True)
    return jsonify({"success": True, "records": filtered, "count": len(filtered)})

@attendance_bp.route("/api/attendance/teacher", methods=["POST"])
def mark_teacher_attendance():
    """
    Only Principal can mark Teacher Attendance.
    Prevents duplicate for Teacher + Date.
    """
    data = request.get_json() or {}
    teacher_uid = str(data.get("teacherUid", "")).strip()
    date_str = str(data.get("date", "")).strip()
    status_val = str(data.get("status", "Present")).strip().capitalize()
    principal_uid = str(data.get("principalUid", "PRIN001")).strip()
    user_role = str(data.get("role", "")).strip().lower()

    if user_role != "principal":
        return jsonify({"success": False, "message": "Only Principal can mark Teacher Attendance."}), 403

    if not teacher_uid or not date_str:
        return jsonify({"success": False, "message": "Teacher and Date are required."}), 400

    if status_val not in ("Present", "Absent"):
        status_val = "Present"

    # Verify teacher
    teacher = FirebaseService.get_document("teachers", teacher_uid)
    if not teacher:
        return jsonify({"success": False, "message": "Teacher not found."}), 404

    # Deterministic attendance ID prevents duplicate Teacher + Date
    attendance_id = f"tatt_{teacher_uid}_{date_str}"
    existing = FirebaseService.get_document("teacherAttendance", attendance_id)
    now_str = datetime.datetime.utcnow().isoformat() + "Z"

    record_data = {
        "attendanceId": attendance_id,
        "teacherUid": teacher_uid,
        "date": date_str,
        "status": status_val,
        "markedBy": principal_uid,
        "createdAt": existing.get("createdAt", now_str) if existing else now_str,
        "updatedAt": now_str
    }
    FirebaseService.set_document("teacherAttendance", attendance_id, record_data)

    action_name = "Teacher Attendance Updated" if existing else "Teacher Attendance Marked"
    AuditService.log(
        action=action_name,
        performed_by=principal_uid,
        role="principal",
        target_type="teacherAttendance",
        target_id=attendance_id,
        details=f"Marked {teacher.get('name')} as {status_val} on {date_str}"
    )

    return jsonify({
        "success": True,
        "message": f"Attendance marked as '{status_val}' for teacher {teacher.get('name')} on {date_str}."
    })
