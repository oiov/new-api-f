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
import { useTranslation } from 'react-i18next';

const { Title, Paragraph, Text } = Typography;

const DefaultNotice = () => {
  const { t } = useTranslation();

  return (
    <div className='py-4 px-2'>
      <Title heading={4} style={{ marginBottom: 12 }}>
        {t('欢迎使用')}
      </Title>
      <Paragraph style={{ marginBottom: 8 }}>
        {t('感谢您使用本服务！目前暂无最新公告。')}
      </Paragraph>
      <Paragraph>
        {t('如需帮助，请联系管理员或查阅相关文档。')}
      </Paragraph>
    </div>
  );
};

export default DefaultNotice;
