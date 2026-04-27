package service

import "testing"

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
