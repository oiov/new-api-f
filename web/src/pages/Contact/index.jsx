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

import React, { useMemo, useState } from 'react';
import {
  Card,
  Typography,
  Button,
  ImagePreview,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { copy, showSuccess, showError } from '../../helpers/utils';

const { Title, Text } = Typography;

const CONTACT_CARDS = [
  {
    key: 'qq-group',
    titleKey: 'QQ群',
    imageSrc: '/qq_group.jpg',
    imageAltKey: 'QQ群二维码',
    value: '373865837',
    extraKey: '点击链接加入群聊 {{groupId}}【{{name}}】',
    actionLabelKey: '加入QQ群',
    actionHref: 'https://qm.qq.com/q/Ce2PaYrbmo',
    copyValue: '373865837',
  },
  {
    key: 'wechat-account',
    titleKey: '微信号',
    imageSrc: '/fishxcode_user.jpg',
    imageAltKey: '微信号二维码',
    value: 'fishxcode',
    copyValue: 'fishxcode',
  },
  {
    key: 'wechat-group',
    titleKey: '微信群',
    imageSrc: '/wechat_group.jpg',
    imageAltKey: '微信群二维码',
  },
  {
    key: 'qq-service',
    titleKey: 'QQ客服',
    imageSrc: '/qq.png',
    imageAltKey: 'QQ客服二维码',
    value: '2013571175',
    copyValue: '2013571175',
  },
];

const Contact = () => {
  const { t } = useTranslation();
  const [previewImage, setPreviewImage] = useState('');
  const [loadFailedMap, setLoadFailedMap] = useState({});

  const cards = useMemo(() => CONTACT_CARDS, []);

  const handleCopy = async (value) => {
    if (!value) {
      return;
    }

    const copied = await copy(value);
    if (copied) {
      showSuccess(t('已复制到剪切板'));
      return;
    }

    showError(t('复制失败，请重试'));
  };

  return (
    <div className='bg-white min-h-screen w-full overflow-x-hidden pt-16 lg:pt-20'>
      <div className='max-w-[1240px] mx-auto px-4 lg:px-6 pb-8 lg:pb-10'>
        <div className='rounded-2xl border border-semi-color-border bg-gradient-to-r from-semi-color-bg-0 to-semi-color-fill-0 p-5 lg:p-8 mb-6'>
          <div className='flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4'>
            <div>
              <Title heading={2} style={{ marginBottom: 8 }}>
                {t('联系我们')}
              </Title>
              <Text type='secondary' style={{ fontSize: 14 }}>
                {t('欢迎加入社区或联系官方客服')}
              </Text>
            </div>
            <div className='flex flex-wrap gap-2'>
              <Button
                theme='solid'
                type='primary'
                onClick={() => window.open('https://qm.qq.com/q/Ce2PaYrbmo', '_blank')}
              >
                {t('加入QQ群')}
              </Button>
              <Button
                theme='light'
                type='tertiary'
                onClick={() => handleCopy('fishxcode')}
              >
                {t('复制')} fishxcode
              </Button>
            </div>
          </div>
        </div>

        <div className='grid grid-cols-1 lg:grid-cols-2 gap-5'>
          {cards.map((card) => {
            const imageFailed = loadFailedMap[card.key] === true;

            return (
              <Card
                key={card.key}
                bodyStyle={{ padding: 20 }}
                style={{ borderRadius: 14, minHeight: 380 }}
                hoverable
              >
                <div className='flex flex-col h-full'>
                  <div className='flex items-start justify-between gap-3 mb-2'>
                    <Text strong style={{ fontSize: 18 }}>
                      {t(card.titleKey)}
                    </Text>
                    {card.copyValue && (
                      <Button
                        theme='borderless'
                        type='tertiary'
                        onClick={() => handleCopy(card.copyValue)}
                        style={{ paddingRight: 0 }}
                      >
                        {t('复制')}
                      </Button>
                    )}
                  </div>

                  {card.value && (
                    <Text
                      style={{
                        wordBreak: 'break-all',
                        fontSize: 15,
                      }}
                    >
                      {card.value}
                    </Text>
                  )}

                  {card.extraKey && (
                    <a
                      href={card.actionHref}
                      target='_blank'
                      rel='noopener noreferrer'
                      className='!text-semi-color-primary break-all mt-1'
                    >
                      {t(card.extraKey, {
                        groupId: card.value,
                        name: 'fishxcode',
                      })}
                    </a>
                  )}

                  <div className='mt-auto pt-4 flex items-center justify-center'>
                    {imageFailed ? (
                      <div className='w-[180px] lg:w-[220px] h-[180px] lg:h-[220px] flex items-center justify-center border border-dashed border-semi-color-border rounded-xl text-center px-2 bg-semi-color-fill-0'>
                        <Text type='secondary'>{t('图片加载失败')}</Text>
                      </div>
                    ) : (
                      <button
                        type='button'
                        className='w-[180px] lg:w-[220px] rounded-xl overflow-hidden border border-semi-color-border p-0 bg-white cursor-zoom-in shadow-sm'
                        onClick={() => setPreviewImage(card.imageSrc)}
                        aria-label={t(card.imageAltKey)}
                      >
                        <img
                          src={card.imageSrc}
                          alt={t(card.imageAltKey)}
                          className='block w-full h-auto'
                          onError={() => {
                            setLoadFailedMap((prev) => ({
                              ...prev,
                              [card.key]: true,
                            }));
                          }}
                        />
                      </button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <ImagePreview
        src={previewImage}
        visible={Boolean(previewImage)}
        onVisibleChange={(visible) => {
          if (!visible) {
            setPreviewImage('');
          }
        }}
      />
    </div>
  );
};

export default Contact;
