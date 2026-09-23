import path from 'path';
import fs from 'fs';
import express, { Request, Response, NextFunction } from 'express';
import { createServer as createViteServer } from 'vite';
import * as config from './src/server/config.js';
import { FirebaseService } from './src/server/services/firebaseService.js';
import { seedInitialSchoolData } from './src/server/services/seedService.js';
import { authRouter } from './src/server/routes/authRoutes.js';
import { studentsRouter } from './src/server/routes/studentsRoutes.js';
import { teachersRouter } from './src/server/routes/teachersRoutes.js';
import { classesRouter } from './src/server/routes/classesRoutes.js';
import { assignmentsRouter } from './src/server/routes/assignmentsRoutes.js';
import { attendanceRouter } from './src/server/routes/attendanceRoutes.js';
import { dashboardRouter } from './src/server/routes/dashboardRoutes.js';
import { reportsRouter } from './src/server/routes/reportsRoutes.js';
import { requireAuth, requireRole } from './src/server/middleware/authMiddleware.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = '0.0.0.0';
const rootDir = process.cwd();

async function startServer() {
  const app = express();

  // Basic Middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // CORS / Security headers
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // Seed default data if needed
  try {
    await seedInitialSchoolData();
  } catch (err) {
    console.error('Error seeding initial school data:', err);
  }

  // Config & School Settings API
  app.get('/api/config', (req: Request, res: Response) => {
    res.json({
      projectId: config.PROJECT_ID,
      apiKey: config.API_KEY,
      authDomain: config.AUTH_DOMAIN,
      firestoreDatabaseId: config.FIRESTORE_DATABASE_ID,
      storageBucket: config.STORAGE_BUCKET,
      messagingSenderId: config.MESSAGING_SENDER_ID,
      appId: config.APP_ID,
      measurementId: config.MEASUREMENT_ID,
      schoolName: config.SCHOOL_NAME,
      schoolAddress: config.SCHOOL_LOCATION
    });
  });

  app.get('/api/school-settings', async (req: Request, res: Response) => {
    let settings = await FirebaseService.get_document('schoolSettings', 'school');
    if (!settings) {
      settings = {
        schoolName: config.SCHOOL_NAME,
        schoolAddress: config.SCHOOL_LOCATION,
        principalName: config.DEFAULT_PRINCIPAL_NAME,
        principalMobile: config.DEFAULT_PRINCIPAL_MOBILE,
        principalEmail: config.DEFAULT_PRINCIPAL_EMAIL
      };
    }
    res.json({ success: true, settings });
  });

  // Register modular API routers
  app.use(authRouter);
  app.use(studentsRouter);
  app.use(teachersRouter);
  app.use(classesRouter);
  app.use(assignmentsRouter);
  app.use(attendanceRouter);
  app.use(dashboardRouter);
  app.use(reportsRouter);

  // Audits API (Principal only)
  app.get('/api/audit-logs', requireAuth, requireRole(['principal']), async (req: Request, res: Response) => {
    const allAudits = await FirebaseService.list_documents('auditLogs');
    allAudits.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
    res.json({ success: true, count: allAudits.length, auditLogs: allAudits });
  });

  // Serve static assets from /static
  const staticDir = path.resolve(rootDir, 'static');
  if (fs.existsSync(staticDir)) {
    app.use('/static', express.static(staticDir, { maxAge: 0, etag: false }));
  }

  // HTML Portal Page Routes
  app.get('/login', (req: Request, res: Response) => {
    const loginHtml = path.resolve(rootDir, 'templates', 'login.html');
    if (fs.existsSync(loginHtml)) {
      res.sendFile(loginHtml);
    } else {
      res.sendFile(path.resolve(rootDir, 'index.html'));
    }
  });

  app.get('/forgot-password', (req: Request, res: Response) => {
    const forgotHtml = path.resolve(rootDir, 'templates', 'forgot-password.html');
    if (fs.existsSync(forgotHtml)) {
      res.sendFile(forgotHtml);
    } else {
      res.redirect('/login');
    }
  });

  app.get('/principal', (req: Request, res: Response) => {
    const principalHtml = path.resolve(rootDir, 'templates', 'principal', 'dashboard.html');
    if (fs.existsSync(principalHtml)) {
      res.sendFile(principalHtml);
    } else {
      res.redirect('/login');
    }
  });

  app.get('/teacher', (req: Request, res: Response) => {
    const teacherHtml = path.resolve(rootDir, 'templates', 'teacher', 'dashboard.html');
    if (fs.existsSync(teacherHtml)) {
      res.sendFile(teacherHtml);
    } else {
      res.redirect('/login');
    }
  });

  app.get('/', (req: Request, res: Response) => {
    const indexTemplate = path.resolve(rootDir, 'templates', 'index.html');
    if (fs.existsSync(indexTemplate)) {
      res.sendFile(indexTemplate);
    } else {
      res.sendFile(path.resolve(rootDir, 'index.html'));
    }
  });

  // Mount Vite in dev mode
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'custom'
    });
    app.use(vite.middlewares);
  } else {
    // Production static fallback
    const distDir = path.resolve(rootDir, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
    }
  }

  // 404 handler for unknown API routes
  app.use('/api', (req: Request, res: Response) => {
    res.status(404).json({ success: false, message: `Endpoint ${req.method} ${req.url} not found.` });
  });

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled server error:', err);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  });

  const server = app.listen(PORT, HOST, () => {
    console.log(`School Attendance Management System running at http://${HOST}:${PORT}`);
  });

  return server;
}

startServer().catch((err) => {
  console.error('Failed to start institutional AMS server:', err);
  process.exit(1);
});
