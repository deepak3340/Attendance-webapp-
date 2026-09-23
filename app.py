import os
from flask import Flask, render_template, send_from_directory, jsonify
import config
from routes.auth import auth_bp
from routes.students import students_bp
from routes.teachers import teachers_bp
from routes.classes_subjects import classes_bp
from routes.assignments import assignments_bp
from routes.attendance import attendance_bp
from routes.reports import reports_bp
from routes.dashboard import dashboard_bp
from services.seed_service import seed_initial_school_data

app = Flask(__name__, template_folder="templates", static_folder="static")
app.secret_key = config.SECRET_KEY

# Register API blueprints
app.register_blueprint(auth_bp)
app.register_blueprint(students_bp)
app.register_blueprint(teachers_bp)
app.register_blueprint(classes_bp)
app.register_blueprint(assignments_bp)
app.register_blueprint(attendance_bp)
app.register_blueprint(reports_bp)
app.register_blueprint(dashboard_bp)

@app.route("/api/config", methods=["GET"])
def get_client_config():
    """Provides public Firebase config to browser for Phone Auth OTP and UI branding."""
    school_name = config.SCHOOL_NAME
    school_address = "123 Academic Enclave, Knowledge City"
    try:
        from services.firebase_service import FirebaseService
        settings_doc = FirebaseService.get_document("schoolSettings", "school")
        if settings_doc:
            if settings_doc.get("schoolName"):
                school_name = settings_doc.get("schoolName")
            if settings_doc.get("schoolAddress"):
                school_address = settings_doc.get("schoolAddress")
    except Exception:
        pass

    return jsonify({
        "projectId": config.PROJECT_ID,
        "apiKey": config.API_KEY,
        "authDomain": config.AUTH_DOMAIN,
        "storageBucket": config.STORAGE_BUCKET,
        "messagingSenderId": config.MESSAGING_SENDER_ID,
        "appId": config.APP_ID,
        "schoolName": school_name,
        "schoolAddress": school_address
    })

@app.route("/api/school-settings", methods=["GET"])
def get_school_settings():
    from services.firebase_service import FirebaseService
    doc = FirebaseService.get_document("schoolSettings", "school") or {}
    return jsonify({
        "success": True,
        "settings": {
            "schoolName": doc.get("schoolName", config.SCHOOL_NAME),
            "schoolAddress": doc.get("schoolAddress", "123 Academic Enclave, Knowledge City"),
            "principalUid": doc.get("principalUid", config.DEFAULT_PRINCIPAL_UID),
            "createdAt": doc.get("createdAt"),
            "updatedAt": doc.get("updatedAt")
        }
    })

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/login")
def login_page():
    return render_template("login.html")

@app.route("/forgot-password")
def forgot_password_page():
    return render_template("forgot-password.html")

@app.route("/principal")
def principal_page():
    return render_template("principal/dashboard.html")

@app.route("/teacher")
def teacher_page():
    return render_template("teacher/dashboard.html")

# Initialize sample data on startup
try:
    seed_initial_school_data()
except Exception as e:
    print(f"Seed initialization note: {e}")

if __name__ == "__main__":
    port = int(os.environ.get("FLASK_PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False)
