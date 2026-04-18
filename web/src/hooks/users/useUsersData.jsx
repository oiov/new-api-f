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

import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { API, buildGroupOptions, showError, showSuccess } from '../../helpers';
import { ITEMS_PER_PAGE } from '../../constants';
import { useTableCompactMode } from '../common/useTableCompactMode';
import { useUserPermissions } from '../common/useUserPermissions';
import {
  ACTION_PERMISSION_POINTS,
  PAGE_PERMISSION_POINTS,
} from '../../constants/permission.constants';

export const useUsersData = () => {
  const { t } = useTranslation();
  const { can } = useUserPermissions();
  const [compactMode, setCompactMode] = useTableCompactMode('users');
  const [searchParams, setSearchParams] = useSearchParams();

  // Get initial keyword from URL
  const initialKeyword = useMemo(() => {
    return searchParams.get('keyword') || '';
  }, []);

  // State management
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePage, setActivePage] = useState(1);
  const [pageSize, setPageSize] = useState(ITEMS_PER_PAGE);
  const [searching, setSearching] = useState(false);
  const [groupOptions, setGroupOptions] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [urlKeywordProcessed, setUrlKeywordProcessed] = useState(false);

  // Modal states
  const [showAddUser, setShowAddUser] = useState(false);
  const [showEditUser, setShowEditUser] = useState(false);
  const [editingUser, setEditingUser] = useState({
    id: undefined,
  });

  // Form initial values
  const formInitValues = {
    searchKeyword: initialKeyword,
    searchGroup: '',
    sortBy: 'id',
    sortOrder: 'desc',
  };

  // Form API reference
  const [formApi, setFormApi] = useState(null);

  // Get form values helper function
  const getFormValues = () => {
    const formValues = formApi ? formApi.getValues() : {};
    return {
      searchKeyword: formValues.searchKeyword || '',
      searchGroup: formValues.searchGroup || '',
      sortBy: formValues.sortBy || 'id',
      sortOrder: formValues.sortOrder || 'desc',
    };
  };

  const buildUserListQuery = ({
    page,
    size,
    searchKeyword = '',
    searchGroup = '',
    sortBy = 'id',
    sortOrder = 'desc',
  }) => {
    const params = new URLSearchParams();
    params.set('p', page);
    params.set('page_size', size);
    if (searchKeyword) params.set('keyword', searchKeyword);
    if (searchGroup) params.set('group', searchGroup);
    if (sortBy) params.set('sort_by', sortBy);
    if (sortOrder) params.set('sort_order', sortOrder);
    return params.toString();
  };

  // Set user format with key field
  const setUserFormat = (users) => {
    for (let i = 0; i < users.length; i++) {
      users[i].key = users[i].id;
    }
    setUsers(users);
  };

  // Load users data
  const loadUsers = async (startIdx, pageSize) => {
    setLoading(true);
    const { sortBy, sortOrder } = getFormValues();
    const res = await API.get(
      `/api/user/?${buildUserListQuery({
        page: startIdx,
        size: pageSize,
        sortBy,
        sortOrder,
      })}`,
    );
    const { success, message, data } = res.data;
    if (success) {
      const newPageData = data.items;
      setActivePage(data.page);
      setUserCount(data.total);
      setUserFormat(newPageData);
    } else {
      showError(message);
    }
    setLoading(false);
  };

  // Search users with keyword and group
  const searchUsers = async (
    startIdx,
    pageSize,
    searchKeyword = null,
    searchGroup = null,
    sortBy = null,
    sortOrder = null,
  ) => {
    // If no parameters passed, get values from form
    if (
      searchKeyword === null ||
      searchGroup === null ||
      sortBy === null ||
      sortOrder === null
    ) {
      const formValues = getFormValues();
      searchKeyword = formValues.searchKeyword;
      searchGroup = formValues.searchGroup;
      sortBy = formValues.sortBy;
      sortOrder = formValues.sortOrder;
    }

    if (searchKeyword === '' && searchGroup === '') {
      // If keyword is blank, load files instead
      await loadUsers(startIdx, pageSize);
      return;
    }
    setSearching(true);
    const res = await API.get(
      `/api/user/search?${buildUserListQuery({
        page: startIdx,
        size: pageSize,
        searchKeyword,
        searchGroup,
        sortBy,
        sortOrder,
      })}`,
    );
    const { success, message, data } = res.data;
    if (success) {
      const newPageData = data.items;
      setActivePage(data.page);
      setUserCount(data.total);
      setUserFormat(newPageData);
    } else {
      showError(message);
    }
    setSearching(false);
  };

  // Manage user operations (promote, demote, enable, disable, delete)
  const manageUser = async (userId, action, record, extraPayload = {}) => {
    // Trigger loading state to force table re-render
    setLoading(true);

    const res = await API.post('/api/user/manage', {
      id: userId,
      action,
      ...extraPayload,
    });

    const { success, message } = res.data;
    if (success) {
      showSuccess(t('操作成功完成！'));
      const user = res.data.data;

      if (action === 'reset_all_aff_count') {
        const newUsers = users.map((u) => ({ ...u, aff_count: 0 }));
        setUsers(newUsers);
        setLoading(false);
        return user;
      }

      // Create a new array and new object to ensure React detects changes
      const newUsers = users.map((u) => {
        if (u.id === userId) {
          if (action === 'delete') {
            return { ...u, DeletedAt: new Date() };
          }
          if (action === 'reset_aff_count') {
            return { ...u, aff_count: 0 };
          }
          if (action === 'set_aff_count') {
            return { ...u, aff_count: user.aff_count };
          }
          return { ...u, status: user.status, role: user.role };
        }
        return u;
      });

      setUsers(newUsers);
      setLoading(false);
      return user;
    } else {
      showError(message);
    }

    setLoading(false);
    return null;
  };

  const resetUserPasskey = async (user) => {
    if (!user) {
      return;
    }
    try {
      const res = await API.delete(`/api/user/${user.id}/reset_passkey`);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('Passkey 已重置'));
      } else {
        showError(message || t('操作失败，请重试'));
      }
    } catch (error) {
      showError(t('操作失败，请重试'));
    }
  };

  const resetUserTwoFA = async (user) => {
    if (!user) {
      return;
    }
    try {
      const res = await API.delete(`/api/user/${user.id}/2fa`);
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('二步验证已重置'));
      } else {
        showError(message || t('操作失败，请重试'));
      }
    } catch (error) {
      showError(t('操作失败，请重试'));
    }
  };

  // Handle page change
  const handlePageChange = (page) => {
    setActivePage(page);
    const { searchKeyword, searchGroup, sortBy, sortOrder } = getFormValues();
    if (searchKeyword === '' && searchGroup === '') {
      loadUsers(page, pageSize).then();
    } else {
      searchUsers(
        page,
        pageSize,
        searchKeyword,
        searchGroup,
        sortBy,
        sortOrder,
      ).then();
    }
  };

  // Handle page size change
  const handlePageSizeChange = async (size) => {
    localStorage.setItem('page-size', size + '');
    setPageSize(size);
    setActivePage(1);
    loadUsers(activePage, size)
      .then()
      .catch((reason) => {
        showError(reason);
      });
  };

  // Handle table row styling for disabled/deleted users
  const handleRow = (record, index) => {
    if (record.DeletedAt !== null || record.status !== 1) {
      return {
        style: {
          background: 'var(--semi-color-disabled-border)',
        },
      };
    } else {
      return {};
    }
  };

  // Refresh data
  const refresh = async (page = activePage) => {
    const { searchKeyword, searchGroup, sortBy, sortOrder } = getFormValues();
    if (searchKeyword === '' && searchGroup === '') {
      await loadUsers(page, pageSize);
    } else {
      await searchUsers(
        page,
        pageSize,
        searchKeyword,
        searchGroup,
        sortBy,
        sortOrder,
      );
    }
  };

  // Fetch groups data
  const fetchGroups = async () => {
    try {
      let res = await API.get(`/api/group/`);
      if (res === undefined) {
        return;
      }
      setGroupOptions(buildGroupOptions(res.data.data));
    } catch (error) {
      showError(error.message);
    }
  };

  // Modal control functions
  const closeAddUser = () => {
    setShowAddUser(false);
  };

  const closeEditUser = () => {
    setShowEditUser(false);
    setEditingUser({
      id: undefined,
    });
  };

  // Initialize data on component mount
  useEffect(() => {
    loadUsers(0, pageSize)
      .then()
      .catch((reason) => {
        showError(reason);
      });
    fetchGroups().then();
  }, []);

  // Handle URL keyword parameter
  useEffect(() => {
    if (initialKeyword && formApi && !urlKeywordProcessed) {
      setUrlKeywordProcessed(true);
      // Set form value
      formApi.setValue('searchKeyword', initialKeyword);
      // Trigger search
      searchUsers(1, pageSize, initialKeyword, '', 'id', 'desc').then(() => {
        // Clear URL parameter after processing
        setSearchParams({});
      });
    }
  }, [initialKeyword, formApi, urlKeywordProcessed]);

  return {
    permissions: {
      canViewUsers: can(PAGE_PERMISSION_POINTS.user, false),
      canCreateUser: can(ACTION_PERMISSION_POINTS.userCreate, false),
      canEditUser: can(ACTION_PERMISSION_POINTS.userEdit, false),
      canDisableUser: can(ACTION_PERMISSION_POINTS.userDisable, false),
      canDeleteUser: can(ACTION_PERMISSION_POINTS.userDelete, false),
      canNotifyUser: can(ACTION_PERMISSION_POINTS.userNotify, false),
      canViewSubscriptions: can(PAGE_PERMISSION_POINTS.subscription, false),
    },
    // Data state
    users,
    loading,
    activePage,
    pageSize,
    userCount,
    searching,
    groupOptions,

    // Modal state
    showAddUser,
    showEditUser,
    editingUser,
    setShowAddUser,
    setShowEditUser,
    setEditingUser,

    // Form state
    formInitValues,
    formApi,
    setFormApi,

    // UI state
    compactMode,
    setCompactMode,

    // Actions
    loadUsers,
    searchUsers,
    manageUser,
    resetUserPasskey,
    resetUserTwoFA,
    handlePageChange,
    handlePageSizeChange,
    handleRow,
    refresh,
    closeAddUser,
    closeEditUser,
    getFormValues,

    // Translation
    t,
  };
};
