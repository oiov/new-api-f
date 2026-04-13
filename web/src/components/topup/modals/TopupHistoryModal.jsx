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
  SideSheet,
  Table,
  Badge,
  Typography,
  Toast,
  Empty,
  Button,
  Input,
  Tag,
  Tabs,
  Select,
  Space,
  Modal,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { Coins, Gift, Package2 } from 'lucide-react';
import { IconSearch } from '@douyinfe/semi-icons';
import { API, timestamp2string } from '../../../helpers';
import { isAdmin } from '../../../helpers/utils';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { useNavigate } from 'react-router-dom';

const { Text } = Typography;
const { TabPane } = Tabs;

const HISTORY_TAB_TOPUP = 'topup';
const HISTORY_TAB_REDEMPTION = 'redemption';

const STATUS_CONFIG = {
  success: { type: 'success', key: '成功' },
  pending: { type: 'warning', key: '待支付' },
  failed: { type: 'danger', key: '失败' },
  expired: { type: 'danger', key: '已过期' },
};

const PAYMENT_METHOD_MAP = {
  stripe: 'Stripe',
  creem: 'Creem',
  waffo: 'Waffo',
  alipay: '支付宝',
  wxpay: '微信',
};

const TOPUP_STATUS_OPTIONS = ['', 'success', 'pending', 'failed', 'expired'];
const TOPUP_PAYMENT_OPTIONS = ['', 'alipay', 'wxpay', 'stripe', 'creem', 'waffo'];
const REDEMPTION_TYPE_OPTIONS = ['', 'quota', 'subscription'];

const toUnixTimestamp = (datetimeValue, isEnd = false) => {
  if (!datetimeValue) return 0;
  const normalizedValue =
    isEnd && !datetimeValue.includes(':59')
      ? `${datetimeValue}:59`
      : datetimeValue;
  const ts = Math.floor(new Date(normalizedValue).getTime() / 1000);
  return Number.isNaN(ts) ? 0 : ts;
};

const TopupHistoryModal = ({ visible, onCancel, t }) => {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('');
  const [redemptionTypeFilter, setRedemptionTypeFilter] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [activeTab, setActiveTab] = useState(HISTORY_TAB_TOPUP);
  const isMobile = useIsMobile();
  const userIsAdmin = useMemo(() => isAdmin(), []);
  const navigate = useNavigate();

  const loadHistory = async (
    currentPage,
    currentPageSize,
    currentTab = activeTab,
    currentKeyword = keyword,
    currentStatus = statusFilter,
    currentPaymentMethod = paymentMethodFilter,
    currentRedemptionType = redemptionTypeFilter,
    currentStartAt = startAt,
    currentEndAt = endAt,
  ) => {
    setLoading(true);
    try {
      const base =
        currentTab === HISTORY_TAB_TOPUP
          ? userIsAdmin
            ? '/api/user/topup'
            : '/api/user/topup/self'
          : userIsAdmin
            ? '/api/user/redemption/history'
            : '/api/user/redemption/history/self';
      
      let qs = `p=${currentPage}&page_size=${currentPageSize}`;
      if (currentKeyword) {
        qs += `&keyword=${encodeURIComponent(currentKeyword)}`;
      }
      if (currentStatus && currentTab === HISTORY_TAB_TOPUP) {
        qs += `&status=${encodeURIComponent(currentStatus)}`;
      }
      if (currentPaymentMethod && currentTab === HISTORY_TAB_TOPUP) {
        qs += `&payment_method=${encodeURIComponent(currentPaymentMethod)}`;
      }
      if (currentRedemptionType && currentTab === HISTORY_TAB_REDEMPTION) {
        qs += `&redemption_type=${encodeURIComponent(currentRedemptionType)}`;
      }
      const startTimestamp = toUnixTimestamp(currentStartAt);
      const endTimestamp = toUnixTimestamp(currentEndAt, true);
      if (startTimestamp > 0) {
        qs += `&start_timestamp=${startTimestamp}`;
      }
      if (endTimestamp > 0) {
        qs += `&end_timestamp=${endTimestamp}`;
      }

      let res;
      try {
        res = await API.get(`${base}?${qs}`);
      } catch (error) {
        const shouldFallbackToSelfHistory =
          currentTab === HISTORY_TAB_REDEMPTION &&
          userIsAdmin &&
          (error?.response?.status === 404 ||
            error?.response?.data?.error?.message
              ?.includes('Invalid URL'));

        if (!shouldFallbackToSelfHistory) {
          throw error;
        }

        res = await API.get(`/api/user/redemption/history/self?${qs}`);
      }

      const { success, message, data } = res.data;
      if (success) {
        setRecords(data.items || []);
        setTotal(data.total || 0);
      } else {
        Toast.error({ content: message || t('加载失败') });
      }
    } catch (error) {
      Toast.error({
        content:
          currentTab === HISTORY_TAB_TOPUP
            ? t('加载账单失败')
            : t('加载兑换记录失败'),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) {
      return;
    }
    loadHistory(
      page,
      pageSize,
      activeTab,
      keyword,
      statusFilter,
      paymentMethodFilter,
      redemptionTypeFilter,
      startAt,
      endAt,
    );
  }, [
    visible,
    page,
    pageSize,
    keyword,
    activeTab,
    statusFilter,
    paymentMethodFilter,
    redemptionTypeFilter,
    startAt,
    endAt,
  ]);

  const handlePageChange = (currentPage) => {
    setPage(currentPage);
  };

  const handlePageSizeChange = (currentPageSize) => {
    setPageSize(currentPageSize);
    setPage(1);
  };

  const handleKeywordChange = (value) => {
    setKeyword(value);
    setPage(1);
  };

  const handleStatusFilterChange = (value) => {
    setStatusFilter(value || '');
    setPage(1);
  };

  const handlePaymentMethodChange = (value) => {
    setPaymentMethodFilter(value || '');
    setPage(1);
  };

  const handleRedemptionTypeChange = (value) => {
    setRedemptionTypeFilter(value || '');
    setPage(1);
  };

  const handleStartAtChange = (value) => {
    setStartAt(value);
    setPage(1);
  };

  const handleEndAtChange = (value) => {
    setEndAt(value);
    setPage(1);
  };

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setPage(1);
    setKeyword('');
    setStatusFilter('');
    setPaymentMethodFilter('');
    setRedemptionTypeFilter('');
    setStartAt('');
    setEndAt('');
    setRecords([]);
    setTotal(0);
  };

  const handleResetFilters = () => {
    setKeyword('');
    setStatusFilter('');
    setPaymentMethodFilter('');
    setRedemptionTypeFilter('');
    setStartAt('');
    setEndAt('');
    setPage(1);
  };

  const handleUserClick = (userId) => {
    if (!userId || !userIsAdmin) return;
    onCancel();
    navigate(`/console/user?keyword=${userId}`);
  };

  const handleAdminComplete = async (tradeNo) => {
    try {
      const res = await API.post('/api/user/topup/complete', {
        trade_no: tradeNo,
      });
      const { success, message } = res.data;
      if (success) {
        Toast.success({ content: t('补单成功') });
        await loadHistory(
          page,
          pageSize,
          HISTORY_TAB_TOPUP,
          keyword,
          statusFilter,
          paymentMethodFilter,
          redemptionTypeFilter,
          startAt,
          endAt,
        );
      } else {
        Toast.error({ content: message || t('补单失败') });
      }
    } catch (e) {
      Toast.error({ content: t('补单失败') });
    }
  };

  const confirmAdminComplete = (tradeNo) => {
    Modal.confirm({
      title: t('确认补单'),
      content: t('是否将该订单标记为成功并为用户入账？'),
      onOk: () => handleAdminComplete(tradeNo),
    });
  };

  const renderStatusBadge = (status) => {
    const config = STATUS_CONFIG[status] || { type: 'primary', key: status };
    return (
      <span className='flex items-center gap-2'>
        <Badge dot type={config.type} />
        <span>{t(config.key)}</span>
      </span>
    );
  };

  const renderPaymentMethod = (pm) => {
    const displayName = PAYMENT_METHOD_MAP[pm];
    return <Text>{displayName ? t(displayName) : pm || '-'}</Text>;
  };

  const isSubscriptionTopup = (record) => {
    const tradeNo = (record?.trade_no || '').toLowerCase();
    return Number(record?.amount || 0) === 0 && tradeNo.startsWith('sub');
  };

  const topupColumns = useMemo(() => {
    const baseColumns = [
      {
        title: t('ID'),
        dataIndex: 'id',
        key: 'id',
        width: 80,
        render: (text) => <Text copyable>{text}</Text>,
      },
      {
        title: t('订单号'),
        dataIndex: 'trade_no',
        key: 'trade_no',
        render: (text) => <Text copyable>{text}</Text>,
      },
      {
        title: t('充值名称'),
        key: 'name',
        render: (_, record) => {
          if (isSubscriptionTopup(record)) {
            return <Text copyable>{t('订阅套餐充值')}</Text>;
          }
          return <Text copyable>{t('充值')} {record.amount} {t('额度')}</Text>;
        },
      },
    ];

    // 管理员可见：用户信息列
    if (userIsAdmin) {
      baseColumns.push({
        title: t('充值用户'),
        key: 'user_info',
        render: (_, record) => (
          <div className='flex flex-col gap-1'>
            <Text>{record.username || '--'}</Text>
            <Text 
              type='tertiary' 
              size='small'
              link
              onClick={() => handleUserClick(record.user_id)}
              style={{ cursor: 'pointer' }}
            >
              {t('用户 ID')}: {record.user_id || '--'}
            </Text>
          </div>
        ),
      });
    }

    baseColumns.push(
      {
        title: t('支付方式'),
        dataIndex: 'payment_method',
        key: 'payment_method',
        render: renderPaymentMethod,
      },
      {
        title: t('充值额度'),
        dataIndex: 'amount',
        key: 'amount',
        render: (amount, record) => {
          if (isSubscriptionTopup(record)) {
            return (
              <Tag color='purple' shape='circle' size='small'>
                {t('订阅套餐')}
              </Tag>
            );
          }
          return (
            <span className='flex items-center gap-1'>
              <Coins size={16} />
              <Text>{amount}</Text>
            </span>
          );
        },
      },
      {
        title: t('支付金额'),
        dataIndex: 'money',
        key: 'money',
        render: (money) => (
          <Text type='danger'>
            ¥{money != null ? money.toFixed(2) : '0.00'}
          </Text>
        ),
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        key: 'status',
        render: renderStatusBadge,
      },
    );

    if (userIsAdmin) {
      baseColumns.push({
        title: t('操作'),
        key: 'action',
        render: (_, record) => {
          if (record.status !== 'pending') {
            return null;
          }
          return (
            <Button
              size='small'
              type='primary'
              theme='outline'
              onClick={() => confirmAdminComplete(record.trade_no)}
            >
              {t('补单')}
            </Button>
          );
        },
      });
    }

    baseColumns.push({
      title: t('创建时间'),
      dataIndex: 'create_time',
      key: 'create_time',
      render: (time) => timestamp2string(time),
    });

    return baseColumns;
  }, [t, userIsAdmin]);

  const redemptionColumns = useMemo(() => {
    const columns = [
      {
        title: t('兑换码ID'),
        dataIndex: 'id',
        key: 'id',
        render: (value) => <Text copyable>{String(value)}</Text>,
      },
      {
        title: t('兑换项'),
        dataIndex: 'name',
        key: 'name',
        render: (value, record) => {
          if (record.redemption_type === 'subscription') {
            return (
              <div className='flex items-center gap-2'>
                <Package2 size={16} />
                <Text copyable>{value || record.subscription_plan_title || '--'}</Text>
              </div>
            );
          }
          return (
            <div className='flex items-center gap-2'>
              <Gift size={16} />
              <Text copyable>{value || '--'}</Text>
            </div>
          );
        },
      },
      {
        title: t('兑换类型'),
        dataIndex: 'redemption_type',
        key: 'redemption_type',
        render: (value) =>
          value === 'subscription' ? (
            <Tag color='purple' shape='circle' size='small'>
              {t('套餐兑换')}
            </Tag>
          ) : (
            <Tag color='green' shape='circle' size='small'>
              {t('额度兑换')}
            </Tag>
          ),
      },
      {
        title: t('兑换内容'),
        key: 'redemption_value',
        render: (_, record) => {
          if (record.redemption_type === 'subscription') {
            return (
              <div className='flex flex-col gap-1'>
                <Text>{record.subscription_plan_title || '--'}</Text>
                <Text type='tertiary' size='small'>
                  {t('套餐ID')}: {record.subscription_plan_id || '--'}
                </Text>
              </div>
            );
          }
          return (
            <span className='flex items-center gap-1'>
              <Coins size={16} />
              <Text>{record.quota}</Text>
            </span>
          );
        },
      },
      {
        title: t('兑换时间'),
        dataIndex: 'redeemed_time',
        key: 'redeemed_time',
        render: (time) => timestamp2string(time),
      },
    ];

    if (userIsAdmin) {
      columns.splice(1, 0, {
        title: t('用户名'),
        dataIndex: 'username',
        key: 'username',
        render: (value, record) => (
          <div className='flex flex-col gap-1'>
            <Text>{value || '--'}</Text>
            <Text 
              type='tertiary' 
              size='small'
              link
              onClick={() => handleUserClick(record.used_user_id)}
              style={{ cursor: 'pointer' }}
            >
              {t('用户 ID')}: {record.used_user_id || '--'}
            </Text>
          </div>
        ),
      });
    }

    return columns;
  }, [t, userIsAdmin]);

  const searchPlaceholder =
    activeTab === HISTORY_TAB_TOPUP
      ? userIsAdmin
        ? t('订单号 / 用户名 / 用户 ID')
        : t('订单号')
      : userIsAdmin
        ? t('兑换码ID / 套餐ID / 用户名')
        : t('兑换码ID / 套餐ID / 兑换项');

  const emptyDescription =
    activeTab === HISTORY_TAB_TOPUP ? t('暂无充值记录') : t('暂无兑换记录');

  return (
    <SideSheet
      title={t('充值兑换记录')}
      visible={visible}
      onCancel={onCancel}
      width={isMobile ? '100vw' : 1000}
      placement={isMobile ? 'bottom' : 'right'}
      height={isMobile ? '90vh' : undefined}
      headerStyle={{
        borderBottom: '1px solid var(--semi-color-border)',
        padding: '16px 24px'
      }}
      bodyStyle={{
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        height: '100%'
      }}
    >
      <div style={{ 
        padding: '16px 24px', 
        borderBottom: '1px solid var(--semi-color-border)',
        flexShrink: 0
      }}>
        <Tabs
          type='line'
          activeKey={activeTab}
          onChange={handleTabChange}
          className='topup-page-tabs'
        >
          <TabPane tab={t('充值记录')} itemKey={HISTORY_TAB_TOPUP} />
          <TabPane tab={t('兑换记录')} itemKey={HISTORY_TAB_REDEMPTION} />
        </Tabs>

        <Space style={{ width: '100%', marginTop: 16 }} spacing='loose' wrap>
          <Input
            prefix={<IconSearch />}
            placeholder={searchPlaceholder}
            value={keyword}
            onChange={handleKeywordChange}
            showClear
            style={{ flex: 1, minWidth: isMobile ? '100%' : 260 }}
          />
          {activeTab === HISTORY_TAB_TOPUP && (
            <Select
              placeholder={t('全部状态')}
              value={statusFilter}
              onChange={handleStatusFilterChange}
              style={{ width: 150 }}
              showClear
            >
              {TOPUP_STATUS_OPTIONS.map((status) => (
                <Select.Option key={status || 'all'} value={status}>
                  {status
                    ? t(STATUS_CONFIG[status]?.key || status)
                    : t('全部状态')}
                </Select.Option>
              ))}
            </Select>
          )}
          {activeTab === HISTORY_TAB_TOPUP && (
            <Select
              placeholder={t('全部支付方式')}
              value={paymentMethodFilter}
              onChange={handlePaymentMethodChange}
              style={{ width: 180 }}
              showClear
            >
              {TOPUP_PAYMENT_OPTIONS.map((method) => (
                <Select.Option key={method || 'all'} value={method}>
                  {method
                    ? t(PAYMENT_METHOD_MAP[method] || method)
                    : t('全部支付方式')}
                </Select.Option>
              ))}
            </Select>
          )}
          {activeTab === HISTORY_TAB_REDEMPTION && (
            <Select
              placeholder={t('全部类型')}
              value={redemptionTypeFilter}
              onChange={handleRedemptionTypeChange}
              style={{ width: 150 }}
              showClear
            >
              {REDEMPTION_TYPE_OPTIONS.map((type) => (
                <Select.Option key={type || 'all'} value={type}>
                  {type
                    ? type === 'subscription'
                      ? t('套餐兑换')
                      : t('额度兑换')
                    : t('全部类型')}
                </Select.Option>
              ))}
            </Select>
          )}
          <Input
            type='datetime-local'
            value={startAt}
            onChange={handleStartAtChange}
            style={{ width: 210 }}
          />
          <Input
            type='datetime-local'
            value={endAt}
            onChange={handleEndAtChange}
            style={{ width: 210 }}
          />
          <Button onClick={handleResetFilters}>{t('重置筛选')}</Button>
        </Space>
      </div>

      <div style={{ 
        flex: 1, 
        overflow: 'auto',
        padding: '0 24px'
      }}>
        <Table
          columns={
            activeTab === HISTORY_TAB_TOPUP ? topupColumns : redemptionColumns
          }
          dataSource={records}
          loading={loading}
          rowKey='id'
          pagination={{
            currentPage: page,
            pageSize: pageSize,
            total: total,
            showSizeChanger: true,
            pageSizeOpts: [10, 20, 50, 100],
            onPageChange: handlePageChange,
            onPageSizeChange: handlePageSizeChange,
          }}
          size='small'
          empty={
            <Empty
              image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
              darkModeImage={
                <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
              }
              description={emptyDescription}
              style={{ padding: 30 }}
            />
          }
        />
      </div>
    </SideSheet>
  );
};

export default TopupHistoryModal;
