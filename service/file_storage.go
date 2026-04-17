package service

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/google/uuid"
)

const invoiceMaxFileSize = 20 << 20        // 20MB
const storageObjectMaxFileSize = 100 << 20 // 100MB

var invoiceAllowedExts = map[string]string{
	".pdf":  "application/pdf",
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
}

type StorageObjectInfo struct {
	Key          string `json:"key"`
	Name         string `json:"name"`
	Extension    string `json:"extension,omitempty"`
	FileType     string `json:"file_type"`
	Status       string `json:"status,omitempty"`
	Message      string `json:"message,omitempty"`
	Size         int64  `json:"size"`
	LastModified string `json:"last_modified,omitempty"`
	ETag         string `json:"etag,omitempty"`
	URL          string `json:"url"`
}

type StorageObjectListResult struct {
	Backend               string              `json:"backend"`
	Bucket                string              `json:"bucket"`
	Endpoint              string              `json:"endpoint"`
	PublicURL             string              `json:"public_url,omitempty"`
	Prefix                string              `json:"prefix,omitempty"`
	Items                 []StorageObjectInfo `json:"items"`
	IsTruncated           bool                `json:"is_truncated"`
	NextContinuationToken string              `json:"next_continuation_token,omitempty"`
}

type StorageObjectBatchDeleteResult struct {
	DeletedKeys []string          `json:"deleted_keys"`
	FailedKeys  map[string]string `json:"failed_keys,omitempty"`
}

type StorageObjectContent struct {
	Body               io.ReadCloser
	ContentType        string
	ContentLength      int64
	ContentDisposition string
	ContentRange       string
	AcceptRanges       string
	CacheControl       string
	LastModified       string
	ETag               string
	StatusCode         int
}

type storageConfig struct {
	Backend   string
	Endpoint  string
	Bucket    string
	Region    string
	AccessKey string
	SecretKey string
	PublicURL string
}

type listBucketResult struct {
	IsTruncated           bool   `xml:"IsTruncated"`
	NextContinuationToken string `xml:"NextContinuationToken"`
	Contents              []struct {
		Key          string `xml:"Key"`
		LastModified string `xml:"LastModified"`
		ETag         string `xml:"ETag"`
		Size         int64  `xml:"Size"`
	} `xml:"Contents"`
}

// UploadInvoiceFile 上传发票文件，返回可访问的 URL。
func UploadInvoiceFile(file *multipart.FileHeader) (string, error) {
	ext := strings.ToLower(filepath.Ext(file.Filename))
	contentType, ok := invoiceAllowedExts[ext]
	if !ok {
		return "", fmt.Errorf("不支持的文件格式：%s，仅允许 pdf/png/jpg/jpeg/webp", ext)
	}

	if file.Size > invoiceMaxFileSize {
		return "", fmt.Errorf("文件大小超过 20MB 限制")
	}

	key := fmt.Sprintf("invoices/%s%s", uuid.New().String(), ext)

	common.OptionMapRWMutex.RLock()
	backend := common.StorageBackend
	common.OptionMapRWMutex.RUnlock()

	if backend == "r2" {
		return uploadR2(file, key, contentType)
	}
	return uploadLocal(file, key)
}

func ListStorageObjects(prefix, continuationToken, search string, maxKeys int) (*StorageObjectListResult, error) {
	cfg, err := getR2StorageConfig()
	if err != nil {
		return nil, err
	}
	if maxKeys <= 0 {
		maxKeys = 50
	}
	if maxKeys > 200 {
		maxKeys = 200
	}

	normalizedPrefix := normalizeStoragePrefix(prefix)
	normalizedSearch := strings.ToLower(strings.TrimSpace(search))
	nextToken := strings.TrimSpace(continuationToken)
	items := make([]StorageObjectInfo, 0, maxKeys)
	var parsed listBucketResult

	for {
		queryParams := map[string]string{
			"list-type": "2",
			"max-keys":  strconv.Itoa(maxKeys),
		}
		if normalizedPrefix != "" {
			queryParams["prefix"] = normalizedPrefix
		}
		if nextToken != "" {
			queryParams["continuation-token"] = nextToken
		}

		req, reqErr := s3v4Sign("GET", cfg.Endpoint, cfg.Bucket, "", cfg.Region, cfg.AccessKey, cfg.SecretKey, queryParams, nil, "", nil)
		if reqErr != nil {
			return nil, fmt.Errorf("构造 R2 列表请求失败：%w", reqErr)
		}

		resp, respErr := http.DefaultClient.Do(req)
		if respErr != nil {
			return nil, fmt.Errorf("获取 R2 对象列表失败：%w", respErr)
		}

		respBody, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()
		if readErr != nil {
			return nil, fmt.Errorf("读取 R2 列表响应失败：%w", readErr)
		}
		if resp.StatusCode != http.StatusOK {
			return nil, fmt.Errorf("R2 返回错误 %d：%s", resp.StatusCode, string(respBody))
		}

		if err = xml.Unmarshal(respBody, &parsed); err != nil {
			return nil, fmt.Errorf("解析 R2 列表响应失败：%w", err)
		}

		for _, item := range parsed.Contents {
			if item.Key == "" || !matchesStorageSearch(item.Key, normalizedSearch) {
				continue
			}
			items = append(items, buildStorageObjectInfo(cfg, item.Key, item.Size, item.LastModified, strings.Trim(item.ETag, `"`)))
			if len(items) >= maxKeys {
				return &StorageObjectListResult{
					Backend:               cfg.Backend,
					Bucket:                cfg.Bucket,
					Endpoint:              cfg.Endpoint,
					PublicURL:             cfg.PublicURL,
					Prefix:                normalizedPrefix,
					Items:                 items,
					IsTruncated:           parsed.IsTruncated,
					NextContinuationToken: parsed.NextContinuationToken,
				}, nil
			}
		}

		if normalizedSearch == "" || !parsed.IsTruncated || parsed.NextContinuationToken == "" {
			break
		}
		nextToken = parsed.NextContinuationToken
	}

	return &StorageObjectListResult{
		Backend:               cfg.Backend,
		Bucket:                cfg.Bucket,
		Endpoint:              cfg.Endpoint,
		PublicURL:             cfg.PublicURL,
		Prefix:                normalizedPrefix,
		Items:                 items,
		IsTruncated:           parsed.IsTruncated,
		NextContinuationToken: parsed.NextContinuationToken,
	}, nil
}

func UploadStorageObject(file *multipart.FileHeader, prefix, objectKey, conflictStrategy string) (*StorageObjectInfo, error) {
	cfg, err := getR2StorageConfig()
	if err != nil {
		return nil, err
	}
	if file == nil {
		return nil, fmt.Errorf("未提供上传文件")
	}
	if file.Size > storageObjectMaxFileSize {
		return nil, fmt.Errorf("文件大小不能超过 100MB")
	}

	key := normalizeStorageKey(objectKey)
	if key == "" {
		key = buildStorageObjectKey(prefix, file.Filename)
	}

	strategy := normalizeConflictStrategy(conflictStrategy)
	exists, err := storageObjectExists(cfg, key)
	if err != nil {
		return nil, err
	}
	if exists {
		switch strategy {
		case "skip":
			result := buildStorageObjectInfo(cfg, key, file.Size, "", "")
			result.Status = "skipped"
			result.Message = "对象已存在，已跳过"
			return &result, nil
		case "error":
			return nil, fmt.Errorf("对象已存在：%s", key)
		}
	}

	contentType := detectContentType(file)
	if err = putObjectToR2(cfg, file, key, contentType); err != nil {
		return nil, err
	}

	result := buildStorageObjectInfo(cfg, key, file.Size, "", "")
	if exists {
		result.Status = "overwritten"
		result.Message = "对象已存在，已覆盖"
	} else {
		result.Status = "uploaded"
	}
	return &result, nil
}

func GetStorageObjectContent(key string, requestHeaders map[string]string) (*StorageObjectContent, error) {
	cfg, err := getR2StorageConfig()
	if err != nil {
		return nil, err
	}
	normalizedKey := normalizeStorageKey(key)
	if normalizedKey == "" {
		return nil, fmt.Errorf("对象 Key 不能为空")
	}

	extraHeaders := map[string]string{}
	for headerKey, headerValue := range requestHeaders {
		if strings.TrimSpace(headerValue) == "" {
			continue
		}
		extraHeaders[headerKey] = headerValue
	}

	req, err := s3v4Sign("GET", cfg.Endpoint, cfg.Bucket, normalizedKey, cfg.Region, cfg.AccessKey, cfg.SecretKey, nil, nil, "", extraHeaders)
	if err != nil {
		return nil, fmt.Errorf("构造 R2 读取请求失败：%w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("读取 R2 对象失败：%w", err)
	}

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusPartialContent {
		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("R2 返回错误 %d：%s", resp.StatusCode, string(respBody))
	}

	contentLength := resp.ContentLength
	if contentLength < 0 {
		contentLength = -1
	}

	return &StorageObjectContent{
		Body:               resp.Body,
		ContentType:        strings.TrimSpace(resp.Header.Get("Content-Type")),
		ContentLength:      contentLength,
		ContentDisposition: strings.TrimSpace(resp.Header.Get("Content-Disposition")),
		ContentRange:       strings.TrimSpace(resp.Header.Get("Content-Range")),
		AcceptRanges:       strings.TrimSpace(resp.Header.Get("Accept-Ranges")),
		CacheControl:       strings.TrimSpace(resp.Header.Get("Cache-Control")),
		LastModified:       strings.TrimSpace(resp.Header.Get("Last-Modified")),
		ETag:               strings.TrimSpace(resp.Header.Get("ETag")),
		StatusCode:         resp.StatusCode,
	}, nil
}

func DeleteStorageObject(key string) error {
	cfg, err := getR2StorageConfig()
	if err != nil {
		return err
	}
	normalizedKey := normalizeStorageKey(key)
	if normalizedKey == "" {
		return fmt.Errorf("对象 Key 不能为空")
	}

	req, err := s3v4Sign("DELETE", cfg.Endpoint, cfg.Bucket, normalizedKey, cfg.Region, cfg.AccessKey, cfg.SecretKey, nil, nil, "", nil)
	if err != nil {
		return fmt.Errorf("构造 R2 删除请求失败：%w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("删除 R2 对象失败：%w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("R2 返回错误 %d：%s", resp.StatusCode, string(respBody))
	}

	common.SysLog(fmt.Sprintf("R2 对象已删除：%s", normalizedKey))
	return nil
}

func DeleteStorageObjects(keys []string) (*StorageObjectBatchDeleteResult, error) {
	cfg, err := getR2StorageConfig()
	if err != nil {
		return nil, err
	}
	result := &StorageObjectBatchDeleteResult{
		DeletedKeys: make([]string, 0, len(keys)),
		FailedKeys:  map[string]string{},
	}
	for _, key := range keys {
		normalizedKey := normalizeStorageKey(key)
		if normalizedKey == "" {
			continue
		}
		if err = deleteStorageObjectWithConfig(cfg, normalizedKey); err != nil {
			result.FailedKeys[normalizedKey] = err.Error()
			continue
		}
		result.DeletedKeys = append(result.DeletedKeys, normalizedKey)
	}
	if len(result.FailedKeys) == 0 {
		result.FailedKeys = nil
	}
	return result, nil
}

func RenameStorageObject(oldKey, newKey string) (*StorageObjectInfo, error) {
	cfg, err := getR2StorageConfig()
	if err != nil {
		return nil, err
	}
	sourceKey := normalizeStorageKey(oldKey)
	targetKey := normalizeStorageKey(newKey)
	if sourceKey == "" || targetKey == "" {
		return nil, fmt.Errorf("对象 Key 不能为空")
	}
	if sourceKey == targetKey {
		return nil, fmt.Errorf("新旧对象 Key 不能相同")
	}

	exists, err := storageObjectExists(cfg, targetKey)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, fmt.Errorf("目标对象已存在：%s", targetKey)
	}

	if err = copyStorageObject(cfg, sourceKey, targetKey); err != nil {
		return nil, err
	}
	if err = deleteStorageObjectWithConfig(cfg, sourceKey); err != nil {
		rollbackErr := deleteStorageObjectWithConfig(cfg, targetKey)
		if rollbackErr != nil {
			return nil, fmt.Errorf("删除原对象失败：%v；回滚目标对象也失败：%v", err, rollbackErr)
		}
		return nil, fmt.Errorf("删除原对象失败，已回滚目标对象：%w", err)
	}

	common.SysLog(fmt.Sprintf("R2 对象已重命名：%s -> %s", sourceKey, targetKey))
	result := buildStorageObjectInfo(cfg, targetKey, 0, "", "")
	return &result, nil
}

// uploadLocal 保存到本地 ./data/uploads/{key}，返回 /uploads/{key}。
func uploadLocal(file *multipart.FileHeader, key string) (string, error) {
	dst := filepath.Join("data", "uploads", key)
	dir := filepath.Dir(dst)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", fmt.Errorf("创建目录失败：%w", err)
	}

	src, err := file.Open()
	if err != nil {
		return "", fmt.Errorf("打开上传文件失败：%w", err)
	}
	defer src.Close()

	out, err := os.Create(dst)
	if err != nil {
		return "", fmt.Errorf("创建本地文件失败：%w", err)
	}
	defer out.Close()

	if _, err = io.Copy(out, src); err != nil {
		return "", fmt.Errorf("写入本地文件失败：%w", err)
	}

	return "/" + filepath.ToSlash(filepath.Join("uploads", key)), nil
}

// uploadR2 通过 AWS SigV4 PUT 请求将文件上传到 R2/S3 兼容存储。
func uploadR2(file *multipart.FileHeader, key, contentType string) (string, error) {
	cfg, err := getR2StorageConfig()
	if err != nil {
		return "", err
	}
	if err = putObjectToR2(cfg, file, key, contentType); err != nil {
		return "", err
	}

	fileURL := buildStorageObjectURL(cfg, key)
	common.SysLog(fmt.Sprintf("发票文件已上传到 R2：%s", fileURL))
	return fileURL, nil
}

// ---------- SigV4 辅助函数 ----------

func hmacSHA256(key, data []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(data)
	return h.Sum(nil)
}

func sha256Hex(data []byte) string {
	h := sha256.Sum256(data)
	return hex.EncodeToString(h[:])
}

// s3v4Sign 构造带有 AWS SigV4 签名的请求。
func s3v4Sign(method, endpoint, bucket, key, region, accessKey, secretKey string, queryParams map[string]string, body []byte, contentType string, extraHeaders map[string]string) (*http.Request, error) {
	return s3v4SignWithPayloadReader(
		method,
		endpoint,
		bucket,
		key,
		region,
		accessKey,
		secretKey,
		queryParams,
		bytes.NewReader(body),
		int64(len(body)),
		sha256Hex(body),
		contentType,
		extraHeaders,
	)
}

func s3v4SignWithPayloadReader(method, endpoint, bucket, key, region, accessKey, secretKey string, queryParams map[string]string, bodyReader io.Reader, contentLength int64, payloadHash, contentType string, extraHeaders map[string]string) (*http.Request, error) {
	now := time.Now().UTC()
	dateStamp := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")

	normalizedKey := normalizeStorageKey(key)
	canonicalURI := "/" + awsEncodePath(bucket)
	if normalizedKey != "" {
		canonicalURI += "/" + awsEncodePath(normalizedKey)
	}

	canonicalQuery := buildCanonicalQueryString(queryParams)
	reqURL := strings.TrimSuffix(endpoint, "/") + canonicalURI
	if canonicalQuery != "" {
		reqURL += "?" + canonicalQuery
	}

	if payloadHash == "" {
		payloadHash = sha256Hex(nil)
	}

	host, err := extractHost(endpoint)
	if err != nil {
		return nil, err
	}

	canonicalHeadersMap := map[string]string{
		"host":                 host,
		"x-amz-content-sha256": payloadHash,
		"x-amz-date":           amzDate,
	}
	if contentType != "" {
		canonicalHeadersMap["content-type"] = contentType
	}
	for key, value := range extraHeaders {
		normalizedHeaderKey := strings.ToLower(strings.TrimSpace(key))
		if normalizedHeaderKey == "" {
			continue
		}
		canonicalHeadersMap[normalizedHeaderKey] = strings.TrimSpace(value)
	}

	headerKeys := make([]string, 0, len(canonicalHeadersMap))
	for key := range canonicalHeadersMap {
		headerKeys = append(headerKeys, key)
	}
	sort.Strings(headerKeys)

	var canonicalHeadersBuilder strings.Builder
	for _, key := range headerKeys {
		canonicalHeadersBuilder.WriteString(key)
		canonicalHeadersBuilder.WriteString(":")
		canonicalHeadersBuilder.WriteString(canonicalHeadersMap[key])
		canonicalHeadersBuilder.WriteString("\n")
	}
	canonicalHeaders := canonicalHeadersBuilder.String()
	signedHeaders := strings.Join(headerKeys, ";")

	canonicalRequest := strings.Join([]string{
		method,
		canonicalURI,
		canonicalQuery,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")

	// 待签字符串
	credentialScope := strings.Join([]string{dateStamp, region, "s3", "aws4_request"}, "/")
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		sha256Hex([]byte(canonicalRequest)),
	}, "\n")

	// 签名密钥派生
	signingKey := hmacSHA256(
		hmacSHA256(
			hmacSHA256(
				hmacSHA256(
					[]byte("AWS4"+secretKey),
					[]byte(dateStamp),
				),
				[]byte(region),
			),
			[]byte("s3"),
		),
		[]byte("aws4_request"),
	)

	signature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	authHeader := fmt.Sprintf(
		"AWS4-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s",
		accessKey, credentialScope, signedHeaders, signature,
	)

	if bodyReader == nil {
		bodyReader = bytes.NewReader(nil)
		contentLength = 0
	}

	req, err := http.NewRequest(method, reqURL, bodyReader)
	if err != nil {
		return nil, err
	}
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	for key, value := range extraHeaders {
		if strings.TrimSpace(key) == "" {
			continue
		}
		req.Header.Set(key, value)
	}
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", payloadHash)
	req.Header.Set("Authorization", authHeader)
	req.ContentLength = contentLength

	return req, nil
}

func getR2StorageConfig() (storageConfig, error) {
	cfg := getStorageConfig()
	if cfg.Backend != "r2" {
		return storageConfig{}, fmt.Errorf("当前存储后端不是 R2")
	}
	if cfg.Endpoint == "" || cfg.Bucket == "" || cfg.AccessKey == "" || cfg.SecretKey == "" {
		return storageConfig{}, fmt.Errorf("R2 存储配置不完整，请检查 StorageR2Endpoint/Bucket/AccessKey/SecretKey")
	}
	if cfg.Region == "" {
		cfg.Region = "auto"
	}
	return cfg, nil
}

func getStorageConfig() storageConfig {
	common.OptionMapRWMutex.RLock()
	defer common.OptionMapRWMutex.RUnlock()
	return storageConfig{
		Backend:   common.StorageBackend,
		Endpoint:  strings.TrimSuffix(strings.TrimSpace(common.StorageR2Endpoint), "/"),
		Bucket:    strings.Trim(strings.TrimSpace(common.StorageR2Bucket), "/"),
		Region:    strings.TrimSpace(common.StorageR2Region),
		AccessKey: strings.TrimSpace(common.StorageR2AccessKey),
		SecretKey: strings.TrimSpace(common.StorageR2SecretKey),
		PublicURL: strings.TrimSuffix(strings.TrimSpace(common.StorageR2PublicURL), "/"),
	}
}

func putObjectToR2(cfg storageConfig, file *multipart.FileHeader, key, contentType string) error {
	normalizedKey := normalizeStorageKey(key)
	if normalizedKey == "" {
		return fmt.Errorf("对象 Key 不能为空")
	}

	src, err := file.Open()
	if err != nil {
		return fmt.Errorf("打开上传文件失败：%w", err)
	}
	defer src.Close()

	tmpFile, err := os.CreateTemp("", "r2-upload-*")
	if err != nil {
		return fmt.Errorf("创建临时上传文件失败：%w", err)
	}
	tmpFilePath := tmpFile.Name()
	defer func() {
		_ = tmpFile.Close()
		_ = os.Remove(tmpFilePath)
	}()

	hasher := sha256.New()
	written, err := io.Copy(io.MultiWriter(tmpFile, hasher), src)
	if err != nil {
		return fmt.Errorf("读取文件内容失败：%w", err)
	}
	if _, err = tmpFile.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("重置临时上传文件失败：%w", err)
	}

	req, err := s3v4SignWithPayloadReader(
		"PUT",
		cfg.Endpoint,
		cfg.Bucket,
		normalizedKey,
		cfg.Region,
		cfg.AccessKey,
		cfg.SecretKey,
		nil,
		tmpFile,
		written,
		hex.EncodeToString(hasher.Sum(nil)),
		contentType,
		nil,
	)
	if err != nil {
		return fmt.Errorf("构造 R2 上传请求失败：%w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("上传到 R2 失败：%w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("R2 返回错误 %d：%s", resp.StatusCode, string(respBody))
	}
	return nil
}

func buildStorageObjectURL(cfg storageConfig, key string) string {
	normalizedKey := normalizeStorageKey(key)
	if cfg.PublicURL != "" {
		return cfg.PublicURL + "/" + normalizedKey
	}
	return cfg.Endpoint + "/" + awsEncodePath(cfg.Bucket) + "/" + awsEncodePath(normalizedKey)
}

func buildStorageObjectInfo(cfg storageConfig, key string, size int64, lastModified, etag string) StorageObjectInfo {
	name := path.Base(key)
	extension := strings.ToLower(filepath.Ext(name))
	return StorageObjectInfo{
		Key:          key,
		Name:         name,
		Extension:    extension,
		FileType:     detectStorageObjectType(key),
		Size:         size,
		LastModified: lastModified,
		ETag:         etag,
		URL:          buildStorageObjectURL(cfg, key),
	}
}

func normalizeStoragePrefix(prefix string) string {
	normalized := normalizeStorageKey(prefix)
	if normalized == "" {
		return ""
	}
	if strings.HasSuffix(strings.TrimSpace(strings.ReplaceAll(prefix, "\\", "/")), "/") {
		return normalized + "/"
	}
	return normalized
}

func normalizeStorageKey(key string) string {
	raw := strings.TrimSpace(strings.ReplaceAll(key, "\\", "/"))
	if raw == "" {
		return ""
	}
	cleaned := path.Clean("/" + raw)
	cleaned = strings.TrimPrefix(cleaned, "/")
	if cleaned == "." {
		return ""
	}
	return cleaned
}

func matchesStorageSearch(key, search string) bool {
	if search == "" {
		return true
	}
	return strings.Contains(strings.ToLower(key), search)
}

func buildStorageObjectKey(prefix, filename string) string {
	normalizedPrefix := normalizeStoragePrefix(prefix)
	safeName := sanitizeStorageFilename(filename)
	if normalizedPrefix == "" {
		return safeName
	}
	return normalizedPrefix + safeName
}

func sanitizeStorageFilename(filename string) string {
	normalized := strings.TrimSpace(strings.ReplaceAll(filename, "\\", "/"))
	base := path.Base(normalized)
	if base == "." || base == "/" || base == "" {
		return "file"
	}
	return base
}

func detectContentType(file *multipart.FileHeader) string {
	if file == nil {
		return "application/octet-stream"
	}
	if contentType := strings.TrimSpace(file.Header.Get("Content-Type")); contentType != "" {
		return contentType
	}
	src, err := file.Open()
	if err != nil {
		return "application/octet-stream"
	}
	defer src.Close()

	buf := make([]byte, 512)
	n, err := src.Read(buf)
	if err != nil && err != io.EOF {
		return "application/octet-stream"
	}
	return http.DetectContentType(buf[:n])
}

func detectStorageObjectType(key string) string {
	ext := strings.ToLower(filepath.Ext(key))
	switch ext {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg":
		return "image"
	case ".pdf":
		return "pdf"
	case ".mp4", ".mov", ".webm", ".mkv", ".avi":
		return "video"
	case ".mp3", ".wav", ".ogg", ".m4a", ".flac":
		return "audio"
	case ".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml", ".html":
		return "text"
	default:
		return "file"
	}
}

func normalizeConflictStrategy(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "overwrite":
		return "overwrite"
	case "skip":
		return "skip"
	case "error":
		return "error"
	default:
		return "error"
	}
}

func extractHost(endpoint string) (string, error) {
	parsed, err := url.Parse(strings.TrimSpace(endpoint))
	if err != nil {
		return "", fmt.Errorf("解析 R2 Endpoint 失败：%w", err)
	}
	if parsed.Host == "" {
		return "", fmt.Errorf("无效的 R2 Endpoint：%s", endpoint)
	}
	return parsed.Host, nil
}

func copyStorageObject(cfg storageConfig, sourceKey, targetKey string) error {
	copySource := "/" + awsEncodePath(cfg.Bucket) + "/" + awsEncodePath(sourceKey)
	req, err := s3v4Sign("PUT", cfg.Endpoint, cfg.Bucket, targetKey, cfg.Region, cfg.AccessKey, cfg.SecretKey, nil, nil, "", map[string]string{
		"x-amz-copy-source": copySource,
	})
	if err != nil {
		return fmt.Errorf("构造 R2 复制请求失败：%w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("复制 R2 对象失败：%w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("R2 返回错误 %d：%s", resp.StatusCode, string(respBody))
	}
	return nil
}

func deleteStorageObjectWithConfig(cfg storageConfig, key string) error {
	req, err := s3v4Sign("DELETE", cfg.Endpoint, cfg.Bucket, key, cfg.Region, cfg.AccessKey, cfg.SecretKey, nil, nil, "", nil)
	if err != nil {
		return fmt.Errorf("构造 R2 删除请求失败：%w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return fmt.Errorf("删除 R2 对象失败：%w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("R2 返回错误 %d：%s", resp.StatusCode, string(respBody))
	}
	return nil
}

func storageObjectExists(cfg storageConfig, key string) (bool, error) {
	req, err := s3v4Sign("HEAD", cfg.Endpoint, cfg.Bucket, key, cfg.Region, cfg.AccessKey, cfg.SecretKey, nil, nil, "", nil)
	if err != nil {
		return false, fmt.Errorf("构造 R2 HEAD 请求失败：%w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("查询 R2 对象状态失败：%w", err)
	}
	defer resp.Body.Close()

	switch resp.StatusCode {
	case http.StatusOK:
		return true, nil
	case http.StatusNotFound:
		return false, nil
	default:
		respBody, _ := io.ReadAll(resp.Body)
		return false, fmt.Errorf("R2 返回错误 %d：%s", resp.StatusCode, string(respBody))
	}
}

func buildCanonicalQueryString(params map[string]string) string {
	if len(params) == 0 {
		return ""
	}
	keys := make([]string, 0, len(params))
	for key := range params {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		parts = append(parts, awsEncodeQueryComponent(key)+"="+awsEncodeQueryComponent(params[key]))
	}
	return strings.Join(parts, "&")
}

func awsEncodePath(value string) string {
	parts := strings.Split(value, "/")
	for i, part := range parts {
		parts[i] = awsEncodeQueryComponent(part)
	}
	return strings.Join(parts, "/")
}

func awsEncodeQueryComponent(value string) string {
	encoded := url.QueryEscape(value)
	encoded = strings.ReplaceAll(encoded, "+", "%20")
	encoded = strings.ReplaceAll(encoded, "*", "%2A")
	encoded = strings.ReplaceAll(encoded, "%7E", "~")
	return encoded
}
