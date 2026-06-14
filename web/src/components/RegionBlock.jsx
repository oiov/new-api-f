import React, { useState } from 'react';
import { Button, Modal, Space, Tag, Typography } from '@douyinfe/semi-ui';
import { IconGlobe } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { COUNTRIES } from '../helpers/regionBlock';

const SUPPORT_EMAIL = 'support@nbility.dev';

// 已知地区码 → 中文名（作为 i18n key，en.json 提供翻译）；未知码回退为大写码。
const REGION_NAMES = {
  CN: '中国大陆',
  HK: '香港',
  MO: '澳门',
  TW: '台湾',
};

const RegionBlock = () => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

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
        {COUNTRIES.length > 0 && (
          <Button theme='light' onClick={() => setVisible(true)}>
            {t('查看支持的地区')}
          </Button>
        )}
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
        title={t('暂不支持的地区')}
        visible={visible}
        onCancel={() => setVisible(false)}
        footer={null}
        closeOnEsc
      >
        <Typography.Paragraph type='tertiary' style={{ marginBottom: 16 }}>
          {t('本服务面向全球大部分国家与地区开放，但暂不支持以下地区访问：')}
        </Typography.Paragraph>
        <Space wrap>
          {COUNTRIES.map((code) => (
            <Tag key={code} size='large' color='red' type='light'>
              {t(REGION_NAMES[code] || code)}
            </Tag>
          ))}
        </Space>
      </Modal>
    </div>
  );
};

export default RegionBlock;
