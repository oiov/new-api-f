package seedance

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
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
