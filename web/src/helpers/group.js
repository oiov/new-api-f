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

import { API } from './api';

let groupMetadataMap = {};
let groupMetadataListeners = new Set();
let adminGroupMetadataPromise = null;
let adminGroupMetadataLoaded = false;

const notifyGroupMetadataListeners = () => {
  groupMetadataListeners.forEach((listener) => listener());
};

const hasMetadataChanged = (nextMap) => {
  const currentKeys = Object.keys(groupMetadataMap);
  const nextKeys = Object.keys(nextMap);
  if (currentKeys.length !== nextKeys.length) {
    return true;
  }

  return nextKeys.some((key) => {
    const current = groupMetadataMap[key] || {};
    const next = nextMap[key] || {};
    return (
      current.desc !== next.desc ||
      current.ratio !== next.ratio ||
      current.billingType !== next.billingType ||
      current.billingLabel !== next.billingLabel
    );
  });
};

export const normalizeGroupMetadata = (data) => {
  if (Array.isArray(data)) {
    return data.reduce((acc, groupName) => {
      const normalizedGroup = String(groupName || '').trim();
      if (!normalizedGroup) {
        return acc;
      }
      acc[normalizedGroup] = {
        desc: normalizedGroup,
      };
      return acc;
    }, {});
  }

  if (!data || typeof data !== 'object') {
    return {};
  }

  return Object.entries(data).reduce((acc, [groupName, info]) => {
    const normalizedGroup = String(groupName || '').trim();
    if (!normalizedGroup) {
      return acc;
    }

    if (typeof info === 'string') {
      acc[normalizedGroup] = {
        desc: info || normalizedGroup,
      };
      return acc;
    }

    acc[normalizedGroup] = {
      desc: info?.desc || normalizedGroup,
      ratio: info?.ratio,
      billingType: info?.billing_type ?? info?.billingType,
      billingLabel: info?.billing_label ?? info?.billingLabel,
    };
    return acc;
  }, {});
};

export const primeGroupMetadata = (data) => {
  const normalized = normalizeGroupMetadata(data);
  const merged = {
    ...groupMetadataMap,
    ...normalized,
  };

  if (!hasMetadataChanged(merged)) {
    return merged;
  }

  groupMetadataMap = merged;
  notifyGroupMetadataListeners();
  return groupMetadataMap;
};

export const getGroupMetadataMap = () => groupMetadataMap;

export const getGroupDescription = (groupName) => {
  const normalizedGroup = String(groupName || '').trim();
  if (!normalizedGroup) {
    return '';
  }
  return groupMetadataMap[normalizedGroup]?.desc || '';
};

export const subscribeGroupMetadata = (listener) => {
  groupMetadataListeners.add(listener);
  return () => {
    groupMetadataListeners.delete(listener);
  };
};

export const ensureAdminGroupMetadataLoaded = async () => {
  if (adminGroupMetadataLoaded) {
    return groupMetadataMap;
  }

  if (adminGroupMetadataPromise) {
    return adminGroupMetadataPromise;
  }

  adminGroupMetadataPromise = API.get('/api/group/', {
    disableDuplicate: true,
    skipErrorHandler: true,
  })
    .then((res) => {
      if (res?.data?.success) {
        primeGroupMetadata(res.data.data);
        adminGroupMetadataLoaded = true;
      }
      return groupMetadataMap;
    })
    .catch(() => groupMetadataMap)
    .finally(() => {
      adminGroupMetadataPromise = null;
    });

  return adminGroupMetadataPromise;
};

export const buildGroupOptions = (data, userGroup) => {
  const metadata = primeGroupMetadata(data);
  let groupOptions = Object.entries(metadata).map(([group, info]) => ({
    label: group,
    value: group,
    ratio: info?.ratio,
    fullLabel: info?.desc || group,
    billingType: info?.billingType,
    billingLabel: info?.billingLabel,
  }));

  if (groupOptions.length === 0) {
    groupOptions = [
      {
        label: '用户分组',
        value: '',
        ratio: 1,
        fullLabel: '用户分组',
      },
    ];
  } else if (userGroup) {
    const userGroupIndex = groupOptions.findIndex((g) => g.value === userGroup);
    if (userGroupIndex > -1) {
      const userGroupOption = groupOptions.splice(userGroupIndex, 1)[0];
      groupOptions.unshift(userGroupOption);
    }
  }

  return groupOptions;
};
