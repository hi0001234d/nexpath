import express from 'express';
import type { Server } from 'http';
import type { Client } from 'discord.js';
import { config } from './config';
import {
  formatEvent,
  loadGithubConfig,
  sendToChannel,
  verifySignature,
} from './github';

export function startWebhookServer(client: Client): Server {
  const app = express();

  app.get('/health', (_req, res) => {
    res.status(200).send('NexPath GitHub Webhook Service is running OK\n');
  });

  // Raw body is required for HMAC signature verification
  app.post(
    '/github-webhook',
    express.raw({ type: '*/*', limit: '1mb' }),
    async (req, res) => {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      const sigHeader = req.headers['x-hub-signature-256'] as string | undefined;

      if (!verifySignature(rawBody, sigHeader)) {
        console.warn('Rejected webhook: Invalid HMAC signature');
        res.status(401).send('Invalid signature');
        return;
      }

      const event = req.headers['x-github-event'] as string | undefined;
      if (!event) {
        res.status(400).send('Missing X-GitHub-Event header');
        return;
      }

      let data: any;
      try {
        data = JSON.parse(rawBody.toString('utf-8'));
      } catch {
        res.status(400).send('Invalid JSON');
        return;
      }

      console.log(`Received GitHub event: '${event}'`);

      const githubConfig = loadGithubConfig();
      const formatted = formatEvent(event, data);
      if (formatted?.content) {
        await sendToChannel(client, githubConfig, { content: formatted.content });
      }

      res.status(200).send('Event received');
    },
  );

  const server = app.listen(config.webhookPort, '0.0.0.0', () => {
    console.log(`🌐 GitHub Webhook Server listening on http://0.0.0.0:${config.webhookPort}/github-webhook`);
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${config.webhookPort} is already in use — webhook listener disabled. Set GITHUB_WEBHOOK_PORT to a free port.`);
    } else {
      console.error('Webhook server error:', err);
    }
  });

  return server;
}
