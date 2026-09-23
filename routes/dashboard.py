import datetime
from flask import Blueprint, request, jsonify
from services.firebase_service import FirebaseService

dashboard_bp = Blueprint("dashboard", __name__)

@dashboard_bp.route("/api/dashboard/stats", methods=["GET"])
def get_stats():
    today_str = datetime.date.today().isoformat()

    all_students = FirebaseService.list_documents("students")
    active_students = [s for s in all_students if s.get("status") == "active"]

    all_teachers = FirebaseService.list_documents("teachers")
    active_teachers = [t for t in all_teachers if t.get("status") == "active"]

    all_classes = FirebaseService.list_documents("classes")
    active_classes = [c for c in all_classes if c.get("status") == "active"]

    # Today's student attendance
    all_student_att = FirebaseService.list_documents("studentAttendance")
    today_student_att = [a for a in all_student_att if a.get("date") == today_str]
    today_student_present = [a for a in today_student_att if a.get("status") == "Present"]

    # Today's teacher attendance
    all_teacher_att = FirebaseService.list_documents("teacherAttendance")
    today_teacher_att = [a for a in all_teacher_att if a.get("date") == today_str]
    today_teacher_present = [a for a in today_teacher_att if a.get("status") == "Present"]

    # Recent audits
    all_audits = FirebaseService.list_documents("auditLogs")
    all_audits.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    recent_audits = all_audits[:8]

    return jsonify({
        "success": True,
        "stats": {
            "totalStudents": len(active_students),
            "totalTeachers": len(active_teachers),
            "totalClasses": len(active_classes),
            "todayDate": today_str,
            "todayStudentAttendance": {
                "totalMarked": len(today_student_att),
                "present": len(today_student_present),
                "absent": len(today_student_att) - len(today_student_present)
            },
            "todayTeacherAttendance": {
                "totalMarked": len(today_teacher_att),
                "present": len(today_teacher_present),
                "absent": len(today_teacher_att) - len(today_teacher_present)
            }
        },
        "recentAudits": recent_audits
    })

@dashboard_bp.route("/api/dashboard/teacher-stats", methods=["GET"])
def get_teacher_stats():
    teacher_uid = request.args.get("teacherUid", "").strip()
    today_str = datetime.date.today().isoformat()

    assignments = FirebaseService.list_documents("teacherAssignments")
    my_assignments = [
        a for a in assignments 
        if a.get("teacherUid") == teacher_uid and a.get("status") == "active"
    ]

    classes = {c.get("classId") or c.get("_id"): c.get("className") for c in FirebaseService.list_documents("classes")}
    subjects = {s.get("subjectId") or s.get("_id"): s.get("subjectName") for s in FirebaseService.list_documents("subjects")}

    assigned_details = []
    unique_classes = set()
    for a in my_assignments:
        c_id = a.get("classId")
        s_id = a.get("subjectId")
        unique_classes.add(c_id)
        assigned_details.append({
            "classId": c_id,
            "className": classes.get(c_id, c_id),
            "subjectId": s_id,
            "subjectName": subjects.get(s_id, s_id)
        })

    # Today's attendance marked by this teacher
    all_student_att = FirebaseService.list_documents("studentAttendance")
    today_marked = [
        a for a in all_student_att 
        if a.get("date") == today_str and a.get("teacherUid") == teacher_uid
    ]

    # Teacher's own attendance status today
    teacher_att = FirebaseService.list_documents("teacherAttendance")
    my_today_att = next((a for a in teacher_att if a.get("date") == today_str and a.get("teacherUid") == teacher_uid), None)

    return jsonify({
        "success": True,
        "teacherUid": teacher_uid,
        "assignedCount": len(my_assignments),
        "classesCount": len(unique_classes),
        "assignments": assigned_details,
        "todayMarkedCount": len(today_marked),
        "myAttendanceToday": my_today_att.get("status") if my_today_att else "Not Marked Yet",
        "todayDate": today_str
    })
