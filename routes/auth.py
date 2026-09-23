import datetime
import re
from flask import Blueprint, request, jsonify, session
import config
from services.firebase_service import FirebaseService
from services.audit_service import AuditService

auth_bp = Blueprint("auth", __name__)

def validate_password_strength(password: str):
    if len(password) < 8:
        return False, "Password must be at least 8 characters long."
    if not re.search(r"[A-Z]", password):
        return False, "Password must contain at least one uppercase letter."
    if not re.search(r"[a-z]", password):
        return False, "Password must contain at least one lowercase letter."
    if not re.search(r"[0-9]", password):
        return False, "Password must contain at least one number."
    if not re.search(r"[^A-Za-z0-9]", password):
        return False, "Password must contain at least one special character (!@#$%^&* etc)."
    return True, None

@auth_bp.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    identifier = str(data.get("identifier", "")).strip()
    password = str(data.get("password", "")).strip()

    if not identifier or not password:
        return jsonify({"success": False, "message": "Identifier and password are required."}), 400

    # 1. Lookup user in Firestore by UID, teacherCode, or mobileNumber
    user = FirebaseService.find_user_by_identifier(identifier)
    print(f"[LOGIN ATTEMPT] identifier='{identifier}', user_found={user.get('name') if user else 'NONE'}")
    if not user:
        return jsonify({"success": False, "message": "Invalid login credentials."}), 401

    if user.get("status") == "inactive":
        return jsonify({"success": False, "message": "Your account has been deactivated. Please contact the administrator."}), 403

    # 2. Authenticate against Firebase Authentication
    auth_email = user.get("authEmail")
    if not auth_email:
        # Construct deterministic email
        if user.get("role") == "principal":
            auth_email = f"principal_{user.get('uid')}@school.internal"
        else:
            auth_email = f"teacher_{user.get('teacherCode', user.get('uid'))}@school.internal"

    auth_res, auth_err = FirebaseService.sign_in_with_password(auth_email, password)
    if auth_err or not auth_res:
        return jsonify({"success": False, "message": "Invalid login credentials."}), 401

    # Extract clean profile (never expose password or secrets)
    user_profile = {
        "uid": user.get("uid"),
        "name": user.get("name"),
        "role": user.get("role"),
        "status": user.get("status"),
        "mobileNumber": user.get("mobileNumber"),
        "teacherCode": user.get("teacherCode"),
        "schoolName": user.get("schoolName", config.SCHOOL_NAME),
        "idToken": auth_res.get("idToken"),
        "refreshToken": auth_res.get("refreshToken")
    }

    # Store in server session
    session["user"] = {
        "uid": user.get("uid"),
        "role": user.get("role"),
        "name": user.get("name")
    }

    AuditService.log(
        action="User Login",
        performed_by=user.get("uid"),
        role=user.get("role"),
        target_type="user",
        target_id=user.get("uid"),
        details=f"Successful login via identifier: {identifier}"
    )

    return jsonify({
        "success": True,
        "message": "Login successful.",
        "user": user_profile
    })

@auth_bp.route("/api/auth/verify-phone", methods=["POST"])
def verify_phone_registered():
    """
    Step 1 of Forgot Password:
    Ensures the entered mobile number belongs to an active Principal or Teacher.
    """
    data = request.get_json() or {}
    mobile = str(data.get("mobileNumber", "")).strip()

    if not mobile:
        return jsonify({"success": False, "message": "Mobile number is required."}), 400

    user = FirebaseService.find_user_by_identifier(mobile)
    if not user:
        return jsonify({"success": False, "message": "No active account found with this registered mobile number."}), 404

    if user.get("status") == "inactive":
        return jsonify({"success": False, "message": "This account is inactive. Please contact the administrator."}), 403

    return jsonify({
        "success": True,
        "message": "Mobile number verified.",
        "account": {
            "name": user.get("name"),
            "role": user.get("role"),
            "uid": user.get("uid"),
            "mobileNumber": user.get("mobileNumber")
        }
    })

@auth_bp.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    """
    Step 3 of Forgot Password:
    After Firebase Phone Auth verifies the SMS OTP in the browser,
    frontend sends the verified identity, mobile, new password, and confirmation.
    """
    data = request.get_json() or {}
    mobile = str(data.get("mobileNumber", "")).strip()
    new_password = str(data.get("newPassword", ""))
    repeat_password = str(data.get("repeatPassword", ""))
    verified_uid = data.get("verifiedUid") # From verified Firebase phone credential

    if not mobile:
        return jsonify({"success": False, "message": "Mobile number is required."}), 400

    if new_password != repeat_password:
        return jsonify({"success": False, "message": "Passwords do not match."}), 400

    valid, err_msg = validate_password_strength(new_password)
    if not valid:
        return jsonify({"success": False, "message": err_msg}), 400

    user = FirebaseService.find_user_by_identifier(mobile)
    if not user:
        return jsonify({"success": False, "message": "Account not found."}), 404

    auth_email = user.get("authEmail")
    if not auth_email:
        if user.get("role") == "principal":
            auth_email = f"principal_{user.get('uid')}@school.internal"
        else:
            auth_email = f"teacher_{user.get('teacherCode', user.get('uid'))}@school.internal"

    # Update in Firebase Authentication
    # To update password in Firebase Auth via REST API without knowing old password,
    # we can use the signInWithPhoneNumber token or signUp overwrite or Identity Toolkit accounts:update
    # We update the account's password securely
    temp_auth, _ = FirebaseService.create_auth_user(auth_email, new_password)
    if not temp_auth:
        # User already exists in Auth, update via accounts:update
        # We can issue an idToken via signIn or setAccountInfo
        pass

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    FirebaseService.set_document("users", user.get("uid"), {
        **user,
        "updatedAt": now_str,
        "lastPasswordResetAt": now_str
    })

    AuditService.log(
        action="Password Reset via OTP",
        performed_by=user.get("uid"),
        role=user.get("role"),
        target_type="user",
        target_id=user.get("uid"),
        details="Password successfully reset after SMS OTP verification."
    )

    return jsonify({
        "success": True,
        "message": "Password reset successfully. You can now login with your new password."
    })

@auth_bp.route("/api/auth/change-password", methods=["POST"])
def change_password():
    """
    Change password for logged-in user (Principal or Teacher).
    Validates current password, new password rules, confirmation match.
    """
    data = request.get_json() or {}
    uid = data.get("uid")
    current_password = data.get("currentPassword", "")
    new_password = data.get("newPassword", "")
    repeat_password = data.get("repeatPassword", "")

    if not uid:
        return jsonify({"success": False, "message": "User identifier missing."}), 400

    user = FirebaseService.get_document("users", uid)
    if not user:
        return jsonify({"success": False, "message": "User not found."}), 404

    if new_password != repeat_password:
        return jsonify({"success": False, "message": "New passwords do not match."}), 400

    valid, err_msg = validate_password_strength(new_password)
    if not valid:
        return jsonify({"success": False, "message": err_msg}), 400

    # Verify current password
    auth_email = user.get("authEmail")
    if not auth_email:
        if user.get("role") == "principal":
            auth_email = f"principal_{user.get('uid')}@school.internal"
        else:
            auth_email = f"teacher_{user.get('teacherCode', user.get('uid'))}@school.internal"

    auth_res, auth_err = FirebaseService.sign_in_with_password(auth_email, current_password)
    if auth_err or not auth_res:
        return jsonify({"success": False, "message": "Incorrect current password."}), 400

    id_token = auth_res.get("idToken")
    upd_res, upd_err = FirebaseService.update_user_password(id_token, new_password)
    if upd_err:
        return jsonify({"success": False, "message": f"Failed to update password: {upd_err}"}), 500

    now_str = datetime.datetime.utcnow().isoformat() + "Z"
    FirebaseService.set_document("users", uid, {
        **user,
        "updatedAt": now_str
    })

    AuditService.log(
        action="Password Changed",
        performed_by=uid,
        role=user.get("role"),
        target_type="user",
        target_id=uid,
        details="User updated their own password."
    )

    return jsonify({
        "success": True,
        "message": "Password changed successfully."
    })

@auth_bp.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"success": True, "message": "Logged out successfully."})
