import React, { useEffect, useState } from 'react';
import { Button, Form, Modal } from '@douyinfe/semi-ui';
import { API, showError, showSuccess } from '../../../../helpers';

const LEVEL_OPTIONS = ['info', 'success', 'warning', 'danger'];

export default function SendSiteNotificationModal({
  visible,
  onCancel,
  user,
  onSuccess,
  t,
}) {
  const [formApi, setFormApi] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible || !formApi) {
      return;
    }
    formApi.setValues({
      title: '',
      content: '',
      level: 'info',
      send_email: false,
    });
  }, [formApi, visible]);

  const handleSubmit = async () => {
    if (!formApi || !user?.id) {
      return;
    }
    try {
      const values = await formApi.validate();
      setLoading(true);
      const res = await API.post('/api/user/notifications/send', {
        user_id: user.id,
        title: values.title,
        content: values.content,
        level: values.level,
        send_email: values.send_email === true,
      });
      if (res.data.success) {
        showSuccess(t('站内信发送成功'));
        onSuccess?.();
      } else {
        showError(res.data.message);
      }
    } catch (error) {
      if (error?.message) {
        showError(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title={t('发送站内信')}
      visible={visible}
      onCancel={onCancel}
      footer={null}
      width={560}
    >
      <div className='mb-3 text-sm text-gray-600'>
        {user?.username
          ? t('目标用户：{{username}}（#{{id}}）', {
              username: user.username,
              id: user.id,
            })
          : '-'}
      </div>
      <Form getFormApi={setFormApi}>
        <Form.Input
          field='title'
          label={t('标题')}
          placeholder={t('请输入消息标题')}
          rules={[{ required: true, message: t('请输入消息标题') }]}
          maxLength={255}
          showClear
        />
        <Form.Select
          field='level'
          label={t('消息级别')}
          initValue='info'
          optionList={LEVEL_OPTIONS.map((level) => ({
            label:
              level === 'success'
                ? t('成功')
                : level === 'warning'
                  ? t('警告')
                  : level === 'danger'
                    ? t('重要')
                    : t('普通'),
            value: level,
          }))}
        />
        <Form.Switch
          field='send_email'
          label={t('同时发送邮件')}
          checkedText={t('开')}
          uncheckedText={t('关')}
          extraText={t('仅当用户已绑定邮箱时才会尝试发送，不影响站内信入箱')}
        />
        <Form.TextArea
          field='content'
          label={t('消息内容')}
          placeholder={t('请输入消息内容，支持 Markdown / HTML 文本')}
          autosize={{ minRows: 6, maxRows: 12 }}
          maxLength={5000}
          rules={[{ required: true, message: t('请输入消息内容') }]}
        />
      </Form>
      <div className='mt-4 flex justify-end gap-2'>
        <Button onClick={onCancel}>{t('取消')}</Button>
        <Button theme='solid' loading={loading} onClick={handleSubmit}>
          {t('发送')}
        </Button>
      </div>
    </Modal>
  );
}
