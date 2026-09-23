import datetime
import config
from services.firebase_service import FirebaseService
from services.attendance_service import AttendanceService

def seed_initial_school_data():
    """
    Seeds initial single-school data if Firestore does not yet have a principal.
    Ensures the system is immediately fully testable and operational.
    """
    principal = FirebaseService.find_user_by_identifier(config.DEFAULT_PRINCIPAL_UID)
    if principal:
        return  # Already initialized

    print("Initializing school data in Firestore...")
    now_str = datetime.datetime.utcnow().isoformat() + "Z"

    # 1. Create Principal Auth & User
    principal_email = f"principal_{config.DEFAULT_PRINCIPAL_UID}@school.internal"
    auth_res, _ = FirebaseService.create_auth_user(
        email=principal_email,
        password=config.DEFAULT_PRINCIPAL_PASSWORD,
        display_name=config.DEFAULT_PRINCIPAL_NAME,
        phone_number=config.DEFAULT_PRINCIPAL_MOBILE
    )
    principal_uid = auth_res.get("localId") if auth_res else config.DEFAULT_PRINCIPAL_UID

    principal_doc = {
        "uid": principal_uid,
        "principalCode": config.DEFAULT_PRINCIPAL_UID,
        "name": config.DEFAULT_PRINCIPAL_NAME,
        "mobileNumber": config.DEFAULT_PRINCIPAL_MOBILE,
        "role": "principal",
        "status": "active",
        "authEmail": principal_email,
        "schoolName": config.SCHOOL_NAME,
        "createdAt": now_str,
        "updatedAt": now_str
    }
    FirebaseService.set_document("users", principal_uid, principal_doc)
    FirebaseService.set_document("users", config.DEFAULT_PRINCIPAL_UID, principal_doc)

    # 2. Create Classes
    classes_data = [
        {"id": "class_9", "name": "Class 9"},
        {"id": "class_10", "name": "Class 10"},
        {"id": "class_11_sci", "name": "Class 11 Science"}
    ]
    for c in classes_data:
        FirebaseService.set_document("classes", c["id"], {
            "classId": c["id"],
            "className": c["name"],
            "status": "active",
            "createdAt": now_str,
            "updatedAt": now_str
        })

    # 3. Create Subjects per Class (Dynamic dependency)
    subjects_data = [
        # Class 9
        {"id": "sub_9_math", "name": "Mathematics", "classId": "class_9"},
        {"id": "sub_9_sci", "name": "Science", "classId": "class_9"},
        {"id": "sub_9_eng", "name": "English", "classId": "class_9"},
        {"id": "sub_9_hin", "name": "Hindi", "classId": "class_9"},
        # Class 10
        {"id": "sub_10_math", "name": "Mathematics", "classId": "class_10"},
        {"id": "sub_10_sci", "name": "Science", "classId": "class_10"},
        {"id": "sub_10_eng", "name": "English", "classId": "class_10"},
        # Class 11 Science
        {"id": "sub_11_phy", "name": "Physics", "classId": "class_11_sci"},
        {"id": "sub_11_chem", "name": "Chemistry", "classId": "class_11_sci"},
        {"id": "sub_11_math", "name": "Mathematics", "classId": "class_11_sci"}
    ]
    for s in subjects_data:
        FirebaseService.set_document("subjects", s["id"], {
            "subjectId": s["id"],
            "subjectName": s["name"],
            "classId": s["classId"],
            "status": "active",
            "createdAt": now_str,
            "updatedAt": now_str
        })

    # 4. Create Sample Teacher (Amit Sharma, 482731)
    teacher_code = "482731"
    teacher_mobile = "+919812345678"
    teacher_name = "Amit Sharma"
    teacher_password = "Teacher@2026"
    teacher_email = f"teacher_{teacher_code}@school.internal"

    t_auth, _ = FirebaseService.create_auth_user(
        email=teacher_email,
        password=teacher_password,
        display_name=teacher_name,
        phone_number=teacher_mobile
    )
    teacher_uid = t_auth.get("localId") if t_auth else f"teacher_{teacher_code}"

    t_user_doc = {
        "uid": teacher_uid,
        "teacherCode": teacher_code,
        "name": teacher_name,
        "mobileNumber": teacher_mobile,
        "role": "teacher",
        "status": "active",
        "authEmail": teacher_email,
        "schoolName": config.SCHOOL_NAME,
        "createdAt": now_str,
        "updatedAt": now_str
    }
    FirebaseService.set_document("users", teacher_uid, t_user_doc)
    FirebaseService.set_document("users", teacher_code, t_user_doc)

    FirebaseService.set_document("teachers", teacher_uid, {
        "uid": teacher_uid,
        "teacherCode": teacher_code,
        "name": teacher_name,
        "mobileNumber": teacher_mobile,
        "status": "active",
        "createdAt": now_str,
        "updatedAt": now_str
    })

    # 5. Create Sample Students
    students_data = [
        # Class 9
        {"id": "STU101", "name": "Aarav Patel", "roll": "1", "classId": "class_9"},
        {"id": "STU102", "name": "Diya Sharma", "roll": "2", "classId": "class_9"},
        {"id": "STU103", "name": "Ishaan Verma", "roll": "3", "classId": "class_9"},
        {"id": "STU104", "name": "Ananya Singh", "roll": "4", "classId": "class_9"},
        {"id": "STU105", "name": "Rohan Gupta", "roll": "5", "classId": "class_9"},
        # Class 10
        {"id": "STU201", "name": "Kabir Mehta", "roll": "1", "classId": "class_10"},
        {"id": "STU202", "name": "Sara Khan", "roll": "2", "classId": "class_10"},
        {"id": "STU203", "name": "Vikram Joshi", "roll": "3", "classId": "class_10"}
    ]
    for st in students_data:
        FirebaseService.set_document("students", st["id"], {
            "studentId": st["id"],
            "name": st["name"],
            "rollNumber": st["roll"],
            "classId": st["classId"],
            "status": "active",
            "createdAt": now_str,
            "updatedAt": now_str
        })

    # 6. Assign Teacher to Class 9 (Mathematics) and Class 9 (Science)
    asgn1_id = "asgn_amit_math9"
    FirebaseService.set_document("teacherAssignments", asgn1_id, {
        "assignmentId": asgn1_id,
        "teacherUid": teacher_uid,
        "classId": "class_9",
        "subjectId": "sub_9_math",
        "status": "active",
        "createdAt": now_str,
        "updatedAt": now_str
    })

    asgn2_id = "asgn_amit_sci9"
    FirebaseService.set_document("teacherAssignments", asgn2_id, {
        "assignmentId": asgn2_id,
        "teacherUid": teacher_uid,
        "classId": "class_9",
        "subjectId": "sub_9_sci",
        "status": "active",
        "createdAt": now_str,
        "updatedAt": now_str
    })

    # 7. Seed sample attendance for today so stats and tables immediately display data
    today_str = datetime.date.today().isoformat()
    period = "Period 1"
    for st in students_data[:5]:
        st_id = st["id"]
        att_id = AttendanceService.get_attendance_id(st_id, "class_9", "sub_9_math", today_str, period)
        st_status = "Present" if st["roll"] in ("1", "2", "4", "5") else "Absent"
        FirebaseService.set_document("studentAttendance", att_id, {
            "attendanceId": att_id,
            "studentId": st_id,
            "classId": "class_9",
            "subjectId": "sub_9_math",
            "teacherUid": teacher_uid,
            "date": today_str,
            "period": period,
            "status": st_status,
            "locked": False,
            "createdAt": now_str,
            "updatedAt": now_str
        })

    # Teacher attendance today marked by Principal
    tatt_id = f"tatt_{teacher_uid}_{today_str}"
    FirebaseService.set_document("teacherAttendance", tatt_id, {
        "attendanceId": tatt_id,
        "teacherUid": teacher_uid,
        "date": today_str,
        "status": "Present",
        "markedBy": principal_uid,
        "createdAt": now_str,
        "updatedAt": now_str
    })

    print("Initial school data seeded successfully!")
