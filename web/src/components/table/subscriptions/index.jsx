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
import { Banner, Button } from '@douyinfe/semi-ui';
import CardPro from '../../common/ui/CardPro';
import SubscriptionsTable from './SubscriptionsTable';
import SubscriptionsActions from './SubscriptionsActions';
import SubscriptionsDescription from './SubscriptionsDescription';
import AdminUserSubscriptionsFilters from './AdminUserSubscriptionsFilters';
import AdminUserSubscriptionsTable from './AdminUserSubscriptionsTable';
import AddEditSubscriptionModal from './modals/AddEditSubscriptionModal';
import SubscriptionMigrationModal from './modals/SubscriptionMigrationModal';
import SubscriptionConsumeLogsModal from './modals/SubscriptionConsumeLogsModal';
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
        planMetaMap={new Map(
          (subscriptionsData.allPlans || []).map((item) => [item?.plan?.id, item?.plan]),
        )}
        t={t}
      />

      <CardPro
        type='type1'
        descriptionArea={
          <SubscriptionsDescription
            compactMode={compactMode}
            setCompactMode={setCompactMode}
            t={t}
          />
        }
        actionsArea={
          <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
            {/* Mobile: actions first; Desktop: actions left */}
            <div className='order-1 md:order-0 w-full md:w-auto'>
              <SubscriptionsActions
                openCreate={openCreate}
                openMigration={() => setShowMigration(true)}
                t={t}
              />
            </div>
            <Banner
              type='info'
              description={t('Stripe/Creem 需在第三方平台创建商品并填入 ID')}
              closeIcon={null}
              // Mobile: banner below; Desktop: banner right
              className='!rounded-lg order-2 md:order-1'
              style={{ maxWidth: '100%' }}
            />
          </div>
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
        <SubscriptionsTable {...subscriptionsData} enableEpay={enableEpay} />
      </CardPro>

      <div className='mt-4'>
        <CardPro
          type='type1'
          descriptionArea={
            <SubscriptionsDescription
              compactMode={compactMode}
              setCompactMode={setCompactMode}
              t={t}
            />
          }
          actionsArea={
            <div className='flex items-center justify-between gap-2 w-full'>
              <div className='text-sm text-gray-500'>
                {t('管理员可在此查看所有用户的订阅记录与当前状态')}
              </div>
              <Button size='small' onClick={() => setConsumeLogsFilter({})}>
                {t('全部订阅消耗')}
              </Button>
            </div>
          }
          searchArea={
            <AdminUserSubscriptionsFilters
              formInitValues={subscriptionsData.userSubscriptionsFormInitValues}
              setFormApi={subscriptionsData.setUserSubscriptionsFormApi}
              searchUserSubscriptions={subscriptionsData.searchUserSubscriptions}
              loading={subscriptionsData.userSubscriptionsLoading}
              groupOptions={subscriptionsData.groupOptions}
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
      </div>
    </>
  );
};

export default SubscriptionsPage;
