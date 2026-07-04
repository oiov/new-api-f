package openai

import (
	"os"
	"testing"

	"github.com/QuantumNous/new-api/service"
)

func TestMain(m *testing.M) {
	// Token counting (service.CountTextToken) requires the tiktoken encoders to be
	// initialized; several handler tests exercise the local completion-token fallback.
	service.InitTokenEncoders()
	os.Exit(m.Run())
}
