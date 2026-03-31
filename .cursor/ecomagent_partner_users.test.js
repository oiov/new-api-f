const test = require('node:test');
const assert = require('node:assert/strict');

const scriptModule = require('./ecomagent_partner_users.js');

test('buildStandardizedExport 存在并输出标准结构', () => {
  assert.equal(typeof scriptModule.buildStandardizedExport, 'function');

  const rows = [
    {
      id: 1,
      email: 'u1@example.com',
      providerUserId: 'p1',
      apiKey: 'k1',
      apiKeyName: 'k1-name',
      requestLimit: 120000,
      rpmLimit: 800,
      todayRequests: 2000,
      todayTokens: 100000,
      yesterdayRequests: 3000,
      yesterdayTokens: 150000,
      remainingRequestQuota: 118000,
      canDeleteNow: false,
      deletableAtUtc: '-',
    },
  ];

  const result = scriptModule.buildStandardizedExport({
    rows,
    source: { baseUrl: 'https://ecomagent.in' },
  });

  assert.equal(result.success, true);
  assert.equal(result.users.length, 1);
  assert.ok(result.summary);
  assert.ok(result.channelProvisioning);
});

test('buildChannelProvisionTasks 根据额度生成分层 group 和优先级', () => {
  assert.equal(typeof scriptModule.buildChannelProvisionTasks, 'function');

  const tasks = scriptModule.buildChannelProvisionTasks([
    {
      id: 11,
      email: 'high@example.com',
      apiKey: 'k-high',
      requestLimit: 200000,
      rpmLimit: 900,
      todayRequests: 1000,
      remainingRequestQuota: 199000,
    },
    {
      id: 12,
      email: 'low@example.com',
      apiKey: 'k-low',
      requestLimit: 5000,
      rpmLimit: 60,
      todayRequests: 4500,
      remainingRequestQuota: 500,
    },
  ], {
    channelType: 1,
    models: 'gpt-4o-mini',
    namePrefix: 'EcomAgent',
    sharedGroup: 'ecomagent_partner',
  });

  assert.equal(tasks.length, 2);
  assert.match(tasks[0].payload.channel.group, /ecomagent_partner/);
  assert.ok(typeof tasks[0].payload.channel.priority === 'number');
  assert.ok(typeof tasks[0].payload.channel.weight === 'number');
  assert.notEqual(tasks[0].payload.channel.priority, tasks[1].payload.channel.priority);
});
