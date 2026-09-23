import datetime
from flask import Blueprint, request, jsonify
from services.firebase_service import FirebaseService
from services.audit_service import AuditService

students_bp = Blueprint("students", __name__)

@students_bp.route("/api/students", methods=["GET"])
def list_students():
    query_name = request.args.get("name", "").strip().lower()
    query_roll = request.args.get("roll", "").strip()
    query_id = request.args.get("studentId", "").strip().lower()
    filter_class = request.args.get("classId", "").strip()
    filter_status = request.args.get("status", "").strip()

    students = FirebaseService.list_documents("students")

    # Map class names for display
    classes = {c.get("classId") or c.get("_id"): c.get("className") for c in FirebaseService.list_documents("classes")}

    filtered = []
    for s in students:
        s_id = str(s.get("studentId", "")).strip().lower()
        s_name = str(s.get("name", "")).strip().lower()
        s_roll = str(s.get("rollNumber", "")).strip()
        s_class = str(s.get("classId", "")).strip()
        s_status = str(s.get("status", "")).strip()

        if query_name and query_name not in s_name:
            continue
        if query_roll and s_roll != query_roll:
            continue
        if query_id and query_id not in s_id:
            continue
        if filter_class and s_class != filter_class:
            continue
        if filter_status and s_status.lower() != filter_status.lower():
            continue

        s["className"] = classes.get(s_class, s_class)
        filtered.append(s)

    # Sort by roll number numerically if possible, else name
    def sort_key(x):
        try:
            return (0, int(x.get("rollNumber", 0)))
        except Exception:
            return (1, str(x.get("name", "")))

    filtered.sort(key=sort_key)
    return jsonify({"success": True, "students": filtered, "count": len(filtered)})

@students_bp.route("/api/students", methods=["POST"])
def add_student():
    data = request.get_json() or {}
    name = str(data.get("name", "")).strip()
    student_id = str(data.get("studentId", "")).strip()
    roll_number = str(data.get("rollNumber", "")).strip()
    class_id = str(data.get("classId", "")).strip()
    status = str(data.get("status", "active")).strip().lower()
    performed_by = data.get("performedBy", "PRIN001")

    # Validations
    if not name or not student_id or not roll_number or not class_id:
        return jsonify({"success": False, "message": "All fields (Name, Student ID, Roll Number, Class) are required."}), 400

    if status not in ("active", "inactive"):
        return jsonify({"success": False, "message": "Status must be 'active' or 'inactive'."}), 400

    # Validate Class exists
    class_doc = FirebaseService.get_document("classes", class_id)
    if not class_doc:
        # Check by list
        classes = FirebaseService.list_documents("classes")
        match = any((c.get("classId") == class_id or c.get("_id") == class_id) for c in classes)
        if not match:
            return jsonify({"success": False, "message": "Selected class does not exist. Please choose a valid class."}), 400

    # Check for duplicate Student ID
    existing_students = FirebaseService.list_documents("students")
    for s in existing_students:
        if str(s.get("studentId", "")).strip().lower() == student_id.lower():
            return jsonify({"success": False, "message": f"Student ID '{student_id}' already exists."}), 409

        # Check duplicate roll number in the SAME class
        if (str(s.get("classId", "")).strip() == class_id and 
            str(s.get("rollNumber", "")).strip() == roll_number and
            s.get("status") != "inactive"):
            return jsonify({"success": False, "message": f"Roll Number '{roll_number}' is already assigned to {s.get('name')} in this class."}), 409

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    new_student = {
        "studentId": student_id,
        "name": name,
        "rollNumber": roll_number,
        "classId": class_id,
        "status": status,
        "createdAt": now_str,
        "updatedAt": now_str
    }

    FirebaseService.set_document("students", student_id, new_student)

    AuditService.log(
        action="Student Created",
        performed_by=performed_by,
        role="principal",
        target_type="student",
        target_id=student_id,
        details=f"Added student {name} (Roll: {roll_number}, Class: {class_id})"
    )

    return jsonify({"success": True, "message": "Student added successfully.", "student": new_student}), 201

@students_bp.route("/api/students/<student_id>", methods=["PUT"])
def update_student(student_id):
    student_id = student_id.strip()
    data = request.get_json() or {}
    name = str(data.get("name", "")).strip()
    roll_number = str(data.get("rollNumber", "")).strip()
    class_id = str(data.get("classId", "")).strip()
    status = str(data.get("status", "active")).strip().lower()
    performed_by = data.get("performedBy", "PRIN001")

    existing = FirebaseService.get_document("students", student_id)
    if not existing:
        return jsonify({"success": False, "message": "Student not found."}), 404

    if not name or not roll_number or not class_id:
        return jsonify({"success": False, "message": "Name, Roll Number, and Class are required."}), 400

    # Check roll collision in class with other active students
    all_students = FirebaseService.list_documents("students")
    for s in all_students:
        s_doc_id = s.get("studentId") or s.get("_id")
        if s_doc_id != student_id and str(s.get("classId", "")).strip() == class_id:
            if str(s.get("rollNumber", "")).strip() == roll_number and s.get("status") != "inactive":
                return jsonify({"success": False, "message": f"Roll Number '{roll_number}' is already assigned to another student in this class."}), 409

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    updated_data = {
        **existing,
        "name": name,
        "rollNumber": roll_number,
        "classId": class_id,
        "status": status,
        "updatedAt": now_str
    }
    FirebaseService.set_document("students", student_id, updated_data)

    AuditService.log(
        action="Student Updated",
        performed_by=performed_by,
        role="principal",
        target_type="student",
        target_id=student_id,
        details=f"Updated details for {name} (Roll: {roll_number}, Class: {class_id}, Status: {status})"
    )

    return jsonify({"success": True, "message": "Student updated successfully.", "student": updated_data})

@students_bp.route("/api/students/<student_id>/status", methods=["PATCH"])
def toggle_student_status(student_id):
    student_id = student_id.strip()
    data = request.get_json() or {}
    new_status = str(data.get("status", "inactive")).strip().lower()
    performed_by = data.get("performedBy", "PRIN001")

    existing = FirebaseService.get_document("students", student_id)
    if not existing:
        return jsonify({"success": False, "message": "Student not found."}), 404

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    updated_data = {
        **existing,
        "status": new_status,
        "updatedAt": now_str
    }
    FirebaseService.set_document("students", student_id, updated_data)

    AuditService.log(
        action="Student Status Changed",
        performed_by=performed_by,
        role="principal",
        target_type="student",
        target_id=student_id,
        details=f"Status changed from {existing.get('status')} to {new_status}"
    )

    return jsonify({"success": True, "message": f"Student status set to {new_status}.", "student": updated_data})
