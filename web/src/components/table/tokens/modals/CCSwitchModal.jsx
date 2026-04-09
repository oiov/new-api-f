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
  Modal,
  RadioGroup,
  Radio,
  Select,
  Input,
  TextArea,
  Toast,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { encodeToBase64, selectFilter } from '../../../../helpers';
import { fetchTokenKey as fetchTokenKeyById } from '../../../../helpers/token';

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
    haikuModel: 'claude-haiku-4-5',
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
    'claude-haiku-4-5',
  ],
  codex: ['gpt-5.4', 'gpt-5', 'gpt-5-mini', 'gpt-5.2'],
};

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
    return `FishXCode (${normalizedGroup})`;
  }
  return fallbackLabel;
}

export default function CCSwitchModal({
  visible,
  onClose,
  tokenRecord,
  modelOptions,
}) {
  const { t } = useTranslation();
  const inferredApp = useMemo(
    () => inferAppFromGroup(tokenRecord?.group),
    [tokenRecord?.group],
  );
  const [app, setApp] = useState(inferredApp || 'claude');
  const [name, setName] = useState(APP_CONFIGS.claude.defaultName);
  const [models, setModels] = useState(DEFAULT_MODELS.claude);
  const [submitting, setSubmitting] = useState(false);
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
  }, [modelOptions]);

  useEffect(() => {
    if (visible) {
      const nextApp = inferredApp || 'claude';
      setApp(nextApp);
      setModels(DEFAULT_MODELS[nextApp] || DEFAULT_MODELS.claude);
      setServerAddress(getServerAddress().replace(/\/$/, ''));
      setName(
        buildProviderName(
          tokenRecord?.group,
          APP_CONFIGS[nextApp].defaultName,
        ),
      );
    }
  }, [visible, inferredApp, tokenRecord]);

  const handleAppChange = (val) => {
    setApp(val);
    setName(buildProviderName(tokenRecord?.group, APP_CONFIGS[val].defaultName));
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
  }, [
    app,
    currentDefaults,
    models,
    serverAddress,
  ]);

  const deepLinkPreview = useMemo(
    () => JSON.stringify(
      {
        resource: 'provider',
        app,
        name: name || buildProviderName(tokenRecord?.group, currentConfig.defaultName),
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
      try {
        const tokenKey = await fetchTokenKeyById(tokenRecord.id);
        setServerAddress(getServerAddress().replace(/\/$/, ''));
        const url = buildCCSwitchURL(app, name, models, `sk-${tokenKey}`);
        window.open(url, '_blank');
        onClose();
      } catch (error) {
        Toast.error(error?.message || t('获取令牌密钥失败'));
      } finally {
        setSubmitting(false);
      }
    })();
  };

  const fieldLabelStyle = useMemo(
    () => ({
      marginBottom: 4,
      fontSize: 13,
      color: 'var(--semi-color-text-1)',
    }),
    [],
  );

  return (
    <Modal
      title={t('填入 CC Switch')}
      visible={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      okButtonProps={{ loading: submitting }}
      cancelButtonProps={{ disabled: submitting }}
      okText={t('打开 CC Switch')}
      cancelText={t('取消')}
      maskClosable={false}
      width={480}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {inferredApp ? (
          <div>
            <div style={fieldLabelStyle}>{t('导入类型')}</div>
            <Typography.Text>
              {t('已根据分组自动识别为')} {APP_CONFIGS[inferredApp].label}
            </Typography.Text>
            <Typography.Text type='tertiary' style={{ display: 'block' }}>
              {t('当前令牌分组')}: {tokenRecord?.group || '-'}
            </Typography.Text>
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
            <Typography.Text type='tertiary' style={{ display: 'block', marginTop: 6 }}>
              {t('当前分组未明确指向 Claude 或 Codex，请手动选择导入类型')}
            </Typography.Text>
          </div>
        )}

        <div>
          <div style={fieldLabelStyle}>{t('名称')}</div>
          <Input
            value={name}
            onChange={setName}
            placeholder={buildProviderName(tokenRecord?.group, currentConfig.defaultName)}
          />
          <Typography.Text type='tertiary' style={{ display: 'block', marginTop: 6 }}>
            {t('建议使用供应商名来区分来源，例如 FishXCode (claude)')}
          </Typography.Text>
        </div>

        {currentConfig.modelFields.map((field) => (
          <div key={field.key}>
            <div style={fieldLabelStyle}>
              {t(field.label)}
              {field.key === 'model' && (
                <Typography.Text type='danger'> *</Typography.Text>
              )}
            </div>
            <Select
              placeholder={t('请选择模型')}
              optionList={mergedModelOptions}
              value={models[field.key] || currentDefaults[field.key] || undefined}
              onChange={(val) => handleModelChange(field.key, val)}
              filter={selectFilter}
              style={{ width: '100%' }}
              showClear
              searchable
              emptyContent={t('暂无数据')}
            />
            {field.key === 'model' && recommendedModels.length > 0 ? (
              <Typography.Text
                type='tertiary'
                style={{ display: 'block', marginTop: 6 }}
              >
                {t('推荐模型')}: {recommendedModels.join(' / ')}
              </Typography.Text>
            ) : null}
          </div>
        ))}

        <div>
          <div style={fieldLabelStyle}>{t('导入预览')}</div>
          <div
            style={{
              padding: 12,
              borderRadius: 12,
              background: 'var(--semi-color-fill-0)',
              border: '1px solid var(--semi-color-border)',
            }}
          >
            <Typography.Text type='tertiary' style={{ display: 'block', marginBottom: 8 }}>
              {t('下面分开展示 Deep Link 参数和实际写入 config 的内容。Claude 使用当前站点地址，不额外追加 /v1；Codex 保持 OpenAI 兼容地址。')}
            </Typography.Text>
            <div style={{ marginBottom: 12 }}>
              <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
                {t('Deep Link 参数')}
              </Typography.Text>
              <TextArea
                value={deepLinkPreview}
                autosize={{ minRows: 4, maxRows: 8 }}
                readOnly
              />
            </div>
            <Typography.Text strong style={{ display: 'block', marginBottom: 6 }}>
              {t('Config 内容')}
            </Typography.Text>
            <TextArea
              value={configPreview}
              autosize={{ minRows: 10, maxRows: 18 }}
              readOnly
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
