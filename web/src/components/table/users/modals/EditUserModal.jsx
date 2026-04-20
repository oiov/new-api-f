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

import React, { useEffect, useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  API,
  buildGroupOptions,
  showError,
  showSuccess,
  renderQuota,
  renderGroupOption,
  renderQuotaWithPrompt,
  getCurrencyConfig,
  getUserData,
} from '../../../../helpers';
import {
  quotaToDisplayAmount,
  displayAmountToQuota,
} from '../../../../helpers/quota';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import {
  Button,
  Modal,
  SideSheet,
  Space,
  Spin,
  Typography,
  Card,
  Tag,
  Form,
  Avatar,
  Row,
  Col,
  InputNumber,
  Banner,
} from '@douyinfe/semi-ui';
import {
  IconUser,
  IconSave,
  IconClose,
  IconLink,
  IconUserGroup,
  IconPlus,
  IconShield,
} from '@douyinfe/semi-icons';
import UserBindingManagementModal from './UserBindingManagementModal';
import {
  ALL_PERMISSION_POINTS,
  PERMISSION_GROUPS,
  PERMISSION_TEMPLATES,
  PERMISSION_TEMPLATE_OPTIONS,
} from '../../../../constants/permission.constants';

const { Text, Title } = Typography;

const normalizePermissionPoints = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(value.filter((item) => typeof item === 'string' && item)),
  ].sort();
};

const parsePermissionPoints = (raw) => {
  if (!raw || typeof raw !== 'string') {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return normalizePermissionPoints(parsed);
    }
    if (parsed && typeof parsed === 'object') {
      return normalizePermissionPoints(
        Object.keys(parsed).filter((key) => parsed[key] === true),
      );
    }
  } catch (error) {
    return [];
  }
  return [];
};

const detectPermissionTemplate = (permissionPoints) => {
  const normalized = normalizePermissionPoints(permissionPoints);
  return (
    Object.entries(PERMISSION_TEMPLATES).find(([, templatePoints]) => {
      const template = normalizePermissionPoints(templatePoints);
      return (
        template.length === normalized.length &&
        template.every((point, index) => point === normalized[index])
      );
    })?.[0] || 'custom'
  );
};

const EditUserModal = (props) => {
  const { t } = useTranslation();
  const userId = props.editingUser.id;
  const [loading, setLoading] = useState(true);
  const [addQuotaModalOpen, setIsModalOpen] = useState(false);
  const [addQuotaLocal, setAddQuotaLocal] = useState('');
  const [addAmountLocal, setAddAmountLocal] = useState('');
  const isMobile = useIsMobile();
  const [groupOptions, setGroupOptions] = useState([]);
  const [bindingModalVisible, setBindingModalVisible] = useState(false);
  const formApiRef = useRef(null);
  const currentUser = getUserData();
  const canManageRole = currentUser?.role === 100;

  const isEdit = Boolean(userId);

  const getInitValues = () => ({
    username: '',
    display_name: '',
    password: '',
    github_id: '',
    oidc_id: '',
    discord_id: '',
    wechat_id: '',
    telegram_id: '',
    linux_do_id: '',
    email: '',
    quota: 0,
    group: 'default',
    remark: '',
    role: 1,
    status: 1,
    permissions_json: '',
    permission_template: 'custom',
    permission_points: [],
  });

  const roleOptions = [
    { label: t('普通用户'), value: 1 },
    { label: t('管理员'), value: 10 },
  ];

  const statusOptions = [
    { label: t('已启用'), value: 1 },
    { label: t('已禁用'), value: 2 },
    { label: t('已封禁'), value: 3 },
  ];

  const permissionTemplateOptions = [
    ...PERMISSION_TEMPLATE_OPTIONS.map((item) => ({
      label: t(item.label),
      value: item.value,
    })),
    { label: t('自定义权限'), value: 'custom' },
  ];

  const fetchGroups = async () => {
    try {
      let res = await API.get(`/api/group/`);
      setGroupOptions(buildGroupOptions(res.data.data));
    } catch (e) {
      showError(e.message);
    }
  };

  const handleCancel = () => props.handleClose();

  const loadUser = async () => {
    setLoading(true);
    const url = userId ? `/api/user/${userId}` : `/api/user/self`;
    const res = await API.get(url);
    const { success, message, data } = res.data;
    if (success) {
      data.password = '';
      const permissionPoints = parsePermissionPoints(data.permissions_json);
      formApiRef.current?.setValues({
        ...getInitValues(),
        ...data,
        permission_points: permissionPoints,
        permission_template: detectPermissionTemplate(permissionPoints),
      });
    } else {
      showError(message);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUser();
    if (userId) fetchGroups();
    setBindingModalVisible(false);
  }, [props.editingUser.id]);

  const openBindingModal = () => {
    setBindingModalVisible(true);
  };

  const closeBindingModal = () => {
    setBindingModalVisible(false);
  };

  /* ----------------------- submit ----------------------- */
  const submit = async (values) => {
    setLoading(true);
    let payload = { ...values };
    if (typeof payload.quota === 'string')
      payload.quota = parseInt(payload.quota) || 0;
    if (canManageRole && Number(payload.role) === 10) {
      payload.permissions_json = JSON.stringify(
        normalizePermissionPoints(payload.permission_points),
      );
    } else {
      payload.permissions_json = '';
    }
    delete payload.permission_template;
    delete payload.permission_points;
    if (userId) {
      payload.id = parseInt(userId);
    }
    const url = userId ? `/api/user/` : `/api/user/self`;
    const res = await API.put(url, payload);
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('用户信息更新成功！'));
      props.refresh();
      props.handleClose();
    } else {
      showError(message);
    }
    setLoading(false);
  };

  /* --------------------- quota helper -------------------- */
  const addLocalQuota = () => {
    const current = parseInt(formApiRef.current?.getValue('quota') || 0);
    const delta = parseInt(addQuotaLocal) || 0;
    formApiRef.current?.setValue('quota', current + delta);
  };

  /* --------------------------- UI --------------------------- */
  return (
    <>
      <SideSheet
        placement='right'
        title={
          <Space>
            <Tag color='blue' shape='circle'>
              {t(isEdit ? '编辑' : '新建')}
            </Tag>
            <Title heading={4} className='m-0'>
              {isEdit ? t('编辑用户') : t('创建用户')}
            </Title>
          </Space>
        }
        bodyStyle={{ padding: 0 }}
        visible={props.visible}
        width={isMobile ? '100%' : 600}
        footer={
          <div className='flex justify-end bg-white'>
            <Space>
              <Button
                theme='solid'
                onClick={() => formApiRef.current?.submitForm()}
                icon={<IconSave />}
                loading={loading}
              >
                {t('提交')}
              </Button>
              <Button
                theme='light'
                type='primary'
                onClick={handleCancel}
                icon={<IconClose />}
              >
                {t('取消')}
              </Button>
            </Space>
          </div>
        }
        closeIcon={null}
        onCancel={handleCancel}
      >
        <Spin spinning={loading}>
          <Form
            initValues={getInitValues()}
            getFormApi={(api) => (formApiRef.current = api)}
            onSubmit={submit}
          >
            {({ values }) => (
              <div className='p-2 space-y-3'>
                {/* 基本信息 */}
                <Card className='!rounded-2xl shadow-sm border-0'>
                  <div className='flex items-center mb-2'>
                    <Avatar
                      size='small'
                      color='blue'
                      className='mr-2 shadow-md'
                    >
                      <IconUser size={16} />
                    </Avatar>
                    <div>
                      <Text className='text-lg font-medium'>
                        {t('基本信息')}
                      </Text>
                      <div className='text-xs text-gray-600'>
                        {t('用户的基本账户信息')}
                      </div>
                    </div>
                  </div>

                  <Row gutter={12}>
                    <Col span={24}>
                      <Form.Input
                        field='username'
                        label={t('用户名')}
                        placeholder={t('请输入新的用户名')}
                        rules={[{ required: true, message: t('请输入用户名') }]}
                        showClear
                      />
                    </Col>

                    <Col span={24}>
                      <Form.Input
                        field='password'
                        label={t('密码')}
                        placeholder={t('请输入新的密码，最短 8 位')}
                        mode='password'
                        showClear
                      />
                    </Col>

                    <Col span={24}>
                      <Form.Input
                        field='display_name'
                        label={t('显示名称')}
                        placeholder={t('请输入新的显示名称')}
                        showClear
                      />
                    </Col>

                    {canManageRole && values.role !== 100 && (
                      <>
                        <Col span={12}>
                          <Form.Select
                            field='role'
                            label={t('角色')}
                            optionList={roleOptions}
                            rules={[
                              { required: true, message: t('请选择角色') },
                            ]}
                            onChange={(value) => {
                              if (value !== 10) {
                                formApiRef.current?.setValues({
                                  permission_template: 'custom',
                                  permission_points: [],
                                });
                              }
                            }}
                          />
                        </Col>
                        <Col span={12}>
                          <Form.Select
                            field='status'
                            label={t('状态')}
                            optionList={statusOptions}
                            rules={[
                              { required: true, message: t('请选择状态') },
                            ]}
                          />
                        </Col>
                      </>
                    )}

                    <Col span={24}>
                      <Form.Input
                        field='remark'
                        label={t('备注')}
                        placeholder={t('请输入备注（仅管理员可见）')}
                        showClear
                      />
                    </Col>
                  </Row>
                </Card>

                {canManageRole && values.role === 10 && (
                  <Card className='!rounded-2xl shadow-sm border-0'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='orange'
                        className='mr-2 shadow-md'
                      >
                        <IconShield size={16} />
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('管理员权限')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('选择角色模板或精细化权限点')}
                        </div>
                      </div>
                    </div>
                    <Banner
                      type='info'
                      className='!rounded-xl mb-3'
                      description={t(
                        '模板会覆盖当前权限点；手动勾选权限后会自动切换为“自定义权限”。',
                      )}
                    />
                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Select
                          field='permission_template'
                          label={t('权限模板')}
                          optionList={permissionTemplateOptions}
                          onChange={(value) => {
                            if (value && value !== 'custom') {
                              formApiRef.current?.setValues({
                                permission_template: value,
                                permission_points:
                                  PERMISSION_TEMPLATES[value] || [],
                              });
                            }
                          }}
                        />
                      </Col>
                      <Col span={24}>
                        <Form.Select
                          field='permission_points'
                          label={t('权限点')}
                          multiple
                          search
                          optionList={PERMISSION_GROUPS.flatMap((group) =>
                            group.options.map((option) => ({
                              label: `${t(group.title)} / ${t(option.label)}`,
                              value: option.value,
                            })),
                          )}
                          onChange={(value) => {
                            const normalized = normalizePermissionPoints(
                              value,
                            ).filter((point) =>
                              ALL_PERMISSION_POINTS.includes(point),
                            );
                            formApiRef.current?.setValue(
                              'permission_points',
                              normalized,
                            );
                            formApiRef.current?.setValue(
                              'permission_template',
                              detectPermissionTemplate(normalized),
                            );
                          }}
                        />
                      </Col>
                    </Row>
                  </Card>
                )}

                {/* 权限设置 */}
                {userId && (
                  <Card className='!rounded-2xl shadow-sm border-0'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='green'
                        className='mr-2 shadow-md'
                      >
                        <IconUserGroup size={16} />
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('权限设置')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('用户分组和额度管理')}
                        </div>
                      </div>
                    </div>

                    <Row gutter={12}>
                      <Col span={24}>
                        <Form.Select
                          field='group'
                          label={t('分组')}
                          placeholder={t('请选择分组')}
                          optionList={groupOptions}
                          renderOptionItem={renderGroupOption}
                          allowAdditions
                          search
                          rules={[{ required: true, message: t('请选择分组') }]}
                        />
                      </Col>

                      <Col span={10}>
                        <Form.InputNumber
                          field='quota'
                          label={t('剩余额度')}
                          placeholder={t('请输入新的剩余额度')}
                          step={500000}
                          extraText={renderQuotaWithPrompt(values.quota || 0)}
                          rules={[{ required: true, message: t('请输入额度') }]}
                          style={{ width: '100%' }}
                        />
                      </Col>

                      <Col span={14}>
                        <Form.Slot label={t('添加额度')}>
                          <Button
                            icon={<IconPlus />}
                            onClick={() => setIsModalOpen(true)}
                          />
                        </Form.Slot>
                      </Col>
                    </Row>
                  </Card>
                )}

                {/* 绑定信息入口 */}
                {userId && (
                  <Card className='!rounded-2xl shadow-sm border-0'>
                    <div className='flex items-center justify-between gap-3'>
                      <div className='flex items-center min-w-0'>
                        <Avatar
                          size='small'
                          color='purple'
                          className='mr-2 shadow-md'
                        >
                          <IconLink size={16} />
                        </Avatar>
                        <div className='min-w-0'>
                          <Text className='text-lg font-medium'>
                            {t('绑定信息')}
                          </Text>
                          <div className='text-xs text-gray-600'>
                            {t('管理用户已绑定的第三方账户，支持筛选与解绑')}
                          </div>
                        </div>
                      </div>
                      <Button
                        type='primary'
                        theme='outline'
                        onClick={openBindingModal}
                      >
                        {t('管理绑定')}
                      </Button>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </Form>
        </Spin>
      </SideSheet>

      <UserBindingManagementModal
        visible={bindingModalVisible}
        onCancel={closeBindingModal}
        userId={userId}
        isMobile={isMobile}
        formApiRef={formApiRef}
      />

      {/* 添加额度模态框 */}
      <Modal
        centered
        visible={addQuotaModalOpen}
        onOk={() => {
          addLocalQuota();
          setIsModalOpen(false);
          setAddQuotaLocal('');
          setAddAmountLocal('');
        }}
        onCancel={() => {
          setIsModalOpen(false);
        }}
        closable={null}
        title={
          <div className='flex items-center'>
            <IconPlus className='mr-2' />
            {t('添加额度')}
          </div>
        }
      >
        <div className='mb-4'>
          {(() => {
            const current = formApiRef.current?.getValue('quota') || 0;
            return (
              <Text type='secondary' className='block mb-2'>
                {`${t('新额度：')}${renderQuota(current)} + ${renderQuota(addQuotaLocal)} = ${renderQuota(current + parseInt(addQuotaLocal || 0))}`}
              </Text>
            );
          })()}
        </div>
        {getCurrencyConfig().type !== 'TOKENS' && (
          <div className='mb-3'>
            <div className='mb-1'>
              <Text size='small'>{t('金额')}</Text>
              <Text size='small' type='tertiary'>
                {' '}
                ({t('仅用于换算，实际保存的是额度')})
              </Text>
            </div>
            <InputNumber
              prefix={getCurrencyConfig().symbol}
              placeholder={t('输入金额')}
              value={addAmountLocal}
              precision={2}
              onChange={(val) => {
                setAddAmountLocal(val);
                setAddQuotaLocal(
                  val != null && val !== ''
                    ? displayAmountToQuota(Math.abs(val)) * Math.sign(val)
                    : '',
                );
              }}
              style={{ width: '100%' }}
              showClear
            />
          </div>
        )}
        <div>
          <div className='mb-1'>
            <Text size='small'>{t('额度')}</Text>
          </div>
          <InputNumber
            placeholder={t('输入额度')}
            value={addQuotaLocal}
            onChange={(val) => {
              setAddQuotaLocal(val);
              setAddAmountLocal(
                val != null && val !== ''
                  ? Number(
                      (
                        quotaToDisplayAmount(Math.abs(val)) * Math.sign(val)
                      ).toFixed(2),
                    )
                  : '',
              );
            }}
            style={{ width: '100%' }}
            showClear
            step={500000}
          />
        </div>
      </Modal>
    </>
  );
};

export default EditUserModal;
