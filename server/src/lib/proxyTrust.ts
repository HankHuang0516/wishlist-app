import type { Express } from 'express';

// Measured on production (2026-11-05): every request arrives from a 100.64/10
// socket peer with exactly two X-Forwarded-For entries, [client, edge node]. The
// edge replaces any X-Forwarded-For or X-Real-IP the caller sends.
//
// Trusting two hops makes req.ip the client. Trusting one made it the edge node,
// so one client spread across several rate limit counters and unrelated clients
// could share one. Every IP-keyed limiter on the site depends on this value.
//
// Railway does not guarantee the hop count. An extra hop would make req.ip a proxy
// again, which weakens limits but cannot let a caller choose their own key.
export const TRUSTED_PROXY_HOPS = 2;

export function configureProxyTrust(app: Pick<Express, 'set'>) {
  app.set('trust proxy', TRUSTED_PROXY_HOPS);
}
