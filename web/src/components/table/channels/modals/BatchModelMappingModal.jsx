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
  showBatchModelConfig,
  setShowBatchModelConfig,
  batchUpdateChannelModelConfig,
  batchModelsValue,
  setBatchModelsValue,
  batchModelMappingValue,
  setBatchModelMappingValue,
  batchUpdatingModelConfig,
  selectedChannels,
  t,
}) => {
  const handleClose = () => {
    setBatchModelsValue('');
    setBatchModelMappingValue('');
    setShowBatchModelConfig(false);
  };

  return (
    <Modal
      title={t('批量编辑模型配置')}
      visible={showBatchModelConfig}
      onOk={batchUpdateChannelModelConfig}
      onCancel={handleClose}
      confirmLoading={batchUpdatingModelConfig}
      okButtonProps={{ loading: batchUpdatingModelConfig }}
      maskClosable={false}
      centered={true}
      size='medium'
      className='!rounded-lg'
    >
      <div className='mb-4 flex flex-col gap-2'>
        <Typography.Text>
          {t('仅会更新你填写的字段，留空的字段不会改动。')}
        </Typography.Text>
        <Typography.Text type='secondary'>
          {t('模型列表支持逗号或换行分隔；模型重定向请输入合法 JSON，输入 {} 可清空。')}
        </Typography.Text>
      </div>
      <div className='mb-4'>
        <Typography.Text strong>{t('模型列表')}</Typography.Text>
        <TextArea
          autosize={{ minRows: 4, maxRows: 10 }}
          placeholder={t('请输入模型列表，例如：gpt-4o-mini,claude-3-5-sonnet')}
          value={batchModelsValue}
          onChange={(value) => setBatchModelsValue(value)}
        />
      </div>
      <div>
        <Typography.Text strong>{t('模型重定向')}</Typography.Text>
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
          {t('提交后会按已选渠道批量覆盖模型列表和/或模型重定向。')}
        </Typography.Text>
      </div>
    </Modal>
  );
};

export default BatchModelMappingModal;
