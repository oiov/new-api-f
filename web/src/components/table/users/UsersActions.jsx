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
import { isRoot } from '../../../helpers';

const UsersActions = ({ setShowAddUser, manageUser, t }) => {
  // Add new user
  const handleAddUser = () => {
    setShowAddUser(true);
  };

  const handleResetAllAffCount = () => {
    Modal.confirm({
      title: t('确定是否要重置所有用户的邀请次数？'),
      content: t('该操作会将所有用户的邀请次数清零，但不会修改 aff、邀请收益和邀请关系。'),
      type: 'warning',
      onOk: () => manageUser(0, 'reset_all_aff_count'),
    });
  };

  return (
    <div className='flex gap-2 w-full md:w-auto order-2 md:order-1'>
      <Button className='w-full md:w-auto' onClick={handleAddUser} size='small'>
        {t('添加用户')}
      </Button>
      {isRoot() && (
        <Button
          className='w-full md:w-auto'
          onClick={handleResetAllAffCount}
          size='small'
          type='warning'
        >
          {t('重置所有邀请次数')}
        </Button>
      )}
    </div>
  );
};

export default UsersActions;
