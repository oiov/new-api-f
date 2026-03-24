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

import React, { useContext } from 'react';
import { useTranslation } from 'react-i18next';
import DocumentRenderer from '../../components/common/DocumentRenderer';
import { StatusContext } from '../../context/Status';

const Docs = () => {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const docsLink = statusState?.status?.docs_link || '';

  return (
    <DocumentRenderer
      title={t('文档')}
      cacheKey='docs_link'
      emptyMessage={t('加载文档内容失败...')}
      directContent={docsLink}
    />
  );
};

export default Docs;
