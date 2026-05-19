package seedance

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"mime/multipart"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	channelseedance "github.com/QuantumNous/new-api/relay/channel/seedance"
	channelseedance2 "github.com/QuantumNous/new-api/relay/channel/seedance2"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
)

type seedanceStringValue string

func (v *seedanceStringValue) UnmarshalJSON(data []byte) error {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null")) {
		*v = ""
		return nil
	}

	if trimmed[0] == '"' {
		var value string
		if err := common.Unmarshal(trimmed, &value); err != nil {
			return err
		}
		*v = seedanceStringValue(value)
		return nil
	}

	*v = seedanceStringValue(string(trimmed))
	return nil
}

type TaskAdaptor struct {
	taskcommon.BaseBilling
	apiKey      string
	baseURL     string
	channelType int
	channelName string
	modelList   []string
}

const seedanceModel2Cheap = "seedance-2-cheap"

const (
	seedanceDurationDefault = 5
	seedanceDurationMin     = 4
	seedanceDurationMax     = 15
)

const seedanceBillableSecondsContextKey = "seedance_billable_seconds"

var seedanceMediaDurationProbe = probeSeedanceMediaDuration

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
	ID        seedanceStringValue `json:"id,omitempty"`
	TaskID    seedanceStringValue `json:"task_id,omitempty"`
	Status    string              `json:"status,omitempty"`
	Progress  seedanceStringValue `json:"progress,omitempty"`
	ResultURL string              `json:"result_url,omitempty"`
	Message   string              `json:"message,omitempty"`
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
	a.channelType = info.ChannelType
	a.channelName = channelseedance.ChannelName
	a.modelList = channelseedance.ModelList
	if info.ChannelType == constant.ChannelTypeSeedance2 {
		a.channelName = channelseedance2.ChannelName
		a.modelList = channelseedance2.ModelList
	}
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError {
	if info == nil {
		return service.TaskErrorWrapperLocal(fmt.Errorf("relay info is required"), "invalid_request", http.StatusBadRequest)
	}
	if info.TaskRelayInfo == nil {
		info.TaskRelayInfo = &relaycommon.TaskRelayInfo{}
	}

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

	ratio := strings.TrimSpace(getFormValue(form, "ratio"))
	if err := a.validateModelAndRatio(modelName, ratio); err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}

	prompt := strings.TrimSpace(getFormValue(form, "prompt"))
	if prompt == "" {
		return service.TaskErrorWrapperLocal(fmt.Errorf("prompt is required"), "invalid_request", http.StatusBadRequest)
	}

	duration := parseInt(getFormValue(form, "duration"))
	metadata := map[string]any{
		"ratio": ratio,
	}
	if a.isSeedance2() {
		parsedDuration, err := parseSeedance2Duration(getFormValue(form, "duration"))
		if err != nil {
			return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
		}
		billableSeconds, err := calculateSeedance2BillableSeconds(c, form, parsedDuration)
		if err != nil {
			return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
		}
		duration = parsedDuration
		c.Set(seedanceBillableSecondsContextKey, billableSeconds)
		metadata["billable_seconds"] = billableSeconds
		metadata["output_seconds"] = parsedDuration
	}

	info.Action = constant.TaskActionGenerate
	info.OriginModelName = modelName
	c.Set("task_request", relaycommon.TaskSubmitReq{
		Model:    modelName,
		Prompt:   prompt,
		Duration: duration,
		Metadata: metadata,
	})
	return nil
}

func (a *TaskAdaptor) EstimateBilling(c *gin.Context, _ *relaycommon.RelayInfo) map[string]float64 {
	if !a.isSeedance2() {
		return nil
	}
	value, exists := c.Get(seedanceBillableSecondsContextKey)
	if !exists {
		return nil
	}
	seconds, ok := value.(float64)
	if !ok || seconds <= 0 {
		return nil
	}
	return map[string]float64{
		"seconds": seconds,
	}
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
		if field == "duration" && len(values) == 0 {
			if taskReq, ok := c.Get("task_request"); ok {
				if req, ok := taskReq.(relaycommon.TaskSubmitReq); ok && req.Duration > 0 {
					values = []string{strconv.Itoa(req.Duration)}
				}
			}
		}
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

	return string(upstreamTaskID), responseBody, nil
}

func (a *TaskAdaptor) GetModelList() []string {
	if len(a.modelList) > 0 {
		return a.modelList
	}
	return channelseedance.ModelList
}

func (a *TaskAdaptor) GetChannelName() string {
	if a.channelName != "" {
		return a.channelName
	}
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
		TaskID:   firstNonEmpty(string(payload.TaskID), string(payload.ID)),
		Status:   normalizeStatus(payload.Status),
		Progress: string(payload.Progress),
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

	if url := firstNonEmpty(extractResultURL(payload), originTask.GetResultURL()); url != "" {
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
	modelName = strings.TrimSpace(modelName)
	if a.isSeedance2() {
		if !isAllowedSeedance2Model(modelName) {
			return fmt.Errorf("unsupported model: %s", modelName)
		}
		return nil
	}
	if modelName != seedanceModel2Cheap {
		return fmt.Errorf("unsupported model: %s", modelName)
	}
	if strings.EqualFold(strings.TrimSpace(ratio), "adaptive") {
		return fmt.Errorf("ratio=adaptive is not supported for %s", seedanceModel2Cheap)
	}
	return nil
}

func (a *TaskAdaptor) isSeedance2() bool {
	return a.channelType == constant.ChannelTypeSeedance2
}

func isAllowedSeedance2Model(modelName string) bool {
	for _, candidate := range channelseedance2.ModelList {
		if modelName == candidate {
			return true
		}
	}
	return false
}

func parseSeedance2Duration(value string) (int, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return seedanceDurationDefault, nil
	}
	duration, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("duration must be an integer")
	}
	if duration < seedanceDurationMin || duration > seedanceDurationMax {
		return 0, fmt.Errorf("duration must be between %d and %d seconds", seedanceDurationMin, seedanceDurationMax)
	}
	return duration, nil
}

func calculateSeedance2BillableSeconds(c *gin.Context, form *multipart.Form, outputDuration int) (float64, error) {
	total := float64(outputDuration)
	for _, field := range []string{"video", "audio"} {
		for _, fh := range form.File[field] {
			seconds, err := seedanceMediaDurationProbe(c.Request.Context(), fh)
			if err != nil {
				return 0, fmt.Errorf("failed to read %s duration for %s: %w", field, fh.Filename, err)
			}
			if seconds <= 0 {
				return 0, fmt.Errorf("invalid %s duration for %s", field, fh.Filename)
			}
			total += seconds
		}
	}
	return math.Ceil(total), nil
}

func probeSeedanceMediaDuration(ctx context.Context, fh *multipart.FileHeader) (float64, error) {
	src, err := fh.Open()
	if err != nil {
		return 0, err
	}
	defer src.Close()

	tmp, err := os.CreateTemp("", "seedance-media-*"+filepath.Ext(fh.Filename))
	if err != nil {
		return 0, err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := io.Copy(tmp, src); err != nil {
		_ = tmp.Close()
		return 0, err
	}
	if err := tmp.Close(); err != nil {
		return 0, err
	}

	probeCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	output, err := exec.CommandContext(
		probeCtx,
		"ffprobe",
		"-v", "error",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		tmpName,
	).CombinedOutput()
	if err != nil {
		return 0, fmt.Errorf("ffprobe failed: %w: %s", err, strings.TrimSpace(string(output)))
	}
	duration, err := strconv.ParseFloat(strings.TrimSpace(string(output)), 64)
	if err != nil {
		return 0, fmt.Errorf("parse ffprobe duration failed: %w", err)
	}
	if duration <= 0 {
		return 0, fmt.Errorf("ffprobe returned non-positive duration")
	}
	return duration, nil
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
