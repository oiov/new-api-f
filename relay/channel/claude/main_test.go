package claude

import (
	"os"
	"testing"

	"github.com/QuantumNous/new-api/service"
)

func TestMain(m *testing.M) {
	// Token counting (service.CountTextToken) requires the tiktoken encoders to be
	// initialized; the stream fallback tests exercise local completion-token counting.
	service.InitTokenEncoders()
	os.Exit(m.Run())
}
