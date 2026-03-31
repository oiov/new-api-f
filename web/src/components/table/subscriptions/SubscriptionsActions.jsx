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
import { Button, Modal } from '@douyinfe/semi-ui';

const SubscriptionsActions = ({
  openCreate,
  openMigration,
  enableBatchMode,
  setEnableBatchMode,
  batchSetPlansEnabled,
  batchUpdatingPlans,
  t,
}) => {
  return (
    <div className='flex gap-2 w-full md:w-auto'>
      <Button
        type='primary'
        className='w-full md:w-auto'
        onClick={openCreate}
        size='small'
      >
        {t('新建套餐')}
      </Button>
      <Button
        className='w-full md:w-auto'
        onClick={openMigration}
        size='small'
      >
        {t('订阅迁移')}
      </Button>
      <Button
        className='w-full md:w-auto'
        type={enableBatchMode ? 'primary' : 'tertiary'}
        theme={enableBatchMode ? 'solid' : 'light'}
        onClick={() => setEnableBatchMode((prev) => !prev)}
        size='small'
      >
        {enableBatchMode ? t('退出批量模式') : t('批量模式')}
      </Button>
      <Button
        className='w-full md:w-auto'
        disabled={!enableBatchMode || batchUpdatingPlans}
        loading={batchUpdatingPlans}
        onClick={() => {
          Modal.confirm({
            title: t('确认批量启用'),
            content: t('启用后选中的套餐将在用户端展示。是否继续？'),
            centered: true,
            onOk: () => batchSetPlansEnabled(true),
          });
        }}
        size='small'
      >
        {t('批量启用')}
      </Button>
      <Button
        className='w-full md:w-auto'
        type='danger'
        disabled={!enableBatchMode || batchUpdatingPlans}
        loading={batchUpdatingPlans}
        onClick={() => {
          Modal.confirm({
            title: t('确认批量禁用'),
            content: t('禁用后选中的套餐不再展示，但历史订单不受影响。是否继续？'),
            centered: true,
            onOk: () => batchSetPlansEnabled(false),
          });
        }}
        size='small'
      >
        {t('批量禁用')}
      </Button>
    </div>
  );
};

export default SubscriptionsActions;
