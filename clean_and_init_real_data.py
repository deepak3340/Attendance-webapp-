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

def delete_doc(collection, doc_id):
    url = f"{BASE_URL}/{collection}/{doc_id}?key={API_KEY}"
    res = requests.delete(url, timeout=10)
    print(f"  [DELETED] {collection}/{doc_id} -> {res.status_code}")
    return res.status_code in (200, 404)

def list_collection(collection):
    url = f"{BASE_URL}/{collection}?key={API_KEY}"
    res = requests.get(url, timeout=10)
    results = []
    if res.status_code == 200:
        docs = res.json().get("documents", [])
        for d in docs:
            doc_id = d["name"].split("/")[-1]
            results.append(doc_id)
    return results

def write_doc(collection, doc_id, data):
    url = f"{BASE_URL}/{collection}/{doc_id}?key={API_KEY}"
    fields = {k: python_to_firestore_value(v) for k, v in data.items() if not k.startswith("_")}
    res = requests.patch(url, json={"fields": fields}, timeout=10)
    if res.status_code == 200:
        print(f"  [WRITTEN] {collection}/{doc_id}")
        return True
    else:
        print(f"  [FAIL {res.status_code}] {collection}/{doc_id} -> {res.text}")
        return False

def clean_and_init_real_data():
    print("=== 1. PURGING ALL DEMO DATA FROM FIRESTORE ===")
    
    collections_to_purge = [
        "students",
        "classes",
        "subjects",
        "teachers",
        "teacherAssignments",
        "teacherAttendance",
        "attendanceSessions",
        "studentAttendance",
        "attendance",
        "attendanceLocks"
    ]
    
    for col in collections_to_purge:
        doc_ids = list_collection(col)
        print(f"Purging {len(doc_ids)} docs from '{col}'...")
        for doc_id in doc_ids:
            delete_doc(col, doc_id)

    # Purge old demo users
    user_ids = list_collection("users")
    for u_id in user_ids:
        print(f"Deleting demo user: {u_id}")
        delete_doc("users", u_id)

    print("\n=== 2. CREATING REAL PRINCIPAL & SCHOOL DATA ===")
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    principal_uid = "PRIN_DEEPAK"

    principal_doc = {
        "uid": principal_uid,
        "name": "दीपक गहलोत",
        "mobileNumber": "+919826613340",
        "email": "deepak.lohar9826@gmail.com",
        "authEmail": "deepak.lohar9826@gmail.com",
        "role": "principal",
        "status": "active",
        "schoolName": "संस्कार हाई स्कूल, गरोडा",
        "schoolLocation": "गरोडा",
        "createdAt": now_str,
        "updatedAt": now_str
    }
    write_doc("users", principal_uid, principal_doc)

    school_doc = {
        "schoolName": "संस्कार हाई स्कूल, गरोडा",
        "schoolAddress": "गरोडा",
        "principalUid": principal_uid,
        "principalName": "दीपक गहलोत",
        "principalMobile": "+919826613340",
        "principalEmail": "deepak.lohar9826@gmail.com",
        "createdAt": now_str,
        "updatedAt": now_str
    }
    write_doc("schoolSettings", "school", school_doc)

    audit_doc = {
        "logId": "log_init_clean",
        "action": "Real School & Principal Initialized",
        "performedBy": principal_uid,
        "role": "principal",
        "targetType": "system",
        "targetId": "attendance-web-app01",
        "timestamp": now_str,
        "details": {
            "schoolName": "संस्कार हाई स्कूल, गरोडा",
            "principalName": "दीपक गहलोत",
            "mobile": "+919826613340",
            "email": "deepak.lohar9826@gmail.com",
            "location": "गरोडा",
            "message": "Purged all demo records. Initialized real school setup."
        }
    }
    write_doc("auditLogs", "log_init_clean", audit_doc)

    # Clear local cache file if exists
    try:
        import os
        if os.path.exists("data/local_store.json"):
            os.remove("data/local_store.json")
            print("Deleted data/local_store.json cache")
    except Exception as e:
        print(f"Note on cache: {e}")

    print("\n✅ CLEANUP COMPLETE: All demo data deleted. Real Principal & School configured!")

if __name__ == "__main__":
    clean_and_init_real_data()
