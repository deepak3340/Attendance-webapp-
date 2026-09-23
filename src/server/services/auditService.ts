import crypto from 'crypto';
import { FirebaseService } from './firebaseService.js';

export class AuditService {
  static async log(
    action: string,
    performedBy: string,
    role: string,
    targetType: string,
    targetId: string,
    details: any = ''
  ): Promise<Record<string, any>> {
    const logId = `log_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const timestamp = new Date().toISOString();

    let detailsObj: Record<string, any>;
    if (typeof details === 'object' && details !== null) {
      detailsObj = details;
    } else if (typeof details === 'string') {
      detailsObj = details ? { message: details } : {};
    } else {
      detailsObj = { info: String(details) };
    }

    const logData = {
      logId,
      action,
      performedBy,
      role,
      targetType,
      targetId,
      timestamp,
      details: detailsObj,
      _id: logId
    };

    try {
      await FirebaseService.set_document('auditLogs', logId, logData);
    } catch (e) {
      console.warn('Failed to write audit log:', e);
    }
    return logData;
  }
}
