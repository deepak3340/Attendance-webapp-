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

def firestore_to_python_value(val_dict):
    if not val_dict or not isinstance(val_dict, dict):
        return None
    for k, v in val_dict.items():
        if k == "nullValue":
            return None
        elif k == "booleanValue":
            return v
        elif k == "integerValue":
            return int(v)
        elif k == "doubleValue":
            return float(v)
        elif k == "stringValue":
            return v
        elif k == "timestampValue":
            return v
        elif k == "arrayValue":
            items = v.get("values", [])
            return [firestore_to_python_value(item) for item in items]
        elif k == "mapValue":
            fields = v.get("fields", {})
            return {fk: firestore_to_python_value(fv) for fk, fv in fields.items()}
    return None

def write_doc(collection, doc_id, data):
    url = f"{BASE_URL}/{collection}/{doc_id}?key={API_KEY}"
    fields = {k: python_to_firestore_value(v) for k, v in data.items() if not k.startswith("_")}
    res = requests.patch(url, json={"fields": fields}, timeout=10)
    if res.status_code == 200:
        print(f"  [OK] {collection}/{doc_id}")
        return True
    else:
        print(f"  [FAIL {res.status_code}] {collection}/{doc_id} -> {res.text}")
        return False

def get_doc(collection, doc_id):
    url = f"{BASE_URL}/{collection}/{doc_id}?key={API_KEY}"
    res = requests.get(url, timeout=10)
    if res.status_code == 200:
        fields = res.json().get("fields", {})
        return {k: firestore_to_python_value(v) for k, v in fields.items()}
    return None

def list_collection(collection):
    url = f"{BASE_URL}/{collection}?key={API_KEY}"
    res = requests.get(url, timeout=10)
    results = []
    if res.status_code == 200:
        docs = res.json().get("documents", [])
        for d in docs:
            doc_id = d["name"].split("/")[-1]
            fields = d.get("fields", {})
            parsed = {k: firestore_to_python_value(v) for k, v in fields.items()}
            parsed["_id"] = doc_id
            results.append(parsed)
    return results

def migrate_and_build():
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    print("=== 1. Checking and Migrating Existing Attendance Records ===")
    
    # Inspect legacy 'attendance' collection
    legacy_attendance = list_collection("attendance")
    print(f"Found {len(legacy_attendance)} existing attendance records in 'attendance'")
    
    for rec in legacy_attendance:
        date = rec.get("date", "2026-09-23")
        class_id = rec.get("classId", "class_9")
        subject_id = rec.get("subjectId", "sub_9_math")
        period = rec.get("period", "Period 1")
        student_id = rec.get("studentId", "STU101")
        status = rec.get("status", "Present")
        marked_by = rec.get("markedBy", "482731")
        marked_at = rec.get("markedAt", now_str)

        safe_p = period.strip().replace(" ", "")
        session_id = f"{date}_{class_id}_{subject_id}_{safe_p}"
        attendance_id = f"{session_id}_{student_id}"

        student_att_doc = {
            "attendanceId": attendance_id,
            "sessionId": session_id,
            "studentId": student_id,
            "classId": class_id,
            "subjectId": subject_id,
            "teacherUid": "482731",
            "date": date,
            "period": period,
            "status": status,
            "markedBy": marked_by,
            "markedAt": marked_at,
            "updatedAt": now_str
        }
        write_doc("studentAttendance", attendance_id, student_att_doc)

    print("\n=== 2. Creating / Ensuring 'attendanceSessions' Collection ===")
    session_id = "2026-09-23_class_9_sub_9_math_Period1"
    session_doc = {
        "sessionId": session_id,
        "date": "2026-09-23",
        "classId": "class_9",
        "subjectId": "sub_9_math",
        "period": "Period 1",
        "teacherUid": "482731",
        "locked": False,
        "lockedBy": None,
        "lockedAt": None,
        "createdAt": now_str,
        "updatedAt": now_str
    }
    write_doc("attendanceSessions", session_id, session_doc)
    # Also with period as 'Period_1' in case underscore key used
    session_id_alt = "2026-09-23_class_9_sub_9_math_Period_1"
    session_doc_alt = {
        "sessionId": session_id_alt,
        "date": "2026-09-23",
        "classId": "class_9",
        "subjectId": "sub_9_math",
        "period": "Period 1",
        "teacherUid": "482731",
        "locked": False,
        "lockedBy": None,
        "lockedAt": None,
        "createdAt": now_str,
        "updatedAt": now_str
    }
    write_doc("attendanceSessions", session_id_alt, session_doc_alt)

    print("\n=== 3. Creating 'schoolSettings' Collection ===")
    school_doc = {
        "schoolName": "Greenwood Academy High School",
        "schoolAddress": "123 Academic Enclave, Knowledge City",
        "principalUid": "PRIN001",
        "createdAt": now_str,
        "updatedAt": now_str
    }
    write_doc("schoolSettings", "school", school_doc)

    print("\n=== 4. Ensuring 'teachers' Collection fields ===")
    teacher_doc = {
        "uid": "teacher_482731",
        "teacherUid": "482731",
        "name": "Amit Sharma",
        "mobileNumber": "+919812345678",
        "status": "active",
        "createdAt": now_str,
        "updatedAt": now_str
    }
    write_doc("teachers", "teacher_482731", teacher_doc)

    print("\n=== 5. Ensuring 'teacherAssignments' Collection fields ===")
    asgn_1 = {
        "assignmentId": "asgn_482731_class_9_sub_9_math",
        "teacherUid": "482731",
        "classId": "class_9",
        "subjectId": "sub_9_math",
        "status": "active",
        "createdAt": now_str,
        "updatedAt": now_str
    }
    write_doc("teacherAssignments", "asgn_482731_class_9_sub_9_math", asgn_1)

    asgn_2 = {
        "assignmentId": "asgn_482731_class_10_sub_10_math",
        "teacherUid": "482731",
        "classId": "class_10",
        "subjectId": "sub_10_math",
        "status": "active",
        "createdAt": now_str,
        "updatedAt": now_str
    }
    write_doc("teacherAssignments", "asgn_482731_class_10_sub_10_math", asgn_2)

    print("\n=== 6. Ensuring 'teacherAttendance' Collection fields ===")
    tatt_doc = {
        "attendanceId": "tatt_482731_2026-09-23",
        "teacherUid": "482731",
        "date": "2026-09-23",
        "status": "Present",
        "markedBy": "PRIN001",
        "markedAt": now_str,
        "updatedAt": now_str
    }
    write_doc("teacherAttendance", "tatt_482731_2026-09-23", tatt_doc)

    print("\n✅ Migration and database structure build complete!")

if __name__ == "__main__":
    migrate_and_build()
