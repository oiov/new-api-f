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

import React, { useContext, useState } from 'react';
import { Banner, Button, TabPane, Tabs } from '@douyinfe/semi-ui';
import CardPro from '../../common/ui/CardPro';
import SubscriptionsTable from './SubscriptionsTable';
import SubscriptionsActions from './SubscriptionsActions';
import SubscriptionsDescription from './SubscriptionsDescription';
import SubscriptionsPlanFilters from './SubscriptionsPlanFilters';
import AdminUserSubscriptionsFilters from './AdminUserSubscriptionsFilters';
import AdminUserSubscriptionsTable from './AdminUserSubscriptionsTable';
import AddEditSubscriptionModal from './modals/AddEditSubscriptionModal';
import SubscriptionMigrationModal from './modals/SubscriptionMigrationModal';
import SubscriptionConsumeLogsModal from './modals/SubscriptionConsumeLogsModal';
import SubscriptionConversionRequestsPanel from './SubscriptionConversionRequestsPanel';
import ManualDeliveryOrdersPanel from './ManualDeliveryOrdersPanel';
import { useSubscriptionsData } from '../../../hooks/subscriptions/useSubscriptionsData';
import { useIsMobile } from '../../../hooks/common/useIsMobile';
import { createCardProPagination } from '../../../helpers/utils';
import { StatusContext } from '../../../context/Status';

const SubscriptionsPage = () => {
  const subscriptionsData = useSubscriptionsData();
  const isMobile = useIsMobile();
  const [statusState] = useContext(StatusContext);
  const [showMigration, setShowMigration] = useState(false);
  const [consumeLogsFilter, setConsumeLogsFilter] = useState(null);
  const enableEpay = !!statusState?.status?.enable_online_topup;

  const {
    showEdit,
    editingPlan,
    sheetPlacement,
    closeEdit,
    refresh,
    openCreate,
    compactMode,
    setCompactMode,
    t,
  } = subscriptionsData;

  return (
    <>
      <AddEditSubscriptionModal
        visible={showEdit}
        handleClose={closeEdit}
        editingPlan={editingPlan}
        placement={sheetPlacement}
        refresh={refresh}
        t={t}
      />
      <SubscriptionMigrationModal
        visible={showMigration}
        handleClose={() => setShowMigration(false)}
        refresh={refresh}
        t={t}
      />
      <SubscriptionConsumeLogsModal
        visible={!!consumeLogsFilter}
        onCancel={() => setConsumeLogsFilter(null)}
        initialFilter={consumeLogsFilter}
        planOptions={(subscriptionsData.allPlans || []).map((item) => ({
          label: item?.plan?.title || `#${item?.plan?.id}`,
          value: item?.plan?.id,
        }))}
        planMetaMap={
          new Map(
            (subscriptionsData.allPlans || []).map((item) => [
              item?.plan?.id,
              item?.plan,
            ]),
          )
        }
        t={t}
      />

      <Tabs type='card' defaultActiveKey='config' className='mt-1'>
        <TabPane tab={t('订阅管理配置')} itemKey='config'>
          <CardPro
            type='type1'
            descriptionArea={
              <SubscriptionsDescription
                compactMode={compactMode}
                setCompactMode={setCompactMode}
                title={t('订阅管理配置')}
                t={t}
              />
            }
            actionsArea={
              <div className='flex flex-col gap-3 w-full'>
                <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 w-full'>
                  <SubscriptionsActions
                    openCreate={openCreate}
                    openMigration={() => setShowMigration(true)}
                    enableBatchMode={subscriptionsData.enableBatchMode}
                    setEnableBatchMode={subscriptionsData.setEnableBatchMode}
                    batchSetPlansEnabled={
                      subscriptionsData.batchSetPlansEnabled
                    }
                    batchUpdatingPlans={subscriptionsData.batchUpdatingPlans}
                    t={t}
                  />
                  <div className='w-full lg:w-auto lg:max-w-[520px]'>
                    <Banner
                      type='info'
                      description={t(
                        'Stripe/Creem 需在第三方平台创建商品并填入 ID',
                      )}
                      closeIcon={null}
                      className='!rounded-lg'
                      style={{ maxWidth: '100%' }}
                    />
                  </div>
                </div>
              </div>
            }
            searchArea={
              <SubscriptionsPlanFilters
                formInitValues={subscriptionsData.planFiltersFormInitValues}
                setFormApi={subscriptionsData.setPlanFiltersFormApi}
                searchPlans={subscriptionsData.searchPlans}
                resetPlanFilters={subscriptionsData.resetPlanFilters}
                loading={subscriptionsData.loading}
                groupOptions={subscriptionsData.groupOptions}
                t={t}
              />
            }
            paginationArea={createCardProPagination({
              currentPage: subscriptionsData.activePage,
              pageSize: subscriptionsData.pageSize,
              total: subscriptionsData.planCount,
              onPageChange: subscriptionsData.handlePageChange,
              onPageSizeChange: subscriptionsData.handlePageSizeChange,
              isMobile,
              t: subscriptionsData.t,
            })}
            t={t}
          >
            <SubscriptionsTable
              {...subscriptionsData}
              enableEpay={enableEpay}
            />
          </CardPro>
        </TabPane>

        <TabPane tab={t('订阅管理详情')} itemKey='detail'>
          <CardPro
            type='type1'
            descriptionArea={
              <SubscriptionsDescription
                compactMode={compactMode}
                setCompactMode={setCompactMode}
                title={t('订阅管理详情')}
                subtitle={t(
                  '支持按创建时间、生效开始时间、到期时间，以及套餐、状态、来源、用户、配置分组、升级分组和资源类型进行组合筛选，适合统计与财务审计',
                )}
                t={t}
              />
            }
            actionsArea={
              <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 w-full'>
                <div className='text-sm text-gray-500'>
                  {t('可筛选全部订阅记录，并重点识别兑换码兑换来源')}
                </div>
                <div className='w-full lg:w-auto flex justify-start lg:justify-end'>
                  <Button size='small' onClick={() => setConsumeLogsFilter({})}>
                    {t('全部订阅消耗')}
                  </Button>
                </div>
              </div>
            }
            searchArea={
              <AdminUserSubscriptionsFilters
                formInitValues={
                  subscriptionsData.userSubscriptionsFormInitValues
                }
                setFormApi={subscriptionsData.setUserSubscriptionsFormApi}
                searchUserSubscriptions={
                  subscriptionsData.searchUserSubscriptions
                }
                loading={subscriptionsData.userSubscriptionsLoading}
                groupOptions={subscriptionsData.groupOptions}
                planOptions={subscriptionsData.planOptions}
                t={t}
              />
            }
            paginationArea={createCardProPagination({
              currentPage: subscriptionsData.userSubscriptionsPage,
              pageSize: subscriptionsData.userSubscriptionsPageSize,
              total: subscriptionsData.userSubscriptionsTotal,
              onPageChange: subscriptionsData.handleUserSubscriptionsPageChange,
              onPageSizeChange:
                subscriptionsData.handleUserSubscriptionsPageSizeChange,
              isMobile,
              t: subscriptionsData.t,
            })}
            t={t}
          >
            <AdminUserSubscriptionsTable
              dataSource={subscriptionsData.userSubscriptions}
              loading={subscriptionsData.userSubscriptionsLoading}
              compactMode={compactMode}
              planTitleMap={subscriptionsData.planTitleMap}
              openConsumeLogs={(filter) => setConsumeLogsFilter(filter)}
              t={t}
            />
          </CardPro>
        </TabPane>

        <TabPane tab={t('套餐转余额审核')} itemKey='conversion-requests'>
          <SubscriptionConversionRequestsPanel t={t} />
        </TabPane>

        <TabPane tab={t('人工发放订单')} itemKey='manual-orders'>
          <ManualDeliveryOrdersPanel t={t} />
        </TabPane>
      </Tabs>
    </>
  );
};

export default SubscriptionsPage;
