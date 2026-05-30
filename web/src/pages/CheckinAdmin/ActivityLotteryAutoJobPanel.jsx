import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Empty,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { useTranslation } from 'react-i18next';
import CardPro from '../../components/common/ui/CardPro';
import CardTable from '../../components/common/ui/CardTable';
import { API, showError, showSuccess } from '../../helpers';
import { createCardProPagination } from '../../helpers/utils';
import { useIsMobile } from '../../hooks/common/useIsMobile';

const { Text } = Typography;

// 1 美元 = 500000 quota（与后端 common.QuotaPerUnit 一致）
const QUOTA_PER_UNIT = 500000;

const JOIN_SOURCE_OPTIONS = [
  { value: 'manual', label: '手动报名' },
  { value: 'checkin', label: '签到' },
  { value: 'topup', label: '充值' },
  { value: 'consume', label: '消耗' },
];

const buildDefaultForm = () => ({
  id: 0,
  name: '',
  enabled: true,
  title_template: 'Nbility 日常抽奖活动第{n}期',
  run_at_hour: 9,
  run_at_minute: 0,
  duration_hours: 24,
  winner_count: 3,
  min_participants: 0,
  join_sources: ['manual'],
  join_topup_min_money: 0,
  join_daily_consume_min_money: 0,
  prize_quota: QUOTA_PER_UNIT,
  prize_name: '活动抽奖第{n}期',
  prize_text: '额度兑换码',
});

const secondsToHM = (seconds) => {
  const total = Number(seconds) || 0;
  const hour = Math.floor(total / 3600);
  const minute = Math.floor((total % 3600) / 60);
  return { hour, minute };
};

const ActivityLotteryAutoJobPanel = () => {
  const { t } = useTranslation();
  const isMobile = useIsMobile();

  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);

  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(buildDefaultForm());

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/activity/lottery/admin/auto_jobs', {
        params: { page, page_size: pageSize },
      });
      const { success, message, data } = res.data;
      if (success) {
        setJobs(data?.items || []);
        setTotal(data?.total || 0);
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  const updateForm = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const openCreateModal = () => {
    setForm(buildDefaultForm());
    setModalVisible(true);
  };

  const openEditModal = (record) => {
    const { hour, minute } = secondsToHM(record.run_at_seconds);
    setForm({
      id: record.id,
      name: record.name || '',
      enabled: !!record.enabled,
      title_template: record.title_template || '',
      run_at_hour: hour,
      run_at_minute: minute,
      duration_hours: Math.round((record.duration_seconds || 0) / 3600),
      winner_count: record.winner_count || 1,
      min_participants: record.min_participants || 0,
      join_sources: (record.join_sources || 'manual')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      join_topup_min_money: record.join_topup_min_money || 0,
      join_daily_consume_min_money: record.join_daily_consume_min_money || 0,
      prize_quota: record.prize_quota || 0,
      prize_name: record.prize_name || '',
      prize_text: record.prize_text || '',
    });
    setModalVisible(true);
  };

  const buildPayload = (source) => ({
    name: source.name?.trim() || '',
    enabled: !!source.enabled,
    title_template: source.title_template?.trim() || '',
    run_at_seconds:
      (Number(source.run_at_hour) || 0) * 3600 +
      (Number(source.run_at_minute) || 0) * 60,
    duration_seconds: (Number(source.duration_hours) || 0) * 3600,
    winner_count: Number(source.winner_count) || 0,
    min_participants: Number(source.min_participants) || 0,
    join_sources: (source.join_sources || []).join(','),
    join_topup_min_money: Number(source.join_topup_min_money) || 0,
    join_daily_consume_min_money:
      Number(source.join_daily_consume_min_money) || 0,
    prize_quota: Number(source.prize_quota) || 0,
    prize_name: source.prize_name?.trim() || '',
    prize_text: source.prize_text?.trim() || '',
  });

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = buildPayload(form);
      const res = form.id
        ? await API.put(
            `/api/activity/lottery/admin/auto_jobs/${form.id}`,
            payload,
          )
        : await API.post('/api/activity/lottery/admin/auto_jobs', payload);
      const { success, message } = res.data;
      if (success) {
        showSuccess(form.id ? t('已保存') : t('已创建'));
        setModalVisible(false);
        await loadJobs();
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEnabled = async (record, nextEnabled) => {
    try {
      const { hour, minute } = secondsToHM(record.run_at_seconds);
      const payload = buildPayload({
        name: record.name,
        enabled: nextEnabled,
        title_template: record.title_template,
        run_at_hour: hour,
        run_at_minute: minute,
        duration_hours: (record.duration_seconds || 0) / 3600,
        winner_count: record.winner_count,
        min_participants: record.min_participants,
        join_sources: (record.join_sources || 'manual')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        join_topup_min_money: record.join_topup_min_money,
        join_daily_consume_min_money: record.join_daily_consume_min_money,
        prize_quota: record.prize_quota,
        prize_name: record.prize_name,
        prize_text: record.prize_text,
      });
      const res = await API.put(
        `/api/activity/lottery/admin/auto_jobs/${record.id}`,
        payload,
      );
      const { success, message } = res.data;
      if (success) {
        showSuccess(nextEnabled ? t('已启用') : t('已停用'));
        await loadJobs();
      } else {
        showError(message);
      }
    } catch (error) {
      showError(error.message);
    }
  };

  const handleDelete = (record) => {
    Modal.confirm({
      title: t('确认删除该自动抽奖任务？'),
      content: t('删除后不影响已创建的期数，仅停止后续自动建期。'),
      onOk: async () => {
        try {
          const res = await API.delete(
            `/api/activity/lottery/admin/auto_jobs/${record.id}`,
          );
          const { success, message } = res.data;
          if (success) {
            showSuccess(t('已删除'));
            await loadJobs();
          } else {
            showError(message);
          }
        } catch (error) {
          showError(error.message);
        }
      },
    });
  };

  const handleRunNow = (record) => {
    Modal.confirm({
      title: t('立即执行一次抽奖期数创建？'),
      content: t(
        '将立即按本任务模板创建并开启新一期（期号自增，开期时间为现在，持续时长仍取任务配置）。若当前有正在进行的期，将被关闭。',
      ),
      onOk: async () => {
        try {
          const res = await API.post(
            `/api/activity/lottery/admin/auto_jobs/${record.id}/run`,
          );
          const { success, message, data } = res.data;
          if (success) {
            showSuccess(
              `${t('已创建并开启新一期')}${data?.title ? `：${data.title}` : ''}`,
            );
            await loadJobs();
          } else {
            showError(message);
          }
        } catch (error) {
          showError(error.message);
        }
      },
    });
  };

  const columns = useMemo(
    () => [
      { title: t('任务名'), dataIndex: 'name' },
      {
        title: t('当前期号'),
        dataIndex: 'issue_no',
        render: (value) => `${t('第')} ${value || 0} ${t('期')}`,
      },
      {
        title: t('开期时刻'),
        dataIndex: 'run_at_seconds',
        render: (value) => {
          const { hour, minute } = secondsToHM(value);
          return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
        },
      },
      {
        title: t('持续(小时)'),
        dataIndex: 'duration_seconds',
        render: (value) => Math.round((value || 0) / 3600),
      },
      { title: t('中奖人数'), dataIndex: 'winner_count' },
      {
        title: t('兑换码额度'),
        dataIndex: 'prize_quota',
        render: (value) =>
          `${value || 0} (≈ $${((value || 0) / QUOTA_PER_UNIT).toFixed(2)})`,
      },
      {
        title: t('启用'),
        dataIndex: 'enabled',
        render: (value, record) => (
          <Switch
            checked={!!value}
            onChange={(checked) => handleToggleEnabled(record, checked)}
          />
        ),
      },
      {
        title: t('上次建期'),
        dataIndex: 'last_run_date',
        render: (value) => value || '-',
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        render: (value, record) =>
          record.last_error ? (
            <Tag color='red'>{record.last_error}</Tag>
          ) : (
            <Tag color='green'>{value || 'ok'}</Tag>
          ),
      },
      {
        title: t('操作'),
        dataIndex: 'op',
        render: (_, record) => (
          <Space>
            <Button
              theme='solid'
              size='small'
              onClick={() => handleRunNow(record)}
            >
              {t('立即执行')}
            </Button>
            <Button
              theme='light'
              size='small'
              onClick={() => openEditModal(record)}
            >
              {t('编辑')}
            </Button>
            <Button
              theme='light'
              type='danger'
              size='small'
              onClick={() => handleDelete(record)}
            >
              {t('删除')}
            </Button>
          </Space>
        ),
      },
    ],
    [t],
  );

  return (
    <div className='mt-6'>
      <CardPro
        type='type2'
        searchArea={
          <div className='flex flex-col gap-3'>
            <Banner
              type='info'
              bordered={false}
              closeIcon={null}
              description={t(
                '自动抽奖任务：到达每天的开期时刻后，自动按模板创建并开启新一期（期号自增）；开奖时为每个中奖者生成各自的额度兑换码并发放到站内信与邮箱。需开启「活动抽奖」总开关后生效。',
              )}
            />
            <div className='flex flex-col gap-2 md:flex-row md:items-center md:justify-between'>
              <div>
                <div className='text-base font-semibold text-semi-color-text-0'>
                  {t('自动抽奖任务')}
                </div>
                <Text type='tertiary' size='small'>
                  {t('配置后无需每期手动创建抽奖与兑换码')}
                </Text>
              </div>
              <Space wrap>
                <Button theme='outline' onClick={loadJobs} loading={loading}>
                  {t('刷新')}
                </Button>
                <Button type='primary' onClick={openCreateModal}>
                  {t('新建任务')}
                </Button>
              </Space>
            </div>
          </div>
        }
        paginationArea={createCardProPagination({
          currentPage: page,
          pageSize,
          total,
          onPageChange: setPage,
          onPageSizeChange: (size) => {
            setPageSize(size);
            setPage(1);
          },
          isMobile,
          t,
        })}
        t={t}
      >
        <CardTable
          columns={columns}
          dataSource={jobs}
          loading={loading}
          rowKey='id'
          pagination={false}
          empty={
            <Empty
              image={<IllustrationNoResult />}
              darkModeImage={<IllustrationNoResultDark />}
              description={t('暂无自动抽奖任务')}
            />
          }
        />
      </CardPro>

      <Modal
        title={form.id ? t('编辑自动抽奖任务') : t('新建自动抽奖任务')}
        visible={modalVisible}
        onOk={handleSubmit}
        confirmLoading={submitting}
        onCancel={() => setModalVisible(false)}
        width={isMobile ? '100%' : 560}
      >
        <div className='flex flex-col gap-3'>
          <div>
            <Text strong>{t('任务名')}</Text>
            <Input
              value={form.name}
              onChange={(v) => updateForm({ name: v })}
              placeholder={t('例如：日常抽奖')}
            />
          </div>
          <div>
            <Text strong>{t('标题模板')}</Text>
            <Input
              value={form.title_template}
              onChange={(v) => updateForm({ title_template: v })}
              placeholder='Nbility 日常抽奖活动第{n}期'
            />
            <Text type='tertiary' size='small'>
              {t('{n} 会被替换为自增期号')}
            </Text>
          </div>
          <div className='flex gap-3'>
            <div className='flex-1'>
              <Text strong>{t('开期时刻')}</Text>
              <Space>
                <InputNumber
                  min={0}
                  max={23}
                  value={form.run_at_hour}
                  onChange={(v) => updateForm({ run_at_hour: v })}
                  suffix={t('时')}
                />
                <InputNumber
                  min={0}
                  max={59}
                  value={form.run_at_minute}
                  onChange={(v) => updateForm({ run_at_minute: v })}
                  suffix={t('分')}
                />
              </Space>
            </div>
            <div className='flex-1'>
              <Text strong>{t('持续时长(小时)')}</Text>
              <InputNumber
                min={1}
                value={form.duration_hours}
                onChange={(v) => updateForm({ duration_hours: v })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div className='flex gap-3'>
            <div className='flex-1'>
              <Text strong>{t('中奖人数')}</Text>
              <InputNumber
                min={1}
                value={form.winner_count}
                onChange={(v) => updateForm({ winner_count: v })}
                style={{ width: '100%' }}
              />
            </div>
            <div className='flex-1'>
              <Text strong>{t('最低参与人数')}</Text>
              <InputNumber
                min={0}
                value={form.min_participants}
                onChange={(v) => updateForm({ min_participants: v })}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div>
            <Text strong>{t('参与方式')}</Text>
            <Select
              multiple
              value={form.join_sources}
              onChange={(v) => updateForm({ join_sources: v })}
              optionList={JOIN_SOURCE_OPTIONS.map((o) => ({
                value: o.value,
                label: t(o.label),
              }))}
              style={{ width: '100%' }}
            />
          </div>
          {form.join_sources.includes('topup') && (
            <div>
              <Text strong>{t('充值参与门槛(美元)')}</Text>
              <InputNumber
                min={0}
                value={form.join_topup_min_money}
                onChange={(v) => updateForm({ join_topup_min_money: v })}
                style={{ width: '100%' }}
              />
            </div>
          )}
          {form.join_sources.includes('consume') && (
            <div>
              <Text strong>{t('今日消耗参与门槛(美元)')}</Text>
              <InputNumber
                min={0}
                value={form.join_daily_consume_min_money}
                onChange={(v) =>
                  updateForm({ join_daily_consume_min_money: v })
                }
                style={{ width: '100%' }}
              />
            </div>
          )}
          <div>
            <Text strong>{t('兑换码额度(quota)')}</Text>
            <InputNumber
              min={1}
              value={form.prize_quota}
              onChange={(v) => updateForm({ prize_quota: v })}
              style={{ width: '100%' }}
            />
            <Text type='tertiary' size='small'>
              {`≈ $${((Number(form.prize_quota) || 0) / QUOTA_PER_UNIT).toFixed(2)}（${t('兑换码恒不过期')}）`}
            </Text>
          </div>
          <div>
            <Text strong>{t('兑换码名称模板')}</Text>
            <Input
              value={form.prize_name}
              onChange={(v) => updateForm({ prize_name: v })}
              placeholder='活动抽奖第{n}期'
            />
            <Text type='tertiary' size='small'>
              {t('含期号后不超过 20 个字符')}
            </Text>
          </div>
          <div>
            <Text strong>{t('奖品展示名')}</Text>
            <Input
              value={form.prize_text}
              onChange={(v) => updateForm({ prize_text: v })}
              placeholder={t('额度兑换码')}
            />
          </div>
          <div className='flex items-center gap-2'>
            <Text strong>{t('启用')}</Text>
            <Switch
              checked={form.enabled}
              onChange={(checked) => updateForm({ enabled: checked })}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ActivityLotteryAutoJobPanel;
