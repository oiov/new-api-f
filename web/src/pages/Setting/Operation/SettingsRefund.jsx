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

import React, { useEffect, useState } from 'react';
import { Banner, Button, Form, Space, Typography, TextArea } from '@douyinfe/semi-ui';
import { API, showError, showSuccess, verifyJSON } from '../../../helpers';
import { useTranslation } from 'react-i18next';

const DEFAULT_REFUND_SETTINGS_EXAMPLE = JSON.stringify(
  {
    page_enabled: true,
    enabled: true,
    allow_balance_refund: true,
    allow_original_payment_refund: true,
    settlement_mode: 'duration_ratio',
    currency: 'USD',
    codex_input_price_per_million: 3,
    codex_output_price_per_million: 15,
    codex_cache_read_price_per_million: 0.3,
    codex_cache_write_price_per_million: 3.75,
    notes:
      'Codex 套餐如需按 token 用量折算退款，请维护每 100 万 token 的标准单价；当前也可先作为审核参考。',
  },
  null,
  2,
);

const DEFAULT_CAMPAIGN_EXAMPLE = JSON.stringify(
  {
    enabled: true,
    key: 'default-self-service-subscription-conversion',
    title: '套餐自助折算活动',
    subtitle: '提交申请后先禁用原套餐，审核通过后折算为账户余额',
    description:
      '管理员可在这里维护可参与退款/折算的套餐活动规则、截止时间与展示文案。',
    deadline: 0,
    timezone: 'Asia/Shanghai',
    require_disabled_plan: true,
    eligible_plan_ids: [],
    eligible_upgrade_groups: ['claude_sub'],
    eligible_title_keywords: ['Claude', 'claude'],
    conversion_rule:
      '返还余额 = 套餐折算基价 - 套餐折算基价 / 周期天数 × 计费天数；其中计费天数 = 已使用整天数 + 0.5 天。',
    billing_rules: [],
    charge_rules: [],
  },
  null,
  2,
);

export default function SettingsRefund({ options, refresh }) {
  const { t } = useTranslation();
  const [refundSettings, setRefundSettings] = useState('');
  const [campaignSettings, setCampaignSettings] = useState('');
  const [refundSettingsMissing, setRefundSettingsMissing] = useState(false);
  const [campaignSettingsMissing, setCampaignSettingsMissing] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const refundRaw = options.SubscriptionRefundSettings;
    if (refundRaw === undefined || refundRaw === '') {
      setRefundSettings('');
      setRefundSettingsMissing(true);
    } else {
      setRefundSettingsMissing(false);
      try {
        setRefundSettings(JSON.stringify(JSON.parse(refundRaw), null, 2));
      } catch {
        setRefundSettings(refundRaw);
      }
    }

    const campaignRaw = options.SelfServiceSubscriptionConversionCampaign;
    if (campaignRaw === undefined || campaignRaw === '') {
      setCampaignSettings('');
      setCampaignSettingsMissing(true);
    } else {
      setCampaignSettingsMissing(false);
      try {
        setCampaignSettings(JSON.stringify(JSON.parse(campaignRaw), null, 2));
      } catch {
        setCampaignSettings(campaignRaw);
      }
    }
  }, [options]);

  const handleFormat = (value, setter) => {
    if (!verifyJSON(value)) {
      showError(t('不是合法的 JSON 字符串'));
      return;
    }
    setter(JSON.stringify(JSON.parse(value), null, 2));
  };

  const handleSave = async () => {
    if (!verifyJSON(refundSettings) || !verifyJSON(campaignSettings)) {
      showError(t('不是合法的 JSON 字符串'));
      return;
    }

    try {
      setLoading(true);
      const res = await API.put('/api/option/batch', [
        {
          key: 'SubscriptionRefundSettings',
          value: refundSettings,
        },
        {
          key: 'SelfServiceSubscriptionConversionCampaign',
          value: campaignSettings,
        },
      ]);
      if (res.data.success) {
        showSuccess(t('保存成功'));
        refresh?.();
      } else {
        showError(res.data.message || t('保存失败，请重试'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || error.message || t('保存失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Form.Section
      text={t('退款设置')}
      extraText={t('集中维护 Codex 套餐退款按量基数和套餐折算活动配置')}
    >
      <Banner
        type='warning'
        closeIcon={null}
        description={t(
          '这里统一控制退款页是否对用户开放、允许退到余额还是原支付方式，以及 Codex 每 100 万 token 的退款基准单价。',
        )}
        style={{ marginBottom: 16 }}
      />

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        {t('退款基数 JSON')}
      </Typography.Text>
      {refundSettingsMissing ? (
        <Banner
          type='info'
          closeIcon={null}
          description={t(
            '当前数据库中还没有已保存的退款配置。下面展示为空；占位内容仅为参考模板，填写后点击保存设置才会生效。',
          )}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      <TextArea
        value={refundSettings}
        onChange={setRefundSettings}
        autosize={{ minRows: 12 }}
        placeholder={DEFAULT_REFUND_SETTINGS_EXAMPLE}
      />
      <Typography.Text type='tertiary' style={{ display: 'block', marginTop: 8 }}>
        {t(
          '建议至少维护 page_enabled、allow_balance_refund、allow_original_payment_refund、settlement_mode、currency，以及 Codex 输入/输出每 100 万 token 的标准单价。',
        )}
      </Typography.Text>

      <Typography.Text
        strong
        style={{ display: 'block', marginTop: 20, marginBottom: 8 }}
      >
        {t('套餐折算活动 JSON')}
      </Typography.Text>
      {campaignSettingsMissing ? (
        <Banner
          type='info'
          closeIcon={null}
          description={t(
            '当前数据库中还没有已保存的套餐折算活动配置。下面展示为空；占位内容仅为参考模板，填写后点击保存设置才会生效。',
          )}
          style={{ marginBottom: 12 }}
        />
      ) : null}
      <TextArea
        value={campaignSettings}
        onChange={setCampaignSettings}
        autosize={{ minRows: 16 }}
        placeholder={DEFAULT_CAMPAIGN_EXAMPLE}
      />
      <Typography.Text type='tertiary' style={{ display: 'block', marginTop: 8 }}>
        {t(
          '这部分对应前台退款页和用户自助折算预览，支持维护活动标题、截止时间、命中套餐范围、规则文案等。',
        )}
      </Typography.Text>

      <div style={{ marginTop: 12 }}>
        <Space>
          <Button theme='light' onClick={() => handleFormat(refundSettings, setRefundSettings)}>
            {t('格式化退款 JSON')}
          </Button>
          <Button theme='light' onClick={() => handleFormat(campaignSettings, setCampaignSettings)}>
            {t('格式化活动 JSON')}
          </Button>
          <Button type='primary' loading={loading} onClick={handleSave}>
            {t('保存设置')}
          </Button>
        </Space>
      </div>
    </Form.Section>
  );
}
