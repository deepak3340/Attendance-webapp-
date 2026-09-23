import datetime
import uuid
from flask import Blueprint, request, jsonify
from services.firebase_service import FirebaseService
from services.audit_service import AuditService

classes_bp = Blueprint("classes_subjects", __name__)

@classes_bp.route("/api/classes", methods=["GET"])
def list_classes():
    classes = FirebaseService.list_documents("classes")
    # Natural sorting by name
    classes.sort(key=lambda x: str(x.get("className", "")))
    return jsonify({"success": True, "classes": classes})

@classes_bp.route("/api/classes", methods=["POST"])
def add_class():
    data = request.get_json() or {}
    class_name = str(data.get("className", "")).strip()
    status = str(data.get("status", "active")).strip().lower()
    performed_by = data.get("performedBy", "PRIN001")

    if not class_name:
        return jsonify({"success": False, "message": "Class name is required."}), 400

    # Duplicate check
    existing = FirebaseService.list_documents("classes")
    for c in existing:
        if str(c.get("className", "")).strip().lower() == class_name.lower():
            return jsonify({"success": False, "message": f"Class '{class_name}' already exists."}), 409

    class_id = f"class_{uuid.uuid4().hex[:8]}"
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    new_class = {
        "classId": class_id,
        "className": class_name,
        "status": status,
        "createdAt": now_str,
        "updatedAt": now_str
    }
    FirebaseService.set_document("classes", class_id, new_class)

    AuditService.log(
        action="Class Created",
        performed_by=performed_by,
        role="principal",
        target_type="class",
        target_id=class_id,
        details=f"Created class '{class_name}'"
    )

    return jsonify({"success": True, "message": f"Class '{class_name}' added successfully.", "class": new_class}), 201

@classes_bp.route("/api/classes/<class_id>/subjects", methods=["GET"])
def get_class_subjects(class_id):
    """
    Returns ONLY the subjects belonging to the selected class.
    Enforces the class-subject dependency.
    """
    class_id = class_id.strip()
    all_subjects = FirebaseService.list_documents("subjects")
    class_subjects = [
        s for s in all_subjects 
        if str(s.get("classId", "")).strip() == class_id and s.get("status", "active") == "active"
    ]
    class_subjects.sort(key=lambda x: str(x.get("subjectName", "")))
    return jsonify({"success": True, "classId": class_id, "subjects": class_subjects})

@classes_bp.route("/api/classes/<class_id>/subjects", methods=["POST"])
def add_subject_to_class(class_id):
    class_id = class_id.strip()
    data = request.get_json() or {}
    subject_name = str(data.get("subjectName", "")).strip()
    performed_by = data.get("performedBy", "PRIN001")

    if not subject_name:
        return jsonify({"success": False, "message": "Subject name is required."}), 400

    # Verify class exists
    class_doc = FirebaseService.get_document("classes", class_id)
    if not class_doc:
        classes = FirebaseService.list_documents("classes")
        match = next((c for c in classes if c.get("classId") == class_id or c.get("_id") == class_id), None)
        if not match:
            return jsonify({"success": False, "message": "Specified class does not exist."}), 404
        class_doc = match

    # Check duplicate subject in THIS class
    all_subjects = FirebaseService.list_documents("subjects")
    for s in all_subjects:
        if (str(s.get("classId", "")).strip() == class_id and 
            str(s.get("subjectName", "")).strip().lower() == subject_name.lower() and
            s.get("status") != "inactive"):
            return jsonify({"success": False, "message": f"Subject '{subject_name}' already exists in {class_doc.get('className')}."}), 409

    subject_id = f"subj_{uuid.uuid4().hex[:8]}"
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    new_subject = {
        "subjectId": subject_id,
        "subjectName": subject_name,
        "classId": class_id,
        "status": "active",
        "createdAt": now_str,
        "updatedAt": now_str
    }
    FirebaseService.set_document("subjects", subject_id, new_subject)

    AuditService.log(
        action="Subject Created",
        performed_by=performed_by,
        role="principal",
        target_type="subject",
        target_id=subject_id,
        details=f"Added subject '{subject_name}' to class '{class_doc.get('className')}'"
    )

    return jsonify({"success": True, "message": f"Subject '{subject_name}' added successfully.", "subject": new_subject}), 201

@classes_bp.route("/api/classes-and-subjects", methods=["GET"])
def get_all_classes_with_subjects():
    classes = FirebaseService.list_documents("classes")
    subjects = FirebaseService.list_documents("subjects")

    result = []
    for c in classes:
        c_id = c.get("classId") or c.get("_id")
        c_subs = [s for s in subjects if s.get("classId") == c_id]
        c_subs.sort(key=lambda x: str(x.get("subjectName", "")))
        result.append({
            "classId": c_id,
            "className": c.get("className"),
            "status": c.get("status", "active"),
            "subjects": c_subs
        })

    result.sort(key=lambda x: str(x.get("className", "")))
    return jsonify({"success": True, "data": result})
