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

import React from 'react';
import {
  Button,
  Modal,
  Space,
  Tag,
  Typography,
  Popover,
  Divider,
  Badge,
} from '@douyinfe/semi-ui';
import { renderGroupTextWithDescription, renderQuota } from '../../../helpers';
import { convertUSDToCurrency } from '../../../helpers/render';
import {
  formatSubscriptionResourceLabel,
  formatSubscriptionResetHint,
  formatSubscriptionResetPeriod,
  getSubscriptionSaleSummary,
  getSubscriptionEffectivePrice,
  isSubscriptionDiscountActive,
} from '../../../helpers/subscriptionFormat';

const { Text } = Typography;

function hasRequestCountLimit(plan) {
  return Number(plan?.request_count_total || 0) > 0;
}

function hasAmountLimit(plan) {
  return Number(plan?.total_amount || 0) > 0;
}

function renderPlanLimits(plan, t) {
  const items = [];
  if (hasRequestCountLimit(plan)) {
    items.push(
      `${formatSubscriptionResourceLabel(
        {
          resource_type: 'request_count',
          quota_reset_period: plan?.quota_reset_period,
        },
        t,
      )} ${Number(plan?.request_count_total || 0)}`,
    );
  }
  if (hasAmountLimit(plan)) {
    items.push(
      `${formatSubscriptionResourceLabel(
        {
          resource_type: 'quota',
          quota_reset_period: plan?.quota_reset_period,
        },
        t,
      )} ${renderQuota(Number(plan?.total_amount || 0))}`,
    );
  }
  if (items.length === 0) {
    return t('不限');
  }
  return items.join(' / ');
}

function renderPlanSales(plan, t) {
  const saleSummary = getSubscriptionSaleSummary(plan);
  if (saleSummary.unlimited) {
    return `${t('已售')} ${saleSummary.soldCount}`;
  }
  return `${t('已售')} ${saleSummary.soldCount} / ${t('剩余')} ${saleSummary.remainingSaleCount}`;
}

function renderSalesCount(text, record, t) {
  const saleSummary = getSubscriptionSaleSummary(record?.plan);
  return (
    <div>
      <Text strong>{saleSummary.soldCount}</Text>
      <Text type='tertiary' size='small' style={{ display: 'block' }}>
        {saleSummary.unlimited
          ? t('不限量')
          : `${t('总量')} ${saleSummary.saleLimitCount}`}
      </Text>
    </div>
  );
}

function renderSalesDetail(text, record, t) {
  const saleSummary = getSubscriptionSaleSummary(record?.plan);
  const content = (
    <div style={{ width: 220 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: 8 }}>
        <Text type='tertiary'>{t('已售数量')}</Text>
        <Text strong>{saleSummary.soldCount}</Text>
        <Text type='tertiary'>{t('销售上限')}</Text>
        <Text>
          {saleSummary.unlimited ? t('不限') : saleSummary.saleLimitCount}
        </Text>
        <Text type='tertiary'>{t('剩余可售')}</Text>
        <Text>
          {saleSummary.unlimited ? t('不限') : saleSummary.remainingSaleCount}
        </Text>
        <Text type='tertiary'>{t('销售状态')}</Text>
        <Text>
          {saleSummary.unlimited
            ? t('不限量')
            : saleSummary.soldOut
              ? t('已售罄')
              : t('可售')}
        </Text>
      </div>
    </div>
  );

  return (
    <Popover content={content} position='top' showArrow>
      <Tag color={saleSummary.soldOut ? 'red' : 'blue'} shape='circle'>
        {saleSummary.unlimited
          ? t('不限量')
          : saleSummary.soldOut
            ? t('已售罄')
            : t('查看详情')}
      </Tag>
    </Popover>
  );
}

function formatDuration(plan, t) {
  if (!plan) return '';
  const u = plan.duration_unit || 'month';
  if (u === 'custom') {
    return `${t('自定义')} ${plan.custom_seconds || 0}s`;
  }
  const unitMap = {
    year: t('年'),
    month: t('月'),
    week: t('周'),
    day: t('日'),
    hour: t('小时'),
  };
  return `${plan.duration_value || 0}${unitMap[u] || u}`;
}

const renderPlanTitle = (text, record, t) => {
  const subtitle = record?.plan?.subtitle;
  const plan = record?.plan;
  const popoverContent = (
    <div style={{ width: 260 }}>
      <Text strong>{text}</Text>
      {subtitle && (
        <Text type='tertiary' style={{ display: 'block', marginTop: 4 }}>
          {subtitle}
        </Text>
      )}
      <Divider margin={12} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Text type='tertiary'>{t('价格')}</Text>
        <Text strong style={{ color: 'var(--semi-color-success)' }}>
          {convertUSDToCurrency(getSubscriptionEffectivePrice(plan), 2)}
        </Text>
        {isSubscriptionDiscountActive(plan) ? (
          <>
            <Text type='tertiary'>{t('原价')}</Text>
            <Text delete>
              {convertUSDToCurrency(Number(plan?.price_amount || 0), 2)}
            </Text>
            <Text type='tertiary'>{t('优惠截止')}</Text>
            <Text>
              {new Date(
                Number(plan?.discount_deadline || 0) * 1000,
              ).toLocaleString()}
            </Text>
          </>
        ) : null}
        <Text type='tertiary'>{t('套餐权益')}</Text>
        <Text>{renderPlanLimits(plan, t)}</Text>
        <Text type='tertiary'>{t('升级分组')}</Text>
        {plan?.upgrade_group ? (
          renderGroupTextWithDescription(plan.upgrade_group)
        ) : (
          <Text>{t('不升级')}</Text>
        )}
        <Text type='tertiary'>{t('购买上限')}</Text>
        <Text>
          {plan?.max_purchase_per_user > 0
            ? plan.max_purchase_per_user
            : t('不限')}
        </Text>
        <Text type='tertiary'>{t('营销库存')}</Text>
        <Text>{renderPlanSales(plan, t)}</Text>
        <Text type='tertiary'>{t('有效期')}</Text>
        <Text>{formatDuration(plan, t)}</Text>
        <Text type='tertiary'>{t('重置')}</Text>
        <Text>{formatSubscriptionResetHint(plan, t)}</Text>
      </div>
    </div>
  );

  return (
    <Popover content={popoverContent} position='rightTop' showArrow>
      <div style={{ cursor: 'pointer', maxWidth: 180 }}>
        <Text strong ellipsis={{ showTooltip: false }}>
          {text}
        </Text>
        {subtitle && (
          <Text
            type='tertiary'
            ellipsis={{ showTooltip: false }}
            style={{ display: 'block' }}
          >
            {subtitle}
          </Text>
        )}
      </div>
    </Popover>
  );
};

const renderPrice = (text) => {
  return (
    <Text strong style={{ color: 'var(--semi-color-success)' }}>
      {convertUSDToCurrency(Number(text || 0), 2)}
    </Text>
  );
};

const renderPurchaseLimit = (text, record, t) => {
  const limit = Number(record?.plan?.max_purchase_per_user || 0);
  return (
    <Text type={limit > 0 ? 'secondary' : 'tertiary'}>
      {limit > 0 ? limit : t('不限')}
    </Text>
  );
};

const renderInventory = (text, record, t) => {
  const saleSummary = getSubscriptionSaleSummary(record?.plan);
  if (saleSummary.unlimited) {
    return (
      <Text type='secondary'>
        {t('已售')} {saleSummary.soldCount}
      </Text>
    );
  }
  return (
    <div>
      <Text type={saleSummary.soldOut ? 'danger' : 'secondary'}>
        {t('剩余')} {saleSummary.remainingSaleCount}
      </Text>
      <Text type='tertiary' size='small' style={{ display: 'block' }}>
        {t('已售')} {saleSummary.soldCount}/{saleSummary.saleLimitCount}
      </Text>
    </div>
  );
};

const renderDuration = (text, record, t) => {
  return <Text type='secondary'>{formatDuration(record?.plan, t)}</Text>;
};

const renderEnabled = (text, record, t) => {
  return text ? (
    <Tag
      color='white'
      shape='circle'
      type='light'
      prefixIcon={<Badge dot type='success' />}
    >
      {t('启用')}
    </Tag>
  ) : (
    <Tag
      color='white'
      shape='circle'
      type='light'
      prefixIcon={<Badge dot type='danger' />}
    >
      {t('禁用')}
    </Tag>
  );
};

const renderTotalAmount = (text, record, t) => {
  const plan = record?.plan;
  return <Text type='secondary'>{renderPlanLimits(plan, t)}</Text>;
};

const renderUpgradeGroup = (text, record, t) => {
  const group = record?.plan?.upgrade_group || '';
  return (
    <span>
      {group ? (
        renderGroupTextWithDescription(group)
      ) : (
        <Text type='tertiary'>{t('不升级')}</Text>
      )}
    </span>
  );
};

const renderResetPeriod = (text, record, t) => {
  const period = record?.plan?.quota_reset_period || 'never';
  const isNever = period === 'never';
  return (
    <Text type={isNever ? 'tertiary' : 'secondary'}>
      {formatSubscriptionResetPeriod(record?.plan, t)}
    </Text>
  );
};

const renderPaymentConfig = (text, record, t, enableEpay) => {
  const hasStripe = !!record?.plan?.stripe_price_id;
  const hasCreem = !!record?.plan?.creem_product_id;
  const hasEpay = !!enableEpay;

  return (
    <Space spacing={4}>
      {hasStripe && (
        <Tag color='violet' shape='circle'>
          {t('Stripe')}
        </Tag>
      )}
      {hasCreem && (
        <Tag color='cyan' shape='circle'>
          {t('Creem')}
        </Tag>
      )}
      {hasEpay && (
        <Tag color='light-green' shape='circle'>
          {t('易支付')}
        </Tag>
      )}
    </Space>
  );
};

const renderOperations = (
  text,
  record,
  { openEdit, setPlanEnabled, openIssuePlanRedemption, t },
) => {
  const isEnabled = record?.plan?.enabled;
  const soldCount = Number(record?.plan?.sold_count || 0);
  const canSafeRemove = soldCount === 0;

  const handleToggle = () => {
    if (canSafeRemove && isEnabled) {
      Modal.confirm({
        title: t('确认安全删除'),
        content: t(
          '安全删除后，该套餐将从默认列表和用户端隐藏，但数据库记录与历史订单会保留，可通过“仅看禁用”重新查看并恢复。',
        ),
        centered: true,
        okButtonProps: {
          type: 'danger',
        },
        onOk: () => setPlanEnabled(record, false),
      });
      return;
    }

    if (isEnabled) {
      Modal.confirm({
        title: t('确认禁用'),
        content: t('禁用后用户端不再展示，但历史订单不受影响。是否继续？'),
        centered: true,
        onOk: () => setPlanEnabled(record, false),
      });
    } else {
      Modal.confirm({
        title: t('确认启用'),
        content: t('启用后套餐将在用户端展示。是否继续？'),
        centered: true,
        onOk: () => setPlanEnabled(record, true),
      });
    }
  };

  return (
    <Space spacing={8}>
      <Button
        theme='light'
        type='tertiary'
        size='small'
        onClick={() => openEdit(record)}
      >
        {t('编辑')}
      </Button>
      <Button
        theme='light'
        type='primary'
        size='small'
        onClick={() => openIssuePlanRedemption(record)}
      >
        {t('发卡')}
      </Button>
      {isEnabled ? (
        <Button theme='light' type='danger' size='small' onClick={handleToggle}>
          {canSafeRemove ? t('安全删除') : t('禁用')}
        </Button>
      ) : (
        <Button
          theme='light'
          type='primary'
          size='small'
          onClick={handleToggle}
        >
          {canSafeRemove ? t('恢复展示') : t('启用')}
        </Button>
      )}
    </Space>
  );
};

export const getSubscriptionsColumns = ({
  t,
  openEdit,
  setPlanEnabled,
  openIssuePlanRedemption,
  enableEpay,
}) => {
  return [
    {
      title: t('ID'),
      dataIndex: ['plan', 'id'],
      width: 60,
      render: (text) => <Text type='tertiary'>#{text}</Text>,
    },
    {
      title: t('套餐'),
      dataIndex: ['plan', 'title'],
      width: 200,
      render: (text, record) => renderPlanTitle(text, record, t),
    },
    {
      title: t('价格'),
      dataIndex: ['plan', 'price_amount'],
      width: 140,
      render: (text, record) => {
        const plan = record?.plan || {};
        const effective = getSubscriptionEffectivePrice(plan);
        const activeDiscount = isSubscriptionDiscountActive(plan);
        return (
          <div>
            {renderPrice(effective)}
            {activeDiscount ? (
              <Text
                type='tertiary'
                size='small'
                delete
                style={{ display: 'block' }}
              >
                {convertUSDToCurrency(Number(plan?.price_amount || 0), 2)}
              </Text>
            ) : null}
          </div>
        );
      },
    },
    {
      title: t('购买上限'),
      width: 90,
      render: (text, record) => renderPurchaseLimit(text, record, t),
    },
    {
      title: t('库存'),
      width: 120,
      render: (text, record) => renderInventory(text, record, t),
    },
    {
      title: t('销量'),
      width: 100,
      render: (text, record) => renderSalesCount(text, record, t),
    },
    {
      title: t('销售详情'),
      width: 110,
      render: (text, record) => renderSalesDetail(text, record, t),
    },
    {
      title: t('优先级'),
      dataIndex: ['plan', 'sort_order'],
      width: 80,
      render: (text) => <Text type='tertiary'>{Number(text || 0)}</Text>,
    },
    {
      title: t('有效期'),
      width: 100,
      render: (text, record) => renderDuration(text, record, t),
    },
    {
      title: t('重置'),
      width: 80,
      render: (text, record) => renderResetPeriod(text, record, t),
    },
    {
      title: t('状态'),
      dataIndex: ['plan', 'enabled'],
      width: 80,
      render: (text, record) => renderEnabled(text, record, t),
    },
    {
      title: t('支付渠道'),
      width: 180,
      render: (text, record) =>
        renderPaymentConfig(text, record, t, enableEpay),
    },
    {
      title: t('套餐权益'),
      width: 100,
      render: (text, record) => renderTotalAmount(text, record, t),
    },
    {
      title: t('升级分组'),
      width: 100,
      render: (text, record) => renderUpgradeGroup(text, record, t),
    },
    {
      title: t('操作'),
      dataIndex: 'operate',
      fixed: 'right',
      width: 240,
      render: (text, record) =>
        renderOperations(text, record, {
          openEdit,
          setPlanEnabled,
          openIssuePlanRedemption,
          t,
        }),
    },
  ];
};
