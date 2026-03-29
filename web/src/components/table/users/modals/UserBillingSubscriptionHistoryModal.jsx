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
import {
  Badge,
  Button,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Typography,
} from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { Coins } from 'lucide-react';
import {
  API,
  renderQuota,
  showError,
  timestamp2string,
} from '../../../../helpers';
import {
  formatSubscriptionResourceLabel,
  getSubscriptionResourceType,
  getSubscriptionUsageSummary,
} from '../../../../helpers/subscriptionFormat';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';

const { Text } = Typography;

const TAB_TOPUP = 'topup';
const TAB_SUBSCRIPTION = 'subscription';

const TOPUP_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '成功', value: 'success' },
  { label: '待支付', value: 'pending' },
  { label: '失败', value: 'failed' },
  { label: '已过期', value: 'expired' },
];

const SUB_STATUS_OPTIONS = [
  { label: '全部状态', value: '' },
  { label: '生效', value: 'active' },
  { label: '已过期', value: 'expired' },
  { label: '已作废', value: 'cancelled' },
];

const STATUS_CONFIG = {
  success: { type: 'success', label: '成功' },
  pending: { type: 'warning', label: '待支付' },
  failed: { type: 'danger', label: '失败' },
  expired: { type: 'danger', label: '已过期' },
  active: { type: 'success', label: '生效' },
  cancelled: { type: 'danger', label: '已作废' },
};

const PAYMENT_METHOD_MAP = {
  stripe: 'Stripe',
  creem: 'Creem',
  waffo: 'Waffo',
  alipay: '支付宝',
  wxpay: '微信',
};

const parseResult = (payload) => {
  if (Array.isArray(payload)) {
    return { items: payload, total: payload.length };
  }
  return {
    items: payload?.items || [],
    total: payload?.total || 0,
  };
};

const toUnixTimestamp = (datetimeValue) => {
  if (!datetimeValue) return 0;
  const ts = Math.floor(new Date(datetimeValue).getTime() / 1000);
  return Number.isNaN(ts) ? 0 : ts;
};

const UserBillingSubscriptionHistoryModal = ({
  visible,
  onCancel,
  user,
  t,
}) => {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(TAB_TOPUP);

  const [topupLoading, setTopupLoading] = useState(false);
  const [topupItems, setTopupItems] = useState([]);
  const [topupTotal, setTopupTotal] = useState(0);
  const [topupPage, setTopupPage] = useState(1);
  const [topupPageSize, setTopupPageSize] = useState(10);
  const [topupKeyword, setTopupKeyword] = useState('');
  const [topupStatus, setTopupStatus] = useState('');
  const [topupStartAt, setTopupStartAt] = useState('');
  const [topupEndAt, setTopupEndAt] = useState('');

  const [subLoading, setSubLoading] = useState(false);
  const [subItems, setSubItems] = useState([]);
  const [subTotal, setSubTotal] = useState(0);
  const [subPage, setSubPage] = useState(1);
  const [subPageSize, setSubPageSize] = useState(10);
  const [subKeyword, setSubKeyword] = useState('');
  const [subStatus, setSubStatus] = useState('');
  const [subStartAt, setSubStartAt] = useState('');
  const [subEndAt, setSubEndAt] = useState('');

  useEffect(() => {
    if (!visible) return;
    setActiveTab(TAB_TOPUP);
    setTopupPage(1);
    setTopupPageSize(10);
    setTopupKeyword('');
    setTopupStatus('');
    setTopupStartAt('');
    setTopupEndAt('');
    setSubPage(1);
    setSubPageSize(10);
    setSubKeyword('');
    setSubStatus('');
    setSubStartAt('');
    setSubEndAt('');
  }, [visible, user?.id]);

  const loadTopups = async () => {
    if (!visible || !user?.id) return;
    setTopupLoading(true);
    try {
      const params = [
        `p=${topupPage}`,
        `page_size=${topupPageSize}`,
        `user_id=${user.id}`,
      ];
      if (topupKeyword) {
        params.push(`keyword=${encodeURIComponent(topupKeyword)}`);
      }
      if (topupStatus) {
        params.push(`status=${encodeURIComponent(topupStatus)}`);
      }
      const startTs = toUnixTimestamp(topupStartAt);
      const endTs = toUnixTimestamp(topupEndAt);
      if (startTs > 0) {
        params.push(`start_timestamp=${startTs}`);
      }
      if (endTs > 0) {
        params.push(`end_timestamp=${endTs}`);
      }
      const res = await API.get(`/api/user/topup?${params.join('&')}`);
      if (res.data?.success) {
        const parsed = parseResult(res.data.data);
        setTopupItems(parsed.items);
        setTopupTotal(parsed.total);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch {
      showError(t('请求失败'));
    } finally {
      setTopupLoading(false);
    }
  };

  const loadSubscriptions = async () => {
    if (!visible || !user?.id) return;
    setSubLoading(true);
    try {
      const params = [`p=${subPage}`, `page_size=${subPageSize}`];
      if (subKeyword) {
        params.push(`keyword=${encodeURIComponent(subKeyword)}`);
      }
      if (subStatus) {
        params.push(`status=${encodeURIComponent(subStatus)}`);
      }
      const startTs = toUnixTimestamp(subStartAt);
      const endTs = toUnixTimestamp(subEndAt);
      if (startTs > 0) {
        params.push(`start_timestamp=${startTs}`);
      }
      if (endTs > 0) {
        params.push(`end_timestamp=${endTs}`);
      }
      const res = await API.get(
        `/api/subscription/admin/users/${user.id}/subscriptions?${params.join('&')}`,
      );
      if (res.data?.success) {
        const parsed = parseResult(res.data.data);
        setSubItems(parsed.items);
        setSubTotal(parsed.total);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch {
      showError(t('请求失败'));
    } finally {
      setSubLoading(false);
    }
  };

  useEffect(() => {
    loadTopups();
  }, [
    visible,
    user?.id,
    topupPage,
    topupPageSize,
    topupKeyword,
    topupStatus,
    topupStartAt,
    topupEndAt,
  ]);

  useEffect(() => {
    loadSubscriptions();
  }, [
    visible,
    user?.id,
    subPage,
    subPageSize,
    subKeyword,
    subStatus,
    subStartAt,
    subEndAt,
  ]);

  const renderStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || { type: 'primary', label: status || '-' };
    return (
      <span className='flex items-center gap-2'>
        <Badge dot type={config.type} />
        <span>{t(config.label)}</span>
      </span>
    );
  };

  const renderSubscriptionStatusBadge = (subscription) => {
    if (!subscription) {
      return renderStatusBadge('');
    }
    if (subscription.status === 'cancelled') {
      return renderStatusBadge('cancelled');
    }
    const now = Date.now() / 1000;
    if (subscription.status === 'active' && Number(subscription.end_time || 0) > now) {
      return renderStatusBadge('active');
    }
    return renderStatusBadge('expired');
  };

  const topupColumns = useMemo(
    () => [
      {
        title: t('订单号'),
        dataIndex: 'trade_no',
        key: 'trade_no',
        render: (value) => <Text copyable>{value}</Text>,
      },
      {
        title: t('支付方式'),
        dataIndex: 'payment_method',
        key: 'payment_method',
        render: (value) => PAYMENT_METHOD_MAP[value] || value || '-',
      },
      {
        title: t('充值额度'),
        dataIndex: 'amount',
        key: 'amount',
        render: (value) => (
          <span className='flex items-center gap-1'>
            <Coins size={16} />
            <Text>{value}</Text>
          </span>
        ),
      },
      {
        title: t('支付金额'),
        dataIndex: 'money',
        key: 'money',
        render: (value, row) => {
          const pm = row?.payment_method;
          const money = Number(value || 0).toFixed(2);
          if (pm === 'alipay' || pm === 'wxpay') {
            return <Text type='danger'>¥{money}</Text>;
          }
          return <Text type='danger'>${money}</Text>;
        },
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        key: 'status',
        render: (value) => renderStatusBadge(value),
      },
      {
        title: t('创建时间'),
        dataIndex: 'create_time',
        key: 'create_time',
        render: (value) => timestamp2string(value),
      },
    ],
    [t],
  );

  const subscriptionColumns = useMemo(
    () => [
      {
        title: 'ID',
        key: 'id',
        render: (_, row) => row?.subscription?.id,
      },
      {
        title: t('套餐ID'),
        key: 'plan_id',
        render: (_, row) => row?.subscription?.plan_id || '-',
      },
      {
        title: t('来源'),
        key: 'source',
        render: (_, row) => row?.subscription?.source || '-',
      },
      {
        title: t('状态'),
        key: 'status',
        render: (_, row) => renderSubscriptionStatusBadge(row?.subscription),
      },
      {
        title: t('有效期'),
        key: 'period',
        render: (_, row) => (
          <div className='text-xs text-gray-600'>
            <div>{timestamp2string(row?.subscription?.start_time)}</div>
            <div>{timestamp2string(row?.subscription?.end_time)}</div>
          </div>
        ),
      },
      {
        title: t('权益'),
        key: 'resource',
        render: (_, row) => {
          const sub = row?.subscription;
          const summary = getSubscriptionUsageSummary(sub);
          const resourceType = getSubscriptionResourceType(sub);
          return (
            <div className='text-xs text-gray-600'>
              <div>{formatSubscriptionResourceLabel(sub, t)}</div>
              <div>
                {!summary.unlimited
                  ? resourceType === 'request_count'
                    ? `${summary.used}/${summary.total}`
                    : `${renderQuota(summary.used)}/${renderQuota(summary.total)}`
                  : t('不限')}
              </div>
            </div>
          );
        },
      },
    ],
    [t],
  );

  const renderFilters = (isTopup) => {
    const keyword = isTopup ? topupKeyword : subKeyword;
    const setKeyword = isTopup ? setTopupKeyword : setSubKeyword;
    const status = isTopup ? topupStatus : subStatus;
    const setStatus = isTopup ? setTopupStatus : setSubStatus;
    const startAt = isTopup ? topupStartAt : subStartAt;
    const setStartAt = isTopup ? setTopupStartAt : setSubStartAt;
    const endAt = isTopup ? topupEndAt : subEndAt;
    const setEndAt = isTopup ? setTopupEndAt : setSubEndAt;

    return (
      <Space wrap className='mb-3'>
        <Input
          prefix={<IconSearch />}
          value={keyword}
          onChange={(value) => {
            setKeyword(value);
            isTopup ? setTopupPage(1) : setSubPage(1);
          }}
          placeholder={isTopup ? t('订单号') : t('订阅ID / 套餐ID / 来源')}
          showClear
          style={{ width: 260 }}
        />
        <Select
          value={status}
          onChange={(value) => {
            setStatus(value || '');
            isTopup ? setTopupPage(1) : setSubPage(1);
          }}
          optionList={(isTopup ? TOPUP_STATUS_OPTIONS : SUB_STATUS_OPTIONS).map(
            (item) => ({ ...item, label: t(item.label) }),
          )}
          style={{ width: 150 }}
        />
        <Input
          type='datetime-local'
          value={startAt}
          onChange={(value) => {
            setStartAt(value);
            isTopup ? setTopupPage(1) : setSubPage(1);
          }}
          style={{ width: 210 }}
        />
        <Input
          type='datetime-local'
          value={endAt}
          onChange={(value) => {
            setEndAt(value);
            isTopup ? setTopupPage(1) : setSubPage(1);
          }}
          style={{ width: 210 }}
        />
        <Button
          onClick={() => {
            if (isTopup) {
              setTopupKeyword('');
              setTopupStatus('');
              setTopupStartAt('');
              setTopupEndAt('');
              setTopupPage(1);
            } else {
              setSubKeyword('');
              setSubStatus('');
              setSubStartAt('');
              setSubEndAt('');
              setSubPage(1);
            }
          }}
        >
          {t('重置筛选')}
        </Button>
      </Space>
    );
  };

  const tableEmpty = (desc) => (
    <Empty
      image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
      darkModeImage={<IllustrationNoResultDark style={{ width: 150, height: 150 }} />}
      description={desc}
      style={{ padding: 30 }}
    />
  );

  return (
    <Modal
      title={`${t('用户历史记录')}${user?.username ? ` - ${user.username}` : ''}`}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      size={isMobile ? 'full-width' : 'large'}
    >
      <Tabs activeKey={activeTab} onChange={(key) => setActiveTab(key)}>
        <Tabs.TabPane itemKey={TAB_TOPUP} tab={t('充值历史')}>
          {renderFilters(true)}
          <Table
            columns={topupColumns}
            dataSource={topupItems}
            loading={topupLoading}
            rowKey='id'
            size='small'
            pagination={{
              currentPage: topupPage,
              pageSize: topupPageSize,
              total: topupTotal,
              showSizeChanger: true,
              pageSizeOpts: [10, 20, 50, 100],
              onPageChange: (page) => setTopupPage(page),
              onPageSizeChange: (size) => {
                setTopupPageSize(size);
                setTopupPage(1);
              },
            }}
            empty={tableEmpty(t('暂无充值记录'))}
          />
        </Tabs.TabPane>
        <Tabs.TabPane itemKey={TAB_SUBSCRIPTION} tab={t('订阅历史')}>
          {renderFilters(false)}
          <Table
            columns={subscriptionColumns}
            dataSource={subItems}
            loading={subLoading}
            rowKey={(row) => row?.subscription?.id}
            size='small'
            pagination={{
              currentPage: subPage,
              pageSize: subPageSize,
              total: subTotal,
              showSizeChanger: true,
              pageSizeOpts: [10, 20, 50, 100],
              onPageChange: (page) => setSubPage(page),
              onPageSizeChange: (size) => {
                setSubPageSize(size);
                setSubPage(1);
              },
            }}
            empty={tableEmpty(t('暂无订阅记录'))}
          />
        </Tabs.TabPane>
      </Tabs>
    </Modal>
  );
};

export default UserBillingSubscriptionHistoryModal;
