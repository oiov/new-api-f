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
import { Modal } from '@douyinfe/semi-ui';

const DeleteTokensModal = ({
  visible,
  onCancel,
  onConfirm,
  count,
  mode,
  t,
}) => {
  const isInvalidMode = mode === 'invalid';
  return (
    <Modal
      title={isInvalidMode ? t('批量删除无效令牌') : t('批量删除令牌')}
      visible={visible}
      onCancel={onCancel}
      onOk={onConfirm}
      type='warning'
    >
      <div>
        {isInvalidMode
          ? t('确定要删除当前筛选条件下的全部无效令牌吗？')
          : t('确定要删除所选的 {{count}} 个令牌吗？', {
              count,
            })}
      </div>
    </Modal>
  );
};

export default DeleteTokensModal;
