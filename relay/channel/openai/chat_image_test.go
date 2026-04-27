package openai

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func TestIsChatImageGenerationRequestOnlyMatchesChatImageModels(t *testing.T) {
	imageInfo := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeChatCompletions,
		OriginModelName: "gpt-image-2-vip",
	}
	if !isChatImageGenerationRequest(imageInfo) {
		t.Fatal("expected chat gpt-image-2-vip request to use image compatibility")
	}

	imageEndpointInfo := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeImagesGenerations,
		OriginModelName: "gpt-image-2-vip",
	}
	if isChatImageGenerationRequest(imageEndpointInfo) {
		t.Fatal("direct image generation endpoint must stay on the image helper path")
	}

	legacyImageInfo := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeChatCompletions,
		OriginModelName: "gpt-image-1",
	}
	if isChatImageGenerationRequest(legacyImageInfo) {
		t.Fatal("chat compatibility is intentionally scoped to gpt-image-2 models")
	}

	textInfo := &relaycommon.RelayInfo{
		RelayMode:       relayconstant.RelayModeChatCompletions,
		OriginModelName: "gpt-4o",
	}
	if isChatImageGenerationRequest(textInfo) {
		t.Fatal("regular chat models must not use image compatibility")
	}
}

func TestChatImageRequestFromOpenAIRequestUsesLastUserPrompt(t *testing.T) {
	n := 2
	req := &dto.GeneralOpenAIRequest{
		Model: "gpt-image-2-vip",
		Messages: []dto.Message{
			{Role: "system", Content: "answer briefly"},
			{Role: "user", Content: "old prompt"},
			{Role: "assistant", Content: "ok"},
			{
				Role: "user",
				Content: []any{
					map[string]any{"type": "text", "text": "Draw a red house"},
				},
			},
		},
		N:    &n,
		Size: "1024x1024",
	}
	info := &relaycommon.RelayInfo{
		ChannelMeta: &relaycommon.ChannelMeta{UpstreamModelName: "gpt-image-2-vip"},
	}

	imageReq, err := chatImageRequestFromOpenAIRequest(info, req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if imageReq.Model != "gpt-image-2-vip" {
		t.Fatalf("unexpected model: %s", imageReq.Model)
	}
	if imageReq.Prompt != "Draw a red house" {
		t.Fatalf("unexpected prompt: %q", imageReq.Prompt)
	}
	if imageReq.N == nil || *imageReq.N != 2 {
		t.Fatalf("unexpected n: %v", imageReq.N)
	}
	if imageReq.Size != "1024x1024" {
		t.Fatalf("unexpected size: %s", imageReq.Size)
	}
	if imageReq.ResponseFormat != "url" {
		t.Fatalf("unexpected response format: %s", imageReq.ResponseFormat)
	}
}

func TestBuildChatImageResponsePayloadExtractsMarkdownURLsAndUsage(t *testing.T) {
	body := []byte(`{
		"created": 1710000000,
		"data": [
			{"url": "https://cdn.example.com/a.png"},
			{"url": "https://cdn.example.com/b.png"}
		],
		"usage": {
			"prompt_tokens": 11,
			"completion_tokens": 3,
			"total_tokens": 14
		}
	}`)

	payload, err := buildChatImageResponsePayload(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	expected := "![image](https://cdn.example.com/a.png)\n\n![image](https://cdn.example.com/b.png)"
	if payload.Content != expected {
		t.Fatalf("unexpected content:\n%s", payload.Content)
	}
	if len(payload.ImageURLs) != 2 || payload.ImageURLs[0] != "https://cdn.example.com/a.png" || payload.ImageURLs[1] != "https://cdn.example.com/b.png" {
		t.Fatalf("unexpected image urls: %v", payload.ImageURLs)
	}
	if payload.Usage.PromptTokens != 11 || payload.Usage.CompletionTokens != 3 || payload.Usage.TotalTokens != 14 {
		t.Fatalf("unexpected usage: %+v", payload.Usage)
	}
}

func TestBuildChatImageResponsePayloadFallsBackToImageCountUsage(t *testing.T) {
	body := []byte(`{
		"created": 1710000000,
		"data": [
			{"url": "https://cdn.example.com/a.png"},
			{"url": "https://cdn.example.com/b.png"}
		]
	}`)

	payload, err := buildChatImageResponsePayload(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if payload.Usage.PromptTokens != 2 || payload.Usage.TotalTokens != 2 {
		t.Fatalf("expected usage to fall back to image count, got %+v", payload.Usage)
	}
}

func TestChatImageGenerationHandlerStreamsChatCompletionChunks(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	common.SetContextKey(c, common.RequestIdKey, "req-chat-image")

	info := &relaycommon.RelayInfo{
		RelayMode:          relayconstant.RelayModeChatCompletions,
		RelayFormat:        types.RelayFormatOpenAI,
		IsStream:           true,
		ShouldIncludeUsage: true,
		OriginModelName:    "gpt-image-2-vip",
		ChannelMeta:        &relaycommon.ChannelMeta{UpstreamModelName: "gpt-image-2-vip"},
		StartTime:          time.Now(),
	}
	originalCache := cacheImageResultURL
	cacheImageResultURL = func(requestId string, index int, originURL string) (string, error) {
		return "https://r2.example.com/cache/req-chat-image/a.png", nil
	}
	t.Cleanup(func() {
		cacheImageResultURL = originalCache
	})
	resp := &http.Response{
		StatusCode: http.StatusOK,
		Body: io.NopCloser(strings.NewReader(`{
			"created": 1710000000,
			"data": [{"url": "https://cdn.example.com/a.png"}],
			"usage": {"prompt_tokens": 1, "completion_tokens": 0, "total_tokens": 1}
		}`)),
	}

	usage, apiErr := ChatImageGenerationHandler(c, info, resp)
	if apiErr != nil {
		t.Fatalf("unexpected api error: %v", apiErr)
	}
	if usage.TotalTokens != 1 {
		t.Fatalf("unexpected usage: %+v", usage)
	}

	body := recorder.Body.String()
	for _, want := range []string{
		`"object":"chat.completion.chunk"`,
		`"role":"assistant"`,
		`![image](https://r2.example.com/cache/req-chat-image/a.png)`,
		`"finish_reason":"stop"`,
		`"usage":{"prompt_tokens":1`,
		`data: [DONE]`,
	} {
		if !strings.Contains(body, want) {
			t.Fatalf("stream body missing %q:\n%s", want, body)
		}
	}
}
