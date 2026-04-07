package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/google/uuid"
)

const invoiceMaxFileSize = 20 << 20 // 20MB

var invoiceAllowedExts = map[string]string{
	".pdf":  "application/pdf",
	".png":  "image/png",
	".jpg":  "image/jpeg",
	".jpeg": "image/jpeg",
	".webp": "image/webp",
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
	common.OptionMapRWMutex.RLock()
	endpoint := common.StorageR2Endpoint
	bucket := common.StorageR2Bucket
	region := common.StorageR2Region
	accessKey := common.StorageR2AccessKey
	secretKey := common.StorageR2SecretKey
	publicURL := common.StorageR2PublicURL
	common.OptionMapRWMutex.RUnlock()

	if endpoint == "" || bucket == "" || accessKey == "" || secretKey == "" {
		return "", fmt.Errorf("R2 存储配置不完整，请检查 StorageR2Endpoint/Bucket/AccessKey/SecretKey")
	}
	if region == "" {
		region = "auto"
	}

	src, err := file.Open()
	if err != nil {
		return "", fmt.Errorf("打开上传文件失败：%w", err)
	}
	defer src.Close()

	body, err := io.ReadAll(src)
	if err != nil {
		return "", fmt.Errorf("读取文件内容失败：%w", err)
	}

	req, err := s3v4Sign("PUT", endpoint, bucket, key, region, accessKey, secretKey, body, contentType)
	if err != nil {
		return "", fmt.Errorf("构造 R2 上传请求失败：%w", err)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("上传到 R2 失败：%w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("R2 返回错误 %d：%s", resp.StatusCode, string(respBody))
	}

	var fileURL string
	if publicURL != "" {
		fileURL = strings.TrimSuffix(publicURL, "/") + "/" + key
	} else {
		fileURL = strings.TrimSuffix(endpoint, "/") + "/" + bucket + "/" + key
	}

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

// s3v4Sign 构造带有 AWS SigV4 签名的 PUT 请求。
func s3v4Sign(method, endpoint, bucket, key, region, accessKey, secretKey string, body []byte, contentType string) (*http.Request, error) {
	now := time.Now().UTC()
	dateStamp := now.Format("20060102")
	amzDate := now.Format("20060102T150405Z")

	reqURL := strings.TrimSuffix(endpoint, "/") + "/" + bucket + "/" + key

	payloadHash := sha256Hex(body)

	// 规范化 host（去掉 scheme）
	host := endpoint
	if idx := strings.Index(host, "://"); idx >= 0 {
		host = host[idx+3:]
	}
	host = strings.TrimSuffix(host, "/")

	// 规范化请求
	canonicalHeaders := fmt.Sprintf(
		"content-type:%s\nhost:%s\nx-amz-content-sha256:%s\nx-amz-date:%s\n",
		contentType, host, payloadHash, amzDate,
	)
	signedHeaders := "content-type;host;x-amz-content-sha256;x-amz-date"
	canonicalURI := "/" + bucket + "/" + key

	canonicalRequest := strings.Join([]string{
		method,
		canonicalURI,
		"", // query string
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

	req, err := http.NewRequest(method, reqURL, strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", payloadHash)
	req.Header.Set("Authorization", authHeader)
	req.ContentLength = int64(len(body))

	return req, nil
}
