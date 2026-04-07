import React, { useEffect, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Form,
  Select,
  Spin,
  Typography,
} from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess, compareObjects } from '../../helpers';

const { Title, Text } = Typography;

const StorageSetting = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inputs, setInputs] = useState({
    StorageBackend: 'local',
    StorageR2Endpoint: '',
    StorageR2Bucket: '',
    StorageR2Region: 'auto',
    StorageR2AccessKey: '',
    StorageR2SecretKey: '',
    StorageR2PublicURL: '',
  });
  const [inputsRow, setInputsRow] = useState(inputs);

  const getOptions = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/option/');
      const { success, data } = res.data;
      if (success) {
        const newInputs = { ...inputs };
        data.forEach((item) => {
          if (item.key in newInputs) {
            newInputs[item.key] = item.value;
          }
        });
        setInputs(newInputs);
        setInputsRow({ ...newInputs });
      }
    } catch {
      showError(t('获取设置失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    getOptions();
  }, []);

  const handleSave = async () => {
    const updateArray = compareObjects(inputs, inputsRow);
    if (!updateArray.length) {
      showError(t('你似乎并没有修改什么'));
      return;
    }
    setSaving(true);
    try {
      const requests = updateArray.map((item) =>
        API.put('/api/option/', { key: item.key, value: inputs[item.key] }),
      );
      await Promise.all(requests);
      showSuccess(t('保存成功'));
      setInputsRow({ ...inputs });
    } catch {
      showError(t('保存失败，请重试'));
    } finally {
      setSaving(false);
    }
  };

  const isR2 = inputs.StorageBackend === 'r2';

  return (
    <Spin spinning={loading}>
      <Card style={{ marginBottom: 16 }}>
        <Title heading={6} style={{ marginBottom: 16 }}>
          {t('存储设置')}
        </Title>

        <Banner
          type='info'
          description={t(
            '本地存储将文件保存在服务器 data/uploads 目录，通过 /uploads/* 路径访问。' +
            'Cloudflare R2 / S3 兼容存储适合多节点或独立前端部署场景。',
          )}
          style={{ marginBottom: 20 }}
        />

        <Form layout='vertical'>
          <Form.Select
            field='StorageBackend'
            label={t('存储后端')}
            value={inputs.StorageBackend}
            onChange={(v) => setInputs((p) => ({ ...p, StorageBackend: v }))}
            style={{ width: 200 }}
          >
            <Select.Option value='local'>{t('本地存储（默认）')}</Select.Option>
            <Select.Option value='r2'>{t('Cloudflare R2 / S3 兼容')}</Select.Option>
          </Form.Select>

          {isR2 && (
            <>
              <Form.Input
                field='StorageR2Endpoint'
                label={t('Endpoint（存储桶 API 地址）')}
                placeholder='https://ACCOUNT_ID.r2.cloudflarestorage.com'
                value={inputs.StorageR2Endpoint}
                onChange={(v) => setInputs((p) => ({ ...p, StorageR2Endpoint: v }))}
              />
              <Form.Input
                field='StorageR2Bucket'
                label={t('存储桶名称（Bucket）')}
                placeholder='my-invoice-bucket'
                value={inputs.StorageR2Bucket}
                onChange={(v) => setInputs((p) => ({ ...p, StorageR2Bucket: v }))}
              />
              <Form.Input
                field='StorageR2Region'
                label={t('区域（Region）')}
                placeholder='auto'
                value={inputs.StorageR2Region}
                onChange={(v) => setInputs((p) => ({ ...p, StorageR2Region: v }))}
              />
              <Form.Input
                field='StorageR2AccessKey'
                label={t('Access Key ID')}
                placeholder='R2 API Token Access Key'
                value={inputs.StorageR2AccessKey}
                onChange={(v) => setInputs((p) => ({ ...p, StorageR2AccessKey: v }))}
              />
              <Form.Input
                field='StorageR2SecretKey'
                label={t('Secret Access Key')}
                placeholder='R2 API Token Secret Key'
                mode='password'
                value={inputs.StorageR2SecretKey}
                onChange={(v) => setInputs((p) => ({ ...p, StorageR2SecretKey: v }))}
              />
              <Form.Input
                field='StorageR2PublicURL'
                label={t('公开访问 URL 前缀（可选）')}
                placeholder='https://files.example.com'
                value={inputs.StorageR2PublicURL}
                onChange={(v) => setInputs((p) => ({ ...p, StorageR2PublicURL: v }))}
                extraText={t('设置后发票文件 URL 将使用此前缀，否则使用 Endpoint/Bucket 拼接')}
              />
            </>
          )}
        </Form>

        <Button
          type='primary'
          loading={saving}
          onClick={handleSave}
          style={{ marginTop: 16 }}
        >
          {t('保存存储设置')}
        </Button>
      </Card>
    </Spin>
  );
};

export default StorageSetting;
