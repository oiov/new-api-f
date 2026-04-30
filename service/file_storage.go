package service

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/xml"
	"fmt"
	"io"
	"mime"
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
	"unicode"

	"github.com/QuantumNous/new-api/common"
	"github.com/google/uuid"
)

const invoiceMaxFileSize = 20 << 20        // 20MB
const storageObjectMaxFileSize = 100 << 20 // 100MB
const imageResultCacheMaxBytes = 50 << 20  // 50MB

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

type StorageDirectoryCreateResult struct {
	Key     string `json:"key"`
	Name    string `json:"name"`
	Created bool   `json:"created"`
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
	CommonPrefixes        []struct {
		Prefix string `xml:"Prefix"`
	} `xml:"CommonPrefixes"`
	Contents []struct {
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

func CacheRemoteImageResultURL(requestID string, index int, originURL string) (string, error) {
	originURL = strings.TrimSpace(originURL)
	if originURL == "" {
		return "", fmt.Errorf("图片 URL 不能为空")
	}

	cfg := getStorageConfig()
	if cfg.Backend != "r2" {
		return originURL, nil
	}

	cfg, err := getR2StorageConfig()
	if err != nil {
		return "", err
	}
	if isStorageObjectURL(cfg, originURL) {
		return originURL, nil
	}

	resp, err := DoDownloadRequest(originURL, "image result cache")
	if err != nil {
		return "", fmt.Errorf("下载图片失败：%w", err)
	}
	defer CloseResponseBodyGracefully(resp)

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", fmt.Errorf("下载图片失败，源站状态码 %d", resp.StatusCode)
	}
	if resp.ContentLength > imageResultCacheMaxBytes {
		return "", fmt.Errorf("图片文件过大，无法缓存到 R2")
	}

	contentType := normalizeImageResultCacheContentType(originURL, resp.Header.Get("Content-Type"))
	if contentType != "application/octet-stream" && !strings.HasPrefix(contentType, "image/") {
		return "", fmt.Errorf("invalid content type: %s, required image/*", contentType)
	}

	tmpFile, err := os.CreateTemp("", "r2-image-cache-*")
	if err != nil {
		return "", fmt.Errorf("创建图片缓存临时文件失败：%w", err)
	}
	tmpFilePath := tmpFile.Name()
	defer func() {
		_ = tmpFile.Close()
		_ = os.Remove(tmpFilePath)
	}()

	hasher := sha256.New()
	written, err := io.Copy(io.MultiWriter(tmpFile, hasher), io.LimitReader(resp.Body, imageResultCacheMaxBytes+1))
	if err != nil {
		return "", fmt.Errorf("读取图片内容失败：%w", err)
	}
	if written > imageResultCacheMaxBytes {
		return "", fmt.Errorf("图片文件过大，无法缓存到 R2")
	}
	if _, err = tmpFile.Seek(0, io.SeekStart); err != nil {
		return "", fmt.Errorf("重置图片缓存临时文件失败：%w", err)
	}

	key := buildImageResultCacheObjectKey(requestID, index, originURL, contentType)
	if err = putObjectReaderToR2(cfg, key, tmpFile, written, hex.EncodeToString(hasher.Sum(nil)), contentType); err != nil {
		return "", err
	}
	return buildStorageObjectURL(cfg, key), nil
}

func CacheBase64ImageResultURL(requestID string, index int, base64Data string) (string, error) {
	base64Data = strings.TrimSpace(base64Data)
	if base64Data == "" {
		return "", fmt.Errorf("图片 base64 不能为空")
	}

	cfg := getStorageConfig()
	if cfg.Backend != "r2" {
		return "", nil
	}

	cfg, err := getR2StorageConfig()
	if err != nil {
		return "", err
	}

	payload, contentType, originName, err := decodeBase64ImageResultCachePayload(base64Data)
	if err != nil {
		return "", err
	}
	key := buildImageResultCacheObjectKey(requestID, index, originName, contentType)
	if err = putBytesToR2(cfg, key, payload, contentType); err != nil {
		return "", err
	}
	return buildStorageObjectURL(cfg, key), nil
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
		parsed = listBucketResult{}
		queryParams := map[string]string{
			"list-type": "2",
			"max-keys":  strconv.Itoa(maxKeys),
		}
		if normalizedSearch == "" {
			queryParams["delimiter"] = "/"
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

		for _, prefixItem := range parsed.CommonPrefixes {
			if prefixItem.Prefix == "" || prefixItem.Prefix == normalizedPrefix {
				continue
			}
			items = append(items, buildStorageDirectoryInfo(prefixItem.Prefix))
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

		for _, item := range parsed.Contents {
			if item.Key == "" || strings.HasSuffix(item.Key, "/") || !matchesStorageSearch(item.Key, normalizedSearch) {
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

func GetStorageObjectAccessURL(key string, expiresSeconds int) (string, int64, error) {
	cfg, err := getR2StorageConfig()
	if err != nil {
		return "", 0, err
	}
	normalizedKey := normalizeStorageKey(key)
	if normalizedKey == "" {
		return "", 0, fmt.Errorf("对象 Key 不能为空")
	}
	if strings.HasSuffix(normalizedKey, "/") {
		return "", 0, fmt.Errorf("目录不支持生成访问链接")
	}
	if cfg.PublicURL != "" {
		return buildStorageObjectURL(cfg, normalizedKey), 0, nil
	}

	expiresAt := time.Now().UTC().Add(5 * time.Minute)
	url, err := presignStorageObjectURL(cfg, normalizedKey, expiresAt)
	if err != nil {
		return "", 0, err
	}
	return url, expiresAt.Unix(), nil
}

func UpdateStorageObjectContent(key string, content []byte, contentType string) (*StorageObjectInfo, error) {
	cfg, err := getR2StorageConfig()
	if err != nil {
		return nil, err
	}

	normalizedKey := normalizeStorageKey(key)
	if normalizedKey == "" {
		return nil, fmt.Errorf("对象 Key 不能为空")
	}
	if strings.HasSuffix(normalizedKey, "/") {
		return nil, fmt.Errorf("目录不支持在线编辑")
	}
	if !isStorageObjectEditable(normalizedKey) {
		return nil, fmt.Errorf("当前文件类型暂不支持在线编辑")
	}

	exists, err := storageObjectExists(cfg, normalizedKey)
	if err != nil {
		return nil, err
	}
	if !exists {
		return nil, fmt.Errorf("对象不存在：%s", normalizedKey)
	}

	resolvedContentType := resolveStorageObjectContentType(normalizedKey, contentType)
	if err = putBytesToR2(cfg, normalizedKey, content, resolvedContentType); err != nil {
		return nil, err
	}

	common.SysLog(fmt.Sprintf("R2 对象内容已更新：%s", normalizedKey))
	result := buildStorageObjectInfo(cfg, normalizedKey, int64(len(content)), "", "")
	return &result, nil
}

func CreateStorageDirectory(prefix, name string) (*StorageObjectInfo, error) {
	cfg, err := getR2StorageConfig()
	if err != nil {
		return nil, err
	}

	directoryName := sanitizeStorageDirectoryName(name)
	if directoryName == "" {
		return nil, fmt.Errorf("目录名不能为空")
	}

	baseKey := normalizeStorageKey(buildStorageObjectKey(prefix, directoryName))
	if baseKey == "" {
		return nil, fmt.Errorf("目录 Key 不能为空")
	}
	directoryKey := baseKey + "/"

	exists, err := storageObjectExists(cfg, directoryKey)
	if err != nil {
		return nil, err
	}
	if exists {
		return nil, fmt.Errorf("目录已存在：%s", directoryKey)
	}

	if err = putBytesToR2(cfg, directoryKey, []byte{}, "application/x-directory"); err != nil {
		return nil, err
	}

	result := buildStorageDirectoryInfo(directoryKey)
	return &result, nil
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

	return putObjectReaderToR2(
		cfg,
		normalizedKey,
		tmpFile,
		written,
		hex.EncodeToString(hasher.Sum(nil)),
		contentType,
	)
}

func putBytesToR2(cfg storageConfig, key string, body []byte, contentType string) error {
	payloadHash := sha256Hex(body)
	return putObjectReaderToR2(
		cfg,
		key,
		bytes.NewReader(body),
		int64(len(body)),
		payloadHash,
		contentType,
	)
}

func putObjectReaderToR2(cfg storageConfig, key string, body io.Reader, contentLength int64, payloadHash, contentType string) error {
	req, err := s3v4SignWithPayloadReader(
		"PUT",
		cfg.Endpoint,
		cfg.Bucket,
		key,
		cfg.Region,
		cfg.AccessKey,
		cfg.SecretKey,
		nil,
		body,
		contentLength,
		payloadHash,
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

func buildStorageDirectoryInfo(prefix string) StorageObjectInfo {
	normalizedPrefix := normalizeStoragePrefix(prefix)
	name := strings.TrimSuffix(normalizedPrefix, "/")
	name = path.Base(name)
	if name == "." || name == "/" || name == "" {
		name = normalizedPrefix
	}
	return StorageObjectInfo{
		Key:      normalizedPrefix,
		Name:     name,
		FileType: "directory",
		Size:     0,
		URL:      "",
	}
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

func buildImageResultCacheObjectKey(requestID string, index int, originURL, contentType string) string {
	safeRequestID := sanitizeStoragePathSegment(requestID)
	if safeRequestID == "" {
		safeRequestID = sha256Hex([]byte(strings.TrimSpace(originURL)))[:16]
	}
	return fmt.Sprintf("image-cache/%s/%d%s", safeRequestID, index, imageResultCacheExtension(originURL, contentType))
}

func decodeBase64ImageResultCachePayload(base64Data string) ([]byte, string, string, error) {
	_, format, cleanBase64, err := DecodeBase64ImageData(base64Data)
	if err != nil {
		return nil, "", "", fmt.Errorf("解析 base64 图片失败：%w", err)
	}
	payload, err := base64.StdEncoding.DecodeString(cleanBase64)
	if err != nil {
		return nil, "", "", fmt.Errorf("解码 base64 图片失败：%w", err)
	}
	if int64(len(payload)) > imageResultCacheMaxBytes {
		return nil, "", "", fmt.Errorf("图片文件过大，无法缓存到 R2")
	}
	contentType := imageResultCacheContentTypeFromFormat(format)
	originName := "base64" + imageResultCacheExtension("", contentType)
	return payload, contentType, originName, nil
}

func imageResultCacheContentTypeFromFormat(format string) string {
	switch strings.ToLower(strings.TrimSpace(format)) {
	case "jpg", "jpeg":
		return "image/jpeg"
	case "png":
		return "image/png"
	case "gif":
		return "image/gif"
	case "webp":
		return "image/webp"
	case "bmp":
		return "image/bmp"
	case "svg":
		return "image/svg+xml"
	default:
		return "application/octet-stream"
	}
}

func imageResultCacheExtension(originURL, contentType string) string {
	if parsed, err := url.Parse(strings.TrimSpace(originURL)); err == nil {
		if ext := strings.ToLower(path.Ext(parsed.Path)); isImageCacheExtension(ext) {
			return ext
		}
	}
	if exts, _ := mime.ExtensionsByType(strings.TrimSpace(contentType)); len(exts) > 0 {
		if ext := strings.ToLower(exts[0]); isImageCacheExtension(ext) {
			return ext
		}
	}
	return ".png"
}

func isImageCacheExtension(ext string) bool {
	switch strings.ToLower(ext) {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg":
		return true
	default:
		return false
	}
}

func normalizeImageResultCacheContentType(originURL, contentType string) string {
	if idx := strings.Index(contentType, ";"); idx >= 0 {
		contentType = contentType[:idx]
	}
	contentType = strings.TrimSpace(strings.ToLower(contentType))
	if contentType != "" {
		return contentType
	}
	if parsed, err := url.Parse(strings.TrimSpace(originURL)); err == nil {
		if guessed := mime.TypeByExtension(strings.ToLower(path.Ext(parsed.Path))); guessed != "" {
			return guessed
		}
	}
	return "application/octet-stream"
}

func sanitizeStoragePathSegment(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	var builder strings.Builder
	lastDash := false
	for _, r := range value {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '_' || r == '-' {
			builder.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			builder.WriteByte('-')
			lastDash = true
		}
	}
	return strings.Trim(builder.String(), "-")
}

func isStorageObjectURL(cfg storageConfig, rawURL string) bool {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return false
	}
	if cfg.PublicURL != "" && strings.HasPrefix(rawURL, cfg.PublicURL+"/") {
		return true
	}
	storagePrefix := strings.TrimSuffix(buildStorageObjectURL(cfg, ""), "/") + "/"
	return strings.HasPrefix(rawURL, storagePrefix)
}

func sanitizeStorageFilename(filename string) string {
	normalized := strings.TrimSpace(strings.ReplaceAll(filename, "\\", "/"))
	base := path.Base(normalized)
	if base == "." || base == "/" || base == "" {
		return "file"
	}
	return base
}

func sanitizeStorageDirectoryName(name string) string {
	normalized := strings.TrimSpace(strings.ReplaceAll(name, "\\", "/"))
	normalized = strings.Trim(normalized, "/")
	if normalized == "" {
		return ""
	}
	base := path.Base(normalized)
	if base == "." || base == "/" || base == "" {
		return ""
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
	if strings.HasSuffix(strings.TrimSpace(key), "/") {
		return "directory"
	}
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
	case ".xlsx", ".xls", ".csv", ".tsv":
		return "spreadsheet"
	case ".txt", ".md", ".json", ".xml", ".yaml", ".yml", ".html":
		return "text"
	default:
		return "file"
	}
}

func resolveStorageObjectContentType(key, contentType string) string {
	trimmedContentType := strings.TrimSpace(contentType)
	if trimmedContentType != "" {
		return trimmedContentType
	}

	if guessed := strings.TrimSpace(mime.TypeByExtension(strings.ToLower(filepath.Ext(key)))); guessed != "" {
		if strings.HasPrefix(guessed, "text/") && !strings.Contains(strings.ToLower(guessed), "charset=") {
			return guessed + "; charset=utf-8"
		}
		return guessed
	}

	return "text/plain; charset=utf-8"
}

func isStorageObjectEditable(key string) bool {
	switch strings.ToLower(filepath.Ext(key)) {
	case ".txt", ".md", ".markdown", ".json", ".js", ".jsx", ".ts", ".tsx",
		".css", ".scss", ".less", ".go", ".py", ".java", ".sh", ".yaml",
		".yml", ".xml", ".html", ".htm":
		return true
	default:
		return false
	}
}

func presignStorageObjectURL(cfg storageConfig, key string, expiresAt time.Time) (string, error) {
	host, err := extractHost(cfg.Endpoint)
	if err != nil {
		return "", err
	}

	now := time.Now().UTC()
	if expiresAt.Before(now) {
		expiresAt = now.Add(5 * time.Minute)
	}
	expiresIn := int(expiresAt.Sub(now).Seconds())
	if expiresIn <= 0 {
		expiresIn = 300
	}
	if expiresIn > 3600 {
		expiresIn = 3600
	}

	dateStamp := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")
	credentialScope := strings.Join([]string{dateStamp, cfg.Region, "s3", "aws4_request"}, "/")
	canonicalURI := "/" + awsEncodePath(cfg.Bucket) + "/" + awsEncodePath(normalizeStorageKey(key))

	queryParams := map[string]string{
		"X-Amz-Algorithm":     "AWS4-HMAC-SHA256",
		"X-Amz-Credential":    cfg.AccessKey + "/" + credentialScope,
		"X-Amz-Date":          amzDate,
		"X-Amz-Expires":       strconv.Itoa(expiresIn),
		"X-Amz-SignedHeaders": "host",
	}
	canonicalQuery := buildCanonicalQueryString(queryParams)
	canonicalHeaders := "host:" + host + "\n"
	signedHeaders := "host"
	payloadHash := "UNSIGNED-PAYLOAD"

	canonicalRequest := strings.Join([]string{
		"GET",
		canonicalURI,
		canonicalQuery,
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")

	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		sha256Hex([]byte(canonicalRequest)),
	}, "\n")

	signingKey := hmacSHA256(
		hmacSHA256(
			hmacSHA256(
				hmacSHA256(
					[]byte("AWS4"+cfg.SecretKey),
					[]byte(dateStamp),
				),
				[]byte(cfg.Region),
			),
			[]byte("s3"),
		),
		[]byte("aws4_request"),
	)
	signature := hex.EncodeToString(hmacSHA256(signingKey, []byte(stringToSign)))

	return strings.TrimSuffix(cfg.Endpoint, "/") + canonicalURI + "?" + canonicalQuery + "&X-Amz-Signature=" + signature, nil
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
