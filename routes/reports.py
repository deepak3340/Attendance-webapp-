import datetime
from flask import Blueprint, request, jsonify, send_file
import config
from services.firebase_service import FirebaseService
from services.excel_service import ExcelService
from services.audit_service import AuditService

reports_bp = Blueprint("reports", __name__)

@reports_bp.route("/api/reports/students/excel", methods=["POST"])
def export_students_excel():
    data = request.get_json() or {}
    user_role = str(data.get("role", "")).strip().lower()
    principal_uid = str(data.get("principalUid", "PRIN001")).strip()

    # Report Security: Teacher must NOT access Principal report endpoints
    if user_role != "principal":
        return jsonify({"success": False, "message": "Access denied. Only Principal can download attendance reports."}), 403

    year = str(data.get("year", datetime.datetime.now().year)).strip()
    month = str(data.get("month", "")).strip() # 1-12 or empty for whole year
    class_id = str(data.get("classId", "")).strip()
    subject_id = str(data.get("subjectId", "")).strip()
    student_id = str(data.get("studentId", "")).strip()

    all_students = {s.get("studentId") or s.get("_id"): s for s in FirebaseService.list_documents("students")}
    all_classes = {c.get("classId") or c.get("_id"): c.get("className") for c in FirebaseService.list_documents("classes")}
    all_subjects = {s.get("subjectId") or s.get("_id"): s.get("subjectName") for s in FirebaseService.list_documents("subjects")}
    all_teachers = {t.get("uid") or t.get("_id"): t.get("name") for t in FirebaseService.list_documents("teachers")}

    all_attendance = FirebaseService.list_documents("studentAttendance")
    matched_records = []

    month_names = {
        "1": "January", "2": "February", "3": "March", "4": "April",
        "5": "May", "6": "June", "7": "July", "8": "August",
        "9": "September", "10": "October", "11": "November", "12": "December"
    }
    month_label = month_names.get(month, "Full_Year") if month else "Full_Year"
    class_label = all_classes.get(class_id, "All_Classes").replace(" ", "")

    for att in all_attendance:
        rec_date = att.get("date", "")
        if not rec_date:
            continue

        # Date filtering
        try:
            dt = datetime.datetime.strptime(rec_date, "%Y-%m-%d")
        except Exception:
            continue

        if str(dt.year) != year:
            continue
        if month and str(dt.month) != month:
            continue

        if class_id and att.get("classId") != class_id:
            continue
        if subject_id and att.get("subjectId") != subject_id:
            continue
        if student_id and att.get("studentId") != student_id:
            continue

        st_id = att.get("studentId")
        st_obj = all_students.get(st_id, {})
        t_name = all_teachers.get(att.get("teacherUid"), "Teacher")

        matched_records.append({
            "rollNumber": st_obj.get("rollNumber", "-"),
            "studentName": st_obj.get("name", "Unknown"),
            "classId": att.get("classId"),
            "className": all_classes.get(att.get("classId"), att.get("classId")),
            "subjectId": att.get("subjectId"),
            "subjectName": all_subjects.get(att.get("subjectId"), att.get("subjectId")),
            "date": rec_date,
            "period": att.get("period", "-"),
            "status": att.get("status", "Present"),
            "teacherName": t_name
        })

    def sort_key(x):
        try:
            return (x["date"], int(x["rollNumber"]))
        except Exception:
            return (x["date"], str(x["rollNumber"]))

    matched_records.sort(key=sort_key)

    filename = f"Attendance_Students_{class_label}_{month_label}_{year}.xlsx"
    filter_desc = f"Year: {year} | Month: {month_label} | Class: {all_classes.get(class_id, 'All')} | Subject: {all_subjects.get(subject_id, 'All')}"

    excel_buffer = ExcelService.create_student_report(
        records=matched_records,
        school_name=config.SCHOOL_NAME,
        title_meta={"filter_desc": filter_desc}
    )

    AuditService.log(
        action="Student Report Downloaded",
        performed_by=principal_uid,
        role="principal",
        target_type="report",
        target_id=filename,
        details=f"Generated Excel report with {len(matched_records)} records ({filter_desc})"
    )

    return send_file(
        excel_buffer,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename
    )

@reports_bp.route("/api/reports/teachers/excel", methods=["POST"])
def export_teachers_excel():
    data = request.get_json() or {}
    user_role = str(data.get("role", "")).strip().lower()
    principal_uid = str(data.get("principalUid", "PRIN001")).strip()

    if user_role != "principal":
        return jsonify({"success": False, "message": "Access denied. Only Principal can download attendance reports."}), 403

    year = str(data.get("year", datetime.datetime.now().year)).strip()
    month = str(data.get("month", "")).strip()
    teacher_uid = str(data.get("teacherUid", "")).strip()

    teachers = {t.get("uid") or t.get("_id"): t for t in FirebaseService.list_documents("teachers")}
    all_attendance = FirebaseService.list_documents("teacherAttendance")

    month_names = {
        "1": "January", "2": "February", "3": "March", "4": "April",
        "5": "May", "6": "June", "7": "July", "8": "August",
        "9": "September", "10": "October", "11": "November", "12": "December"
    }
    month_label = month_names.get(month, "Full_Year") if month else "Full_Year"

    matched_records = []
    for att in all_attendance:
        rec_date = att.get("date", "")
        if not rec_date:
            continue
        try:
            dt = datetime.datetime.strptime(rec_date, "%Y-%m-%d")
        except Exception:
            continue

        if str(dt.year) != year:
            continue
        if month and str(dt.month) != month:
            continue

        t_id = att.get("teacherUid")
        if teacher_uid and t_id != teacher_uid:
            continue

        t_info = teachers.get(t_id, {})
        matched_records.append({
            "teacherUid": t_id,
            "teacherCode": t_info.get("teacherCode", "-"),
            "teacherName": t_info.get("name", "Unknown"),
            "date": rec_date,
            "status": att.get("status", "Present")
        })

    matched_records.sort(key=lambda x: (x.get("date", ""), str(x.get("teacherName", ""))))

    filename = f"Attendance_Teachers_{month_label}_{year}.xlsx"
    filter_desc = f"Year: {year} | Month: {month_label} | Teachers: {'All Teachers' if not teacher_uid else teachers.get(teacher_uid, {}).get('name', 'Selected')}"

    excel_buffer = ExcelService.create_teacher_report(
        records=matched_records,
        school_name=config.SCHOOL_NAME,
        title_meta={"filter_desc": filter_desc}
    )

    AuditService.log(
        action="Teacher Report Downloaded",
        performed_by=principal_uid,
        role="principal",
        target_type="report",
        target_id=filename,
        details=f"Generated Teacher Excel report with {len(matched_records)} records"
    )

    return send_file(
        excel_buffer,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=filename
    )
