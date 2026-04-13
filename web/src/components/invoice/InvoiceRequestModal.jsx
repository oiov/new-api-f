import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  Form,
  Table,
  Checkbox,
  Typography,
  Toast,
  Spin,
  Banner,
  Input,
  Select,
} from '@douyinfe/semi-ui';
import { IconSearch } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, timestamp2string } from '../../helpers';

const { Text } = Typography;
const { Option } = Select;
const MIN_AMOUNT = 50;

const PAYMENT_METHOD_MAP = {
  stripe: 'Stripe',
  epay: '易支付',
  creem: 'Creem',
  waffo: 'Waffo',
  manual: '管理员充值',
};

const InvoiceRequestModal = ({ visible, onClose, onSuccess }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [topups, setTopups] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [confirmInvoiceInfo, setConfirmInvoiceInfo] = useState(false);
  const [formValues, setFormValues] = useState({
    title_type: 'personal',
    title: '',
    tax_id: '',
    email: '',
  });
  const formApi = React.useRef(null);

  useEffect(() => {
    if (visible) {
      fetchInvoiceableTopUps();
      setSelectedIds([]);
      setSearchKeyword('');
      setConfirmInvoiceInfo(false);
      setFormValues({ title_type: 'personal', title: '', tax_id: '', email: '' });
    }
  }, [visible]);

  const fetchInvoiceableTopUps = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/user/invoice/invoiceable');
      if (res.data.success === true) {
        setTopups(res.data.data || []);
      }
    } catch {
      Toast.error(t('获取充值记录失败'));
    } finally {
      setLoading(false);
    }
  };

  const filteredTopups = useMemo(() => {
    const kw = searchKeyword.trim().toLowerCase();
    if (!kw) return topups;
    return topups.filter(
      (t) =>
        (t.trade_no && t.trade_no.toLowerCase().includes(kw)) ||
        (t.payment_method && t.payment_method.toLowerCase().includes(kw)) ||
        (PAYMENT_METHOD_MAP[t.payment_method] &&
          PAYMENT_METHOD_MAP[t.payment_method].toLowerCase().includes(kw)),
    );
  }, [topups, searchKeyword]);

  const selectedAmount = useMemo(() => {
    return topups
      .filter((t) => selectedIds.includes(t.id))
      .reduce((sum, t) => sum + t.money, 0);
  }, [topups, selectedIds]);

  const handleRowSelect = (id, checked) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((x) => x !== id),
    );
  };

  const handleSelectAll = (checked) => {
    if (checked) {
      const filteredIds = filteredTopups.map((t) => t.id);
      setSelectedIds((prev) => [...new Set([...prev, ...filteredIds])]);
    } else {
      const filteredIds = new Set(filteredTopups.map((t) => t.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    }
  };

  const handleSubmit = async () => {
    if (selectedIds.length === 0) {
      Toast.warning(t('请选择至少一条充值记录'));
      return;
    }
    if (selectedAmount < MIN_AMOUNT) {
      Toast.warning(
        t('开票金额不足 {{min}} 元（当前 {{current}} 元）', {
          min: MIN_AMOUNT,
          current: selectedAmount.toFixed(2),
        }),
      );
      return;
    }

    let values;
    try {
      values = await formApi.current.validate();
    } catch {
      return;
    }

    if (!confirmInvoiceInfo) {
      Toast.warning(t('请先二次核对并确认开票信息与税号无误'));
      return;
    }

    const normalizedTitle = values.title.trim();
    const normalizedTaxId = (values.tax_id || '').trim();
    const normalizedEmail = values.email.trim();
    if (values.title_type === 'enterprise' && !normalizedTaxId) {
      Toast.warning(t('企业抬头必须填写税号'));
      return;
    }

    setSubmitting(true);
    try {
      const res = await API.post('/api/user/invoice', {
        topup_ids: selectedIds,
        title: normalizedTitle,
        tax_id: normalizedTaxId,
        email: normalizedEmail,
      });
      if (res.data.success === true) {
        Toast.success(t('发票申请提交成功'));
        onSuccess?.();
        onClose();
      } else {
        Toast.error(res.data.data || t('提交失败，请稍后重试'));
      }
    } catch {
      Toast.error(t('提交失败，请稍后重试'));
    } finally {
      setSubmitting(false);
    }
  };

  const allSelected =
    filteredTopups.length > 0 &&
    filteredTopups.every((t) => selectedIds.includes(t.id));

  const columns = [
    {
      title: (
        <Checkbox
          checked={allSelected}
          indeterminate={
            filteredTopups.some((t) => selectedIds.includes(t.id)) && !allSelected
          }
          onChange={(e) => handleSelectAll(e.target.checked)}
        />
      ),
      dataIndex: 'id',
      key: 'check',
      width: 48,
      render: (id) => (
        <Checkbox
          checked={selectedIds.includes(id)}
          onChange={(e) => handleRowSelect(id, e.target.checked)}
        />
      ),
    },
    {
      title: t('充值时间'),
      dataIndex: 'complete_time',
      key: 'complete_time',
      render: (v) => timestamp2string(v),
    },
    {
      title: t('支付方式'),
      dataIndex: 'payment_method',
      key: 'payment_method',
      render: (v) => PAYMENT_METHOD_MAP[v] || v,
    },
    {
      title: t('金额（元）'),
      dataIndex: 'money',
      key: 'money',
      render: (v) => <Text strong>¥{Number(v).toFixed(2)}</Text>,
    },
    {
      title: t('订单号'),
      dataIndex: 'trade_no',
      key: 'trade_no',
      render: (v) => (
        <Text
          ellipsis={{ showTooltip: true }}
          style={{ maxWidth: 160 }}
          copyable
        >
          {v}
        </Text>
      ),
    },
  ];

  return (
    <Modal
      title={t('申请开票')}
      visible={visible}
      onCancel={onClose}
      onOk={handleSubmit}
      okText={t('提交申请')}
      cancelText={t('取消')}
      confirmLoading={submitting}
      width={720}
      style={{ maxWidth: '95vw' }}
    >
      <Spin spinning={loading}>
        {topups.length === 0 && !loading ? (
          <Banner
            type='info'
            description={t('暂无可开票的充值记录（充值成功且未开票）')}
          />
        ) : (
          <>
            <Banner
              type='warning'
              description={t(
                '发票最低开票金额为 {{min}} 元，请勾选要开票的充值记录。企业抬头必须填写税号。',
                { min: MIN_AMOUNT },
              )}
              style={{ marginBottom: 12 }}
            />
            <Input
              prefix={<IconSearch />}
              placeholder={t('搜索订单号或支付方式')}
              value={searchKeyword}
              onChange={setSearchKeyword}
              showClear
              style={{ marginBottom: 10 }}
            />
            <Table
              columns={columns}
              dataSource={filteredTopups}
              rowKey='id'
              pagination={false}
              size='small'
              scroll={{ y: 240 }}
            />
            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                background: 'var(--semi-color-fill-0)',
                borderRadius: 6,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <Text type='tertiary'>
                {t('已选 {{count}} 条', { count: selectedIds.length })}
              </Text>
              <Text strong style={{ fontSize: 16 }}>
                {t('合计')}：
                <span
                  style={{
                    color:
                      selectedAmount >= MIN_AMOUNT
                        ? 'var(--semi-color-success)'
                        : 'var(--semi-color-danger)',
                  }}
                >
                  ¥{selectedAmount.toFixed(2)}
                </span>
              </Text>
            </div>
          </>
        )}

        <Form
          getFormApi={(api) => (formApi.current = api)}
          style={{ marginTop: 20 }}
          layout='vertical'
          onValueChange={(values) => {
            setFormValues({
              title_type: values.title_type || 'personal',
              title: values.title || '',
              tax_id: values.tax_id || '',
              email: values.email || '',
            });
            if (confirmInvoiceInfo) {
              setConfirmInvoiceInfo(false);
            }
          }}
        >
          <Form.Select
            field='title_type'
            label={t('发票抬头类型')}
            initValue='personal'
            rules={[{ required: true, message: t('请选择抬头类型') }]}
          >
            <Option value='personal'>{t('个人')}</Option>
            <Option value='enterprise'>{t('企业')}</Option>
          </Form.Select>
          <Form.Input
            field='title'
            label={t('发票抬头')}
            placeholder={t('请输入发票抬头（个人姓名或企业名称）')}
            rules={[{ required: true, message: t('请输入发票抬头') }]}
          />
          <Form.Input
            field='tax_id'
            label={t('税号（企业抬头必填）')}
            placeholder={t('企业纳税人识别号，个人开票可不填')}
          />
          <Form.Input
            field='email'
            label={t('接收邮箱')}
            placeholder={t('发票将发送至此邮箱')}
            rules={[
              { required: true, message: t('请输入邮箱') },
              { type: 'email', message: t('请输入有效的邮箱地址') },
            ]}
          />
        </Form>

        <div
          style={{
            marginTop: 16,
            padding: '12px',
            background: 'var(--semi-color-warning-light-default)',
            border: '1px solid var(--semi-color-warning-light-hover)',
            borderRadius: 6,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 8 }}>
            {t('提交前请二次核对开票信息')}
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 10 }}>
            <div>
              {t('发票抬头')}：
              {formValues.title.trim() || t('未填写')}
            </div>
            <div>
              {t('税号')}：
              {formValues.title_type === 'personal'
                ? t('个人抬头可不填')
                : (formValues.tax_id.trim() || t('未填写'))}
            </div>
            <div>
              {t('开票金额')}：¥{selectedAmount.toFixed(2)}
            </div>
          </div>
          <Checkbox
            checked={confirmInvoiceInfo}
            onChange={(e) => setConfirmInvoiceInfo(e.target.checked)}
          >
            {t('我已二次核对发票抬头、税号和开票金额，确认信息无误')}
          </Checkbox>
        </div>
      </Spin>
    </Modal>
  );
};

export default InvoiceRequestModal;
