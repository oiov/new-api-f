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

import React from 'react';
import {
  Button,
  Space,
  Tag,
  Tooltip,
  Progress,
  Popover,
  Typography,
  Dropdown,
} from '@douyinfe/semi-ui';
import { IconMore } from '@douyinfe/semi-icons';
import {
  copy,
  renderGroup,
  renderNumber,
  renderQuota,
  showError,
  showSuccess,
  timestamp2string,
} from '../../../helpers';

const { Text } = Typography;

const USER_STATUS_ENABLED = 1;
const USER_STATUS_DISABLED = 2;
const USER_STATUS_BANNED = 3;

const getUserStatusMeta = (record, t) => {
  if (record?.DeletedAt !== null) {
    return {
      color: 'red',
      text: t('已注销'),
    };
  }

  switch (Number(record?.status)) {
    case USER_STATUS_ENABLED:
      return {
        color: 'green',
        text: t('已启用'),
      };
    case USER_STATUS_DISABLED:
      return {
        color: 'red',
        text: t('已禁用'),
      };
    case USER_STATUS_BANNED:
      return {
        color: 'orange',
        text: t('已封禁'),
      };
    default:
      return {
        color: 'red',
        text: t('已禁用'),
      };
  }
};

/**
 * Render user role
 */
const renderRole = (role, t) => {
  switch (role) {
    case 1:
      return (
        <Tag color='blue' shape='circle'>
          {t('普通用户')}
        </Tag>
      );
    case 10:
      return (
        <Tag color='yellow' shape='circle'>
          {t('管理员')}
        </Tag>
      );
    case 100:
      return (
        <Tag color='orange' shape='circle'>
          {t('超级管理员')}
        </Tag>
      );
    default:
      return (
        <Tag color='red' shape='circle'>
          {t('未知身份')}
        </Tag>
      );
  }
};

/**
 * Render username with remark
 */
const renderUsername = (text, record) => {
  const remark = record.remark;
  if (!remark) {
    return <span>{text}</span>;
  }
  const maxLen = 10;
  const displayRemark =
    remark.length > maxLen ? remark.slice(0, maxLen) + '…' : remark;
  return (
    <Space spacing={2}>
      <span>{text}</span>
      <Tooltip content={remark} position='top' showArrow>
        <Tag color='white' shape='circle' className='!text-xs'>
          <div className='flex items-center gap-1'>
            <div
              className='w-2 h-2 flex-shrink-0 rounded-full'
              style={{ backgroundColor: '#10b981' }}
            />
            {displayRemark}
          </div>
        </Tag>
      </Tooltip>
    </Space>
  );
};

/**
 * Render user statistics
 */
const renderStatistics = (text, record, showEnableDisableModal, t) => {
  const statusMeta = getUserStatusMeta(record, t);

  const content = (
    <Tag color={statusMeta.color} shape='circle' size='small'>
      {statusMeta.text}
    </Tag>
  );

  const tooltipContent = (
    <div className='text-xs'>
      <div>
        {t('调用次数')}: {renderNumber(record.request_count)}
      </div>
    </div>
  );

  return (
    <Tooltip content={tooltipContent} position='top'>
      {content}
    </Tooltip>
  );
};

// Render separate quota usage column
const renderQuotaUsage = (text, record, t) => {
  const { Paragraph } = Typography;
  const used = parseInt(record.used_quota) || 0;
  const remain = parseInt(record.quota) || 0;
  const total = used + remain;
  const percent = total > 0 ? (remain / total) * 100 : 0;
  const popoverContent = (
    <div className='text-xs p-2'>
      <Paragraph copyable={{ content: renderQuota(used) }}>
        {t('已用额度')}: {renderQuota(used)}
      </Paragraph>
      <Paragraph copyable={{ content: renderQuota(remain) }}>
        {t('剩余额度')}: {renderQuota(remain)} ({percent.toFixed(0)}%)
      </Paragraph>
      <Paragraph copyable={{ content: renderQuota(total) }}>
        {t('总额度')}: {renderQuota(total)}
      </Paragraph>
    </div>
  );
  return (
    <Popover content={popoverContent} position='top'>
      <Tag color='white' shape='circle'>
        <div className='flex flex-col items-end'>
          <span className='text-xs leading-none'>{`${renderQuota(remain)} / ${renderQuota(total)}`}</span>
          <Progress
            percent={percent}
            aria-label='quota usage'
            format={() => `${percent.toFixed(0)}%`}
            style={{ width: '100%', marginTop: '1px', marginBottom: 0 }}
          />
        </div>
      </Tag>
    </Popover>
  );
};

/**
 * Render invite information
 */
const renderInviteInfo = (text, record, t) => {
  const handleCopyAffCode = async () => {
    if (!record.aff_code) {
      showError(t('该用户暂无 aff'));
      return;
    }
    if (await copy(record.aff_code)) {
      showSuccess(t('已复制：') + record.aff_code);
      return;
    }
    showError(t('复制失败'));
  };

  const inviterLabel = record.inviter_username
    ? `${t('邀请人')}: ${record.inviter_username}`
    : record.inviter_id === 0
      ? t('无邀请人')
      : `${t('邀请人')}: #${record.inviter_id}`;
  const inviteeUsernames = Array.isArray(record.invitee_usernames)
    ? record.invitee_usernames
    : [];
  const inviteePreview =
    inviteeUsernames.length > 0
      ? inviteeUsernames.slice(0, 3).join('、')
      : t('暂无');
  const inviteeCount = Number(record.invitee_count || inviteeUsernames.length || 0);
  const remainingInviteeCount = Math.max(
    0,
    inviteeCount - Math.min(3, inviteeUsernames.length),
  );

  return (
    <div>
      <Space spacing={1}>
        <Tooltip content={t('点击复制 aff')} position='top'>
          <Tag
            color='cyan'
            shape='circle'
            className='!text-xs cursor-pointer'
            onClick={handleCopyAffCode}
          >
            {t('邀请返佣码')}: {record.aff_code || '-'}
          </Tag>
        </Tooltip>
        <Tag color='white' shape='circle' className='!text-xs'>
          {t('邀请')}: {renderNumber(record.aff_count)}
        </Tag>
        <Tag color='white' shape='circle' className='!text-xs'>
          {t('收益')}: {renderQuota(record.aff_history_quota)}
        </Tag>
        <Tag color='white' shape='circle' className='!text-xs'>
          {inviterLabel}
        </Tag>
        <Tag color='white' shape='circle' className='!text-xs'>
          {t('邀请了')}: {inviteePreview}
          {remainingInviteeCount > 0 ? ` +${remainingInviteeCount}` : ''}
        </Tag>
      </Space>
    </div>
  );
};

/**
 * Render operations column
 */
const renderOperations = (
  text,
  record,
  {
    permissions,
    setEditingUser,
    setShowEditUser,
    showEnableDisableModal,
    showDeleteModal,
    showResetPasskeyModal,
    showResetTwoFAModal,
    showUserSubscriptionsModal,
    showUserHistoryModal,
    resetAffCount,
    setAffCount,
    sendSiteNotification,
    t,
  },
) => {
  if (record.DeletedAt !== null) {
    return <></>;
  }

  const status = Number(record.status);
  const canDisable = status !== USER_STATUS_DISABLED;
  const canBan = status !== USER_STATUS_BANNED;
  const canEnable = status !== USER_STATUS_ENABLED;

  const moreMenu = [
    {
      node: 'item',
      name: t('复制 aff'),
      onClick: async () => {
        if (!record.aff_code) {
          showError(t('该用户暂无 aff'));
          return;
        }
        if (await copy(record.aff_code)) {
          showSuccess(t('已复制：') + record.aff_code);
          return;
        }
        showError(t('复制失败'));
      },
    },
    permissions?.canEditUser
      ? {
          node: 'item',
          name: t('重置邀请次数'),
          onClick: () => resetAffCount(record),
        }
      : null,
    permissions?.canEditUser
      ? {
          node: 'item',
          name: t('设置邀请次数'),
          onClick: () => setAffCount(record),
        }
      : null,
    {
      node: 'divider',
    },
    {
      node: 'item',
      name: t('历史记录'),
      onClick: () => showUserHistoryModal(record),
    },
    permissions?.canViewSubscriptions
      ? {
          node: 'item',
          name: t('订阅管理'),
          onClick: () => showUserSubscriptionsModal(record),
        }
      : null,
    permissions?.canNotifyUser
      ? {
          node: 'item',
          name: t('发送站内信'),
          onClick: () => sendSiteNotification(record),
        }
      : null,
    permissions?.canEditUser
      ? {
          node: 'item',
          name: t('重置 Passkey'),
          onClick: () => showResetPasskeyModal(record),
        }
      : null,
    permissions?.canEditUser
      ? {
          node: 'item',
          name: t('重置 2FA'),
          onClick: () => showResetTwoFAModal(record),
        }
      : null,
    permissions?.canDeleteUser
      ? {
          node: 'divider',
        }
      : null,
    permissions?.canDeleteUser
      ? {
          node: 'item',
          name: t('注销'),
          type: 'danger',
          onClick: () => showDeleteModal(record),
        }
      : null,
  ].filter(Boolean);

  return (
    <Space>
      {permissions?.canDisableUser && canDisable ? (
        <Button
          type='danger'
          size='small'
          onClick={() => showEnableDisableModal(record, 'disable')}
        >
          {t('禁用')}
        </Button>
      ) : null}
      {permissions?.canDisableUser && canBan ? (
        <Button
          type='warning'
          size='small'
          onClick={() => showEnableDisableModal(record, 'ban')}
        >
          {t('封禁')}
        </Button>
      ) : null}
      {permissions?.canDisableUser && canEnable ? (
        <Button
          size='small'
          onClick={() => showEnableDisableModal(record, 'enable')}
        >
          {t('启用')}
        </Button>
      ) : null}
      {permissions?.canEditUser && (
      <Button
        type='tertiary'
        size='small'
        onClick={() => {
          setEditingUser(record);
          setShowEditUser(true);
        }}
      >
        {t('编辑')}
      </Button>
      )}
      {moreMenu.length > 0 && (
      <Dropdown menu={moreMenu} trigger='click' position='bottomRight'>
        <Button type='tertiary' size='small' icon={<IconMore />} />
      </Dropdown>
      )}
    </Space>
  );
};

/**
 * Get users table column definitions
 */
export const getUsersColumns = ({
  t,
  permissions,
  setEditingUser,
  setShowEditUser,
  showEnableDisableModal,
  showDeleteModal,
  showResetPasskeyModal,
  showResetTwoFAModal,
  showUserSubscriptionsModal,
  showUserHistoryModal,
  resetAffCount,
  setAffCount,
  sendSiteNotification,
}) => {
  return [
    {
      title: 'ID',
      dataIndex: 'id',
    },
    {
      title: t('用户名'),
      dataIndex: 'username',
      render: (text, record) => renderUsername(text, record),
    },
    {
      title: t('注册时间'),
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (value) => {
        if (!value) {
          return <Text type='tertiary'>—</Text>;
        }
        return (
          <Text
            type='secondary'
            ellipsis={{ showTooltip: true, tooltipMaxWidth: 200 }}
            style={{ display: 'block', maxWidth: 150 }}
          >
            {timestamp2string(value)}
          </Text>
        );
      },
    },
    {
      title: t('状态'),
      dataIndex: 'info',
      render: (text, record, index) =>
        renderStatistics(text, record, showEnableDisableModal, t),
    },
    {
      title: t('剩余额度/总额度'),
      key: 'quota_usage',
      render: (text, record) => renderQuotaUsage(text, record, t),
    },
    {
      title: t('分组'),
      dataIndex: 'group',
      render: (text, record, index) => {
        return <div>{renderGroup(text)}</div>;
      },
    },
    {
      title: t('角色'),
      dataIndex: 'role',
      render: (text, record, index) => {
        return <div>{renderRole(text, t)}</div>;
      },
    },
    {
      title: t('邀请信息'),
      dataIndex: 'invite',
      render: (text, record, index) => renderInviteInfo(text, record, t),
    },
    {
      title: '',
      dataIndex: 'operate',
      fixed: 'right',
      width: 200,
      render: (text, record, index) =>
        renderOperations(text, record, {
          permissions,
          setEditingUser,
          setShowEditUser,
          showEnableDisableModal,
          showDeleteModal,
          showResetPasskeyModal,
          showResetTwoFAModal,
          showUserSubscriptionsModal,
          showUserHistoryModal,
          resetAffCount,
          setAffCount,
          sendSiteNotification,
          t,
        }),
    },
  ];
};
