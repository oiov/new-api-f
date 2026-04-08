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

const STATUS_CACHE_KEY = 'status';
const STATUS_CACHE_TIMESTAMP_KEY = 'status_timestamp';

export function setStatusData(data) {
  localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(data));
  localStorage.setItem(STATUS_CACHE_TIMESTAMP_KEY, Date.now().toString());
  localStorage.setItem('system_name', data.system_name);
  localStorage.setItem('logo', data.logo);
  localStorage.setItem('footer_html', data.footer_html);
  localStorage.setItem('quota_per_unit', data.quota_per_unit);
  // 兼容：保留旧字段，同时写入新的额度展示类型
  localStorage.setItem('display_in_currency', data.display_in_currency);
  localStorage.setItem('quota_display_type', data.quota_display_type || 'USD');
  localStorage.setItem('enable_drawing', data.enable_drawing);
  localStorage.setItem('enable_task', data.enable_task);
  localStorage.setItem('enable_data_export', data.enable_data_export);
  localStorage.setItem('chats', JSON.stringify(data.chats));
  localStorage.setItem(
    'data_export_default_time',
    data.data_export_default_time,
  );
  localStorage.setItem(
    'default_collapse_sidebar',
    data.default_collapse_sidebar,
  );
  localStorage.setItem('mj_notify_enabled', data.mj_notify_enabled);
  if (data.chat_link) {
    // localStorage.setItem('chat_link', data.chat_link);
  } else {
    localStorage.removeItem('chat_link');
  }
  if (data.chat_link2) {
    // localStorage.setItem('chat_link2', data.chat_link2);
  } else {
    localStorage.removeItem('chat_link2');
  }
  if (data.docs_link) {
    localStorage.setItem('docs_link', data.docs_link);
  } else {
    localStorage.removeItem('docs_link');
  }
}

export function readStatusData() {
  try {
    const raw = localStorage.getItem(STATUS_CACHE_KEY);
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function getStatusCacheAge() {
  const rawTimestamp = localStorage.getItem(STATUS_CACHE_TIMESTAMP_KEY);
  const timestamp = Number(rawTimestamp);
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return Date.now() - timestamp;
}

export function normalizeUserData(data) {
  if (!data || typeof data !== 'object') {
    return data;
  }
  const configuredGroup = data.configured_group ?? data.group ?? '';
  const effectiveGroup = data.effective_group ?? data.group ?? configuredGroup;
  return {
    ...data,
    configured_group: configuredGroup,
    effective_group: effectiveGroup,
    group: effectiveGroup,
  };
}

export function getUserData() {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) {
      return null;
    }
    const data = JSON.parse(raw);
    return normalizeUserData(data);
  } catch {
    return null;
  }
}

export function setUserData(data) {
  localStorage.setItem('user', JSON.stringify(normalizeUserData(data)));
}
