import React, { useMemo, useState } from 'react';
import { Button, Modal, Space, Tag, Typography } from '@douyinfe/semi-ui';
import { IconGlobe } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { COUNTRIES } from '../helpers/regionBlock';
import { ALL_COUNTRY_CODES } from '../constants/countryCodes';

const SUPPORT_EMAIL = 'support@nbility.dev';

const RegionBlock = () => {
  const { t, i18n } = useTranslation();
  const [visible, setVisible] = useState(false);
  const locale = i18n.resolvedLanguage || i18n.language || 'en';

  // 支持的地区 = 全量国家码 − 被拦的；名称用 Intl.DisplayNames 本地化，按名称排序。
  const supported = useMemo(() => {
    const blocked = new Set(COUNTRIES.map((c) => c.toUpperCase()));
    let display = null;
    try {
      display = new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      display = null;
    }
    return ALL_COUNTRY_CODES.filter((code) => !blocked.has(code))
      .map((code) => ({
        code,
        name: (display && display.of(code)) || code,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, locale));
  }, [locale]);

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--semi-color-fill-0)',
          marginBottom: 24,
        }}
      >
        <IconGlobe size='extra-large' />
      </div>
      <Typography.Title heading={1} style={{ maxWidth: 640 }}>
        {t('暂不支持你所在的地区')}
      </Typography.Title>
      <Typography.Paragraph
        type='tertiary'
        style={{ maxWidth: 520, marginTop: 16, fontSize: 16 }}
      >
        {t('很遗憾，本服务目前仅在部分地区开放。如果你认为这是误判，请联系我们。')}
      </Typography.Paragraph>
      <Space style={{ marginTop: 24 }}>
        <Button theme='light' onClick={() => setVisible(true)}>
          {t('查看支持的地区')}
        </Button>
        <Button
          theme='solid'
          onClick={() => {
            window.location.href = `mailto:${SUPPORT_EMAIL}`;
          }}
        >
          {t('联系支持')} · {SUPPORT_EMAIL}
        </Button>
      </Space>

      <Modal
        title={t('支持的地区')}
        visible={visible}
        onCancel={() => setVisible(false)}
        footer={null}
        closeOnEsc
        bodyStyle={{ maxHeight: '55vh', overflowY: 'auto' }}
      >
        <Typography.Paragraph type='tertiary' style={{ marginBottom: 16 }}>
          {t('本服务在以下国家与地区可用：')}
        </Typography.Paragraph>
        <Space wrap>
          {supported.map(({ code, name }) => (
            <Tag key={code} size='large' color='green' type='light'>
              {name}
            </Tag>
          ))}
        </Space>
      </Modal>
    </div>
  );
};

export default RegionBlock;
