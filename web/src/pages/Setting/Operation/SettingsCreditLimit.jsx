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

import React, { useEffect, useState, useRef } from 'react';
import { Button, Col, Form, Row, Spin } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import {
  compareObjects,
  API,
  showError,
  showSuccess,
  showWarning,
} from '../../../helpers';

export default function SettingsCreditLimit(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState({
    QuotaForNewUser: '',
    SubscriptionPlanForNewUser: '0',
    PreConsumedQuota: '',
    QuotaForInviter: '',
    SubscriptionPlanForInviter: '0',
    QuotaForInvitee: '',
    SubscriptionPlanForInvitee: '0',
    InviteRewardLimitWindowMinutes: '1440',
    InviteRewardMaxCountPerInviter: '10',
    InviteRewardMaxCountPerIP: '3',
    InviteRewardMaxCountPerInviterIP: '1',
    AffiliateCommissionEnabled: false,
    AffiliateCommissionDefaultRate: '10',
    AffiliateCommissionSettlementMode: 'quota',
    AffiliateCommissionScope: 'all_paid_orders',
    AffiliateCommissionMinOrderMoney: '0',
    AffiliateCommissionMaxQuotaPerOrder: '0',
    AffiliateCommissionIncludeTopup: true,
    AffiliateCommissionIncludeSubscription: true,
    'quota_setting.enable_free_model_pre_consume': true,
  });
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const refForm = useRef();
  const [inputsRow, setInputsRow] = useState(inputs);

  const loadSubscriptionPlans = async () => {
    try {
      const res = await API.get('/api/subscription/admin/plans');
      if (res.data?.success) {
        setSubscriptionPlans(res.data.data || []);
      }
    } catch (error) {
      showError(t('订阅套餐加载失败'));
    }
  };

  function onSubmit() {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) return showWarning(t('你似乎并没有修改什么'));
    const requestQueue = updateArray.map((item) => {
      let value = '';
      if (typeof inputs[item.key] === 'boolean') {
        value = String(inputs[item.key]);
      } else {
        value = inputs[item.key];
      }
      return API.put('/api/option/', {
        key: item.key,
        value,
      });
    });
    setLoading(true);
    Promise.all(requestQueue)
      .then((res) => {
        if (requestQueue.length === 1) {
          if (res.includes(undefined)) return;
        } else if (requestQueue.length > 1) {
          if (res.includes(undefined))
            return showError(t('部分保存失败，请重试'));
        }
        showSuccess(t('保存成功'));
        props.refresh();
      })
      .catch(() => {
        showError(t('保存失败，请重试'));
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    loadSubscriptionPlans();
  }, []);

  useEffect(() => {
    const currentInputs = {
      SubscriptionPlanForNewUser: '0',
      SubscriptionPlanForInviter: '0',
      SubscriptionPlanForInvitee: '0',
      InviteRewardLimitWindowMinutes: '1440',
      InviteRewardMaxCountPerInviter: '10',
      InviteRewardMaxCountPerIP: '3',
      InviteRewardMaxCountPerInviterIP: '1',
      AffiliateCommissionEnabled: false,
      AffiliateCommissionDefaultRate: '10',
      AffiliateCommissionSettlementMode: 'quota',
      AffiliateCommissionScope: 'all_paid_orders',
      AffiliateCommissionMinOrderMoney: '0',
      AffiliateCommissionMaxQuotaPerOrder: '0',
      AffiliateCommissionIncludeTopup: true,
      AffiliateCommissionIncludeSubscription: true,
      'quota_setting.enable_free_model_pre_consume': true,
    };
    for (let key in props.options) {
      if (Object.keys(inputs).includes(key)) {
        currentInputs[key] = props.options[key];
      }
    }
    setInputs(currentInputs);
    setInputsRow(structuredClone(currentInputs));
    refForm.current.setValues(currentInputs);
  }, [props.options]);
  return (
    <>
      <Spin spinning={loading}>
        <Form
          values={inputs}
          getFormApi={(formAPI) => (refForm.current = formAPI)}
          style={{ marginBottom: 15 }}
        >
          <Form.Section text={t('额度设置')}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('新用户初始额度')}
                  field={'QuotaForNewUser'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  placeholder={''}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForNewUser: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('请求预扣费额度')}
                  field={'PreConsumedQuota'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={t('请求结束后多退少补')}
                  placeholder={''}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      PreConsumedQuota: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.InputNumber
                  label={t('邀请新用户奖励额度')}
                  field={'QuotaForInviter'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={''}
                  placeholder={t('例如：2000')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForInviter: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Select
                  label={t('邀请人赠送订阅套餐')}
                  field={'SubscriptionPlanForInviter'}
                  placeholder={t('不赠送套餐')}
                  optionList={[
                    { label: t('不赠送套餐'), value: '0' },
                    ...(subscriptionPlans || []).map((item) => ({
                      label: `${item?.plan?.title || `#${item?.plan?.id}`} (#${item?.plan?.id})`,
                      value: String(item?.plan?.id || 0),
                    })),
                  ]}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      SubscriptionPlanForInviter: String(value || '0'),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Select
                  label={t('新用户注册赠送订阅套餐')}
                  field={'SubscriptionPlanForNewUser'}
                  placeholder={t('不赠送套餐')}
                  optionList={[
                    { label: t('不赠送套餐'), value: '0' },
                    ...(subscriptionPlans || []).map((item) => ({
                      label: `${item?.plan?.title || `#${item?.plan?.id}`} (#${item?.plan?.id})`,
                      value: String(item?.plan?.id || 0),
                    })),
                  ]}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      SubscriptionPlanForNewUser: String(value || '0'),
                    })
                  }
                />
              </Col>
            </Row>
            <Row>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.InputNumber
                  label={t('新用户使用邀请码奖励额度')}
                  field={'QuotaForInvitee'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={''}
                  placeholder={t('例如：1000')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      QuotaForInvitee: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={8}>
                <Form.Select
                  label={t('被邀请人赠送订阅套餐')}
                  field={'SubscriptionPlanForInvitee'}
                  placeholder={t('不赠送套餐')}
                  optionList={[
                    { label: t('不赠送套餐'), value: '0' },
                    ...(subscriptionPlans || []).map((item) => ({
                      label: `${item?.plan?.title || `#${item?.plan?.id}`} (#${item?.plan?.id})`,
                      value: String(item?.plan?.id || 0),
                    })),
                  ]}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      SubscriptionPlanForInvitee: String(value || '0'),
                    })
                  }
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.InputNumber
                  label={t('邀请奖励统计窗口')}
                  field={'InviteRewardLimitWindowMinutes'}
                  step={1}
                  min={0}
                  suffix={t('分钟')}
                  extraText={t('0 表示不限制，默认 1440 分钟')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      InviteRewardLimitWindowMinutes: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.InputNumber
                  label={t('单邀请人窗口内最大奖励次数')}
                  field={'InviteRewardMaxCountPerInviter'}
                  step={1}
                  min={0}
                  extraText={t('超过后继续允许注册，但不再发放邀请奖励')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      InviteRewardMaxCountPerInviter: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.InputNumber
                  label={t('单 IP 窗口内最大奖励次数')}
                  field={'InviteRewardMaxCountPerIP'}
                  step={1}
                  min={0}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      InviteRewardMaxCountPerIP: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.InputNumber
                  label={t('单邀请人同 IP 最大奖励次数')}
                  field={'InviteRewardMaxCountPerInviterIP'}
                  step={1}
                  min={0}
                  extraText={t('建议保持 1，能明显抑制同一网络环境批量刷邀请')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      InviteRewardMaxCountPerInviterIP: String(value),
                    })
                  }
                />
              </Col>
            </Row>
            <Row>
              <Col>
                <Form.Switch
                  label={t('对免费模型启用预消耗')}
                  field={'quota_setting.enable_free_model_pre_consume'}
                  extraText={t(
                    '开启后，对免费模型（倍率为0，或者价格为0）的模型也会预消耗额度',
                  )}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      'quota_setting.enable_free_model_pre_consume': value,
                    })
                  }
                />
              </Col>
            </Row>
          </Form.Section>
          <Form.Section text={t('分佣设置')}>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.Switch
                  label={t('启用订单分佣')}
                  field={'AffiliateCommissionEnabled'}
                  extraText={t('邀请用户完成符合条件的在线订单后，邀请人获得推广额度')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AffiliateCommissionEnabled: value,
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.InputNumber
                  label={t('默认分佣比例')}
                  field={'AffiliateCommissionDefaultRate'}
                  step={0.1}
                  min={0}
                  max={100}
                  suffix={'%'}
                  placeholder={t('例如：10')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AffiliateCommissionDefaultRate: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.Select
                  label={t('分佣范围')}
                  field={'AffiliateCommissionScope'}
                  optionList={[
                    { label: t('所有符合条件订单'), value: 'all_paid_orders' },
                    { label: t('仅被邀请人首笔订单'), value: 'first_paid_order' },
                  ]}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AffiliateCommissionScope: value || 'all_paid_orders',
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.Input
                  label={t('结算方式')}
                  field={'AffiliateCommissionSettlementMode'}
                  disabled
                  extraText={t('当前仅支持站内推广额度，提现能力预留')}
                />
              </Col>
            </Row>
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.Switch
                  label={t('余额充值参与分佣')}
                  field={'AffiliateCommissionIncludeTopup'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AffiliateCommissionIncludeTopup: value,
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.Switch
                  label={t('自动发货套餐参与分佣')}
                  field={'AffiliateCommissionIncludeSubscription'}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AffiliateCommissionIncludeSubscription: value,
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.InputNumber
                  label={t('最低订单金额')}
                  field={'AffiliateCommissionMinOrderMoney'}
                  step={0.01}
                  min={0}
                  extraText={t('低于该金额的订单不发放分佣')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AffiliateCommissionMinOrderMoney: String(value),
                    })
                  }
                />
              </Col>
              <Col xs={24} sm={12} md={8} lg={8} xl={6}>
                <Form.InputNumber
                  label={t('单笔分佣额度上限')}
                  field={'AffiliateCommissionMaxQuotaPerOrder'}
                  step={1}
                  min={0}
                  suffix={'Token'}
                  extraText={t('0 表示不限制')}
                  onChange={(value) =>
                    setInputs({
                      ...inputs,
                      AffiliateCommissionMaxQuotaPerOrder: String(value),
                    })
                  }
                />
              </Col>
            </Row>

            <Row>
              <Button size='default' onClick={onSubmit}>
                {t('保存额度设置')}
              </Button>
            </Row>
          </Form.Section>
        </Form>
      </Spin>
    </>
  );
}
