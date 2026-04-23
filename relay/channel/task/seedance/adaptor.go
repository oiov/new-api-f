package seedance

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	channelseedance "github.com/QuantumNous/new-api/relay/channel/seedance"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
)

type TaskAdaptor struct {
	taskcommon.BaseBilling
	apiKey  string
	baseURL string
}

const seedanceModel2Cheap = "seedance-2-cheap"

var allowedFormFields = []string{
	"model",
	"prompt",
	"duration",
	"ratio",
}

var allowedFormFiles = []string{
	"image_1",
	"image_2",
	"image_3",
	"video",
	"audio",
}

type seedanceTaskPayload struct {
	ID        string `json:"id,omitempty"`
	TaskID    string `json:"task_id,omitempty"`
	Status    string `json:"status,omitempty"`
	Progress  string `json:"progress,omitempty"`
	ResultURL string `json:"result_url,omitempty"`
	Message   string `json:"message,omitempty"`
	Error     *struct {
		Message string `json:"message,omitempty"`
		Code    string `json:"code,omitempty"`
	} `json:"error,omitempty"`
	Data struct {
		VideoURL string `json:"video_url,omitempty"`
	} `json:"data,omitempty"`
	Content struct {
		VideoURL string `json:"video_url,omitempty"`
	} `json:"content,omitempty"`
}

type seedanceTaskEnvelope struct {
	Code string          `json:"code,omitempty"`
	Data json.RawMessage `json:"data,omitempty"`
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.baseURL = info.ChannelBaseUrl
	a.apiKey = info.ApiKey
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError {
	contentType := c.GetHeader("Content-Type")
	if !strings.HasPrefix(contentType, "multipart/form-data") {
		return service.TaskErrorWrapperLocal(fmt.Errorf("multipart/form-data is required"), "invalid_request", http.StatusBadRequest)
	}

	form, err := common.ParseMultipartFormReusable(c)
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_multipart_form", http.StatusBadRequest)
	}

	modelName := strings.TrimSpace(getFormValue(form, "model"))
	if modelName == "" {
		return service.TaskErrorWrapperLocal(fmt.Errorf("model field is required"), "missing_model", http.StatusBadRequest)
	}

	if err := a.validateModelAndRatio(modelName, getFormValue(form, "ratio")); err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}

	prompt := strings.TrimSpace(getFormValue(form, "prompt"))
	if prompt == "" {
		return service.TaskErrorWrapperLocal(fmt.Errorf("prompt is required"), "invalid_request", http.StatusBadRequest)
	}

	info.Action = constant.TaskActionGenerate
	info.OriginModelName = modelName
	c.Set("task_request", relaycommon.TaskSubmitReq{
		Model:    modelName,
		Prompt:   prompt,
		Duration: parseInt(getFormValue(form, "duration")),
		Metadata: map[string]any{
			"ratio": strings.TrimSpace(getFormValue(form, "ratio")),
		},
	})
	return nil
}

func (a *TaskAdaptor) BuildRequestURL(info *relaycommon.RelayInfo) (string, error) {
	return joinURL(taskcommon.DefaultString(a.baseURL, info.ChannelBaseUrl), "/v1/video/generations"), nil
}

func (a *TaskAdaptor) BuildRequestHeader(c *gin.Context, req *http.Request, info *relaycommon.RelayInfo) error {
	req.Header.Set("Authorization", "Bearer "+taskcommon.DefaultString(a.apiKey, info.ApiKey))
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", c.Request.Header.Get("Content-Type"))
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	form, err := common.ParseMultipartFormReusable(c)
	if err != nil {
		return nil, errors.Wrap(err, "parse_multipart_form_failed")
	}

	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)

	upstreamModel := taskcommon.DefaultString(info.UpstreamModelName, info.OriginModelName)
	if upstreamModel == "" {
		upstreamModel = seedanceModel2Cheap
	}
	if err := writer.WriteField("model", upstreamModel); err != nil {
		_ = writer.Close()
		return nil, err
	}

	for _, field := range allowedFormFields {
		if field == "model" {
			continue
		}
		values := form.Value[field]
		for _, value := range values {
			if err := writer.WriteField(field, value); err != nil {
				_ = writer.Close()
				return nil, err
			}
		}
	}

	for _, field := range allowedFormFiles {
		for _, fh := range form.File[field] {
			if err := copyMultipartFile(writer, field, fh); err != nil {
				_ = writer.Close()
				return nil, err
			}
		}
	}

	if err := writer.Close(); err != nil {
		return nil, err
	}

	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	return bytes.NewReader(buf.Bytes()), nil
}

func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	return channel.DoTaskApiRequest(a, c, info, requestBody)
}

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, err *dto.TaskError) {
	responseBody, readErr := io.ReadAll(resp.Body)
	if readErr != nil {
		return "", nil, service.TaskErrorWrapper(readErr, "read_response_body_failed", http.StatusInternalServerError)
	}
	_ = resp.Body.Close()

	payload, parseErr := parseSeedanceTaskPayload(responseBody)
	if parseErr != nil {
		return "", nil, service.TaskErrorWrapper(errors.Wrapf(parseErr, "body: %s", responseBody), "unmarshal_response_body_failed", http.StatusInternalServerError)
	}

	upstreamTaskID := payload.TaskID
	if upstreamTaskID == "" {
		upstreamTaskID = payload.ID
	}
	if upstreamTaskID == "" {
		return "", nil, service.TaskErrorWrapper(fmt.Errorf("task_id is empty"), "invalid_response", http.StatusInternalServerError)
	}

	video := dto.NewOpenAIVideo()
	video.ID = info.PublicTaskID
	video.TaskID = info.PublicTaskID
	video.CreatedAt = time.Now().Unix()
	video.Model = info.OriginModelName
	c.JSON(http.StatusOK, video)

	return upstreamTaskID, responseBody, nil
}

func (a *TaskAdaptor) GetModelList() []string {
	return channelseedance.ModelList
}

func (a *TaskAdaptor) GetChannelName() string {
	return channelseedance.ChannelName
}

func (a *TaskAdaptor) FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok || strings.TrimSpace(taskID) == "" {
		return nil, fmt.Errorf("invalid task_id")
	}

	req, err := http.NewRequest(http.MethodGet, joinURL(baseUrl, "/v1/video/generations/"+taskID), nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Accept", "application/json")

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	payload, err := parseSeedanceTaskPayload(respBody)
	if err != nil {
		return nil, errors.Wrap(err, "unmarshal task result failed")
	}

	taskInfo := &relaycommon.TaskInfo{
		Code:     0,
		TaskID:   firstNonEmpty(payload.TaskID, payload.ID),
		Status:   normalizeStatus(payload.Status),
		Progress: payload.Progress,
	}

	switch taskInfo.Status {
	case model.TaskStatusQueued:
		if taskInfo.Progress == "" {
			taskInfo.Progress = taskcommon.ProgressQueued
		}
	case model.TaskStatusInProgress:
		if taskInfo.Progress == "" {
			taskInfo.Progress = taskcommon.ProgressInProgress
		}
	case model.TaskStatusSuccess:
		if taskInfo.Progress == "" {
			taskInfo.Progress = taskcommon.ProgressComplete
		}
		taskInfo.Url = extractResultURL(payload)
	case model.TaskStatusFailure:
		if taskInfo.Progress == "" {
			taskInfo.Progress = taskcommon.ProgressComplete
		}
		taskInfo.Reason = extractFailureReason(payload)
	}

	return taskInfo, nil
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(originTask *model.Task) ([]byte, error) {
	payload, err := parseSeedanceTaskPayload(originTask.Data)
	if err != nil {
		return nil, errors.Wrap(err, "unmarshal seedance task data failed")
	}

	video := dto.NewOpenAIVideo()
	video.ID = originTask.TaskID
	video.TaskID = originTask.TaskID
	video.Status = originTask.Status.ToVideoStatus()
	video.SetProgressStr(originTask.Progress)
	video.Model = originTask.Properties.OriginModelName
	video.CreatedAt = originTask.CreatedAt
	video.CompletedAt = originTask.UpdatedAt

	if url := extractResultURL(payload); url != "" {
		video.SetMetadata("url", url)
	}

	if originTask.Status == model.TaskStatusFailure {
		reason := firstNonEmpty(originTask.FailReason, extractFailureReason(payload), "task failed")
		video.Error = &dto.OpenAIVideoError{
			Message: reason,
			Code:    "failed",
		}
	}

	return common.Marshal(video)
}

func (a *TaskAdaptor) validateModelAndRatio(modelName, ratio string) error {
	if strings.TrimSpace(modelName) != seedanceModel2Cheap {
		return fmt.Errorf("unsupported model: %s", modelName)
	}
	if strings.EqualFold(strings.TrimSpace(ratio), "adaptive") {
		return fmt.Errorf("ratio=adaptive is not supported for %s", seedanceModel2Cheap)
	}
	return nil
}

func parseSeedanceTaskPayload(body []byte) (*seedanceTaskPayload, error) {
	var direct seedanceTaskPayload
	if err := common.Unmarshal(body, &direct); err != nil {
		return nil, err
	}
	if direct.TaskID != "" || direct.ID != "" || direct.Status != "" {
		return &direct, nil
	}

	var envelope seedanceTaskEnvelope
	if err := common.Unmarshal(body, &envelope); err != nil {
		return nil, err
	}
	if len(envelope.Data) == 0 {
		return &direct, nil
	}

	var wrapped seedanceTaskPayload
	if err := common.Unmarshal(envelope.Data, &wrapped); err != nil {
		return nil, err
	}
	return &wrapped, nil
}

func normalizeStatus(status string) string {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "QUEUED":
		return model.TaskStatusQueued
	case "PROCESSING", "RUNNING", "IN_PROGRESS":
		return model.TaskStatusInProgress
	case "SUCCEEDED", "SUCCESS":
		return model.TaskStatusSuccess
	case "FAILED", "FAILURE":
		return model.TaskStatusFailure
	default:
		return model.TaskStatusInProgress
	}
}

func extractResultURL(payload *seedanceTaskPayload) string {
	if payload == nil {
		return ""
	}
	return firstNonEmpty(payload.ResultURL, payload.Data.VideoURL, payload.Content.VideoURL)
}

func extractFailureReason(payload *seedanceTaskPayload) string {
	if payload == nil {
		return ""
	}
	if payload.Error != nil {
		return firstNonEmpty(payload.Error.Message, payload.Error.Code)
	}
	return payload.Message
}

func getFormValue(form *multipart.Form, field string) string {
	if form == nil || len(form.Value[field]) == 0 {
		return ""
	}
	return form.Value[field][0]
}

func copyMultipartFile(writer *multipart.Writer, field string, fh *multipart.FileHeader) error {
	src, err := fh.Open()
	if err != nil {
		return err
	}
	defer src.Close()

	dst, err := writer.CreateFormFile(field, fh.Filename)
	if err != nil {
		return err
	}
	_, err = io.Copy(dst, src)
	return err
}

func joinURL(baseURL, path string) string {
	return strings.TrimRight(baseURL, "/") + path
}

func parseInt(value string) int {
	return common.String2Int(strings.TrimSpace(value))
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}
