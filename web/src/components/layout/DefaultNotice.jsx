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
import { Tag, Typography, Divider } from '@douyinfe/semi-ui';
import {
  IconAlertTriangle,
  IconStop,
  IconBookStroked,
  IconFile,
  IconRefresh,
  IconLink,
} from '@douyinfe/semi-icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Title, Text, Paragraph } = Typography;

const Section = ({ icon, title, color = 'var(--semi-color-text-0)', children, badge }) => (
  <div style={{ marginBottom: 18 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      {icon && <span style={{ color, display: 'flex', alignItems: 'center' }}>{icon}</span>}
      <Text strong style={{ fontSize: 14, color }}>{title}</Text>
      {badge && <Tag size='small' color='red'>{badge}</Tag>}
    </div>
    <div style={{ paddingLeft: icon ? 22 : 0 }}>{children}</div>
  </div>
);

const Item = ({ label, children }) => (
  <div style={{ marginBottom: 6 }}>
    {label && (
      <Text type='secondary' size='small' style={{ display: 'block', marginBottom: 2 }}>
        {label}
      </Text>
    )}
    <Text size='small' style={{ lineHeight: 1.65 }}>{children}</Text>
  </div>
);

const Row = ({ label, value }) => (
  <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
    <Text type='tertiary' size='small' style={{ minWidth: 80, flexShrink: 0 }}>{label}</Text>
    <Text size='small'>{value}</Text>
  </div>
);

const DefaultNotice = () => {
  const { t } = useTranslation();

  return (
    <div style={{ fontSize: 13, lineHeight: 1.7 }}>
      {/* 公告头部 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 16, paddingBottom: 12,
        borderBottom: '1px solid var(--semi-color-border)',
      }}>
        <div>
          <Title heading={5} style={{ margin: 0 }}>{t('运营升级公告')}</Title>
          <Text type='tertiary' size='small'>fishxcode · 2026.4.9</Text>
        </div>
        <Tag color='blue' size='small'>{t('最新')}</Tag>
      </div>

      {/* IMPORTANT：令牌分组 */}
      <Section
        icon={<IconAlertTriangle size='small' />}
        title={t('令牌分组')}
        color='var(--semi-color-warning)'
        badge={t('必须遵守')}
      >
        <Item>
          {t('创建令牌时请按需选择分组。错误分组会导致请求异常和调用失败。')}
        </Item>
        <Item>
          <Text strong size='small'>{t('订阅用户')}</Text>
          {t(' → 选择订阅分组；')}
          <Text strong size='small'>{t('按量用户')}</Text>
          {t(' → 选择按量分组')}
        </Item>
        <Item>
          <Text type='danger' size='small' strong>{t('各分组校验签名机制不同，分组之间不能混用。')}</Text>
          {t('使用错误分组的令牌调用将直接返回鉴权错误，无法降级兼容。')}
        </Item>
        <Item style={{ marginTop: 4 }}>
          {t('claude 模型仅限 Claude Code 内调用，禁止在外部工具中测试，否则触发风控。')}
        </Item>
      </Section>

      <Divider style={{ margin: '12px 0' }} />

      {/* 防封 */}
      <Section
        icon={<IconStop size='small' />}
        title={t('防封规则')}
        color='var(--semi-color-danger)'
        badge={t('即日生效')}
      >
        <Item label={t('禁止')}>
          {t('使用篡改请求的代理软件（如 CCSwitch 代理功能）。')}
        </Item>
        <Item>
          {t('请保持全局透传，任何修改请求头或请求体的代理工具均会触发风控并拒绝请求。')}
        </Item>
      </Section>

      <Divider style={{ margin: '12px 0' }} />

      {/* 必读 */}
      <Section
        icon={<IconBookStroked size='small' />}
        title={t('必读')}
        color='var(--semi-color-primary)'
      >
        <Item label={t('务必指定项目绝对路径')}>
          {t('系统会将账号绑定到首次请求的对话路径。每次对话请主动告知 AI 项目绝对路径，如 /Users/xxx/my-project。未指定将使用首次请求的工作空间，可能导致文件读写定位错误。')}
        </Item>
      </Section>

      <Divider style={{ margin: '12px 0' }} />

      {/* 开票须知 */}
      <Section icon={<IconFile size='small' />} title={t('开票须知')}>
        <Row label={t('起开金额')} value={t('50 元')} />
        <Row label={t('普通发票')} value={t('免手续费')} />
        <Row label={t('专用发票')} value={t('1% 增值税 + 5% 所得税')} />
        <Item style={{ marginTop: 6 }}>
          {t('发票申请请直接在系统内提交，无需联系客服。')}
        </Item>
      </Section>

      <Divider style={{ margin: '12px 0' }} />

      {/* 退款政策 */}
      <Section icon={<IconRefresh size='small' />} title={t('退款政策')}>
        <Row label={t('退款规则')} value={t('支持无理由退款')} />
        <Row label={t('退款金额')} value={t('实充金额 - 实消金额')} />
        <Item style={{ marginTop: 6 }}>
          {t('退款请前往')}<Link to='/contact' style={{ color: 'var(--semi-color-primary)', margin: '0 2px' }}>{t('联系我们')}</Link>{t('页面咨询。补单联系管理员处理即可。')}
        </Item>
      </Section>

      <Divider style={{ margin: '12px 0' }} />

      {/* 快速链接 */}
      <Section icon={<IconLink size='small' />} title={t('快速入口')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
          {[
            { label: t('联系我们'), to: '/contact' },
            { label: t('服务状态'), to: '/status' },
            { label: t('接入文档'), to: '/docs' },
            { label: t('价格方案'), to: '/pricing' },
          ].map(({ label, to }) => (
            <Link
              key={to}
              to={to}
              style={{
                fontSize: 13,
                color: 'var(--semi-color-primary)',
                textDecoration: 'none',
              }}
            >
              {label} →
            </Link>
          ))}
        </div>
      </Section>
    </div>
  );
};

export default DefaultNotice;
