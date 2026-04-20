import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Empty,
  Spin,
  Tag,
  TextArea,
  Typography,
} from '@douyinfe/semi-ui';
import { API, resolveRequestUrl, showError, showSuccess } from '../../helpers';
import './index.css';

const { Title, Text } = Typography;

function buildMailAssistantWSURL() {
  const resolvedUrl =
    resolveRequestUrl('/api/user/mail_assistant/ws') ||
    '/api/user/mail_assistant/ws';
  const absoluteUrl = /^https?:\/\//i.test(resolvedUrl)
    ? resolvedUrl
    : `${window.location.origin}${resolvedUrl}`;
  return absoluteUrl.replace(/^http:/i, 'ws:').replace(/^https:/i, 'wss:');
}

const MailAssistantPage = () => {
  const { t } = useTranslation();
  const [importText, setImportText] = useState('');
  const [snapshot, setSnapshot] = useState({
    accounts: [],
    account_count: 0,
    message_count: 0,
    updated_at_text: '',
  });
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState('');
  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const unmountedRef = useRef(false);

  const accounts = snapshot?.accounts || [];

  const sortedAccounts = useMemo(
    () => [...accounts].sort((a, b) => a.email.localeCompare(b.email)),
    [accounts],
  );

  const loadSnapshot = async () => {
    try {
      setLoading(true);
      const res = await API.get('/api/user/mail_assistant');
      const { success, data } = res.data;
      if (!success) {
        showError(res.data.message || t('加载失败'));
        return;
      }
      setSnapshot(data);
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  const connectWS = () => {
    if (reconnectTimerRef.current) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
    const ws = new WebSocket(buildMailAssistantWSURL());
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type === 'snapshot' && payload?.data) {
          setSnapshot(payload.data);
          setLoading(false);
        }
      } catch (error) {
        console.error('mail assistant ws parse error', error);
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      if (unmountedRef.current) {
        return;
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        if (!unmountedRef.current && wsRef.current === null) {
          connectWS();
        }
      }, 3000);
    };
  };

  useEffect(() => {
    unmountedRef.current = false;
    loadSnapshot();
    connectWS();
    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const handleImport = async () => {
    if (!importText.trim()) {
      showError(t('请输入邮箱导入内容'));
      return;
    }
    try {
      setImporting(true);
      const res = await API.post('/api/user/mail_assistant/import', {
        content: importText,
      });
      if (!res.data.success) {
        showError(res.data.message || t('导入失败'));
        return;
      }
      setSnapshot(res.data.data);
      showSuccess(t('邮箱导入成功'));
    } catch (error) {
      showError(error);
    } finally {
      setImporting(false);
    }
  };

  const handlePullAll = async () => {
    try {
      setPulling(true);
      const res = await API.post('/api/user/mail_assistant/pull');
      if (!res.data.success) {
        showError(res.data.message || t('收件失败'));
        return;
      }
      setSnapshot(res.data.data);
      showSuccess(t('已执行手动收件'));
    } catch (error) {
      showError(error);
    } finally {
      setPulling(false);
    }
  };

  const handlePullAccount = async (accountId) => {
    try {
      setActiveAccountId(accountId);
      const res = await API.post(
        `/api/user/mail_assistant/accounts/${accountId}/pull`,
      );
      if (!res.data.success) {
        showError(res.data.message || t('收件失败'));
        return;
      }
      setSnapshot(res.data.data);
      showSuccess(t('已执行单个邮箱收件'));
    } catch (error) {
      showError(error);
    } finally {
      setActiveAccountId('');
    }
  };

  return (
    <div className='mail-assistant-page'>
      <section className='mail-assistant-hero'>
        <div>
          <div className='mail-assistant-badge'>{t('花火邮箱助手')}</div>
          <Title heading={2} className='mail-assistant-title'>
            {t('Outlook OAuth2 实时收件台')}
          </Title>
          <Text className='mail-assistant-subtitle'>
            {t(
              '导入 邮箱----密码----客户端IP----refresh_token 格式后，页面会自动轮询收件，并通过 WebSocket 实时刷新邮件列表。',
            )}
          </Text>
        </div>
        <div className='mail-assistant-stats'>
          <div className='mail-assistant-stat-card'>
            <span>{t('邮箱数量')}</span>
            <strong>{snapshot?.account_count || 0}</strong>
          </div>
          <div className='mail-assistant-stat-card'>
            <span>{t('邮件数量')}</span>
            <strong>{snapshot?.message_count || 0}</strong>
          </div>
          <div className='mail-assistant-stat-card'>
            <span>{t('最近刷新')}</span>
            <strong>{snapshot?.updated_at_text || '--'}</strong>
          </div>
        </div>
      </section>

      <section className='mail-assistant-toolbar'>
        <div className='mail-assistant-import-card'>
          <div className='mail-assistant-card-head'>
            <Title heading={5}>{t('导入邮箱')}</Title>
            <Text>{t('每行一条，四段使用 ---- 分隔')}</Text>
          </div>
          <TextArea
            autosize={{ minRows: 6, maxRows: 14 }}
            value={importText}
            onChange={setImportText}
            placeholder='demo@outlook.com----password----127.0.0.1----refresh_token'
            className='mail-assistant-import-textarea'
          />
          <div className='mail-assistant-actions'>
            <Button theme='solid' loading={importing} onClick={handleImport}>
              {t('导入并开始收件')}
            </Button>
            <Button loading={pulling} onClick={handlePullAll}>
              {t('手动收件')}
            </Button>
          </div>
        </div>
      </section>

      <section className='mail-assistant-content'>
        {loading ? (
          <div className='mail-assistant-loading'>
            <Spin size='large' />
          </div>
        ) : sortedAccounts.length === 0 ? (
          <div className='mail-assistant-empty'>
            <Empty description={t('还没有导入邮箱')} />
          </div>
        ) : (
          <div className='mail-assistant-account-grid'>
            {sortedAccounts.map((account) => (
              <article key={account.id} className='mail-assistant-account-card'>
                <div className='mail-assistant-account-head'>
                  <div>
                    <Title heading={5} className='mail-assistant-account-title'>
                      {account.email}
                    </Title>
                    <Text>{account.client_ip || '--'}</Text>
                  </div>
                  <Tag color='light-blue'>
                    {account.status || t('未知状态')}
                  </Tag>
                </div>
                <div className='mail-assistant-account-meta'>
                  <span>
                    {t('最近收件')}：{account.last_sync_at_text || '--'}
                  </span>
                  <span>
                    {t('邮件')}：{account.message_count || 0}
                  </span>
                </div>
                {account.last_error ? (
                  <div className='mail-assistant-error'>
                    {account.last_error}
                  </div>
                ) : null}
                <div className='mail-assistant-account-actions'>
                  <Button
                    size='small'
                    loading={activeAccountId === account.id}
                    onClick={() => handlePullAccount(account.id)}
                  >
                    {t('手动收这个邮箱')}
                  </Button>
                </div>
                <div className='mail-assistant-message-list'>
                  {(account.messages || []).length === 0 ? (
                    <Empty
                      image={null}
                      description={t('当前暂无邮件')}
                      className='mail-assistant-message-empty'
                    />
                  ) : (
                    account.messages.map((message) => (
                      <div
                        key={message.id}
                        className='mail-assistant-message-item'
                      >
                        <div className='mail-assistant-message-top'>
                          <Tag>{message.folder}</Tag>
                          <span>{message.received_at_s || message.date}</span>
                        </div>
                        <div className='mail-assistant-message-subject'>
                          {message.subject}
                        </div>
                        <div className='mail-assistant-message-from'>
                          {message.from}
                        </div>
                        <div className='mail-assistant-message-preview'>
                          {message.preview || t('无正文预览')}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default MailAssistantPage;
