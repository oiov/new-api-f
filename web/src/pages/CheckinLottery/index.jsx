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
import { Tag } from '@douyinfe/semi-ui';
import { CalendarCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../context/Status';
import CheckinCalendar from '../../components/settings/personal/cards/CheckinCalendar';

export default function CheckinLotteryPage() {
  const { t } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const status = statusState?.status || {};

  const turnstileEnabled = !!status?.turnstile_check;
  const turnstileSiteKey = status?.turnstile_site_key || '';
  const checkinEnabled = !!status?.checkin_enabled;
  const checkinStatusText = checkinEnabled ? t('已开启') : t('未开启');

  return (
    <div className='checkin-lottery-page mt-[60px] px-2'>
      <div className='checkin-lottery-shell checkin-lottery-shell--minimal'>
        <section className='checkin-lottery-minimal-header'>
          <div className='checkin-lottery-minimal-header__title'>
            <CalendarCheck size={15} />
            <span>{t('签到管理')}</span>
          </div>
          <div className='checkin-lottery-minimal-header__chips'>
            <Tag color={checkinEnabled ? 'green' : 'grey'} type='light' shape='circle'>
              {t('签到')} · {checkinStatusText}
            </Tag>
            <Tag color={turnstileEnabled ? 'blue' : 'grey'} type='light' shape='circle'>
              {turnstileEnabled ? t('验证开启') : t('无需验证')}
            </Tag>
            <Tag color='grey' type='light' shape='circle'>
              {t('每日一次')}
            </Tag>
          </div>
        </section>

        <section className='checkin-lottery-calendar-section checkin-lottery-calendar-section--minimal'>
          <CheckinCalendar
            t={t}
            status={status}
            turnstileEnabled={turnstileEnabled}
            turnstileSiteKey={turnstileSiteKey}
            showActivityLottery={false}
            mode='full'
            className='checkin-lottery-calendar-card'
          />
        </section>
      </div>
    </div>
  );
}
