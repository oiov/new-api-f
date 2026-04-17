/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { API } from './api';

/**
 * 按需获取单个令牌的真实 key
 * @param {number|string} tokenId
 * @returns {Promise<string>} 返回不带 sk- 前缀的真实 token key
 */
export async function fetchTokenKey(tokenId) {
  const response = await API.post(`/api/token/${tokenId}/key`);
  const { success, data, message } = response.data || {};
  if (!success || !data?.key) {
    throw new Error(message || 'Failed to fetch token key');
  }
  return data.key;
}

/**
 * 获取可用的 token keys
 * @returns {Promise<string[]>} 返回 active 状态的不带 sk- 前缀的真实 token key 数组
 */
export async function fetchTokenKeys() {
  try {
    const response = await API.get('/api/token/?p=1&size=10');
    const { success, data } = response.data;
    if (!success) throw new Error('Failed to fetch token keys');

    const tokenItems = Array.isArray(data) ? data : data.items || [];
    const activeTokens = tokenItems.filter((token) => token.status === 1);
    const keyResults = await Promise.allSettled(
      activeTokens.map((token) => fetchTokenKey(token.id)),
    );
    return keyResults
      .filter((result) => result.status === 'fulfilled' && result.value)
      .map((result) => result.value);
  } catch (error) {
    console.error('Error fetching token keys:', error);
    return [];
  }
}

/**
 * 获取服务器地址
 * @returns {string} 服务器地址
 */
export function getServerAddress() {
  let status = localStorage.getItem('status');
  let serverAddress = '';

  if (status) {
    try {
      status = JSON.parse(status);
      serverAddress = status.server_address || '';
    } catch (error) {
      console.error('Failed to parse status from localStorage:', error);
    }
  }

  if (!serverAddress) {
    serverAddress = window.location.origin;
  }

  return serverAddress;
}

const DEFAULT_TOKEN_TEST_MODELS = {
  claude_model: 'claude-opus-4-6',
  responses_model: 'gpt-5.4',
};

export const TOKEN_TEST_GROUP_DEFAULTS_OPTION_KEY =
  'console_setting.token_test_defaults_by_group';

export const TOKEN_TEST_MODES = {
  both: 'both',
  claude: 'claude',
  responses: 'responses',
};

export const TOKEN_TEST_DEFAULT_MAX_TOKENS = 16;

function getStatusCache() {
  const status = localStorage.getItem('status');
  if (!status) {
    return null;
  }
  try {
    return JSON.parse(status);
  } catch (error) {
    console.error('Failed to parse status from localStorage:', error);
    return null;
  }
}

export function getTokenTestDefaults() {
  const status = getStatusCache();
  const defaults = status?.token_test_defaults;
  if (defaults && typeof defaults === 'object') {
    return {
      claude_model:
        String(defaults.claude_model || '').trim() ||
        DEFAULT_TOKEN_TEST_MODELS.claude_model,
      responses_model:
        String(defaults.responses_model || '').trim() ||
        DEFAULT_TOKEN_TEST_MODELS.responses_model,
    };
  }
  return { ...DEFAULT_TOKEN_TEST_MODELS };
}

export function getTokenTestDefaultsByGroup() {
  const status = getStatusCache();
  return normalizeTokenTestGroupDefaults(status?.token_test_defaults_by_group);
}

export function getDefaultTokenTestConfig() {
  return {
    mode: TOKEN_TEST_MODES.both,
    ...getTokenTestDefaults(),
    max_tokens: TOKEN_TEST_DEFAULT_MAX_TOKENS,
  };
}

export function normalizeTokenTestConfig(config = {}) {
  const defaults = getDefaultTokenTestConfig();
  const nextMode = String(config?.mode || defaults.mode).trim();
  return {
    mode: Object.values(TOKEN_TEST_MODES).includes(nextMode)
      ? nextMode
      : TOKEN_TEST_MODES.both,
    claude_model:
      String(config?.claude_model || '').trim() || defaults.claude_model,
    responses_model:
      String(config?.responses_model || '').trim() || defaults.responses_model,
    max_tokens:
      Number.isFinite(Number(config?.max_tokens)) && Number(config?.max_tokens) > 0
        ? Number(config.max_tokens)
        : defaults.max_tokens,
  };
}

export function resolveTokenTestConfig(groupName, overrides = {}) {
  const groupDefaults = getTokenTestDefaultsByGroup();
  const normalizedGroup = String(groupName || '').trim();
  const mergedConfig = {
    ...getDefaultTokenTestConfig(),
    ...(groupDefaults.default || {}),
    ...(normalizedGroup ? groupDefaults[normalizedGroup] || {} : {}),
    ...(overrides || {}),
  };
  return normalizeTokenTestConfig(mergedConfig);
}

export function normalizeTokenTestGroupDefaults(rawDefaults) {
  if (
    !rawDefaults ||
    typeof rawDefaults !== 'object' ||
    Array.isArray(rawDefaults)
  ) {
    return {};
  }

  return Object.entries(rawDefaults).reduce((acc, [groupName, config]) => {
    const normalizedGroup = String(groupName || '').trim();
    if (
      !normalizedGroup ||
      !config ||
      typeof config !== 'object' ||
      Array.isArray(config)
    ) {
      return acc;
    }
    acc[normalizedGroup] = {
      mode: String(config.mode || '').trim(),
      claude_model: String(config.claude_model || '').trim(),
      responses_model: String(config.responses_model || '').trim(),
    };
    return acc;
  }, {});
}

export function validateTokenTestGroupDefaults(rawDefaults, t = (key) => key) {
  if (
    !rawDefaults ||
    typeof rawDefaults !== 'object' ||
    Array.isArray(rawDefaults)
  ) {
    return {
      ok: false,
      message: t('分组测试策略必须是 JSON 对象'),
    };
  }

  for (const [groupName, config] of Object.entries(rawDefaults)) {
    const normalizedGroup = String(groupName || '').trim();
    if (!normalizedGroup) {
      return {
        ok: false,
        message: t('分组名称不能为空'),
      };
    }
    if (!config || typeof config !== 'object' || Array.isArray(config)) {
      return {
        ok: false,
        message: t('分组 {{group}} 的配置必须是 JSON 对象', {
          group: normalizedGroup,
        }),
      };
    }

    const mode = String(config.mode || '').trim();
    if (mode && !Object.values(TOKEN_TEST_MODES).includes(mode)) {
      return {
        ok: false,
        message: t(
          '分组 {{group}} 的 mode 仅支持 both、claude、responses',
          {
            group: normalizedGroup,
          },
        ),
      };
    }

    const claudeModel = String(config.claude_model || '').trim();
    const responsesModel = String(config.responses_model || '').trim();
    if (!mode && !claudeModel && !responsesModel) {
      return {
        ok: false,
        message: t('分组 {{group}} 至少需要配置 mode 或模型', {
          group: normalizedGroup,
        }),
      };
    }
  }

  return {
    ok: true,
    value: normalizeTokenTestGroupDefaults(rawDefaults),
  };
}

export function buildTokenTestPayload(config = {}) {
  const normalized = normalizeTokenTestConfig(config);
  const payload = {
    mode: normalized.mode,
    max_tokens: normalized.max_tokens,
  };

  if (
    normalized.mode === TOKEN_TEST_MODES.both ||
    normalized.mode === TOKEN_TEST_MODES.claude
  ) {
    payload.claude_model = normalized.claude_model;
  }
  if (
    normalized.mode === TOKEN_TEST_MODES.both ||
    normalized.mode === TOKEN_TEST_MODES.responses
  ) {
    payload.responses_model = normalized.responses_model;
  }

  return payload;
}
