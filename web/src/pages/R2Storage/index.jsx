import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Banner,
  Button,
  Card,
  Checkbox,
  Empty,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Progress,
  Select,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconRefresh, IconUpload } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import CardTable from '../../components/common/ui/CardTable';
import { API, copy, openPage, showError, showSuccess } from '../../helpers';
import { getDisplayFileType, resolveViewerFileType } from './utils';

const { Text, Title } = Typography;
const REMOTE_PAGE_SIZE = 100;
const LOCAL_PAGE_SIZE = 12;

function formatFileSize(size) {
  const value = Number(size || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(2)} KB`;
  if (value < 1024 * 1024 * 1024)
    return `${(value / 1024 / 1024).toFixed(2)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDateTime(value, locale) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(locale, { hour12: false });
}

function normalizePrefix(prefix = '') {
  const value = String(prefix)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  return value ? `${value}/` : '';
}

function buildUploadObjectKey(prefix, fileName) {
  const normalizedPrefix = normalizePrefix(prefix);
  const normalizedName = String(fileName || '')
    .trim()
    .replace(/^\/+/, '');
  return `${normalizedPrefix}${normalizedName}`;
}

function getFileTypeTagConfig(fileType) {
  switch (fileType) {
    case 'directory':
      return { color: 'violet', label: '目录' };
    case 'image':
      return { color: 'green', label: '图片' };
    case 'pdf':
      return { color: 'red', label: 'PDF' };
    case 'video':
      return { color: 'blue', label: '视频' };
    case 'audio':
      return { color: 'cyan', label: '音频' };
    case 'text':
      return { color: 'orange', label: '文本' };
    case 'spreadsheet':
      return { color: 'indigo', label: '表格' };
    case 'docx':
      return { color: 'blue', label: '文档' };
    case 'pptx':
      return { color: 'amber', label: '演示' };
    default:
      return { color: 'grey', label: '文件' };
  }
}

function isPreviewable(item) {
  return Boolean(resolveViewerFileType(item));
}

const R2StoragePage = () => {
  const { t, i18n } = useTranslation();
  const uploadInputRef = useRef(null);
  const uploadDirectoryInputRef = useRef(null);
  const uploadModalContentRef = useRef(null);
  const uploadDropzoneRef = useRef(null);

  const [prefixInput, setPrefixInput] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState({ prefix: '', search: '' });
  const [viewMode, setViewMode] = useState('table');
  const [data, setData] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deletingKey, setDeletingKey] = useState('');
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(LOCAL_PAGE_SIZE);
  const [renameModal, setRenameModal] = useState({
    visible: false,
    oldKey: '',
    newKey: '',
  });
  const [directoryModal, setDirectoryModal] = useState({
    visible: false,
    name: '',
  });
  const [uploadModal, setUploadModal] = useState({
    visible: false,
    files: [],
  });
  const [uploadConflictStrategy, setUploadConflictStrategy] = useState('error');
  const [uploadDragActive, setUploadDragActive] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({
    totalPercent: 0,
    currentPercent: 0,
    currentName: '',
    currentIndex: 0,
    totalCount: 0,
  });
  const [accessUrlMap, setAccessUrlMap] = useState({});

  const getObjectProxyUrl = (objectKey) =>
    `/api/storage/admin/objects/content?key=${encodeURIComponent(objectKey || '')}`;

  const getPreviewPageUrl = (item) => {
    if (!item) return '';
    const params = new URLSearchParams({
      key: item.key || '',
      name: item.name || '',
      extension: item.extension || '',
      fileType: item.file_type || '',
    });
    return `/console/r2-storage/preview?${params.toString()}`;
  };

  const getObjectOpenUrl = (item) => {
    if (!item) return '';
    if (data?.public_url && item?.url) {
      return item.url;
    }
    return accessUrlMap[item.key]?.url || '';
  };

  const getObjectCopyUrl = (item) => {
    if (data?.public_url && item?.url) {
      return item.url;
    }
    const proxyUrl = getObjectProxyUrl(item?.key);
    if (typeof window === 'undefined') {
      return proxyUrl;
    }
    return new URL(proxyUrl, window.location.origin).toString();
  };

  const sanitizeSelectedRowKeys = (keys = [], sourceItems = items) => {
    const selectableKeySet = new Set(
      (sourceItems || [])
        .filter((item) => item.file_type !== 'directory')
        .map((item) => item.key),
    );
    return (keys || []).filter((key) => selectableKeySet.has(key));
  };

  const resolveAccessUrl = async (item) => {
    if (!item || item.file_type === 'directory') return '';
    if (data?.public_url && item?.url) {
      return item.url;
    }

    const cached = accessUrlMap[item.key];
    if (
      cached?.url &&
      (!cached.expiresAt || cached.expiresAt * 1000 > Date.now() + 5000)
    ) {
      return cached.url;
    }

    try {
      const res = await API.get('/api/storage/admin/objects/access-url', {
        params: { key: item.key },
        skipErrorHandler: true,
      });
      const { success, message, data: responseData } = res.data;
      if (!success || !responseData?.url) {
        throw new Error(message || t('获取访问链接失败'));
      }
      setAccessUrlMap((prev) => ({
        ...prev,
        [item.key]: {
          url: responseData.url,
          expiresAt: responseData.expires_at || 0,
        },
      }));
      return responseData.url;
    } catch (error) {
      showError(error?.message || t('获取访问链接失败'));
      return '';
    }
  };

  const navigateToPrefix = (nextPrefix) => {
    const normalized = normalizePrefix(nextPrefix);
    setPrefixInput(normalized);
    setSearchInput('');
    loadObjects({
      nextPrefix: normalized,
      nextSearch: '',
      nextToken: '',
      append: false,
    });
  };

  const handleEnterDirectory = (item) => {
    if (item?.file_type !== 'directory') return;
    navigateToPrefix(item.key);
  };

  const handleGoParent = () => {
    const currentPrefix = normalizePrefix(query.prefix || prefixInput.trim());
    if (!currentPrefix) return;
    const trimmed = currentPrefix.replace(/\/$/, '');
    const index = trimmed.lastIndexOf('/');
    navigateToPrefix(index >= 0 ? trimmed.slice(0, index + 1) : '');
  };

  const handleOpenItem = async (item) => {
    if (!item) return;
    if (item.file_type === 'directory') {
      handleEnterDirectory(item);
      return;
    }
    const url = await resolveAccessUrl(item);
    if (url) {
      openPage(url);
    }
  };

  const handlePreviewOpen = (item) => {
    if (!item || !isPreviewable(item)) return;
    openPage(getPreviewPageUrl(item));
  };

  const loadObjects = async ({
    nextPrefix = query.prefix,
    nextSearch = query.search,
    nextToken = '',
    append = false,
  } = {}) => {
    setLoading(true);
    try {
      const res = await API.get('/api/storage/admin/objects', {
        params: {
          prefix: nextPrefix || undefined,
          search: nextSearch || undefined,
          continuation_token: nextToken || undefined,
          max_keys: REMOTE_PAGE_SIZE,
        },
      });
      const { success, message, data: responseData } = res.data;
      if (!success) {
        showError(message || t('获取 R2 对象列表失败'));
        return;
      }

      setData(responseData);
      setQuery({ prefix: nextPrefix, search: nextSearch });
      setAccessUrlMap({});
      setItems((prev) =>
        append
          ? [...prev, ...(responseData.items || [])]
          : responseData.items || [],
      );
      if (!append) {
        setSelectedRowKeys([]);
        setPage(1);
      }
    } catch (error) {
      showError(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadObjects();
  }, []);

  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const selectedItems = useMemo(() => {
    const selectedSet = new Set(selectedRowKeys);
    return items.filter((item) => selectedSet.has(item.key));
  }, [items, selectedRowKeys]);

  useEffect(() => {
    if (viewMode !== 'card' || data?.public_url) return;
    pagedItems
      .filter((item) => item.file_type === 'image')
      .forEach((item) => {
        void resolveAccessUrl(item);
      });
  }, [data?.public_url, pagedItems, viewMode]);

  const handleSearch = () => {
    loadObjects({
      nextPrefix: prefixInput.trim(),
      nextSearch: searchInput.trim(),
      nextToken: '',
      append: false,
    });
  };

  const handleReset = () => {
    setPrefixInput('');
    setSearchInput('');
    loadObjects({
      nextPrefix: '',
      nextSearch: '',
      nextToken: '',
      append: false,
    });
  };

  const handleOpenUploadModal = () => {
    setUploadModal({
      visible: true,
      files: [],
    });
    setUploadConflictStrategy('error');
    setUploadProgress({
      totalPercent: 0,
      currentPercent: 0,
      currentName: '',
      currentIndex: 0,
      totalCount: 0,
    });
  };

  const handleOpenDirectoryModal = () => {
    setDirectoryModal({
      visible: true,
      name: '',
    });
  };

  const handleChooseUploadFile = () => {
    uploadInputRef.current?.click();
  };

  const handleChooseUploadDirectory = () => {
    uploadDirectoryInputRef.current?.click();
  };

  const buildUploadEntries = (fileList, pathResolver) => {
    const currentPrefix = query.prefix || prefixInput.trim();
    return Array.from(fileList || []).map((file, index) => {
      const relativePath = String(
        pathResolver?.(file, index) ||
          file.webkitRelativePath ||
          file.name ||
          '',
      ).trim();
      const preferredName = relativePath || file.name || `file-${index + 1}`;
      return {
        id: `${preferredName}-${index}-${file.size}-${file.lastModified}`,
        file,
        displayName: preferredName,
        objectKey: buildUploadObjectKey(currentPrefix, preferredName),
      };
    });
  };

  const applyUploadEntries = (fileList, pathResolver) => {
    const nextEntries = buildUploadEntries(fileList, pathResolver);
    if (!nextEntries.length) return;

    setUploadConflictStrategy(nextEntries.length > 1 ? 'skip' : 'error');
    setUploadModal((prev) => ({
      ...prev,
      files: nextEntries,
    }));
  };

  const handleUploadFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files?.length) return;

    applyUploadEntries(files);
  };

  const readDroppedEntry = async (entry, parentPath = '') => {
    if (!entry) return [];
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file(
          (file) =>
            resolve([{ file, relativePath: `${parentPath}${file.name}` }]),
          () => resolve([]),
        );
      });
    }
    if (!entry.isDirectory) {
      return [];
    }

    const dirPath = `${parentPath}${entry.name}/`;
    const reader = entry.createReader();
    const children = [];

    while (true) {
      const entries = await new Promise((resolve) => {
        reader.readEntries(
          (batch) => resolve(batch || []),
          () => resolve([]),
        );
      });
      if (!entries.length) {
        break;
      }
      children.push(...entries);
    }

    const nested = await Promise.all(
      children.map((childEntry) => readDroppedEntry(childEntry, dirPath)),
    );
    return nested.flat();
  };

  const readDroppedHandle = async (handle, parentPath = '') => {
    if (!handle) return [];
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      return [{ file, relativePath: `${parentPath}${file.name}` }];
    }
    if (handle.kind !== 'directory') {
      return [];
    }

    const dirPath = `${parentPath}${handle.name}/`;
    const children = [];
    for await (const childHandle of handle.values()) {
      const nested = await readDroppedHandle(childHandle, dirPath);
      children.push(...nested);
    }
    return children;
  };

  const collectDroppedFiles = async (dataTransfer) => {
    const items = Array.from(dataTransfer?.items || []);
    const handleItems = items.filter(
      (item) =>
        item.kind === 'file' &&
        typeof item.getAsFileSystemHandle === 'function',
    );

    if (handleItems.length > 0) {
      const nested = await Promise.all(
        handleItems.map(async (item) =>
          readDroppedHandle(await item.getAsFileSystemHandle()),
        ),
      );
      return nested.flat();
    }

    const entryItems = items
      .map((item) => ({
        entry:
          item.kind === 'file' && typeof item.webkitGetAsEntry === 'function'
            ? item.webkitGetAsEntry()
            : null,
      }))
      .filter((item) => item.entry);

    if (entryItems.length > 0) {
      const nested = await Promise.all(
        entryItems.map(({ entry }) => readDroppedEntry(entry)),
      );
      return nested.flat();
    }

    return Array.from(dataTransfer?.files || []).map((file) => ({
      file,
      relativePath: file.webkitRelativePath || file.name,
    }));
  };

  const handleUploadDrop = async (event) => {
    event.preventDefault();
    setUploadDragActive(false);
    const droppedFiles = await collectDroppedFiles(event.dataTransfer);
    if (!droppedFiles.length) return;
    applyUploadEntries(
      droppedFiles.map((item) => item.file),
      (_, index) => droppedFiles[index]?.relativePath,
    );
  };

  const handleUploadPaste = (clipboardData) => {
    const pastedFiles = Array.from(clipboardData?.files || []);
    if (!pastedFiles.length) return false;
    applyUploadEntries(pastedFiles);
    return true;
  };

  useEffect(() => {
    if (!uploadModal.visible) return;
    uploadDropzoneRef.current?.focus?.();
  }, [uploadModal.visible]);

  const handleUploadSubmit = async () => {
    if (!uploadModal.files.length) {
      showError(t('请先选择文件或文件夹'));
      return;
    }

    setUploading(true);
    const totalBytes = uploadModal.files.reduce(
      (sum, item) => sum + Number(item?.file?.size || 0),
      0,
    );
    try {
      let uploadedCount = 0;
      let overwrittenCount = 0;
      let skippedCount = 0;
      const failedFiles = [];
      const failedEntries = [];
      let uploadedBytes = 0;
      for (const [index, item] of uploadModal.files.entries()) {
        const currentFileSize = Number(item?.file?.size || 0);
        setUploadProgress({
          totalPercent:
            totalBytes > 0
              ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100))
              : 0,
          currentPercent: 0,
          currentName: item.displayName,
          currentIndex: index + 1,
          totalCount: uploadModal.files.length,
        });
        const formData = new FormData();
        formData.append('file', item.file);
        if (query.prefix) {
          formData.append('prefix', query.prefix);
        }
        if (item.objectKey.trim()) {
          formData.append('key', item.objectKey.trim());
        }
        formData.append('conflict_strategy', uploadConflictStrategy);

        const res = await API.post('/api/storage/admin/objects', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          onUploadProgress: (progressEvent) => {
            const loaded = Math.min(
              Number(progressEvent?.loaded || 0),
              currentFileSize || Number(progressEvent?.loaded || 0),
            );
            const currentPercent =
              currentFileSize > 0
                ? Math.min(100, Math.round((loaded / currentFileSize) * 100))
                : 100;
            const totalPercent =
              totalBytes > 0
                ? Math.min(
                    100,
                    Math.round(((uploadedBytes + loaded) / totalBytes) * 100),
                  )
                : currentPercent;
            setUploadProgress({
              totalPercent,
              currentPercent,
              currentName: item.displayName,
              currentIndex: index + 1,
              totalCount: uploadModal.files.length,
            });
          },
        });
        const { success, message, data: responseData } = res.data;
        uploadedBytes += currentFileSize;
        if (!success) {
          const errorMessage = message || item.displayName;
          failedFiles.push(errorMessage);
          failedEntries.push({ ...item, errorMessage });
          continue;
        }
        if (responseData?.status === 'skipped') {
          skippedCount += 1;
        } else if (responseData?.status === 'overwritten') {
          overwrittenCount += 1;
        } else {
          uploadedCount += 1;
        }
        setUploadProgress({
          totalPercent:
            totalBytes > 0
              ? Math.min(100, Math.round((uploadedBytes / totalBytes) * 100))
              : 100,
          currentPercent: 100,
          currentName: item.displayName,
          currentIndex: index + 1,
          totalCount: uploadModal.files.length,
        });
      }

      if (uploadedCount > 0 || overwrittenCount > 0 || skippedCount > 0) {
        showSuccess(
          `${t('上传完成')}：${t('新增')} ${uploadedCount}，${t('覆盖')} ${overwrittenCount}，${t('跳过')} ${skippedCount}`,
        );
      }
      if (failedFiles.length > 0) {
        showError(
          `${t('上传文件失败')}: ${failedFiles.slice(0, 3).join(', ')}${
            failedFiles.length > 3 ? '...' : ''
          }`,
        );
      }
      setUploadModal({
        visible: failedEntries.length > 0,
        files: failedEntries,
      });
      setUploadProgress({
        totalPercent: failedEntries.length > 0 ? 0 : 100,
        currentPercent: failedEntries.length > 0 ? 0 : 100,
        currentName: failedEntries.length > 0 ? '' : t('上传完成'),
        currentIndex: failedEntries.length > 0 ? 0 : uploadModal.files.length,
        totalCount: uploadModal.files.length,
      });
      loadObjects({
        nextPrefix: query.prefix,
        nextSearch: query.search,
        nextToken: '',
        append: false,
      });
    } catch (error) {
      showError(error);
    } finally {
      setUploading(false);
    }
  };

  const handleCreateDirectory = async () => {
    const directoryName = directoryModal.name.trim();
    if (!directoryName) {
      showError(t('目录名不能为空'));
      return;
    }

    setUploading(true);
    try {
      const res = await API.post('/api/storage/admin/directories', {
        prefix: query.prefix,
        name: directoryName,
      });
      const { success, message } = res.data;
      if (!success) {
        showError(message || t('新建目录失败'));
        return;
      }

      showSuccess(t('新建目录成功'));
      setDirectoryModal({ visible: false, name: '' });
      loadObjects({
        nextPrefix: query.prefix,
        nextSearch: query.search,
        nextToken: '',
        append: false,
      });
    } catch (error) {
      showError(error);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (key) => {
    setDeletingKey(key);
    try {
      const res = await API.delete('/api/storage/admin/objects', {
        params: { key },
      });
      const { success, message } = res.data;
      if (!success) {
        showError(message || t('删除文件失败'));
        return;
      }

      showSuccess(t('删除成功'));
      setItems((prev) => prev.filter((item) => item.key !== key));
      setSelectedRowKeys((prev) => prev.filter((itemKey) => itemKey !== key));
    } catch (error) {
      showError(error);
    } finally {
      setDeletingKey('');
    }
  };

  const handleBatchDelete = async () => {
    if (!selectedRowKeys.length) {
      showError(t('请先选择要删除的对象'));
      return;
    }

    setBatchDeleting(true);
    try {
      const res = await API.post('/api/storage/admin/objects/batch-delete', {
        keys: selectedRowKeys,
      });
      const { success, message, data: responseData } = res.data;
      if (!success) {
        showError(message || t('批量删除失败'));
        return;
      }

      const deletedKeys = new Set(responseData?.deleted_keys || []);
      setItems((prev) => prev.filter((item) => !deletedKeys.has(item.key)));
      setSelectedRowKeys((prev) =>
        prev.filter((itemKey) => !deletedKeys.has(itemKey)),
      );
      if (
        responseData?.failed_keys &&
        Object.keys(responseData.failed_keys).length > 0
      ) {
        showError(
          t('部分对象删除失败') +
            `：${Object.keys(responseData.failed_keys).length}`,
        );
      } else {
        showSuccess(t('批量删除成功'));
      }
    } catch (error) {
      showError(error);
    } finally {
      setBatchDeleting(false);
    }
  };

  const handleRenameSubmit = async () => {
    if (!renameModal.oldKey || !renameModal.newKey.trim()) {
      showError(t('对象 Key 不能为空'));
      return;
    }

    setRenaming(true);
    try {
      const res = await API.put('/api/storage/admin/objects/rename', {
        old_key: renameModal.oldKey,
        new_key: renameModal.newKey.trim(),
      });
      const { success, message } = res.data;
      if (!success) {
        showError(message || t('重命名失败'));
        return;
      }

      showSuccess(t('重命名成功'));
      setRenameModal({ visible: false, oldKey: '', newKey: '' });
      setSelectedRowKeys((prev) =>
        prev.map((itemKey) =>
          itemKey === renameModal.oldKey ? renameModal.newKey.trim() : itemKey,
        ),
      );
      loadObjects({
        nextPrefix: query.prefix,
        nextSearch: query.search,
        nextToken: '',
        append: false,
      });
    } catch (error) {
      showError(error);
    } finally {
      setRenaming(false);
    }
  };

  const tableColumns = useMemo(
    () => [
      {
        title: t('类型'),
        dataIndex: 'file_type',
        key: 'file_type',
        width: 100,
        render: (_, record) => {
          const displayType = getDisplayFileType(record);
          const tag = getFileTypeTagConfig(displayType);
          return <Tag color={tag.color}>{t(tag.label)}</Tag>;
        },
      },
      {
        title: t('文件名'),
        dataIndex: 'name',
        key: 'name',
        render: (_, record) => (
          <div className='flex flex-col'>
            <Text strong>{record.name || record.key}</Text>
            <Text type='secondary' size='small'>
              {record.key}
            </Text>
          </div>
        ),
      },
      {
        title: t('大小'),
        dataIndex: 'size',
        key: 'size',
        width: 120,
        render: (value) => formatFileSize(value),
      },
      {
        title: t('最后修改时间'),
        dataIndex: 'last_modified',
        key: 'last_modified',
        width: 200,
        render: (value) => formatDateTime(value, i18n.language),
      },
      {
        title: t('操作'),
        key: 'actions',
        render: (_, record) => (
          <Space wrap>
            <Button
              theme='light'
              size='small'
              onClick={() => handlePreviewOpen(record)}
              disabled={!isPreviewable(record)}
            >
              {t('预览')}
            </Button>
            {record.file_type === 'directory' ? (
              <Button
                theme='light'
                size='small'
                onClick={() => handleEnterDirectory(record)}
              >
                {t('进入')}
              </Button>
            ) : (
              <Button
                theme='light'
                size='small'
                onClick={() =>
                  setRenameModal({
                    visible: true,
                    oldKey: record.key,
                    newKey: record.key,
                  })
                }
              >
                {t('重命名')}
              </Button>
            )}
            <Button
              theme='light'
              size='small'
              disabled={!data?.public_url || record.file_type === 'directory'}
              onClick={async () => {
                const copied = await copy(getObjectCopyUrl(record));
                if (copied) {
                  showSuccess(t('链接已复制'));
                  return;
                }
                showError(t('复制失败'));
              }}
            >
              {t('复制链接')}
            </Button>
            <Button
              theme='borderless'
              size='small'
              onClick={() => handleOpenItem(record)}
            >
              {record.file_type === 'directory' ? t('进入') : t('打开链接')}
            </Button>
            {record.file_type !== 'directory' ? (
              <Popconfirm
                title={t('确认删除')}
                content={t('删除后无法恢复，是否继续？')}
                okText={t('删除')}
                cancelText={t('取消')}
                okType='danger'
                onConfirm={() => handleDelete(record.key)}
              >
                <Button
                  type='danger'
                  size='small'
                  loading={deletingKey === record.key}
                >
                  {t('删除')}
                </Button>
              </Popconfirm>
            ) : null}
          </Space>
        ),
      },
    ],
    [accessUrlMap, data?.public_url, deletingKey, t],
  );

  const renderCardItem = (item) => {
    const displayType = getDisplayFileType(item);
    const tag = getFileTypeTagConfig(displayType);
    const checked = selectedRowKeys.includes(item.key);

    return (
      <Card
        key={item.key}
        className='!rounded-2xl shadow-sm'
        bodyStyle={{ padding: 16 }}
      >
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <div className='flex items-center gap-2 mb-2'>
              <Tag color={tag.color}>{t(tag.label)}</Tag>
              <Text type='secondary' size='small'>
                {item.extension || '-'}
              </Text>
            </div>
            <Text strong style={{ wordBreak: 'break-all' }}>
              {item.name || item.key}
            </Text>
            <div className='mt-1'>
              <Text
                type='secondary'
                size='small'
                style={{ wordBreak: 'break-all' }}
              >
                {item.key}
              </Text>
            </div>
          </div>
          <Checkbox
            checked={checked}
            disabled={item.file_type === 'directory'}
            onChange={(event) => {
              const isChecked = event.target.checked;
              setSelectedRowKeys((prev) =>
                isChecked
                  ? Array.from(new Set([...prev, item.key]))
                  : prev.filter((value) => value !== item.key),
              );
            }}
          />
        </div>

        {item.file_type === 'image' && (
          <div className='mt-3 rounded-xl overflow-hidden border border-dashed border-[var(--semi-color-border)]'>
            {getObjectOpenUrl(item) ? (
              <img
                src={getObjectOpenUrl(item)}
                alt={item.name}
                style={{ width: '100%', height: 180, objectFit: 'cover' }}
              />
            ) : (
              <div className='flex h-[180px] items-center justify-center text-[var(--semi-color-text-2)]'>
                {t('加载中')}
              </div>
            )}
          </div>
        )}

        <div className='mt-3 grid grid-cols-2 gap-2 text-sm'>
          <Text type='secondary'>{`${t('大小')}: ${formatFileSize(item.size)}`}</Text>
          <Text type='secondary'>{`${t('修改时间')}: ${formatDateTime(item.last_modified, i18n.language)}`}</Text>
        </div>

        <div className='mt-4 flex flex-wrap gap-2'>
          <Button
            size='small'
            theme='light'
            onClick={() => handlePreviewOpen(item)}
            disabled={!isPreviewable(item)}
          >
            {t('预览')}
          </Button>
          {item.file_type === 'directory' ? (
            <Button
              size='small'
              theme='light'
              onClick={() => handleEnterDirectory(item)}
            >
              {t('进入')}
            </Button>
          ) : (
            <>
              <Button
                size='small'
                theme='light'
                onClick={() =>
                  setRenameModal({
                    visible: true,
                    oldKey: item.key,
                    newKey: item.key,
                  })
                }
              >
                {t('重命名')}
              </Button>
              <Button
                size='small'
                theme='light'
                onClick={() => handleOpenItem(item)}
              >
                {t('打开')}
              </Button>
              <Popconfirm
                title={t('确认删除')}
                content={t('删除后无法恢复，是否继续？')}
                okText={t('删除')}
                cancelText={t('取消')}
                okType='danger'
                onConfirm={() => handleDelete(item.key)}
              >
                <Button
                  size='small'
                  type='danger'
                  loading={deletingKey === item.key}
                >
                  {t('删除')}
                </Button>
              </Popconfirm>
            </>
          )}
        </div>
      </Card>
    );
  };

  const isR2 = data?.backend === 'r2';

  return (
    <div className='px-2 pt-[88px] md:pt-[72px]'>
      <Card style={{ marginBottom: 16 }}>
        <Title heading={5} style={{ marginBottom: 12 }}>
          {t('R2 存储管理')}
        </Title>
        <Banner
          type={isR2 ? 'info' : 'warning'}
          description={
            isR2
              ? t(
                  '支持对象列表、模糊搜索、图片/表格预览、上传、重命名、单删与批量删除。',
                )
              : t(
                  '当前存储后端不是 R2，或 R2 配置不完整，请先到“系统设置 > 存储设置”完成配置。',
                )
          }
          style={{ marginBottom: 16 }}
        />

        <div className='grid grid-cols-1 gap-3 md:grid-cols-[220px,220px,auto,auto,auto,1fr]'>
          <Input
            value={prefixInput}
            onChange={setPrefixInput}
            placeholder={t('前缀，例如 invoices/')}
            onEnterPress={handleSearch}
          />
          <Input
            value={searchInput}
            onChange={setSearchInput}
            placeholder={t('对象 Key 模糊搜索')}
            onEnterPress={handleSearch}
          />
          <Button type='primary' onClick={handleSearch} loading={loading}>
            {t('查询')}
          </Button>
          <Button onClick={handleReset}>{t('重置')}</Button>
          <Button
            onClick={handleGoParent}
            disabled={!query.prefix && !prefixInput.trim()}
          >
            {t('返回上级')}
          </Button>
          <Button
            icon={<IconRefresh />}
            loading={loading}
            onClick={() =>
              loadObjects({
                nextPrefix: query.prefix,
                nextSearch: query.search,
                nextToken: '',
                append: false,
              })
            }
          >
            {t('刷新')}
          </Button>
          <div className='flex flex-wrap gap-2 justify-start md:justify-end'>
            <Button
              type={viewMode === 'table' ? 'primary' : 'tertiary'}
              onClick={() => setViewMode('table')}
            >
              {t('表格列表')}
            </Button>
            <Button
              type={viewMode === 'card' ? 'primary' : 'tertiary'}
              onClick={() => setViewMode('card')}
            >
              {t('卡片列表')}
            </Button>
            <Button
              onClick={handleOpenDirectoryModal}
              disabled={!isR2}
              type='tertiary'
            >
              {t('新建目录')}
            </Button>
            <Button
              type='tertiary'
              icon={<IconUpload />}
              loading={uploading}
              onClick={handleOpenUploadModal}
              disabled={!isR2}
            >
              {t('上传文件')}
            </Button>
          </div>
        </div>
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <div className='flex flex-wrap gap-2'>
          <Tag color='blue'>{`${t('存储后端')}: ${data?.backend || '-'}`}</Tag>
          <Tag color='green'>{`${t('Bucket')}: ${data?.bucket || '-'}`}</Tag>
          <Tag color='cyan'>{`${t('前缀过滤')}: ${query.prefix || t('全部')}`}</Tag>
          <Tag color='orange'>{`${t('关键字')}: ${query.search || t('无')}`}</Tag>
          <Tag color='purple'>{`${t('当前结果')}: ${items.length}`}</Tag>
          <Tag color='red'>{`${t('已选中')}: ${selectedRowKeys.length}`}</Tag>
        </div>
        <div className='mt-3 flex flex-wrap gap-2'>
          <Popconfirm
            title={t('确认批量删除')}
            content={t('选中的对象将被永久删除，是否继续？')}
            okText={t('删除')}
            cancelText={t('取消')}
            okType='danger'
            onConfirm={handleBatchDelete}
          >
            <Button
              type='danger'
              disabled={!selectedRowKeys.length}
              loading={batchDeleting}
            >
              {t('批量删除')}
            </Button>
          </Popconfirm>
          <Button
            disabled={!selectedRowKeys.length}
            onClick={() => setSelectedRowKeys([])}
          >
            {t('清空选择')}
          </Button>
          <Button
            disabled={selectedItems.length !== 1}
            onClick={() => {
              const target = selectedItems[0];
              if (!target) return;
              setRenameModal({
                visible: true,
                oldKey: target.key,
                newKey: target.key,
              });
            }}
          >
            {t('重命名选中项')}
          </Button>
        </div>
        <div style={{ marginTop: 12 }}>
          <Text type='secondary'>{`${t('Endpoint')}: ${data?.endpoint || '-'}`}</Text>
        </div>
        <div style={{ marginTop: 8 }}>
          <Text type='secondary'>{`${t('公开访问前缀')}: ${data?.public_url || '-'}`}</Text>
        </div>
      </Card>

      <Card>
        {items.length > 0 ? (
          <>
            {viewMode === 'table' ? (
              <CardTable
                rowKey='key'
                columns={tableColumns}
                dataSource={pagedItems}
                loading={loading}
                hidePagination
                rowSelection={{
                  selectedRowKeys,
                  onChange: (nextKeys) =>
                    setSelectedRowKeys(sanitizeSelectedRowKeys(nextKeys)),
                  getCheckboxProps: (record) => ({
                    disabled: record.file_type === 'directory',
                  }),
                }}
              />
            ) : (
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3'>
                {pagedItems.map((item) => renderCardItem(item))}
              </div>
            )}

            <div className='mt-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between'>
              <Pagination
                currentPage={page}
                pageSize={pageSize}
                total={items.length}
                showSizeChanger
                pageSizeOptions={[12, 24, 48]}
                onPageChange={(nextPage) => setPage(nextPage)}
                onPageSizeChange={(nextSize) => {
                  setPageSize(nextSize);
                  setPage(1);
                }}
              />
              <div className='flex items-center gap-2'>
                {data?.is_truncated ? (
                  <Button
                    loading={loading}
                    onClick={() =>
                      loadObjects({
                        nextPrefix: query.prefix,
                        nextSearch: query.search,
                        nextToken: data?.next_continuation_token || '',
                        append: true,
                      })
                    }
                  >
                    {t('加载更多')}
                  </Button>
                ) : (
                  <Text type='secondary'>{t('已经到底了')}</Text>
                )}
              </div>
            </div>
          </>
        ) : loading ? (
          <CardTable
            rowKey='key'
            columns={tableColumns}
            dataSource={[]}
            loading
          />
        ) : (
          <Empty description={t('暂无对象')} />
        )}
      </Card>

      <Modal
        title={t('上传文件')}
        visible={uploadModal.visible}
        onCancel={() => {
          if (uploading) return;
          setUploadModal({ visible: false, files: [] });
          setUploadProgress({
            totalPercent: 0,
            currentPercent: 0,
            currentName: '',
            currentIndex: 0,
            totalCount: 0,
          });
        }}
        onOk={handleUploadSubmit}
        okText={t('上传')}
        cancelText={t('取消')}
        confirmLoading={uploading}
        cancelButtonProps={{ disabled: uploading }}
      >
        <div
          ref={uploadModalContentRef}
          className='flex flex-col gap-3'
          onPaste={(event) => {
            if (handleUploadPaste(event.clipboardData)) {
              event.preventDefault();
            }
          }}
        >
          <div className='flex flex-wrap gap-2'>
            <Button onClick={handleChooseUploadFile}>
              {t('选择文件/压缩包')}
            </Button>
            <Button onClick={handleChooseUploadDirectory}>
              {t('选择文件夹')}
            </Button>
          </div>
          <div
            ref={uploadDropzoneRef}
            tabIndex={0}
            role='button'
            className={`rounded-xl border border-dashed p-4 text-center outline-none transition ${
              uploadDragActive
                ? 'border-[var(--semi-color-primary)] bg-[var(--semi-color-fill-0)]'
                : 'border-[var(--semi-color-border)]'
            }`}
            onDragEnter={(event) => {
              event.preventDefault();
              setUploadDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              setUploadDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              if (event.currentTarget.contains(event.relatedTarget)) return;
              setUploadDragActive(false);
            }}
            onDrop={handleUploadDrop}
          >
            <Text>{t('拖拽文件、压缩包或文件夹到这里')}</Text>
            <div className='mt-1'>
              <Text type='secondary'>{t('也支持直接粘贴剪贴板中的文件')}</Text>
            </div>
          </div>
          <input
            ref={uploadInputRef}
            type='file'
            hidden
            multiple
            onChange={handleUploadFileChange}
          />
          <input
            ref={uploadDirectoryInputRef}
            type='file'
            hidden
            multiple
            webkitdirectory=''
            directory=''
            onChange={handleUploadFileChange}
          />
          <div>
            <Text type='secondary'>{t('重名文件处理')}</Text>
            <div className='mt-2'>
              <Select
                value={uploadConflictStrategy}
                onChange={setUploadConflictStrategy}
                style={{ width: '100%' }}
              >
                <Select.Option value='error'>
                  {t('发现重复时报错')}
                </Select.Option>
                <Select.Option value='skip'>{t('跳过重复文件')}</Select.Option>
                <Select.Option value='overwrite'>
                  {t('覆盖已有文件')}
                </Select.Option>
              </Select>
            </div>
          </div>
          {(uploading ||
            uploadProgress.totalPercent > 0 ||
            uploadProgress.currentName) && (
            <div className='rounded-xl border border-[var(--semi-color-border)] p-3'>
              <div className='flex items-center justify-between gap-3'>
                <Text strong>{t('上传进度')}</Text>
                <Text type='secondary'>
                  {uploadProgress.currentIndex > 0 &&
                  uploadProgress.totalCount > 0
                    ? `${uploadProgress.currentIndex}/${uploadProgress.totalCount}`
                    : '-'}
                </Text>
              </div>
              <Progress
                percent={uploadProgress.totalPercent}
                showInfo
                stroke='var(--semi-color-primary)'
                style={{ marginTop: 8 }}
              />
              <div className='mt-2 flex items-center justify-between gap-3'>
                <Text type='secondary'>{t('当前文件')}</Text>
                <Text
                  type='secondary'
                  style={{ wordBreak: 'break-all', textAlign: 'right' }}
                >
                  {uploadProgress.currentName || '-'}
                </Text>
              </div>
              <Progress
                percent={uploadProgress.currentPercent}
                showInfo
                stroke='var(--semi-color-success)'
                style={{ marginTop: 8 }}
              />
            </div>
          )}
          <div>
            <Text type='secondary'>{t('待上传文件')}</Text>
            <div className='mt-2 flex flex-col gap-2 max-h-[320px] overflow-auto'>
              {uploadModal.files.length > 0 ? (
                uploadModal.files.map((item) => (
                  <div
                    key={item.id}
                    className='rounded-xl border border-[var(--semi-color-border)] p-3'
                  >
                    <div className='mb-1'>
                      <Text strong style={{ wordBreak: 'break-all' }}>
                        {item.displayName}
                      </Text>
                    </div>
                    <Input
                      value={item.objectKey}
                      onChange={(value) =>
                        setUploadModal((prev) => ({
                          ...prev,
                          files: prev.files.map((entry) =>
                            entry.id === item.id
                              ? { ...entry, objectKey: value }
                              : entry,
                          ),
                        }))
                      }
                      placeholder={t('对象 Key')}
                    />
                    {item.errorMessage ? (
                      <div className='mt-2'>
                        <Text type='danger'>{item.errorMessage}</Text>
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <Text>{t('未选择')}</Text>
              )}
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        title={t('重命名对象')}
        visible={renameModal.visible}
        onCancel={() =>
          setRenameModal({ visible: false, oldKey: '', newKey: '' })
        }
        onOk={handleRenameSubmit}
        okText={t('保存')}
        cancelText={t('取消')}
        confirmLoading={renaming}
      >
        <div className='flex flex-col gap-3'>
          <Input value={renameModal.oldKey} disabled />
          <Input
            value={renameModal.newKey}
            onChange={(value) =>
              setRenameModal((prev) => ({ ...prev, newKey: value }))
            }
            placeholder={t('新的对象 Key')}
          />
        </div>
      </Modal>

      <Modal
        title={t('新建目录')}
        visible={directoryModal.visible}
        onCancel={() => setDirectoryModal({ visible: false, name: '' })}
        onOk={handleCreateDirectory}
        okText={t('创建')}
        cancelText={t('取消')}
        confirmLoading={uploading}
      >
        <div className='flex flex-col gap-3'>
          <Text type='secondary'>{`${t('当前目录')}: ${query.prefix || t('根目录')}`}</Text>
          <Input
            value={directoryModal.name}
            onChange={(value) =>
              setDirectoryModal((prev) => ({ ...prev, name: value }))
            }
            placeholder={t('目录名称')}
            onEnterPress={handleCreateDirectory}
          />
        </div>
      </Modal>
    </div>
  );
};

export default R2StoragePage;
