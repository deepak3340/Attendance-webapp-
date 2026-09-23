import datetime
import requests
import json

API_KEY = "AIzaSyDduuV3-Z257xDEWv4W6Ya6UmbhPLZ7etk"
PROJECT_ID = "attendance-web-app01"
DATABASE_ID = "(default)"
BASE_URL = f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/{DATABASE_ID}/documents"

def python_to_firestore_value(val):
    if val is None:
        return {"nullValue": None}
    elif isinstance(val, bool):
        return {"booleanValue": val}
    elif isinstance(val, int):
        return {"integerValue": str(val)}
    elif isinstance(val, float):
        return {"doubleValue": val}
    elif isinstance(val, str):
        return {"stringValue": val}
    elif isinstance(val, list):
        return {"arrayValue": {"values": [python_to_firestore_value(item) for item in val]}}
    elif isinstance(val, dict):
        return {"mapValue": {"fields": {k: python_to_firestore_value(v) for k, v in val.items()}}}
    return {"stringValue": str(val)}

def write_doc(collection, doc_id, data):
    url = f"{BASE_URL}/{collection}/{doc_id}?key={API_KEY}"
    fields = {k: python_to_firestore_value(v) for k, v in data.items() if not k.startswith("_")}
    res = requests.patch(url, json={"fields": fields}, timeout=10)
    if res.status_code == 200:
        print(f"  [OK] {collection}/{doc_id}")
    else:
        print(f"  [FAIL {res.status_code}] {collection}/{doc_id} -> {res.text}")

def seed_all():
    print(f"=== Populating Firestore Project: {PROJECT_ID} ({DATABASE_ID}) ===")
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    today_str = datetime.date.today().isoformat()

    # 1. Classes Collection
    print("1. Creating 'classes' collection...")
    classes = [
        {"classId": "class_9", "className": "Class 9", "status": "active", "createdAt": now_str, "updatedAt": now_str},
        {"classId": "class_10", "className": "Class 10", "status": "active", "createdAt": now_str, "updatedAt": now_str},
        {"classId": "class_11_sci", "className": "Class 11 Science", "status": "active", "createdAt": now_str, "updatedAt": now_str},
    ]
    for c in classes:
        write_doc("classes", c["classId"], c)

    # 2. Subjects Collection
    print("2. Creating 'subjects' collection...")
    subjects = [
        {"subjectId": "sub_9_math", "subjectName": "Mathematics", "classId": "class_9", "status": "active", "createdAt": now_str},
        {"subjectId": "sub_9_eng", "subjectName": "English", "classId": "class_9", "status": "active", "createdAt": now_str},
        {"subjectId": "sub_9_sci", "subjectName": "General Science", "classId": "class_9", "status": "active", "createdAt": now_str},
        {"subjectId": "sub_10_math", "subjectName": "Mathematics", "classId": "class_10", "status": "active", "createdAt": now_str},
        {"subjectId": "sub_10_eng", "subjectName": "English Literature", "classId": "class_10", "status": "active", "createdAt": now_str},
        {"subjectId": "sub_10_sci", "subjectName": "Science & Tech", "classId": "class_10", "status": "active", "createdAt": now_str},
        {"subjectId": "sub_11_phy", "subjectName": "Physics", "classId": "class_11_sci", "status": "active", "createdAt": now_str},
        {"subjectId": "sub_11_chem", "subjectName": "Chemistry", "classId": "class_11_sci", "status": "active", "createdAt": now_str},
        {"subjectId": "sub_11_math", "subjectName": "Mathematics", "classId": "class_11_sci", "status": "active", "createdAt": now_str},
    ]
    for s in subjects:
        write_doc("subjects", s["subjectId"], s)

    # 3. Users Collection
    print("3. Creating 'users' collection...")
    principal_doc = {
        "uid": "PRIN001",
        "principalCode": "PRIN001",
        "name": "Dr. Rajeshwar Sharma",
        "mobileNumber": "+919876543210",
        "role": "principal",
        "status": "active",
        "authEmail": "principal_PRIN001@school.internal",
        "schoolName": "Greenwood Academy High School",
        "createdAt": now_str,
        "updatedAt": now_str
    }
    write_doc("users", "PRIN001", principal_doc)

    teacher_user_doc = {
        "uid": "teacher_482731",
        "teacherCode": "482731",
        "name": "Amit Sharma",
        "mobileNumber": "+919812345678",
        "role": "teacher",
        "status": "active",
        "authEmail": "teacher_482731@school.internal",
        "schoolName": "Greenwood Academy High School",
        "createdAt": now_str,
        "updatedAt": now_str
    }
    write_doc("users", "teacher_482731", teacher_user_doc)
    write_doc("users", "482731", teacher_user_doc)

    # 4. Teachers Collection
    print("4. Creating 'teachers' collection...")
    teacher_doc = {
        "uid": "teacher_482731",
        "teacherCode": "482731",
        "name": "Amit Sharma",
        "mobileNumber": "+919812345678",
        "status": "active",
        "createdAt": now_str,
        "updatedAt": now_str
    }
    write_doc("teachers", "teacher_482731", teacher_doc)

    # 5. Students Collection
    print("5. Creating 'students' collection...")
    students = [
        {"id": "STU101", "name": "Aarav Patel", "roll": "1", "classId": "class_9"},
        {"id": "STU102", "name": "Diya Sharma", "roll": "2", "classId": "class_9"},
        {"id": "STU103", "name": "Ishaan Verma", "roll": "3", "classId": "class_9"},
        {"id": "STU104", "name": "Ananya Singh", "roll": "4", "classId": "class_9"},
        {"id": "STU201", "name": "Rohan Mehta", "roll": "1", "classId": "class_10"},
        {"id": "STU202", "name": "Sneha Nair", "roll": "2", "classId": "class_10"},
        {"id": "STU301", "name": "Kabir Joshi", "roll": "1", "classId": "class_11_sci"},
        {"id": "STU302", "name": "Pooja Gupta", "roll": "2", "classId": "class_11_sci"}
    ]
    for st in students:
        write_doc("students", st["id"], {
            "studentId": st["id"],
            "name": st["name"],
            "rollNumber": st["roll"],
            "classId": st["classId"],
            "status": "active",
            "createdAt": now_str,
            "updatedAt": now_str
        })

    # 6. Teacher Assignments Collection
    print("6. Creating 'teacherAssignments' collection...")
    assignments = [
        {"id": "asgn_482731_class_9_sub_9_math", "teacherUid": "teacher_482731", "teacherCode": "482731", "classId": "class_9", "subjectId": "sub_9_math"},
        {"id": "asgn_482731_class_10_sub_10_math", "teacherUid": "teacher_482731", "teacherCode": "482731", "classId": "class_10", "subjectId": "sub_10_math"},
    ]
    for a in assignments:
        write_doc("teacherAssignments", a["id"], {
            "assignmentId": a["id"],
            "teacherUid": a["teacherUid"],
            "teacherCode": a["teacherCode"],
            "classId": a["classId"],
            "subjectId": a["subjectId"],
            "assignedAt": now_str
        })

    # 7. Student Attendance Collection
    print("7. Creating 'attendance' collection...")
    sample_records = [
        {"studentId": "STU101", "status": "Present", "classId": "class_9", "subjectId": "sub_9_math"},
        {"studentId": "STU102", "status": "Present", "classId": "class_9", "subjectId": "sub_9_math"},
        {"studentId": "STU103", "status": "Present", "classId": "class_9", "subjectId": "sub_9_math"},
        {"studentId": "STU104", "status": "Absent", "classId": "class_9", "subjectId": "sub_9_math"},
    ]
    for idx, r in enumerate(sample_records):
        doc_id = f"{today_str}_class_9_sub_9_math_Period_1_{r['studentId']}"
        write_doc("attendance", doc_id, {
            "attendanceId": doc_id,
            "date": today_str,
            "classId": r["classId"],
            "subjectId": r["subjectId"],
            "period": "Period 1",
            "studentId": r["studentId"],
            "status": r["status"],
            "markedBy": "teacher_482731",
            "markedAt": now_str
        })

    # 8. Attendance Locks Collection
    print("8. Creating 'attendanceLocks' collection...")
    lock_id = f"{today_str}_class_9_sub_9_math_Period_1"
    write_doc("attendanceLocks", lock_id, {
        "sessionKey": lock_id,
        "isLocked": False,
        "lockedBy": None,
        "lockedAt": None
    })

    # 9. Teacher Attendance Collection
    print("9. Creating 'teacherAttendance' collection...")
    write_doc("teacherAttendance", f"{today_str}_teacher_482731", {
        "recordId": f"{today_str}_teacher_482731",
        "date": today_str,
        "teacherUid": "teacher_482731",
        "teacherCode": "482731",
        "status": "Present",
        "markedBy": "PRIN001",
        "markedAt": now_str
    })

    # 10. Audit Logs Collection
    print("10. Creating 'auditLogs' collection...")
    log_id = f"log_init_system"
    write_doc("auditLogs", log_id, {
        "logId": log_id,
        "action": "Database Initialized",
        "targetType": "system",
        "targetId": PROJECT_ID,
        "details": "Firestore collections initialized for single-school attendance app.",
        "performedBy": "PRIN001",
        "role": "principal",
        "timestamp": now_str
    })

    print(f"\n✅ All 10 collections successfully created and populated in Firestore project '{PROJECT_ID}'!")

if __name__ == "__main__":
    seed_all()
