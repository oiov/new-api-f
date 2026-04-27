package openai

import (
	"errors"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"

	"github.com/gin-gonic/gin"
)

func TestExtractImageResultURLs(t *testing.T) {
	body := []byte(`{
		"created": 1710000000,
		"data": [
			{"url": "https://cdn.example.com/a.png"},
			{"b64_json": "abc"},
			{"url": "https://cdn.example.com/b.png"}
		]
	}`)

	urls := extractImageResultURLs(body)

	if len(urls) != 2 {
		t.Fatalf("expected 2 urls, got %d: %v", len(urls), urls)
	}
	if urls[0] != "https://cdn.example.com/a.png" || urls[1] != "https://cdn.example.com/b.png" {
		t.Fatalf("unexpected urls: %v", urls)
	}
}

func TestPrepareImageResponseBodyCachesURLsBeforeWritingResponse(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	c.Set(common.RequestIdKey, "req_image_123")

	originalCache := cacheImageResultURL
	cacheImageResultURL = func(requestId string, index int, originURL string) (string, error) {
		if requestId != "req_image_123" {
			t.Fatalf("unexpected request id: %s", requestId)
		}
		return "https://r2.example.com/cache/req_image_123/" + strings.TrimPrefix(originURL, "https://cdn.example.com/"), nil
	}
	t.Cleanup(func() {
		cacheImageResultURL = originalCache
	})

	body := []byte(`{
		"created": 1710000000,
		"data": [
			{"url": "https://cdn.example.com/a.png"},
			{"url": "https://cdn.example.com/b.png"}
		],
		"usage": {"total_tokens": 2}
	}`)

	preparedBody, urls := prepareImageResponseBody(c, body)

	if len(urls) != 2 {
		t.Fatalf("expected 2 urls, got %d: %v", len(urls), urls)
	}
	if urls[0] != "https://r2.example.com/cache/req_image_123/a.png" || urls[1] != "https://r2.example.com/cache/req_image_123/b.png" {
		t.Fatalf("unexpected cached urls: %v", urls)
	}
	prepared := string(preparedBody)
	if !strings.Contains(prepared, `"url":"https://r2.example.com/cache/req_image_123/a.png"`) ||
		!strings.Contains(prepared, `"url":"https://r2.example.com/cache/req_image_123/b.png"`) {
		t.Fatalf("response body did not contain cached urls: %s", prepared)
	}
	if !strings.Contains(prepared, `"usage":{"total_tokens":2}`) {
		t.Fatalf("response body lost original fields: %s", prepared)
	}
}

func TestPrepareImageResponseBodyFallsBackToOriginURLWhenCacheFails(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	c.Set(common.RequestIdKey, "req_image_123")

	originalCache := cacheImageResultURL
	cacheImageResultURL = func(requestId string, index int, originURL string) (string, error) {
		return "", errors.New("r2 upload failed")
	}
	t.Cleanup(func() {
		cacheImageResultURL = originalCache
	})

	body := []byte(`{
		"created": 1710000000,
		"data": [
			{"url": "https://cdn.example.com/a.png"}
		]
	}`)

	preparedBody, urls := prepareImageResponseBody(c, body)

	if len(urls) != 1 || urls[0] != "https://cdn.example.com/a.png" {
		t.Fatalf("expected fallback origin url, got %v", urls)
	}
	if !strings.Contains(string(preparedBody), `https://cdn.example.com/a.png`) {
		t.Fatalf("response body did not preserve origin url: %s", string(preparedBody))
	}
}
