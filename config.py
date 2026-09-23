import json
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

# Load firebase-applet-config.json
FIREBASE_CONFIG_PATH = BASE_DIR / "firebase-applet-config.json"
FIREBASE_CONFIG = {}
if FIREBASE_CONFIG_PATH.exists():
    try:
        with open(FIREBASE_CONFIG_PATH, "r", encoding="utf-8") as f:
            FIREBASE_CONFIG = json.load(f)
    except Exception as e:
        print(f"Error loading firebase-applet-config.json: {e}")

PROJECT_ID = FIREBASE_CONFIG.get("projectId") or os.getenv("FIREBASE_PROJECT_ID", "valid-dynamo-jsmzh")
API_KEY = FIREBASE_CONFIG.get("apiKey") or os.getenv("FIREBASE_API_KEY", "")
AUTH_DOMAIN = FIREBASE_CONFIG.get("authDomain") or f"{PROJECT_ID}.firebaseapp.com"
FIRESTORE_DATABASE_ID = FIREBASE_CONFIG.get("firestoreDatabaseId") or "(default)"
STORAGE_BUCKET = FIREBASE_CONFIG.get("storageBucket") or f"{PROJECT_ID}.firebasestorage.app"
MESSAGING_SENDER_ID = FIREBASE_CONFIG.get("messagingSenderId") or ""
APP_ID = FIREBASE_CONFIG.get("appId") or ""

# School information
SCHOOL_NAME = "संस्कार हाई स्कूल, गरोडा"
SCHOOL_LOCATION = "गरोडा"
DEFAULT_PRINCIPAL_UID = "375613"
DEFAULT_PRINCIPAL_MOBILE = "+919826613340"
DEFAULT_PRINCIPAL_PASSWORD = "Deepak@123@"
DEFAULT_PRINCIPAL_NAME = "दीपक गहलोत"
DEFAULT_PRINCIPAL_EMAIL = "deepak.lohar9826@gmail.com"

# Flask Secret
SECRET_KEY = os.getenv("SECRET_KEY", "school-attendance-production-secret-key-2026")
