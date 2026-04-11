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

import React, { useContext, useMemo, useState } from 'react';
import { Button, Card, ImagePreview, Typography } from '@douyinfe/semi-ui';
import {
  ArrowUpRight,
  Clock3,
  Copy as CopyIcon,
  Headphones,
  MessageCircleMore,
  QrCode,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SeoMeta from '../../components/common/seo/SeoMeta';
import { getContactSeo } from '../../helpers/seo';
import { copy, showError, showSuccess } from '../../helpers/utils';
import { StatusContext } from '../../context/Status';
import './index.css';

const { Title, Text } = Typography;
const WECHAT_ID = 'FishXCode';
const WECHAT_QR_IMAGE = `/${'fishxcode'}_user.jpg`;
const DEFAULT_CONTACT_CARDS = [
  {
    key: 'qq-group',
    title: 'QQ群',
    subtitle: '用于问题答疑解决，适合群内交流与经验分享',
    imageSrc: '/qq_group.jpg',
    imageAlt: 'QQ群二维码',
    value: '373865837',
    actionHref: 'https://qm.qq.com/q/Ce2PaYrbmo',
    actionLabel: '加入QQ群',
    copyValue: '373865837',
    tone: '热门社区',
  },
  {
    key: 'wechat-account',
    title: '微信号',
    subtitle: '用于发票开具相关沟通，也可一对一联系',
    imageSrc: WECHAT_QR_IMAGE,
    imageAlt: '微信号二维码',
    value: WECHAT_ID,
    copyValue: WECHAT_ID,
    tone: '一对一沟通',
  },
  {
    key: 'wechat-group',
    title: '微信群',
    subtitle: '用于问题答疑解决，适合接收群内公告与通知',
    imageSrc: '/wechat_group.jpg',
    imageAlt: '微信群二维码',
    tone: '活动通知',
  },
  {
    key: 'qq-service',
    title: 'QQ客服',
    subtitle: '用于技术服务支持，处理账号、接入与售后问题',
    imageSrc: '/qq.png',
    imageAlt: 'QQ客服二维码',
    value: '2013571175',
    copyValue: '2013571175',
    tone: '官方支持',
  },
];

const CARD_DECORATIONS = {
  'qq-group': {
    icon: Users,
    accentClassName: 'contact-card-accent-blue',
  },
  'wechat-account': {
    icon: MessageCircleMore,
    accentClassName: 'contact-card-accent-emerald',
  },
  'wechat-group': {
    icon: QrCode,
    accentClassName: 'contact-card-accent-amber',
  },
  'qq-service': {
    icon: Headphones,
    accentClassName: 'contact-card-accent-rose',
  },
};

const HERO_FEATURES = [
  {
    key: 'response',
    titleKey: '通常 10 分钟内回复',
    descriptionKey: '工作时段内优先处理账号、支付与接入相关问题',
    icon: Clock3,
  },
  {
    key: 'community',
    titleKey: '社区答疑更高效',
    descriptionKey: '常见问题建议优先进群，方便同步最新公告与经验',
    icon: Users,
  },
  {
    key: 'support',
    titleKey: '官方渠道更可靠',
    descriptionKey: '统一使用页面展示的联系方式，避免误加非官方账号',
    icon: ShieldCheck,
  },
];

const SUPPORT_NOTES = [
  '如二维码失效，可先复制账号后通过客户端手动搜索添加',
  '涉及订单、账号、额度等问题时，联系时附上必要信息会更快定位',
  '群聊主要用于交流与公告，同类问题请尽量集中在同一渠道沟通',
];

const Contact = () => {
  const { t, i18n } = useTranslation();
  const [statusState] = useContext(StatusContext);
  const [previewImage, setPreviewImage] = useState('');
  const [loadFailedMap, setLoadFailedMap] = useState({});
  const seo = getContactSeo(i18n.language);

  const cards = useMemo(() => {
    const configuredCards = statusState?.status?.contact_channels;
    const baseCards =
      Array.isArray(configuredCards) && configuredCards.length > 0
        ? configuredCards
        : DEFAULT_CONTACT_CARDS;

    return baseCards.map((card, index) => {
      const decoration =
        CARD_DECORATIONS[card.key] ||
        Object.values(CARD_DECORATIONS)[index] || {
          icon: QrCode,
          accentClassName: 'contact-card-accent-blue',
        };

      return {
        ...card,
        imageAlt: card.imageAlt || `${card.title || t('联系我们')}二维码`,
        icon: decoration.icon,
        accentClassName: decoration.accentClassName,
      };
    });
  }, [statusState?.status?.contact_channels, t]);
  const heroFeatures = useMemo(() => HERO_FEATURES, []);
  const quickPrimaryCard = cards.find((item) => item.actionHref) || cards[0];
  const quickSecondaryCard =
    cards.find((item) => item.copyValue && item.key !== quickPrimaryCard?.key) ||
    cards.find((item) => item.copyValue) ||
    cards[1];

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
    <div className='contact-page'>
      <SeoMeta {...seo} />
      <div className='app-page-shell contact-shell'>
        <section className='contact-hero'>
          <div className='contact-hero__content'>
            <div className='contact-eyebrow'>{t('官方联系通道')}</div>
            <Title heading={1} className='contact-hero__title'>
              {t('联系我们')}
            </Title>
            <Text className='contact-hero__description'>
              {t('欢迎加入社区或联系官方客服')}
              <br />
              {t('选择最适合你的渠道，我们把常用入口整理在一个页面里。')}
            </Text>

            <div className='contact-hero__actions'>
              <Button
                theme='solid'
                type='primary'
                size='large'
                className='contact-hero__primary-btn'
                disabled={!quickPrimaryCard?.actionHref}
                onClick={() => {
                  if (quickPrimaryCard?.actionHref) {
                    window.open(quickPrimaryCard.actionHref, '_blank');
                  }
                }}
              >
                {quickPrimaryCard?.actionLabel || t('加入QQ群')}
              </Button>
              <Button
                theme='light'
                type='primary'
                size='large'
                icon={<CopyIcon size={16} />}
                className='contact-hero__secondary-btn'
                disabled={!quickSecondaryCard?.copyValue}
                onClick={() => handleCopy(quickSecondaryCard?.copyValue)}
              >
                {quickSecondaryCard?.title
                  ? `${t('复制')} ${quickSecondaryCard.title}`
                  : t('复制微信号')}
              </Button>
            </div>

            <div className='contact-hero__highlights'>
              {heroFeatures.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.key} className='contact-highlight'>
                    <div className='contact-highlight__icon'>
                      <Icon size={18} strokeWidth={2} />
                    </div>
                    <div>
                      <div className='contact-highlight__title'>{t(item.titleKey)}</div>
                      <div className='contact-highlight__description'>
                        {t(item.descriptionKey)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className='contact-hero__panel'>
            <div className='contact-hero__panel-tag'>{t('快速联系')}</div>
            <div className='contact-hero__panel-title'>{t('优先推荐这两个入口')}</div>

            <div className='contact-quick-list'>
              <button
                type='button'
                className='contact-quick-card'
                onClick={() => {
                  if (quickPrimaryCard?.actionHref) {
                    window.open(quickPrimaryCard.actionHref, '_blank');
                  }
                }}
              >
                <div className='contact-quick-card__meta'>
                  <span className='contact-quick-card__badge'>
                    {quickPrimaryCard?.tone || t('社区')}
                  </span>
                  <ArrowUpRight size={18} />
                </div>
                <div className='contact-quick-card__title'>
                  {quickPrimaryCard?.actionLabel || t('加入QQ群')}
                </div>
                <div className='contact-quick-card__desc'>
                  {quickPrimaryCard?.subtitle || t('用于问题答疑解决，适合群内交流与经验分享')}
                </div>
                <div className='contact-quick-card__value'>
                  {quickPrimaryCard?.value || '-'}
                </div>
              </button>

              <button
                type='button'
                className='contact-quick-card'
                onClick={() => handleCopy(quickSecondaryCard?.copyValue)}
              >
                <div className='contact-quick-card__meta'>
                  <span className='contact-quick-card__badge'>
                    {quickSecondaryCard?.tone || t('私聊')}
                  </span>
                  <CopyIcon size={18} />
                </div>
                <div className='contact-quick-card__title'>
                  {quickSecondaryCard?.title || t('添加微信号')}
                </div>
                <div className='contact-quick-card__desc'>
                  {quickSecondaryCard?.subtitle || t('用于发票开具相关沟通，也可一对一联系')}
                </div>
                <div className='contact-quick-card__value'>
                  {quickSecondaryCard?.value || '-'}
                </div>
              </button>
            </div>
          </div>
        </section>

        <section className='contact-grid'>
          {cards.map((card) => {
            const Icon = card.icon;
            const imageFailed = loadFailedMap[card.key] === true;

            return (
              <Card
                key={card.key}
                bodyStyle={{ padding: 0 }}
                className={`contact-channel-card ${card.accentClassName}`}
              >
                <div className='contact-channel-card__body'>
                  <div className='contact-channel-card__header'>
                    <div className='contact-channel-card__icon'>
                      <Icon size={20} strokeWidth={2} />
                    </div>
                    <div className='contact-channel-card__copy'>
                      <div className='contact-channel-card__tone'>{card.tone || ''}</div>
                      <div className='contact-channel-card__title'>{card.title}</div>
                      <div className='contact-channel-card__subtitle'>
                        {card.subtitle || ''}
                      </div>
                    </div>
                    {card.copyValue && (
                      <Button
                        theme='borderless'
                        type='primary'
                        icon={<CopyIcon size={15} />}
                        onClick={() => handleCopy(card.copyValue)}
                      >
                        {t('复制')}
                      </Button>
                    )}
                  </div>

                  <div className='contact-channel-card__main'>
                    <div className='contact-channel-card__info'>
                      <div className='contact-channel-card__label'>{t('联系账号')}</div>
                      {card.value ? (
                        <div className='contact-channel-card__value'>{card.value}</div>
                      ) : (
                        <div className='contact-channel-card__value contact-channel-card__value--muted'>
                          {t('扫码加入')}
                        </div>
                      )}

                      <div className='contact-channel-card__badges'>
                        <span className='contact-channel-card__badge'>{card.title}</span>
                        <span className='contact-channel-card__badge'>
                          {card.copyValue ? t('可复制') : t('扫码加入')}
                        </span>
                      </div>

                    </div>

                    <div className='contact-channel-card__preview'>
                      <div className='contact-channel-card__preview-panel'>
                        <div className='contact-channel-card__preview-orb contact-channel-card__preview-orb--one' />
                        <div className='contact-channel-card__preview-orb contact-channel-card__preview-orb--two' />
                        <div className='contact-channel-card__preview-tag'>
                          {t('扫码直达')}
                        </div>
                        {imageFailed ? (
                          <div className='contact-channel-card__placeholder'>
                            <Text type='secondary'>{t('图片加载失败')}</Text>
                          </div>
                        ) : (
                          <button
                            type='button'
                            className='contact-channel-card__preview-btn'
                            onClick={() => setPreviewImage(card.imageSrc)}
                            aria-label={card.imageAlt}
                          >
                            <img
                              src={card.imageSrc}
                              alt={card.imageAlt}
                              className='contact-channel-card__image'
                              onError={() => {
                                setLoadFailedMap((prev) => ({
                                  ...prev,
                                  [card.key]: true,
                                }));
                              }}
                            />
                          </button>
                        )}
                        <div className='contact-channel-card__preview-note'>
                          {t('点击二维码可放大查看')}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className='contact-channel-card__footer'>
                    {card.actionHref ? (
                      <Button
                        type='primary'
                        theme='light'
                        icon={<ArrowUpRight size={15} />}
                        onClick={() => window.open(card.actionHref, '_blank')}
                      >
                        {card.actionLabel || t('打开')}
                      </Button>
                    ) : (
                      <Button
                        type='primary'
                        theme='light'
                        icon={<CopyIcon size={15} />}
                        disabled={!card.copyValue}
                        onClick={() => handleCopy(card.copyValue)}
                      >
                        {t('复制')}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </section>

        <section className='contact-notes'>
          <div className='contact-notes__header'>
            <div className='contact-eyebrow'>{t('联系说明')}</div>
            <Title heading={3} className='contact-notes__title'>
              {t('为了更快处理问题，建议联系时准备这些信息')}
            </Title>
          </div>

          <div className='contact-notes__list'>
            {SUPPORT_NOTES.map((note) => (
              <div key={note} className='contact-note'>
                <div className='contact-note__dot' />
                <div className='contact-note__text'>{t(note)}</div>
              </div>
            ))}
          </div>
        </section>
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
