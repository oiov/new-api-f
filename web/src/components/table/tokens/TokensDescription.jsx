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
import { Typography } from '@douyinfe/semi-ui';
import { Key } from 'lucide-react';
import CompactModeToggle from '../../common/ui/CompactModeToggle';

const { Text } = Typography;
const API_KEY_TOOL_URL = 'https://api-key-tool.fishxcode.com/';

const TokensDescription = ({ compactMode, setCompactMode, zcfDocUrl, t }) => {
  return (
    <div className='flex flex-col md:flex-row justify-between items-start md:items-center gap-2 w-full'>
      <div className='flex flex-col gap-1'>
        <div className='flex items-center text-blue-500'>
          <Key size={16} className='mr-2' />
          <Text>{t('令牌管理')}</Text>
        </div>
        <Text type='tertiary' size='small'>
          {t('支持通过 ZCF 接入')}{' '}
          <a href={zcfDocUrl} target='_blank' rel='noreferrer'>
            {t('查看接入文档')}
          </a>
        </Text>
        <Text type='tertiary' size='small'>
          {t('需要查询 API Key 消耗信息日志时可使用')}{' '}
          <a href={API_KEY_TOOL_URL} target='_blank' rel='noreferrer'>
            {t('API Key 消耗日志查询')}
          </a>
        </Text>
      </div>

      <CompactModeToggle
        compactMode={compactMode}
        setCompactMode={setCompactMode}
        t={t}
      />
    </div>
  );
};

export default TokensDescription;
