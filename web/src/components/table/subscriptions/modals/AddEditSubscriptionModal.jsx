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
import dayjs from 'dayjs';
import {
  Avatar,
  Button,
  Card,
  Col,
  Form,
  Row,
  Select,
  SideSheet,
  Space,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconCalendarClock,
  IconClose,
  IconCreditCard,
  IconDelete,
  IconPlus,
  IconSave,
} from '@douyinfe/semi-icons';
import { Clock, RefreshCw } from 'lucide-react';
import {
  API,
  buildGroupOptions,
  renderGroupOption,
  showError,
  showSuccess,
} from '../../../../helpers';
import {
  quotaToDisplayAmount,
  displayAmountToQuota,
} from '../../../../helpers/quota';
import {
  formatSubscriptionCustomSeconds,
  formatSubscriptionResetFixedTime,
  formatSubscriptionResetHint,
  formatSubscriptionResourceLabel,
  getSubscriptionResourceType,
} from '../../../../helpers/subscriptionFormat';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';

const { Text, Title } = Typography;

function deriveResetCustomFields(seconds) {
  const value = Number(seconds || 0);
  if (value >= 86400 && value % 86400 === 0) {
    return { quota_reset_custom_value: value / 86400, quota_reset_custom_unit: 'day' };
  }
  if (value >= 3600 && value % 3600 === 0) {
    return { quota_reset_custom_value: value / 3600, quota_reset_custom_unit: 'hour' };
  }
  if (value >= 60 && value % 60 === 0) {
    return { quota_reset_custom_value: value / 60, quota_reset_custom_unit: 'minute' };
  }
  return { quota_reset_custom_value: Math.max(value, 1), quota_reset_custom_unit: 'second' };
}

function composeResetCustomSeconds(value, unit) {
  const amount = Number(value || 0);
  if (amount <= 0) return 0;
  if (unit === 'day') return amount * 86400;
  if (unit === 'hour') return amount * 3600;
  if (unit === 'minute') return amount * 60;
  return amount;
}

function deriveResetFixedFields(seconds) {
  const value = Math.max(0, Math.min(Number(seconds || 0), 24 * 3600 - 1));
  return {
    quota_reset_fixed_hour: Math.floor(value / 3600),
    quota_reset_fixed_minute: Math.floor((value % 3600) / 60),
    quota_reset_fixed_second: value % 60,
  };
}

function composeResetFixedSeconds(hour, minute, second) {
  const normalizedHour = Math.max(0, Math.min(Number(hour || 0), 23));
  const normalizedMinute = Math.max(0, Math.min(Number(minute || 0), 59));
  const normalizedSecond = Math.max(0, Math.min(Number(second || 0), 59));
  return normalizedHour * 3600 + normalizedMinute * 60 + normalizedSecond;
}

function normalizeDeliveryField(field = {}, index = 0) {
  return {
    key: String(field.key || '').trim(),
    label: String(field.label || '').trim(),
    type: field.type || 'text',
    required: Boolean(field.required),
    masked: Boolean(field.masked),
    copyable: field.copyable !== false,
    sort_order: Number(field.sort_order || index + 1),
    placeholder: String(field.placeholder || '').trim(),
  };
}

const AddEditSubscriptionModal = ({
  visible,
  handleClose,
  editingPlan,
  placement = 'left',
  refresh,
  t,
}) => {
  const durationUnitOptions = [
    { value: 'year', label: t('年') },
    { value: 'month', label: t('月') },
    { value: 'week', label: t('周') },
    { value: 'day', label: t('日') },
    { value: 'hour', label: t('小时') },
    { value: 'custom', label: t('自定义(秒)') },
  ];

  const resourceTypeOptions = [
    { value: 'quota', label: t('按额度') },
    { value: 'request_count', label: t('按次数') },
  ];
  const deliveryModeOptions = [
    { value: 'auto_activate', label: t('自动开通') },
    { value: 'manual_delivery', label: t('人工发放') },
  ];
  const deliveryFieldTypeOptions = [
    { value: 'text', label: t('文本') },
    { value: 'password', label: t('密码') },
    { value: 'url', label: t('链接') },
    { value: 'email', label: t('邮箱') },
    { value: 'textarea', label: t('多行文本') },
  ];

  const resetPeriodOptions = [
    { value: 'never', label: t('不重置') },
    { value: 'daily', label: t('每天') },
    { value: 'weekly', label: t('每周') },
    { value: 'monthly', label: t('每月') },
    { value: 'yearly', label: t('每年') },
    { value: 'custom', label: t('自定义(秒)') },
  ];
  const resetTimingModeOptions = [
    { value: 'activation', label: t('按激活时间滚动') },
    { value: 'fixed_clock', label: t('固定时刻重置') },
  ];
  const resetCustomUnitOptions = [
    { value: 'day', label: t('天') },
    { value: 'hour', label: t('小时') },
    { value: 'minute', label: t('分钟') },
    { value: 'second', label: t('秒') },
  ];

  const [loading, setLoading] = useState(false);
  const [groupOptions, setGroupOptions] = useState([]);
  const [modelOptions, setModelOptions] = useState([]);
  const [vendorOptions, setVendorOptions] = useState([]);
  const [groupLoading, setGroupLoading] = useState(false);
  const [modelLoading, setModelLoading] = useState(false);
  const [vendorLoading, setVendorLoading] = useState(false);
  const isMobile = useIsMobile();
  const formApiRef = useRef(null);
  const linkageStateRef = useRef({
    resourceType: undefined,
    resetPeriod: undefined,
  });
  const isEdit = editingPlan?.plan?.id !== undefined;
  const formKey = isEdit ? `edit-${editingPlan?.plan?.id}` : 'create';

  const getInitValues = () => ({
    title: '',
    subtitle: '',
    price_amount: 0,
    discount_price_amount: 0,
    discount_deadline: null,
    currency: 'USD',
    duration_unit: 'month',
    duration_value: 1,
    custom_seconds: 0,
    quota_reset_period: 'never',
    quota_reset_custom_seconds: 0,
    quota_reset_custom_value: 1,
    quota_reset_custom_unit: 'day',
    quota_reset_use_fixed_clock: false,
    quota_reset_fixed_seconds: 0,
    quota_reset_timing_mode: 'activation',
    quota_reset_fixed_hour: 8,
    quota_reset_fixed_minute: 0,
    quota_reset_fixed_second: 0,
    enabled: true,
    sort_order: 0,
    max_purchase_per_user: 0,
    sale_limit_count: 0,
    sold_count: 0,
    resource_type: 'quota',
    total_amount: 0,
    request_count_total: 0,
    request_count_period_total: 0,
    upgrade_group: '',
    allowed_groups: [],
    allowed_models: [],
    allowed_vendor_ids: [],
    delivery_mode: 'auto_activate',
    delivery_field_schema: [],
    stripe_price_id: '',
    creem_product_id: '',
  });

  const buildFormValues = () => {
    const base = getInitValues();
    if (editingPlan?.plan?.id === undefined) return base;
    const p = editingPlan.plan || {};
    const resetCustomFields = deriveResetCustomFields(
      Number(p.quota_reset_custom_seconds || 0),
    );
    const resetFixedFields = deriveResetFixedFields(
      Number(p.quota_reset_fixed_seconds || 0),
    );
    return {
      ...base,
      ...resetCustomFields,
      ...resetFixedFields,
      title: p.title || '',
      subtitle: p.subtitle || '',
      price_amount: Number(p.price_amount || 0),
      discount_price_amount: Number(p.discount_price_amount || 0),
      discount_deadline: p.discount_deadline
        ? dayjs(Number(p.discount_deadline) * 1000).toDate()
        : null,
      currency: 'USD',
      duration_unit: p.duration_unit || 'month',
      duration_value: Number(p.duration_value || 1),
      custom_seconds: Number(p.custom_seconds || 0),
      quota_reset_period: p.quota_reset_period || 'never',
      quota_reset_custom_seconds: Number(p.quota_reset_custom_seconds || 0),
      quota_reset_use_fixed_clock: Boolean(p.quota_reset_use_fixed_clock),
      quota_reset_fixed_seconds: Number(p.quota_reset_fixed_seconds || 0),
      quota_reset_timing_mode: p.quota_reset_use_fixed_clock
        ? 'fixed_clock'
        : 'activation',
      enabled: p.enabled !== false,
      sort_order: Number(p.sort_order || 0),
      max_purchase_per_user: Number(p.max_purchase_per_user || 0),
      sale_limit_count: Number(p.sale_limit_count || 0),
      sold_count: Number(p.sold_count || 0),
      resource_type: getSubscriptionResourceType(p),
      total_amount: Number(
        quotaToDisplayAmount(p.total_amount || 0).toFixed(2),
      ),
      request_count_total: Number(p.request_count_total || 0),
      request_count_period_total: Number(p.request_count_period_total || 0),
      upgrade_group: p.upgrade_group || '',
      allowed_groups: Array.isArray(p.allowed_groups) ? p.allowed_groups : [],
      allowed_models: Array.isArray(p.allowed_models) ? p.allowed_models : [],
      allowed_vendor_ids: Array.isArray(p.allowed_vendor_ids)
        ? p.allowed_vendor_ids.map((id) => Number(id)).filter((id) => id > 0)
        : [],
      delivery_mode: p.delivery_mode || 'auto_activate',
      delivery_field_schema: Array.isArray(p.delivery_field_schema)
        ? p.delivery_field_schema.map((item, index) =>
            normalizeDeliveryField(item, index),
          )
        : [],
      stripe_price_id: p.stripe_price_id || '',
      creem_product_id: p.creem_product_id || '',
    };
  };

  useEffect(() => {
    if (!visible) return;
    const initialValues = buildFormValues();
    linkageStateRef.current = {
      resourceType: initialValues.resource_type || 'quota',
      resetPeriod: initialValues.quota_reset_period || 'never',
    };
    setGroupLoading(true);
    setModelLoading(true);
    setVendorLoading(true);
    Promise.allSettled([
      API.get('/api/group'),
      API.get('/api/models/?page_size=1000'),
      API.get('/api/vendors/?page_size=1000'),
    ])
      .then(([groupRes, modelRes, vendorRes]) => {
        if (groupRes.status === 'fulfilled' && groupRes.value.data?.success) {
          setGroupOptions(buildGroupOptions(groupRes.value.data?.data || []));
        } else {
          setGroupOptions([]);
        }

        if (modelRes.status === 'fulfilled' && modelRes.value.data?.success) {
          const items =
            modelRes.value.data?.data?.items || modelRes.value.data?.data || [];
          setModelOptions(Array.isArray(items) ? items : []);
        } else {
          setModelOptions([]);
        }

        if (vendorRes.status === 'fulfilled' && vendorRes.value.data?.success) {
          const items =
            vendorRes.value.data?.data?.items ||
            vendorRes.value.data?.data ||
            [];
          setVendorOptions(Array.isArray(items) ? items : []);
        } else {
          setVendorOptions([]);
        }
      })
      .finally(() => {
        setGroupLoading(false);
        setModelLoading(false);
        setVendorLoading(false);
      });
  }, [visible]);

  const handleFormValueChange = (values) => {
    const nextResourceType = values.resource_type || 'quota';
    const nextResetPeriod = values.quota_reset_period || 'never';
    const previous = linkageStateRef.current;
    const nextValues = {};
    const nextCustomSeconds = composeResetCustomSeconds(
      values.quota_reset_custom_value,
      values.quota_reset_custom_unit,
    );
    const nextFixedSeconds = composeResetFixedSeconds(
      values.quota_reset_fixed_hour,
      values.quota_reset_fixed_minute,
      values.quota_reset_fixed_second,
    );
    const supportsFixedClock =
      nextResetPeriod !== 'never' && nextResetPeriod !== 'custom';
    const nextUseFixedClock =
      supportsFixedClock && values.quota_reset_timing_mode === 'fixed_clock';

    if (previous.resourceType !== nextResourceType) {
      if (nextResourceType === 'quota') {
        if (Number(values.request_count_total || 0) !== 0) {
          nextValues.request_count_total = 0;
        }
        if (Number(values.request_count_period_total || 0) !== 0) {
          nextValues.request_count_period_total = 0;
        }
      } else if (Number(values.total_amount || 0) !== 0) {
        nextValues.total_amount = 0;
      }
    }

    if (
      previous.resetPeriod !== nextResetPeriod &&
      nextResetPeriod === 'never' &&
      nextResourceType === 'request_count' &&
      Number(values.request_count_period_total || 0) !== 0
    ) {
      nextValues.request_count_period_total = 0;
    }

    if (
      nextResetPeriod === 'custom' &&
      Number(values.quota_reset_custom_seconds || 0) !== nextCustomSeconds
    ) {
      nextValues.quota_reset_custom_seconds = nextCustomSeconds;
    }

    if (
      previous.resetPeriod !== nextResetPeriod &&
      nextResetPeriod !== 'custom' &&
      Number(values.quota_reset_custom_seconds || 0) !== 0
    ) {
      nextValues.quota_reset_custom_seconds = 0;
    }

    if (
      (!supportsFixedClock || !nextUseFixedClock) &&
      (values.quota_reset_use_fixed_clock ||
        Number(values.quota_reset_fixed_seconds || 0) !== 0)
    ) {
      nextValues.quota_reset_use_fixed_clock = false;
      nextValues.quota_reset_fixed_seconds = 0;
      if (values.quota_reset_timing_mode !== 'activation') {
        nextValues.quota_reset_timing_mode = 'activation';
      }
    } else if (nextUseFixedClock) {
      if (!values.quota_reset_use_fixed_clock) {
        nextValues.quota_reset_use_fixed_clock = true;
      }
      if (Number(values.quota_reset_fixed_seconds || 0) !== nextFixedSeconds) {
        nextValues.quota_reset_fixed_seconds = nextFixedSeconds;
      }
    }

    linkageStateRef.current = {
      resourceType: nextResourceType,
      resetPeriod: nextResetPeriod,
    };

    if (Object.keys(nextValues).length > 0) {
      formApiRef.current?.setValues({
        ...values,
        ...nextValues,
      });
    }
  };

  const submit = async (values) => {
    const resourceType = values.resource_type || 'quota';
    const isQuotaPlan = resourceType === 'quota';
    const isRequestCountPlan = resourceType === 'request_count';
    const hasResetWindow = (values.quota_reset_period || 'never') !== 'never';
    const supportsFixedClock =
      hasResetWindow && values.quota_reset_period !== 'custom';
    const useFixedClock =
      supportsFixedClock && values.quota_reset_timing_mode === 'fixed_clock';

    if (!values.title || values.title.trim() === '') {
      showError(t('套餐标题不能为空'));
      return;
    }
    if (Number(values.sold_count || 0) < 0) {
      showError(t('已售数量不能为负数'));
      return;
    }
    if (
      Number(values.sale_limit_count || 0) > 0 &&
      Number(values.sold_count || 0) > Number(values.sale_limit_count || 0)
    ) {
      showError(t('已售数量不能大于可购买总数'));
      return;
    }
    if (isQuotaPlan && Number(values.total_amount || 0) <= 0) {
      showError(t('额度套餐必须设置可用额度'));
      return;
    }
    if (isRequestCountPlan) {
      if (
        Number(values.request_count_total || 0) <= 0 &&
        (!hasResetWindow || Number(values.request_count_period_total || 0) <= 0)
      ) {
        showError(
          hasResetWindow
            ? t('次数套餐至少需要设置总次数或周期次数之一')
            : t('次数套餐必须设置总次数'),
        );
        return;
      }
    }
    if (
      hasResetWindow &&
      isRequestCountPlan &&
      Number(values.request_count_period_total || 0) <= 0 &&
      Number(values.request_count_total || 0) <= 0
    ) {
      showError(t('开启重置后，周期次数或总次数至少需要填写一项'));
      return;
    }
    if (
      values.quota_reset_period === 'custom' &&
      composeResetCustomSeconds(
        values.quota_reset_custom_value,
        values.quota_reset_custom_unit,
      ) < 60
    ) {
      showError(t('自定义重置周期需大于等于60秒'));
      return;
    }
    if (
      useFixedClock &&
      composeResetFixedSeconds(
        values.quota_reset_fixed_hour,
        values.quota_reset_fixed_minute,
        values.quota_reset_fixed_second,
      ) >=
        24 * 3600
    ) {
      showError(t('固定重置时刻不合法'));
      return;
    }
    const deliveryMode = values.delivery_mode || 'auto_activate';
    const deliveryFieldSchema = Array.isArray(values.delivery_field_schema)
      ? values.delivery_field_schema
          .map((item, index) => normalizeDeliveryField(item, index))
          .filter((item) => item.key && item.label)
      : [];
    if (deliveryMode === 'manual_delivery' && deliveryFieldSchema.length === 0) {
      showError(t('人工发放套餐至少需要配置一个交付字段'));
      return;
    }
    setLoading(true);
    try {
      const normalizedTotalAmount = isQuotaPlan
        ? displayAmountToQuota(values.total_amount)
        : 0;
      const normalizedRequestCountTotal = isRequestCountPlan
        ? Number(values.request_count_total || 0)
        : 0;
      const normalizedRequestCountPeriodTotal =
        isRequestCountPlan && hasResetWindow
          ? Number(values.request_count_period_total || 0)
          : 0;

      const payload = {
        plan: {
          ...values,
          price_amount: Number(values.price_amount || 0),
          discount_price_amount: Number(values.discount_price_amount || 0),
          discount_deadline: values.discount_deadline
            ? Math.floor(new Date(values.discount_deadline).getTime() / 1000)
            : 0,
          currency: 'USD',
          duration_value: Number(values.duration_value || 0),
          custom_seconds: Number(values.custom_seconds || 0),
          quota_reset_period: values.quota_reset_period || 'never',
          quota_reset_custom_seconds:
            values.quota_reset_period === 'custom'
              ? composeResetCustomSeconds(
                  values.quota_reset_custom_value,
                  values.quota_reset_custom_unit,
                )
              : 0,
          quota_reset_use_fixed_clock: useFixedClock,
          quota_reset_fixed_seconds: useFixedClock
            ? composeResetFixedSeconds(
                values.quota_reset_fixed_hour,
                values.quota_reset_fixed_minute,
                values.quota_reset_fixed_second,
              )
            : 0,
          sort_order: Number(values.sort_order || 0),
          max_purchase_per_user: Number(values.max_purchase_per_user || 0),
          sale_limit_count: Number(values.sale_limit_count || 0),
          sold_count: Number(values.sold_count || 0),
          resource_type: resourceType,
          total_amount: normalizedTotalAmount,
          request_count_total: normalizedRequestCountTotal,
          request_count_period_total: normalizedRequestCountPeriodTotal,
          upgrade_group: values.upgrade_group || '',
          allowed_groups: Array.isArray(values.allowed_groups)
            ? values.allowed_groups
            : [],
          allowed_models: Array.isArray(values.allowed_models)
            ? values.allowed_models
            : [],
          allowed_vendor_ids: Array.isArray(values.allowed_vendor_ids)
            ? values.allowed_vendor_ids
                .map((id) => Number(id))
                .filter((id) => id > 0)
            : [],
          delivery_mode: deliveryMode,
          delivery_field_schema: deliveryFieldSchema,
        },
      };
      if (editingPlan?.plan?.id) {
        const res = await API.put(
          `/api/subscription/admin/plans/${editingPlan.plan.id}`,
          payload,
        );
        if (res.data?.success) {
          showSuccess(t('更新成功'));
          handleClose();
          refresh?.();
        } else {
          showError(res.data?.message || t('更新失败'));
        }
      } else {
        const res = await API.post('/api/subscription/admin/plans', payload);
        if (res.data?.success) {
          showSuccess(t('创建成功'));
          handleClose();
          refresh?.();
        } else {
          showError(res.data?.message || t('创建失败'));
        }
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <SideSheet
        placement={placement}
        title={
          <Space>
            {isEdit ? (
              <Tag color='blue' shape='circle'>
                {t('更新')}
              </Tag>
            ) : (
              <Tag color='green' shape='circle'>
                {t('新建')}
              </Tag>
            )}
            <Title heading={4} className='m-0'>
              {isEdit ? t('更新套餐信息') : t('创建新的订阅套餐')}
            </Title>
          </Space>
        }
        bodyStyle={{ padding: '0' }}
        visible={visible}
        width={isMobile ? '100%' : 600}
        footer={
          <div className='flex justify-end bg-white'>
            <Space>
              <Button
                theme='solid'
                onClick={() => formApiRef.current?.submitForm()}
                icon={<IconSave />}
                loading={loading}
              >
                {t('提交')}
              </Button>
              <Button
                theme='light'
                type='primary'
                onClick={handleClose}
                icon={<IconClose />}
              >
                {t('取消')}
              </Button>
            </Space>
          </div>
        }
        closeIcon={null}
        onCancel={handleClose}
      >
        <Spin spinning={loading}>
          <Form
            key={formKey}
            initValues={buildFormValues()}
            getFormApi={(api) => (formApiRef.current = api)}
            onValueChange={handleFormValueChange}
            onSubmit={submit}
          >
            {({ values }) => {
              const resourceType = values.resource_type || 'quota';
              const isQuotaPlan = resourceType === 'quota';
              const isRequestCountPlan = resourceType === 'request_count';
              const hasResetWindow =
                (values.quota_reset_period || 'never') !== 'never';
              const requestCountFieldLabel = formatSubscriptionResourceLabel(
                {
                  resource_type: 'request_count',
                  quota_reset_period: values.quota_reset_period,
                },
                t,
              );
              const amountFieldLabel = formatSubscriptionResourceLabel(
                {
                  resource_type: 'quota',
                  quota_reset_period: values.quota_reset_period,
                },
                t,
              );
              const resetPreviewPlan = {
                quota_reset_period: values.quota_reset_period,
                quota_reset_custom_seconds:
                  values.quota_reset_period === 'custom'
                    ? composeResetCustomSeconds(
                        values.quota_reset_custom_value,
                        values.quota_reset_custom_unit,
                      )
                    : 0,
                quota_reset_use_fixed_clock:
                  values.quota_reset_period !== 'never' &&
                  values.quota_reset_period !== 'custom' &&
                  values.quota_reset_timing_mode === 'fixed_clock',
                quota_reset_fixed_seconds:
                  values.quota_reset_period !== 'never' &&
                  values.quota_reset_period !== 'custom' &&
                  values.quota_reset_timing_mode === 'fixed_clock'
                    ? composeResetFixedSeconds(
                        values.quota_reset_fixed_hour,
                        values.quota_reset_fixed_minute,
                        values.quota_reset_fixed_second,
                      )
                    : 0,
              };

              return (
                <div className='p-2'>
                  {/* 基本信息 */}
                  <Card className='!rounded-2xl shadow-sm border-0 mb-4'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='blue'
                        className='mr-2 shadow-md'
                      >
                        <IconCalendarClock size={16} />
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('基本信息')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('套餐的基本信息和定价')}
                        </div>
                      </div>
                    </div>

                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Input
                          field='title'
                          label={t('套餐标题')}
                          placeholder={t('例如：基础套餐')}
                          required
                          rules={[
                            { required: true, message: t('请输入套餐标题') },
                          ]}
                          showClear
                        />
                      </Col>

                      <Col span={24}>
                        <Form.Input
                          field='subtitle'
                          label={t('套餐副标题')}
                          placeholder={t('例如：适合轻度使用')}
                          showClear
                        />
                      </Col>

                      <Col span={12}>
                        <Form.Select
                          field='resource_type'
                          label={t('权益类型')}
                          required
                          rules={[{ required: true }]}
                        >
                          {resourceTypeOptions.map((o) => (
                            <Select.Option key={o.value} value={o.value}>
                              {o.label}
                            </Select.Option>
                          ))}
                        </Form.Select>
                      </Col>

                      <Col span={12}>
                        <Form.InputNumber
                          field='price_amount'
                          label={t('原价')}
                          required
                          min={0}
                          precision={2}
                          rules={[{ required: true, message: t('请输入金额') }]}
                          style={{ width: '100%' }}
                        />
                      </Col>

                      <Col span={12}>
                        <Form.InputNumber
                          field='discount_price_amount'
                          label={t('优惠价格')}
                          min={0}
                          precision={2}
                          extraText={t('0 表示不启用限时优惠')}
                          style={{ width: '100%' }}
                        />
                      </Col>

                      <Col span={24}>
                        <Form.DatePicker
                          field='discount_deadline'
                          label={t('优惠截止时间')}
                          type='dateTime'
                          showClear
                          insetLabel={t('截止')}
                          extraText={t(
                            '仅当优惠价格大于 0 且截止时间晚于当前时间时，前台才会展示并按优惠价结算',
                          )}
                          style={{ width: '100%' }}
                        />
                      </Col>

                      {isRequestCountPlan && hasResetWindow && (
                        <Col span={12}>
                          <Form.InputNumber
                            field='request_count_period_total'
                            label={t('周期次数上限')}
                            min={0}
                            precision={0}
                            extraText={t(
                              '例如每日 500 次、每周 5000 次；0 表示当前周期不限',
                            )}
                            style={{ width: '100%' }}
                          />
                        </Col>
                      )}

                      {isRequestCountPlan && (
                        <Col span={12}>
                          <Form.InputNumber
                            field='request_count_total'
                            label={requestCountFieldLabel}
                            min={0}
                            precision={0}
                            extraText={
                              hasResetWindow
                                ? t(
                                    '这里表示整个有效期内的总次数上限，可与上面的周期次数同时生效；0 表示不限制。',
                                  )
                                : t(
                                    '必须填写总次数，表示整个有效期内的可用次数',
                                  )
                            }
                            style={{ width: '100%' }}
                          />
                        </Col>
                      )}

                      {isQuotaPlan && (
                        <Col span={12}>
                          <Form.InputNumber
                            field='total_amount'
                            label={amountFieldLabel}
                            min={0}
                            precision={2}
                            extraText={`${
                              hasResetWindow
                                ? t(
                                    '设置了重置周期后，这里表示每个重置周期内可用的额度。',
                                  )
                                : t('额度套餐必须填写可用额度')
                            } · ${t('原生额度')}：${displayAmountToQuota(values.total_amount)}`}
                            style={{ width: '100%' }}
                          />
                        </Col>
                      )}

                      <Col span={12}>
                        <Form.Select
                          field='upgrade_group'
                          label={t('升级分组')}
                          showClear
                          loading={groupLoading}
                          placeholder={t('不升级')}
                          optionList={[
                            {
                              label: t('不升级'),
                              value: '',
                              fullLabel: t('不升级'),
                            },
                            ...groupOptions,
                          ]}
                          renderOptionItem={renderGroupOption}
                          extraText={t(
                            '购买或手动新增订阅会升级到该分组；当套餐失效/过期或手动作废/删除后，将回退到升级前分组。回退不会立即生效，通常会有几分钟延迟。',
                          )}
                        />
                      </Col>

                      <Col span={12}>
                        <Form.Input
                          field='currency'
                          label={t('币种')}
                          disabled
                          extraText={t('由全站货币展示设置统一控制')}
                        />
                      </Col>

                      <Col span={12}>
                        <Form.InputNumber
                          field='sort_order'
                          label={t('排序')}
                          precision={0}
                          style={{ width: '100%' }}
                        />
                      </Col>

                      <Col span={12}>
                        <Form.InputNumber
                          field='max_purchase_per_user'
                          label={t('购买上限')}
                          min={0}
                          precision={0}
                          extraText={t('0 表示不限')}
                          style={{ width: '100%' }}
                        />
                      </Col>

                      <Col span={12}>
                        <Form.InputNumber
                          field='sale_limit_count'
                          label={t('可购买总数')}
                          min={0}
                          precision={0}
                          extraText={t('0 表示不限')}
                          style={{ width: '100%' }}
                        />
                      </Col>

                      <Col span={12}>
                        <Form.InputNumber
                          field='sold_count'
                          label={t('已售数量')}
                          min={0}
                          precision={0}
                          extraText={
                            values.sale_limit_count > 0
                              ? t(
                                  '不能大于可购买总数，也不能低于实际已发放数量',
                                )
                              : t(
                                  '可手动维护历史已售数量，但不能低于实际已发放数量',
                                )
                          }
                          style={{ width: '100%' }}
                        />
                      </Col>

                      <Col span={12}>
                        <Form.Switch
                          field='enabled'
                          label={t('启用状态')}
                          size='large'
                        />
                      </Col>
                    </Row>
                  </Card>

                  {/* 有效期设置 */}
                  <Card className='!rounded-2xl shadow-sm border-0 mb-4'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='green'
                        className='mr-2 shadow-md'
                      >
                        <Clock size={16} />
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('有效期设置')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('配置套餐的有效时长')}
                        </div>
                      </div>
                    </div>

                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Select
                          field='duration_unit'
                          label={t('有效期单位')}
                          required
                          rules={[{ required: true }]}
                        >
                          {durationUnitOptions.map((o) => (
                            <Select.Option key={o.value} value={o.value}>
                              {o.label}
                            </Select.Option>
                          ))}
                        </Form.Select>
                      </Col>

                      <Col span={12}>
                        {values.duration_unit === 'custom' ? (
                          <Form.InputNumber
                            field='custom_seconds'
                            label={t('自定义秒数')}
                            required
                            min={1}
                            precision={0}
                            rules={[
                              { required: true, message: t('请输入秒数') },
                            ]}
                            style={{ width: '100%' }}
                          />
                        ) : (
                          <Form.InputNumber
                            field='duration_value'
                            label={t('有效期数值')}
                            required
                            min={1}
                            precision={0}
                            rules={[
                              { required: true, message: t('请输入数值') },
                            ]}
                            style={{ width: '100%' }}
                          />
                        )}
                      </Col>
                    </Row>
                  </Card>

                  {/* 使用范围 */}
                  <Card className='!rounded-2xl shadow-sm border-0 mb-4'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='cyan'
                        className='mr-2 shadow-md'
                      >
                        <Tag size='small'>#</Tag>
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('使用范围')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('可选限制该套餐仅能用于指定分组、模型或供应商')}
                        </div>
                      </div>
                    </div>

                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Select
                          field='allowed_groups'
                          label={t('可用分组')}
                          multiple
                          filter
                          showClear
                          loading={groupLoading}
                          placeholder={t('不限制分组')}
                          optionList={groupOptions}
                          renderOptionItem={renderGroupOption}
                          extraText={t('留空表示所有分组都可用')}
                        />
                      </Col>

                      <Col span={24}>
                        <Form.Select
                          field='allowed_models'
                          label={t('可用模型')}
                          multiple
                          filter
                          showClear
                          loading={modelLoading}
                          placeholder={t('不限制模型')}
                          extraText={t('留空表示所有模型都可用')}
                        >
                          {(modelOptions || []).map((item) => (
                            <Select.Option
                              key={item.id || item.model_name}
                              value={item.model_name}
                            >
                              {item.model_name}
                            </Select.Option>
                          ))}
                        </Form.Select>
                      </Col>

                      <Col span={24}>
                        <Form.Select
                          field='allowed_vendor_ids'
                          label={t('可用供应商')}
                          multiple
                          filter
                          showClear
                          loading={vendorLoading}
                          placeholder={t('不限制供应商')}
                          extraText={t('留空表示所有供应商都可用')}
                        >
                          {(vendorOptions || []).map((item) => (
                            <Select.Option
                              key={item.id}
                              value={Number(item.id)}
                            >
                              {item.name}
                            </Select.Option>
                          ))}
                        </Form.Select>
                      </Col>
                    </Row>
                  </Card>

                  <Card className='!rounded-2xl shadow-sm border-0 mb-4'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='violet'
                        className='mr-2 shadow-md'
                      >
                        <IconCreditCard size={16} />
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('交付方式')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('支持自动开通站内订阅，或改为付款后由管理员人工发放结构化信息')}
                        </div>
                      </div>
                    </div>

                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Select
                          field='delivery_mode'
                          label={t('交付模式')}
                          extraText={t(
                            '自动开通会在支付完成后立刻生成订阅；人工发放会保留订单并等待管理员填写交付信息。',
                          )}
                        >
                          {deliveryModeOptions.map((option) => (
                            <Select.Option
                              key={option.value}
                              value={option.value}
                            >
                              {option.label}
                            </Select.Option>
                          ))}
                        </Form.Select>
                      </Col>
                    </Row>

                    {values.delivery_mode === 'manual_delivery' ? (
                      <div className='mt-2 space-y-3'>
                        <div className='flex items-center justify-between rounded-xl bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:bg-violet-500/10 dark:text-violet-200'>
                          <span>
                            {t(
                              '购买此套餐后不会自动开通站内订阅，支付成功后会进入待人工发放队列。',
                            )}
                          </span>
                          <Button
                            theme='light'
                            type='primary'
                            size='small'
                            icon={<IconPlus />}
                            onClick={() => {
                              const currentFields = Array.isArray(
                                values.delivery_field_schema,
                              )
                                ? values.delivery_field_schema
                                : [];
                              formApiRef.current?.setValue(
                                'delivery_field_schema',
                                [
                                  ...currentFields,
                                  normalizeDeliveryField(
                                    {},
                                    currentFields.length,
                                  ),
                                ],
                              );
                            }}
                          >
                            {t('新增字段')}
                          </Button>
                        </div>

                        {(Array.isArray(values.delivery_field_schema)
                          ? values.delivery_field_schema
                          : []
                        ).map((field, index) => (
                          <div
                            key={`${field?.key || 'delivery'}-${index}`}
                            className='rounded-2xl border border-semi-color-border bg-semi-color-fill-0 p-3'
                          >
                            <div className='mb-3 flex items-center justify-between'>
                              <Text strong>
                                {t('交付字段')} #{index + 1}
                              </Text>
                              <Button
                                theme='borderless'
                                type='danger'
                                icon={<IconDelete />}
                                onClick={() => {
                                  const currentFields = Array.isArray(
                                    values.delivery_field_schema,
                                  )
                                    ? values.delivery_field_schema
                                    : [];
                                  formApiRef.current?.setValue(
                                    'delivery_field_schema',
                                    currentFields.filter(
                                      (_, currentIndex) =>
                                        currentIndex !== index,
                                    ),
                                  );
                                }}
                              />
                            </div>
                            <Row gutter={12}>
                              <Col span={12}>
                                <Form.Input
                                  field={`delivery_field_schema[${index}].label`}
                                  label={t('字段名称')}
                                  placeholder={t('例如：账号')}
                                />
                              </Col>
                              <Col span={12}>
                                <Form.Input
                                  field={`delivery_field_schema[${index}].key`}
                                  label={t('字段键名')}
                                  placeholder={t('例如：account')}
                                  extraText={t(
                                    '仅用于系统识别，建议使用英文小写和下划线。',
                                  )}
                                />
                              </Col>
                              <Col span={12}>
                                <Form.Select
                                  field={`delivery_field_schema[${index}].type`}
                                  label={t('字段类型')}
                                >
                                  {deliveryFieldTypeOptions.map((option) => (
                                    <Select.Option
                                      key={option.value}
                                      value={option.value}
                                    >
                                      {option.label}
                                    </Select.Option>
                                  ))}
                                </Form.Select>
                              </Col>
                              <Col span={12}>
                                <Form.Input
                                  field={`delivery_field_schema[${index}].placeholder`}
                                  label={t('占位提示')}
                                  placeholder={t('例如：请输入发放内容')}
                                />
                              </Col>
                              <Col span={8}>
                                <Form.InputNumber
                                  field={`delivery_field_schema[${index}].sort_order`}
                                  label={t('排序')}
                                  min={1}
                                  precision={0}
                                  style={{ width: '100%' }}
                                />
                              </Col>
                              <Col span={5}>
                                <Form.Switch
                                  field={`delivery_field_schema[${index}].required`}
                                  label={t('必填')}
                                  size='small'
                                />
                              </Col>
                              <Col span={5}>
                                <Form.Switch
                                  field={`delivery_field_schema[${index}].masked`}
                                  label={t('脱敏')}
                                  size='small'
                                />
                              </Col>
                              <Col span={6}>
                                <Form.Switch
                                  field={`delivery_field_schema[${index}].copyable`}
                                  label={t('可复制')}
                                  size='small'
                                />
                              </Col>
                            </Row>
                          </div>
                        ))}
                        {(values.delivery_field_schema || []).length === 0 ? (
                          <div className='rounded-xl border border-dashed border-semi-color-border bg-semi-color-fill-0 px-4 py-6 text-center text-sm text-semi-color-text-2'>
                            {t('暂未配置交付字段，至少需要一个字段供管理员发放')}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </Card>

                  {/* 权益重置 */}
                  <Card className='!rounded-2xl shadow-sm border-0 mb-4'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='orange'
                        className='mr-2 shadow-md'
                      >
                        <RefreshCw size={16} />
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {values.resource_type === 'request_count'
                            ? t('次数重置')
                            : t('额度重置')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {values.resource_type === 'request_count'
                            ? t('支持周期性重置套餐权益次数')
                            : t('支持周期性重置套餐权益额度')}
                        </div>
                      </div>
                    </div>

                    <Row gutter={12}>
                      <Col span={12}>
                        <Form.Select
                          field='quota_reset_period'
                          label={t('重置周期')}
                          extraText={t(
                            '设置每天/每周/每月/每年/自定义重置后，上面的次数/额度表示单个重置周期内可用值，并按购买生效时间滚动重置，不是整个有效期总量。',
                          )}
                        >
                          {resetPeriodOptions.map((o) => (
                            <Select.Option key={o.value} value={o.value}>
                              {o.label}
                            </Select.Option>
                          ))}
                        </Form.Select>
                      </Col>
                      <Col span={12}>
                        {values.quota_reset_period === 'custom' ? (
                          <div className='space-y-2'>
                            <Text>{t('滚动重置间隔')}</Text>
                            <div className='grid grid-cols-[1fr_120px] gap-2'>
                              <Form.InputNumber
                                field='quota_reset_custom_value'
                                noLabel
                                required
                                min={1}
                                precision={0}
                                rules={[
                                  { required: true, message: t('请输入间隔值') },
                                ]}
                                style={{ width: '100%' }}
                              />
                              <Form.Select field='quota_reset_custom_unit' noLabel>
                                {resetCustomUnitOptions.map((o) => (
                                  <Select.Option key={o.value} value={o.value}>
                                    {o.label}
                                  </Select.Option>
                                ))}
                              </Form.Select>
                            </div>
                            <Text type='tertiary' size='small'>
                              {t('当前换算为 {{duration}}', {
                                duration: formatSubscriptionCustomSeconds(
                                  composeResetCustomSeconds(
                                    values.quota_reset_custom_value,
                                    values.quota_reset_custom_unit,
                                  ),
                                  t,
                                ),
                              })}
                            </Text>
                          </div>
                        ) : hasResetWindow ? (
                          <div className='space-y-2'>
                            <Form.Select
                              field='quota_reset_timing_mode'
                              label={t('重置时机')}
                              extraText={t(
                                '不设置时默认按购买激活时间滚动重置；设置固定时刻后，会按购买激活周期落在该时刻重置。',
                              )}
                            >
                              {resetTimingModeOptions.map((o) => (
                                <Select.Option key={o.value} value={o.value}>
                                  {o.label}
                                </Select.Option>
                              ))}
                            </Form.Select>
                            {values.quota_reset_timing_mode === 'fixed_clock' ? (
                              <div className='space-y-2'>
                                <Text>{t('固定重置时刻')}</Text>
                                <div className='grid grid-cols-[1fr_1fr_1fr] gap-2'>
                                  <Form.InputNumber
                                    field='quota_reset_fixed_hour'
                                    noLabel
                                    min={0}
                                    max={23}
                                    precision={0}
                                    style={{ width: '100%' }}
                                    suffix={t('时')}
                                  />
                                  <Form.InputNumber
                                    field='quota_reset_fixed_minute'
                                    noLabel
                                    min={0}
                                    max={59}
                                    precision={0}
                                    style={{ width: '100%' }}
                                    suffix={t('分')}
                                  />
                                  <Form.InputNumber
                                    field='quota_reset_fixed_second'
                                    noLabel
                                    min={0}
                                    max={59}
                                    precision={0}
                                    style={{ width: '100%' }}
                                    suffix={t('秒')}
                                  />
                                </div>
                                <Text type='tertiary' size='small'>
                                  {t('当前固定时刻 {{time}}', {
                                    time: formatSubscriptionResetFixedTime(
                                      composeResetFixedSeconds(
                                        values.quota_reset_fixed_hour,
                                        values.quota_reset_fixed_minute,
                                        values.quota_reset_fixed_second,
                                      ),
                                    ),
                                  })}
                                </Text>
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <Form.InputNumber
                            field='quota_reset_custom_seconds'
                            label={t('自定义秒数')}
                            min={0}
                            precision={0}
                            style={{ width: '100%' }}
                            disabled
                          />
                        )}
                      </Col>
                    </Row>
                    {hasResetWindow && (
                      <div className='mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:bg-blue-500/10 dark:text-blue-200'>
                        {t('重置预览')}：{formatSubscriptionResetHint(resetPreviewPlan, t)}
                      </div>
                    )}
                  </Card>

                  {/* 第三方支付配置 */}
                  <Card className='!rounded-2xl shadow-sm border-0 mb-4'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='purple'
                        className='mr-2 shadow-md'
                      >
                        <IconCreditCard size={16} />
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('第三方支付配置')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('Stripe/Creem 商品ID（可选）')}
                        </div>
                      </div>
                    </div>

                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Input
                          field='stripe_price_id'
                          label={t('Stripe PriceId')}
                          placeholder={t('price_...')}
                          showClear
                        />
                      </Col>

                      <Col span={24}>
                        <Form.Input
                          field='creem_product_id'
                          label={t('Creem ProductId')}
                          placeholder={t('prod_...')}
                          showClear
                        />
                      </Col>
                    </Row>
                  </Card>
                </div>
              );
            }}
          </Form>
        </Spin>
      </SideSheet>
    </>
  );
};

export default AddEditSubscriptionModal;
