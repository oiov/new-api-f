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

import React, { useEffect, useMemo, useState } from 'react';
import { Input, Modal, Radio, RadioGroup } from '@douyinfe/semi-ui';
import {
  normalizeTokenTestConfig,
  resolveTokenTestConfig,
  TOKEN_TEST_MODES,
} from '../../../../helpers/token';

const TokenTestConfigModal = ({
  visible,
  onCancel,
  onConfirm,
  confirmLoading,
  tokenRecord,
  t,
}) => {
  const [formState, setFormState] = useState(
    resolveTokenTestConfig(tokenRecord?.group),
  );

  useEffect(() => {
    if (!visible) {
      return;
    }
    setFormState(resolveTokenTestConfig(tokenRecord?.group));
  }, [visible, tokenRecord?.group, tokenRecord?.id]);

  const normalized = useMemo(
    () => normalizeTokenTestConfig(formState),
    [formState],
  );

  const isClaudeEnabled =
    normalized.mode === TOKEN_TEST_MODES.both ||
    normalized.mode === TOKEN_TEST_MODES.claude;
  const isResponsesEnabled =
    normalized.mode === TOKEN_TEST_MODES.both ||
    normalized.mode === TOKEN_TEST_MODES.responses;

  return (
    <Modal
      title={t('测试令牌')}
      visible={visible}
      onCancel={onCancel}
      onOk={() => onConfirm?.(normalized)}
      okText={t('开始测试')}
      cancelText={t('取消')}
      confirmLoading={confirmLoading}
      width={560}
    >
      <div className='flex flex-col gap-4'>
        <div className='text-sm text-[var(--semi-color-text-2)]'>
          {t(
            '可按本次需要选择测试协议与模型。仅会提交当前启用协议对应的模型，避免默认双协议导致结果忽左忽右。',
          )}
        </div>
        <div className='rounded-lg border border-[var(--semi-color-border)] bg-[var(--semi-color-fill-0)] p-3 text-sm'>
          <div>
            {t('令牌')}: {tokenRecord?.name || '-'}
          </div>
          {tokenRecord?.id ? (
            <div>
              {t('令牌 ID')}: {tokenRecord.id}
            </div>
          ) : null}
          {tokenRecord?.username ? (
            <div>
              {t('用户')}: {tokenRecord.username}
            </div>
          ) : null}
          {tokenRecord?.group ? (
            <div>
              {t('分组')}: {tokenRecord.group}
            </div>
          ) : null}
        </div>
        <div>
          <div className='mb-2 text-sm font-medium'>{t('测试协议')}</div>
          <RadioGroup
            type='button'
            direction='horizontal'
            value={normalized.mode}
            onChange={(event) => {
              setFormState((prev) => ({
                ...prev,
                mode: event?.target?.value || TOKEN_TEST_MODES.both,
              }));
            }}
          >
            <Radio value={TOKEN_TEST_MODES.both}>{t('同时测试')}</Radio>
            <Radio value={TOKEN_TEST_MODES.claude}>Claude</Radio>
            <Radio value={TOKEN_TEST_MODES.responses}>Responses</Radio>
          </RadioGroup>
        </div>
        <div className='flex flex-col gap-3'>
          <div>
            <div className='mb-1 text-sm font-medium'>
              {t('Claude 模型')}
            </div>
            <Input
              value={normalized.claude_model}
              disabled={!isClaudeEnabled}
              placeholder='claude-opus-4-6'
              onChange={(value) => {
                setFormState((prev) => ({
                  ...prev,
                  claude_model: value,
                }));
              }}
            />
          </div>
          <div>
            <div className='mb-1 text-sm font-medium'>
              {t('Responses 模型')}
            </div>
            <Input
              value={normalized.responses_model}
              disabled={!isResponsesEnabled}
              placeholder='gpt-5.4'
              onChange={(value) => {
                setFormState((prev) => ({
                  ...prev,
                  responses_model: value,
                }));
              }}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TokenTestConfigModal;
