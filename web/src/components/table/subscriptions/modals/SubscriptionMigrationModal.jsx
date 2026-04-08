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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Modal,
  SideSheet,
  Space,
  Spin,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { IconClose, IconPlay, IconSave } from '@douyinfe/semi-icons';
import {
  API,
  buildGroupOptions,
  renderGroup,
  renderGroupOption,
  showError,
  showSuccess,
} from '../../../../helpers';
import { formatSubscriptionDuration } from '../../../../helpers/subscriptionFormat';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import CardTable from '../../../common/ui/CardTable';

const { Text } = Typography;

function formatTs(ts) {
  if (!ts) return '-';
  return new Date(ts * 1000).toLocaleString();
}

function buildPayload(values) {
  return {
    target_plan_id: Number(values?.target_plan_id || 0),
    group: values?.group || '',
    source_group: values?.source_group || '',
    source_resource_type: values?.source_resource_type || 'quota',
    exclude_duration_unit: values?.exclude_duration_unit || 'day',
    source_plan_ids: Array.isArray(values?.source_plan_ids)
      ? values.source_plan_ids.map((id) => Number(id)).filter((id) => id > 0)
      : [],
  };
}

const SubscriptionMigrationModal = ({ visible, handleClose, refresh, t }) => {
  const RESOURCE_OPTIONS = [
    { label: t('额度'), value: 'quota' },
    { label: t('次数'), value: 'request_count' },
  ];

  const DURATION_OPTIONS = [
    { label: t('不排除'), value: '' },
    { label: t('天卡'), value: 'day' },
    { label: t('周卡'), value: 'week' },
    { label: t('月卡'), value: 'month' },
    { label: t('年卡'), value: 'year' },
  ];

  const isMobile = useIsMobile();
  const formApiRef = useRef(null);
  const [plans, setPlans] = useState([]);
  const [groupOptions, setGroupOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);

  const planOptions = useMemo(() => {
    return (plans || []).map((item) => {
      const plan = item?.plan || {};
      return {
        label: `${plan.title || `#${plan.id}`} · ${formatSubscriptionDuration(
          plan,
          t,
        )}`,
        value: plan.id,
      };
    });
  }, [plans, t]);

  const initValues = useMemo(
    () => ({
      target_plan_id: undefined,
      group: '',
      source_group: '',
      source_resource_type: 'quota',
      exclude_duration_unit: 'day',
      source_plan_ids: [],
    }),
    [],
  );

  const loadOptions = async () => {
    setLoading(true);
    try {
      const [plansRes, groupsRes] = await Promise.all([
        API.get('/api/subscription/admin/plans'),
        API.get('/api/group/'),
      ]);
      if (plansRes.data?.success) {
        setPlans(plansRes.data?.data || []);
      } else {
        showError(plansRes.data?.message || t('加载套餐失败'));
      }
      if (groupsRes.data?.success) {
        setGroupOptions(buildGroupOptions(groupsRes.data?.data || []));
      } else {
        showError(groupsRes.data?.message || t('加载分组失败'));
      }
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    setPreviewResult(null);
    loadOptions();
  }, [visible]);

  const handlePreview = async () => {
    const values = formApiRef.current?.getValues();
    const payload = buildPayload(values);
    if (!payload.target_plan_id) {
      showError(t('请选择目标套餐'));
      return;
    }
    if (!payload.group) {
      showError(t('请选择用户分组'));
      return;
    }
    setPreviewing(true);
    try {
      const res = await API.post(
        '/api/subscription/admin/migrations/preview',
        payload,
      );
      if (res.data?.success) {
        setPreviewResult({
          payload,
          data: res.data?.data || { total: 0, items: [], target_plan: null },
        });
        showSuccess(t('预览完成'));
      } else {
        showError(res.data?.message || t('预览失败'));
      }
    } catch (error) {
      showError(error);
    } finally {
      setPreviewing(false);
    }
  };

  const handleExecute = () => {
    if (!previewResult?.payload) {
      showError(t('请先预览迁移结果'));
      return;
    }
    Modal.confirm({
      title: t('确认执行迁移'),
      content: t(
        '执行后会删除旧订阅并替换为新套餐，保持原有效期。建议先核对预览结果。',
      ),
      centered: true,
      okText: t('确认执行'),
      okType: 'danger',
      onOk: async () => {
        setExecuting(true);
        try {
          const res = await API.post(
            '/api/subscription/admin/migrations/execute',
            previewResult.payload,
          );
          if (res.data?.success) {
            const result = res.data?.data || {};
            showSuccess(
              t('迁移完成') +
                `：${t('成功')} ${Number(result.migrated || 0)}，${t(
                  '失败',
                )} ${Number(result.failed || 0)}`,
            );
            setPreviewResult((prev) =>
              prev
                ? {
                    ...prev,
                    execution: result,
                  }
                : prev,
            );
            refresh?.();
          } else {
            showError(res.data?.message || t('执行失败'));
          }
        } catch (error) {
          showError(error);
        } finally {
          setExecuting(false);
        }
      },
    });
  };

  const previewItems = previewResult?.data?.items || [];
  const executionMap = useMemo(() => {
    const map = new Map();
    (previewResult?.execution?.items || []).forEach((item) => {
      map.set(item.user_subscription_id, item);
    });
    return map;
  }, [previewResult]);

  const columns = useMemo(
    () => [
      {
        title: '用户',
        dataIndex: 'username',
        render: (text, record) => (
          <Space>
            <Text strong>{text || '-'}</Text>
            <Tag size='small' color='grey'>
              #{record.user_id}
            </Tag>
          </Space>
        ),
      },
      {
        title: t('用户分组'),
        dataIndex: 'user_group',
        render: (text) =>
          text ? renderGroup(text) : <Tag size='small'>-</Tag>,
      },
      {
        title: t('旧套餐'),
        dataIndex: 'old_plan_title',
        render: (text, record) => (
          <div>
            <div>{text || `#${record.old_plan_id}`}</div>
            <Text type='tertiary' size='small'>
              #{record.old_plan_id} ·{' '}
              {record.old_upgrade_group
                ? renderGroup(record.old_upgrade_group)
                : '-'}
            </Text>
          </div>
        ),
      },
      {
        title: t('有效期'),
        render: (text, record) => (
          <div>
            <div>{formatTs(record.old_start_time)}</div>
            <Text type='tertiary' size='small'>
              {formatTs(record.old_end_time)}
            </Text>
          </div>
        ),
      },
      {
        title: t('目标套餐'),
        dataIndex: 'target_plan_title',
        render: (text, record) => (
          <div>
            <div>{text || `#${record.target_plan_id}`}</div>
            <Text type='tertiary' size='small'>
              #{record.target_plan_id} ·{' '}
              {record.target_upgrade_group
                ? renderGroup(record.target_upgrade_group)
                : '-'}
            </Text>
          </div>
        ),
      },
      {
        title: t('状态'),
        render: (text, record) => {
          const item = executionMap.get(record.user_subscription_id);
          if (!item) {
            return (
              <Tag color='blue' size='small'>
                {t('待执行')}
              </Tag>
            );
          }
          return item.status === 'migrated' ? (
            <Tag color='green' size='small'>
              {t('成功')}
            </Tag>
          ) : (
            <Tag color='red' size='small'>
              {t('失败')}
            </Tag>
          );
        },
      },
      {
        title: t('结果'),
        render: (text, record) => {
          const item = executionMap.get(record.user_subscription_id);
          return item?.message || '-';
        },
      },
    ],
    [executionMap, t],
  );

  return (
    <SideSheet
      placement='right'
      title={t('订阅迁移工具')}
      visible={visible}
      width={isMobile ? '100%' : 960}
      closeIcon={null}
      bodyStyle={{ padding: 0 }}
      onCancel={handleClose}
      footer={
        <div className='flex justify-end bg-white'>
          <Space>
            <Button
              theme='solid'
              type='tertiary'
              icon={<IconPlay />}
              onClick={handlePreview}
              loading={previewing}
            >
              {t('预览迁移')}
            </Button>
            <Button
              theme='solid'
              type='primary'
              icon={<IconSave />}
              onClick={handleExecute}
              loading={executing}
              disabled={
                !previewResult || Number(previewResult?.data?.total || 0) <= 0
              }
            >
              {t('执行迁移')}
            </Button>
            <Button
              theme='light'
              type='primary'
              icon={<IconClose />}
              onClick={handleClose}
            >
              {t('关闭')}
            </Button>
          </Space>
        </div>
      }
    >
      <Spin spinning={loading}>
        <div className='p-4'>
          <Form
            key={visible ? 'migration-open' : 'migration-closed'}
            initValues={initValues}
            getFormApi={(api) => {
              formApiRef.current = api;
            }}
            onValueChange={() => setPreviewResult(null)}
          >
            <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
              <Form.Select
                field='target_plan_id'
                label={t('目标套餐')}
                placeholder={t('请选择目标套餐')}
                optionList={planOptions}
                filter
              />
              <Form.Select
                field='group'
                label={t('用户分组')}
                placeholder={t('请选择用户分组')}
                optionList={groupOptions}
                renderOptionItem={renderGroupOption}
                filter
              />
              <Form.Select
                field='source_group'
                label={t('旧订阅分组')}
                placeholder={t('留空则跟用户分组一致')}
                optionList={groupOptions}
                renderOptionItem={renderGroupOption}
                filter
                allowCreate
              />
              <Form.Select
                field='source_resource_type'
                label={t('旧资源类型')}
                optionList={RESOURCE_OPTIONS.map((item) => ({
                  ...item,
                  label: t(item.label),
                }))}
              />
              <Form.Select
                field='exclude_duration_unit'
                label={t('排除时长单位')}
                optionList={DURATION_OPTIONS.map((item) => ({
                  ...item,
                  label: t(item.label),
                }))}
              />
              <Form.Select
                field='source_plan_ids'
                label={t('限定旧套餐')}
                placeholder={t('可选，不选则按条件匹配')}
                optionList={planOptions}
                multiple
                filter
              />
            </div>
          </Form>

          <div className='mt-4 mb-3 flex flex-wrap items-center gap-2'>
            <Tag color='blue'>{t('先预览再执行')}</Tag>
            <Tag color='orange'>{t('默认排除天卡')}</Tag>
            {previewResult ? (
              <Text>
                {t('命中用户')} {Number(previewResult.data?.total || 0)}{' '}
                {t('个')}
              </Text>
            ) : (
              <Text type='tertiary'>{t('变更表单后需要重新预览')}</Text>
            )}
          </div>

          <CardTable
            columns={columns}
            dataSource={previewItems}
            rowKey='user_subscription_id'
            pagination={false}
            hidePagination={true}
            scroll={{ x: 'max-content' }}
            empty={
              <Empty
                image={
                  <IllustrationNoResult style={{ width: 150, height: 150 }} />
                }
                darkModeImage={
                  <IllustrationNoResultDark
                    style={{ width: 150, height: 150 }}
                  />
                }
                description={t('暂无预览结果')}
                style={{ padding: 30 }}
              />
            }
          />
        </div>
      </Spin>
    </SideSheet>
  );
};

export default SubscriptionMigrationModal;
