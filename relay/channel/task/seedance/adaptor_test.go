package seedance

import (
	"bytes"
	"context"
	"errors"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
)

func TestTaskAdaptor_ValidateModel_RejectsUnsupportedModel(t *testing.T) {
	adaptor := &TaskAdaptor{}
	if err := adaptor.validateModelAndRatio("seedance-1", ""); err == nil {
		t.Fatalf("expected unsupported model to be rejected")
	}
}

func TestTaskAdaptor_ValidateModel_RejectsAdaptiveRatioForSeedance2Cheap(t *testing.T) {
	adaptor := &TaskAdaptor{}
	if err := adaptor.validateModelAndRatio("seedance-2-cheap", "adaptive"); err == nil {
		t.Fatalf("expected ratio=adaptive to be rejected for seedance-2-cheap")
	}
}

func TestTaskAdaptor_Seedance2ValidateModel_AcceptsOfficialModels(t *testing.T) {
	adaptor := &TaskAdaptor{}
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeSeedance2}})

	if err := adaptor.validateModelAndRatio("seedance-2-720p", "adaptive"); err != nil {
		t.Fatalf("expected seedance-2-720p to be accepted: %v", err)
	}
}

func TestTaskAdaptor_Seedance2ValidateModel_RejectsCheapModel(t *testing.T) {
	adaptor := &TaskAdaptor{}
	adaptor.Init(&relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeSeedance2}})

	if err := adaptor.validateModelAndRatio("seedance-2-cheap", ""); err == nil {
		t.Fatalf("expected seedance-2-cheap to be rejected for Seedance2 channel")
	}
}

func TestTaskAdaptor_Seedance2EstimateBilling_DefaultsToFiveSeconds(t *testing.T) {
	adaptor := &TaskAdaptor{}
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeSeedance2}}
	adaptor.Init(info)
	c := newSeedanceMultipartContext(t, map[string]string{
		"model":  "seedance-2",
		"prompt": "cinematic clouds",
	}, nil)

	taskErr := adaptor.ValidateRequestAndSetAction(c, info)
	if taskErr != nil {
		t.Fatalf("unexpected validation error: %v", taskErr)
	}

	ratios := adaptor.EstimateBilling(c, info)
	if got := ratios["seconds"]; got != 5 {
		t.Fatalf("unexpected billable seconds: got %.2f want 5", got)
	}
}

func TestTaskAdaptor_Seedance2EstimateBilling_IncludesReferenceMediaDurations(t *testing.T) {
	restore := stubSeedanceMediaDurationProbe(func(_ context.Context, fh *multipart.FileHeader) (float64, error) {
		switch fh.Filename {
		case "reference.mp4":
			return 10.1, nil
		case "reference.mp3":
			return 30, nil
		default:
			return 0, errors.New("unexpected file")
		}
	})
	defer restore()

	adaptor := &TaskAdaptor{}
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeSeedance2}}
	adaptor.Init(info)
	c := newSeedanceMultipartContext(t, map[string]string{
		"model":    "seedance-2-720p",
		"prompt":   "follow the reference motion and audio mood",
		"duration": "5",
		"ratio":    "adaptive",
	}, map[string]string{
		"video": "reference.mp4",
		"audio": "reference.mp3",
	})

	taskErr := adaptor.ValidateRequestAndSetAction(c, info)
	if taskErr != nil {
		t.Fatalf("unexpected validation error: %v", taskErr)
	}

	ratios := adaptor.EstimateBilling(c, info)
	if got := ratios["seconds"]; got != 46 {
		t.Fatalf("unexpected billable seconds: got %.2f want 46", got)
	}
}

func TestTaskAdaptor_Seedance2ValidateRequest_RejectsInvalidDuration(t *testing.T) {
	adaptor := &TaskAdaptor{}
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeSeedance2}}
	adaptor.Init(info)
	c := newSeedanceMultipartContext(t, map[string]string{
		"model":    "seedance-2-720p",
		"prompt":   "cinematic clouds",
		"duration": "3",
	}, nil)

	if taskErr := adaptor.ValidateRequestAndSetAction(c, info); taskErr == nil {
		t.Fatalf("expected duration below range to be rejected")
	}
}

func TestTaskAdaptor_Seedance2ValidateRequest_RejectsUnprobeableMedia(t *testing.T) {
	restore := stubSeedanceMediaDurationProbe(func(context.Context, *multipart.FileHeader) (float64, error) {
		return 0, errors.New("ffprobe failed")
	})
	defer restore()

	adaptor := &TaskAdaptor{}
	info := &relaycommon.RelayInfo{ChannelMeta: &relaycommon.ChannelMeta{ChannelType: constant.ChannelTypeSeedance2}}
	adaptor.Init(info)
	c := newSeedanceMultipartContext(t, map[string]string{
		"model":    "seedance-2-720p",
		"prompt":   "cinematic clouds",
		"duration": "5",
	}, map[string]string{
		"video": "bad.mp4",
	})

	if taskErr := adaptor.ValidateRequestAndSetAction(c, info); taskErr == nil {
		t.Fatalf("expected unprobeable media to be rejected")
	}
}

func TestTaskAdaptor_ParseTaskResult_WrappedPollingPayload(t *testing.T) {
	adaptor := &TaskAdaptor{}
	body := []byte(`{
		"code":"success",
		"data":{
			"task_id":"task_123",
			"status":"SUCCESS",
			"progress":"100%",
			"result_url":"https://cdn.example.com/out.mp4",
			"data":{"video_url":"https://cdn.example.com/out.mp4"}
		}
	}`)

	taskInfo, err := adaptor.ParseTaskResult(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	assertTaskInfo(t, taskInfo, "task_123", model.TaskStatusSuccess, "100%", "https://cdn.example.com/out.mp4")
}

func TestTaskAdaptor_ParseTaskResult_DirectPayloadFallback(t *testing.T) {
	adaptor := &TaskAdaptor{}
	body := []byte(`{
		"task_id":"task_456",
		"status":"FAILED",
		"progress":"10%",
		"content":{"video_url":"https://cdn.example.com/out.mp4"}
	}`)

	taskInfo, err := adaptor.ParseTaskResult(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	assertTaskInfo(t, taskInfo, "task_456", model.TaskStatusFailure, "10%", "")
}

func TestTaskAdaptor_ParseTaskResult_WrappedPollingPayloadWithNumericID(t *testing.T) {
	adaptor := &TaskAdaptor{}
	body := []byte(`{
		"code":"success",
		"data":{
			"id":123456,
			"task_id":"task_789",
			"status":"IN_PROGRESS",
			"progress":"50%"
		}
	}`)

	taskInfo, err := adaptor.ParseTaskResult(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	assertTaskInfo(t, taskInfo, "task_789", model.TaskStatusInProgress, "50%", "")
}

func TestTaskAdaptor_ConvertToOpenAIVideo_WrappedPollingPayloadWithNumericID(t *testing.T) {
	adaptor := &TaskAdaptor{}
	task := &model.Task{
		TaskID:    "task_public_123",
		Status:    model.TaskStatusInProgress,
		Progress:  "50%",
		CreatedAt: 1776960828,
		UpdatedAt: 1776960838,
		Properties: model.Properties{
			OriginModelName: "seedance-2-cheap",
		},
		Data: []byte(`{
			"code":"success",
			"data":{
				"id":123456,
				"task_id":"task_upstream_123",
				"status":"IN_PROGRESS",
				"progress":"50%"
			}
		}`),
	}

	got, err := adaptor.ConvertToOpenAIVideo(task)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(string(got), `"id":"task_public_123"`) {
		t.Fatalf("unexpected converted payload: %s", string(got))
	}
	if !strings.Contains(string(got), `"progress":50`) {
		t.Fatalf("unexpected converted payload: %s", string(got))
	}
}

func TestTaskAdaptor_ConvertToOpenAIVideo_UsesStoredResultURLFallback(t *testing.T) {
	adaptor := &TaskAdaptor{}
	task := &model.Task{
		TaskID:    "task_public_456",
		Status:    model.TaskStatusSuccess,
		Progress:  "100%",
		CreatedAt: 1776960828,
		UpdatedAt: 1776960838,
		Properties: model.Properties{
			OriginModelName: "seedance-2-cheap",
		},
		PrivateData: model.TaskPrivateData{
			ResultURL: "https://cdn.example.com/stored.mp4",
		},
		Data: []byte(`{"task_id":"task_upstream_456","status":"SUCCESS","progress":"100%"}`),
	}

	got, err := adaptor.ConvertToOpenAIVideo(task)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(string(got), `"status":"completed"`) {
		t.Fatalf("unexpected converted payload: %s", string(got))
	}
	if !strings.Contains(string(got), `"url":"https://cdn.example.com/stored.mp4"`) {
		t.Fatalf("unexpected converted payload: %s", string(got))
	}
}

func assertTaskInfo(t *testing.T, got *relaycommon.TaskInfo, wantTaskID, wantStatus, wantProgress, wantURL string) {
	t.Helper()
	if got == nil {
		t.Fatalf("expected non-nil task info")
	}
	if got.TaskID != wantTaskID {
		t.Fatalf("unexpected task id: got %q want %q", got.TaskID, wantTaskID)
	}
	if got.Status != wantStatus {
		t.Fatalf("unexpected status: got %q want %q", got.Status, wantStatus)
	}
	if got.Progress != wantProgress {
		t.Fatalf("unexpected progress: got %q want %q", got.Progress, wantProgress)
	}
	if got.Url != wantURL {
		t.Fatalf("unexpected url: got %q want %q", got.Url, wantURL)
	}
}

func stubSeedanceMediaDurationProbe(fn func(context.Context, *multipart.FileHeader) (float64, error)) func() {
	original := seedanceMediaDurationProbe
	seedanceMediaDurationProbe = fn
	return func() {
		seedanceMediaDurationProbe = original
	}
}

func newSeedanceMultipartContext(t *testing.T, fields map[string]string, files map[string]string) *gin.Context {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	for key, value := range fields {
		if err := writer.WriteField(key, value); err != nil {
			t.Fatalf("write field %s: %v", key, err)
		}
	}
	for field, filename := range files {
		part, err := writer.CreateFormFile(field, filename)
		if err != nil {
			t.Fatalf("create file %s: %v", field, err)
		}
		if _, err := part.Write([]byte("fake media")); err != nil {
			t.Fatalf("write file %s: %v", field, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest("POST", "/v1/video/generations", bytes.NewReader(body.Bytes()))
	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	return c
}
