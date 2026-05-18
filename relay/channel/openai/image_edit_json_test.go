package openai

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestConvertImageRequestLeavesJSONEditRequestAsJSON(t *testing.T) {
	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(recorder)
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", nil)
	c.Request.Header.Set("Content-Type", "application/json")

	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesEdits}
	req := dto.ImageRequest{
		Model:  "gpt-image-1",
		Prompt: "make the hat blue",
	}

	converted, err := (&Adaptor{}).ConvertImageRequest(c, info, req)
	require.NoError(t, err)
	require.Equal(t, req, converted)
}
