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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { API, renderQuota, showError, showSuccess, timestamp2string } from '../../../helpers';

const { Text } = Typography;

const getStatusMeta = (status, t) => {
  switch (status) {
    case 'approved':
      return { color: 'green', text: t('已批准') };
    case 'rejected':
      return { color: 'red', text: t('已拒绝') };
    case 'pending':
      return { color: 'orange', text: t('待审核') };
    default:
      return { color: 'grey', text: status || '--' };
  }
};

const SubscriptionConversionRequestsPanel = ({ t }) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('pending');
  const [current, setCurrent] = useState(null);
  const [approveVisible, setApproveVisible] = useState(false);
  const [rejectVisible, setRejectVisible] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [approvedRatio, setApprovedRatio] = useState('1');
  const [approvedQuota, setApprovedQuota] = useState('');
  const [adminRemark, setAdminRemark] = useState('');
  const [rejectRemark, setRejectRemark] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/subscription/admin/conversion_requests', {
        params: {
          keyword: keyword.trim(),
          status: status === 'all' ? '' : status,
          p: 0,
          page_size: 50,
        },
      });
      if (res.data?.success) {
        setItems(res.data.data?.items || []);
      } else {
        showError(res.data?.message || t('加载失败'));
      }
    } catch {
      showError(t('加载失败'));
    } finally {
      setLoading(false);
    }
  }, [keyword, status, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openApprove = (item) => {
    setCurrent(item);
    setApprovedRatio(
      Number(item?.requested_ratio || 0) > 0
        ? String(item.requested_ratio)
        : '1',
    );
    setApprovedQuota(
      Number(item?.requested_quota || 0) > 0 ? String(item.requested_quota) : '',
    );
    setAdminRemark(item?.admin_remark || '');
    setApproveVisible(true);
  };

  const openReject = (item) => {
    setCurrent(item);
    setRejectRemark('');
    setRejectVisible(true);
  };

  const handleApprove = async () => {
    if (!current?.id) return;
    const ratioValue = Number(approvedRatio);
    if (!Number.isFinite(ratioValue) || ratioValue <= 0) {
      showError(t('批准比例必须大于 0'));
      return;
    }

    const quotaValue =
      approvedQuota === ''
        ? Number(current?.requested_quota || 0)
        : Number(approvedQuota);
    if (!Number.isFinite(quotaValue) || quotaValue < 0) {
      showError(t('最终增加余额额度不能小于 0'));
      return;
    }

    setApproving(true);
    try {
      const res = await API.post(
        `/api/subscription/admin/conversion_requests/${current.id}/approve`,
        {
          approved_ratio: ratioValue,
          approved_quota: quotaValue,
          admin_remark: adminRemark,
        },
      );
      if (res.data?.success) {
        showSuccess(t('已批准并执行折算'));
        setApproveVisible(false);
        await loadData();
      } else {
        showError(res.data?.message || t('审批失败'));
      }
    } catch {
      showError(t('审批失败'));
    } finally {
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!current?.id) return;
    if (!rejectRemark.trim()) {
      showError(t('请填写拒绝原因'));
      return;
    }
    setRejecting(true);
    try {
      const res = await API.post(
        `/api/subscription/admin/conversion_requests/${current.id}/reject`,
        {
          admin_remark: rejectRemark.trim(),
        },
      );
      if (res.data?.success) {
        showSuccess(t('已拒绝该申请'));
        setRejectVisible(false);
        await loadData();
      } else {
        showError(res.data?.message || t('操作失败'));
      }
    } catch {
      showError(t('操作失败'));
    } finally {
      setRejecting(false);
    }
  };

  const columns = useMemo(
    () => [
      {
        title: t('ID'),
        dataIndex: 'id',
        render: (value) => `#${value}`,
        width: 88,
      },
      {
        title: t('用户'),
        render: (text, record) => (
          <div>
            <div>{record?.username || '-'}</div>
            <Text type='tertiary' size='small'>
              {t('用户 ID')} {record?.user_id}
            </Text>
          </div>
        ),
      },
      {
        title: t('状态'),
        dataIndex: 'status',
        width: 120,
        render: (value) => {
          const meta = getStatusMeta(value, t);
          return (
            <Tag color={meta.color} shape='circle' size='small'>
              {meta.text}
            </Tag>
          );
        },
      },
      {
        title: t('申请返还'),
        render: (text, record) => (
          <div>
            <div>{renderQuota(record?.requested_quota || 0)}</div>
            <Text type='tertiary' size='small'>
              x{Number(record?.requested_ratio || 1).toFixed(2)}
            </Text>
          </div>
        ),
      },
      {
        title: t('批准返还'),
        render: (text, record) =>
          record?.status === 'approved' ? (
            <div>
              <div>{renderQuota(record?.approved_quota || 0)}</div>
              <Text type='tertiary' size='small'>
                x{Number(record?.approved_ratio || 1).toFixed(2)}
              </Text>
            </div>
          ) : (
            '-'
          ),
      },
      {
        title: t('申请时间'),
        dataIndex: 'create_time',
        render: (value) => timestamp2string(value),
        width: 170,
      },
      {
        title: t('操作'),
        width: 220,
        render: (text, record) =>
          record?.status === 'pending' ? (
            <Space>
              <Button size='small' type='primary' onClick={() => openApprove(record)}>
                {t('批准')}
              </Button>
              <Button size='small' type='danger' onClick={() => openReject(record)}>
                {t('拒绝')}
              </Button>
            </Space>
          ) : (
            <Text type='tertiary' size='small'>
              {record?.admin_remark || '-'}
            </Text>
          ),
      },
    ],
    [t],
  );

  return (
    <>
      <Card
        className='!rounded-xl border border-semi-color-border shadow-sm'
        bodyStyle={{ padding: '16px' }}
      >
        <div className='mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between'>
          <div>
            <div className='font-semibold'>{t('套餐转余额审核')}</div>
            <Text type='tertiary' size='small'>
              {t('用户提交后原套餐会先被禁用；管理员批准后增加余额，拒绝后恢复原套餐。')}
            </Text>
          </div>
          <Space wrap>
            <Input
              value={keyword}
              onChange={setKeyword}
              placeholder={t('搜索用户名 / 用户ID / 申请ID')}
              showClear
            />
            <Select
              value={status}
              onChange={setStatus}
              optionList={[
                { label: t('待审核'), value: 'pending' },
                { label: t('已批准'), value: 'approved' },
                { label: t('已拒绝'), value: 'rejected' },
                { label: t('全部状态'), value: 'all' },
              ]}
              style={{ width: 140 }}
            />
            <Button theme='outline' onClick={loadData} loading={loading}>
              {t('刷新')}
            </Button>
          </Space>
        </div>

        <Table
          rowKey='id'
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          empty={t('暂无申请记录')}
        />
      </Card>

      <Modal
        title={t('批准转余额申请')}
        visible={approveVisible}
        onCancel={() => setApproveVisible(false)}
        onOk={handleApprove}
        confirmLoading={approving}
        okText={t('确认批准')}
        cancelText={t('取消')}
      >
        <div className='space-y-3'>
          <div className='rounded-lg bg-semi-color-fill-0 p-3 text-sm'>
            <div>
              {t('申请用户')}：{current?.username || '-'}
            </div>
            <div>
              {t('申请返还')}：{renderQuota(current?.requested_quota || 0)}
            </div>
            <div className='text-semi-color-text-2'>
              {t('批准后会直接增加余额，并保持原套餐作废状态。')}
            </div>
          </div>
          <div>
            <div className='mb-1 text-sm'>{t('批准比例')}</div>
            <Input
              value={approvedRatio}
              onChange={setApprovedRatio}
              placeholder='1.00'
            />
          </div>
          <div>
            <div className='mb-1 text-sm'>{t('最终增加余额额度')}</div>
            <Input
              value={approvedQuota}
              onChange={setApprovedQuota}
              placeholder={String(current?.requested_quota || '')}
            />
          </div>
          <div>
            <div className='mb-1 text-sm'>{t('管理员备注')}</div>
            <Input.TextArea
              value={adminRemark}
              onChange={setAdminRemark}
              rows={4}
            />
          </div>
        </div>
      </Modal>

      <Modal
        title={t('拒绝转余额申请')}
        visible={rejectVisible}
        onCancel={() => setRejectVisible(false)}
        onOk={handleReject}
        confirmLoading={rejecting}
        okText={t('确认拒绝')}
        cancelText={t('取消')}
      >
        <div className='space-y-3'>
          <Text type='tertiary' size='small'>
            {t('拒绝后系统会恢复用户申请时被禁用的原套餐。')}
          </Text>
          <div>
            <div className='mb-1 text-sm'>{t('拒绝原因')}</div>
            <Input.TextArea
              value={rejectRemark}
              onChange={setRejectRemark}
              rows={4}
            />
          </div>
        </div>
      </Modal>
    </>
  );
};

export default SubscriptionConversionRequestsPanel;
