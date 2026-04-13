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

import React, { useEffect, useState } from 'react';
import { Banner, Button, Form, Space, Typography, TextArea } from '@douyinfe/semi-ui';
import { API, showError, showSuccess, verifyJSON } from '../../../helpers';
import { useTranslation } from 'react-i18next';

const DEFAULT_CONTACT_CHANNELS_EXAMPLE = JSON.stringify(
  [
    {
      key: 'qq-support-group',
      title: 'QQ售后群',
      subtitle: '用于订单、发放、补单与售后问题处理，建议优先加入',
      imageSrc: '/qq_group.jpg',
      value: 'fishxcode 售后群',
      actionHref: 'https://qm.qq.com/q/Ce2PaYrbmo',
      actionLabel: '加入售后群',
      tone: '售后支持',
      i18n: {
        en: {
          title: 'QQ Support Group',
          subtitle: 'For orders, fulfillment, replenishment, and after-sales support',
          actionLabel: 'Join Support Group',
          tone: 'After-sales Support',
        },
      },
    },
    {
      key: 'qq-group',
      title: 'QQ群',
      subtitle: '用于问题答疑解决，适合群内交流与经验分享',
      imageSrc: 'https://your-cdn.example.com/qq-group.jpg',
      value: '373865837',
      copyValue: '373865837',
      actionHref: 'https://qm.qq.com/q/Ce2PaYrbmo',
      actionLabel: '加入QQ群',
      tone: '热门社区',
      i18n: {
        en: {
          title: 'QQ Group',
          subtitle: 'Community support and discussions',
          actionLabel: 'Join QQ Group',
          tone: 'Community',
        },
      },
    },
    {
      key: 'wechat-account',
      title: '微信号',
      subtitle: '用于发票开具相关沟通，也可一对一联系',
      imageSrc: 'https://your-cdn.example.com/wechat.jpg',
      value: 'FishXCode',
      copyValue: 'FishXCode',
      tone: '一对一沟通',
    },
    {
      key: 'wechat-group',
      title: '微信群',
      subtitle: '用于问题答疑解决，适合接收群内公告与通知',
      imageSrc: 'https://your-cdn.example.com/wechat-group.jpg',
      tone: '活动通知',
    },
    {
      key: 'qq-service',
      title: 'QQ客服',
      subtitle: '用于技术服务支持，处理账号、接入与售后问题',
      imageSrc: 'https://your-cdn.example.com/qq-service.jpg',
      value: '2013571175',
      copyValue: '2013571175',
      tone: '官方支持',
    },
  ],
  null,
  2,
);

export default function SettingsContactPage({ options, refresh }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('[]');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const raw = options['console_setting.contact_channels'];
    if (raw === undefined || raw === '') {
      setValue('[]');
      return;
    }

    try {
      setValue(JSON.stringify(JSON.parse(raw), null, 2));
    } catch {
      setValue(raw);
    }
  }, [options]);

  const handleSave = async () => {
    if (!verifyJSON(value)) {
      showError(t('不是合法的 JSON 字符串'));
      return;
    }

    try {
      setLoading(true);
      const res = await API.put('/api/option/', {
        key: 'console_setting.contact_channels',
        value,
      });
      if (res.data.success) {
        showSuccess(t('保存成功'));
        refresh?.();
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      showError(error.message || t('保存失败，请重试'));
    } finally {
      setLoading(false);
    }
  };

  const handleFormat = () => {
    if (!verifyJSON(value)) {
      showError(t('不是合法的 JSON 字符串'));
      return;
    }
    setValue(JSON.stringify(JSON.parse(value), null, 2));
  };

  return (
    <Form.Section
      text={t('联系页面配置')}
      extraText={t('配置 /contact 页面显示的联系方式与二维码，保存后前台实时生效')}
    >
      <Banner
        type='info'
        closeIcon={null}
        description={t(
          '页面地址仍然保持为 /contact，不影响已有引用。建议图片使用可长期访问的 HTTPS 地址，避免每次改二维码都重新打包前端。',
        )}
        style={{ marginBottom: 16 }}
      />

      <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
        {t('联系渠道 JSON')}
      </Typography.Text>
      <TextArea
        value={value}
        onChange={setValue}
        autosize={{ minRows: 14 }}
        placeholder={DEFAULT_CONTACT_CHANNELS_EXAMPLE}
      />
      <Typography.Text type='tertiary' style={{ display: 'block', marginTop: 8 }}>
        {t(
          '支持字段：key、title、subtitle、imageSrc、value、copyValue、actionHref、actionLabel、tone、i18n。key 必填且不能重复；imageSrc 仅支持 https:// 地址或站内 /xxx.jpg 路径；i18n 可按语言覆盖 title、subtitle、tone、actionLabel。',
        )}
      </Typography.Text>

      <div style={{ marginTop: 12 }}>
        <Space>
          <Button theme='light' onClick={handleFormat}>
            {t('格式化 JSON')}
          </Button>
          <Button type='primary' loading={loading} onClick={handleSave}>
            {t('保存设置')}
          </Button>
        </Space>
      </div>
    </Form.Section>
  );
}
