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

export default function SettingsPaymentSuccessNotify(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearServerChanSendKey, setClearServerChanSendKey] = useState(false);
  const [clearPushPlusToken, setClearPushPlusToken] = useState(false);
  const [inputs, setInputs] = useState({
    'payment_notify_setting.Enabled': false,
    'payment_notify_setting.ServerChanEnabled': true,
    'payment_notify_setting.ServerChanUID': '',
    'payment_notify_setting.ServerChanSendKey': '',
    'payment_notify_setting.PushPlusEnabled': false,
    'payment_notify_setting.PushPlusToken': '',
  });
  const formApiRef = useRef(null);

  useEffect(() => {
    if (!props.options || !formApiRef.current) return;
    const currentInputs = {
      'payment_notify_setting.Enabled': toBoolean(
        props.options['payment_notify_setting.Enabled'],
      ),
      'payment_notify_setting.ServerChanEnabled': toBoolean(
        props.options['payment_notify_setting.ServerChanEnabled'] ?? true,
      ),
      'payment_notify_setting.ServerChanUID':
        props.options['payment_notify_setting.ServerChanUID'] || '',
      'payment_notify_setting.ServerChanSendKey': '',
      'payment_notify_setting.PushPlusEnabled': toBoolean(
        props.options['payment_notify_setting.PushPlusEnabled'],
      ),
      'payment_notify_setting.PushPlusToken': '',
    };
    setInputs(currentInputs);
    setClearServerChanSendKey(false);
    setClearPushPlusToken(false);
    formApiRef.current.setValues(currentInputs);
  }, [props.options]);

  const handleFormChange = (values) => {
    setInputs(values);
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
      const options = [
        {
          key: 'payment_notify_setting.Enabled',
          value: inputs['payment_notify_setting.Enabled'] ? 'true' : 'false',
        },
        {
          key: 'payment_notify_setting.ServerChanEnabled',
          value: inputs['payment_notify_setting.ServerChanEnabled'] ? 'true' : 'false',
        },
        {
          key: 'payment_notify_setting.ServerChanUID',
          value: inputs['payment_notify_setting.ServerChanUID'] || '',
        },
        {
          key: 'payment_notify_setting.PushPlusEnabled',
          value: inputs['payment_notify_setting.PushPlusEnabled'] ? 'true' : 'false',
        },
      ];

      if (clearServerChanSendKey) {
        options.push({
          key: 'payment_notify_setting.ServerChanSendKey',
          value: '',
        });
      } else if (inputs['payment_notify_setting.ServerChanSendKey']) {
        options.push({
          key: 'payment_notify_setting.ServerChanSendKey',
          value: inputs['payment_notify_setting.ServerChanSendKey'],
        });
      }
      if (clearPushPlusToken) {
        options.push({
          key: 'payment_notify_setting.PushPlusToken',
          value: '',
        });
      } else if (inputs['payment_notify_setting.PushPlusToken']) {
        options.push({
          key: 'payment_notify_setting.PushPlusToken',
          value: inputs['payment_notify_setting.PushPlusToken'],
        });
      }

      const results = await Promise.all(
        options.map((opt) =>
          API.put('/api/option/', {
            key: opt.key,
            value: opt.value,
          }),
        ),
      );
      const errorResults = results.filter((res) => !res.data.success);
      if (errorResults.length > 0) {
        errorResults.forEach((res) => showError(res.data.message));
        return;
      }
      showSuccess(t('更新成功'));
      setClearServerChanSendKey(false);
      setClearPushPlusToken(false);
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
          enabled: inputs['payment_notify_setting.Enabled'],
          server_chan_enabled: inputs['payment_notify_setting.ServerChanEnabled'],
          server_chan_uid: inputs['payment_notify_setting.ServerChanUID'] || '',
          server_chan_send_key:
            clearServerChanSendKey
              ? ''
              : inputs['payment_notify_setting.ServerChanSendKey'] || '',
          push_plus_enabled: inputs['payment_notify_setting.PushPlusEnabled'],
          push_plus_token: clearPushPlusToken
            ? ''
            : inputs['payment_notify_setting.PushPlusToken'] || '',
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
        onValueChange={handleFormChange}
        getFormApi={(api) => (formApiRef.current = api)}
      >
        <Form.Section text={t('充值成功推送')}>
          <Text>
            {t('仅在充值成功后发送通知，不包含套餐购买。敏感信息保存后不会回显到前端。')}
          </Text>
          <Banner
            type='info'
            description={t(
              '建议至少启用一个通道。若总开关关闭，则不会发送任何充值成功推送。',
            )}
          />
          <Row gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}>
            <Col xs={24} sm={24} md={8} lg={8} xl={8}>
              <Form.Switch
                field='payment_notify_setting.Enabled'
                label={t('启用充值成功推送')}
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
                placeholder={t('保存后不回显')}
                type='password'
              />
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
                placeholder={t('保存后不回显')}
                type='password'
              />
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
              {t('更新充值成功推送设置')}
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
