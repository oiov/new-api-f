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
} from '@douyinfe/semi-ui';
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
  claude: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  codex: ['gpt-5.4', 'gpt-5', 'gpt-5-mini', 'gpt-5.2'],
};

const CCSWITCH_DEEPLINK_DOC_URL =
  'https://github.com/farion1231/cc-switch/blob/accdacf94dbbd2b71633b6f9f9e35dcc5741bda5/docs/user-manual/zh/5-faq/5.3-deeplink.md';
const CCSWITCH_RELEASES_URL =
  'https://github.com/farion1231/cc-switch/releases';
const CCSWITCH_PROTOCOL_PROBE_URL = 'ccswitch://';

function getServerAddress() {
  try {
    const raw = localStorage.getItem('status');
    if (raw) {
      const status = JSON.parse(raw);
      if (status.server_address) return status.server_address;
    }
  } catch (_) {}
  return window.location.origin;
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
  return {
    env: {
      ANTHROPIC_AUTH_TOKEN: apiKey,
      ANTHROPIC_BASE_URL: baseUrl,
      ANTHROPIC_MODEL: models.model,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: models.haikuModel,
      ANTHROPIC_DEFAULT_SONNET_MODEL: models.sonnetModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL: models.opusModel,
    },
  };
}

function buildCodexConfig(apiKey, baseUrl, models) {
  const tomlConfig = `[model_providers.openai]
base_url = "${baseUrl}/v1"

[general]
model = "${models.model}"`;

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
    return `Nbility (${normalizedGroup})`;
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
      document.removeEventListener(
        'visibilitychange',
        handleVisibilityChange,
        true,
      );
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
  const inferredApp = useMemo(
    () => inferAppFromGroup(tokenRecord?.group),
    [tokenRecord?.group],
  );
  const [app, setApp] = useState(inferredApp || 'claude');
  const [name, setName] = useState(APP_CONFIGS.claude.defaultName);
  const [models, setModels] = useState(DEFAULT_MODELS.claude);
  const [submitting, setSubmitting] = useState(false);
  const [checkingClient, setCheckingClient] = useState(false);
  const [testingModelKey, setTestingModelKey] = useState('');
  const [serverAddress, setServerAddress] = useState('');

  const currentConfig = APP_CONFIGS[app] || APP_CONFIGS.claude;
  const currentDefaults = DEFAULT_MODELS[app] || DEFAULT_MODELS.claude;
  const recommendedModels = RECOMMENDED_MODELS[app] || [];
  const mergedModelOptions = useMemo(() => {
    const existingValues = new Set(
      (modelOptions || []).map((item) => item?.value).filter(Boolean),
    );
    const nextOptions = [...(modelOptions || [])];
    [
      ...Object.values(DEFAULT_MODELS).flatMap((value) => Object.values(value)),
      ...Object.values(RECOMMENDED_MODELS).flatMap((value) => value),
    ].forEach((model) => {
      if (!existingValues.has(model)) {
        nextOptions.unshift({
          label: model,
          value: model,
        });
        existingValues.add(model);
      }
    });
    return nextOptions;
  }, [modelOptions]);

  useEffect(() => {
    if (visible) {
      const nextApp = inferredApp || 'claude';
      setApp(nextApp);
      setModels(DEFAULT_MODELS[nextApp] || DEFAULT_MODELS.claude);
      setServerAddress(getServerAddress().replace(/\/$/, ''));
      setName(
        buildProviderName(tokenRecord?.group, APP_CONFIGS[nextApp].defaultName),
      );
    }
  }, [visible, inferredApp, tokenRecord]);

  const handleAppChange = (val) => {
    setApp(val);
    setName(
      buildProviderName(tokenRecord?.group, APP_CONFIGS[val].defaultName),
    );
    setModels(DEFAULT_MODELS[val] || {});
  };

  const handleModelChange = (field, value) => {
    setModels((prev) => ({ ...prev, [field]: value }));
  };

  const previewConfig = useMemo(() => {
    const previewApiKey = 'sk-your-token-key';
    return app === 'codex'
      ? buildCodexConfig(previewApiKey, serverAddress, {
          ...currentDefaults,
          ...models,
        })
      : buildClaudeConfig(previewApiKey, serverAddress, {
          ...currentDefaults,
          ...models,
        });
  }, [app, currentDefaults, models, serverAddress]);

  const deepLinkPreview = useMemo(
    () =>
      JSON.stringify(
        {
          resource: 'provider',
          app,
          name:
            name ||
            buildProviderName(tokenRecord?.group, currentConfig.defaultName),
          configFormat: 'json',
          enabled: true,
        },
        null,
        2,
      ),
    [app, currentConfig.defaultName, name, tokenRecord?.group],
  );

  const configPreview = useMemo(
    () => JSON.stringify(previewConfig, null, 2),
    [previewConfig],
  );

  const fetchGatewayToken = async () => {
    const tokenKey = await fetchTokenKeyById(tokenRecord.id);
    return tokenKey.startsWith('sk-') ? tokenKey : `sk-${tokenKey}`;
  };

  const testModelConnectivity = async (fieldKey) => {
    if (submitting || checkingClient || testingModelKey) {
      return;
    }

    const modelName = models[fieldKey] || currentDefaults[fieldKey];
    if (!modelName) {
      Toast.warning(t('未选择可测试的模型'));
      return;
    }
    if (!tokenRecord?.id) {
      Toast.error(t('令牌不存在'));
      return;
    }

    setTestingModelKey(fieldKey);
    try {
      const apiKey = await fetchGatewayToken();
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
        Toast.success(t('模型连通性测试成功：{{model}}', { model: modelName }));
        return;
      }

      const message =
        data?.error?.message || data?.message || t('模型连通性测试失败');
      Toast.error(message);
    } catch (error) {
      Toast.error(error?.message || t('模型连通性测试失败'));
    } finally {
      setTestingModelKey('');
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
        const url = buildCCSwitchURL(app, name, models, apiKey);
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
      marginBottom: 8,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: '0.02em',
      color: 'var(--semi-color-text-1)',
    }),
    [],
  );

  const panelCardStyle = useMemo(
    () => ({
      padding: 16,
      borderRadius: 18,
      background: 'rgba(255, 255, 255, 0.88)',
      border: '1px solid rgba(15, 23, 42, 0.08)',
      boxShadow: '0 12px 28px rgba(15, 23, 42, 0.06)',
      backdropFilter: 'blur(14px)',
    }),
    [],
  );

  const previewBlockStyle = useMemo(
    () => ({
      padding: 12,
      borderRadius: 14,
      background: 'var(--semi-color-fill-0)',
      border: '1px solid var(--semi-color-border)',
    }),
    [],
  );

  const currentProviderName =
    name || buildProviderName(tokenRecord?.group, currentConfig.defaultName);

  return (
    <SideSheet
      title={
        <div className='flex items-center justify-between gap-3'>
          <div className='flex flex-col'>
            <Typography.Text
              strong
              style={{ fontSize: 20, lineHeight: '28px', color: '#0f172a' }}
            >
              {t('填入 CC Switch')}
            </Typography.Text>
            <Typography.Text type='tertiary' style={{ marginTop: 2 }}>
              {currentProviderName}
            </Typography.Text>
          </div>
          <div
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 700,
              color: '#0f766e',
              background: 'rgba(20, 184, 166, 0.12)',
              border: '1px solid rgba(20, 184, 166, 0.18)',
            }}
          >
            {APP_CONFIGS[app]?.label || 'Claude'}
          </div>
        </div>
      }
      visible={visible}
      onCancel={onClose}
      placement='right'
      width={isMobile ? '100%' : 760}
      bodyStyle={{
        padding: 0,
        background:
          'linear-gradient(180deg, rgba(240, 249, 255, 0.94) 0%, rgba(248, 250, 252, 0.98) 24%, #f8fafc 100%)',
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
              disabled={Boolean(testingModelKey)}
              style={{
                minWidth: 132,
                borderRadius: 999,
                background: 'linear-gradient(135deg, #0f766e 0%, #0891b2 100%)',
                border: 'none',
                boxShadow: '0 10px 24px rgba(8, 145, 178, 0.22)',
              }}
            >
              {t('打开 CC Switch')}
            </Button>
            <Button
              theme='borderless'
              type='tertiary'
              onClick={onClose}
              disabled={
                submitting || checkingClient || Boolean(testingModelKey)
              }
              style={{
                minWidth: 88,
                borderRadius: 999,
                color: 'var(--semi-color-text-0)',
                background: 'rgba(255, 255, 255, 0.72)',
                border: '1px solid rgba(15, 23, 42, 0.08)',
              }}
            >
              {t('取消')}
            </Button>
          </Space>
        </div>
      }
    >
      <div className='flex flex-col gap-4 p-4 md:p-5'>
        <div
          style={{
            ...panelCardStyle,
            background:
              'linear-gradient(135deg, rgba(236, 254, 255, 0.96) 0%, rgba(239, 246, 255, 0.98) 52%, rgba(255, 255, 255, 0.98) 100%)',
          }}
        >
          <div className='flex flex-col gap-3'>
            <div className='flex flex-wrap items-center gap-2'>
              <div
                style={{
                  padding: '6px 10px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  color: '#155e75',
                  background: 'rgba(34, 211, 238, 0.14)',
                }}
              >
                {t('导入类型')}
              </div>
              {tokenRecord?.group ? (
                <div
                  style={{
                    padding: '6px 10px',
                    borderRadius: 999,
                    fontSize: 12,
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
                style={{
                  display: 'block',
                  fontSize: 22,
                  lineHeight: '30px',
                  color: '#0f172a',
                }}
              >
                {currentProviderName}
              </Typography.Text>
              {inferredApp ? (
                <Typography.Text
                  type='secondary'
                  style={{ display: 'block', marginTop: 6 }}
                >
                  {t('已根据分组自动识别为')} {APP_CONFIGS[inferredApp].label}
                </Typography.Text>
              ) : (
                <Typography.Text
                  type='secondary'
                  style={{ display: 'block', marginTop: 6 }}
                >
                  {t('当前分组未明确指向 Claude 或 Codex，请手动选择导入类型')}
                </Typography.Text>
              )}
            </div>
          </div>
        </div>

        <div style={panelCardStyle}>
          {inferredApp ? null : (
            <div style={{ marginBottom: 18 }}>
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
            <div style={fieldLabelStyle}>{t('导入类型')}</div>
            <Typography.Text type='secondary'>
              {APP_CONFIGS[app]?.label || APP_CONFIGS.claude.label}
            </Typography.Text>
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={fieldLabelStyle}>{t('名称')}</div>
            <Input
              value={name}
              onChange={setName}
              placeholder={buildProviderName(
                tokenRecord?.group,
                currentConfig.defaultName,
              )}
              style={{
                borderRadius: 14,
                background: 'rgba(248, 250, 252, 0.92)',
                border: '1px solid rgba(148, 163, 184, 0.18)',
              }}
            />
            <Typography.Text
              type='tertiary'
              style={{ display: 'block', marginTop: 8 }}
            >
              {t('建议使用供应商名来区分来源，例如 Nbility (claude)')}
            </Typography.Text>
          </div>
        </div>

        <div style={panelCardStyle}>
          <Typography.Text
            strong
            style={{ display: 'block', marginBottom: 10, fontSize: 15 }}
          >
            {t('官方链接')}
          </Typography.Text>
          <div className='grid gap-3 md:grid-cols-2'>
            <a
              href={CCSWITCH_DEEPLINK_DOC_URL}
              target='_blank'
              rel='noreferrer'
              style={{
                ...previewBlockStyle,
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <Typography.Text
                strong
                style={{ display: 'block', marginBottom: 4 }}
              >
                {t('CC Switch 深度链接协议')}
              </Typography.Text>
              <Typography.Text type='tertiary' size='small'>
                {t('查看 CC Switch 官方深度链接协议说明')}
              </Typography.Text>
            </a>
            <a
              href={CCSWITCH_RELEASES_URL}
              target='_blank'
              rel='noreferrer'
              style={{
                ...previewBlockStyle,
                display: 'block',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <Typography.Text
                strong
                style={{ display: 'block', marginBottom: 4 }}
              >
                {t('CC Switch 客户端下载')}
              </Typography.Text>
              <Typography.Text type='tertiary' size='small'>
                {t('前往官方发布页下载对应平台客户端')}
              </Typography.Text>
            </a>
          </div>
          <Typography.Text
            type='tertiary'
            style={{ display: 'block', marginTop: 10 }}
          >
            {t(
              '导入前会检测本地是否已安装 CC Switch；模型测试会发起一次最小化请求，用于校验当前模型和令牌是否可用。',
            )}
          </Typography.Text>
        </div>

        <div style={panelCardStyle}>
          {currentConfig.modelFields.map((field, index) => (
            <div
              key={field.key}
              style={{
                paddingBottom:
                  index === currentConfig.modelFields.length - 1 ? 0 : 18,
                marginBottom:
                  index === currentConfig.modelFields.length - 1 ? 0 : 18,
                borderBottom:
                  index === currentConfig.modelFields.length - 1
                    ? 'none'
                    : '1px solid rgba(148, 163, 184, 0.14)',
              }}
            >
              <div style={fieldLabelStyle}>
                {t(field.label)}
                {field.key === 'model' && (
                  <Typography.Text type='danger'> *</Typography.Text>
                )}
              </div>
              <div className='flex items-start gap-2'>
                <Select
                  placeholder={t('请选择模型')}
                  optionList={mergedModelOptions}
                  value={
                    models[field.key] || currentDefaults[field.key] || undefined
                  }
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
                  onClick={() => testModelConnectivity(field.key)}
                  loading={testingModelKey === field.key}
                  disabled={
                    submitting || checkingClient || Boolean(testingModelKey)
                  }
                  style={{ borderRadius: 12, minWidth: 104 }}
                >
                  {t('测试连通性')}
                </Button>
              </div>
              {field.key === 'model' && recommendedModels.length > 0 ? (
                <Typography.Text
                  type='tertiary'
                  style={{ display: 'block', marginTop: 8 }}
                >
                  {t('推荐模型')}: {recommendedModels.join(' / ')}
                </Typography.Text>
              ) : null}
            </div>
          ))}
        </div>

        <div style={panelCardStyle}>
          <div style={fieldLabelStyle}>{t('导入预览')}</div>
          <div style={previewBlockStyle}>
            <Typography.Text
              type='tertiary'
              style={{ display: 'block', marginBottom: 8 }}
            >
              {t(
                '下面分开展示 Deep Link 参数和实际写入 config 的内容。Claude 使用当前站点地址，不额外追加 /v1；Codex 保持 OpenAI 兼容地址。',
              )}
            </Typography.Text>
            <div style={{ marginBottom: 12 }}>
              <Typography.Text
                strong
                style={{ display: 'block', marginBottom: 6 }}
              >
                {t('Deep Link 参数')}
              </Typography.Text>
              <TextArea
                value={deepLinkPreview}
                autosize={{ minRows: 5, maxRows: 10 }}
                readOnly
              />
            </div>
            <Typography.Text
              strong
              style={{ display: 'block', marginBottom: 6 }}
            >
              {t('Config 内容')}
            </Typography.Text>
            <TextArea
              value={configPreview}
              autosize={{ minRows: 14, maxRows: 24 }}
              readOnly
            />
          </div>
        </div>
      </div>
    </SideSheet>
  );
}
