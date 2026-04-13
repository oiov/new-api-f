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
import { Card, Tag, Typography, Collapsible, Divider } from '@douyinfe/semi-ui';
import { IconChevronDown, IconInfoCircle } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

// item.type → value text color
const VALUE_COLOR = {
  success: 'var(--semi-color-success)',
  danger: 'var(--semi-color-danger)',
  warning: 'var(--semi-color-warning)',
  default: 'var(--semi-color-text-0)',
};

const AuthConfigNotice = ({
  title,
  description,
  items = [],
  tip,
  tone = 'default',
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  if (!items.length) return null;

  const isWarning = tone === 'warning';

  const cardStyle = {
    borderRadius: 16,
    border: `1px solid ${
      isWarning
        ? 'var(--semi-color-warning-light-active)'
        : 'var(--semi-color-border)'
    }`,
    background: isWarning
      ? 'var(--semi-color-warning-light-default)'
      : 'var(--semi-color-bg-2)',
  };

  return (
    <div className='mb-5'>
      <Card bodyStyle={{ padding: '10px 14px' }} style={cardStyle}>

        {/* ── 头部：点击折叠 / 展开 ── */}
        <div
          className='flex cursor-pointer select-none items-center justify-between'
          onClick={() => setOpen(!open)}
          role='button'
          aria-expanded={open}
        >
          <div className='flex min-w-0 items-center gap-2'>
            <Tag
              color={isWarning ? 'amber' : 'grey'}
              type='light'
              size='small'
              style={{ flexShrink: 0 }}
            >
              {isWarning ? t('需注意') : t('已同步')}
            </Tag>
            {title && (
              <Text strong style={{ fontSize: 14 }}>
                {title}
              </Text>
            )}
          </div>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              flexShrink: 0,
              marginLeft: 8,
              color: 'var(--semi-color-text-2)',
              transition: 'transform 0.22s ease',
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            }}
          >
            <IconChevronDown size='small' />
          </span>
        </div>

        {/* ── 展开区 ── */}
        <Collapsible isOpen={open} keepDOM>
          <div>
            <Divider margin='10px' />

            {description && (
              <Text
                type='tertiary'
                style={{
                  fontSize: 12,
                  display: 'block',
                  lineHeight: '1.65',
                  marginBottom: 10,
                }}
              >
                {description}
              </Text>
            )}

            {/* 配置卡片网格 */}
            <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
              {items.map((item) => {
                const valueColor =
                  VALUE_COLOR[item.type] || VALUE_COLOR.default;
                return (
                  <div
                    key={item.label}
                    className='rounded-xl px-3 py-2.5'
                    style={{
                      background: 'var(--semi-color-fill-0)',
                      borderLeft: `3px solid ${valueColor}`,
                    }}
                  >
                    <Text
                      type='tertiary'
                      style={{
                        fontSize: 11,
                        display: 'block',
                        marginBottom: 3,
                        letterSpacing: '0.03em',
                      }}
                    >
                      {item.label}
                    </Text>
                    <Text
                      strong
                      style={{ fontSize: 13, color: valueColor }}
                    >
                      {item.value}
                    </Text>
                  </div>
                );
              })}
            </div>

            {/* Tip 提示行 */}
            {tip && (
              <div
                className='mt-2 flex items-start gap-1.5 rounded-xl px-3 py-2'
                style={{ background: 'var(--semi-color-fill-0)' }}
              >
                <IconInfoCircle
                  size='small'
                  style={{
                    flexShrink: 0,
                    marginTop: 1,
                    color: 'var(--semi-color-text-2)',
                  }}
                />
                <Text
                  type='tertiary'
                  style={{ fontSize: 11, lineHeight: '1.65' }}
                >
                  {tip}
                </Text>
              </div>
            )}
          </div>
        </Collapsible>
      </Card>
    </div>
  );
};

export default AuthConfigNotice;
