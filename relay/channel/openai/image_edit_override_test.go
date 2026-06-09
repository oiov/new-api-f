package openai

import (
	"bytes"
	"mime"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

// newMultipartEditContext 构造一个 multipart/form-data 的 /v1/images/edits 请求上下文。
func newMultipartEditContext(t *testing.T, fields map[string]string) *gin.Context {
	t.Helper()
	var buf bytes.Buffer
	writer := multipart.NewWriter(&buf)
	for key, value := range fields {
		require.NoError(t, writer.WriteField(key, value))
	}
	part, err := writer.CreateFormFile("image", "image.png")
	require.NoError(t, err)
	_, err = part.Write([]byte("\x89PNG\r\n\x1a\nfake-image-bytes"))
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/v1/images/edits", &buf)
	c.Request.Header.Set("Content-Type", writer.FormDataContentType())
	return c
}

// parseConvertedMultipart 读取 ConvertImageRequest 返回的 multipart body。
func parseConvertedMultipart(t *testing.T, c *gin.Context, converted any) *multipart.Form {
	t.Helper()
	buf, ok := converted.(*bytes.Buffer)
	require.True(t, ok, "expected *bytes.Buffer, got %T", converted)

	_, params, err := mime.ParseMediaType(c.Request.Header.Get("Content-Type"))
	require.NoError(t, err)
	boundary := params["boundary"]
	require.NotEmpty(t, boundary)

	reader := multipart.NewReader(bytes.NewReader(buf.Bytes()), boundary)
	form, err := reader.ReadForm(1 << 20)
	require.NoError(t, err)
	return form
}

func TestConvertImageEditDropsResponseFormatViaParamOverride(t *testing.T) {
	c := newMultipartEditContext(t, map[string]string{
		"model":           "gpt-image-1",
		"prompt":          "make the hat blue",
		"response_format": "b64_json",
	})
	info := &relaycommon.RelayInfo{
		RelayMode: relayconstant.RelayModeImagesEdits,
		ChannelMeta: &relaycommon.ChannelMeta{
			ParamOverride: map[string]interface{}{"response_format": nil},
		},
	}

	converted, err := (&Adaptor{}).ConvertImageRequest(c, info, dto.ImageRequest{
		Model:  "gpt-image-1",
		Prompt: "make the hat blue",
	})
	require.NoError(t, err)

	form := parseConvertedMultipart(t, c, converted)
	require.NotContains(t, form.Value, "response_format", "response_format should be stripped by param override")
	require.Equal(t, []string{"make the hat blue"}, form.Value["prompt"])
	require.Equal(t, []string{"gpt-image-1"}, form.Value["model"])
	require.Contains(t, form.File, "image")
}

func TestConvertImageEditPreservesFieldsWithoutOverride(t *testing.T) {
	c := newMultipartEditContext(t, map[string]string{
		"model":           "gpt-image-1",
		"prompt":          "make the hat blue",
		"response_format": "b64_json",
	})
	// 无 ChannelMeta / 无覆盖：保持原有逐字段透传行为。
	info := &relaycommon.RelayInfo{RelayMode: relayconstant.RelayModeImagesEdits}

	converted, err := (&Adaptor{}).ConvertImageRequest(c, info, dto.ImageRequest{
		Model:  "gpt-image-1",
		Prompt: "make the hat blue",
	})
	require.NoError(t, err)

	form := parseConvertedMultipart(t, c, converted)
	require.Equal(t, []string{"b64_json"}, form.Value["response_format"])
	require.Equal(t, []string{"gpt-image-1"}, form.Value["model"])
}

func TestConvertImageEditOperationsSetInjectsField(t *testing.T) {
	c := newMultipartEditContext(t, map[string]string{
		"model":  "gpt-image-1",
		"prompt": "make the hat blue",
	})
	info := &relaycommon.RelayInfo{
		RelayMode: relayconstant.RelayModeImagesEdits,
		ChannelMeta: &relaycommon.ChannelMeta{
			ParamOverride: map[string]interface{}{
				"operations": []interface{}{
					map[string]interface{}{
						"path":  "size",
						"mode":  "set",
						"value": "1024x1024",
					},
				},
			},
		},
	}

	converted, err := (&Adaptor{}).ConvertImageRequest(c, info, dto.ImageRequest{
		Model:  "gpt-image-1",
		Prompt: "make the hat blue",
	})
	require.NoError(t, err)

	form := parseConvertedMultipart(t, c, converted)
	require.Equal(t, []string{"1024x1024"}, form.Value["size"])
	require.Equal(t, []string{"gpt-image-1"}, form.Value["model"])
}
