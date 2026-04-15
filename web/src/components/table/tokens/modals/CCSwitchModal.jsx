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
import React, { useState, useEffect, useMemo } from 'react';
import {
  RadioGroup,
  Radio,
  Select,
  Input,
  Button,
  SideSheet,
  Space,
  TextArea,
  Toast,
  Typography,
  Tag,
} from '@douyinfe/semi-ui';
import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { encodeToBase64, selectFilter } from '../../../../helpers';
import { fetchTokenKey as fetchTokenKeyById } from '../../../../helpers/token';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';

const APP_CONFIGS = {
  claude: {
    label: 'Claude',
    defaultName: 'Claude Provider',
    modelFields: [
      { key: 'model', label: '主模型' },
      { key: 'haikuModel', label: 'Haiku 模型' },
      { key: 'sonnetModel', label: 'Sonnet 模型' },
      { key: 'opusModel', label: 'Opus 模型' },
    ],
  },
  codex: {
    label: 'Codex',
    defaultName: 'Codex Provider',
    modelFields: [{ key: 'model', label: '主模型' }],
  },
};

const DEFAULT_MODELS = {
  claude: {
    model: 'claude-opus-4-6',
    haikuModel: 'claude-haiku-4-5-20251001',
    sonnetModel: 'claude-sonnet-4-6',
    opusModel: 'claude-opus-4-6',
  },
  codex: {
    model: 'gpt-5.4',
  },
};

const RECOMMENDED_MODELS = {
  claude: [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-haiku-4-5-20251001',
  ],
  codex: ['gpt-5.4', 'gpt-5', 'gpt-5-mini', 'gpt-5.2'],
};

const CCSWITCH_DEEPLINK_DOC_URL = 'https://github.com/farion1231/cc-switch/blob/accdacf94dbbd2b71633b6f9f9e35dcc5741bda5/docs/user-manual/zh/5-faq/5.3-deeplink.md';
const CCSWITCH_RELEASES_URL = 'https://github.com/farion1231/cc-switch/releases';
const CCSWITCH_PROTOCOL_PROBE_URL = 'ccswitch://';

const TEST_STATUS_IDLE = 'idle';
const TEST_STATUS_SUCCESS = 'success';
const TEST_STATUS_ERROR = 'error';

function getServerAddress() {
  try {
    const raw = localStorage.getItem('status');
    if (raw) {
      const status = JSON.parse(raw);
      if (status.server_address) return status.server_address;
    }
  } catch (_) { }
  return window.location.origin;
}

function getCCSwitchDefaultsFromStatus() {
  try {
    const raw = localStorage.getItem('status');
    if (!raw) return null;
    const status = JSON.parse(raw);
    return status?.ccswitch_defaults || null;
  } catch (_) {
    return null;
  }
}

function normalizeCCSwitchDefaults(raw) {
  const payload = raw && typeof raw === 'object' ? raw : null;
  const root =
    payload?.apps && typeof payload.apps === 'object' ? payload.apps : payload;

  const normalizeApp = (value) => {
    const obj = value && typeof value === 'object' ? value : {};
    const defaultName =
      String(obj.defaultName || obj.default_name || '').trim() || '';
    const defaultModels =
      obj.defaultModels && typeof obj.defaultModels === 'object'
        ? obj.defaultModels
        : obj.default_models && typeof obj.default_models === 'object'
          ? obj.default_models
          : {};
    const recommendedModelsRaw =
      obj.recommendedModels || obj.recommended_models || [];
    const recommendedModels = Array.from(
      new Set(
        (Array.isArray(recommendedModelsRaw) ? recommendedModelsRaw : [])
          .map((item) => String(item || '').trim())
          .filter(Boolean),
      ),
    );
    return {
      defaultName,
      defaultModels,
      recommendedModels,
    };
  };

  return {
    claude: normalizeApp(root?.claude),
    codex: normalizeApp(root?.codex),
  };
}

function inferAppFromGroup(group) {
  const normalizedGroup = String(group || '')
    .trim()
    .toLowerCase();
  if (!normalizedGroup) return '';
  if (normalizedGroup.includes('claude')) return 'claude';
  if (normalizedGroup.includes('codex')) return 'codex';
  return '';
}

function buildClaudeConfig(apiKey, baseUrl, models) {
  const env = {
    ANTHROPIC_AUTH_TOKEN: apiKey,
    ANTHROPIC_BASE_URL: baseUrl,
    ANTHROPIC_MODEL: models.model || '',
  };
  if (models.haikuModel) {
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = models.haikuModel;
  }
  if (models.sonnetModel) {
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = models.sonnetModel;
  }
  if (models.opusModel) {
    env.ANTHROPIC_DEFAULT_OPUS_MODEL = models.opusModel;
  }
  return { env };
}

function buildCodexConfig(apiKey, baseUrl, models) {
  const tomlConfig = `[model_providers.openai]
base_url = "${baseUrl}/v1"

[general]
model = "${models.model || ''}"`;

  return {
    auth: {
      OPENAI_API_KEY: apiKey,
    },
    config: tomlConfig,
  };
}

function buildCCSwitchURL(app, name, models, apiKey) {
  const serverAddress = getServerAddress();
  const normalizedBaseUrl = serverAddress.replace(/\/$/, '');
  const params = new URLSearchParams();
  const config =
    app === 'codex'
      ? buildCodexConfig(apiKey, normalizedBaseUrl, models)
      : buildClaudeConfig(apiKey, normalizedBaseUrl, models);

  params.set('resource', 'provider');
  params.set('app', app);
  params.set('name', name);
  params.set('configFormat', 'json');
  params.set('config', encodeToBase64(JSON.stringify(config)));
  params.set('enabled', 'true');
  return `ccswitch://v1/import?${params.toString()}`;
}

function buildProviderName(group, fallbackLabel) {
  const normalizedGroup = String(group || '').trim();
  if (normalizedGroup) {
    return `FishXCode (${normalizedGroup})`;
  }
  return fallbackLabel;
}

function detectCCSwitchClient() {
  return new Promise((resolve) => {
    if (
      typeof window === 'undefined' ||
      typeof document === 'undefined' ||
      typeof document.body === 'undefined'
    ) {
      resolve(false);
      return;
    }

    let settled = false;
    let timer = null;
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.setAttribute('aria-hidden', 'true');

    const cleanup = () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      window.removeEventListener('blur', handleSuccess, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      iframe.remove();
    };

    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };

    const handleSuccess = () => finish(true);
    const handleVisibilityChange = () => {
      if (document.hidden) {
        finish(true);
      }
    };

    window.addEventListener('blur', handleSuccess, true);
    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    document.body.appendChild(iframe);

    try {
      iframe.src = CCSWITCH_PROTOCOL_PROBE_URL;
    } catch (_) {
      finish(false);
      return;
    }

    timer = window.setTimeout(() => finish(false), 1200);
  });
}

export default function CCSwitchModal({
  visible,
  onClose,
  tokenRecord,
  modelOptions,
}) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const normalizedDefaults = useMemo(
    () => normalizeCCSwitchDefaults(getCCSwitchDefaultsFromStatus()),
    [],
  );
  const inferredApp = useMemo(
    () => inferAppFromGroup(tokenRecord?.group),
    [tokenRecord?.group],
  );
  const effectiveAppConfigs = useMemo(() => {
    return {
      claude: {
        ...APP_CONFIGS.claude,
        defaultName:
          normalizedDefaults?.claude?.defaultName || APP_CONFIGS.claude.defaultName,
      },
      codex: {
        ...APP_CONFIGS.codex,
        defaultName:
          normalizedDefaults?.codex?.defaultName || APP_CONFIGS.codex.defaultName,
      },
    };
  }, [normalizedDefaults]);
  const effectiveDefaultModels = useMemo(() => {
    return {
      claude: {
        ...DEFAULT_MODELS.claude,
        ...(normalizedDefaults?.claude?.defaultModels || {}),
      },
      codex: {
        ...DEFAULT_MODELS.codex,
        ...(normalizedDefaults?.codex?.defaultModels || {}),
      },
    };
  }, [normalizedDefaults]);
  const effectiveRecommendedModels = useMemo(() => {
    const claude = [
      ...(normalizedDefaults?.claude?.recommendedModels || []),
      ...(RECOMMENDED_MODELS.claude || []),
    ];
    const codex = [
      ...(normalizedDefaults?.codex?.recommendedModels || []),
      ...(RECOMMENDED_MODELS.codex || []),
    ];
    return {
      claude: Array.from(new Set(claude.filter(Boolean))),
      codex: Array.from(new Set(codex.filter(Boolean))),
    };
  }, [normalizedDefaults]);
  const [app, setApp] = useState(inferredApp || 'claude');
  const [name, setName] = useState(APP_CONFIGS.claude.defaultName);
  const [models, setModels] = useState(DEFAULT_MODELS.claude);
  const [submitting, setSubmitting] = useState(false);
  const [checkingClient, setCheckingClient] = useState(false);
  const [testingModelKey, setTestingModelKey] = useState('');
  const [isBatchTesting, setIsBatchTesting] = useState(false);
  const [modelTestResults, setModelTestResults] = useState({});
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [serverAddress, setServerAddress] = useState('');

  const currentConfig = effectiveAppConfigs[app] || effectiveAppConfigs.claude;
  const currentDefaults = effectiveDefaultModels[app] || effectiveDefaultModels.claude;
  const recommendedModels = effectiveRecommendedModels[app] || [];
  const mergedModelOptions = useMemo(() => {
    const existingValues = new Set(
      (modelOptions || []).map((item) => item?.value).filter(Boolean),
    );
    const nextOptions = [...(modelOptions || [])];
    [
      ...Object.values(effectiveDefaultModels).flatMap((value) =>
        Object.values(value || {}),
      ),
      ...Object.values(effectiveRecommendedModels).flatMap((value) => value || []),
    ]
      .forEach((model) => {
        if (!existingValues.has(model)) {
          nextOptions.unshift({
            label: model,
            value: model,
          });
          existingValues.add(model);
        }
      });
    return nextOptions;
  }, [effectiveDefaultModels, effectiveRecommendedModels, modelOptions]);

  useEffect(() => {
    if (visible) {
      const nextApp = inferredApp || 'claude';
      setApp(nextApp);
      setModels(effectiveDefaultModels[nextApp] || effectiveDefaultModels.claude);
      setModelTestResults({});
      setTestingModelKey('');
      setIsBatchTesting(false);
      setPreviewExpanded(false);
      setServerAddress(getServerAddress().replace(/\/$/, ''));
      setName(
        buildProviderName(
          tokenRecord?.group,
          effectiveAppConfigs[nextApp]?.defaultName || effectiveAppConfigs.claude.defaultName,
        ),
      );
    }
  }, [visible, inferredApp, tokenRecord, effectiveAppConfigs, effectiveDefaultModels]);

  const handleAppChange = (val) => {
    setApp(val);
    setName(buildProviderName(tokenRecord?.group, effectiveAppConfigs[val]?.defaultName || APP_CONFIGS[val].defaultName));
    setModels(effectiveDefaultModels[val] || {});
    setModelTestResults({});
    setTestingModelKey('');
    setIsBatchTesting(false);
    setPreviewExpanded(false);
  };

  const handleModelChange = (field, value) => {
    setModels((prev) => ({ ...prev, [field]: value }));
    setModelTestResults((prev) => {
      if (!prev[field]) {
        return prev;
      }
      return {
        ...prev,
        [field]: {
          status: TEST_STATUS_IDLE,
          modelName: value || currentDefaults[field] || '',
          message: '',
        },
      };
    });
  };

  const resolvedModels = useMemo(
    () =>
      currentConfig.modelFields.reduce((acc, field) => {
        acc[field.key] = models[field.key] || currentDefaults[field.key] || '';
        return acc;
      }, {}),
    [currentConfig.modelFields, currentDefaults, models],
  );

  const importModels = useMemo(
    () =>
      currentConfig.modelFields.reduce((acc, field) => {
        const modelName = resolvedModels[field.key];
        if (!modelName) {
          return acc;
        }
        if (modelTestResults[field.key]?.status === TEST_STATUS_SUCCESS) {
          acc[field.key] = modelName;
        }
        return acc;
      }, {}),
    [currentConfig.modelFields, modelTestResults, resolvedModels],
  );

  const finalImportModels = useMemo(() => {
    const nextModels = { ...importModels };
    if (!nextModels.model && resolvedModels.model) {
      nextModels.model = resolvedModels.model;
    }
    return nextModels;
  }, [importModels, resolvedModels]);

  const importableModelFields = useMemo(
    () => currentConfig.modelFields.filter((field) => Boolean(finalImportModels[field.key])),
    [currentConfig.modelFields, finalImportModels],
  );

  const previewConfig = useMemo(() => {
    const previewApiKey = 'sk-your-token-key';
    return app === 'codex'
      ? buildCodexConfig(previewApiKey, serverAddress, finalImportModels)
      : buildClaudeConfig(previewApiKey, serverAddress, finalImportModels);
  }, [
    app,
    finalImportModels,
    serverAddress,
  ]);

  const configPreview = useMemo(
    () => JSON.stringify(previewConfig, null, 2),
    [previewConfig],
  );

  const fetchGatewayToken = async () => {
    const tokenKey = await fetchTokenKeyById(tokenRecord.id);
    return tokenKey.startsWith('sk-') ? tokenKey : `sk-${tokenKey}`;
  };

  const buildTestingFields = () =>
    currentConfig.modelFields
      .map((field) => ({
        key: field.key,
        label: field.label,
        modelName: models[field.key] || currentDefaults[field.key] || '',
      }))
      .filter((field) => Boolean(field.modelName));

  const runModelConnectivityTest = async (fieldKey, sharedApiKey) => {
    const modelName = models[fieldKey] || currentDefaults[fieldKey];
    if (!modelName) {
      const message = t('未选择可测试的模型');
      setModelTestResults((prev) => ({
        ...prev,
        [fieldKey]: {
          status: TEST_STATUS_ERROR,
          modelName: '',
          message,
        },
      }));
      return { ok: false, message, modelName: '' };
    }
    if (!tokenRecord?.id) {
      const message = t('令牌不存在');
      setModelTestResults((prev) => ({
        ...prev,
        [fieldKey]: {
          status: TEST_STATUS_ERROR,
          modelName,
          message,
        },
      }));
      return { ok: false, message, modelName };
    }

    try {
      const apiKey = sharedApiKey || await fetchGatewayToken();
      const latestServerAddress = getServerAddress().replace(/\/$/, '');
      setServerAddress(latestServerAddress);

      const requestUrl =
        app === 'claude'
          ? `${latestServerAddress}/v1/messages`
          : `${latestServerAddress}/v1/chat/completions`;
      const requestHeaders =
        app === 'claude'
          ? {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          }
          : {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          };
      const requestBody =
        app === 'claude'
          ? {
            model: modelName,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'ping' }],
          }
          : {
            model: modelName,
            max_tokens: 1,
            stream: false,
            messages: [{ role: 'user', content: 'ping' }],
          };

      const response = await fetch(requestUrl, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
      });
      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        const message = t('模型连通性测试成功');
        setModelTestResults((prev) => ({
          ...prev,
          [fieldKey]: {
            status: TEST_STATUS_SUCCESS,
            modelName,
            message,
          },
        }));
        return { ok: true, message, modelName };
      }

      const message =
        data?.error?.message ||
        data?.message ||
        t('模型连通性测试失败');
      setModelTestResults((prev) => ({
        ...prev,
        [fieldKey]: {
          status: TEST_STATUS_ERROR,
          modelName,
          message,
        },
      }));
      return { ok: false, message, modelName };
    } catch (error) {
      const message = error?.message || t('模型连通性测试失败');
      setModelTestResults((prev) => ({
        ...prev,
        [fieldKey]: {
          status: TEST_STATUS_ERROR,
          modelName,
          message,
        },
      }));
      return { ok: false, message, modelName };
    }
  };

  const testModelConnectivity = async (fieldKey) => {
    if (submitting || checkingClient || testingModelKey || isBatchTesting) {
      return;
    }

    const modelName = models[fieldKey] || currentDefaults[fieldKey];
    if (!modelName) {
      Toast.warning(t('未选择可测试的模型'));
      return;
    }

    setTestingModelKey(fieldKey);
    try {
      const result = await runModelConnectivityTest(fieldKey);
      if (result.ok) {
        Toast.success(t('模型连通性测试成功：{{model}}', { model: result.modelName }));
        return;
      }
      Toast.error(result.message || t('模型连通性测试失败'));
    } finally {
      setTestingModelKey('');
    }
  };

  const testAllModelConnectivity = async () => {
    if (submitting || checkingClient || testingModelKey || isBatchTesting) {
      return;
    }
    const fields = buildTestingFields();
    if (fields.length === 0) {
      Toast.warning(t('未选择可测试的模型'));
      return;
    }
    if (!tokenRecord?.id) {
      Toast.error(t('令牌不存在'));
      return;
    }

    setIsBatchTesting(true);
    setModelTestResults({});
    try {
      const apiKey = await fetchGatewayToken();
      let successCount = 0;
      for (const field of fields) {
        setTestingModelKey(field.key);
        const result = await runModelConnectivityTest(field.key, apiKey);
        if (result.ok) {
          successCount += 1;
        }
      }
      if (successCount === fields.length) {
        Toast.success(t('全部模型连通性测试成功（{{count}}/{{total}}）', {
          count: successCount,
          total: fields.length,
        }));
        return;
      }
      Toast.warning(t('模型测试完成，成功 {{count}} / {{total}}', {
        count: successCount,
        total: fields.length,
      }));
    } catch (error) {
      Toast.error(error?.message || t('批量模型测试失败'));
    } finally {
      setTestingModelKey('');
      setIsBatchTesting(false);
    }
  };

  const handleSubmit = () => {
    if (!models.model) {
      Toast.warning(t('请选择主模型'));
      return;
    }
    if (!tokenRecord?.id) {
      Toast.error(t('令牌不存在'));
      return;
    }
    (async () => {
      setSubmitting(true);
      setCheckingClient(true);
      try {
        const hasClient = await detectCCSwitchClient();
        if (!hasClient) {
          Toast.warning(t('未检测到本地已安装 CC Switch，请先下载安装客户端'));
          return;
        }

        const latestServerAddress = getServerAddress().replace(/\/$/, '');
        setServerAddress(latestServerAddress);
        const apiKey = await fetchGatewayToken();
        if (modelTestResults.model?.status !== TEST_STATUS_SUCCESS) {
          Toast.warning(t('主模型未测试通过，已按当前填写值导入；附加模型仍仅导入测试通过项'));
        }
        const url = buildCCSwitchURL(app, name, finalImportModels, apiKey);
        window.open(url, '_blank');
        onClose();
      } catch (error) {
        Toast.error(error?.message || t('获取令牌密钥失败'));
      } finally {
        setCheckingClient(false);
        setSubmitting(false);
      }
    })();
  };

  const fieldLabelStyle = useMemo(
    () => ({
      marginBottom: 6,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '0.02em',
      color: 'var(--semi-color-text-1)',
    }),
    [],
  );

  const panelCardStyle = useMemo(
    () => ({
      padding: 12,
      borderRadius: 14,
      background: 'rgba(255, 255, 255, 0.94)',
      border: '1px solid rgba(15, 23, 42, 0.08)',
      boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)',
      backdropFilter: 'blur(10px)',
    }),
    [],
  );

  const previewBlockStyle = useMemo(
    () => ({
      padding: 10,
      borderRadius: 12,
      background: 'var(--semi-color-fill-0)',
      border: '1px solid var(--semi-color-border)',
    }),
    [],
  );

  const currentProviderName =
    name || buildProviderName(tokenRecord?.group, currentConfig.defaultName);
  const canOpenCCSwitch =
    Boolean(finalImportModels.model) &&
    !submitting &&
    !checkingClient &&
    !testingModelKey &&
    !isBatchTesting;

  return (
    <SideSheet
      title={
        <div className='flex items-center justify-between gap-3'>
          <div className='flex flex-col'>
            <Typography.Text
              strong
              style={{ fontSize: 17, lineHeight: '24px', color: '#171717' }}
            >
              {t('填入 CC Switch')}
            </Typography.Text>
            <Typography.Text type='tertiary' size='small' style={{ marginTop: 2 }}>
              {currentProviderName}
            </Typography.Text>
          </div>
          <div
            style={{
              padding: '4px 9px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              color: '#171717',
              background: 'rgba(23, 23, 23, 0.06)',
              border: '1px solid rgba(23, 23, 23, 0.08)',
            }}
          >
            {APP_CONFIGS[app]?.label || 'Claude'}
          </div>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      placement='right'
      width={isMobile ? '100%' : 640}
      bodyStyle={{
        padding: 0,
        background: '#f8fafc',
      }}
      closeIcon={null}
      maskClosable={false}
      footer={
        <div
          className='flex justify-end'
          style={{
            padding: '14px 20px',
            background: 'rgba(255, 255, 255, 0.92)',
            borderTop: '1px solid rgba(15, 23, 42, 0.08)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <Space spacing={12}>
            <Button
              theme='solid'
              onClick={handleSubmit}
              loading={submitting || checkingClient}
              disabled={!canOpenCCSwitch}
              style={{
                minWidth: 132,
                borderRadius: 999,
                background: '#171717',
                border: 'none',
                boxShadow: 'none',
              }}
            >
              {t('打开 CC Switch')}
            </Button>
            <Button
              theme='borderless'
              type='tertiary'
              onClick={onClose}
              disabled={submitting || checkingClient || Boolean(testingModelKey) || isBatchTesting}
              style={{
                minWidth: 88,
                borderRadius: 999,
                color: 'var(--semi-color-text-0)',
                background: 'rgba(255, 255, 255, 0.88)',
                border: '1px solid rgba(15, 23, 42, 0.08)',
              }}
            >
              {t('取消')}
            </Button>
          </Space>
        </div>
      }
    >
      <div className='flex flex-col gap-2 p-3'>
        <div
          style={{
            ...panelCardStyle,
            background: '#ffffff',
          }}
        >
          <div className='flex flex-col gap-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <Tag color={finalImportModels.model ? 'green' : 'orange'} shape='circle'>
                {modelTestResults.model?.status === TEST_STATUS_SUCCESS
                  ? t('主模型已验证')
                  : finalImportModels.model
                    ? t('可直接导入')
                    : t('待填写主模型')}
              </Tag>
              {tokenRecord?.group ? (
                <div
                  style={{
                    padding: '4px 10px',
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 600,
                    color: '#334155',
                    background: 'rgba(255, 255, 255, 0.76)',
                    border: '1px solid rgba(148, 163, 184, 0.24)',
                  }}
                >
                  {t('当前令牌分组')}: {tokenRecord.group}
                </div>
              ) : null}
            </div>
            <div>
              <Typography.Text
                strong
                style={{ display: 'block', fontSize: 18, lineHeight: '26px', color: '#0f172a' }}
              >
                {currentProviderName}
              </Typography.Text>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button
                theme='outline'
                type='tertiary'
                size='small'
                onClick={testAllModelConnectivity}
                loading={isBatchTesting}
                disabled={submitting || checkingClient || Boolean(testingModelKey)}
                style={{ borderRadius: 999, minWidth: 100 }}
              >
                {t('测试全部模型')}
              </Button>
              <a
                href={CCSWITCH_RELEASES_URL}
                target='_blank'
                rel='noreferrer'
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  minWidth: 88,
                  padding: '4px 2px',
                  color: '#475569',
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: '20px',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  transition: 'color 160ms ease, opacity 160ms ease',
                }}
              >
                {t('下载客户端')}
                <ArrowUpRight size={14} strokeWidth={2} />
              </a>
              <a
                href={CCSWITCH_DEEPLINK_DOC_URL}
                target='_blank'
                rel='noreferrer'
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  minWidth: 88,
                  padding: '4px 2px',
                  color: '#475569',
                  fontSize: 14,
                  fontWeight: 600,
                  lineHeight: '20px',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  transition: 'color 160ms ease, opacity 160ms ease',
                }}
              >
                {t('协议说明')}
                <ArrowUpRight size={14} strokeWidth={2} />
              </a>
            </div>
          </div>
        </div>

        <div style={panelCardStyle}>
          <div className='grid gap-2 md:grid-cols-[160px_minmax(0,1fr)]'>
            {inferredApp ? (
              <div>
                <div style={fieldLabelStyle}>{t('导入类型')}</div>
                <div
                  style={{
                    height: 32,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 10px',
                    borderRadius: 12,
                    background: 'rgba(248, 250, 252, 0.92)',
                    border: '1px solid rgba(148, 163, 184, 0.18)',
                    fontSize: 12,
                    color: '#334155',
                    fontWeight: 600,
                  }}
                >
                  {APP_CONFIGS[app]?.label || APP_CONFIGS.claude.label}
                </div>
              </div>
            ) : (
              <div>
                <div style={fieldLabelStyle}>{t('导入类型')}</div>
                <RadioGroup
                  type='button'
                  value={app}
                  onChange={(e) => handleAppChange(e.target.value)}
                  style={{ width: '100%' }}
                >
                  {Object.entries(APP_CONFIGS).map(([key, cfg]) => (
                    <Radio key={key} value={key}>
                      {cfg.label}
                    </Radio>
                  ))}
                </RadioGroup>
              </div>
            )}

            <div>
              <div style={fieldLabelStyle}>{t('名称')}</div>
              <Input
                value={name}
                onChange={setName}
                placeholder={buildProviderName(tokenRecord?.group, currentConfig.defaultName)}
                style={{
                  borderRadius: 12,
                  background: 'rgba(248, 250, 252, 0.92)',
                  border: '1px solid rgba(148, 163, 184, 0.18)',
                }}
              />
            </div>
          </div>
        </div>

        <div style={panelCardStyle}>
          <div className='flex items-center justify-between gap-2' style={{ marginBottom: 10 }}>
            <div>
              <Typography.Text strong style={{ display: 'block', fontSize: 15 }}>
                {t('模型配置')}
              </Typography.Text>
            </div>
            <Tag size='small' color={importableModelFields.length > 0 ? 'green' : 'orange'} shape='circle'>
              {t('已通过 {{count}} 项', { count: importableModelFields.length })}
            </Tag>
          </div>
          {currentConfig.modelFields.map((field, index) => (
            <div
              key={field.key}
              style={{
                paddingBottom: index === currentConfig.modelFields.length - 1 ? 0 : 14,
                marginBottom: index === currentConfig.modelFields.length - 1 ? 0 : 14,
                borderBottom:
                  index === currentConfig.modelFields.length - 1
                    ? 'none'
                    : '1px solid rgba(148, 163, 184, 0.14)',
              }}
            >
              <div className='flex items-center justify-between gap-2' style={{ marginBottom: 8 }}>
                <div style={{ ...fieldLabelStyle, marginBottom: 0 }}>
                  {t(field.label)}
                  {field.key === 'model' && (
                    <Typography.Text type='danger'> *</Typography.Text>
                  )}
                </div>
                {modelTestResults[field.key]?.status &&
                modelTestResults[field.key]?.status !== TEST_STATUS_IDLE ? (
                  <Tag
                    color={
                      modelTestResults[field.key]?.status === TEST_STATUS_SUCCESS
                        ? 'green'
                        : 'red'
                    }
                    shape='circle'
                    size='small'
                  >
                    {modelTestResults[field.key]?.status === TEST_STATUS_SUCCESS
                      ? t('测试通过')
                      : t('测试失败')}
                  </Tag>
                ) : null}
              </div>
              <div className='flex items-start gap-2'>
                <Select
                  placeholder={t('请选择模型')}
                  optionList={mergedModelOptions}
                  value={models[field.key] || currentDefaults[field.key] || undefined}
                  onChange={(val) => handleModelChange(field.key, val)}
                  filter={selectFilter}
                  style={{ width: '100%', flex: 1 }}
                  showClear
                  searchable
                  emptyContent={t('暂无数据')}
                />
                <Button
                  theme='outline'
                  type='tertiary'
                  size='small'
                  onClick={() => testModelConnectivity(field.key)}
                  loading={testingModelKey === field.key}
                  disabled={submitting || checkingClient || Boolean(testingModelKey) || isBatchTesting}
                  style={{ borderRadius: 10, minWidth: 92, marginTop: 2 }}
                >
                  {t('测试')}
                </Button>
              </div>
              {modelTestResults[field.key]?.status &&
              modelTestResults[field.key]?.status !== TEST_STATUS_IDLE ? (
                <div
                  className='flex flex-wrap items-center gap-2'
                  style={{ marginTop: 8 }}
                >
                  <Typography.Text
                    type={
                      modelTestResults[field.key]?.status === TEST_STATUS_SUCCESS
                        ? 'success'
                        : 'danger'
                    }
                    size='small'
                  >
                    {modelTestResults[field.key]?.message}
                  </Typography.Text>
                </div>
              ) : null}
              {field.key === 'model' && recommendedModels.length > 0 ? (
                <Typography.Text
                  type='tertiary'
                  size='small'
                  style={{ display: 'block', marginTop: 6 }}
                >
                  {t('推荐模型')}: {recommendedModels.join(' / ')}
                </Typography.Text>
              ) : null}
            </div>
          ))}
        </div>

        <div style={panelCardStyle}>
          <div className='flex items-center justify-between gap-2' style={{ marginBottom: 8 }}>
            <div style={{ ...fieldLabelStyle, marginBottom: 0 }}>{t('导入预览')}</div>
            <div className='flex items-center gap-2'>
              {modelTestResults.model?.status === TEST_STATUS_SUCCESS ? (
                <Tag color='green' size='small' shape='circle'>{t('主模型已验证')}</Tag>
              ) : finalImportModels.model ? (
                <Tag color='orange' size='small' shape='circle'>{t('主模型未验证')}</Tag>
              ) : (
                <Tag color='red' size='small' shape='circle'>{t('主模型未填写')}</Tag>
              )}
              <Button
                theme='borderless'
                type='tertiary'
                size='small'
                onClick={() => setPreviewExpanded((prev) => !prev)}
                style={{ borderRadius: 999, background: 'rgba(248,250,252,0.92)' }}
              >
                {previewExpanded ? t('收起') : t('展开')}
              </Button>
            </div>
          </div>
          <div style={previewBlockStyle}>
            <div className='flex flex-wrap items-center gap-2' style={{ marginBottom: 12 }}>
              {importableModelFields.length > 0 ? (
                importableModelFields.map((field) => (
                  <Tag key={field.key} color='green' shape='circle'>
                    {t(field.label)}: {finalImportModels[field.key]}
                  </Tag>
                ))
              ) : (
                <Tag color='orange' shape='circle'>
                  {t('当前没有可导入模型，请先测试主模型')}
                </Tag>
              )}
            </div>
            {previewExpanded ? (
              <>
                <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                  {t('Config 内容')}
                </Typography.Text>
                <TextArea
                  value={configPreview}
                  autosize={{ minRows: 6, maxRows: 10 }}
                  readOnly
                />
                <Typography.Text type='tertiary' size='small' style={{ display: 'block', marginTop: 8 }}>
                  {t('Deep Link 参数会随导入时实时生成；这里只保留最终写入的配置内容预览。')}
                </Typography.Text>
              </>
            ) : (
              <Typography.Text type='tertiary' size='small'>
                {t('默认隐藏详细配置，点击展开查看最终写入内容。')}
              </Typography.Text>
            )}
          </div>
        </div>
      </div>
    </SideSheet>
  );
}
