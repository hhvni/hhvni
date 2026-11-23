/**
 * Point d'entrée : un seul processus Node sert l'API REST, Socket.IO et le
 * front Next.js (même origine → cookies de session et WebSocket sans CORS).
 */
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { env, isProd } from './config.js';
import { prisma } from './db.js';
import { logger } from './logger.js';
import { createApp } from './app.js';
import { setupSockets } from './realtime/socket.js';

type Handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>;
interface NextServer {
  prepare(): Promise<void>;
  getRequestHandler(): Handler;
  getUpgradeHandler(): (req: import('node:http').IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => Promise<void>;
}
type NextFactory = (opts: { dev: boolean; dir: string; httpServer?: import('node:http').Server }) => NextServer;

export async function startServer(port: number, serveWeb = env.SERVE_WEB === '1'): Promise<{ close: () => Promise<void> }> {
  await prisma.$connect();
  const app = createApp();
  const http = createServer(app);
  const { io, manager } = setupSockets(http);

  if (serveWeb) {
    const mod = (await import('next')) as unknown as { default: NextFactory | { default: NextFactory } };
    const next: NextFactory = typeof mod.default === 'function' ? mod.default : mod.default.default;
    const dir = resolve(process.cwd(), env.WEB_DIR);
    const nextApp = next({ dev: !isProd, dir, httpServer: http });
    await nextApp.prepare();
    const handle = nextApp.getRequestHandler();
    app.all(/^(?!\/api\/|\/socket\.io\/|\/uploads\/).*/, (req, res) => handle(req, res));
    // Rechargement à chaud de Next en développement (WebSocket HMR)
    if (!isProd) {
      const upgrade = nextApp.getUpgradeHandler();
      http.on('upgrade', (req, socket, head) => {
        if (!req.url?.startsWith('/socket.io')) void upgrade(req, socket, head);
      });
    }
  }

  await manager.restoreAll();
  await new Promise<void>((r) => http.listen(port, r));
  logger.info(`Poker privé prêt sur ${env.PUBLIC_URL} (port ${port})`);

  return {
    close: async () => {
      io.close();
      await manager.shutdown();
      await new Promise((r) => http.close(r));
    },
  };
}

// Exécution directe (et non import depuis les tests)
if (process.argv[1] && /index\.(ts|js)$/.test(process.argv[1])) {
  startServer(env.PORT)
    .then((srv) => {
      const shutdown = async (signal: string) => {
        logger.info(`${signal} reçu, arrêt propre…`);
        await srv.close();
        await prisma.$disconnect();
        process.exit(0);
      };
      process.on('SIGINT', () => void shutdown('SIGINT'));
      process.on('SIGTERM', () => void shutdown('SIGTERM'));
    })
    .catch((err) => {
      logger.fatal({ err }, 'Démarrage impossible');
      process.exit(1);
    });
}
