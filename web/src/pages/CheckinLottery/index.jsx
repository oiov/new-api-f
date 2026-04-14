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
import { StatusContext } from '../../context/Status';
import CheckinCalendar from '../../components/settings/personal/cards/CheckinCalendar';

export default function CheckinLotteryPage() {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const status = statusState?.status || {};

  const turnstileEnabled = !!status?.turnstile_check;
  const turnstileSiteKey = status?.turnstile_site_key || '';

  return (
    <div className='mt-[60px] px-2'>
      <CheckinCalendar
        t={t}
        status={status}
        turnstileEnabled={turnstileEnabled}
        turnstileSiteKey={turnstileSiteKey}
        showActivityLottery={false}
        mode='full'
        className='border border-semi-color-border shadow-sm'
      />
    </div>
  );
}
