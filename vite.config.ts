import path from 'path';
import { defineConfig } from 'vite';
import { spawn, ChildProcess } from 'child_process';
import http from 'http';

function pythonFlaskPlugin() {
  return {
    name: 'python-flask-runner',
    configureServer() {
      let pyProcess: ChildProcess | null = null;
      let isShuttingDown = false;

      function startFlask() {
        if (isShuttingDown) return;

        // Check if Flask is already up
        const req = http.get('http://127.0.0.1:5000/api/config', () => {
          console.log('[Flask] Already running on port 5000');
        });

        req.on('error', () => {
          console.log('[Flask] Starting python3 app.py on port 5000...');
          pyProcess = spawn('python3', ['app.py'], {
            stdio: 'inherit',
            env: { ...process.env, FLASK_PORT: '5000' }
          });

          pyProcess.on('exit', (code) => {
            console.log(`[Flask] Exited with code ${code}. Restarting in 1s...`);
            pyProcess = null;
            if (!isShuttingDown) {
              setTimeout(startFlask, 1000);
            }
          });

          pyProcess.on('error', (err) => {
            console.error('[Flask Error]', err);
            pyProcess = null;
            if (!isShuttingDown) {
              setTimeout(startFlask, 2000);
            }
          });
        });
      }

      startFlask();

      process.on('exit', () => {
        isShuttingDown = true;
        if (pyProcess) {
          pyProcess.kill();
        }
      });
    }
  };
}

export default defineConfig(() => {
  return {
    plugins: [pythonFlaskPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
        '/static': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
        '/login': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
        '/forgot-password': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
        '/principal': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
        '/teacher': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
        },
      },
    },
  };
});
