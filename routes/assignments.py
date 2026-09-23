import datetime
import uuid
from flask import Blueprint, request, jsonify
from services.firebase_service import FirebaseService
from services.audit_service import AuditService

assignments_bp = Blueprint("assignments", __name__)

@assignments_bp.route("/api/assignments", methods=["GET"])
def list_assignments():
    teacher_uid = request.args.get("teacherUid", "").strip()
    class_id = request.args.get("classId", "").strip()
    status_filter = request.args.get("status", "").strip()

    all_assignments = FirebaseService.list_documents("teacherAssignments")
    teachers = {t.get("uid") or t.get("_id"): t for t in FirebaseService.list_documents("teachers")}
    classes = {c.get("classId") or c.get("_id"): c.get("className") for c in FirebaseService.list_documents("classes")}
    subjects = {s.get("subjectId") or s.get("_id"): s.get("subjectName") for s in FirebaseService.list_documents("subjects")}

    enriched = []
    for a in all_assignments:
        t_id = a.get("teacherUid")
        c_id = a.get("classId")
        s_id = a.get("subjectId")
        st = a.get("status", "active")

        if teacher_uid and t_id != teacher_uid:
            continue
        if class_id and c_id != class_id:
            continue
        if status_filter and st.lower() != status_filter.lower():
            continue

        teacher_doc = teachers.get(t_id, {})
        enriched.append({
            "assignmentId": a.get("assignmentId") or a.get("_id"),
            "teacherUid": t_id,
            "teacherName": teacher_doc.get("name", "Unknown"),
            "teacherCode": teacher_doc.get("teacherCode", "-"),
            "classId": c_id,
            "className": classes.get(c_id, c_id),
            "subjectId": s_id,
            "subjectName": subjects.get(s_id, s_id),
            "status": st,
            "createdAt": a.get("createdAt")
        })

    enriched.sort(key=lambda x: (str(x.get("teacherName")), str(x.get("className")), str(x.get("subjectName"))))
    return jsonify({"success": True, "assignments": enriched, "count": len(enriched)})

@assignments_bp.route("/api/assignments", methods=["POST"])
def create_assignment():
    data = request.get_json() or {}
    teacher_uid = str(data.get("teacherUid", "")).strip()
    class_id = str(data.get("classId", "")).strip()
    subject_id = str(data.get("subjectId", "")).strip()
    performed_by = data.get("performedBy", "PRIN001")

    if not teacher_uid or not class_id or not subject_id:
        return jsonify({"success": False, "message": "Teacher, Class, and Subject are all required."}), 400

    # Verify teacher exists and is active
    teacher = FirebaseService.get_document("teachers", teacher_uid)
    if not teacher:
        return jsonify({"success": False, "message": "Selected teacher does not exist."}), 404
    if teacher.get("status") == "inactive":
        return jsonify({"success": False, "message": "Cannot assign an inactive teacher."}), 400

    # Verify class exists
    classes = FirebaseService.list_documents("classes")
    class_doc = next((c for c in classes if (c.get("classId") == class_id or c.get("_id") == class_id)), None)
    if not class_doc:
        return jsonify({"success": False, "message": "Selected class does not exist."}), 404

    # Verify subject belongs to this class
    subjects = FirebaseService.list_documents("subjects")
    subject_doc = next((s for s in subjects if (s.get("subjectId") == subject_id or s.get("_id") == subject_id) and s.get("classId") == class_id), None)
    if not subject_doc:
        return jsonify({"success": False, "message": "Selected subject does not belong to this class."}), 400

    # Check duplicate assignment
    existing = FirebaseService.list_documents("teacherAssignments")
    for a in existing:
        if (a.get("teacherUid") == teacher_uid and 
            a.get("classId") == class_id and 
            a.get("subjectId") == subject_id and 
            a.get("status") != "inactive"):
            return jsonify({"success": False, "message": f"{teacher.get('name')} is already assigned to {class_doc.get('className')} - {subject_doc.get('subjectName')}."}), 409

    assignment_id = f"asgn_{uuid.uuid4().hex[:8]}"
    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    new_assignment = {
        "assignmentId": assignment_id,
        "teacherUid": teacher_uid,
        "classId": class_id,
        "subjectId": subject_id,
        "status": "active",
        "createdAt": now_str,
        "updatedAt": now_str
    }
    FirebaseService.set_document("teacherAssignments", assignment_id, new_assignment)

    AuditService.log(
        action="Teacher Assigned",
        performed_by=performed_by,
        role="principal",
        target_type="teacherAssignment",
        target_id=assignment_id,
        details=f"Assigned {teacher.get('name')} to {class_doc.get('className')} ({subject_doc.get('subjectName')})"
    )

    return jsonify({
        "success": True,
        "message": f"Successfully assigned {teacher.get('name')} to {class_doc.get('className')} - {subject_doc.get('subjectName')}.",
        "assignment": new_assignment
    }), 201

@assignments_bp.route("/api/assignments/<assignment_id>", methods=["DELETE", "PATCH"])
def remove_or_deactivate_assignment(assignment_id):
    """
    Deactivates or removes assignment.
    Historical attendance remains intact in studentAttendance collection!
    """
    assignment_id = assignment_id.strip()
    performed_by = request.args.get("performedBy") or "PRIN001"

    existing = FirebaseService.get_document("teacherAssignments", assignment_id)
    if not existing:
        return jsonify({"success": False, "message": "Assignment not found."}), 404

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    # Mark as inactive to preserve historical records cleanly
    updated = {
        **existing,
        "status": "inactive",
        "updatedAt": now_str
    }
    FirebaseService.set_document("teacherAssignments", assignment_id, updated)

    AuditService.log(
        action="Teacher Assignment Removed",
        performed_by=performed_by,
        role="principal",
        target_type="teacherAssignment",
        target_id=assignment_id,
        details=f"Removed assignment {assignment_id} (Teacher: {existing.get('teacherUid')}, Class: {existing.get('classId')}, Subject: {existing.get('subjectId')})"
    )

    return jsonify({"success": True, "message": "Assignment removed successfully. Historical attendance preserved."})
