import React from 'react';
import { Button, Typography } from '@douyinfe/semi-ui';
import { IconGlobe } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';

const SUPPORT_EMAIL = 'support@nbility.dev';

const RegionBlock = () => {
  const { t } = useTranslation();
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
      <Button
        theme='solid'
        style={{ marginTop: 24 }}
        onClick={() => {
          window.location.href = `mailto:${SUPPORT_EMAIL}`;
        }}
      >
        {t('联系支持')} · {SUPPORT_EMAIL}
      </Button>
    </div>
  );
};

export default RegionBlock;
