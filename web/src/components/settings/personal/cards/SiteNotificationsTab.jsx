import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Banner,
  Button,
  Empty,
  List,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  Bell,
  CheckCheck,
  MailOpen,
  RefreshCw,
} from 'lucide-react';
import { API, setUserData, showError, showSuccess, timestamp2string } from '../../../../helpers';
import { UserContext } from '../../../../context/User';

const { Text } = Typography;

const LEVEL_COLOR_MAP = {
  info: 'blue',
  success: 'green',
  warning: 'orange',
  danger: 'red',
};

export default function SiteNotificationsTab({ t }) {
  const [userState, userDispatch] = useContext(UserContext);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const unreadCount = Number(userState?.user?.site_notification_unread_count || 0);

  const syncUnreadCount = useCallback(
    async (nextUnreadCount = null) => {
      let unread = nextUnreadCount;
      if (unread === null) {
        const res = await API.get('/api/user/notifications/unread_count');
        if (!res.data.success) {
          return;
        }
        unread = Number(res.data?.data?.unread_count || 0);
      }
      const nextUser = {
        ...(userState?.user || {}),
        site_notification_unread_count: unread,
      };
      userDispatch({ type: 'login', payload: nextUser });
      setUserData(nextUser);
    },
    [userDispatch, userState?.user],
  );

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/user/notifications', {
        params: {
          p: page,
          page_size: pageSize,
        },
      });
      if (res.data.success) {
        setItems(Array.isArray(res.data.data) ? res.data.data : []);
        setTotal(Number(res.data.total || 0));
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError(error.message || t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, t]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const levelLabel = useMemo(
    () => ({
      info: t('普通'),
      success: t('成功'),
      warning: t('警告'),
      danger: t('重要'),
    }),
    [t],
  );

  const handleMarkOneRead = async (id) => {
    setMarking(true);
    try {
      const res = await API.post(`/api/user/notifications/${id}/read`);
      if (res.data.success) {
        showSuccess(t('已标记为已读'));
        await fetchItems();
        await syncUnreadCount(Math.max(0, unreadCount - 1));
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError(error.message || t('操作失败'));
    } finally {
      setMarking(false);
    }
  };

  const handleReadAll = async () => {
    setMarking(true);
    try {
      const res = await API.post('/api/user/notifications/read_all');
      if (res.data.success) {
        showSuccess(t('已全部标记为已读'));
        await fetchItems();
        await syncUnreadCount(0);
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError(error.message || t('操作失败'));
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className='py-4'>
      <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
        <div>
          <div className='flex items-center gap-2'>
            <Badge count={unreadCount} overflowCount={99}>
              <div className='inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700'>
                <Bell size={14} />
                {t('站内信')}
              </div>
            </Badge>
          </div>
          <Text type='secondary' size='small' className='mt-2 block'>
            {t('管理员发送的发放提醒、售后说明和重要通知会出现在这里。')}
          </Text>
        </div>
        <Space>
          <Button
            icon={<RefreshCw size={14} />}
            onClick={() => {
              fetchItems();
              syncUnreadCount();
            }}
          >
            {t('刷新')}
          </Button>
          <Button
            theme='solid'
            type='primary'
            icon={<CheckCheck size={14} />}
            disabled={unreadCount <= 0}
            loading={marking}
            onClick={handleReadAll}
          >
            {t('全部已读')}
          </Button>
        </Space>
      </div>

      <Banner
        type='info'
        closeIcon={null}
        description={t('站内信默认保留在账户内，不依赖邮箱绑定；如管理员勾选，也可能同步发送到邮箱。')}
        style={{ marginBottom: 16 }}
      />

      <List
        loading={loading}
        dataSource={items}
        renderItem={(item) => {
          const isRead = item?.is_read === true;
          return (
            <List.Item
              key={item?.id}
              main={
                <div className='w-full rounded-2xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)] p-4'>
                  <div className='mb-2 flex flex-wrap items-center justify-between gap-2'>
                    <div className='flex min-w-0 items-center gap-2'>
                      <Text strong className='truncate'>
                        {item?.title || '-'}
                      </Text>
                      <Tag color={LEVEL_COLOR_MAP[item?.level] || 'blue'} shape='circle'>
                        {levelLabel[item?.level] || t('普通')}
                      </Tag>
                      {!isRead ? (
                        <Tag color='red' shape='circle'>
                          {t('未读')}
                        </Tag>
                      ) : (
                        <Tag color='grey' shape='circle'>
                          {t('已读')}
                        </Tag>
                      )}
                    </div>
                    <div className='flex items-center gap-2'>
                      <Text type='tertiary' size='small'>
                        {timestamp2string(Math.floor(Number(item?.created_at || 0) / 1000))}
                      </Text>
                      {!isRead ? (
                        <Button
                          size='small'
                          type='tertiary'
                          icon={<MailOpen size={14} />}
                          loading={marking}
                          onClick={() => handleMarkOneRead(item.id)}
                        >
                          {t('标记已读')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <div className='whitespace-pre-wrap break-words text-sm leading-6 text-[var(--semi-color-text-1)]'>
                    {item?.content || '-'}
                  </div>
                </div>
              }
            />
          );
        }}
        emptyContent={
          <Empty
            description={t('暂无站内信')}
            style={{ padding: 24 }}
          />
        }
        pagination={{
          currentPage: page,
          pageSize,
          total,
          onPageChange: setPage,
          hideOnSinglePage: true,
        }}
      />
    </div>
  );
}

