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

import React, { useEffect, useRef, useState } from 'react';
import { Banner, Button, Col, Form, Row, Spin, Typography } from '@douyinfe/semi-ui';
import { API, showError, showSuccess, showWarning, toBoolean } from '../../../helpers';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

const buildPaymentNotifyInputs = (options = {}) => ({
  'payment_notify_setting.TopUpEnabled': toBoolean(
    options['payment_notify_setting.TopUpEnabled'],
  ),
  'payment_notify_setting.SubscriptionEnabled': toBoolean(
    options['payment_notify_setting.SubscriptionEnabled'],
  ),
  'payment_notify_setting.ServerChanEnabled': toBoolean(
    options['payment_notify_setting.ServerChanEnabled'] ?? true,
  ),
  'payment_notify_setting.ServerChanUID':
    options['payment_notify_setting.ServerChanUID'] || '',
  'payment_notify_setting.ServerChanSendKey':
    options['payment_notify_setting.ServerChanSendKey'] || '',
  'payment_notify_setting.PushPlusEnabled': toBoolean(
    options['payment_notify_setting.PushPlusEnabled'],
  ),
  'payment_notify_setting.PushPlusToken':
    options['payment_notify_setting.PushPlusToken'] || '',
});

export default function SettingsPaymentSuccessNotify(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearServerChanSendKey, setClearServerChanSendKey] = useState(false);
  const [clearPushPlusToken, setClearPushPlusToken] = useState(false);
  const [inputs, setInputs] = useState(buildPaymentNotifyInputs());
  const formApiRef = useRef(null);

  useEffect(() => {
    if (!props.options || !formApiRef.current) return;
    const currentInputs = buildPaymentNotifyInputs(props.options);
    setInputs(currentInputs);
    setClearServerChanSendKey(false);
    setClearPushPlusToken(false);
    formApiRef.current.setValues(currentInputs);
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs((prev) => ({ ...prev, ...values }));
  };

  const renderSecretStatus = (maskedValue, pendingValue, clearFlag) => {
    let content = t('当前数据库未保存');
    if (maskedValue) {
      content = `${t('当前已保存')}：${maskedValue}`;
    }
    if (clearFlag) {
      content = t('保存后将清空已保存的值');
    } else if (pendingValue) {
      content = t('已填写新值，保存后生效');
    }

    return (
      <Text type='tertiary' style={{ display: 'block', marginTop: 4 }}>
        {content}
      </Text>
    );
  };

  const maskedServerChanSendKey =
    props.options?.['payment_notify_setting.ServerChanSendKey'] || '';
  const maskedPushPlusToken =
    props.options?.['payment_notify_setting.PushPlusToken'] || '';

  const normalizeSecretValue = (fieldValue, maskedValue, clearFlag) => {
    if (clearFlag) {
      return '';
    }
    const trimmedValue = String(fieldValue || '').trim();
    const trimmedMaskedValue = String(maskedValue || '').trim();
    if (trimmedValue === '' || trimmedValue === trimmedMaskedValue) {
      return '';
    }
    return trimmedValue;
  };

  const submitPaymentNotifySetting = async () => {
    if (
      clearServerChanSendKey &&
      inputs['payment_notify_setting.ServerChanSendKey']
    ) {
      showWarning(t('已勾选清空 Server酱³ SendKey，保存时会忽略当前输入框内容'));
    }
    if (clearPushPlusToken && inputs['payment_notify_setting.PushPlusToken']) {
      showWarning(t('已勾选清空 PushPlus Token，保存时会忽略当前输入框内容'));
    }
    setLoading(true);
    try {
      const res = await API.put('/api/payment_notify/', {
        top_up_enabled: inputs['payment_notify_setting.TopUpEnabled'],
        subscription_enabled:
          inputs['payment_notify_setting.SubscriptionEnabled'],
        server_chan_enabled: inputs['payment_notify_setting.ServerChanEnabled'],
        server_chan_uid: inputs['payment_notify_setting.ServerChanUID'] || '',
        server_chan_send_key: normalizeSecretValue(
          inputs['payment_notify_setting.ServerChanSendKey'],
          maskedServerChanSendKey,
          clearServerChanSendKey,
        ),
        clear_server_chan_send_key: clearServerChanSendKey,
        push_plus_enabled: inputs['payment_notify_setting.PushPlusEnabled'],
        push_plus_token: normalizeSecretValue(
          inputs['payment_notify_setting.PushPlusToken'],
          maskedPushPlusToken,
          clearPushPlusToken,
        ),
        clear_push_plus_token: clearPushPlusToken,
      });
      if (!res?.data?.success) {
        showError(res?.data?.message || t('更新失败'));
        return;
      }
      showSuccess(t('更新成功'));
      setClearServerChanSendKey(false);
      setClearPushPlusToken(false);
      if (res?.data?.data && formApiRef.current) {
        const nextInputs = buildPaymentNotifyInputs(res.data.data);
        setInputs(nextInputs);
        formApiRef.current.setValues(nextInputs);
      }
      props.refresh?.();
    } catch (error) {
      showError(t('更新失败'));
    } finally {
      setLoading(false);
    }
  };

  const testPaymentNotifySetting = async () => {
    setTesting(true);
    try {
      const res = await API.post(
        '/api/payment_notify/test',
        {
          top_up_enabled: inputs['payment_notify_setting.TopUpEnabled'],
          subscription_enabled:
            inputs['payment_notify_setting.SubscriptionEnabled'],
          server_chan_enabled: inputs['payment_notify_setting.ServerChanEnabled'],
          server_chan_uid: inputs['payment_notify_setting.ServerChanUID'] || '',
          server_chan_send_key: normalizeSecretValue(
            inputs['payment_notify_setting.ServerChanSendKey'],
            maskedServerChanSendKey,
            clearServerChanSendKey,
          ),
          clear_server_chan_send_key: clearServerChanSendKey,
          push_plus_enabled: inputs['payment_notify_setting.PushPlusEnabled'],
          push_plus_token: normalizeSecretValue(
            inputs['payment_notify_setting.PushPlusToken'],
            maskedPushPlusToken,
            clearPushPlusToken,
          ),
          clear_push_plus_token: clearPushPlusToken,
        },
        {
          skipErrorHandler: true,
        },
      );
      if (res?.data?.success) {
        showSuccess(t('测试发送成功，请检查推送渠道'));
      } else {
        showError(res?.data?.message || t('测试发送失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || t('测试发送失败'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <Spin spinning={loading}>
      <Form
        initValues={inputs}
        values={inputs}
        onValueChange={handleFormChange}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Form.Section text={t('支付成功推送')}>
          <Text>
            {t('可分别控制充值成功和套餐购买成功通知。敏感信息保存后不会回显到前端。')}
          </Text>
          <Banner
            type='info'
            description={t(
              '建议至少启用一个通知类型和一个推送通道，否则不会发送支付成功通知。',
            )}
          />
          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Switch
                field='payment_notify_setting.TopUpEnabled'
                label={t('启用充值成功通知')}
                checkedText={t('开关开')}
                uncheckedText={t('开关关')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Switch
                field='payment_notify_setting.SubscriptionEnabled'
                label={t('启用套餐购买成功通知')}
                checkedText={t('开关开')}
                uncheckedText={t('开关关')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Switch
                field='payment_notify_setting.ServerChanEnabled'
                label={t('启用 Server酱³')}
                checkedText={t('开关开')}
                uncheckedText={t('开关关')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Switch
                field='payment_notify_setting.PushPlusEnabled'
                label={t('启用 PushPlus')}
                checkedText={t('开关开')}
                uncheckedText={t('开关关')}
              />
            </Col>
          </Row>
          <Row
            gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
            style={{ marginTop: 16 }}
          >
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='payment_notify_setting.ServerChanUID'
                label={t('Server酱³ UID')}
                placeholder={t('例如：5435')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='payment_notify_setting.ServerChanSendKey'
                label={t('Server酱³ SendKey')}
                placeholder={t('请输入新的 SendKey，留空则保持已保存值')}
                type='password'
              />
              {renderSecretStatus(
                maskedServerChanSendKey,
                inputs['payment_notify_setting.ServerChanSendKey'],
                clearServerChanSendKey,
              )}
              <Form.Switch
                field='clear_server_chan_send_key'
                checked={clearServerChanSendKey}
                onChange={(checked) => setClearServerChanSendKey(Boolean(checked))}
                label={t('清空已保存的 Server酱³ SendKey')}
                checkedText={t('开关开')}
                uncheckedText={t('开关关')}
              />
            </Col>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Input
                field='payment_notify_setting.PushPlusToken'
                label={t('PushPlus Token')}
                placeholder={t('请输入新的 Token，留空则保持已保存值')}
                type='password'
              />
              {renderSecretStatus(
                maskedPushPlusToken,
                inputs['payment_notify_setting.PushPlusToken'],
                clearPushPlusToken,
              )}
              <Form.Switch
                field='clear_push_plus_token'
                checked={clearPushPlusToken}
                onChange={(checked) => setClearPushPlusToken(Boolean(checked))}
                label={t('清空已保存的 PushPlus Token')}
                checkedText={t('开关开')}
                uncheckedText={t('开关关')}
              />
            </Col>
          </Row>
          <div style={{ display: 'flex', gap: 12 }}>
            <Button onClick={submitPaymentNotifySetting}>
              {t('更新支付成功推送设置')}
            </Button>
            <Button
              theme='solid'
              type='tertiary'
              loading={testing}
              onClick={testPaymentNotifySetting}
            >
              {testing ? t('测试发送中...') : t('测试发送')}
            </Button>
          </div>
        </Form.Section>
      </Form>
    </Spin>
  );
}
