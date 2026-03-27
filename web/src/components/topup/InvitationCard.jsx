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
  Avatar,
  Badge,
  Card,
  Button,
  Divider,
  Empty,
  Input,
  Pagination,
  Skeleton,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  BarChart2,
  CalendarClock,
  Copy,
  Gift,
  Package,
  ShieldCheck,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';
import {
  formatSubscriptionDuration,
  formatSubscriptionResourceLabel,
  getSubscriptionUsageSummary,
} from '../../helpers/subscriptionFormat';

const { Text } = Typography;

function formatDateTime(timestamp) {
  if (!timestamp) return '--';
  return new Date(timestamp * 1000).toLocaleString();
}

function getPlanBenefitText(plan, renderQuota, t) {
  if (!plan) return t('未配置套餐奖励');
  const summary = getSubscriptionUsageSummary(plan);
  const label = formatSubscriptionResourceLabel(plan, t);
  if (summary.unlimited) {
    return `${label} ${t('不限')}`;
  }
  if (plan?.resource_type === 'request_count') {
    return `${label} ${summary.total} ${t('次')}`;
  }
  return `${label} ${renderQuota(summary.total)}`;
}

function renderRewardStatusTag(status, blockedReason, t) {
  if (status === 'granted') {
    return <Tag color='green' size='small'>{t('奖励已发放')}</Tag>;
  }
  if (status === 'blocked') {
    return (
      <Tag color='red' size='small'>
        {blockedReason ? `${t('奖励已拦截')} (${blockedReason})` : t('奖励已拦截')}
      </Tag>
    );
  }
  return <Tag color='orange' size='small'>{t('历史数据待确认')}</Tag>;
}

function renderPieceStatusText(status, configuredText, grantedText, t) {
  if (status === 'granted') return grantedText;
  if (status === 'blocked') return t('已拦截');
  if (status === 'not_configured') return configuredText;
  return t('待确认');
}

const InvitationCard = ({
  t,
  userState,
  renderQuota,
  setOpenTransfer,
  affLink,
  handleAffLinkClick,
  inviteDetailsLoading = false,
  inviteDetails = {},
  invitedUsersPage = 1,
  invitedUsersPageSize = 10,
  setInvitedUsersPage,
  setInvitedUsersPageSize,
  inviterRewardPage = 1,
  inviterRewardPageSize = 10,
  setInviterRewardPage,
  setInviterRewardPageSize,
}) => {
  const config = inviteDetails?.config || {};
  const inviterRewardRecords = inviteDetails?.inviter_reward_records || [];
  const invitedUsers = inviteDetails?.invited_users || [];
  const inviterRewardTotal = Number(inviteDetails?.inviter_reward_total || 0);
  const invitedUsersTotal = Number(inviteDetails?.invited_users_total || 0);

  return (
    <Card className='!rounded-2xl shadow-sm border-0'>
      {/* 卡片头部 */}
      <div className='flex items-center mb-4'>
        <Avatar size='small' color='green' className='mr-3 shadow-md'>
          <Gift size={16} />
        </Avatar>
        <div>
          <Typography.Text className='text-lg font-medium'>
            {t('邀请拉新')}
          </Typography.Text>
          <div className='text-xs'>{t('分享注册链接，查看拉新收益与邀请人数')}</div>
        </div>
      </div>

      {/* 收益展示区域 */}
      <Space vertical style={{ width: '100%' }}>
        {/* 统计数据统一卡片 */}
        <Card
          className='!rounded-xl w-full'
          cover={
            <div
              className='relative h-30'
              style={{
                '--palette-primary-darkerChannel': '0 75 80',
                backgroundImage: `linear-gradient(0deg, rgba(var(--palette-primary-darkerChannel) / 80%), rgba(var(--palette-primary-darkerChannel) / 80%)), url('/cover-4.webp')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
              }}
            >
              {/* 标题和按钮 */}
              <div className='relative z-10 h-full flex flex-col justify-between p-4'>
                <div className='flex justify-between items-center'>
                  <Text strong style={{ color: 'white', fontSize: '16px' }}>
                    {t('拉新数据')}
                  </Text>
                  <Button
                    type='primary'
                    theme='solid'
                    size='small'
                    disabled={
                      !userState?.user?.aff_quota ||
                      userState?.user?.aff_quota <= 0
                    }
                    onClick={() => setOpenTransfer(true)}
                    className='!rounded-lg'
                  >
                    <Zap size={12} className='mr-1' />
                    {t('划转到余额')}
                  </Button>
                </div>

                {/* 统计数据 */}
                <div className='grid grid-cols-3 gap-6 mt-4'>
                  {/* 待使用收益 */}
                  <div className='text-center'>
                    <div
                      className='text-base sm:text-2xl font-bold mb-2'
                      style={{ color: 'white' }}
                    >
                      {renderQuota(userState?.user?.aff_quota || 0)}
                    </div>
                    <div className='flex items-center justify-center text-sm'>
                      <TrendingUp
                        size={14}
                        className='mr-1'
                        style={{ color: 'rgba(255,255,255,0.8)' }}
                      />
                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.8)',
                          fontSize: '12px',
                        }}
                      >
                        {t('待使用收益')}
                      </Text>
                    </div>
                  </div>

                  {/* 总收益 */}
                  <div className='text-center'>
                    <div
                      className='text-base sm:text-2xl font-bold mb-2'
                      style={{ color: 'white' }}
                    >
                      {renderQuota(userState?.user?.aff_history_quota || 0)}
                    </div>
                    <div className='flex items-center justify-center text-sm'>
                      <BarChart2
                        size={14}
                        className='mr-1'
                        style={{ color: 'rgba(255,255,255,0.8)' }}
                      />
                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.8)',
                          fontSize: '12px',
                        }}
                      >
                        {t('总收益')}
                      </Text>
                    </div>
                  </div>

                  {/* 邀请人数 */}
                  <div className='text-center'>
                    <div
                      className='text-base sm:text-2xl font-bold mb-2'
                      style={{ color: 'white' }}
                    >
                      {userState?.user?.aff_count || 0}
                    </div>
                    <div className='flex items-center justify-center text-sm'>
                      <Users
                        size={14}
                        className='mr-1'
                        style={{ color: 'rgba(255,255,255,0.8)' }}
                      />
                      <Text
                        style={{
                          color: 'rgba(255,255,255,0.8)',
                          fontSize: '12px',
                        }}
                      >
                        {t('邀请人数')}
                      </Text>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }
        >
          {/* 邀请链接部分 */}
          <Input
            value={affLink}
            readonly
            className='!rounded-lg'
            prefix={t('邀请链接')}
            suffix={
              <Button
                type='primary'
                theme='solid'
                onClick={handleAffLinkClick}
                icon={<Copy size={14} />}
                className='!rounded-lg'
              >
                {t('复制')}
              </Button>
            }
          />
        </Card>

        {/* 奖励说明 */}
        <Card
          className='!rounded-xl w-full'
          title={<Text type='tertiary'>{t('奖励说明')}</Text>}
        >
          <div className='space-y-3'>
            <div className='flex items-start gap-2'>
              <Badge dot type='success' />
              <Text type='tertiary' className='text-sm'>
                {t('邀请好友注册，好友充值后您可获得相应奖励')}
              </Text>
            </div>

            <div className='flex items-start gap-2'>
              <Badge dot type='success' />
              <Text type='tertiary' className='text-sm'>
                {t('通过划转功能将奖励额度转入到您的账户余额中')}
              </Text>
            </div>

            <div className='flex items-start gap-2'>
              <Badge dot type='success' />
              <Text type='tertiary' className='text-sm'>
                {t('邀请的好友越多，获得的奖励越多')}
              </Text>
            </div>
          </div>
        </Card>

        <Card
          className='!rounded-xl w-full'
          title={<Text type='tertiary'>{t('当前邀请奖励配置')}</Text>}
        >
          {inviteDetailsLoading ? (
            <Skeleton.Paragraph active rows={4} />
          ) : (
            <div className='grid grid-cols-1 gap-3 lg:grid-cols-2'>
              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-4'>
                <div className='flex items-center gap-2'>
                  <Gift size={14} className='text-emerald-500' />
                  <Text strong>{t('邀请人奖励')}</Text>
                </div>
                <div className='mt-3 space-y-2 text-sm'>
                  <div className='flex items-center justify-between'>
                    <Text type='tertiary'>{t('赠送额度')}</Text>
                    <Text strong>{renderQuota(config?.inviter_quota || 0)}</Text>
                  </div>
                  <div className='flex items-start justify-between gap-3'>
                    <Text type='tertiary'>{t('赠送套餐')}</Text>
                    <div className='text-right'>
                      <div className='font-medium text-semi-color-text-0'>
                        {config?.inviter_plan?.title || t('未配置套餐奖励')}
                      </div>
                      {config?.inviter_plan && (
                        <Text type='tertiary' size='small'>
                          {getPlanBenefitText(config.inviter_plan, renderQuota, t)} ·{' '}
                          {formatSubscriptionDuration(config.inviter_plan, t)}
                        </Text>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-4'>
                <div className='flex items-center gap-2'>
                  <ShieldCheck size={14} className='text-blue-500' />
                  <Text strong>{t('被邀请人奖励')}</Text>
                </div>
                <div className='mt-3 space-y-2 text-sm'>
                  <div className='flex items-center justify-between'>
                    <Text type='tertiary'>{t('赠送额度')}</Text>
                    <Text strong>{renderQuota(config?.invitee_quota || 0)}</Text>
                  </div>
                  <div className='flex items-start justify-between gap-3'>
                    <Text type='tertiary'>{t('赠送套餐')}</Text>
                    <div className='text-right'>
                      <div className='font-medium text-semi-color-text-0'>
                        {config?.invitee_plan?.title || t('未配置套餐奖励')}
                      </div>
                      {config?.invitee_plan && (
                        <Text type='tertiary' size='small'>
                          {getPlanBenefitText(config.invitee_plan, renderQuota, t)} ·{' '}
                          {formatSubscriptionDuration(config.invitee_plan, t)}
                        </Text>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card
          className='!rounded-xl w-full'
          title={<Text type='tertiary'>{t('邀请套餐奖励记录')}</Text>}
        >
          {inviteDetailsLoading ? (
            <Skeleton.Paragraph active rows={5} />
          ) : inviterRewardRecords.length > 0 ? (
            <div className='space-y-3'>
              {inviterRewardRecords.map((record) => (
                <div
                  key={record.subscription_id}
                  className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-4'
                >
                  <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Package size={14} className='text-amber-500' />
                        <Text strong>{record.plan_title || `#${record.plan_id}`}</Text>
                        <Tag color={record.status === 'active' ? 'green' : 'grey'} size='small'>
                          {record.status === 'active' ? t('生效中') : t('已结束')}
                        </Tag>
                      </div>
                      <div className='mt-2 text-sm text-gray-500'>
                        {getPlanBenefitText(record.plan, renderQuota, t)} ·{' '}
                        {formatSubscriptionDuration(record.plan, t)}
                        {record?.plan?.upgrade_group
                          ? ` · ${t('升级分组')} ${record.plan.upgrade_group}`
                          : ''}
                      </div>
                    </div>
                    <div className='text-left text-sm text-gray-500 lg:text-right'>
                      <div>{t('发放时间')}：{formatDateTime(record.created_at)}</div>
                      <div>{t('到期时间')}：{formatDateTime(record.end_time)}</div>
                    </div>
                  </div>
                </div>
              ))}
              <div className='flex justify-end pt-2'>
                <Pagination
                  currentPage={inviterRewardPage}
                  pageSize={inviterRewardPageSize}
                  total={inviterRewardTotal}
                  pageSizeOpts={[10, 20, 50]}
                  showSizeChanger
                  onPageChange={setInviterRewardPage}
                  onPageSizeChange={(size) => {
                    setInviterRewardPageSize(size);
                    setInviterRewardPage(1);
                  }}
                />
              </div>
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              title={t('暂无套餐奖励记录')}
              description={t('邀请成功后，如配置了邀请套餐奖励，将展示在这里')}
            />
          )}
        </Card>

        <Card
          className='!rounded-xl w-full'
          title={<Text type='tertiary'>{t('邀请用户列表')}</Text>}
        >
          {inviteDetailsLoading ? (
            <Skeleton.Paragraph active rows={6} />
          ) : invitedUsers.length > 0 ? (
            <div className='space-y-3'>
              {invitedUsers.map((item) => (
                <div
                  key={item.user_id}
                  className='rounded-xl border border-semi-color-border bg-semi-color-fill-0 p-4'
                >
                  <div className='flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between'>
                    <div className='min-w-0'>
                      <div className='flex flex-wrap items-center gap-2'>
                        <Text strong>
                          {item.display_name || item.username || `#${item.user_id}`}
                        </Text>
                        {renderRewardStatusTag(item.overall_status, item.blocked_reason, t)}
                        {item.quota_status === 'granted' && item.plan_status !== 'granted' && (
                          <Tag color='blue' size='small'>
                            {t('仅额度奖励')}
                          </Tag>
                        )}
                      </div>
                      <div className='mt-1 text-sm text-gray-500'>
                        @{item.username || '--'} · ID #{item.user_id}
                      </div>
                    </div>

                    <div className='text-left text-sm text-gray-500 lg:text-right'>
                      <div className='flex items-center gap-1 lg:justify-end'>
                        <CalendarClock size={13} />
                        <span>
                          {t('奖励时间')}：{formatDateTime(item.reward_at)}
                        </span>
                      </div>
                      {item.reward_end_time > 0 && (
                        <div>{t('套餐到期')}：{formatDateTime(item.reward_end_time)}</div>
                      )}
                    </div>
                  </div>

                  <Divider margin={12} />

                  <div className='grid grid-cols-1 gap-3 text-sm lg:grid-cols-3'>
                    <div>
                      <Text type='tertiary'>{t('额度奖励')}</Text>
                      <div className='mt-1 text-semi-color-text-0'>
                        {item.quota_status === 'granted'
                          ? renderQuota(config?.invitee_quota || 0)
                          : renderPieceStatusText(
                              item.quota_status,
                              t('未配置'),
                              renderQuota(config?.invitee_quota || 0),
                              t,
                            )}
                      </div>
                    </div>
                    <div>
                      <Text type='tertiary'>{t('套餐奖励')}</Text>
                      <div className='mt-1 text-semi-color-text-0'>
                        {item.invitee_plan?.title ||
                          renderPieceStatusText(
                            item.plan_status,
                            t('未配置'),
                            t('已发放套餐奖励'),
                            t,
                          )}
                      </div>
                    </div>
                    <div>
                      <Text type='tertiary'>{t('奖励详情')}</Text>
                      <div className='mt-1 text-semi-color-text-0'>
                        {item.invitee_plan
                          ? `${getPlanBenefitText(item.invitee_plan, renderQuota, t)} · ${formatSubscriptionDuration(item.invitee_plan, t)}`
                          : renderPieceStatusText(
                              item.plan_status,
                              t('未配置'),
                              t('已发放'),
                              t,
                            )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <div className='flex justify-end pt-2'>
                <Pagination
                  currentPage={invitedUsersPage}
                  pageSize={invitedUsersPageSize}
                  total={invitedUsersTotal}
                  pageSizeOpts={[10, 20, 50]}
                  showSizeChanger
                  onPageChange={setInvitedUsersPage}
                  onPageSizeChange={(size) => {
                    setInvitedUsersPageSize(size);
                    setInvitedUsersPage(1);
                  }}
                />
              </div>
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              title={t('暂无邀请记录')}
              description={t('当有用户通过你的邀请链接注册后，会显示在这里')}
            />
          )}
        </Card>
      </Space>
    </Card>
  );
};

export default InvitationCard;
