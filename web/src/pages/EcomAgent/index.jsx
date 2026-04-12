import React, { useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Collapse,
  Descriptions,
  Empty,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Radio,
  RadioGroup,
  Select,
  SideSheet,
  Space,
  TabPane,
  Tag,
  Tabs,
  TextArea,
  Tooltip,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IconDelete,
  IconEdit,
  IconEyeOpened,
  IconHistory,
  IconRefresh,
  IconSend,
} from '@douyinfe/semi-icons';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import {
  API,
  renderQuota,
  showError,
  showSuccess,
  timestamp2string,
} from '../../helpers';
import CardPro from '../../components/common/ui/CardPro';
import CardTable from '../../components/common/ui/CardTable';
import { createCardProPagination } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';
import {
  formatSubscriptionResetPeriod,
  formatSubscriptionResourceLabel,
  getSubscriptionUsageSummary,
} from '../../helpers/subscriptionFormat';

const { Text } = Typography;

const defaultFormState = {
  email: '',
  password: '',
  account_id: '',
  access_token: '',
  refresh_token: '',
  access_token_expires_at: '',
  session_json: '',
  base_url: 'https://ecomagent.in',
  supabase_auth_url: 'https://zwggawnojtjiaklycfhc.supabase.co/auth/v1',
  supabase_anon_key:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3Z2dhd25vanRqaWFrbHljZmhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMzU3NDUsImV4cCI6MjA4NzYxMTc0NX0.-pQHomLNGWL7OvQpHL2_7T_NwI4wAzyNYMOknX_YJSE',
  confirm_url: '',
  assignment_status: 'unassigned',
  assigned_plan: '',
  assigned_subscription_order_id: '',
  assigned_channel_id: '',
  assigned_channel_key_index: '',
  assigned_user_subscription_id: '',
  assigned_at: '',
  tags: '',
  remark: '',
};

const PLAN_LABEL_MAP = {
  'free trial': 'Free Trial',
  mini: 'Mini',
  'mini plus': 'Mini Plus',
  'mini max': 'Mini Max',
  premium: 'Premium',
  'premium+': 'Premium+',
};

const PLAN_FILTER_ORDER = [
  'free trial',
  'mini',
  'mini plus',
  'mini max',
  'premium',
  'premium+',
];

const ASSIGNMENT_STATUS_OPTIONS = [
  { value: '', labelKey: '全部分配状态' },
  { value: 'unassigned', labelKey: '未分配' },
  { value: 'assigned', labelKey: '已分配' },
];

const CHANNEL_BINDING_OPTIONS = [
  { value: '', labelKey: '全部渠道关联' },
  { value: 'linked', labelKey: '已关联渠道' },
  { value: 'unlinked', labelKey: '未关联渠道' },
];

const ORDER_BINDING_OPTIONS = [
  { value: '', labelKey: '全部订单关联' },
  { value: 'linked', labelKey: '已关联订单' },
  { value: 'unlinked', labelKey: '未关联订单' },
];

function normalizePlanValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function getPlanLabel(plan) {
  const normalizedPlan = normalizePlanValue(plan);
  return PLAN_LABEL_MAP[normalizedPlan] || String(plan || '').trim() || '-';
}

function normalizeAssignmentStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function getAssignmentStatusLabel(status, t) {
  if (normalizeAssignmentStatus(status) === 'assigned') {
    return t('已分配');
  }
  return t('未分配');
}

function parseTags(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasAssignedChannel(record) {
  return Number(record?.assigned_channel_id || 0) > 0;
}

function getAssignedChannelLabel(record, t) {
  if (!hasAssignedChannel(record)) {
    return t('未关联渠道');
  }
  const channelLabel = `${t('渠道')} #${record.assigned_channel_id}`;
  if (Number(record?.assigned_channel_key_index) >= 0) {
    return `${channelLabel} / Key #${record.assigned_channel_key_index}`;
  }
  return channelLabel;
}

function getAssignedOrderLabel(record, t) {
  const orderId = Number(record?.assigned_subscription_order_id || 0);
  if (orderId <= 0) {
    return t('未关联订单');
  }
  return `${t('人工发放订单')} #${orderId}`;
}

function hasAssignedOrder(record) {
  return Number(record?.assigned_subscription_order_id || 0) > 0;
}

function buildManualOrderOptionLabel(item, t) {
  const order = item?.order || {};
  const username = item?.username || '-';
  const planTitle = order?.plan_title || item?.plan?.title || '-';
  const userId = Number(order?.user_id || 0);
  const userLabel = userId > 0 ? `UID ${userId}` : 'UID -';
  return `#${order?.id || '-'} · ${userLabel} · ${username} · ${planTitle}`;
}

function buildAssignmentFormFromRecord(record) {
  return {
    assignment_status:
      normalizeAssignmentStatus(record?.assignment_status) || 'unassigned',
    assigned_plan: record?.assigned_plan || '',
    assigned_subscription_order_id:
      record?.assigned_subscription_order_id > 0
        ? String(record.assigned_subscription_order_id)
        : '',
    assigned_channel_id:
      record?.assigned_channel_id > 0 ? String(record.assigned_channel_id) : '',
    assigned_channel_key_index:
      Number(record?.assigned_channel_key_index) >= 0
        ? String(record.assigned_channel_key_index)
        : '',
    assigned_user_subscription_id:
      record?.assigned_user_subscription_id > 0
        ? String(record.assigned_user_subscription_id)
        : '',
    assigned_at: record?.assigned_at ? String(record.assigned_at) : '',
    tags: record?.tags || '',
    remark: record?.remark || '',
  };
}

function buildEditableSessionJSON(record) {
  const sessionText = String(record?.session_json || '').trim();
  if (sessionText) return sessionText;
  const accessToken = String(record?.access_token || '').trim();
  const refreshToken = String(record?.refresh_token || '').trim();
  const accountId = String(record?.account_id || '').trim();
  const email = String(record?.email || '').trim();
  const expiresAt = Number(record?.access_token_expires_at || 0);
  if (!accessToken && !refreshToken && !accountId && !email && expiresAt <= 0) {
    return '';
  }
  return JSON.stringify(
    {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt || 0,
      user: {
        id: accountId,
        email,
      },
    },
    null,
    2,
  );
}

function buildFormFromAccountRecord(record) {
  return {
    email: record?.email || '',
    password: '',
    account_id: record?.account_id || '',
    access_token: record?.access_token || '',
    refresh_token: record?.refresh_token || '',
    access_token_expires_at: record?.access_token_expires_at || '',
    session_json: buildEditableSessionJSON(record),
    base_url: record?.base_url || defaultFormState.base_url,
    supabase_auth_url:
      record?.supabase_auth_url || defaultFormState.supabase_auth_url,
    supabase_anon_key:
      record?.supabase_anon_key || defaultFormState.supabase_anon_key,
    confirm_url: record?.confirm_url || '',
    assignment_status:
      normalizeAssignmentStatus(record?.assignment_status) || 'unassigned',
    assigned_plan: record?.assigned_plan || '',
    assigned_subscription_order_id:
      record?.assigned_subscription_order_id > 0
        ? String(record.assigned_subscription_order_id)
        : '',
    assigned_channel_id:
      record?.assigned_channel_id > 0 ? String(record.assigned_channel_id) : '',
    assigned_channel_key_index:
      Number(record?.assigned_channel_key_index) >= 0
        ? String(record.assigned_channel_key_index)
        : '',
    assigned_user_subscription_id:
      record?.assigned_user_subscription_id > 0
        ? String(record.assigned_user_subscription_id)
        : '',
    assigned_at: record?.assigned_at ? String(record.assigned_at) : '',
    tags: record?.tags || '',
    remark: record?.remark || '',
  };
}

function inferLoginModeFromRecord(record) {
  if (
    record &&
    (String(record.account_id || '').trim() ||
      record.has_access_token ||
      record.has_refresh_token)
  ) {
    return 'token';
  }
  if (String(record?.session_json || '').trim()) {
    return 'session';
  }
  return 'password';
}

function credentialLabel(saved, maskedValue, t) {
  if (!saved) return t('未保存');
  return maskedValue || t('已保存');
}

function maskMiddle(value, start = 3, end = 2) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= start + end) {
    return `${text.slice(0, 1)}***${text.slice(-1)}`;
  }
  return `${text.slice(0, start)}***${text.slice(-end)}`;
}

function maskEmail(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const [localPart, domain = ''] = text.split('@');
  if (!domain) {
    return maskMiddle(text, 2, 1);
  }
  const maskedLocal =
    localPart.length <= 2
      ? `${localPart.slice(0, 1)}***`
      : `${localPart.slice(0, 2)}***${localPart.slice(-1)}`;
  return `${maskedLocal}@fishxcode.com`;
}

function maskApiKey(value) {
  return maskMiddle(value, 6, 4);
}

function formatTs(ts) {
  if (!ts) return '-';
  return timestamp2string(ts);
}

function parseRawJSON(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getSubscriptionData(record) {
  return parseRawJSON(record.subscription_raw)?.subscription || {};
}

function getUsageData(record) {
  return parseRawJSON(record.usage_raw)?.usage || {};
}

function getModelBreakdown(record) {
  const modelBreakdown = getUsageData(record)?.modelBreakdown;
  return Array.isArray(modelBreakdown) ? modelBreakdown : [];
}

function getRecentLogs(record) {
  const recentLogs = getUsageData(record)?.recentLogs;
  return Array.isArray(recentLogs) ? recentLogs : [];
}

function getUsedRequests(record) {
  const directValue = Number(record.usage_requests || 0);
  if (directValue > 0) return directValue;
  return getModelBreakdown(record).reduce(
    (sum, item) => sum + Number(item?.requests || 0),
    0,
  );
}

function getUsedTokens(record) {
  const directValue = Number(record.usage_tokens || 0);
  if (directValue > 0) return directValue;
  return getModelBreakdown(record).reduce(
    (sum, item) => sum + Number(item?.tokens || 0),
    0,
  );
}

function getRequestLimit(record) {
  const directValue = Number(record.request_limit || 0);
  if (directValue > 0) return directValue;
  const subscription = getSubscriptionData(record);
  return Number(subscription?.requestLimit || 0);
}

function getRequestLimitLabel(record) {
  const directValue = Number(record.request_limit || 0);
  if (directValue > 0) return String(directValue);
  const subscription = getSubscriptionData(record);
  const subscriptionValue = String(subscription?.requestLimit || '').trim();
  if (subscriptionValue) return subscriptionValue;
  return '0';
}

function getTokenLimitLabel(record, t) {
  const subscription = getSubscriptionData(record);
  const tokenLimit = subscription?.tokenLimit;
  if (typeof tokenLimit === 'string' && tokenLimit.trim()) {
    return tokenLimit.trim();
  }
  const directValue = Number(record.token_limit || 0);
  if (directValue > 0) return String(directValue);
  return record.plan ? t('无限制') : '0';
}

function getPlanType(record, t) {
  if (getRequestLimit(record) > 0) return t('按次套餐');
  if (Number(record.token_limit || 0) > 0) return t('Token套餐');
  return '-';
}

function getAccountSummary(record, t) {
  const status = record.status || '-';
  const plan = getPlanLabel(record.plan);
  const remain = getRequestRemain(record);
  return `${status} / ${plan} / ${t('剩余请求')}: ${remain} / ${getAssignmentStatusLabel(record.assignment_status, t)}`;
}

function usageSummary(record, t) {
  const requestLimit = getRequestLimit(record);
  const usedRequests = getUsedRequests(record);
  const usedTokens = getUsedTokens(record);
  return [
    `${t('套餐')}: ${getPlanLabel(record.plan)}`,
    `${t('套餐类型')}: ${getPlanType(record, t)}`,
    `${t('请求额度')}: ${requestLimit || 0}`,
    `${t('Token额度')}: ${getTokenLimitLabel(record, t)}`,
    `${t('已用请求')}: ${usedRequests}`,
    `${t('已用Tokens')}: ${usedTokens}`,
  ].join(' / ');
}

function formatManualDeliveryBenefit(plan, t) {
  if (!plan) return '-';
  const usageSummary = getSubscriptionUsageSummary(plan);
  const resourceLabel = formatSubscriptionResourceLabel(plan, t);
  const resetPeriod = formatSubscriptionResetPeriod(plan, t);

  if (usageSummary.unlimited) {
    return `${resourceLabel}: ${t('不限')}`;
  }

  if (usageSummary.resourceType === 'request_count') {
    const totalText = `${Number(usageSummary.total || 0)} ${t('次')}`;
    if (resetPeriod === t('不重置')) {
      return `${resourceLabel}: ${totalText}`;
    }
    return `${resourceLabel}: ${totalText} / ${t('重置')} ${resetPeriod}`;
  }

  const totalText = renderQuota(Number(usageSummary.total || 0));
  if (resetPeriod === t('不重置')) {
    return `${resourceLabel}: ${totalText}`;
  }
  return `${resourceLabel}: ${totalText} / ${t('重置')} ${resetPeriod}`;
}

function getRequestRemain(record) {
  const requestLimit = getRequestLimit(record);
  if (requestLimit <= 0) return 0;
  return Math.max(0, requestLimit - getUsedRequests(record));
}

function getBatchFailureMessage(results, recordsById, t) {
  const failures = results
    .map((item, index) => {
      const id = item.id;
      const label = recordsById.get(id)?.email || `#${id}`;

      if (item.status === 'fulfilled' && item.value?.data?.success) {
        return null;
      }

      if (item.status === 'fulfilled') {
        return `${label}: ${item.value?.data?.message || t('未知错误')}`;
      }

      return (
        `${label}: ` +
        (item.reason?.response?.data?.message ||
          item.reason?.message ||
          t('未知错误'))
      );
    })
    .filter(Boolean);

  if (failures.length === 0) return '';
  return failures.slice(0, 3).join('；');
}

const EcomAgentPage = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [accounts, setAccounts] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);
  const [channels, setChannels] = useState([]);
  const [manualOrders, setManualOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncingId, setSyncingId] = useState(null);
  const [deliveringId, setDeliveringId] = useState(null);
  const [batchSyncing, setBatchSyncing] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(null);
  const [detailRecord, setDetailRecord] = useState(null);
  const [assignmentRecord, setAssignmentRecord] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState(
    buildAssignmentFormFromRecord(null),
  );
  const [historyRecord, setHistoryRecord] = useState(null);
  const [form, setForm] = useState(defaultFormState);
  const [loginMode, setLoginMode] = useState('password');
  const [formTab, setFormTab] = useState('login');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [assignmentStatusFilter, setAssignmentStatusFilter] = useState('');
  const [channelBindingFilter, setChannelBindingFilter] = useState('');
  const [orderBindingFilter, setOrderBindingFilter] = useState('');
  const [historyPage, setHistoryPage] = useState(1);
  const historyPageSize = 10;

  const handleCopy = async (value, successMessage) => {
    if (!value) {
      showError(t('无可复制内容'));
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(successMessage || t('复制成功'));
    } catch (error) {
      showError(error?.message || t('复制失败'));
    }
  };

  const openHistory = (record) => {
    setHistoryRecord(record);
    setHistoryPage(1);
  };

  const openDetail = (record) => {
    setDetailRecord(record);
  };

  const openAssignment = (record) => {
    setDetailRecord(null);
    setAssignmentRecord(record);
    setAssignmentForm(buildAssignmentFormFromRecord(record));
  };

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/ecomagent/accounts');
      if (res.data.success) {
        const nextAccounts = res.data.data || [];
        setAccounts(nextAccounts);
        if (detailRecord?.id) {
          const nextDetail = nextAccounts.find(
            (item) => item.id === detailRecord.id,
          );
          if (nextDetail) {
            setDetailRecord(nextDetail);
          } else {
            setDetailRecord(null);
          }
        }
        if (assignmentRecord?.id) {
          const nextAssignment = nextAccounts.find(
            (item) => item.id === assignmentRecord.id,
          );
          if (nextAssignment) {
            setAssignmentRecord(nextAssignment);
            setAssignmentForm(buildAssignmentFormFromRecord(nextAssignment));
          } else {
            setAssignmentRecord(null);
            setAssignmentForm(buildAssignmentFormFromRecord(null));
          }
        }
        return nextAccounts;
      } else {
        showError(res.data.message || t('加载失败'));
      }
    } catch (error) {
      showError(error?.message || t('加载失败'));
    } finally {
      setLoading(false);
    }
    return [];
  };

  const loadAssignmentMeta = async () => {
    const [plansRes, channelsRes, manualOrdersRes] = await Promise.allSettled([
      API.get('/api/subscription/plans', { skipErrorHandler: true }),
      API.get('/api/channel/', {
        params: { p: 1, page_size: 100, id_sort: true },
        skipErrorHandler: true,
      }),
      API.get('/api/ecomagent/manual_orders', {
        params: { p: 1, page_size: 200, fulfillment_status: 'pending_delivery' },
        skipErrorHandler: true,
      }),
    ]);

    if (plansRes.status === 'fulfilled' && plansRes.value.data?.success) {
      const nextPlans = (plansRes.value.data.data || [])
        .map((item) => item?.plan)
        .filter((plan) => plan?.id);
      setSubscriptionPlans(nextPlans);
    } else {
      setSubscriptionPlans([]);
    }

    if (channelsRes.status === 'fulfilled' && channelsRes.value.data?.success) {
      setChannels(channelsRes.value.data?.data?.items || []);
    } else {
      setChannels([]);
    }

    if (
      manualOrdersRes.status === 'fulfilled' &&
      manualOrdersRes.value.data?.success
    ) {
      setManualOrders(
        (manualOrdersRes.value.data?.data?.items || []).filter(
          (item) => item?.order?.id,
        ),
      );
    } else {
      setManualOrders([]);
    }
  };

  useEffect(() => {
    loadAccounts();
    loadAssignmentMeta();
  }, []);

  const assignPlanOptions = useMemo(() => {
    const options = (subscriptionPlans || []).map((plan) => ({
      label: `${plan.title || `#${plan.id}`} (#${plan.id})`,
      value: plan.title || '',
    }));
    const currentPlan = assignmentForm.assigned_plan?.trim();
    if (currentPlan && !options.some((item) => item.value === currentPlan)) {
      options.unshift({ label: `${currentPlan} (${t('当前值')})`, value: currentPlan });
    }
    return options.filter((item) => item.value);
  }, [assignmentForm.assigned_plan, subscriptionPlans, t]);

  const channelOptions = useMemo(() => {
    return (channels || []).map((channel) => {
      const extra = [channel.name, channel.tag, channel.group].filter(Boolean).join(' / ');
      return {
        label: extra
          ? `#${channel.id} · ${extra}`
          : `#${channel.id}`,
        value: String(channel.id),
      };
    });
  }, [channels]);

  const manualOrderOptions = useMemo(() => {
    const options = (manualOrders || []).map((item) => ({
      label: buildManualOrderOptionLabel(item, t),
      value: String(item.order.id),
      planTitle: item?.order?.plan_title || item?.plan?.title || '',
    }));
    const currentValue = String(
      assignmentForm.assigned_subscription_order_id || '',
    ).trim();
    if (currentValue && !options.some((item) => item.value === currentValue)) {
      options.unshift({
        label: `#${currentValue} (${t('当前值')})`,
        value: currentValue,
        planTitle: assignmentForm.assigned_plan || '',
      });
    }
    return options;
  }, [
    assignmentForm.assigned_plan,
    assignmentForm.assigned_subscription_order_id,
    manualOrders,
    t,
  ]);

  const selectedAssignedChannel = useMemo(
    () =>
      channels.find(
        (channel) =>
          String(channel.id) === String(assignmentForm.assigned_channel_id),
      ) || null,
    [assignmentForm.assigned_channel_id, channels],
  );

  const selectedManualOrder = useMemo(() => {
    const selectedOrderId = String(
      assignmentForm.assigned_subscription_order_id || '',
    ).trim();
    if (!selectedOrderId) return null;
    return (
      manualOrders.find(
        (item) => String(item?.order?.id || '') === selectedOrderId,
      ) || null
    );
  }, [assignmentForm.assigned_subscription_order_id, manualOrders]);

  const selectedManualPlan =
    selectedManualOrder?.plan || selectedManualOrder?.order || null;

  const assignedChannelKeyOptions = useMemo(() => {
    if (!selectedAssignedChannel) return [];
    const isMultiKey = Boolean(selectedAssignedChannel.channel_info?.is_multi_key);
    const multiKeySize = Number(
      selectedAssignedChannel.channel_info?.multi_key_size || 0,
    );
    const total = isMultiKey ? Math.max(multiKeySize, 0) : 1;
    const currentUserId = Number(selectedManualOrder?.order?.user_id || 0);
    const currentUsername = String(selectedManualOrder?.username || '').trim();
    const userSuffix = currentUserId > 0
      ? ` · UID ${currentUserId}${currentUsername ? ` · ${currentUsername}` : ''}`
      : '';
    return Array.from({ length: total }, (_, index) => ({
      label: `Key #${index}${userSuffix}`,
      value: String(index),
    }));
  }, [selectedAssignedChannel, selectedManualOrder]);

  useEffect(() => {
    if (!selectedAssignedChannel) {
      return;
    }
    if (
      assignedChannelKeyOptions.length > 0 &&
      assignmentForm.assigned_channel_key_index !== '' &&
      !assignedChannelKeyOptions.some(
        (item) => item.value === String(assignmentForm.assigned_channel_key_index),
      )
    ) {
      setAssignmentForm((prev) => ({ ...prev, assigned_channel_key_index: '' }));
    }
  }, [
    assignedChannelKeyOptions,
    assignmentForm.assigned_channel_key_index,
    selectedAssignedChannel,
  ]);

  const planFilterOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        accounts
          .map((record) => normalizePlanValue(record.plan))
          .filter(Boolean),
      ),
    );
    values.sort((a, b) => {
      const indexA = PLAN_FILTER_ORDER.indexOf(a);
      const indexB = PLAN_FILTER_ORDER.indexOf(b);
      if (indexA === -1 && indexB === -1) {
        return a.localeCompare(b);
      }
      if (indexA === -1) {
        return 1;
      }
      if (indexB === -1) {
        return -1;
      }
      return indexA - indexB;
    });
    return values.map((value) => ({
      label: getPlanLabel(value),
      value,
    }));
  }, [accounts]);

  const statusFilterOptions = useMemo(() => {
    const values = Array.from(
      new Set(
        accounts
          .map((record) => String(record.status || '').trim())
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return values.map((value) => ({
      label: value,
      value,
    }));
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLowerCase();
    return accounts.filter((record) => {
      const matchesPlan =
        !planFilter || normalizePlanValue(record.plan) === planFilter;
      const matchesStatus = !statusFilter || String(record.status || '') === statusFilter;
      const matchesAssignmentStatus =
        !assignmentStatusFilter ||
        normalizeAssignmentStatus(record.assignment_status) ===
          assignmentStatusFilter;
      const matchesChannelBinding =
        !channelBindingFilter ||
        (channelBindingFilter === 'linked'
          ? hasAssignedChannel(record)
          : !hasAssignedChannel(record));
      const matchesOrderBinding =
        !orderBindingFilter ||
        (orderBindingFilter === 'linked'
          ? hasAssignedOrder(record)
          : !hasAssignedOrder(record));
      if (
        !matchesPlan ||
        !matchesStatus ||
        !matchesAssignmentStatus ||
        !matchesChannelBinding ||
        !matchesOrderBinding
      ) {
        return false;
      }
      if (!normalizedKeyword) {
        return true;
      }
      const searchSource = [
        record.email,
        record.account_id,
        record.status,
        record.assignment_status,
        getAssignmentStatusLabel(record.assignment_status, t),
        record.plan,
        getPlanLabel(record.plan),
        getPlanType(record, t),
        record.assigned_plan,
        String(record.assigned_subscription_order_id || ''),
        record.tags,
        record.remark,
        String(record.assigned_channel_id || ''),
        String(record.assigned_channel_key_index || ''),
        String(record.assigned_user_subscription_id || ''),
        getAssignedChannelLabel(record, t),
        getAssignedOrderLabel(record, t),
        getSubscriptionData(record)?.apiKeyName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return searchSource.includes(normalizedKeyword);
    });
  }, [
    accounts,
    assignmentStatusFilter,
    channelBindingFilter,
    keyword,
    orderBindingFilter,
    planFilter,
    statusFilter,
    t,
  ]);

  const hasActiveFilters =
    keyword.trim() ||
    planFilter ||
    statusFilter ||
    assignmentStatusFilter ||
    channelBindingFilter ||
    orderBindingFilter;

  const resetFilters = () => {
    setKeyword('');
    setPlanFilter('');
    setStatusFilter('');
    setAssignmentStatusFilter('');
    setChannelBindingFilter('');
    setOrderBindingFilter('');
    setCurrentPage(1);
  };

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredAccounts.length / pageSize));
    if (currentPage > maxPage) {
      setCurrentPage(maxPage);
    }
  }, [currentPage, filteredAccounts.length, pageSize]);

  useEffect(() => {
    setSelectedRowKeys((prev) =>
      prev.filter((key) => accounts.some((account) => account.id === key)),
    );
  }, [accounts]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...defaultFormState });
    setLoginMode('password');
    setFormTab('login');
    setVisible(true);
  };

  const openEdit = async (record) => {
    let editableRecord = record;
    try {
      const res = await API.post(`/api/ecomagent/accounts/${record.id}/edit`, {}, {
        skipErrorHandler: true,
      });
      if (res.data?.success && res.data?.data) {
        editableRecord = { ...record, ...res.data.data };
      }
    } catch (error) {
      showError(error?.response?.data?.message || error?.message || t('加载失败'));
    }
    setEditing(editableRecord);
    setFormTab('login');
    setForm(buildFormFromAccountRecord(editableRecord));
    setLoginMode(inferLoginModeFromRecord(editableRecord));
    setVisible(true);
  };

  const handleSave = async () => {
    const hasImportedSession =
      form.session_json.trim() ||
      form.access_token.trim() ||
      form.refresh_token.trim();
    const hasExistingImportedAuth =
      Boolean(editing?.account_id) ||
      Boolean(editing?.has_access_token) ||
      Boolean(editing?.has_refresh_token);
    if (!form.email.trim() && !hasImportedSession && !hasExistingImportedAuth) {
      showError(t('邮箱不能为空'));
      return;
    }
    if (!editing && !form.password.trim() && !hasImportedSession) {
      showError(t('密码或登录态至少填写一种'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        email: form.email.trim(),
        account_id: form.account_id.trim(),
        access_token: form.access_token.trim(),
        refresh_token: form.refresh_token.trim(),
        session_json: form.session_json.trim(),
        base_url: form.base_url.trim(),
        supabase_auth_url: form.supabase_auth_url.trim(),
        supabase_anon_key: form.supabase_anon_key.trim(),
        confirm_url: form.confirm_url.trim(),
        assignment_status:
          normalizeAssignmentStatus(form.assignment_status) || 'unassigned',
        assigned_plan: form.assigned_plan.trim(),
        tags: form.tags.trim(),
        remark: form.remark.trim(),
      };
      if (form.access_token_expires_at !== '') {
        payload.access_token_expires_at = Number(form.access_token_expires_at) || 0;
      }
      payload.assigned_channel_id =
        form.assigned_channel_id !== ''
          ? Number(form.assigned_channel_id) || 0
          : '';
      payload.assigned_subscription_order_id =
        form.assigned_subscription_order_id !== ''
          ? Number(form.assigned_subscription_order_id) || 0
          : '';
      payload.assigned_channel_key_index =
        form.assigned_channel_key_index !== ''
          ? Number(form.assigned_channel_key_index) || 0
          : '';
      payload.assigned_user_subscription_id =
        form.assigned_user_subscription_id !== ''
          ? Number(form.assigned_user_subscription_id) || 0
          : '';
      payload.assigned_at =
        form.assigned_at !== '' ? Number(form.assigned_at) || 0 : '';
      if (!editing || form.password.trim()) {
        payload.password = form.password.trim();
      }
      const res = editing
        ? await API.put(`/api/ecomagent/accounts/${editing.id}`, payload)
        : await API.post('/api/ecomagent/accounts', payload);
      if (res.data.success) {
        showSuccess(editing ? t('更新成功') : t('创建成功'));
        setVisible(false);
        await loadAccounts();
      } else {
        showError(res.data.message || t('保存失败'));
      }
    } catch (error) {
      showError(error?.message || t('保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async (record) => {
    setSyncingId(record.id);
    try {
      const res = await API.post(`/api/ecomagent/accounts/${record.id}/sync`);
      if (res.data.success) {
        showSuccess(t('同步完成'));
      } else {
        showError(res.data.message || t('同步失败'));
      }
      await loadAccounts();
    } catch (error) {
      showError(error?.message || t('同步失败'));
      await loadAccounts();
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (record) => {
    try {
      const res = await API.delete(`/api/ecomagent/accounts/${record.id}`);
      if (res.data.success) {
        showSuccess(t('删除成功'));
        await loadAccounts();
      } else {
        showError(res.data.message || t('删除失败'));
      }
    } catch (error) {
      showError(error?.message || t('删除失败'));
    }
  };

  const handleSaveAssignment = async () => {
    if (!assignmentRecord?.id) {
      showError(t('请先保存当前账号'));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        assignment_status:
          normalizeAssignmentStatus(assignmentForm.assignment_status) ||
          'unassigned',
        assigned_plan: String(assignmentForm.assigned_plan || '').trim(),
        assigned_subscription_order_id:
          assignmentForm.assigned_subscription_order_id !== ''
            ? Number(assignmentForm.assigned_subscription_order_id) || 0
            : '',
        assigned_channel_id:
          assignmentForm.assigned_channel_id !== ''
            ? Number(assignmentForm.assigned_channel_id) || 0
            : '',
        assigned_channel_key_index:
          assignmentForm.assigned_channel_key_index !== ''
            ? Number(assignmentForm.assigned_channel_key_index) || 0
            : '',
        assigned_user_subscription_id:
          assignmentForm.assigned_user_subscription_id !== ''
            ? Number(assignmentForm.assigned_user_subscription_id) || 0
            : '',
        assigned_at:
          assignmentForm.assigned_at !== ''
            ? Number(assignmentForm.assigned_at) || 0
            : '',
        tags: String(assignmentForm.tags || '').trim(),
        remark: String(assignmentForm.remark || '').trim(),
      };
      const res = await API.put(
        `/api/ecomagent/accounts/${assignmentRecord.id}`,
        payload,
      );
      if (res.data?.success) {
        showSuccess(t('更新成功'));
        await Promise.all([loadAccounts(), loadAssignmentMeta()]);
      } else {
        showError(res.data?.message || t('保存失败'));
      }
    } catch (error) {
      showError(error?.message || t('保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeliverLinkedOrder = async () => {
    if (!assignmentRecord?.id) {
      showError(t('请先保存当前账号'));
      return;
    }
    const orderId = Number(assignmentForm.assigned_subscription_order_id || 0);
    if (orderId <= 0) {
      showError(t('请先关联人工发放订单'));
      return;
    }
    setDeliveringId(assignmentRecord.id);
    try {
      const res = await API.post(
        `/api/ecomagent/accounts/${assignmentRecord.id}/deliver_manual_order`,
        {
          order_id: orderId,
          admin_remark: t('由 EcomAgent 账户发放'),
        },
      );
      if (res.data?.success) {
        showSuccess(t('发放成功并已回写关联信息'));
        await Promise.all([loadAccounts(), loadAssignmentMeta()]);
      } else {
        showError(res.data?.message || t('发放失败'));
      }
    } catch (error) {
      showError(error?.response?.data?.message || error?.message || t('发放失败'));
    } finally {
      setDeliveringId(null);
    }
  };

  const confirmDelete = (record) => {
    Modal.confirm({
      title: t('确认删除'),
      content: record?.email || '-',
      okText: t('确认删除'),
      cancelText: t('取消'),
      okButtonProps: { color: 'red' },
      onOk: () => handleDelete(record),
    });
  };

  const handleBatchSync = async () => {
    if (selectedRowKeys.length === 0) return;
    setBatchSyncing(true);
    try {
      const recordsById = new Map(accounts.map((account) => [account.id, account]));
      const results = await Promise.all(
        selectedRowKeys.map(async (id) => {
          try {
            const value = await API.post(`/api/ecomagent/accounts/${id}/sync`);
            return { id, status: 'fulfilled', value };
          } catch (reason) {
            return { id, status: 'rejected', reason };
          }
        }),
      );
      const success = results.filter(
        (item) => item.status === 'fulfilled' && item.value?.data?.success,
      ).length;
      const failed = results.length - success;
      const failureMessage = getBatchFailureMessage(results, recordsById, t);
      if (failed > 0) {
        showError(
          [t('批量同步完成，成功 {{success}} 个，失败 {{failed}} 个。', { success, failed }), failureMessage]
            .filter(Boolean)
            .join(' '),
        );
      } else {
        showSuccess(t('批量同步完成，成功 {{success}} 个，失败 {{failed}} 个。', { success, failed }));
      }
      await loadAccounts();
    } finally {
      setBatchSyncing(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedRowKeys.length === 0) return;
    setBatchDeleting(true);
    try {
      const recordsById = new Map(accounts.map((account) => [account.id, account]));
      const results = await Promise.all(
        selectedRowKeys.map(async (id) => {
          try {
            const value = await API.delete(`/api/ecomagent/accounts/${id}`);
            return { id, status: 'fulfilled', value };
          } catch (reason) {
            return { id, status: 'rejected', reason };
          }
        }),
      );
      const success = results.filter(
        (item) => item.status === 'fulfilled' && item.value?.data?.success,
      ).length;
      const failed = results.length - success;
      const failureMessage = getBatchFailureMessage(results, recordsById, t);
      if (success > 0) {
        setSelectedRowKeys([]);
      }
      if (failed > 0) {
        showError(
          [t('批量删除完成，成功 {{success}} 个，失败 {{failed}} 个。', { success, failed }), failureMessage]
            .filter(Boolean)
            .join(' '),
        );
      } else {
        showSuccess(t('批量删除完成，成功 {{success}} 个，失败 {{failed}} 个。', { success, failed }));
      }
      await loadAccounts();
    } finally {
      setBatchDeleting(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: t('账户'),
        dataIndex: 'email',
        width: isMobile ? 240 : 280,
        render: (_, record) => (
          <div className='flex flex-col gap-1 min-w-0'>
            <Text
              strong
              ellipsis={{ showTooltip: true }}
              style={{ maxWidth: isMobile ? 170 : 220 }}
            >
              {maskEmail(record.email) || '-'}
            </Text>
            <Text size='small' type='tertiary' ellipsis={{ showTooltip: true }}>
              {getAccountSummary(record, t)}
            </Text>
            <div className='flex items-center gap-1 flex-wrap'>
              <Tag
                color={
                  normalizeAssignmentStatus(record.assignment_status) === 'assigned'
                    ? 'green'
                    : 'grey'
                }
                size='small'
              >
                {getAssignmentStatusLabel(record.assignment_status, t)}
              </Tag>
              <Tag color='blue' size='small'>
                {getAssignedChannelLabel(record, t)}
              </Tag>
              <Tag color='cyan' size='small'>
                {getAssignedOrderLabel(record, t)}
              </Tag>
              {parseTags(record.tags)
                .slice(0, 2)
                .map((tag) => (
                  <Tag key={tag} size='small'>
                    {tag}
                  </Tag>
                ))}
            </div>
          </div>
        ),
      },
      {
        title: t('API Key'),
        dataIndex: 'api_key',
        width: isMobile ? 220 : 260,
        render: (_, record) => (
          <div className='min-w-0'>
            {record.api_key ? (
              <Text
                size='small'
                copyable={{
                  content: record.api_key,
                  onCopy: () => showSuccess(t('API Key 已复制')),
                }}
                ellipsis={{ showTooltip: true }}
                style={{ maxWidth: isMobile ? 180 : 220 }}
              >
                {maskApiKey(record.api_key)}
              </Text>
            ) : (
              <Text size='small' type='tertiary'>
                -
              </Text>
            )}
          </div>
        ),
      },
      {
        title: t('操作'),
        dataIndex: 'id',
        width: isMobile ? 220 : 260,
        render: (_, record) => (
          <Space spacing={2} wrap={false}>
            <Tooltip content={t('详情')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<IconEyeOpened />}
                onClick={(e) => {
                  e.stopPropagation();
                  openDetail(record);
                }}
              />
            </Tooltip>
            <Tooltip content={t('分配/发放')}>
              <Button
                size='small'
                theme='borderless'
                type='primary'
                icon={<IconSend />}
                onClick={(e) => {
                  e.stopPropagation();
                  openAssignment(record);
                }}
              />
            </Tooltip>
            <Tooltip content={t('执行同步')}>
              <Button
                size='small'
                theme='borderless'
                type='primary'
                icon={<IconRefresh />}
                loading={syncingId === record.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleSync(record);
                }}
              />
            </Tooltip>
            <Tooltip content={t('历史消耗')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<IconHistory />}
                onClick={(e) => {
                  e.stopPropagation();
                  openHistory(record);
                }}
              />
            </Tooltip>
            <Tooltip content={t('编辑')}>
              <Button
                size='small'
                theme='borderless'
                type='tertiary'
                icon={<IconEdit />}
                onClick={(e) => {
                  e.stopPropagation();
                  openEdit(record);
                }}
              />
            </Tooltip>
            <Tooltip content={t('删除')}>
              <Button
                size='small'
                theme='borderless'
                type='danger'
                icon={<IconDelete />}
                onClick={(e) => {
                  e.stopPropagation();
                  confirmDelete(record);
                }}
              />
            </Tooltip>
          </Space>
        ),
      },
    ],
    [isMobile, syncingId, t],
  );

  const paginatedAccounts = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredAccounts.slice(start, start + pageSize);
  }, [currentPage, filteredAccounts, pageSize]);

  const rowSelection = useMemo(
    () => ({
      selectedRowKeys,
      onChange: (keys) => setSelectedRowKeys(keys),
    }),
    [selectedRowKeys],
  );

  const selectedFilteredCount = useMemo(
    () =>
      filteredAccounts.filter((record) => selectedRowKeys.includes(record.id))
        .length,
    [filteredAccounts, selectedRowKeys],
  );

  const allFilteredSelected =
    filteredAccounts.length > 0 &&
    selectedFilteredCount === filteredAccounts.length;

  const handleToggleSelectAllFiltered = () => {
    if (allFilteredSelected) {
      setSelectedRowKeys([]);
      return;
    }
    setSelectedRowKeys(filteredAccounts.map((record) => record.id));
  };

  const expandedRowRender = (record) => {
    const subscription = getSubscriptionData(record);
    const modelBreakdown = getModelBreakdown(record);
    const accountDescriptions = [
      {
        key: 'email',
        label: t('邮箱'),
        value: maskEmail(record.email) || '-',
      },
      {
        key: 'account_id',
        label: 'accountId',
        value: record.account_id || subscription?.accountId || '-',
      },
      {
        key: 'status',
        label: t('状态'),
        value: record.status || '-',
      },
      {
        key: 'base_url',
        label: t('站点'),
        value: record.base_url || '-',
      },
      {
        key: 'assignment_status',
        label: t('分配状态'),
        value: getAssignmentStatusLabel(record.assignment_status, t),
      },
      {
        key: 'assigned_channel',
        label: t('关联渠道'),
        value: getAssignedChannelLabel(record, t),
      },
      {
        key: 'assigned_order',
        label: t('关联订单'),
        value: getAssignedOrderLabel(record, t),
      },
    ];
    const planDescriptions = [
      {
        key: 'login_identity',
        label: t('登录标识'),
        value: `${record.email || '-'} / ${record.account_id || subscription?.accountId || '-'}`,
      },
      {
        key: 'api_key_name',
        label: t('Key 名称'),
        value: subscription?.apiKeyName || '-',
      },
      {
        key: 'plan_type',
        label: t('套餐类型'),
        value: getPlanType(record, t),
      },
      {
        key: 'request_limit',
        label: t('请求额度'),
        value: getRequestLimit(record) || 0,
      },
      {
        key: 'request_used',
        label: t('已用请求'),
        value: getUsedRequests(record),
      },
      {
        key: 'request_remain',
        label: t('剩余请求'),
        value: getRequestRemain(record),
      },
      {
        key: 'token_limit',
        label: t('Token额度'),
        value: getTokenLimitLabel(record, t),
      },
      {
        key: 'token_used',
        label: t('已用Tokens'),
        value: getUsedTokens(record),
      },
    ];

    return (
      <div
        className='rounded-xl px-4 py-3'
        style={{ background: 'var(--semi-color-fill-0)' }}
      >
        <div className='flex flex-col gap-4 lg:grid lg:grid-cols-[1.2fr_0.8fr]'>
          <div className='flex flex-col gap-4'>
            <div>
              <Text strong>{t('账户信息')}</Text>
              <div className='mt-2'>
                <Descriptions
                  data={accountDescriptions}
                  column={isMobile ? 1 : 2}
                  size='small'
                  rowSize='small'
                />
              </div>
            </div>

            <div>
              <Text strong>{t('认证信息')}</Text>
              <div className='mt-2'>
                <Descriptions
                  data={[
                    {
                      key: 'password',
                      label: t('密码'),
                      value: record.has_password ? t('已保存') : t('未保存'),
                    },
                    {
                      key: 'refresh_token',
                      label: 'refresh',
                      value: credentialLabel(
                        record.has_refresh_token,
                        record.masked_refresh_token,
                        t,
                      ),
                    },
                    {
                      key: 'access_token',
                      label: 'access',
                      value: credentialLabel(
                        record.has_access_token,
                        record.masked_access_token,
                        t,
                      ),
                    },
                    {
                      key: 'last_sync_at',
                      label: t('同步'),
                      value: formatTs(record.last_sync_at),
                    },
                  ]}
                  column={isMobile ? 1 : 2}
                  size='small'
                  rowSize='small'
                />
              </div>
            </div>
          </div>

          <div className='flex flex-col gap-4'>
            <div>
              <Text strong>{t('权益使用情况')}</Text>
              <div className='mt-2'>
                <Descriptions
                  data={planDescriptions}
                  column={isMobile ? 1 : 2}
                  size='small'
                  rowSize='small'
                />
              </div>
            </div>

            <div>
              <Text strong>{t('分配信息')}</Text>
              <div className='mt-2'>
                <Descriptions
                  data={[
                    {
                      key: 'assigned_plan',
                      label: t('套餐标记'),
                      value: record.assigned_plan || '-',
                    },
                    {
                      key: 'assigned_order',
                      label: t('关联订单'),
                      value: getAssignedOrderLabel(record, t),
                    },
                    {
                      key: 'assigned_subscription',
                      label: t('用户订阅 ID'),
                      value: record.assigned_user_subscription_id || '-',
                    },
                    {
                      key: 'assigned_at',
                      label: t('分配时间'),
                      value: formatTs(record.assigned_at),
                    },
                    {
                      key: 'tags',
                      label: t('标签'),
                      value: record.tags || '-',
                    },
                    {
                      key: 'remark',
                      label: t('备注'),
                      value: record.remark || '-',
                    },
                  ]}
                  column={1}
                  size='small'
                  rowSize='small'
                />
              </div>
            </div>

            <div>
              <Text strong>{t('API Key')}</Text>
              <div className='mt-2 rounded-lg border border-[var(--semi-color-border)] px-3 py-2'>
                <div className='flex items-center gap-2 flex-wrap'>
                  <Text ellipsis={{ showTooltip: true }} style={{ maxWidth: isMobile ? 240 : 360 }}>
                    {record.api_key ? maskApiKey(record.api_key) : '-'}
                  </Text>
                  {record.api_key ? (
                    <Button
                      size='small'
                      type='primary'
                      theme='light'
                      onClick={() => handleCopy(record.api_key, t('API Key 已复制'))}
                    >
                      {t('复制')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>

            <div>
              <Text strong>{t('模型分布')}</Text>
              <div className='mt-2 flex flex-col gap-1 rounded-lg border border-[var(--semi-color-border)] px-3 py-2'>
                {modelBreakdown.length > 0 ? (
                  modelBreakdown.slice(0, 4).map((item, index) => (
                    <Text key={`${item?.model || 'model'}-${index}`} size='small' type='tertiary'>
                      {(item?.model || '-')} · {t('请求')} {Number(item?.requests || 0)} · Tokens {Number(item?.tokens || 0)}
                    </Text>
                  ))
                ) : (
                  <Text size='small' type='tertiary'>-</Text>
                )}
              </div>
            </div>

            <div className='flex items-center justify-between gap-2 flex-wrap'>
              <Text size='small' type={record.last_error ? 'danger' : 'tertiary'}>
                {record.last_error || t('无错误')}
              </Text>
              <Button
                size='small'
                theme='light'
                icon={<IconHistory />}
                onClick={(e) => {
                  e.stopPropagation();
                  openHistory(record);
                }}
              >
                {t('查看历史消耗')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <Modal
        title={editing ? t('编辑 EcomAgent 账户') : t('新增 EcomAgent 账户')}
        visible={visible}
        onOk={handleSave}
        onCancel={() => setVisible(false)}
        confirmLoading={saving}
        size='large'
      >
        <div className='flex flex-col gap-3'>
          <Text type='tertiary'>
            {t('账号密码和登录态二选一；如果你已有登录后的 session JSON，可直接粘贴导入。')}
          </Text>
          <Tabs activeKey={formTab} onChange={setFormTab} type='card'>
            <TabPane tab={t('录入方式')} itemKey='login'>
              <div className='mt-3 rounded-xl border border-[var(--semi-color-border)] p-3'>
                <div className='flex flex-col gap-3'>
                  <div className='flex items-center justify-between gap-3 flex-wrap'>
                    <Text strong>{t('录入方式')}</Text>
                    <RadioGroup
                      type='button'
                      value={loginMode}
                      onChange={(e) => setLoginMode(e.target.value)}
                    >
                      <Radio value='password'>{t('密码注册/登录')}</Radio>
                      <Radio value='token'>{t('Token 导入')}</Radio>
                      <Radio value='session'>{t('Session JSON 导入')}</Radio>
                    </RadioGroup>
                  </div>

                  {loginMode === 'password' ? (
                    <div className='flex flex-col gap-3'>
                      <Text size='small' type='tertiary'>
                        {t('用于自动注册、密码登录和后续 refresh_token 续期。')}
                      </Text>
                      {editing?.has_password ? (
                        <Text size='small' type='tertiary'>
                          {t('密码，留空表示不修改')}
                        </Text>
                      ) : null}
                      <Input
                        value={form.email}
                        onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                        placeholder={t('邮箱')}
                      />
                      <Input
                        value={form.password}
                        onChange={(value) =>
                          setForm((prev) => ({ ...prev, password: value }))
                        }
                        placeholder={editing ? t('密码，留空表示不修改') : t('密码')}
                      />
                    </div>
                  ) : null}

                  {loginMode === 'token' ? (
                    <div className='flex flex-col gap-3'>
                      <Text size='small' type='tertiary'>
                        {t('适合你已经拿到 accountId、access_token、refresh_token 的场景。')}
                      </Text>
                      <Input
                        value={form.email}
                        onChange={(value) => setForm((prev) => ({ ...prev, email: value }))}
                        placeholder={t('邮箱，可选')}
                      />
                      <Input
                        value={form.account_id}
                        onChange={(value) =>
                          setForm((prev) => ({ ...prev, account_id: value }))
                        }
                        placeholder={t('accountId，可选')}
                      />
                      <Input
                        value={form.access_token}
                        onChange={(value) =>
                          setForm((prev) => ({ ...prev, access_token: value }))
                        }
                        placeholder={t('access_token，可选')}
                      />
                      <Input
                        value={form.refresh_token}
                        onChange={(value) =>
                          setForm((prev) => ({ ...prev, refresh_token: value }))
                        }
                        placeholder={t('refresh_token，可选')}
                      />
                      <Input
                        value={String(form.access_token_expires_at || '')}
                        onChange={(value) =>
                          setForm((prev) => ({ ...prev, access_token_expires_at: value }))
                        }
                        placeholder={t('access_token 过期时间，可选')}
                      />
                    </div>
                  ) : null}

                  {loginMode === 'session' ? (
                    <div className='flex flex-col gap-3'>
                      <Text size='small' type='tertiary'>
                        {t('直接粘贴登录返回 JSON，会自动提取 email、accountId、access_token、refresh_token。')}
                      </Text>
                      <TextArea
                        autosize={{ minRows: 6, maxRows: 10 }}
                        value={form.session_json}
                        onChange={(value) =>
                          setForm((prev) => ({ ...prev, session_json: value }))
                        }
                        placeholder={t('会话 JSON，可直接粘贴登录返回')}
                      />
                    </div>
                  ) : null}

                  <Input
                    value={form.confirm_url}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, confirm_url: value }))
                    }
                    placeholder={t('邮件确认链接，可后续补录')}
                  />
                  <Input
                    value={form.base_url}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, base_url: value }))
                    }
                    placeholder={t('EcomAgent Base URL')}
                  />
                  <Input
                    value={form.supabase_auth_url}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, supabase_auth_url: value }))
                    }
                    placeholder={t('Supabase Auth URL')}
                  />
                  <Input
                    value={form.supabase_anon_key}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, supabase_anon_key: value }))
                    }
                    placeholder={t('Supabase Anon Key')}
                  />
                </div>
              </div>
            </TabPane>
          </Tabs>
        </div>
      </Modal>

      <SideSheet
        title={t('账户详情')}
        visible={Boolean(detailRecord)}
        onCancel={() => setDetailRecord(null)}
        width={isMobile ? '100%' : 520}
        footer={
          <div className='flex justify-end gap-2 flex-wrap'>
            {detailRecord ? (
              <>
                <Button
                  loading={syncingId === detailRecord.id}
                  onClick={() => handleSync(detailRecord)}
                >
                  {t('执行同步')}
                </Button>
                <Button onClick={() => openEdit(detailRecord)}>{t('编辑')}</Button>
                <Tooltip content={t('分配/发放')}>
                  <Button
                    type='primary'
                    icon={<IconSend />}
                    onClick={() => openAssignment(detailRecord)}
                  />
                </Tooltip>
              </>
            ) : null}
            <Button onClick={() => setDetailRecord(null)}>{t('关闭')}</Button>
          </div>
        }
      >
        {detailRecord ? (
          <div className='flex flex-col gap-4'>
            <div className='flex items-center justify-between gap-2 flex-wrap rounded-lg border border-[var(--semi-color-border)] p-3 bg-[var(--semi-color-fill-0)]'>
              <div className='min-w-0'>
                <Text strong>{maskEmail(detailRecord.email) || '-'}</Text>
                <div className='mt-1'>
                  <Text size='small' type='tertiary'>
                    {getAssignedOrderLabel(detailRecord, t)} / {getAssignedChannelLabel(detailRecord, t)}
                  </Text>
                </div>
              </div>
              <Space spacing={8} wrap>
                <Button
                  size='small'
                  icon={<IconEyeOpened />}
                  onClick={() => openHistory(detailRecord)}
                >
                  {t('历史消耗')}
                </Button>
                <Button
                  size='small'
                  type='primary'
                  theme='light'
                  loading={syncingId === detailRecord.id}
                  icon={<IconRefresh />}
                  onClick={() => handleSync(detailRecord)}
                >
                  {t('执行同步')}
                </Button>
              </Space>
            </div>
            <div className='grid grid-cols-1 gap-3'>
              <div>
                <Text type='tertiary'>{t('邮箱')}</Text>
                <div>{maskEmail(detailRecord.email) || '-'}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('登录标识')}</Text>
                <div>{maskEmail(detailRecord.email) || '-'} / {detailRecord.account_id || '-'}</div>
              </div>
              <div>
                <Text type='tertiary'>accountId</Text>
                <div>{detailRecord.account_id || getSubscriptionData(detailRecord)?.accountId || '-'}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('状态')}</Text>
                <div>{detailRecord.status || '-'}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('分配状态')}</Text>
                <div>{getAssignmentStatusLabel(detailRecord.assignment_status, t)}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('关联渠道')}</Text>
                <div>{getAssignedChannelLabel(detailRecord, t)}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('注册时间')}</Text>
                <div>{formatTs(detailRecord.signup_at)}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('登录')}</Text>
                <div>{formatTs(detailRecord.login_at)}</div>
              </div>
              <div>
                <Text type='tertiary'>{t('同步')}</Text>
                <div>{formatTs(detailRecord.last_sync_at)}</div>
              </div>
            </div>

            <div className='rounded-lg border border-[var(--semi-color-border)] p-3'>
              <Text strong>{t('权益使用情况')}</Text>
              <div className='mt-2 flex flex-col gap-1'>
                <Text size='small'>{usageSummary(detailRecord, t)}</Text>
                <Text size='small' type='tertiary'>
                  {t('剩余请求')}: {getRequestRemain(detailRecord)}
                </Text>
                <Text size='small' type='tertiary'>
                  {t('Key 名称')}: {getSubscriptionData(detailRecord)?.apiKeyName || '-'}
                </Text>
                <Text size='small' type='tertiary'>
                  {t('关联订单')}: {getAssignedOrderLabel(detailRecord, t)}
                </Text>
              </div>
            </div>

            <div className='rounded-lg border border-[var(--semi-color-border)] p-3'>
              <Text strong>{t('凭据')}</Text>
              <div className='mt-2 flex flex-col gap-2'>
                <Text size='small'>
                  {t('密码')}: {detailRecord.has_password ? t('已保存') : t('未保存')}
                </Text>
                <Text size='small'>
                  refresh: {credentialLabel(
                    detailRecord.has_refresh_token,
                    detailRecord.masked_refresh_token,
                    t,
                  )}
                </Text>
                <Text size='small'>
                  access: {credentialLabel(
                    detailRecord.has_access_token,
                    detailRecord.masked_access_token,
                    t,
                  )}
                </Text>
                <div className='flex flex-col gap-1'>
                  <Text size='small'>API Key</Text>
                  {detailRecord.api_key ? (
                    <div className='flex items-center gap-2 flex-wrap'>
                      <Text>{maskApiKey(detailRecord.api_key)}</Text>
                      <Button
                        size='small'
                        type='primary'
                        theme='light'
                        onClick={() => handleCopy(detailRecord.api_key, t('API Key 已复制'))}
                      >
                        {t('复制')}
                      </Button>
                    </div>
                  ) : (
                    <Text size='small' type='tertiary'>-</Text>
                  )}
                </div>
              </div>
            </div>

            <Collapse keepDOM>
              <Collapse.Panel header={t('模型分布')} itemKey='models'>
                <div className='flex flex-col gap-2'>
                  {getModelBreakdown(detailRecord).length > 0 ? (
                    getModelBreakdown(detailRecord).map((item, index) => (
                      <Text key={`${item?.model || 'model'}-${index}`} size='small'>
                        {(item?.model || '-')} · {t('请求')} {Number(item?.requests || 0)} · Tokens {Number(item?.tokens || 0)}
                      </Text>
                    ))
                  ) : (
                    <Text type='tertiary'>-</Text>
                  )}
                </div>
              </Collapse.Panel>
              <Collapse.Panel header={t('最近调用')} itemKey='logs'>
                <div className='flex flex-col gap-2'>
                  {getRecentLogs(detailRecord).length > 0 ? (
                    getRecentLogs(detailRecord).map((item, index) => (
                      <Text key={`${item?.timestamp || 'log'}-${index}`} size='small'>
                        {item?.timestamp || '-'} · {item?.model || '-'} · {t('状态')} {item?.status || '-'} · Tokens {Number(item?.tokens || 0)}
                      </Text>
                    ))
                  ) : (
                    <Text type='tertiary'>-</Text>
                  )}
                </div>
              </Collapse.Panel>
              <Collapse.Panel header={t('错误详情')} itemKey='error'>
                <Text>{detailRecord.last_error || t('无错误')}</Text>
              </Collapse.Panel>
            </Collapse>
          </div>
        ) : null}
      </SideSheet>

      <SideSheet
        title={t('分配/发放')}
        visible={Boolean(assignmentRecord)}
        onCancel={() => setAssignmentRecord(null)}
        width={isMobile ? '100%' : 520}
        footer={
          <div className='flex justify-end gap-2 flex-wrap'>
            <Button onClick={() => setAssignmentRecord(null)}>{t('关闭')}</Button>
            <Button loading={saving} onClick={handleSaveAssignment}>
              {t('保存分配')}
            </Button>
            <Button
              type='primary'
              theme='solid'
              loading={deliveringId === assignmentRecord?.id}
              disabled={!assignmentForm.assigned_subscription_order_id}
              onClick={handleDeliverLinkedOrder}
            >
              {t('关联并发放')}
            </Button>
          </div>
        }
      >
        {assignmentRecord ? (
          <div className='flex flex-col gap-4'>
            <div className='rounded-lg border border-[var(--semi-color-border)] p-3 bg-[var(--semi-color-fill-0)]'>
              <Text strong>{maskEmail(assignmentRecord.email) || '-'}</Text>
              <div className='mt-1'>
                <Text size='small' type='tertiary'>
                  accountId: {assignmentRecord.account_id || getSubscriptionData(assignmentRecord)?.accountId || '-'}
                </Text>
              </div>
              <div className='mt-3 grid grid-cols-2 gap-3 md:grid-cols-4'>
                <div>
                  <Text size='small' type='tertiary'>{t('套餐类型')}</Text>
                  <div className='mt-1'>{getPlanType(assignmentRecord, t)}</div>
                </div>
                <div>
                  <Text size='small' type='tertiary'>{t('请求额度')}</Text>
                  <div className='mt-1'>{getRequestLimitLabel(assignmentRecord)}</div>
                </div>
                <div>
                  <Text size='small' type='tertiary'>{t('已用请求')}</Text>
                  <div className='mt-1'>{getUsedRequests(assignmentRecord)}</div>
                </div>
                <div>
                  <Text size='small' type='tertiary'>{t('剩余请求')}</Text>
                  <div className='mt-1'>{getRequestRemain(assignmentRecord)}</div>
                </div>
              </div>
            </div>

            <div className='rounded-lg border border-[var(--semi-color-border)] p-3'>
              <Text strong>{t('分配信息')}</Text>
              <div className='mt-3 flex flex-col gap-3'>
                <Select
                  value={assignmentForm.assignment_status}
                  onChange={(value) =>
                    setAssignmentForm((prev) => ({
                      ...prev,
                      assignment_status: value || 'unassigned',
                    }))
                  }
                  optionList={ASSIGNMENT_STATUS_OPTIONS.filter((item) => item.value).map((item) => ({
                    label: t(item.labelKey),
                    value: item.value,
                  }))}
                  placeholder={t('分配状态')}
                />
                <Select
                  value={assignmentForm.assigned_plan}
                  onChange={(value) =>
                    setAssignmentForm((prev) => ({
                      ...prev,
                      assigned_plan: value || '',
                    }))
                  }
                  optionList={assignPlanOptions}
                  placeholder={t('套餐标记')}
                  filter
                  showClear
                />
                <Select
                  value={assignmentForm.assigned_subscription_order_id}
                  onChange={(value) => {
                    const nextValue = value || '';
                    const selectedOrder = manualOrderOptions.find(
                      (item) => item.value === nextValue,
                    );
                    setAssignmentForm((prev) => ({
                      ...prev,
                      assigned_subscription_order_id: nextValue,
                      assigned_plan:
                        selectedOrder?.planTitle || prev.assigned_plan,
                    }));
                  }}
                  optionList={manualOrderOptions}
                  placeholder={t('关联人工发放订单')}
                  filter
                  showClear
                  emptyContent={t('暂无人工发放订单')}
                />
                {selectedManualOrder ? (
                  <div className='rounded-lg border border-[var(--semi-color-border)] bg-[var(--semi-color-fill-0)] p-3'>
                    <Text strong>{t('待发放套餐')}</Text>
                    <div className='mt-2 flex flex-col gap-2'>
                      <div>
                        <Text>{selectedManualOrder?.order?.plan_title || selectedManualPlan?.title || '-'}</Text>
                        {selectedManualPlan?.subtitle ? (
                          <div className='mt-1'>
                            <Text size='small' type='tertiary'>
                              {t('副标题')}: {selectedManualPlan.subtitle}
                            </Text>
                          </div>
                        ) : null}
                      </div>
                      <Descriptions
                        data={[
                          {
                            key: 'order_id',
                            label: t('关联订单'),
                            value: `#${selectedManualOrder?.order?.id || '-'} · UID ${
                              selectedManualOrder?.order?.user_id || '-'
                            }`,
                          },
                          {
                            key: 'benefit',
                            label: t('权益'),
                            value: formatManualDeliveryBenefit(selectedManualPlan, t),
                          },
                        ]}
                        column={1}
                        size='small'
                        rowSize='small'
                      />
                    </div>
                  </div>
                ) : (
                  <div className='rounded-lg border border-dashed border-[var(--semi-color-border)] p-3'>
                    <Text size='small' type='tertiary'>
                      {t('发放前请核对')}: {t('待发放套餐')} / {t('当前账号权益')}
                    </Text>
                  </div>
                )}
                <div className='rounded-lg border border-[var(--semi-color-border)] p-3'>
                  <Text strong>{t('当前账号权益')}</Text>
                  <div className='mt-2'>
                    <Descriptions
                      data={[
                        {
                          key: 'plan',
                          label: t('套餐'),
                          value: getPlanLabel(assignmentRecord.plan),
                        },
                        {
                          key: 'plan_type',
                          label: t('套餐类型'),
                          value: getPlanType(assignmentRecord, t),
                        },
                        {
                          key: 'total_requests',
                          label: t('请求额度'),
                          value: getRequestLimitLabel(assignmentRecord),
                        },
                        {
                          key: 'used_requests',
                          label: t('已用请求'),
                          value: getUsedRequests(assignmentRecord),
                        },
                        {
                          key: 'remain_requests',
                          label: t('剩余请求'),
                          value: getRequestRemain(assignmentRecord),
                        },
                        {
                          key: 'token_limit',
                          label: t('Token额度'),
                          value: getTokenLimitLabel(assignmentRecord, t),
                        },
                      ]}
                      column={isMobile ? 1 : 2}
                      size='small'
                      rowSize='small'
                    />
                  </div>
                </div>
                <div className='grid grid-cols-1 gap-3 md:grid-cols-2'>
                  <Select
                    value={assignmentForm.assigned_channel_id}
                    onChange={(value) =>
                      setAssignmentForm((prev) => ({
                        ...prev,
                        assigned_channel_id: value || '',
                        assigned_channel_key_index: '',
                      }))
                    }
                    optionList={channelOptions}
                    placeholder={t('渠道 ID')}
                    filter
                    showClear
                  />
                  {assignedChannelKeyOptions.length > 0 ? (
                    <Select
                      value={assignmentForm.assigned_channel_key_index}
                      onChange={(value) =>
                        setAssignmentForm((prev) => ({
                          ...prev,
                          assigned_channel_key_index: value || '',
                        }))
                      }
                      optionList={assignedChannelKeyOptions}
                      placeholder={t('Key 序号')}
                      showClear
                    />
                  ) : (
                    <Input
                      value={assignmentForm.assigned_channel_key_index}
                      onChange={(value) =>
                        setAssignmentForm((prev) => ({
                          ...prev,
                          assigned_channel_key_index: value,
                        }))
                      }
                      placeholder={t('Key 序号')}
                    />
                  )}
                  <Input
                    value={assignmentForm.assigned_user_subscription_id}
                    onChange={(value) =>
                      setAssignmentForm((prev) => ({
                        ...prev,
                        assigned_user_subscription_id: value,
                      }))
                    }
                    placeholder={t('用户订阅 ID')}
                  />
                  <Input
                    value={assignmentForm.assigned_at}
                    onChange={(value) =>
                      setAssignmentForm((prev) => ({
                        ...prev,
                        assigned_at: value,
                      }))
                    }
                    placeholder={t('分配时间戳')}
                  />
                </div>
                {selectedAssignedChannel ? (
                  <Text size='small' type='tertiary'>
                    {t('已读取渠道配置')}:
                    {' '}
                    {selectedAssignedChannel.name || `#${selectedAssignedChannel.id}`}
                    {' · '}
                    {selectedAssignedChannel.channel_info?.is_multi_key
                      ? t('多 Key {{count}} 个', {
                          count: Number(
                            selectedAssignedChannel.channel_info?.multi_key_size || 0,
                          ),
                        })
                      : t('单 Key')}
                  </Text>
                ) : null}
                <Text size='small' type='tertiary'>
                  {t('关联订单后，可直接调用人工发放订单 API，用当前账号 API Key 完成发放并自动回写绑定信息。')}
                </Text>
                <Input
                  value={assignmentForm.tags}
                  onChange={(value) =>
                    setAssignmentForm((prev) => ({ ...prev, tags: value }))
                  }
                  placeholder={t('输入标签或使用\",\"分隔多个标签')}
                />
                <TextArea
                  autosize={{ minRows: 3, maxRows: 6 }}
                  value={assignmentForm.remark}
                  onChange={(value) =>
                    setAssignmentForm((prev) => ({ ...prev, remark: value }))
                  }
                  placeholder={t('请输入备注（仅管理员可见）')}
                />
              </div>
            </div>
          </div>
        ) : null}
      </SideSheet>

      <SideSheet
        title={t('历史消耗')}
        visible={Boolean(historyRecord)}
        onCancel={() => setHistoryRecord(null)}
        width={isMobile ? '100%' : 560}
        footer={
          <div className='flex justify-end'>
            <Button onClick={() => setHistoryRecord(null)}>{t('关闭')}</Button>
          </div>
        }
      >
        {historyRecord ? (
          <div className='flex flex-col gap-4'>
            <div>
              <Text strong>{historyRecord.email || '-'}</Text>
              <div className='mt-1'>
                <Text type='tertiary'>
                  accountId: {historyRecord.account_id || getSubscriptionData(historyRecord)?.accountId || '-'}
                </Text>
              </div>
            </div>
            <div className='flex flex-col gap-3'>
              {getRecentLogs(historyRecord).length > 0 ? (
                getRecentLogs(historyRecord)
                  .slice(
                    (historyPage - 1) * historyPageSize,
                    historyPage * historyPageSize,
                  )
                  .map((item, index) => (
                    <div
                      key={`${item?.timestamp || 'history'}-${index}`}
                      className='rounded-lg border border-[var(--semi-color-border)] p-3'
                    >
                      <div className='flex items-center justify-between gap-3 flex-wrap'>
                        <Text strong>{item?.model || '-'}</Text>
                        <Tag color={String(item?.status || '') === '200' ? 'green' : 'red'}>
                          {item?.status || '-'}
                        </Tag>
                      </div>
                      <div className='mt-2 flex flex-col gap-1'>
                        <Text size='small' type='tertiary'>
                          {t('时间')}: {item?.timestamp || '-'}
                        </Text>
                        <Text size='small' type='tertiary'>
                          Tokens: {Number(item?.tokens || 0)}
                        </Text>
                      </div>
                    </div>
                  ))
              ) : (
                <Text type='tertiary'>-</Text>
              )}
            </div>
            {getRecentLogs(historyRecord).length > historyPageSize ? (
              <Pagination
                currentPage={historyPage}
                pageSize={historyPageSize}
                total={getRecentLogs(historyRecord).length}
                onPageChange={setHistoryPage}
              />
            ) : null}
          </div>
        ) : null}
      </SideSheet>

      <div className='mt-[60px] px-2'>
        <CardPro
          type='type1'
          actionsArea={
            <div className='flex flex-col gap-3 w-full'>
              <div className='flex items-center justify-between gap-3 flex-wrap'>
                <div className='flex items-center gap-2 flex-wrap'>
                  <Input
                    showClear
                    value={keyword}
                    onChange={(value) => {
                      setKeyword(value);
                      setCurrentPage(1);
                    }}
                    placeholder={t('搜索邮箱 / accountId / 状态 / 套餐 / 标签 / 渠道 / 订单')}
                    style={{ width: isMobile ? '100%' : 280 }}
                  />
                  <Select
                    value={planFilter}
                    onChange={(value) => {
                      setPlanFilter(value || '');
                      setCurrentPage(1);
                    }}
                    optionList={[
                      { label: t('全部套餐'), value: '' },
                      ...planFilterOptions,
                    ]}
                    style={{ width: isMobile ? '100%' : 180 }}
                  />
                  <Select
                    value={statusFilter}
                    onChange={(value) => {
                      setStatusFilter(value || '');
                      setCurrentPage(1);
                    }}
                    optionList={[
                      { label: t('全部账号状态'), value: '' },
                      ...statusFilterOptions,
                    ]}
                    style={{ width: isMobile ? '100%' : 180 }}
                  />
                  <Select
                    value={assignmentStatusFilter}
                    onChange={(value) => {
                      setAssignmentStatusFilter(value || '');
                      setCurrentPage(1);
                    }}
                    optionList={ASSIGNMENT_STATUS_OPTIONS.map((item) => ({
                      label: t(item.labelKey),
                      value: item.value,
                    }))}
                    style={{ width: isMobile ? '100%' : 180 }}
                  />
                  <Select
                    value={channelBindingFilter}
                    onChange={(value) => {
                      setChannelBindingFilter(value || '');
                      setCurrentPage(1);
                    }}
                    optionList={CHANNEL_BINDING_OPTIONS.map((item) => ({
                      label: t(item.labelKey),
                      value: item.value,
                    }))}
                    style={{ width: isMobile ? '100%' : 180 }}
                  />
                  <Select
                    value={orderBindingFilter}
                    onChange={(value) => {
                      setOrderBindingFilter(value || '');
                      setCurrentPage(1);
                    }}
                    optionList={ORDER_BINDING_OPTIONS.map((item) => ({
                      label: t(item.labelKey),
                      value: item.value,
                    }))}
                    style={{ width: isMobile ? '100%' : 180 }}
                  />
                  {hasActiveFilters ? (
                    <Button type='tertiary' onClick={resetFilters}>
                      {t('重置筛选')}
                    </Button>
                  ) : null}
                  {filteredAccounts.length > 0 ? (
                    <Button
                      type='tertiary'
                      disabled={batchSyncing || batchDeleting}
                      onClick={handleToggleSelectAllFiltered}
                    >
                      {allFilteredSelected ? t('取消全选') : t('全选')} (
                      {filteredAccounts.length})
                    </Button>
                  ) : null}
                  {selectedRowKeys.length > 0 ? (
                    <>
                      <Popconfirm
                        title={t('刷新同步额度')}
                        content={t('确定要同步选中的 {{count}} 项吗？', {
                          count: selectedRowKeys.length,
                        })}
                        okText={t('刷新同步额度')}
                        cancelText={t('取消')}
                        onConfirm={handleBatchSync}
                      >
                        <Button
                          loading={batchSyncing}
                          disabled={batchDeleting}
                        >
                          {t('刷新同步额度')} ({selectedRowKeys.length})
                        </Button>
                      </Popconfirm>
                      <Popconfirm
                        title={t('确认删除')}
                        content={t(
                          '确定要删除选中的 {{count}} 项吗？此操作不可逆。',
                          { count: selectedRowKeys.length },
                        )}
                        okText={t('确认删除')}
                        cancelText={t('取消')}
                        onConfirm={handleBatchDelete}
                      >
                        <Button
                          type='danger'
                          loading={batchDeleting}
                          disabled={batchSyncing}
                        >
                          {t('批量删除')} ({selectedRowKeys.length})
                        </Button>
                      </Popconfirm>
                      <Button
                        type='tertiary'
                        disabled={batchSyncing || batchDeleting}
                        onClick={() => setSelectedRowKeys([])}
                      >
                        {t('取消选择')}
                      </Button>
                    </>
                  ) : null}
                  <Button theme='solid' onClick={openCreate}>
                    {t('新增账户')}
                  </Button>
                </div>
              </div>
            </div>
          }
          paginationArea={createCardProPagination({
            currentPage,
            pageSize,
            total: filteredAccounts.length,
            onPageChange: setCurrentPage,
            onPageSizeChange: (size) => {
              setPageSize(size);
              setCurrentPage(1);
            },
            isMobile,
            t,
          })}
          t={t}
        >
          <CardTable
            rowKey='id'
            loading={loading}
            columns={columns}
            dataSource={paginatedAccounts}
            rowSelection={rowSelection}
            expandedRowRender={expandedRowRender}
            expandRowByClick={true}
            rowExpandable={() => true}
            hidePagination={true}
            size='middle'
            scroll={isMobile ? { x: 760 } : undefined}
            empty={
              <Empty
                image={<IllustrationNoResult style={{ width: 150, height: 150 }} />}
                darkModeImage={
                  <IllustrationNoResultDark style={{ width: 150, height: 150 }} />
                }
                description={t('暂无 EcomAgent 账户')}
                style={{ padding: 30 }}
              />
            }
          />
        </CardPro>
      </div>
    </>
  );
};

export default EcomAgentPage;
