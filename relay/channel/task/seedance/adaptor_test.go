package seedance

import (
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
