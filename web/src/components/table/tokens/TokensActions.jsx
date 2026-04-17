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

import React, { useState } from 'react';
import { Button } from '@douyinfe/semi-ui';
import { showError } from '../../../helpers';
import CopyTokensModal from './modals/CopyTokensModal';
import DeleteTokensModal from './modals/DeleteTokensModal';

const TokensActions = ({
  selectedKeys,
  setSelectedKeys,
  setEditingToken,
  setShowEdit,
  batchCopyTokens,
  batchTestTokens,
  batchDeleteTokens,
  batchDeleteInvalidTokens,
  t,
}) => {
  const selectedCount = selectedKeys.length;
  // Modal states
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteMode, setDeleteMode] = useState('selected');

  // Handle copy selected tokens with options
  const handleCopySelectedTokens = () => {
    if (selectedKeys.length === 0) {
      showError(t('请至少选择一个令牌！'));
      return;
    }
    setShowCopyModal(true);
  };

  // Handle delete selected tokens with confirmation
  const handleDeleteSelectedTokens = () => {
    if (selectedKeys.length === 0) {
      showError(t('请至少选择一个令牌！'));
      return;
    }
    setDeleteMode('selected');
    setShowDeleteModal(true);
  };

  const handleDeleteInvalidTokens = () => {
    setDeleteMode('invalid');
    setShowDeleteModal(true);
  };

  // Handle delete confirmation
  const handleConfirmDelete = () => {
    if (deleteMode === 'invalid') {
      batchDeleteInvalidTokens();
    } else {
      batchDeleteTokens();
    }
    setShowDeleteModal(false);
  };

  return (
    <>
      <div className='flex flex-col gap-2 w-full md:w-auto order-2 md:order-1'>
        <div className='flex flex-wrap gap-2'>
          <Button
            type='primary'
            className='flex-1 md:flex-initial'
            onClick={() => {
              setEditingToken({
                id: undefined,
              });
              setShowEdit(true);
            }}
            size='small'
          >
            {t('添加令牌')}
          </Button>

          <Button
            type='tertiary'
            className='flex-1 md:flex-initial'
            onClick={handleCopySelectedTokens}
            size='small'
            disabled={selectedCount === 0}
          >
            {t('复制所选令牌')}
          </Button>

          <Button
            type='primary'
            theme='light'
            className='flex-1 md:flex-initial'
            onClick={batchTestTokens}
            size='small'
            disabled={selectedCount === 0}
          >
            {t('测试所选令牌')} ({selectedCount})
          </Button>

          <Button
            type='danger'
            className='w-full md:w-auto'
            onClick={handleDeleteSelectedTokens}
            size='small'
            disabled={selectedCount === 0}
          >
            {t('删除所选令牌')}
          </Button>

          <Button
            type='danger'
            theme='borderless'
            className='w-full md:w-auto'
            onClick={handleDeleteInvalidTokens}
            size='small'
          >
            {t('删除无效令牌')}
          </Button>
        </div>

        <div className='flex items-center justify-between gap-2 text-sm text-[var(--semi-color-text-2)]'>
          <span>{t('已选择 {{count}} 项', { count: selectedCount })}</span>
          <Button
            theme='borderless'
            type='tertiary'
            size='small'
            disabled={selectedCount === 0}
            onClick={() => setSelectedKeys([])}
          >
            {t('清空选择')}
          </Button>
        </div>
      </div>

      <CopyTokensModal
        visible={showCopyModal}
        onCancel={() => setShowCopyModal(false)}
        batchCopyTokens={batchCopyTokens}
        t={t}
      />

      <DeleteTokensModal
        visible={showDeleteModal}
        onCancel={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        count={selectedKeys.length}
        mode={deleteMode}
        t={t}
      />
    </>
  );
};

export default TokensActions;
