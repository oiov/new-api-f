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
import { Card, Avatar, Skeleton, Tag } from '@douyinfe/semi-ui';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const SPARKLINE_WIDTH = 96;
const SPARKLINE_HEIGHT = 40;

function normalizeTrendData(trendData = []) {
  return trendData
    .map((item) => {
      const value =
        typeof item === 'number'
          ? item
          : Number(
              item?.Count ??
                item?.count ??
                item?.Usage ??
                item?.usage ??
                item?.value ??
                0,
            );

      return Number.isFinite(value) ? value : 0;
    })
    .filter((value) => Number.isFinite(value));
}

function Sparkline({ trendData = [], color = '#6366f1' }) {
  const points = normalizeTrendData(trendData);

  if (points.length === 0) {
    return (
      <div
        className='w-24 h-10 rounded-lg'
        style={{
          background:
            'linear-gradient(90deg, rgba(148, 163, 184, 0.12), rgba(148, 163, 184, 0.04))',
        }}
      />
    );
  }

  if (points.length === 1) {
    const value = points[0];
    return (
      <div className='w-24 h-10 flex items-center justify-end'>
        <div
          className='rounded-full'
          style={{
            width: '8px',
            height: '8px',
            backgroundColor: color,
            opacity: value > 0 ? 1 : 0.5,
            boxShadow: `0 0 0 4px color-mix(in srgb, ${color} 16%, transparent)`,
          }}
        />
      </div>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = SPARKLINE_WIDTH / Math.max(points.length - 1, 1);

  const polylinePoints = points
    .map((value, index) => {
      const x = index * step;
      const y =
        SPARKLINE_HEIGHT - ((value - min) / range) * (SPARKLINE_HEIGHT - 6) - 3;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg
      width={SPARKLINE_WIDTH}
      height={SPARKLINE_HEIGHT}
      viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
      className='w-24 h-10'
      aria-hidden='true'
    >
      <defs>
        <linearGradient id={`spark-${color.replace(/[^a-zA-Z0-9]/g, '')}`} x1='0' y1='0' x2='1' y2='0'>
          <stop offset='0%' stopColor={color} stopOpacity='0.18' />
          <stop offset='100%' stopColor={color} stopOpacity='0.02' />
        </linearGradient>
      </defs>
      <polyline
        fill='none'
        stroke={color}
        strokeWidth='2.5'
        strokeLinecap='round'
        strokeLinejoin='round'
        points={polylinePoints}
      />
    </svg>
  );
}

const StatsCards = ({
  groupedStatsData,
  loading,
  CARD_PROPS,
}) => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  return (
    <div className='mb-4'>
      <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
        {groupedStatsData.map((group, idx) => (
          <Card
            key={idx}
            {...CARD_PROPS}
            className={`${group.color} border-0 !rounded-2xl w-full`}
            title={group.title}
          >
            <div className='space-y-4'>
              {group.items.map((item, itemIdx) => (
                <div
                  key={itemIdx}
                  className='flex items-center justify-between cursor-pointer'
                  onClick={item.onClick}
                >
                  <div className='flex items-center'>
                    <Avatar
                      className='mr-3'
                      size='small'
                      color={item.avatarColor}
                    >
                      {item.icon}
                    </Avatar>
                    <div>
                      <div className='text-xs text-gray-500'>{item.title}</div>
                      <div className='text-lg font-semibold'>
                        <Skeleton
                          loading={loading}
                          active
                          placeholder={
                            <Skeleton.Paragraph
                              active
                              rows={1}
                              style={{
                                width: '65px',
                                height: '24px',
                                marginTop: '4px',
                              }}
                            />
                          }
                        >
                          {item.value}
                        </Skeleton>
                      </div>
                    </div>
                  </div>
                  {item.title === t('当前余额') ? (
                    <Tag
                      color='white'
                      shape='circle'
                      size='large'
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate('/console/topup');
                      }}
                    >
                      {t('充值')}
                    </Tag>
                  ) : (
                    (loading ||
                      (item.trendData && item.trendData.length > 0)) && (
                      <div className='w-24 h-10 flex items-center justify-end'>
                        <Sparkline
                          trendData={item.trendData}
                          color={item.trendColor}
                        />
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default StatsCards;
