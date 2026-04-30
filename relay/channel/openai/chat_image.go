package openai

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

type chatImageResponsePayload struct {
	Content   string
	ImageURLs []string
	Created   int64
	Usage     dto.Usage
}

func isChatImageGenerationRequest(info *relaycommon.RelayInfo) bool {
	if info == nil || info.RelayMode != relayconstant.RelayModeChatCompletions {
		return false
	}
	if common.IsGPTImage2Model(info.OriginModelName) {
		return true
	}
	return info.ChannelMeta != nil && common.IsGPTImage2Model(info.UpstreamModelName)
}

func chatImageRequestFromOpenAIRequest(info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (*dto.ImageRequest, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}
	prompt := extractChatImagePrompt(request.Messages)
	if prompt == "" {
		return nil, errors.New("image generation prompt is required")
	}

	imageReq := &dto.ImageRequest{
		Model:          request.Model,
		Prompt:         prompt,
		Size:           request.Size,
		ResponseFormat: "url",
	}
	if info != nil && info.ChannelMeta != nil && info.UpstreamModelName != "" {
		imageReq.Model = info.UpstreamModelName
	}
	if request.N != nil && *request.N > 0 {
		n := uint(*request.N)
		imageReq.N = &n
	}
	return imageReq, nil
}

func extractChatImagePrompt(messages []dto.Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != "user" {
			continue
		}
		if prompt := strings.TrimSpace(messages[i].StringContent()); prompt != "" {
			return prompt
		}
	}
	for i := len(messages) - 1; i >= 0; i-- {
		if prompt := strings.TrimSpace(messages[i].StringContent()); prompt != "" {
			return prompt
		}
	}
	return ""
}

func buildChatImageResponsePayload(responseBody []byte) (*chatImageResponsePayload, error) {
	var imageResp dto.ImageResponse
	if err := common.Unmarshal(responseBody, &imageResp); err != nil {
		return nil, err
	}

	contentParts := make([]string, 0, len(imageResp.Data))
	imageURLs := make([]string, 0, len(imageResp.Data))
	for _, item := range imageResp.Data {
		if url := strings.TrimSpace(item.Url); url != "" {
			imageURLs = append(imageURLs, url)
			contentParts = append(contentParts, fmt.Sprintf("![image](%s)", url))
			continue
		}
		if b64 := strings.TrimSpace(item.B64Json); b64 != "" {
			contentParts = append(contentParts, fmt.Sprintf("![image](data:image/png;base64,%s)", b64))
		}
	}
	if len(contentParts) == 0 {
		return nil, errors.New("image response contains no image data")
	}

	var usageResp dto.SimpleResponse
	_ = common.Unmarshal(responseBody, &usageResp)
	usage := usageResp.Usage
	if usage.TotalTokens == 0 {
		imageCount := len(imageResp.Data)
		if imageCount == 0 {
			imageCount = 1
		}
		usage.PromptTokens = imageCount
		usage.TotalTokens = imageCount
	}

	return &chatImageResponsePayload{
		Content:   strings.Join(contentParts, "\n\n"),
		ImageURLs: imageURLs,
		Created:   imageResp.Created,
		Usage:     usage,
	}, nil
}

func ChatImageGenerationHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}

	responseBody, imageURLs := prepareImageResponseBody(c, info, responseBody)

	payload, err := buildChatImageResponsePayload(responseBody)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}

	if len(imageURLs) == 0 {
		imageURLs = payload.ImageURLs
	}
	if len(imageURLs) > 0 {
		common.SetContextKey(c, constant.ContextKeyImageResultURLs, imageURLs)
	}

	if info != nil {
		info.SetFirstResponseTime()
	}

	if info != nil && info.IsStream {
		writeChatImageStream(c, info, payload)
		return &payload.Usage, nil
	}

	writeChatImageResponse(c, info, payload)
	return &payload.Usage, nil
}

func chatImageResponseCreated(payload *chatImageResponsePayload) int64 {
	if payload != nil && payload.Created > 0 {
		return payload.Created
	}
	return time.Now().Unix()
}

func chatImageResponseModel(info *relaycommon.RelayInfo) string {
	if info == nil {
		return ""
	}
	model := info.OriginModelName
	if info.ChannelMeta != nil && info.UpstreamModelName != "" {
		model = info.UpstreamModelName
	}
	return relaycommon.DisplayedResponseModelName(info, model)
}

func writeChatImageStream(c *gin.Context, info *relaycommon.RelayInfo, payload *chatImageResponsePayload) {
	id := helper.GetResponseID(c)
	created := chatImageResponseCreated(payload)
	model := chatImageResponseModel(info)

	helper.SetEventStreamHeaders(c)
	_ = helper.ObjectData(c, helper.GenerateStartEmptyResponse(id, created, model, nil))

	contentResp := &dto.ChatCompletionsStreamResponse{
		Id:      id,
		Object:  "chat.completion.chunk",
		Created: created,
		Model:   model,
		Choices: []dto.ChatCompletionsStreamResponseChoice{
			{
				Delta: dto.ChatCompletionsStreamResponseChoiceDelta{
					Content: common.GetPointer(payload.Content),
				},
				Index: 0,
			},
		},
	}
	_ = helper.ObjectData(c, contentResp)
	_ = helper.ObjectData(c, helper.GenerateStopResponse(id, created, model, constant.FinishReasonStop))
	if info != nil && info.ShouldIncludeUsage {
		_ = helper.ObjectData(c, helper.GenerateFinalUsageResponse(id, created, model, payload.Usage))
	}
	helper.Done(c)
}

func writeChatImageResponse(c *gin.Context, info *relaycommon.RelayInfo, payload *chatImageResponsePayload) {
	response := dto.OpenAITextResponse{
		Id:      helper.GetResponseID(c),
		Object:  "chat.completion",
		Created: chatImageResponseCreated(payload),
		Model:   chatImageResponseModel(info),
		Choices: []dto.OpenAITextResponseChoice{
			{
				Index: 0,
				Message: dto.Message{
					Role:    "assistant",
					Content: payload.Content,
				},
				FinishReason: constant.FinishReasonStop,
			},
		},
		Usage: payload.Usage,
	}
	c.JSON(http.StatusOK, response)
}
