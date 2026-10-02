import type { Express } from 'express';
import { createServer } from 'http';
import request from 'supertest';

/** Keep one owned IPv4 listener for the suite instead of closing each request's
 * ephemeral server while concurrent/reused client sockets are still active. */
export function createLoopbackRequest(app:Express) {
  const server=createServer(app);
  beforeAll(async()=>{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});});
  afterAll(async()=>{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
  return request(server);
}
