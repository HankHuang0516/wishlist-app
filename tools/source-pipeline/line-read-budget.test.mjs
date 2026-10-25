import test from 'node:test';
import assert from 'node:assert/strict';
import {createLineReadBudget, LineReadTimeout} from './line-read-budget.mjs';
test('a slow native read returns control and cannot be duplicated while pending', async () => {
  const budget = createLineReadBudget({budgetMs:1000,reserveMs:100,readTimeoutMs:15});
  let finish, reads=0;
  const late = new Promise(resolve => { finish=resolve; });
  await assert.rejects(budget.read('AX', () => { reads++; return late; }), LineReadTimeout);
  await assert.rejects(budget.read('AX', () => { reads++; }), /STILL_PENDING/);
  assert.equal(reads,1);
  assert.equal(await budget.read('screenshot', () => 'visible screenshot'),'visible screenshot');
  finish('late AX must not replace screenshot');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(await budget.read('AX', () => 'fresh state'),'fresh state');
});
test('a late rejection is handled without unhandled rejection or replay', async () => {
  const budget=createLineReadBudget({budgetMs:1000,reserveMs:100,readTimeoutMs:5});
  let reject;
  await assert.rejects(budget.read('bind', () => new Promise((_, r)=> {reject=r;})), LineReadTimeout);
  reject(Error('late native failure'));
  await new Promise(resolve => setImmediate(resolve));
});
test('cleanup reserve prevents another read from starting', async () => {
  const budget=createLineReadBudget({budgetMs:30,reserveMs:20,readTimeoutMs:20});
  await new Promise(resolve => setTimeout(resolve,15));
  let started=false;
  await assert.rejects(budget.read('AX',()=> {started=true;}),LineReadTimeout);
  assert.equal(started,false);
  assert.equal(budget.remainingMs(),0);
});
