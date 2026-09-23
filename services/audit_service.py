import datetime
import uuid
from services.firebase_service import FirebaseService

class AuditService:
    @staticmethod
    def log(action: str, performed_by: str, role: str, target_type: str, target_id: str, details: str = ""):
        log_id = f"log_{uuid.uuid4().hex[:12]}"
        timestamp = datetime.datetime.utcnow().isoformat() + "Z"
        if isinstance(details, dict):
            details_obj = details
        elif isinstance(details, str):
            details_obj = {"message": details} if details else {}
        else:
            details_obj = {"info": str(details)}

        log_data = {
            "logId": log_id,
            "action": action,
            "performedBy": performed_by,
            "role": role,
            "targetType": target_type,
            "targetId": target_id,
            "timestamp": timestamp,
            "details": details_obj
        }
        try:
            FirebaseService.set_document("auditLogs", log_id, log_data)
        except Exception as e:
            print(f"Failed to write audit log: {e}")
        return log_data
