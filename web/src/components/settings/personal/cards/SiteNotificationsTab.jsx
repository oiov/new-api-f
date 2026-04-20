import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Banner,
  Button,
  Checkbox,
  Empty,
  Input,
  List,
  Switch,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  Clock3,
  Inbox,
  MailCheck,
  MailOpen,
  RefreshCw,
  Search,
  ShieldAlert,
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

const LEVEL_SURFACE_MAP = {
  info: 'border-l-blue-500 bg-blue-50/70',
  success: 'border-l-green-500 bg-green-50/70',
  warning: 'border-l-orange-500 bg-orange-50/70',
  danger: 'border-l-red-500 bg-red-50/70',
};

function decodeHtmlEntities(content) {
  if (!content || typeof window === 'undefined') {
    return content || '';
  }
  const textarea = document.createElement('textarea');
  textarea.innerHTML = content;
  return textarea.value;
}

function normalizeNotificationContent(content) {
  if (!content) return '-';

  const normalizedHtml = String(content)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<(p|div|ul|ol|li|h[1-6])[^>]*>/gi, '')
    .replace(/<\/?(strong|b|em|i|u|span)[^>]*>/gi, '')
    .replace(/<[^>]+>/g, '');

  return decodeHtmlEntities(normalizedHtml)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function getDayKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getRelativeDayLabel(dayKey, t) {
  const now = new Date();
  const todayKey = getDayKey(now.getTime());
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = getDayKey(yesterday.getTime());

  if (dayKey === todayKey) {
    return { label: t('今天'), kind: 'today' };
  }
  if (dayKey === yesterdayKey) {
    return { label: t('昨天'), kind: 'yesterday' };
  }
  return { label: dayKey, kind: 'earlier' };
}

function isLongContent(content) {
  return String(content || '').length > 160 || String(content || '').includes('\n');
}

export default function SiteNotificationsTab({ t }) {
  const [userState, userDispatch] = useContext(UserContext);
  const [loading, setLoading] = useState(false);
  const [marking, setMarking] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [nextBeforeId, setNextBeforeId] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [levelFilter, setLevelFilter] = useState('all');
  const [expandedMap, setExpandedMap] = useState({});
  const [priorityCollapsed, setPriorityCollapsed] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedMap, setSelectedMap] = useState({});
  const [pageSize] = useState(20);
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

  const fetchItems = useCallback(async ({ append = false, cursor = 0 } = {}) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    try {
      const res = await API.get('/api/user/notifications', {
        params: {
          page_size: pageSize,
          unread_only: unreadOnly,
          before_id: cursor > 0 ? cursor : undefined,
        },
      });
      if (res.data.success) {
        const nextItems = Array.isArray(res.data.data) ? res.data.data : [];
        setItems((prev) => (append ? [...prev, ...nextItems] : nextItems));
        setTotal(Number(res.data.total || 0));
        setHasMore(Boolean(res.data.has_more));
        setNextBeforeId(Number(res.data.next_before_id || 0));
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError(error.message || t('加载失败'));
    } finally {
      if (append) {
        setLoadingMore(false);
      } else {
        setLoading(false);
      }
    }
  }, [pageSize, t, unreadOnly]);

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

  const readCount = Math.max(total - unreadCount, 0);
  const levelStats = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        const level = item?.level || 'info';
        acc[level] = (acc[level] || 0) + 1;
        return acc;
      },
      {
        info: 0,
        success: 0,
        warning: 0,
        danger: 0,
      },
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase();
    return items.filter((item) => {
      const levelMatched =
        levelFilter === 'all' || (item?.level || 'info') === levelFilter;
      if (!levelMatched) {
        return false;
      }
      if (!keyword) {
        return true;
      }
      const title = String(item?.title || '').toLowerCase();
      const content = normalizeNotificationContent(item?.content).toLowerCase();
      return title.includes(keyword) || content.includes(keyword);
    });
  }, [items, levelFilter, searchKeyword]);

  const priorityItems = useMemo(() => {
    return filteredItems
      .filter((item) => ['danger', 'warning'].includes(item?.level))
      .slice(0, 3);
  }, [filteredItems]);

  const visibleLongItemIds = useMemo(() => {
    return filteredItems
      .filter((item) => isLongContent(normalizeNotificationContent(item?.content)))
      .map((item) => item?.id)
      .filter(Boolean);
  }, [filteredItems]);

  const allVisibleExpanded = useMemo(() => {
    if (visibleLongItemIds.length === 0) {
      return false;
    }
    return visibleLongItemIds.every((id) => expandedMap[id] === true);
  }, [expandedMap, visibleLongItemIds]);

  const selectedIds = useMemo(() => {
    return Object.keys(selectedMap)
      .filter((id) => selectedMap[id] === true)
      .map((id) => Number(id));
  }, [selectedMap]);

  const selectedVisibleCount = useMemo(() => {
    return filteredItems.filter((item) => selectedMap[item?.id]).length;
  }, [filteredItems, selectedMap]);

  const selectedUnreadIds = useMemo(() => {
    return filteredItems
      .filter((item) => selectedMap[item?.id] && item?.is_read !== true)
      .map((item) => item.id);
  }, [filteredItems, selectedMap]);

  const allVisibleSelected = useMemo(() => {
    if (filteredItems.length === 0) {
      return false;
    }
    return filteredItems.every((item) => selectedMap[item?.id] === true);
  }, [filteredItems, selectedMap]);

  const groupedItems = useMemo(() => {
    const groups = [];
    filteredItems.forEach((item) => {
      const timestamp = Math.floor(Number(item?.created_at || 0) / 1000) * 1000;
      const dayKey = getDayKey(timestamp || Date.now());
      const lastGroup = groups[groups.length - 1];
      const relativeDay = getRelativeDayLabel(dayKey, t);
      if (!lastGroup || lastGroup.dayKey !== dayKey) {
        groups.push({
          dayKey,
          label: relativeDay.label,
          kind: relativeDay.kind,
          items: [item],
        });
        return;
      }
      lastGroup.items.push(item);
    });
    return groups;
  }, [filteredItems, t]);

  const focusText = unreadOnly
    ? t('当前仅展示未读消息，适合集中处理待办通知。')
    : unreadCount > 0
      ? t('你还有 {{count}} 条未读消息，建议优先处理重要通知。', {
          count: unreadCount,
        })
      : t('当前消息已处理完成，可以按时间回看历史通知。');

  const summaryCards = [
    {
      key: 'unread',
      label: t('未读消息'),
      value: unreadCount,
      icon: <MailOpen size={16} />,
      tone:
        'border-amber-200/80 bg-[linear-gradient(135deg,rgba(251,191,36,0.18),rgba(255,255,255,0.95))]',
    },
    {
      key: 'read',
      label: t('已处理'),
      value: readCount,
      icon: <MailCheck size={16} />,
      tone:
        'border-emerald-200/80 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(255,255,255,0.95))]',
    },
    {
      key: 'loaded',
      label: t('当前已加载'),
      value: items.length,
      icon: <Clock3 size={16} />,
      tone:
        'border-sky-200/80 bg-[linear-gradient(135deg,rgba(14,165,233,0.14),rgba(255,255,255,0.95))]',
    },
  ];

  const filterOptions = [
    {
      key: 'all',
      label: t('全部'),
      count: items.length,
    },
    {
      key: 'danger',
      label: t('重要'),
      count: levelStats.danger,
    },
    {
      key: 'warning',
      label: t('警告'),
      count: levelStats.warning,
    },
    {
      key: 'success',
      label: t('成功'),
      count: levelStats.success,
    },
    {
      key: 'info',
      label: t('普通'),
      count: levelStats.info,
    },
  ];

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

  const toggleExpanded = (id) => {
    setExpandedMap((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleExpandAllVisible = () => {
    setExpandedMap((prev) => {
      const next = { ...prev };
      visibleLongItemIds.forEach((id) => {
        next[id] = !allVisibleExpanded;
      });
      return next;
    });
  };

  const toggleSelect = (id, checked) => {
    setSelectedMap((prev) => ({
      ...prev,
      [id]: checked,
    }));
  };

  const toggleSelectAllVisible = (checked) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      filteredItems.forEach((item) => {
        next[item?.id] = checked;
      });
      return next;
    });
  };

  const handleMarkSelectedRead = async () => {
    if (selectedUnreadIds.length === 0) {
      return;
    }
    setMarking(true);
    try {
      await Promise.all(
        selectedUnreadIds.map((id) => API.post(`/api/user/notifications/${id}/read`)),
      );
      showSuccess(t('已将选中消息标记为已读'));
      setSelectedMap({});
      await fetchItems();
      await syncUnreadCount();
    } catch (error) {
      showError(error.message || t('操作失败'));
    } finally {
      setMarking(false);
    }
  };

  return (
    <div className='py-4'>
      <div className='mx-auto max-w-6xl space-y-5'>
        <section className='overflow-hidden rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#f8fbff_0%,#ffffff_45%,#ffffff_100%)] shadow-sm'>
          <div className='grid gap-6 p-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)] lg:p-8'>
            <div className='min-w-0'>
              <div className='inline-flex items-center gap-2 rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700'>
                <Bell size={15} />
                {t('站内信中心')}
              </div>
              <div className='mt-4 max-w-3xl'>
                <h1 className='text-[30px] font-semibold tracking-tight text-slate-900'>
                  {t('管理员通知、发放提醒和售后说明都集中在这里')}
                </h1>
                <Text type='secondary' className='mt-2 block text-sm leading-7 text-slate-500'>
                  {t('站内信默认保留在账户内，不依赖邮箱绑定；如管理员勾选，也可能同步发送到邮箱。')}
                </Text>
              </div>

              <div className='mt-6 grid gap-3 sm:grid-cols-3'>
                {summaryCards.map((card) => (
                  <div
                    key={card.key}
                    className={`rounded-3xl border p-4 shadow-sm backdrop-blur ${card.tone}`}
                  >
                    <div className='flex items-center justify-between text-slate-500'>
                      <span className='text-sm font-medium'>{card.label}</span>
                      <span className='inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/80 text-slate-700'>
                        {card.icon}
                      </span>
                    </div>
                    <div className='mt-3 text-3xl font-semibold tracking-tight text-slate-900'>
                      {card.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className='flex flex-col gap-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm'>
              <div>
                <div className='text-sm font-semibold text-slate-900'>
                  {t('消息处理面板')}
                </div>
                <div className='mt-1 text-sm leading-6 text-slate-500'>
                  {focusText}
                </div>
              </div>

              <Input
                prefix={<Search size={15} className='text-slate-400' />}
                placeholder={t('搜索标题或正文')}
                value={searchKeyword}
                showClear
                onChange={(value) => setSearchKeyword(value)}
                size='large'
              />

              <div className='flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3'>
                <div>
                  <div className='text-sm font-medium text-slate-900'>{t('仅看未读')}</div>
                  <div className='mt-1 text-xs text-slate-500'>
                    {t('打开后只显示未读消息，适合快速清空待处理项。')}
                  </div>
                </div>
                <Switch
                  size='small'
                  checked={unreadOnly}
                  onChange={(checked) => setUnreadOnly(Boolean(checked))}
                />
              </div>

              <div className='rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4'>
                <div className='flex items-center gap-2 text-sm font-medium text-slate-900'>
                  <ShieldAlert size={15} />
                  {t('当前视图')}
                </div>
                <div className='mt-3 flex flex-wrap gap-2'>
                  <Tag color='blue' shape='circle'>{t('共 {{total}} 条消息', { total })}</Tag>
                  <Tag color={unreadOnly ? 'orange' : 'grey'} shape='circle'>
                    {unreadOnly ? t('未读模式') : t('全部消息')}
                  </Tag>
                  <Tag color='grey' shape='circle'>
                    {levelFilter === 'all'
                      ? t('未按级别筛选')
                      : t('当前筛选：{{level}}', {
                          level: levelLabel[levelFilter] || t('全部'),
                        })}
                  </Tag>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className='grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]'>
          <section className='min-w-0 rounded-[30px] border border-[var(--semi-color-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,252,0.96))] p-4 shadow-sm lg:p-5'>
            {priorityItems.length > 0 ? (
              <div className='mb-4 rounded-[24px] border border-rose-200/70 bg-[linear-gradient(135deg,rgba(254,242,242,0.98),rgba(255,247,237,0.95))] p-4 shadow-sm'>
                <div className='flex flex-wrap items-center justify-between gap-3'>
                  <div>
                    <div className='flex items-center gap-2 text-sm font-semibold text-rose-700'>
                      <ShieldAlert size={16} />
                      {t('优先关注')}
                    </div>
                    <div className='mt-1 text-sm text-slate-600'>
                      {t('这里优先展示最近的重要与警告消息，适合先处理高优先级事项。')}
                    </div>
                  </div>
                  <div className='flex items-center gap-2'>
                    <Tag color='red' shape='circle'>
                      {t('共 {{count}} 条重点消息', { count: priorityItems.length })}
                    </Tag>
                    <Button
                      theme='borderless'
                      type='tertiary'
                      icon={priorityCollapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
                      onClick={() => setPriorityCollapsed((prev) => !prev)}
                    >
                      {priorityCollapsed ? t('展开重点消息') : t('收起重点消息')}
                    </Button>
                  </div>
                </div>
                {!priorityCollapsed ? (
                  <div className='mt-4 grid gap-3'>
                    {priorityItems.map((item) => (
                      <div
                        key={`priority-${item?.id}`}
                        className='rounded-2xl border border-white/80 bg-white/85 px-4 py-3'
                      >
                        <div className='flex flex-wrap items-center justify-between gap-3'>
                          <div className='min-w-0'>
                            <div className='flex flex-wrap items-center gap-2'>
                              <span className='truncate text-sm font-semibold text-slate-900'>
                                {item?.title || '-'}
                              </span>
                              <Tag
                                color={LEVEL_COLOR_MAP[item?.level] || 'blue'}
                                shape='circle'
                              >
                                {levelLabel[item?.level] || t('普通')}
                              </Tag>
                            </div>
                            <div className='mt-1 line-clamp-2 text-sm text-slate-500'>
                              {normalizeNotificationContent(item?.content)}
                            </div>
                          </div>
                          <div className='text-xs text-slate-400'>
                            {timestamp2string(
                              Math.floor(Number(item?.created_at || 0) / 1000),
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <div className='mb-4 rounded-[24px] border border-slate-200 bg-white px-4 py-4 shadow-sm'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <div className='text-lg font-semibold tracking-tight text-slate-900'>
                  {t('消息时间线')}
                </div>
                <div className='mt-1 text-sm text-slate-500'>
                  {t('按时间倒序展示最近消息，未读内容会优先强调。')}
                </div>
              </div>
              <div className='flex flex-wrap gap-2'>
                <Tag color='blue' shape='circle'>
                  {t('当前已加载 {{loaded}} / {{total}} 条', {
                    loaded: filteredItems.length,
                    total,
                  })}
                </Tag>
                <Tag color={unreadOnly ? 'orange' : 'grey'} shape='circle'>
                  {unreadOnly ? t('仅展示未读消息') : t('按时间倒序展示最近消息')}
                </Tag>
                {visibleLongItemIds.length > 0 ? (
                  <Button
                    theme='borderless'
                    type='tertiary'
                    icon={allVisibleExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    onClick={toggleExpandAllVisible}
                  >
                    {allVisibleExpanded ? t('全部收起') : t('全部展开')}
                  </Button>
                ) : null}
              </div>
              </div>

              <div className='mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3'>
                <div className='flex flex-wrap items-center gap-4'>
                  <Checkbox
                    checked={allVisibleSelected}
                    onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                  >
                    {t('勾选当前结果')}
                  </Checkbox>
                  <Text type='secondary' className='text-sm'>
                    {selectedVisibleCount > 0
                      ? t('已选 {{count}} 条消息', { count: selectedVisibleCount })
                      : t('未选择消息')}
                  </Text>
                </div>
                <div className='flex flex-wrap gap-2'>
                  <Button
                    icon={<RefreshCw size={14} />}
                    onClick={() => {
                      fetchItems();
                      syncUnreadCount();
                    }}
                  >
                    {t('刷新消息')}
                  </Button>
                  <Button
                    disabled={selectedUnreadIds.length === 0}
                    loading={marking}
                    onClick={handleMarkSelectedRead}
                  >
                    {t('将选中项标记已读')}
                  </Button>
                  <Button
                    theme='solid'
                    type='primary'
                    icon={<CheckCheck size={14} />}
                    disabled={unreadCount <= 0}
                    loading={marking}
                    onClick={handleReadAll}
                  >
                    {t('全部标记已读')}
                  </Button>
                </div>
              </div>
            </div>

            <div className='mb-4 flex flex-wrap gap-2'>
              {filterOptions.map((option) => {
                const active = levelFilter === option.key;
                return (
                  <button
                    key={option.key}
                    type='button'
                    onClick={() => setLevelFilter(option.key)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    <span>{option.label}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {option.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {filteredItems.length > 0 ? (
              <div className='space-y-5'>
                {groupedItems.map((group) => (
                  <section key={group.dayKey} className='space-y-3'>
                    <div
                      className={`sticky top-16 z-[1] flex items-center gap-3 rounded-2xl border px-3 py-2 backdrop-blur ${
                        group.kind === 'today'
                          ? 'border-sky-200 bg-[rgba(224,242,254,0.95)]'
                          : group.kind === 'yesterday'
                            ? 'border-amber-200 bg-[rgba(255,247,237,0.96)]'
                            : 'border-slate-200 bg-[rgba(248,250,252,0.94)]'
                      }`}
                    >
                      <div
                        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                          group.kind === 'today'
                            ? 'bg-sky-600 text-white'
                            : group.kind === 'yesterday'
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {group.label}
                      </div>
                      <div className='h-px flex-1 bg-slate-200' />
                      <div className='text-xs text-slate-400'>
                        {t('{{count}} 条消息', { count: group.items.length })}
                      </div>
                    </div>

                    <List
                      loading={loading}
                      dataSource={group.items}
                      renderItem={(item) => {
                        const isRead = item?.is_read === true;
                        const content = normalizeNotificationContent(item?.content);
                        const expanded = expandedMap[item?.id] === true;
                        const allowExpand = isLongContent(content);
                        return (
                          <List.Item
                            key={item?.id}
                            className='!px-0'
                            main={
                              <article
                                className={`group relative w-full overflow-hidden rounded-[28px] border border-l-4 p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                                  isRead
                                    ? 'border-slate-200 bg-white'
                                    : LEVEL_SURFACE_MAP[item?.level] || LEVEL_SURFACE_MAP.info
                                }`}
                              >
                                {!isRead ? (
                                  <div className='absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_0_6px_rgba(244,63,94,0.12)]' />
                                ) : null}
                                <div className='flex flex-wrap items-start justify-between gap-4'>
                                  <div className='min-w-0 flex-1'>
                                    <div className='flex flex-wrap items-center gap-2'>
                                      <Checkbox
                                        checked={selectedMap[item?.id] === true}
                                        onChange={(e) =>
                                          toggleSelect(item?.id, e.target.checked)
                                        }
                                      />
                                      <h2 className='min-w-0 truncate text-base font-semibold text-slate-900'>
                                        {item?.title || '-'}
                                      </h2>
                                      <Tag
                                        color={LEVEL_COLOR_MAP[item?.level] || 'blue'}
                                        shape='circle'
                                      >
                                        {levelLabel[item?.level] || t('普通')}
                                      </Tag>
                                      <Tag color={isRead ? 'grey' : 'red'} shape='circle'>
                                        {isRead ? t('已读') : t('未读')}
                                      </Tag>
                                    </div>
                                    <div className='mt-3 text-xs tracking-[0.18em] text-slate-400 uppercase'>
                                      {t('消息正文')}
                                    </div>
                                    <div
                                      className={`mt-2 whitespace-pre-wrap rounded-[22px] bg-white/80 px-4 py-4 text-sm leading-7 text-slate-600 ${
                                        expanded ? '' : 'line-clamp-4'
                                      }`}
                                    >
                                      {content || '-'}
                                    </div>
                                    {allowExpand ? (
                                      <button
                                        type='button'
                                        onClick={() => toggleExpanded(item?.id)}
                                        className='mt-3 inline-flex items-center gap-1 text-sm font-medium text-sky-700 transition-colors hover:text-sky-800'
                                      >
                                        {expanded ? (
                                          <>
                                            <ChevronUp size={15} />
                                            {t('收起内容')}
                                          </>
                                        ) : (
                                          <>
                                            <ChevronDown size={15} />
                                            {t('展开全文')}
                                          </>
                                        )}
                                      </button>
                                    ) : null}
                                  </div>

                                  <div className='flex min-w-[148px] flex-col items-start gap-3 sm:items-end'>
                                    <div className='rounded-2xl bg-slate-900 px-3 py-2 text-right text-xs font-medium text-slate-100 shadow-sm'>
                                      {timestamp2string(
                                        Math.floor(Number(item?.created_at || 0) / 1000),
                                      )}
                                    </div>
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
                                    ) : (
                                      <div className='text-xs text-slate-400'>
                                        {t('无需额外操作')}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </article>
                            }
                          />
                        );
                      }}
                    />
                  </section>
                ))}

                <div className='flex justify-center py-4'>
                  {hasMore ? (
                    <Button
                      loading={loadingMore}
                      onClick={() => fetchItems({ append: true, cursor: nextBeforeId })}
                    >
                      {t('加载更多')}
                    </Button>
                  ) : (
                    <Text type='tertiary'>{t('已经到底了')}</Text>
                  )}
                </div>
              </div>
            ) : (
              <Empty
                image={<Inbox size={42} className='text-[var(--semi-color-text-2)]' />}
                description={
                  levelFilter === 'all' ? t('暂无站内信') : t('当前筛选下暂无消息')
                }
                content={
                  levelFilter === 'all'
                    ? t('新的系统通知、发放提醒和售后消息会显示在这里。')
                    : t('可以切换其他消息级别，或关闭未读筛选后再查看。')
                }
                style={{ padding: 24 }}
              />
            )}
          </section>

          <aside className='space-y-4'>
            <Banner
              type='info'
              closeIcon={null}
              description={t(
                '站内信默认保留在账户内，不依赖邮箱绑定；如管理员勾选，也可能同步发送到邮箱。',
              )}
            />

            <div className='rounded-[28px] border border-[var(--semi-color-border)] bg-white p-5 shadow-sm'>
              <div className='flex items-center gap-2 text-sm font-semibold text-slate-900'>
                <Bell size={16} />
                {t('阅读建议')}
              </div>
              <div className='mt-4 space-y-3 text-sm leading-6 text-slate-500'>
                <div className='rounded-2xl bg-slate-50 px-4 py-3'>
                  {t('优先处理“重要”与“警告”级别消息，通常包含发放结果和关键售后说明。')}
                </div>
                <div className='rounded-2xl bg-slate-50 px-4 py-3'>
                  {t('若消息较多，可先开启“仅看未读”，再使用批量已读快速清空。')}
                </div>
                <div className='rounded-2xl bg-slate-50 px-4 py-3'>
                  {t('需要历史记录时，关闭未读筛选即可回看全部站内信。')}
                </div>
                <div className='rounded-2xl bg-slate-50 px-4 py-3'>
                  {t('若想快速定位高优先级内容，可直接点击“重要”或“警告”筛选。')}
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
