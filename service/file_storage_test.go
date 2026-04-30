package service

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
)

const tinyPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR42mNk+M8AAwUBARVTX3wAAAAASUVORK5CYII="

func TestBuildImageResultCacheObjectKeyUsesRequestAndContentType(t *testing.T) {
	key := buildImageResultCacheObjectKey(
		"req/image:123",
		2,
		"https://cdn.example.com/path/image",
		"image/webp",
	)

	if key != "image-cache/req-image-123/2.webp" {
		t.Fatalf("unexpected key: %s", key)
	}
}

func TestImageResultCacheExtensionPrefersURLImageExtension(t *testing.T) {
	ext := imageResultCacheExtension(
		"https://cdn.example.com/output/a.png?token=secret",
		"application/octet-stream",
	)

	if ext != ".png" {
		t.Fatalf("unexpected extension: %s", ext)
	}
}

func TestDecodeBase64ImageResultCachePayloadAcceptsDataURI(t *testing.T) {
	payload, contentType, originName, err := decodeBase64ImageResultCachePayload("data:image/png;base64," + tinyPNGBase64)
	if err != nil {
		t.Fatalf("decode payload failed: %v", err)
	}
	if len(payload) == 0 {
		t.Fatal("expected decoded payload")
	}
	if contentType != "image/png" {
		t.Fatalf("unexpected content type: %s", contentType)
	}
	if originName != "base64.png" {
		t.Fatalf("unexpected origin name: %s", originName)
	}
}

func TestCacheBase64ImageResultURLReturnsEmptyWhenStorageBackendIsLocal(t *testing.T) {
	originalBackend := common.StorageBackend
	common.StorageBackend = "local"
	t.Cleanup(func() {
		common.StorageBackend = originalBackend
	})

	url, err := CacheBase64ImageResultURL("req-image-123", 0, tinyPNGBase64)
	if err != nil {
		t.Fatalf("cache base64 image failed: %v", err)
	}
	if url != "" {
		t.Fatalf("expected no cache url for local storage backend, got %s", url)
	}
}
