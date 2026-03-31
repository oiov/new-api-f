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
import { Modal, Typography, TextArea } from '@douyinfe/semi-ui';

const MODEL_MAPPING_EXAMPLE = {
  'gpt-3.5-turbo': 'gpt-3.5-turbo-0125',
};

const BatchModelMappingModal = ({
  showBatchModelMapping,
  setShowBatchModelMapping,
  batchSetChannelModelMapping,
  batchModelMappingValue,
  setBatchModelMappingValue,
  batchUpdatingModelMapping,
  selectedChannels,
  t,
}) => {
  const handleClose = () => {
    setBatchModelMappingValue('');
    setShowBatchModelMapping(false);
  };

  return (
    <Modal
      title={t('批量修改模型映射')}
      visible={showBatchModelMapping}
      onOk={batchSetChannelModelMapping}
      onCancel={handleClose}
      confirmLoading={batchUpdatingModelMapping}
      okButtonProps={{ loading: batchUpdatingModelMapping }}
      maskClosable={false}
      centered={true}
      size='medium'
      className='!rounded-lg'
    >
      <div className='mb-4'>
        <Typography.Text>
          {t('请输入要应用到所选渠道的模型映射 JSON。输入 {} 可清空模型映射。')}
        </Typography.Text>
      </div>
      <TextArea
        autosize={{ minRows: 8, maxRows: 16 }}
        placeholder={`${t('请输入合法的 JSON，例如：')}\n${JSON.stringify(MODEL_MAPPING_EXAMPLE, null, 2)}`}
        value={batchModelMappingValue}
        onChange={(value) => setBatchModelMappingValue(value)}
      />
      <div className='mt-4 flex flex-col gap-2'>
        <Typography.Text type='secondary'>
          {t('已选择 ${count} 个渠道').replace(
            '${count}',
            selectedChannels.length,
          )}
        </Typography.Text>
        <Typography.Text type='tertiary'>
          {t('仅会更新 model_mapping 字段，不会改动其他渠道配置。')}
        </Typography.Text>
      </div>
    </Modal>
  );
};

export default BatchModelMappingModal;
