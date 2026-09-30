import { timingSafeEqual } from 'crypto';
import { Router } from 'express';

type FetchLike = typeof fetch;

interface PartnerContactConfig {
  callbackToken: string;
  channelKey: string;
  botSecret: string;
  deviceId: string;
  entityId: number;
  baseUrl: string;
}

const PARTNER_REPLY = [
  '您好，我是 Wishlist.ai 合作聯絡助理（自動回覆）。',
  '我們正在徵詢逐件二手商品資料、商品圖片展示及定期更新的正式使用許可；取得許可前不會擅自刊登。',
  '若方便，請提供單位與聯絡窗口、資料來源、可授權的欄位與圖片範圍，以及更新／下架方式。您的訊息會交由 Hank 人工確認；本對話不構成授權、報價或合約承諾。',
  '合作介紹：https://wishlist-app-production.up.railway.app/partners',
].join('\n\n');

function sameSecret(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

function loadConfig(env: NodeJS.ProcessEnv): PartnerContactConfig | null {
  const callbackToken = env.ECLAW_PARTNER_CALLBACK_TOKEN?.trim();
  const channelKey = env.ECLAW_PARTNER_CHANNEL_KEY?.trim();
  const botSecret = env.ECLAW_PARTNER_BOT_SECRET?.trim();
  const deviceId = env.ECLAW_PARTNER_DEVICE_ID?.trim();
  const entityId = Number(env.ECLAW_PARTNER_ENTITY_ID);
  if (!callbackToken || !channelKey || !botSecret || !deviceId || !Number.isInteger(entityId) || entityId < 0) {
    return null;
  }
  return {
    callbackToken,
    channelKey,
    botSecret,
    deviceId,
    entityId,
    baseUrl: (env.ECLAW_PARTNER_BASE_URL || 'https://eclawbot.com').replace(/\/$/, ''),
  };
}

export function createEclawPartnerContactRoutes(
  env: NodeJS.ProcessEnv = process.env,
  send: FetchLike = fetch,
): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const config = loadConfig(env);
    if (!config) return res.status(503).json({ error: 'Contact bot unavailable' });

    const authorization = req.header('authorization') || '';
    if (!authorization.startsWith('Bearer ') || !sameSecret(authorization.slice(7), config.callbackToken)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const body = req.body;
    if (!body || body.deviceId !== config.deviceId || body.entityId !== config.entityId) {
      return res.status(400).json({ error: 'Wrong entity' });
    }

    // EClaw sends an initial system message containing bot credentials after binding.
    // Never forward, log or answer system/agent messages.
    const isUserMessage = body.event === 'message' || body.event === 'cross_device_message';
    if (body.from === 'system' || !isUserMessage || typeof body.text !== 'string' || !body.text.trim()) {
      return res.status(204).end();
    }

    try {
      const upstream = await send(`${config.baseUrl}/api/channel/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel_api_key: config.channelKey,
          deviceId: config.deviceId,
          entityId: config.entityId,
          botSecret: config.botSecret,
          message: PARTNER_REPLY,
          state: 'IDLE',
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (!upstream.ok) return res.status(502).json({ error: 'Contact bot reply unavailable' });
      return res.status(204).end();
    } catch {
      return res.status(502).json({ error: 'Contact bot reply unavailable' });
    }
  });

  return router;
}
