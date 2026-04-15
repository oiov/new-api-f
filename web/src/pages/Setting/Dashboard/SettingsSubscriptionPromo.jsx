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

import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Switch, Typography } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../../helpers';

const SettingsSubscriptionPromo = ({ options, refresh }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [form, setForm] = useState({
    badgeLeft: '',
    badgeRight: '',
    title: '',
    subtitle: '',
    buttonText: '',
    buttonLink: '',
  });

  const hasChanges = useMemo(() => {
    const enabledStr = options['console_setting.subscription_promo_enabled'];
    const enabledFromOptions =
      enabledStr === undefined
        ? true
        : enabledStr === true || enabledStr === 'true';

    const normalize = (v) => String(v ?? '').trim();

    return (
      enabled !== enabledFromOptions ||
      normalize(form.badgeLeft) !==
        normalize(options['console_setting.subscription_promo_badge_left']) ||
      normalize(form.badgeRight) !==
        normalize(options['console_setting.subscription_promo_badge_right']) ||
      normalize(form.title) !==
        normalize(options['console_setting.subscription_promo_title']) ||
      normalize(form.subtitle) !==
        normalize(options['console_setting.subscription_promo_subtitle']) ||
      normalize(form.buttonText) !==
        normalize(options['console_setting.subscription_promo_button_text']) ||
      normalize(form.buttonLink) !==
        normalize(options['console_setting.subscription_promo_button_link'])
    );
  }, [enabled, form, options]);

  const handleSave = async () => {
    try {
      setLoading(true);
      const res = await API.put('/api/option/batch', [
        {
          key: 'console_setting.subscription_promo_enabled',
          value: enabled ? 'true' : 'false',
        },
        {
          key: 'console_setting.subscription_promo_badge_left',
          value: String(form.badgeLeft || '').trim(),
        },
        {
          key: 'console_setting.subscription_promo_badge_right',
          value: String(form.badgeRight || '').trim(),
        },
        {
          key: 'console_setting.subscription_promo_title',
          value: String(form.title || '').trim(),
        },
        {
          key: 'console_setting.subscription_promo_subtitle',
          value: String(form.subtitle || '').trim(),
        },
        {
          key: 'console_setting.subscription_promo_button_text',
          value: String(form.buttonText || '').trim(),
        },
        {
          key: 'console_setting.subscription_promo_button_link',
          value: String(form.buttonLink || '').trim(),
        },
      ]);
      const { success, message } = res.data;
      if (!success) {
        throw new Error(message || t('保存失败'));
      }
      showSuccess(t('购买引导横幅已更新'));
      if (refresh) refresh();
    } catch (error) {
      showError(error?.message || t('保存失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const enabledStr = options['console_setting.subscription_promo_enabled'];
    setEnabled(
      enabledStr === undefined
        ? true
        : enabledStr === true || enabledStr === 'true',
    );
  }, [options['console_setting.subscription_promo_enabled']]);

  useEffect(() => {
    setForm({
      badgeLeft: options['console_setting.subscription_promo_badge_left'] ?? '',
      badgeRight: options['console_setting.subscription_promo_badge_right'] ?? '',
      title: options['console_setting.subscription_promo_title'] ?? '',
      subtitle: options['console_setting.subscription_promo_subtitle'] ?? '',
      buttonText: options['console_setting.subscription_promo_button_text'] ?? '',
      buttonLink: options['console_setting.subscription_promo_button_link'] ?? '',
    });
  }, [
    options['console_setting.subscription_promo_badge_left'],
    options['console_setting.subscription_promo_badge_right'],
    options['console_setting.subscription_promo_title'],
    options['console_setting.subscription_promo_subtitle'],
    options['console_setting.subscription_promo_button_text'],
    options['console_setting.subscription_promo_button_link'],
  ]);

  return (
    <div className='space-y-3'>
      <div className='flex items-start justify-between gap-3'>
        <div>
          <Typography.Title heading={6} className='!mb-1'>
            {t('购买引导横幅')}
          </Typography.Title>
          <Typography.Text type='tertiary'>
            {t('控制台首页展示的套餐购买引导横幅，可配置开关、文案与跳转链接。')}
          </Typography.Text>
        </div>
        <div className='flex items-center gap-2'>
          <Typography.Text type='tertiary'>{t('启用')}</Typography.Text>
          <Switch checked={enabled} onChange={(v) => setEnabled(!!v)} />
        </div>
      </div>

      <Form layout='vertical'>
        <Form.Input
          field='badgeLeft'
          label={t('左侧徽标文案')}
          placeholder={t('留空使用默认文案')}
          value={form.badgeLeft}
          onChange={(v) => setForm((prev) => ({ ...prev, badgeLeft: v }))}
        />
        <Form.Input
          field='badgeRight'
          label={t('右侧徽标文案')}
          placeholder={t('留空使用默认文案')}
          value={form.badgeRight}
          onChange={(v) => setForm((prev) => ({ ...prev, badgeRight: v }))}
        />
        <Form.Input
          field='title'
          label={t('标题')}
          placeholder={t('留空使用默认文案')}
          value={form.title}
          onChange={(v) => setForm((prev) => ({ ...prev, title: v }))}
        />
        <Form.TextArea
          field='subtitle'
          label={t('副标题')}
          placeholder={t('留空使用默认文案')}
          value={form.subtitle}
          onChange={(v) => setForm((prev) => ({ ...prev, subtitle: v }))}
          autosize={{ minRows: 2, maxRows: 6 }}
        />
        <Form.Input
          field='buttonText'
          label={t('按钮文案')}
          placeholder={t('留空使用默认文案')}
          value={form.buttonText}
          onChange={(v) => setForm((prev) => ({ ...prev, buttonText: v }))}
        />
        <Form.Input
          field='buttonLink'
          label={t('按钮链接')}
          placeholder={t('例如 /pricing?currency=CNY 或 https://example.com/pricing')}
          value={form.buttonLink}
          onChange={(v) => setForm((prev) => ({ ...prev, buttonLink: v }))}
        />
      </Form>

      <div className='flex items-center justify-end gap-2'>
        <Button
          type='primary'
          theme='solid'
          loading={loading}
          disabled={!hasChanges}
          onClick={handleSave}
        >
          {t('保存')}
        </Button>
      </div>
    </div>
  );
};

export default SettingsSubscriptionPromo;
