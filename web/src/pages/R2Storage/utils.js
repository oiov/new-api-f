export function normalizeExtension(extension = '') {
  const value = String(extension || '')
    .trim()
    .toLowerCase();
  if (!value) return '';
  return value.startsWith('.') ? value : `.${value}`;
}

export function extractObjectExtension(item) {
  const directExtension = normalizeExtension(item?.extension);
  if (directExtension) {
    return directExtension;
  }

  const fileName =
    String(item?.name || item?.key || '')
      .trim()
      .split('/')
      .pop() || '';
  const matched = fileName.match(/(\.[^.]+)$/);
  return normalizeExtension(matched?.[1] || '');
}

export function resolveViewerFileType(item) {
  if (!item || item.file_type === 'directory') return null;

  const extension = extractObjectExtension(item);
  const extensionTypeMap = {
    '.pdf': 'pdf',
    '.png': 'image',
    '.jpg': 'image',
    '.jpeg': 'image',
    '.gif': 'image',
    '.webp': 'image',
    '.bmp': 'image',
    '.svg': 'image',
    '.mp4': 'video',
    '.mov': 'video',
    '.webm': 'video',
    '.mkv': 'video',
    '.avi': 'video',
    '.mp3': 'audio',
    '.wav': 'audio',
    '.ogg': 'audio',
    '.m4a': 'audio',
    '.flac': 'audio',
    '.xlsx': 'xlsx',
    '.xls': 'xls',
    '.csv': 'csv',
    '.tsv': 'csv',
    '.docx': 'docx',
    '.pptx': 'pptx',
    '.ppt': 'ppt',
    '.txt': 'txt',
    '.md': 'md',
    '.markdown': 'markdown',
    '.json': 'code',
    '.js': 'code',
    '.jsx': 'code',
    '.ts': 'code',
    '.tsx': 'code',
    '.css': 'code',
    '.scss': 'code',
    '.less': 'code',
    '.go': 'code',
    '.py': 'code',
    '.java': 'code',
    '.sh': 'code',
    '.yaml': 'code',
    '.yml': 'code',
    '.xml': 'code',
    '.html': 'html',
    '.htm': 'html',
  };

  if (extensionTypeMap[extension]) {
    return extensionTypeMap[extension];
  }

  const fallbackTypeMap = {
    image: 'image',
    pdf: 'pdf',
    video: 'video',
    audio: 'audio',
    spreadsheet: 'xlsx',
    text: 'txt',
  };

  return fallbackTypeMap[item.file_type] || null;
}

export function getDisplayFileType(item) {
  const previewType = resolveViewerFileType(item);
  if (item?.file_type === 'directory') {
    return 'directory';
  }
  if (
    previewType === 'xlsx' ||
    previewType === 'xls' ||
    previewType === 'csv'
  ) {
    return 'spreadsheet';
  }
  if (previewType === 'docx') {
    return 'docx';
  }
  if (previewType === 'pptx' || previewType === 'ppt') {
    return 'pptx';
  }
  return item?.file_type || 'file';
}

export function isEditableTextViewerType(fileType) {
  return ['txt', 'md', 'markdown', 'code', 'html'].includes(fileType);
}

export function resolveEditableContentType(item) {
  const extension = extractObjectExtension(item);
  const extensionContentTypeMap = {
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.markdown': 'text/markdown; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.jsx': 'text/javascript; charset=utf-8',
    '.ts': 'text/plain; charset=utf-8',
    '.tsx': 'text/plain; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.scss': 'text/x-scss; charset=utf-8',
    '.less': 'text/plain; charset=utf-8',
    '.go': 'text/plain; charset=utf-8',
    '.py': 'text/x-python; charset=utf-8',
    '.java': 'text/plain; charset=utf-8',
    '.sh': 'text/plain; charset=utf-8',
    '.yaml': 'text/yaml; charset=utf-8',
    '.yml': 'text/yaml; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
  };

  return extensionContentTypeMap[extension] || 'text/plain; charset=utf-8';
}
