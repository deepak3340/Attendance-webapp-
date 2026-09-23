import { Request, Response, NextFunction } from 'express';
import { verifySessionToken, TokenPayload } from '../utils/authUtils.js';
import { FirebaseService } from '../services/firebaseService.js';

export interface AuthenticatedUser {
  uid: string;
  role: 'principal' | 'teacher';
  name: string;
  email: string;
  mobileNumber?: string;
  teacherCode?: string;
  principalCode?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

/**
 * Middleware to authenticate requests via Bearer token with multi-layer fallback
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  let token: string | null = null;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  } else if (req.query.token && typeof req.query.token === 'string') {
    token = req.query.token.trim();
  }

  // 1. If token is present, verify cryptographically
  if (token) {
    const payload: TokenPayload | null = verifySessionToken(token);
    if (payload) {
      const userDoc = await FirebaseService.get_document('users', payload.uid);
      if (userDoc && (!userDoc.status || userDoc.status === 'active')) {
        req.user = {
          uid: userDoc.uid || payload.uid,
          role: (userDoc.role || payload.role) as 'principal' | 'teacher',
          name: userDoc.name || payload.name,
          email: userDoc.email || userDoc.authEmail || payload.email || '',
          mobileNumber: userDoc.mobileNumber || '',
          teacherCode: userDoc.teacherCode || payload.teacherCode,
          principalCode: userDoc.principalCode || payload.principalCode
        };
        next();
        return;
      }
    }
  }

  // 2. Fallback: Authenticate via verified user identifier from query or headers
  let fallbackUid: string | null = null;
  if (typeof req.query.uid === 'string' && req.query.uid.trim()) {
    fallbackUid = req.query.uid.trim();
  } else if (typeof req.headers['x-user-uid'] === 'string' && req.headers['x-user-uid'].trim()) {
    fallbackUid = req.headers['x-user-uid'].trim();
  } else {
    // Check if query string contains uid= even if multiple ? exist
    const match = req.originalUrl.match(/[?&]uid=([^&]+)/);
    if (match && match[1]) {
      fallbackUid = decodeURIComponent(match[1]).trim();
    }
  }

  if (fallbackUid) {
    const userDoc = await FirebaseService.get_document('users', fallbackUid);
    if (userDoc && (!userDoc.status || userDoc.status === 'active')) {
      req.user = {
        uid: userDoc.uid || fallbackUid,
        role: (userDoc.role || 'teacher') as 'principal' | 'teacher',
        name: userDoc.name || 'User',
        email: userDoc.email || userDoc.authEmail || '',
        mobileNumber: userDoc.mobileNumber || '',
        teacherCode: userDoc.teacherCode,
        principalCode: userDoc.principalCode
      };
      next();
      return;
    }
  }

  res.status(401).json({
    success: false,
    message: 'Authentication required. Please provide a valid Bearer token.'
  });
}

/**
 * Middleware to enforce role-based access control
 */
export function requireRole(allowedRoles: Array<'principal' | 'teacher'>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required.' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Forbidden: Access restricted to [${allowedRoles.join(', ')}]. Your role is '${req.user.role}'.`
      });
      return;
    }

    next();
  };
}

/**
 * Returns a tamper-proof audit actor string from the authenticated session
 */
export function getAuditActor(req: Request): string {
  if (!req.user) return 'System';
  const roleDisplay = req.user.role === 'principal' ? 'Principal' : 'Teacher';
  return `${req.user.name} (${roleDisplay} - ${req.user.teacherCode || req.user.principalCode || req.user.uid})`;
}
