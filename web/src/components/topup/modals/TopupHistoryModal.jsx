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
  Drawer,
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

const TopupHistoryModal = ({ visible, onCancel, t }) => {
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
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
    loadHistory(page, pageSize, activeTab, keyword, statusFilter);
  }, [visible, page, pageSize, keyword, activeTab, statusFilter]);

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
    setStatusFilter(value);
    setPage(1);
  };

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setPage(1);
    setKeyword('');
    setStatusFilter('');
    setRecords([]);
    setTotal(0);
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
        await loadHistory(page, pageSize, HISTORY_TAB_TOPUP, keyword, statusFilter);
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
              UID: {record.user_id || '--'}
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
              UID: {record.used_user_id || '--'}
            </Text>
          </div>
        ),
      });
    }

    return columns;
  }, [t, userIsAdmin]);

  const searchPlaceholder =
    activeTab === HISTORY_TAB_TOPUP
      ? t('订单号')
      : userIsAdmin
        ? t('兑换码ID / 套餐ID / 用户名')
        : t('兑换码ID / 套餐ID / 兑换项');

  const emptyDescription =
    activeTab === HISTORY_TAB_TOPUP ? t('暂无充值记录') : t('暂无兑换记录');

  return (
    <Drawer
      title={t('充值兑换记录')}
      visible={visible}
      onCancel={onCancel}
      width={isMobile ? '100%' : 1000}
      height={isMobile ? '100%' : undefined}
      placement={isMobile ? 'bottom' : 'right'}
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
      footer={null}
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

        <Space style={{ width: '100%', marginTop: 16 }} spacing='loose'>
          <Input
            prefix={<IconSearch />}
            placeholder={searchPlaceholder}
            value={keyword}
            onChange={handleKeywordChange}
            showClear
            style={{ flex: 1 }}
          />
          {activeTab === HISTORY_TAB_TOPUP && (
            <Select
              placeholder={t('状态筛选')}
              value={statusFilter}
              onChange={handleStatusFilterChange}
              style={{ width: 150 }}
              showClear
            >
              <Select.Option value='success'>{t('成功')}</Select.Option>
              <Select.Option value='pending'>{t('待支付')}</Select.Option>
              <Select.Option value='failed'>{t('失败')}</Select.Option>
              <Select.Option value='expired'>{t('已过期')}</Select.Option>
            </Select>
          )}
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
    </Drawer>
  );
};

export default TopupHistoryModal;
