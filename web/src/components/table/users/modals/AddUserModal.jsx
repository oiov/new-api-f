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

import React, { useState, useRef } from 'react';
import { API, showError, showSuccess } from '../../../../helpers';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import {
  Button,
  SideSheet,
  Space,
  Spin,
  Typography,
  Card,
  Tag,
  Avatar,
  Form,
  Row,
  Col,
  Banner,
} from '@douyinfe/semi-ui';
import { IconSave, IconClose, IconUserAdd } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { getUserData } from '../../../../helpers/data';
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

const AddUserModal = (props) => {
  const { t } = useTranslation();
  const formApiRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();
  const currentUser = getUserData();
  const canManageRole = currentUser?.role === 100;

  const getInitValues = () => ({
    username: '',
    display_name: '',
    password: '',
    remark: '',
    role: 1,
    permission_template: 'custom',
    permission_points: [],
  });

  const roleOptions = [
    { label: t('普通用户'), value: 1 },
    { label: t('管理员'), value: 10 },
  ];

  const permissionTemplateOptions = [
    ...PERMISSION_TEMPLATE_OPTIONS.map((item) => ({
      label: t(item.label),
      value: item.value,
    })),
    { label: t('自定义权限'), value: 'custom' },
  ];

  const submit = async (values) => {
    setLoading(true);
    const payload = { ...values };
    if (canManageRole && Number(payload.role) === 10) {
      payload.permissions_json = JSON.stringify(
        normalizePermissionPoints(payload.permission_points),
      );
    } else {
      payload.permissions_json = '';
      payload.role = 1;
    }
    delete payload.permission_template;
    delete payload.permission_points;
    const res = await API.post(`/api/user/`, payload);
    const { success, message } = res.data;
    if (success) {
      showSuccess(t('用户账户创建成功！'));
      formApiRef.current?.setValues(getInitValues());
      props.refresh();
      props.handleClose();
    } else {
      showError(message);
    }
    setLoading(false);
  };

  const handleCancel = () => {
    props.handleClose();
  };

  return (
    <>
      <SideSheet
        placement={'left'}
        title={
          <Space>
            <Tag color='green' shape='circle'>
              {t('新建')}
            </Tag>
            <Title heading={4} className='m-0'>
              {t('添加用户')}
            </Title>
          </Space>
        }
        bodyStyle={{ padding: '0' }}
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
        onCancel={() => handleCancel()}
      >
        <Spin spinning={loading}>
          <Form
            initValues={getInitValues()}
            getFormApi={(api) => (formApiRef.current = api)}
            onSubmit={submit}
            onSubmitFail={(errs) => {
              const first = Object.values(errs)[0];
              if (first) showError(Array.isArray(first) ? first[0] : first);
              formApiRef.current?.scrollToError();
            }}
          >
            {({ values }) => (
              <div className='p-2'>
                <Card className='!rounded-2xl shadow-sm border-0'>
                  <div className='flex items-center mb-2'>
                    <Avatar
                      size='small'
                      color='blue'
                      className='mr-2 shadow-md'
                    >
                      <IconUserAdd size={16} />
                    </Avatar>
                    <div>
                      <Text className='text-lg font-medium'>
                        {t('用户信息')}
                      </Text>
                      <div className='text-xs text-gray-600'>
                        {t('创建新用户账户')}
                      </div>
                    </div>
                  </div>

                  <Row gutter={12}>
                    <Col span={24}>
                      <Form.Input
                        field='username'
                        label={t('用户名')}
                        placeholder={t('请输入用户名')}
                        rules={[{ required: true, message: t('请输入用户名') }]}
                        showClear
                      />
                    </Col>
                    <Col span={24}>
                      <Form.Input
                        field='display_name'
                        label={t('显示名称')}
                        placeholder={t('请输入显示名称')}
                        showClear
                      />
                    </Col>
                    <Col span={24}>
                      <Form.Input
                        field='password'
                        label={t('密码')}
                        type='password'
                        placeholder={t('请输入密码')}
                        rules={[{ required: true, message: t('请输入密码') }]}
                        showClear
                      />
                    </Col>
                    {canManageRole && (
                      <Col span={24}>
                        <Form.Select
                          field='role'
                          label={t('角色')}
                          optionList={roleOptions}
                          rules={[{ required: true, message: t('请选择角色') }]}
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

                {canManageRole && Number(values?.role) === 10 && (
                  <Card className='!rounded-2xl shadow-sm border-0 mt-3'>
                    <div className='flex items-center mb-2'>
                      <Avatar
                        size='small'
                        color='orange'
                        className='mr-2 shadow-md'
                      >
                        <IconUserAdd size={16} />
                      </Avatar>
                      <div>
                        <Text className='text-lg font-medium'>
                          {t('管理员权限')}
                        </Text>
                        <div className='text-xs text-gray-600'>
                          {t('为管理员选择模板或自定义权限点')}
                        </div>
                      </div>
                    </div>
                    <Banner
                      type='info'
                      className='!rounded-xl mb-3'
                      description={t(
                        '模板会覆盖下方权限点，自定义调整后会自动切换为“自定义权限”。',
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
                            const normalized = normalizePermissionPoints(value);
                            formApiRef.current?.setValue(
                              'permission_template',
                              detectPermissionTemplate(normalized),
                            );
                            formApiRef.current?.setValue(
                              'permission_points',
                              normalized.filter((point) =>
                                ALL_PERMISSION_POINTS.includes(point),
                              ),
                            );
                          }}
                        />
                      </Col>
                    </Row>
                  </Card>
                )}
              </div>
            )}
          </Form>
        </Spin>
      </SideSheet>
    </>
  );
};

export default AddUserModal;
