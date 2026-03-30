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

import React, { useEffect, useState, useContext } from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Row,
  Switch,
  Typography,
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../../helpers';
import { useTranslation } from 'react-i18next';
import { StatusContext } from '../../../context/Status';

const { Text } = Typography;

const createDefaultHeaderNavModules = () => ({
  home: true,
  console: true,
  pricing: {
    enabled: true,
    requireAuth: false,
  },
  package: {
    enabled: true,
    requireAuth: false,
  },
  docs: true,
  about: true,
  contact: true,
});

const normalizeHeaderNavModules = (modules) => {
  const normalized = {
    ...createDefaultHeaderNavModules(),
    ...(modules || {}),
  };

  if (typeof normalized.pricing === 'boolean') {
    normalized.pricing = {
      enabled: normalized.pricing,
      requireAuth: false,
    };
  } else {
    normalized.pricing = {
      ...createDefaultHeaderNavModules().pricing,
      ...(normalized.pricing || {}),
    };
  }

  if (typeof normalized.package === 'boolean') {
    normalized.package = {
      enabled: normalized.package,
      requireAuth: false,
    };
  } else {
    normalized.package = {
      ...createDefaultHeaderNavModules().package,
      ...(normalized.package || {}),
    };
  }

  if (typeof normalized.contact !== 'boolean') {
    normalized.contact = true;
  }

  return normalized;
};

export default function SettingsHeaderNavModules(props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [statusState, statusDispatch] = useContext(StatusContext);

  // 顶栏模块管理状态
  const [headerNavModules, setHeaderNavModules] = useState(
    createDefaultHeaderNavModules(),
  );

  // 处理顶栏模块配置变更
  function handleHeaderNavModuleChange(moduleKey) {
    return (checked) => {
      const newModules = { ...headerNavModules };
      if (moduleKey === 'pricing' || moduleKey === 'package') {
        // 对于对象模块，只更新enabled属性
        newModules[moduleKey] = {
          ...newModules[moduleKey],
          enabled: checked,
        };
      } else {
        newModules[moduleKey] = checked;
      }
      setHeaderNavModules(newModules);
    };
  }

  // 处理模型广场权限控制变更
  function handlePricingAuthChange(checked) {
    const newModules = { ...headerNavModules };
    newModules.pricing = {
      ...newModules.pricing,
      requireAuth: checked,
    };
    setHeaderNavModules(newModules);
  }

  // 处理套餐权限控制变更
  function handlePackageAuthChange(checked) {
    const newModules = { ...headerNavModules };
    newModules.package = {
      ...newModules.package,
      requireAuth: checked,
    };
    setHeaderNavModules(newModules);
  }

  // 重置顶栏模块为默认配置
  function resetHeaderNavModules() {
    setHeaderNavModules(createDefaultHeaderNavModules());
    showSuccess(t('已重置为默认配置'));
  }

  // 保存配置
  async function onSubmit() {
    setLoading(true);
    try {
      const res = await API.put('/api/option/', {
        key: 'HeaderNavModules',
        value: JSON.stringify(headerNavModules),
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('保存成功'));

        // 立即更新StatusContext中的状态
        statusDispatch({
          type: 'set',
          payload: {
            ...statusState.status,
            HeaderNavModules: JSON.stringify(headerNavModules),
          },
        });

        // 刷新父组件状态
        if (props.refresh) {
          await props.refresh();
        }
      } else {
        showError(message);
      }
    } catch (error) {
      showError(t('保存失败，请重试'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (props.options && props.options.HeaderNavModules) {
      try {
        const modules = JSON.parse(props.options.HeaderNavModules);
        setHeaderNavModules(normalizeHeaderNavModules(modules));
      } catch (error) {
        setHeaderNavModules(createDefaultHeaderNavModules());
      }
      return;
    }

    setHeaderNavModules(createDefaultHeaderNavModules());
  }, [props.options]);

  // 模块配置数据
  const moduleConfigs = [
    {
      key: 'home',
      title: t('首页'),
      description: t('用户主页，展示系统信息'),
    },
    {
      key: 'console',
      title: t('控制台'),
      description: t('用户控制面板，管理账户'),
    },
    {
      key: 'pricing',
      title: t('模型广场'),
      description: t('模型定价，需要登录访问'),
      hasSubConfig: true, // 标识该模块有子配置
    },
    {
      key: 'package',
      title: t('套餐'),
      description: t('订阅套餐落地页入口'),
      hasSubConfig: true,
    },
    {
      key: 'docs',
      title: t('文档'),
      description: t('系统文档和帮助信息'),
    },
    {
      key: 'about',
      title: t('关于'),
      description: t('关于系统的详细信息'),
    },
    {
      key: 'contact',
      title: t('联系我们'),
      description: t('官方联系方式入口'),
    },
  ];

  return (
    <Card>
      <Form.Section
        text={t('顶栏管理')}
        extraText={t('控制顶栏模块显示状态，全局生效')}
      >
        <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
          {moduleConfigs.map((module) => (
            <Col key={module.key} xs={24} sm={12} md={6} lg={6} xl={6}>
              <Card
                style={{
                  borderRadius: '8px',
                  border: '1px solid var(--semi-color-border)',
                  transition: 'all 0.2s ease',
                  background: 'var(--semi-color-bg-1)',
                  minHeight: '80px',
                }}
                bodyStyle={{ padding: '16px' }}
                hoverable
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    height: '100%',
                  }}
                >
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <div
                      style={{
                        fontWeight: '600',
                        fontSize: '14px',
                        color: 'var(--semi-color-text-0)',
                        marginBottom: '4px',
                      }}
                    >
                      {module.title}
                    </div>
                    <Text
                      type='secondary'
                      size='small'
                      style={{
                        fontSize: '12px',
                        color: 'var(--semi-color-text-2)',
                        lineHeight: '1.4',
                        display: 'block',
                      }}
                    >
                      {module.description}
                    </Text>
                  </div>
                  <div style={{ marginLeft: '16px' }}>
                    <Switch
                      checked={
                        module.key === 'pricing' || module.key === 'package'
                          ? headerNavModules[module.key]?.enabled
                          : headerNavModules[module.key]
                      }
                      onChange={handleHeaderNavModuleChange(module.key)}
                      size='default'
                    />
                  </div>
                </div>

                {/* 为对象模块添加权限控制子开关 */}
                {(module.key === 'pricing' || module.key === 'package') &&
                  headerNavModules[module.key]?.enabled && (
                    <div
                      style={{
                        borderTop: '1px solid var(--semi-color-border)',
                        marginTop: '12px',
                        paddingTop: '12px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div style={{ flex: 1, textAlign: 'left' }}>
                          <div
                            style={{
                              fontWeight: '500',
                              fontSize: '12px',
                              color: 'var(--semi-color-text-1)',
                              marginBottom: '2px',
                            }}
                          >
                            {t('需要登录访问')}
                          </div>
                          <Text
                            type='secondary'
                            size='small'
                            style={{
                              fontSize: '11px',
                              color: 'var(--semi-color-text-2)',
                              lineHeight: '1.4',
                              display: 'block',
                            }}
                          >
                            {module.key === 'pricing'
                              ? t('开启后未登录用户无法访问模型广场')
                              : t('开启后未登录用户无法访问套餐页面')}
                          </Text>
                        </div>
                        <div style={{ marginLeft: '16px' }}>
                          <Switch
                            checked={
                              module.key === 'pricing'
                                ? headerNavModules.pricing?.requireAuth || false
                                : headerNavModules.package?.requireAuth || false
                            }
                            onChange={
                              module.key === 'pricing'
                                ? handlePricingAuthChange
                                : handlePackageAuthChange
                            }
                            size='default'
                          />
                        </div>
                      </div>
                    </div>
                  )}
              </Card>
            </Col>
          ))}
        </Row>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-start',
            alignItems: 'center',
            paddingTop: '8px',
            borderTop: '1px solid var(--semi-color-border)',
          }}
        >
          <Button
            size='default'
            type='tertiary'
            onClick={resetHeaderNavModules}
            style={{
              borderRadius: '6px',
              fontWeight: '500',
            }}
          >
            {t('重置为默认')}
          </Button>
          <Button
            size='default'
            type='primary'
            onClick={onSubmit}
            loading={loading}
            style={{
              borderRadius: '6px',
              fontWeight: '500',
              minWidth: '100px',
            }}
          >
            {t('保存设置')}
          </Button>
        </div>
      </Form.Section>
    </Card>
  );
}
