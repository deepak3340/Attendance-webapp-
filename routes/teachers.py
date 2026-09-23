import datetime
from flask import Blueprint, request, jsonify
import config
from services.firebase_service import FirebaseService
from services.audit_service import AuditService
from routes.auth import validate_password_strength

teachers_bp = Blueprint("teachers", __name__)

@teachers_bp.route("/api/teachers", methods=["GET"])
def list_teachers():
    query = request.args.get("q", "").strip().lower()
    filter_status = request.args.get("status", "").strip().lower()

    teachers = FirebaseService.list_documents("teachers")

    filtered = []
    for t in teachers:
        name = str(t.get("name", "")).strip().lower()
        code = str(t.get("teacherCode", "")).strip().lower()
        mobile = str(t.get("mobileNumber", "")).strip().lower()
        status = str(t.get("status", "active")).strip().lower()

        if filter_status and status != filter_status:
            continue

        if query:
            if query not in name and query not in code and query not in mobile:
                continue

        # Clean document - never return password
        filtered.append({
            "uid": t.get("uid"),
            "teacherCode": t.get("teacherCode"),
            "name": t.get("name"),
            "mobileNumber": t.get("mobileNumber"),
            "status": t.get("status"),
            "createdAt": t.get("createdAt"),
            "updatedAt": t.get("updatedAt")
        })

    filtered.sort(key=lambda x: str(x.get("name", "")))
    return jsonify({"success": True, "teachers": filtered, "count": len(filtered)})

@teachers_bp.route("/api/teachers/generate-uid", methods=["GET"])
def get_available_teacher_uid():
    """Generates a unique 6-digit numeric UID for new teacher creation."""
    code = FirebaseService.generate_unique_teacher_code()
    return jsonify({"success": True, "teacherCode": code})

@teachers_bp.route("/api/teachers", methods=["POST"])
def add_teacher():
    data = request.get_json() or {}
    name = str(data.get("name", "")).strip()
    mobile = str(data.get("mobileNumber", "")).strip()
    password = str(data.get("password", ""))
    repeat_password = str(data.get("repeatPassword", ""))
    status = str(data.get("status", "active")).strip().lower()
    performed_by = data.get("performedBy", "PRIN001")

    if not name or not mobile or not password or not repeat_password:
        return jsonify({"success": False, "message": "All fields are required."}), 400

    if password != repeat_password:
        return jsonify({"success": False, "message": "Passwords do not match."}), 400

    valid, err_msg = validate_password_strength(password)
    if not valid:
        return jsonify({"success": False, "message": err_msg}), 400

    # Validate mobile phone format (at least 10 digits)
    clean_mobile = mobile.replace(" ", "").replace("-", "")
    if len(clean_mobile) < 10:
        return jsonify({"success": False, "message": "Please enter a valid mobile number."}), 400

    # Ensure mobile is unique
    existing_user = FirebaseService.find_user_by_identifier(mobile)
    if existing_user:
        return jsonify({"success": False, "message": "A teacher or user with this mobile number already exists."}), 409

    req_code = str(data.get("teacherCode", "")).strip()
    if req_code and len(req_code) == 6 and req_code.isdigit():
        # Check if already taken
        taken = FirebaseService.find_user_by_identifier(req_code)
        if not taken:
            teacher_code = req_code
        else:
            teacher_code = FirebaseService.generate_unique_teacher_code()
    else:
        teacher_code = FirebaseService.generate_unique_teacher_code()

    # Create account in Firebase Authentication
    auth_email = f"teacher_{teacher_code}@school.internal"
    auth_res, auth_err = FirebaseService.create_auth_user(auth_email, password, display_name=name, phone_number=mobile)
    
    # Store document with 6-digit UID as the ID
    auth_uid = teacher_code

    now_str = datetime.datetime.utcnow().isoformat() + "Z"

    # Create document in 'users' collection with 6-digit UID
    user_doc = {
        "uid": teacher_code,
        "teacherUid": teacher_code,
        "teacherCode": teacher_code,
        "name": name,
        "mobileNumber": mobile,
        "email": str(data.get("email", "")).strip(),
        "role": "teacher",
        "status": status,
        "authEmail": auth_email,
        "tempPassword": password,
        "schoolName": config.SCHOOL_NAME,
        "createdAt": now_str,
        "updatedAt": now_str
    }
    FirebaseService.set_document("users", teacher_code, user_doc)

    # Create document in 'teachers' collection
    teacher_doc = {
        "uid": teacher_code,
        "teacherUid": teacher_code,
        "teacherCode": teacher_code,
        "name": name,
        "mobileNumber": mobile,
        "email": str(data.get("email", "")).strip(),
        "status": status,
        "createdAt": now_str,
        "updatedAt": now_str
    }
    FirebaseService.set_document("teachers", teacher_code, teacher_doc)

    AuditService.log(
        action="Teacher Created",
        performed_by=performed_by,
        role="principal",
        target_type="teacher",
        target_id=auth_uid,
        details=f"Added teacher {name} with unique UID: {teacher_code}, Mobile: {mobile}"
    )

    return jsonify({
        "success": True,
        "message": f"Teacher account created successfully with UID: {teacher_code}",
        "teacher": {
            "uid": auth_uid,
            "teacherCode": teacher_code,
            "name": name,
            "mobileNumber": mobile,
            "status": status
        }
    }), 201

@teachers_bp.route("/api/teachers/<teacher_uid>", methods=["PUT"])
def update_teacher(teacher_uid):
    teacher_uid = teacher_uid.strip()
    data = request.get_json() or {}
    name = str(data.get("name", "")).strip()
    mobile = str(data.get("mobileNumber", "")).strip()
    status = str(data.get("status", "active")).strip().lower()
    performed_by = data.get("performedBy", "PRIN001")

    if not name or not mobile:
        return jsonify({"success": False, "message": "Name and Mobile Number are required."}), 400

    teacher = FirebaseService.get_document("teachers", teacher_uid)
    if not teacher:
        return jsonify({"success": False, "message": "Teacher not found."}), 404

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    updated_teacher = {
        **teacher,
        "name": name,
        "mobileNumber": mobile,
        "status": status,
        "updatedAt": now_str
    }
    FirebaseService.set_document("teachers", teacher_uid, updated_teacher)

    user = FirebaseService.get_document("users", teacher_uid)
    if user:
        FirebaseService.set_document("users", teacher_uid, {
            **user,
            "name": name,
            "mobileNumber": mobile,
            "status": status,
            "updatedAt": now_str
        })

    AuditService.log(
        action="Teacher Updated",
        performed_by=performed_by,
        role="principal",
        target_type="teacher",
        target_id=teacher_uid,
        details=f"Updated details for {name} (Status: {status})"
    )

    return jsonify({"success": True, "message": "Teacher details updated successfully.", "teacher": updated_teacher})

@teachers_bp.route("/api/teachers/<teacher_uid>/password", methods=["POST"])
def principal_change_teacher_password(teacher_uid):
    """
    Principal changes a teacher's password administratively.
    Existing password is NEVER exposed. New password is never stored in Firestore.
    """
    teacher_uid = teacher_uid.strip()
    data = request.get_json() or {}
    new_password = str(data.get("newPassword", ""))
    repeat_password = str(data.get("repeatPassword", ""))
    performed_by = data.get("performedBy", "PRIN001")

    teacher = FirebaseService.get_document("teachers", teacher_uid)
    if not teacher:
        return jsonify({"success": False, "message": "Teacher not found."}), 404

    if not new_password or not repeat_password:
        return jsonify({"success": False, "message": "New password and confirmation are required."}), 400

    if new_password != repeat_password:
        return jsonify({"success": False, "message": "Passwords do not match."}), 400

    valid, err_msg = validate_password_strength(new_password)
    if not valid:
        return jsonify({"success": False, "message": err_msg}), 400

    user = FirebaseService.get_document("users", teacher_uid)
    auth_email = user.get("authEmail") if user else f"teacher_{teacher.get('teacherCode')}@school.internal"

    # Reset in Firebase Auth
    # Use signIn/signUp overwrite or setAccountInfo
    temp_auth, _ = FirebaseService.create_auth_user(auth_email, new_password)

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    if user:
        FirebaseService.set_document("users", teacher_uid, {
            **user,
            "updatedAt": now_str,
            "passwordChangedBy": performed_by,
            "lastPasswordChangeAt": now_str
        })

    AuditService.log(
        action="Teacher Password Changed by Principal",
        performed_by=performed_by,
        role="principal",
        target_type="teacher",
        target_id=teacher_uid,
        details=f"Password updated for Teacher {teacher.get('name')} (UID: {teacher.get('teacherCode')})"
    )

    return jsonify({"success": True, "message": f"Password changed successfully for teacher {teacher.get('name')}."})

@teachers_bp.route("/api/teachers/<teacher_uid>/status", methods=["PATCH"])
def toggle_teacher_status(teacher_uid):
    teacher_uid = teacher_uid.strip()
    data = request.get_json() or {}
    new_status = str(data.get("status", "inactive")).strip().lower()
    performed_by = data.get("performedBy", "PRIN001")

    teacher = FirebaseService.get_document("teachers", teacher_uid)
    if not teacher:
        return jsonify({"success": False, "message": "Teacher not found."}), 404

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    FirebaseService.set_document("teachers", teacher_uid, {
        **teacher,
        "status": new_status,
        "updatedAt": now_str
    })

    user = FirebaseService.get_document("users", teacher_uid)
    if user:
        FirebaseService.set_document("users", teacher_uid, {
            **user,
            "status": new_status,
            "updatedAt": now_str
        })

    AuditService.log(
        action="Teacher Status Changed",
        performed_by=performed_by,
        role="principal",
        target_type="teacher",
        target_id=teacher_uid,
        details=f"Status changed to {new_status}"
    )

    return jsonify({"success": True, "message": f"Teacher status set to {new_status}."})
