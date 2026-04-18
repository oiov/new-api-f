import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Space, TextArea, Typography } from '@douyinfe/semi-ui';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import 'jit-viewer/style.css';
import { API, openPage, showError, showInfo, showSuccess } from '../../helpers';
import {
  isEditableTextViewerType,
  resolveEditableContentType,
  resolveViewerFileType,
} from './utils';

const { Text, Title } = Typography;
function extractErrorMessage(error, fallbackMessage) {
  const responseData = error?.response?.data;

  if (responseData instanceof ArrayBuffer) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(responseData));
      if (parsed?.message) {
        return parsed.message;
      }
    } catch {
      return fallbackMessage;
    }
  }

  if (typeof responseData === 'string') {
    try {
      const parsed = JSON.parse(responseData);
      if (parsed?.message) {
        return parsed.message;
      }
    } catch {
      return responseData || fallbackMessage;
    }
  }

  if (responseData?.message) {
    return responseData.message;
  }

  return error?.message || fallbackMessage;
}

const R2StoragePreviewPage = () => {
  const { t, i18n } = useTranslation();
  const [searchParams] = useSearchParams();
  const previewContainerRef = useRef(null);
  const previewViewerRef = useRef(null);
  const textRequestIdRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [textLoading, setTextLoading] = useState(false);
  const [textContent, setTextContent] = useState('');
  const [originalTextContent, setOriginalTextContent] = useState('');
  const [textContentType, setTextContentType] = useState('');

  const objectKey = searchParams.get('key') || '';
  const displayName = searchParams.get('name') || objectKey || '-';

  const previewItem = useMemo(
    () => ({
      key: objectKey,
      name: objectKey.split('/').pop() || objectKey,
      extension: '',
      file_type: 'file',
    }),
    [objectKey],
  );

  const viewerFileType = useMemo(
    () => resolveViewerFileType(previewItem),
    [previewItem],
  );
  const editableTextFile = useMemo(
    () => isEditableTextViewerType(viewerFileType),
    [viewerFileType],
  );
  const hasTextChanged = textContent !== originalTextContent;

  const getObjectProxyUrl = (objectKey) =>
    `/api/storage/admin/objects/content?key=${encodeURIComponent(objectKey || '')}`;

  const destroyPreviewViewer = () => {
    previewViewerRef.current?.destroy?.();
    previewViewerRef.current = null;
  };

  const extractCharset = (contentType = '') => {
    const matched = String(contentType).match(/charset=([^;]+)/i);
    return matched?.[1]?.trim() || 'utf-8';
  };

  const loadTextContent = async () => {
    if (!previewItem.key) {
      return;
    }

    const requestId = textRequestIdRef.current + 1;
    textRequestIdRef.current = requestId;
    setTextLoading(true);
    try {
      const res = await API.request({
        url: getObjectProxyUrl(previewItem.key),
        method: 'GET',
        responseType: 'arraybuffer',
        disableDuplicate: true,
        skipErrorHandler: true,
      });
      if (textRequestIdRef.current !== requestId) {
        return;
      }
      const responseType = res.headers?.['content-type'] || '';
      const decoder = new TextDecoder(extractCharset(responseType));
      const nextContent = decoder.decode(res.data || new ArrayBuffer(0));
      setError('');
      setTextContent(nextContent);
      setOriginalTextContent(nextContent);
      setTextContentType(
        responseType || resolveEditableContentType(previewItem),
      );
    } catch (requestError) {
      if (textRequestIdRef.current !== requestId) {
        return;
      }
      const message = extractErrorMessage(requestError, t('文本文件加载失败'));
      setError(message);
      showError(message);
    } finally {
      if (textRequestIdRef.current === requestId) {
        setTextLoading(false);
      }
    }
  };

  const handleEnterEditMode = () => {
    if (!editableTextFile) {
      showError(t('当前文件类型暂不支持在线编辑'));
      return;
    }
    setError('');
    setEditMode(true);
  };

  const handleExitEditMode = () => {
    setEditMode(false);
    setTextContent(originalTextContent);
    setError('');
  };

  const handleSave = async () => {
    if (!editableTextFile) {
      showError(t('当前文件类型暂不支持在线编辑'));
      return;
    }
    if (!hasTextChanged) {
      showInfo(t('未检测到内容变更'));
      return;
    }

    setSaving(true);
    try {
      const res = await API.put('/api/storage/admin/objects/content', {
        key: previewItem.key,
        content: textContent,
        content_type:
          textContentType || resolveEditableContentType(previewItem),
      });
      const { success, message } = res.data;
      if (!success) {
        throw new Error(message || t('保存失败'));
      }
      setOriginalTextContent(textContent);
      setError('');
      setEditMode(false);
      showSuccess(t('保存成功'));
    } catch (requestError) {
      const message = extractErrorMessage(requestError, t('保存失败'));
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    textRequestIdRef.current += 1;
    setEditMode(false);
    setSaving(false);
    setTextLoading(false);
    setTextContent('');
    setOriginalTextContent('');
    setTextContentType('');
    setError('');
    destroyPreviewViewer();
  }, [previewItem.key]);

  useEffect(() => {
    if (editMode) {
      setLoading(false);
      destroyPreviewViewer();
      return undefined;
    }

    if (!previewItem.key || !viewerFileType || !previewContainerRef.current) {
      destroyPreviewViewer();
      setLoading(false);
      setError(t('当前文件类型不支持内嵌预览。'));
      return undefined;
    }

    let cancelled = false;

    const mountViewer = async () => {
      try {
        const { createViewer } = await import('jit-viewer');
        const viewer = createViewer({
          target: previewContainerRef.current,
          file: {
            url: getObjectProxyUrl(previewItem.key),
          },
          type: viewerFileType,
          filename: previewItem.name || previewItem.key,
          toolbar: true,
          locale: i18n.language === 'en' ? 'en' : 'zh-CN',
          height: 'calc(100vh - 132px)',
          onLoad: () => {
            if (!cancelled) {
              setLoading(false);
              setError('');
            }
          },
          onError: (nextError) => {
            if (!cancelled) {
              setLoading(false);
              setError(nextError?.message || t('文件预览失败'));
            }
          },
          requestAdapter: async (url, options) => {
            try {
              const res = await API.request({
                url,
                method: options?.method || 'GET',
                data: options?.body,
                headers: options?.headers,
                responseType: 'arraybuffer',
                disableDuplicate: true,
                skipErrorHandler: true,
              });
              return res.data;
            } catch (requestError) {
              throw new Error(
                extractErrorMessage(requestError, t('文件预览失败')),
              );
            }
          },
        });
        previewViewerRef.current = viewer;
        await viewer.mount();
      } catch (mountError) {
        if (!cancelled) {
          setLoading(false);
          setError(extractErrorMessage(mountError, t('文件预览失败')));
        }
      }
    };

    setLoading(true);
    setError('');
    void mountViewer();

    return () => {
      cancelled = true;
      destroyPreviewViewer();
    };
  }, [editMode, i18n.language, previewItem, t, viewerFileType]);

  useEffect(() => {
    if (!editMode || !editableTextFile || textContent || originalTextContent) {
      return;
    }
    void loadTextContent();
  }, [editMode, editableTextFile]);

  return (
    <div className='px-4 pt-[88px] md:pt-[72px]'>
      <div className='mb-4 flex flex-wrap items-center justify-between gap-3'>
        <div className='min-w-0'>
          <Title heading={4} style={{ margin: 0 }}>
            {t('文件预览')}
          </Title>
          <Text type='secondary' style={{ wordBreak: 'break-all' }}>
            {displayName}
          </Text>
        </div>
        <Space wrap>
          {editableTextFile ? (
            editMode ? (
              <>
                <Button onClick={handleExitEditMode} disabled={saving}>
                  {t('取消编辑')}
                </Button>
                <Button type='primary' onClick={handleSave} loading={saving}>
                  {saving ? t('正在保存') : t('保存')}
                </Button>
              </>
            ) : (
              <Button onClick={handleEnterEditMode}>{t('编辑')}</Button>
            )
          ) : null}
          <Button onClick={() => openPage(getObjectProxyUrl(previewItem.key))}>
            {t('打开文件')}
          </Button>
          <Button
            onClick={() => {
              window.close();
              if (!window.closed) {
                window.history.back();
              }
            }}
          >
            {t('关闭')}
          </Button>
        </Space>
      </div>

      <div className='relative min-h-[calc(100vh-132px)] rounded-2xl border border-[var(--semi-color-border)] bg-[var(--semi-color-bg-0)] p-2'>
        {!editMode ? (
          <div
            ref={previewContainerRef}
            className='min-h-[calc(100vh-148px)] w-full overflow-hidden rounded-xl'
            style={{ visibility: error ? 'hidden' : 'visible' }}
          />
        ) : (
          <div className='min-h-[calc(100vh-148px)] rounded-xl bg-[var(--semi-color-fill-0)] p-3'>
            <div className='mb-3 flex items-center justify-between gap-3'>
              <Text type='secondary'>
                {editableTextFile
                  ? t('编辑模式')
                  : t('当前文件类型暂不支持在线编辑')}
              </Text>
              <Text type='secondary'>
                {hasTextChanged ? t('已修改') : t('未修改')}
              </Text>
            </div>
            <TextArea
              value={textContent}
              onChange={setTextContent}
              autosize={false}
              disabled={!editableTextFile || textLoading || saving}
              className='h-[calc(100vh-220px)] [&_textarea]:h-[calc(100vh-220px)] [&_textarea]:min-h-[calc(100vh-220px)] [&_textarea]:resize-none'
              style={{
                height: 'calc(100vh - 220px)',
                fontFamily:
                  'ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace',
              }}
            />
          </div>
        )}
        {!editMode && loading ? (
          <div className='absolute inset-0 flex items-start justify-start rounded-2xl bg-[var(--semi-color-bg-0)] p-4'>
            <Text type='secondary'>{t('加载中')}</Text>
          </div>
        ) : null}
        {editMode && textLoading ? (
          <div className='absolute inset-0 flex items-start justify-start rounded-2xl bg-[var(--semi-color-bg-0)] p-4'>
            <Text type='secondary'>{t('加载中')}</Text>
          </div>
        ) : null}
        {error ? (
          <div className='absolute inset-0 flex items-start justify-start rounded-2xl bg-[var(--semi-color-bg-0)] p-4'>
            <Text type='secondary'>{error}</Text>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default R2StoragePreviewPage;
