package openai

import (
	"errors"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"

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

	preparedBody, urls := prepareImageResponseBody(c, nil, body)

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

	preparedBody, urls := prepareImageResponseBody(c, nil, body)

	if len(urls) != 1 || urls[0] != "https://cdn.example.com/a.png" {
		t.Fatalf("expected fallback origin url, got %v", urls)
	}
	if !strings.Contains(string(preparedBody), `https://cdn.example.com/a.png`) {
		t.Fatalf("response body did not preserve origin url: %s", string(preparedBody))
	}
}

func TestPrepareImageResponseBodyConvertsBase64ToURLWhenURLRequested(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	c.Set(common.RequestIdKey, "req_image_123")

	originalCache := cacheBase64ImageResultURL
	cacheBase64ImageResultURL = func(requestId string, index int, base64Data string) (string, error) {
		if requestId != "req_image_123" {
			t.Fatalf("unexpected request id: %s", requestId)
		}
		if index != 0 {
			t.Fatalf("unexpected index: %d", index)
		}
		if base64Data != "abc" {
			t.Fatalf("unexpected base64 data: %s", base64Data)
		}
		return "https://r2.example.com/cache/req_image_123/0.png", nil
	}
	t.Cleanup(func() {
		cacheBase64ImageResultURL = originalCache
	})

	info := &relaycommon.RelayInfo{
		Request: &dto.ImageRequest{
			ResponseFormat: "url",
		},
	}
	body := []byte(`{
		"created": 1710000000,
		"data": [
			{"b64_json": "abc", "revised_prompt": "draw a square"}
		],
		"usage": {"total_tokens": 2}
	}`)

	preparedBody, urls := prepareImageResponseBody(c, info, body)

	if len(urls) != 1 || urls[0] != "https://r2.example.com/cache/req_image_123/0.png" {
		t.Fatalf("unexpected cached urls: %v", urls)
	}
	prepared := string(preparedBody)
	if !strings.Contains(prepared, `"url":"https://r2.example.com/cache/req_image_123/0.png"`) {
		t.Fatalf("response body did not contain cached url: %s", prepared)
	}
	if strings.Contains(prepared, `"b64_json":"abc"`) {
		t.Fatalf("url response should not expose upstream base64: %s", prepared)
	}
	if !strings.Contains(prepared, `"usage":{"total_tokens":2}`) {
		t.Fatalf("response body lost original fields: %s", prepared)
	}
}

func TestPrepareImageResponseBodyConvertsDataURIURLToCachedURLWhenURLRequested(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	c.Set(common.RequestIdKey, "req_image_123")

	dataURI := "data:image/png;base64,abc"
	originalCache := cacheBase64ImageResultURL
	cacheBase64ImageResultURL = func(requestId string, index int, base64Data string) (string, error) {
		if base64Data != dataURI {
			t.Fatalf("unexpected base64 data: %s", base64Data)
		}
		return "https://r2.example.com/cache/req_image_123/0.png", nil
	}
	t.Cleanup(func() {
		cacheBase64ImageResultURL = originalCache
	})

	info := &relaycommon.RelayInfo{
		Request: &dto.ImageRequest{
			ResponseFormat: "url",
		},
	}
	body := []byte(`{
		"created": 1710000000,
		"data": [
			{"url": "data:image/png;base64,abc", "revised_prompt": "draw a square"}
		]
	}`)

	preparedBody, urls := prepareImageResponseBody(c, info, body)

	if len(urls) != 1 || urls[0] != "https://r2.example.com/cache/req_image_123/0.png" {
		t.Fatalf("unexpected cached urls: %v", urls)
	}
	prepared := string(preparedBody)
	if !strings.Contains(prepared, `"url":"https://r2.example.com/cache/req_image_123/0.png"`) {
		t.Fatalf("response body did not contain cached url: %s", prepared)
	}
	if strings.Contains(prepared, dataURI) {
		t.Fatalf("url response should not expose upstream data URI: %s", prepared)
	}
}

func TestPrepareImageResponseBodyPreservesBase64WhenBase64RequestedAndCachesURL(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(nil)
	c.Set(common.RequestIdKey, "req_image_123")

	originalCache := cacheBase64ImageResultURL
	cacheBase64ImageResultURL = func(requestId string, index int, base64Data string) (string, error) {
		return "https://r2.example.com/cache/req_image_123/0.png", nil
	}
	t.Cleanup(func() {
		cacheBase64ImageResultURL = originalCache
	})

	info := &relaycommon.RelayInfo{
		Request: &dto.ImageRequest{
			ResponseFormat: "b64_json",
		},
	}
	body := []byte(`{
		"created": 1710000000,
		"data": [
			{"b64_json": "abc", "revised_prompt": "draw a square"}
		]
	}`)

	preparedBody, urls := prepareImageResponseBody(c, info, body)

	if len(urls) != 1 || urls[0] != "https://r2.example.com/cache/req_image_123/0.png" {
		t.Fatalf("unexpected cached urls: %v", urls)
	}
	prepared := string(preparedBody)
	if !strings.Contains(prepared, `"b64_json": "abc"`) && !strings.Contains(prepared, `"b64_json":"abc"`) {
		t.Fatalf("base64 response should preserve upstream base64: %s", prepared)
	}
	if strings.Contains(prepared, `"url":"https://r2.example.com/cache/req_image_123/0.png"`) {
		t.Fatalf("base64 response should not expose cached url to client: %s", prepared)
	}
}
