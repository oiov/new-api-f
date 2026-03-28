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

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../helpers';
import { useTableCompactMode } from '../common/useTableCompactMode';
import { ITEMS_PER_PAGE } from '../../constants';

export const useSubscriptionsData = () => {
  const { t } = useTranslation();
  const [compactMode, setCompactMode] = useTableCompactMode('subscriptions');

  // State management
  const [allPlans, setAllPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groupOptions, setGroupOptions] = useState([]);
  const [enableBatchMode, setEnableBatchMode] = useState(false);
  const [selectedPlans, setSelectedPlans] = useState([]);
  const [batchUpdatingPlans, setBatchUpdatingPlans] = useState(false);

  // Pagination (client-side for now)
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Admin user subscriptions
  const [userSubscriptions, setUserSubscriptions] = useState([]);
  const [userSubscriptionsLoading, setUserSubscriptionsLoading] = useState(true);
  const [userSubscriptionsPage, setUserSubscriptionsPage] = useState(1);
  const [userSubscriptionsPageSize, setUserSubscriptionsPageSize] =
    useState(ITEMS_PER_PAGE);
  const [userSubscriptionsTotal, setUserSubscriptionsTotal] = useState(0);
  const [userSubscriptionsFormApi, setUserSubscriptionsFormApi] = useState(null);

  // Drawer states
  const [showEdit, setShowEdit] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);
  const [sheetPlacement, setSheetPlacement] = useState('left'); // 'left' | 'right'

  // Load subscription plans
  const loadPlans = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/subscription/admin/plans');
      if (res.data?.success) {
        const next = res.data.data || [];
        setAllPlans(next);

        // Keep page in range after data changes
        const totalPages = Math.max(1, Math.ceil(next.length / pageSize));
        setActivePage((p) => Math.min(p || 1, totalPages));
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const res = await API.get('/api/group/');
      if (res?.data?.success) {
        setGroupOptions(
          (res.data.data || []).map((group) => ({
            label: group,
            value: group,
          })),
        );
      }
    } catch (e) {
      showError(e?.message || t('请求失败'));
    }
  };

  const getUserSubscriptionsFormValues = () => {
    const values = userSubscriptionsFormApi
      ? userSubscriptionsFormApi.getValues()
      : {};
    return {
      username: values.username || '',
      group: values.group || '',
      status: values.status || '',
    };
  };

  const loadUserSubscriptions = async (
    page = userSubscriptionsPage,
    size = userSubscriptionsPageSize,
    filters = null,
  ) => {
    const nextFilters = filters || getUserSubscriptionsFormValues();
    setUserSubscriptionsLoading(true);
    try {
      const searchParams = new URLSearchParams({
        p: String(page),
        page_size: String(size),
        username: nextFilters.username || '',
        group: nextFilters.group || '',
        status: nextFilters.status || '',
      });
      const res = await API.get(
        `/api/subscription/admin/user_subscriptions?${searchParams.toString()}`,
      );
      if (res.data?.success) {
        const data = res.data.data || {};
        setUserSubscriptions(data.items || []);
        setUserSubscriptionsPage(data.page || page);
        setUserSubscriptionsPageSize(data.page_size || size);
        setUserSubscriptionsTotal(data.total || 0);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setUserSubscriptionsLoading(false);
    }
  };

  // Refresh data
  const refresh = async () => {
    await loadPlans();
    await loadUserSubscriptions();
  };

  const handlePageChange = (page) => {
    setActivePage(page);
  };

  const handlePageSizeChange = (size) => {
    setPageSize(size);
    setActivePage(1);
  };

  const searchUserSubscriptions = async () => {
    await loadUserSubscriptions(1, userSubscriptionsPageSize);
  };

  const handleUserSubscriptionsPageChange = async (page) => {
    setUserSubscriptionsPage(page);
    await loadUserSubscriptions(page, userSubscriptionsPageSize);
  };

  const handleUserSubscriptionsPageSizeChange = async (size) => {
    setUserSubscriptionsPageSize(size);
    setUserSubscriptionsPage(1);
    await loadUserSubscriptions(1, size);
  };

  // Update plan enabled status (single endpoint)
  const setPlanEnabled = async (planRecordOrId, enabled, options = {}) => {
    const { silent = false, skipReload = false } = options;
    const planId =
      typeof planRecordOrId === 'number'
        ? planRecordOrId
        : planRecordOrId?.plan?.id;
    if (!planId) return;
    setLoading(true);
    try {
      const res = await API.patch(`/api/subscription/admin/plans/${planId}`, {
        enabled: !!enabled,
      });
      if (res.data?.success) {
        if (!silent) {
          showSuccess(enabled ? t('已启用') : t('已禁用'));
        }
        if (!skipReload) {
          await loadPlans();
        }
        return true;
      } else {
        showError(res.data?.message || t('操作失败'));
      }
    } catch (e) {
      showError(t('请求失败'));
    } finally {
      setLoading(false);
    }
    return false;
  };

  const batchSetPlansEnabled = async (enabled) => {
    if (selectedPlans.length === 0) {
      showError(
        enabled ? t('请先选择要启用的套餐！') : t('请先选择要禁用的套餐！'),
      );
      return;
    }
    setBatchUpdatingPlans(true);
    try {
      const selectedIds = selectedPlans
        .map((item) => item?.plan?.id)
        .filter((id) => Number(id) > 0);
      let successCount = 0;
      let failedCount = 0;
      const concurrencyLimit = 5;

      for (let i = 0; i < selectedIds.length; i += concurrencyLimit) {
        const batch = selectedIds.slice(i, i + concurrencyLimit);
        const results = await Promise.all(
          batch.map((id) =>
            setPlanEnabled(id, enabled, { silent: true, skipReload: true }),
          ),
        );
        results.forEach((result) => {
          if (result) {
            successCount += 1;
          } else {
            failedCount += 1;
          }
        });
      }

      await loadPlans();
      if (failedCount > 0) {
        showSuccess(
          enabled
            ? t('批量启用完成，成功 ${success} 个，失败 ${failed} 个。')
                .replace('${success}', successCount)
                .replace('${failed}', failedCount)
            : t('批量禁用完成，成功 ${success} 个，失败 ${failed} 个。')
                .replace('${success}', successCount)
                .replace('${failed}', failedCount),
        );
      } else {
        showSuccess(
          enabled
            ? t('已批量启用 ${count} 个套餐。').replace(
                '${count}',
                successCount,
              )
            : t('已批量禁用 ${count} 个套餐。').replace(
                '${count}',
                successCount,
              ),
        );
      }
      setSelectedPlans([]);
    } finally {
      setBatchUpdatingPlans(false);
    }
  };

  // Modal control functions
  const closeEdit = () => {
    setShowEdit(false);
    setEditingPlan(null);
  };

  const openCreate = () => {
    setSheetPlacement('left');
    setEditingPlan(null);
    setShowEdit(true);
  };

  const openEdit = (planRecord) => {
    setSheetPlacement('right');
    setEditingPlan(planRecord);
    setShowEdit(true);
  };

  // Initialize data on component mount
  useEffect(() => {
    loadPlans();
    loadUserSubscriptions();
    fetchGroups();
  }, []);

  useEffect(() => {
    if (!enableBatchMode) {
      setSelectedPlans([]);
    }
  }, [enableBatchMode]);

  const planCount = allPlans.length;
  const plans = allPlans.slice(
    Math.max(0, (activePage - 1) * pageSize),
    Math.max(0, (activePage - 1) * pageSize) + pageSize,
  );
  const planTitleMap = new Map(
    (allPlans || []).map((item) => [item?.plan?.id, item?.plan?.title || '']),
  );

  return {
    // Data state
    plans,
    planCount,
    loading,
    allPlans,
    planTitleMap,
    groupOptions,
    userSubscriptions,
    userSubscriptionsLoading,
    userSubscriptionsPage,
    userSubscriptionsPageSize,
    userSubscriptionsTotal,
    userSubscriptionsFormInitValues: {
      username: '',
      group: '',
      status: '',
    },

    // Modal state
    showEdit,
    editingPlan,
    sheetPlacement,
    setShowEdit,
    setEditingPlan,

    // UI state
    compactMode,
    setCompactMode,
    enableBatchMode,
    setEnableBatchMode,
    selectedPlans,
    setSelectedPlans,
    batchUpdatingPlans,

    // Pagination
    activePage,
    pageSize,
    handlePageChange,
    handlePageSizeChange,
    handleUserSubscriptionsPageChange,
    handleUserSubscriptionsPageSizeChange,
    setUserSubscriptionsFormApi,

    // Actions
    loadPlans,
    loadUserSubscriptions,
    searchUserSubscriptions,
    setPlanEnabled,
    batchSetPlansEnabled,
    refresh,
    closeEdit,
    openCreate,
    openEdit,

    // Translation
    t,
  };
};
