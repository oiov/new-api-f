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

import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  Col,
  Form,
  Modal,
  Row,
  Spin,
  Tag,
  TagInput,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess, toBoolean } from '../../helpers';

const { Text } = Typography;

const RiskControlSetting = () => {
  const { t } = useTranslation();
  const formApiRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [inputs, setInputs] = useState({
    'error_setting.show_site_domain_in_error': true,
    'error_setting.restrict_proxy_distribution': false,
    'error_setting.restrict_proxy_distribution_log_only': false,
    'error_setting.restrict_proxy_distribution_blocked_message': '',
  });
  const [antiDistributionAllowedHosts, setAntiDistributionAllowedHosts] =
    useState([]);
  const [antiDistributionAllowedSources, setAntiDistributionAllowedSources] =
    useState([]);
  const [antiDistributionLogs, setAntiDistributionLogs] = useState([]);
  const [antiDistributionLogsLoading, setAntiDistributionLogsLoading] =
    useState(false);

  const normalizeTagValues = (items) => {
    if (!Array.isArray(items)) {
      return [];
    }
    return Array.from(
      new Set(
        items.map((item) => `${item}`.trim()).filter((item) => item !== ''),
      ),
    );
  };

  const getOptions = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/anti_distribution/options');
      const { success, message, data } = res.data;
      if (!success) {
        showError(message);
        return;
      }

      const nextInputs = { ...inputs };
      nextInputs['error_setting.show_site_domain_in_error'] = toBoolean(
        data['error_setting.show_site_domain_in_error'],
      );
      nextInputs['error_setting.restrict_proxy_distribution'] = toBoolean(
        data['error_setting.restrict_proxy_distribution'],
      );
      nextInputs['error_setting.restrict_proxy_distribution_log_only'] =
        toBoolean(data['error_setting.restrict_proxy_distribution_log_only']);
      nextInputs['error_setting.restrict_proxy_distribution_blocked_message'] =
        data['error_setting.restrict_proxy_distribution_blocked_message'] || '';
      setAntiDistributionAllowedHosts(
        Array.isArray(
          data['error_setting.restrict_proxy_distribution_allowed_hosts'],
        )
          ? data['error_setting.restrict_proxy_distribution_allowed_hosts']
          : [],
      );
      setAntiDistributionAllowedSources(
        Array.isArray(
          data['error_setting.restrict_proxy_distribution_allowed_sources'],
        )
          ? data['error_setting.restrict_proxy_distribution_allowed_sources']
          : [],
      );

      setInputs(nextInputs);
      formApiRef.current?.setValues(nextInputs);
      setIsLoaded(true);
      await fetchAntiDistributionLogs();
    } finally {
      setLoading(false);
    }
  };

  const updateOptions = async (options) => {
    setLoading(true);
    try {
      const res = await API.put('/api/anti_distribution/options', options);
      if (!res.data.success) {
        showError(res.data.message);
        return false;
      }

      setInputs((prev) => {
        const next = { ...prev };
        options.forEach((opt) => {
          next[opt.key] = opt.value;
        });
        return next;
      });
      showSuccess(t('更新成功'));
      return true;
    } catch (error) {
      showError(t('更新失败'));
      return false;
    } finally {
      setLoading(false);
    }
  };

  const fetchAntiDistributionLogs = async () => {
    setAntiDistributionLogsLoading(true);
    try {
      const res = await API.get('/api/anti_distribution/logs?p=1&page_size=20');
      const { success, data, message } = res.data;
      if (!success) {
        showError(message);
        return;
      }
      setAntiDistributionLogs(data.items || []);
    } catch (error) {
      showError(t('获取防分发命中记录失败'));
    } finally {
      setAntiDistributionLogsLoading(false);
    }
  };

  const submitAntiDistributionSettings = async () => {
    const saved = await updateOptions([
      {
        key: 'error_setting.restrict_proxy_distribution',
        value: !!inputs['error_setting.restrict_proxy_distribution'],
      },
      {
        key: 'error_setting.restrict_proxy_distribution_log_only',
        value: !!inputs['error_setting.restrict_proxy_distribution_log_only'],
      },
      {
        key: 'error_setting.restrict_proxy_distribution_blocked_message',
        value:
          inputs['error_setting.restrict_proxy_distribution_blocked_message'] ||
          '',
      },
      {
        key: 'error_setting.restrict_proxy_distribution_allowed_hosts',
        value: JSON.stringify(normalizeTagValues(antiDistributionAllowedHosts)),
      },
      {
        key: 'error_setting.restrict_proxy_distribution_allowed_sources',
        value: JSON.stringify(
          normalizeTagValues(antiDistributionAllowedSources),
        ),
      },
      {
        key: 'error_setting.show_site_domain_in_error',
        value: !!inputs['error_setting.show_site_domain_in_error'],
      },
    ]);
    if (saved) {
      await fetchAntiDistributionLogs();
    }
  };

  const resetAntiDistributionSettings = async () => {
    Modal.confirm({
      title: t('确认重置防分发配置'),
      content: t(
        '这会把防分发开关、观察模式、白名单和提示文案恢复为默认值，用于快速回滚到稳定状态。',
      ),
      okText: t('确认重置'),
      cancelText: t('取消'),
      onOk: async () => {
        try {
          const res = await API.post('/api/anti_distribution/reset_defaults');
          const { success, message } = res.data;
          if (!success) {
            showError(message);
            return;
          }
          showSuccess(t('已重置为默认配置'));
          await getOptions();
        } catch (error) {
          showError(t('重置失败'));
        }
      },
    });
  };

  const handleCheckboxChange = (optionKey, event) => {
    const checked = event.target.checked;
    const nextInputs = {
      ...inputs,
      [optionKey]: checked,
    };
    setInputs(nextInputs);
    formApiRef.current?.setValue(optionKey, checked);
  };

  useEffect(() => {
    getOptions();
  }, []);

  return (
    <div className='mt-[60px] px-2'>
      <Spin spinning={loading}>
        {isLoaded && (
          <Form
            initValues={inputs}
            onValueChange={setInputs}
            getFormApi={(api) => (formApiRef.current = api)}
          >
            <Card>
              <Form.Section
                text={t('风险封控')}
                extraText={t(
                  '这里统一管理防分发相关策略和最近命中记录，便于管理员单独排查风险请求。',
                )}
              >
                <Row
                  gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
                >
                  <Col xs={24} sm={24} md={24} lg={24} xl={24}>
                    <Form.Checkbox
                      field='error_setting.restrict_proxy_distribution'
                      noLabel
                      onChange={(e) =>
                        handleCheckboxChange(
                          'error_setting.restrict_proxy_distribution',
                          e,
                        )
                      }
                    >
                      {t('限制非 nbility.dev 系列域名访问')}
                    </Form.Checkbox>
                    <Text type='secondary'>
                      {t(
                        '开启后 web 入口层和后端都会按同一套白名单校验 Host / Origin / Referer，先拦常规分发，再由后端兜底',
                      )}
                    </Text>
                    <Form.Checkbox
                      field='error_setting.restrict_proxy_distribution_log_only'
                      noLabel
                      onChange={(e) =>
                        handleCheckboxChange(
                          'error_setting.restrict_proxy_distribution_log_only',
                          e,
                        )
                      }
                      style={{ marginTop: 12 }}
                    >
                      {t('仅记录不拦截')}
                    </Form.Checkbox>
                    <Text type='secondary'>
                      {t(
                        '建议先观察再正式拦截，这样更容易发现误伤而不是直接影响用户请求',
                      )}
                    </Text>
                  </Col>
                </Row>
                <Row
                  gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
                  style={{ marginTop: 16 }}
                >
                  <Col xs={24} sm={24} md={12} lg={12} xl={12}>
                    <Text strong>{t('允许的请求 Host')}</Text>
                    <Text
                      type='secondary'
                      style={{ display: 'block', marginBottom: 8 }}
                    >
                      {t(
                        '支持精确域名或 *.nbility.dev 这种通配符；未命中的请求 Host 会被视为疑似分发',
                      )}
                    </Text>
                    <TagInput
                      value={antiDistributionAllowedHosts}
                      onChange={setAntiDistributionAllowedHosts}
                      placeholder={t('例如：nbility.dev, *.nbility.dev')}
                    />
                  </Col>
                  <Col xs={24} sm={24} md={12} lg={12} xl={12}>
                    <Text strong>{t('允许的来源 Host')}</Text>
                    <Text
                      type='secondary'
                      style={{ display: 'block', marginBottom: 8 }}
                    >
                      {t(
                        '会校验 Origin / Referer 的 Host，浏览器分发通常会在这里暴露来源站点',
                      )}
                    </Text>
                    <TagInput
                      value={antiDistributionAllowedSources}
                      onChange={setAntiDistributionAllowedSources}
                      placeholder={t('例如：nbility.dev, *.nbility.dev')}
                    />
                  </Col>
                </Row>
                <Row
                  gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
                  style={{ marginTop: 16 }}
                >
                  <Col xs={24} sm={24} md={24} lg={24} xl={24}>
                    <Form.Input
                      field='error_setting.restrict_proxy_distribution_blocked_message'
                      label={t('拦截提示文案')}
                      placeholder={t(
                        '请勿使用反代等程序，请使用 https://nbility.dev 中转站，如需外接请联系。',
                      )}
                    />
                  </Col>
                </Row>
                <Row
                  gutter={{ xs: 8, sm: 16, md: 24, lg: 24, xl: 24, xxl: 24 }}
                  style={{ marginTop: 16 }}
                >
                  <Col xs={24} sm={24} md={24} lg={24} xl={24}>
                    <Form.Checkbox
                      field='error_setting.show_site_domain_in_error'
                      noLabel
                      onChange={(e) =>
                        handleCheckboxChange(
                          'error_setting.show_site_domain_in_error',
                          e,
                        )
                      }
                    >
                      {t('在限流错误中展示本站域名')}
                    </Form.Checkbox>
                    <Text type='secondary'>
                      {t(
                        '开启后会在特定限流错误中追加本站域名，优先使用服务器地址，未配置时回退到当前请求域名；不会影响其他错误类型',
                      )}
                    </Text>
                  </Col>
                </Row>
                <div
                  style={{
                    display: 'flex',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <Button
                    type='primary'
                    onClick={submitAntiDistributionSettings}
                  >
                    {t('保存风险封控设置')}
                  </Button>
                  <Button theme='light' onClick={fetchAntiDistributionLogs}>
                    {t('刷新命中记录')}
                  </Button>
                  <Button
                    theme='borderless'
                    type='danger'
                    onClick={resetAntiDistributionSettings}
                  >
                    {t('重置为默认')}
                  </Button>
                </div>
                <div style={{ marginTop: 20 }}>
                  <Text strong>{t('最近命中记录')}</Text>
                  <Text
                    type='secondary'
                    style={{ display: 'block', marginBottom: 12 }}
                  >
                    {t(
                      '这里展示后端已经落库的命中记录；web 入口层直接拦截时也会把具体原因返回给调用方，方便定位到底是哪里被拦了',
                    )}
                  </Text>
                  <Spin spinning={antiDistributionLogsLoading}>
                    {antiDistributionLogs.length === 0 ? (
                      <Text type='secondary'>{t('暂无命中记录')}</Text>
                    ) : (
                      antiDistributionLogs.map((log) => (
                        <div
                          key={log.id}
                          style={{
                            padding: 12,
                            border: '1px solid var(--semi-color-border)',
                            borderRadius: 8,
                            marginBottom: 12,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              gap: 8,
                              flexWrap: 'wrap',
                              marginBottom: 8,
                            }}
                          >
                            <Tag color='red'>{log.action}</Tag>
                            <Tag color='blue'>{log.layer}</Tag>
                            <Tag>{log.reason}</Tag>
                            <Text type='secondary'>
                              {new Date(log.created_at * 1000).toLocaleString()}
                            </Text>
                          </div>
                          <Text style={{ display: 'block' }}>
                            {t('路径')}：{log.method} {log.path}
                          </Text>
                          <Text style={{ display: 'block' }}>
                            IP：{log.client_ip || '-'}
                          </Text>
                          <Text style={{ display: 'block' }}>
                            Host：{log.request_host || '-'}
                          </Text>
                          <Text style={{ display: 'block' }}>
                            Origin：{log.origin_host || '-'}
                          </Text>
                          <Text style={{ display: 'block' }}>
                            Referer：{log.referer_host || '-'}
                          </Text>
                          {log.note ? (
                            <Text
                              type='secondary'
                              style={{ display: 'block', marginTop: 8 }}
                            >
                              {log.note}
                            </Text>
                          ) : null}
                        </div>
                      ))
                    )}
                  </Spin>
                </div>
              </Form.Section>
            </Card>
          </Form>
        )}
      </Spin>
    </div>
  );
};

export default RiskControlSetting;
